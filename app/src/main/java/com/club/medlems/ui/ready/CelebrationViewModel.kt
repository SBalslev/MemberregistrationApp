package com.club.medlems.ui.ready

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.domain.LeaderboardCalculator
import com.club.medlems.domain.LeaderboardEntry
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import javax.inject.Inject

sealed class CelebrationSlide {
    /** Monthly high score for one discipline */
    data class HighScore(val type: PracticeType, val entry: LeaderboardEntry) : CelebrationSlide()

    /** Members with a birthday today or within the next 6 days */
    data class Birthdays(val names: List<String>) : CelebrationSlide()

    /** Member who improved the most (points) vs last month in a discipline */
    data class BiggestImprover(
        val type: PracticeType,
        val displayMemberId: String,
        val memberName: String?,
        val improvement: Int,
        val thisMonthScore: Int
    ) : CelebrationSlide()

    /** Member who set a new all-time personal best this month in a discipline */
    data class PersonalBest(
        val type: PracticeType,
        val displayMemberId: String,
        val memberName: String?,
        val score: Int
    ) : CelebrationSlide()

    /** Member with the most distinct training days this month across all disciplines */
    data class MostDedicated(
        val displayMemberId: String,
        val memberName: String?,
        val trainingDays: Int
    ) : CelebrationSlide()
}

@HiltViewModel
class CelebrationViewModel @Inject constructor(
    private val sessionDao: PracticeSessionDao,
    private val memberDao: MemberDao
) : ViewModel() {

    private val _slides = MutableStateFlow<List<CelebrationSlide>>(emptyList())
    val slides: StateFlow<List<CelebrationSlide>> = _slides

    fun refresh() {
        viewModelScope.launch {
            val slides = mutableListOf<CelebrationSlide>()

            val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
            val thisMonthStart = LocalDate(today.year, today.monthNumber, 1)
            val lastMonthEnd = thisMonthStart.minus(1, DateTimeUnit.DAY)
            val lastMonthStart = LocalDate(lastMonthEnd.year, lastMonthEnd.monthNumber, 1)
            val allTimeStart = LocalDate(2000, 1, 1)

            // Collect all internalMemberIds that appear in any slide so we can batch name lookup
            val idsToLookup = mutableSetOf<String>()

            data class RawHighScore(val type: PracticeType, val internalId: String, val session: com.club.medlems.data.entity.PracticeSession)
            data class RawImprover(val type: PracticeType, val internalId: String, val improvement: Int, val thisMonthScore: Int, val displayId: String)
            data class RawPB(val type: PracticeType, val internalId: String, val score: Int, val displayId: String)

            val rawHighScores = mutableListOf<RawHighScore>()
            val rawImprovers = mutableListOf<RawImprover>()
            val rawPBs = mutableListOf<RawPB>()

            PracticeType.values().forEach { type ->
                val thisMonth = sessionDao.rangeForType(thisMonthStart, today, type)
                val lastMonth = sessionDao.rangeForType(lastMonthStart, lastMonthEnd, type)
                val allTimePrev = sessionDao.rangeForType(allTimeStart, lastMonthEnd, type)

                // High score: best single session by any member this month
                val bestPerMemberThisMonth = LeaderboardCalculator.bestPerMember(thisMonth)
                val topSession = bestPerMemberThisMonth.maxByOrNull { it.points } ?: return@forEach
                rawHighScores += RawHighScore(type, topSession.internalMemberId, topSession)
                idsToLookup += topSession.internalMemberId

                // Biggest improver: member with largest positive points delta vs last month
                val bestLastMonthById = LeaderboardCalculator.bestPerMember(lastMonth)
                    .associate { it.internalMemberId to it.points }
                val topImprover = bestPerMemberThisMonth
                    .mapNotNull { s ->
                        val prev = bestLastMonthById[s.internalMemberId] ?: return@mapNotNull null
                        val delta = s.points - prev
                        if (delta > 0) Pair(s, delta) else null
                    }
                    .maxByOrNull { (_, delta) -> delta }
                if (topImprover != null) {
                    val (s, delta) = topImprover
                    rawImprovers += RawImprover(type, s.internalMemberId, delta, s.points, s.membershipId ?: s.internalMemberId)
                    idsToLookup += s.internalMemberId
                }

                // Personal best: member whose best this month strictly beats their all-time previous best
                val bestPrevById = LeaderboardCalculator.bestPerMember(allTimePrev)
                    .associate { it.internalMemberId to it.points }
                val topPB = bestPerMemberThisMonth
                    .filter { s -> s.points > (bestPrevById[s.internalMemberId] ?: 0) }
                    .maxByOrNull { it.points }
                if (topPB != null) {
                    rawPBs += RawPB(type, topPB.internalMemberId, topPB.points, topPB.membershipId ?: topPB.internalMemberId)
                    idsToLookup += topPB.internalMemberId
                }
            }

            // Most dedicated: member with most distinct training days this month
            val allSessionsThisMonth = sessionDao.allWithPointsInRange(thisMonthStart, today)
            val trainingDaysByMember = allSessionsThisMonth
                .groupBy { it.internalMemberId }
                .mapValues { (_, sessions) -> sessions.map { it.localDate }.distinct().size }
            val topDedicated = trainingDaysByMember.maxByOrNull { (_, days) -> days }
            val rawDedicatedDisplayId: String?
            if (topDedicated != null && topDedicated.value >= 2) {
                idsToLookup += topDedicated.key
                rawDedicatedDisplayId = allSessionsThisMonth
                    .firstOrNull { it.internalMemberId == topDedicated.key }
                    ?.membershipId ?: topDedicated.key
            } else {
                rawDedicatedDisplayId = null
            }

            // Birthdays this week (today + 6 days)
            val allMembers = memberDao.allMembers()
            val birthdayNames = allMembers.filter { m ->
                val bd = m.birthDate ?: return@filter false
                (0 until 7).any { offset ->
                    val check = today.plus(offset, DateTimeUnit.DAY)
                    bd.monthNumber == check.monthNumber && bd.dayOfMonth == check.dayOfMonth
                }
            }.map { m ->
                shortName(m.firstName, m.lastName) ?: m.membershipId ?: m.internalId
            }

            // Batch name lookup for all session participants
            val nameById = if (idsToLookup.isNotEmpty()) {
                memberDao.getMemberNames(idsToLookup.toList())
                    .associate { m -> m.internalId to shortName(m.firstName, m.lastName) }
            } else emptyMap()

            // Assemble slides in a celebratory order
            rawHighScores.forEach { r ->
                slides += CelebrationSlide.HighScore(
                    type = r.type,
                    entry = LeaderboardEntry(
                        internalMemberId = r.internalId,
                        displayMemberId = r.session.membershipId ?: r.internalId,
                        practiceType = r.type,
                        classification = r.session.classification ?: "",
                        points = r.session.points,
                        krydser = r.session.krydser,
                        createdAtUtc = r.session.createdAtUtc.toString(),
                        memberName = nameById[r.internalId]
                    )
                )
            }

            if (birthdayNames.isNotEmpty()) {
                slides += CelebrationSlide.Birthdays(birthdayNames.take(5))
            }

            rawImprovers.forEach { r ->
                slides += CelebrationSlide.BiggestImprover(
                    type = r.type,
                    displayMemberId = r.displayId,
                    memberName = nameById[r.internalId],
                    improvement = r.improvement,
                    thisMonthScore = r.thisMonthScore
                )
            }

            rawPBs.forEach { r ->
                slides += CelebrationSlide.PersonalBest(
                    type = r.type,
                    displayMemberId = r.displayId,
                    memberName = nameById[r.internalId],
                    score = r.score
                )
            }

            if (topDedicated != null && topDedicated.value >= 2 && rawDedicatedDisplayId != null) {
                slides += CelebrationSlide.MostDedicated(
                    displayMemberId = rawDedicatedDisplayId,
                    memberName = nameById[topDedicated.key],
                    trainingDays = topDedicated.value
                )
            }

            _slides.value = slides
        }
    }

    private fun shortName(firstName: String, lastName: String): String? {
        val li = lastName.trim().firstOrNull()?.let { "$it." } ?: ""
        val name = (firstName.trim() + if (li.isNotEmpty()) " $li" else "").trim()
        return name.ifBlank { null }
    }
}
