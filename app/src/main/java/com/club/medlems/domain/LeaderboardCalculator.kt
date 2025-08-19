package com.club.medlems.domain

import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.PracticeType

data class LeaderboardEntry(
    val membershipId: String,
    val practiceType: PracticeType,
    val classification: String?,
    val points: Int,
    val krydser: Int?,
    val createdAtUtc: String,
    // Optional display helper populated by ViewModels: formatted short name (e.g., "Jens P.")
    val memberName: String? = null
)

object LeaderboardCalculator {
    fun bestPerMember(sessions: List<PracticeSession>): List<PracticeSession> {
        // sessions already filtered by type & points>0
        val grouped = sessions.groupBy { it.membershipId }
        return grouped.values.map { list ->
            list.sortedWith(
                compareByDescending<PracticeSession> { it.points }
                    .thenByDescending { it.krydser ?: -1 }
                    .thenByDescending { it.createdAtUtc }
            ).first()
        }
    }
}
