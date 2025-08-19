package com.club.medlems.ui.leaderboard

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
import kotlinx.datetime.*
import javax.inject.Inject

enum class LeaderboardRange { TODAY, THIS_MONTH, LAST_12_MONTHS }

data class LeaderboardState(
    val range: LeaderboardRange = LeaderboardRange.TODAY,
    val loading: Boolean = false,
    // Flat list of best entries (for legacy/simple use)
    val entries: List<LeaderboardEntry> = emptyList(),
    // Best by points per classification for full view: type -> classification -> top 10
    val groupedBest: Map<PracticeType, Map<String, List<LeaderboardEntry>>> = emptyMap(),
    // Most recent per classification for Ready: type -> classification -> top 3
    val groupedRecent: Map<PracticeType, Map<String, List<LeaderboardEntry>>> = emptyMap(),
    val justAddedKeys: Set<String> = emptySet()
)

@HiltViewModel
class LeaderboardViewModel @Inject constructor(
    private val sessionDao: PracticeSessionDao,
    private val memberDao: MemberDao
): ViewModel() {

    private val _state = MutableStateFlow(LeaderboardState())
    val state: StateFlow<LeaderboardState> = _state

    fun setRange(range: LeaderboardRange) {
        _state.value = _state.value.copy(range = range)
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            val previousKeys = _state.value.entries.map { it.practiceType.name + ":" + it.membershipId }.toSet()
            _state.value = _state.value.copy(loading = true, justAddedKeys = emptySet())
            val now = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
            val start = when (_state.value.range) {
                LeaderboardRange.TODAY -> now
                LeaderboardRange.THIS_MONTH -> LocalDate(now.year, now.month, 1)
                LeaderboardRange.LAST_12_MONTHS -> run {
                    // Start from the first day of the month 11 months ago (inclusive), covering 12 months to today
                    val thisMonthFirst = LocalDate(now.year, now.month, 1)
                    val prev = thisMonthFirst.minus(DatePeriod(months = 11))
                    LocalDate(prev.year, prev.month, 1)
                }
            }
            val end = now

            val flatBest = mutableListOf<LeaderboardEntry>()
            val bestMap = mutableMapOf<PracticeType, MutableMap<String, MutableList<LeaderboardEntry>>>()
            val recentMap = mutableMapOf<PracticeType, MutableMap<String, MutableList<LeaderboardEntry>>>()

            PracticeType.values().forEach { type ->
                val sessions = sessionDao.rangeForType(start, end, type)

                // Best per member then top by points for BEST map
                val bestPerMember = LeaderboardCalculator.bestPerMember(sessions)
                    .sortedWith(
                        compareByDescending<com.club.medlems.data.entity.PracticeSession> { it.points }
                            .thenByDescending { it.krydser ?: -1 }
                            .thenByDescending { it.createdAtUtc }
                    )
                bestPerMember.forEach { s ->
                    val cls = s.classification ?: "Uklassificeret"
                    val entry = LeaderboardEntry(
                        membershipId = s.membershipId,
                        practiceType = s.practiceType,
                        classification = cls,
                        points = s.points,
                        krydser = s.krydser,
                        createdAtUtc = s.createdAtUtc.toString()
                    )
                    flatBest += entry
                    val typeMap = bestMap.getOrPut(type) { mutableMapOf() }
                    val list = typeMap.getOrPut(cls) { mutableListOf() }
                    list += entry
                }

                // RECENT: top 3 most recent per classification regardless of member uniqueness
                sessions.filter { it.points > 0 }
                    .groupBy { it.classification ?: "Uklassificeret" }
                    .forEach { (cls, list) ->
                        val top3 = list.sortedByDescending { it.createdAtUtc }.take(3).map { s ->
                            LeaderboardEntry(
                                membershipId = s.membershipId,
                                practiceType = s.practiceType,
                                classification = s.classification ?: "Uklassificeret",
                                points = s.points,
                                krydser = s.krydser,
                                createdAtUtc = s.createdAtUtc.toString()
                            )
                        }
                        if (top3.isNotEmpty()) {
                            val typeMap = recentMap.getOrPut(type) { mutableMapOf() }
                            typeMap[cls] = top3.toMutableList()
                        }
                    }
            }

            // Enrich names for all involved membershipIds
            val ids = buildSet {
                flatBest.forEach { add(it.membershipId) }
                recentMap.values.forEach { byCls -> byCls.values.forEach { list -> list.forEach { add(it.membershipId) } } }
            }
            val members = memberDao.allMembers().filter { ids.contains(it.membershipId) }
            val nameById = members.associate { m ->
                val li = m.lastName.trim().firstOrNull()?.let { "$it." } ?: ""
                val short = (m.firstName.trim() + if (li.isNotEmpty()) " $li" else "").trim()
                m.membershipId to short.ifBlank { null }
            }

            val enrichedFlat = flatBest.map { e -> e.copy(memberName = nameById[e.membershipId]) }
            val enrichedBestRaw = bestMap.mapValues { (_, byCls) ->
                byCls.mapValues { (_, list) -> list.map { it.copy(memberName = nameById[it.membershipId]) }
                    .sortedWith(compareByDescending<LeaderboardEntry> { it.points }.thenByDescending { it.krydser ?: -1 }.thenByDescending { it.createdAtUtc })
                    .take(10)
                }
            }
            val enrichedRecentRaw = recentMap.mapValues { (_, byCls) ->
                byCls.mapValues { (_, list) -> list.map { it.copy(memberName = nameById[it.membershipId]) }
                    .sortedByDescending { it.createdAtUtc }
                    .take(3)
                }
            }

            // Extra safety: hide classification groups with no positive-point entries
            val enrichedBest = enrichedBestRaw.mapValues { (_, byCls) ->
                byCls.filterValues { list -> list.any { it.points > 0 } }
            }.filterValues { it.isNotEmpty() }
            val enrichedRecent = enrichedRecentRaw.mapValues { (_, byCls) ->
                byCls.filterValues { list -> list.any { it.points > 0 } }
            }.filterValues { it.isNotEmpty() }

            val newKeys = enrichedFlat.map { it.practiceType.name + ":" + it.membershipId }.toSet()
            val justAdded = newKeys - previousKeys
            _state.value = _state.value.copy(
                loading = false,
                entries = enrichedFlat,
                groupedBest = enrichedBest,
                groupedRecent = enrichedRecent,
                justAddedKeys = justAdded
            )
        }
    }
}
