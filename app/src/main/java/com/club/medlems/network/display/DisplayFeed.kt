package com.club.medlems.network.display

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
    val birthdays: List<DisplayBirthday>
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
    val recordedAt: String
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
    private const val RECENT_SCORE_LIMIT = 10
    private const val PERSONAL_BEST_LIMIT = 5
    private const val BIRTHDAY_LOOKBACK_DAYS = 7
    private const val BIRTHDAY_LIMIT = 10

    fun build(
        today: LocalDate,
        generatedAt: Instant,
        members: List<Member>,
        sessions: List<PracticeSession>
    ): DisplayFeed {
        val activeMembers = members
            .filter { it.status == MemberStatus.ACTIVE }
            .associateBy { it.internalId }
        val sessionsToday = sessions.filter {
            it.localDate == today && it.points > 0 && it.internalMemberId in activeMembers
        }
        val previousBestByMemberAndDiscipline = sessions
            .asSequence()
            .filter { it.localDate < today && it.points > 0 }
            .groupBy { it.internalMemberId to it.practiceType }
            .mapValues { (_, memberSessions) -> memberSessions.maxOf { it.points } }

        val topScores = sessionsToday
            .groupBy { it.practiceType }
            .map { (practiceType, disciplineSessions) ->
                val bestByMember = disciplineSessions
                    .groupBy { it.internalMemberId }
                    .mapNotNull { (_, memberSessions) ->
                        memberSessions.maxWithOrNull(
                            compareBy<PracticeSession> { it.points }
                                .thenBy { it.krydser ?: 0 }
                                .thenBy { it.createdAtUtc }
                        )
                    }
                    .sortedWith(
                        compareByDescending<PracticeSession> { it.points }
                            .thenByDescending { it.krydser ?: 0 }
                            .thenByDescending { it.createdAtUtc }
                    )
                    .take(TOP_SCORES_PER_DISCIPLINE)
                    .map { it.toDisplayScore(activeMembers.getValue(it.internalMemberId)) }

                DisplayDisciplineScores(
                    discipline = practiceType.name,
                    entries = bestByMember
                )
            }
            .sortedBy { it.discipline }

        val recentScores = sessionsToday
            .sortedByDescending { it.createdAtUtc }
            .take(RECENT_SCORE_LIMIT)
            .map { it.toDisplayScore(activeMembers.getValue(it.internalMemberId)) }

        val personalBests = sessionsToday
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
                participantCount = sessionsToday.map { it.internalMemberId }.distinct().size,
                sessionCount = sessionsToday.size,
                totalPoints = sessionsToday.sumOf { it.points }
            ),
            topScoresByDiscipline = topScores,
            recentScores = recentScores,
            personalBests = personalBests,
            birthdays = birthdays
        )
    }

    private fun PracticeSession.toDisplayScore(member: Member) = DisplayScore(
        displayName = member.abbreviatedName(),
        discipline = practiceType.name,
        points = points,
        krydser = krydser,
        recordedAt = createdAtUtc.toString()
    )

    private fun Member.abbreviatedName(): String {
        val first = firstName.trim()
        val lastInitial = lastName.trim().firstOrNull()?.let { " $it." }.orEmpty()
        return "$first$lastInitial".trim().ifBlank { "Medlem" }
    }
}