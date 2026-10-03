package com.club.medlems.network.display

import com.club.medlems.data.entity.Activity
import com.club.medlems.data.entity.ActivityGuest
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.GuestResult
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberStatus
import com.club.medlems.data.entity.PracticeSession
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.minus
import kotlinx.serialization.Serializable

@Serializable
data class DisplayFeed(
    val schemaVersion: Int = 1,
    val generatedAt: String,
    val clubDate: String,
    val stats: DisplayDailyStats,
    val topScoresByDiscipline: List<DisplayDisciplineScores>,
    val recentScores: List<DisplayScore>,
    val personalBests: List<DisplayPersonalBest>,
    val birthdays: List<DisplayBirthday>,
    val activity: DisplayActivity? = null
)

@Serializable
data class DisplayActivity(
    val title: String,
    val type: String
)

@Serializable
data class DisplayDailyStats(
    val participantCount: Int,
    val sessionCount: Int,
    val totalPoints: Int
)

@Serializable
data class DisplayDisciplineScores(
    val discipline: String,
    val entries: List<DisplayScore>
)

@Serializable
data class DisplayScore(
    val displayName: String,
    val discipline: String,
    val points: Int,
    val krydser: Int? = null,
    val recordedAt: String,
    val classification: String? = null,
    val affiliation: String? = null
)

@Serializable
data class DisplayPersonalBest(
    val displayName: String,
    val discipline: String,
    val points: Int,
    val previousBest: Int?
)

@Serializable
data class DisplayBirthday(
    val displayName: String
)

object DisplayFeedBuilder {
    private const val TOP_SCORES_PER_DISCIPLINE = 5
    private const val PERSONAL_BEST_LIMIT = 5
    private const val BIRTHDAY_LOOKBACK_DAYS = 7
    private const val BIRTHDAY_LIMIT = 10

    fun build(
        today: LocalDate,
        generatedAt: Instant,
        members: List<Member>,
        sessions: List<PracticeSession>,
        activeActivity: Activity? = null,
        activityGuests: List<ActivityGuest> = emptyList(),
        guestResults: List<GuestResult> = emptyList(),
        checkIns: List<CheckIn> = emptyList()
    ): DisplayFeed {
        val activeMembers = members
            .filter { it.status == MemberStatus.ACTIVE }
            .associateBy { it.internalId }
        val displayedMemberSessions = sessions.filter {
            val inScope = activeActivity?.let { activity -> it.activityId == activity.id }
                ?: (it.localDate == today)
            inScope && it.points > 0 && it.internalMemberId in activeMembers
        }
        val displayedGuests = if (activeActivity == null) {
            emptyMap()
        } else {
            activityGuests
                .filter { it.activityId == activeActivity.id && it.showOnDisplay }
                .associateBy { it.id }
        }
        val displayedGuestResults = if (activeActivity == null) {
            emptyList()
        } else {
            guestResults.filter {
                it.activityId == activeActivity.id &&
                    it.deletedAtUtc == null &&
                    it.points > 0 &&
                    it.guestId in displayedGuests
            }
        }
        val previousBestByMemberAndDiscipline = sessions
            .asSequence()
            .filter { it.localDate < today && it.points > 0 }
            .groupBy { it.internalMemberId to it.practiceType }
            .mapValues { (_, memberSessions) -> memberSessions.maxOf { it.points } }

        val memberScores = displayedMemberSessions.map {
            RankedDisplayScore(
                participantKey = "member:${it.internalMemberId}",
                score = it.toDisplayScore(activeMembers.getValue(it.internalMemberId))
            )
        }
        val guestScores = displayedGuestResults.map {
            RankedDisplayScore(
                participantKey = "guest:${it.guestId}",
                score = it.toDisplayScore(displayedGuests.getValue(it.guestId))
            )
        }
        val allScores = memberScores + guestScores
        val participantKeys = buildSet {
            checkIns
                .filter { it.localDate == today && it.internalMemberId in activeMembers }
                .forEach { add("member:${it.internalMemberId}") }
            allScores.forEach { add(it.participantKey) }
        }

        val topScores = allScores
            .groupBy { it.score.discipline to it.score.classification }
            .map { (disciplineAndClassification, disciplineScores) ->
                val bestByParticipant = disciplineScores
                    .groupBy { it.participantKey }
                    .mapNotNull { (_, participantScores) ->
                        participantScores.maxWithOrNull(
                            compareBy<RankedDisplayScore> { it.score.points }
                                .thenBy { it.score.krydser ?: 0 }
                                .thenBy { it.score.recordedAt }
                        )
                    }
                    .sortedWith(
                        compareByDescending<RankedDisplayScore> { it.score.points }
                            .thenByDescending { it.score.krydser ?: 0 }
                            .thenByDescending { it.score.recordedAt }
                    )
                    .take(TOP_SCORES_PER_DISCIPLINE)
                    .map { it.score }

                DisplayDisciplineScores(
                    discipline = listOfNotNull(
                        disciplineAndClassification.first,
                        disciplineAndClassification.second
                    ).joinToString(" · "),
                    entries = bestByParticipant
                )
            }
            .sortedBy { it.discipline }

        val recentScores = allScores
            .sortedByDescending { it.score.recordedAt }
            .map { it.score }

        val personalBests = displayedMemberSessions
            .groupBy { it.internalMemberId to it.practiceType }
            .mapNotNull { (memberAndDiscipline, memberSessions) ->
                val bestToday = memberSessions.maxByOrNull { it.points } ?: return@mapNotNull null
                val previousBest = previousBestByMemberAndDiscipline[memberAndDiscipline]
                if (previousBest != null && bestToday.points <= previousBest) return@mapNotNull null

                DisplayPersonalBest(
                    displayName = activeMembers.getValue(bestToday.internalMemberId).abbreviatedName(),
                    discipline = bestToday.practiceType.name,
                    points = bestToday.points,
                    previousBest = previousBest
                )
            }
            .sortedByDescending { it.points }
            .take(PERSONAL_BEST_LIMIT)

        val birthdayDates = (0..BIRTHDAY_LOOKBACK_DAYS)
            .map { today.minus(it, DateTimeUnit.DAY) }
            .map { it.monthNumber to it.dayOfMonth }
            .toSet()
        val birthdays = activeMembers.values
            .filter { member ->
                member.birthDate?.let { it.monthNumber to it.dayOfMonth in birthdayDates } == true
            }
            .sortedWith(compareBy<Member> { it.firstName }.thenBy { it.lastName })
            .take(BIRTHDAY_LIMIT)
            .map { DisplayBirthday(it.abbreviatedName()) }

        return DisplayFeed(
            generatedAt = generatedAt.toString(),
            clubDate = today.toString(),
            stats = DisplayDailyStats(
                participantCount = participantKeys.size,
                sessionCount = allScores.size,
                totalPoints = allScores.sumOf { it.score.points }
            ),
            topScoresByDiscipline = topScores,
            recentScores = recentScores,
            personalBests = personalBests,
            birthdays = birthdays,
            activity = activeActivity?.let { DisplayActivity(it.title, it.type.name) }
        )
    }

    private fun PracticeSession.toDisplayScore(member: Member) = DisplayScore(
        displayName = member.abbreviatedName(),
        discipline = practiceType.name,
        classification = classification,
        points = points,
        krydser = krydser,
        recordedAt = createdAtUtc.toString()
    )

    private fun GuestResult.toDisplayScore(guest: ActivityGuest) = DisplayScore(
        displayName = guest.displayName,
        discipline = practiceType.name,
        classification = classification,
        points = points,
        krydser = krydser,
        recordedAt = createdAtUtc.toString(),
        affiliation = guest.clubName
    )

    private fun Member.abbreviatedName(): String {
        val first = firstName.trim()
        val lastInitial = lastName.trim().firstOrNull()?.let { " $it." }.orEmpty()
        return "$first$lastInitial".trim().ifBlank { "Medlem" }
    }

    private data class RankedDisplayScore(
        val participantKey: String,
        val score: DisplayScore
    )
}