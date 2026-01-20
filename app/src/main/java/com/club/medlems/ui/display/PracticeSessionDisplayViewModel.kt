package com.club.medlems.ui.display

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.data.sync.SyncState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.todayIn
import javax.inject.Inject

/**
 * ViewModel for the Practice Session Display screen.
 * Provides today's practice sessions with leaderboard and recent activity.
 * 
 * @see [design.md FR-1.6] - Practice Session Display Tablet
 * @see [design.md FR-20] - Display Tablet Details
 */
@HiltViewModel
class PracticeSessionDisplayViewModel @Inject constructor(
    private val practiceSessionDao: PracticeSessionDao,
    private val memberDao: MemberDao,
    private val syncManager: SyncManager
) : ViewModel() {
    
    companion object {
        private const val VIEW_ROTATION_INTERVAL_MS = 30_000L // 30 seconds per view
    }
    
    private val _uiState = MutableStateFlow(PracticeSessionDisplayUiState())
    val uiState: StateFlow<PracticeSessionDisplayUiState> = _uiState.asStateFlow()
    
    init {
        loadSessions()
        observeSyncState()
        startViewRotation()
    }
    
    /**
     * Loads today's practice sessions.
     */
    private fun loadSessions() {
        viewModelScope.launch {
            refresh()
        }
    }
    
    /**
     * Starts automatic view rotation between different display modes.
     */
    private fun startViewRotation() {
        viewModelScope.launch {
            while (true) {
                delay(VIEW_ROTATION_INTERVAL_MS)
                val currentView = _uiState.value.currentView
                val nextView = when (currentView) {
                    DisplayView.LEADERBOARD -> DisplayView.RECENT_ACTIVITY
                    DisplayView.RECENT_ACTIVITY -> DisplayView.STATS
                    DisplayView.STATS -> DisplayView.LEADERBOARD
                }
                _uiState.value = _uiState.value.copy(currentView = nextView)
            }
        }
    }
    
    /**
     * Observes sync state to update online status.
     */
    private fun observeSyncState() {
        viewModelScope.launch {
            syncManager.syncState.collectLatest { state ->
                _uiState.value = _uiState.value.copy(
                    isOnline = state != SyncState.STOPPED
                )
            }
        }
    }
    
    /**
     * Refreshes practice session data.
     */
    fun refresh() {
        viewModelScope.launch {
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            val sessions = practiceSessionDao.allSessionsForDate(today)
            
            // Build leaderboard (top 10 by points)
            val leaderboard = sessions
                .groupBy { it.internalMemberId }
                .mapNotNull { (memberId, memberSessions) ->
                    val member = memberId?.let { memberDao.get(it) }
                    if (member != null) {
                        LeaderboardEntry(
                            memberName = "${member.firstName} ${member.lastName}",
                            totalPoints = memberSessions.sumOf { it.points },
                            sessionCount = memberSessions.size
                        )
                    } else null
                }
                .sortedByDescending { it.totalPoints }
                .take(10)
            
            // Recent activity (last 10 sessions)
            val recentActivity = sessions
                .sortedByDescending { it.createdAtUtc }
                .take(10)
                .mapNotNull { session ->
                    val member = session.internalMemberId?.let { memberDao.get(it) }
                    if (member != null) {
                        RecentActivityEntry(
                            memberName = "${member.firstName} ${member.lastName}",
                            practiceType = session.practiceType.name,
                            points = session.points,
                            time = formatTime(session.createdAtUtc)
                        )
                    } else null
                }
            
            // Stats by practice type
            val statsByType = sessions
                .groupBy { it.practiceType }
                .map { (type, typeSessions) ->
                    PracticeTypeStats(
                        practiceType = type.name,
                        sessionCount = typeSessions.size,
                        totalPoints = typeSessions.sumOf { it.points },
                        participantCount = typeSessions.map { it.internalMemberId }.distinct().size
                    )
                }
                .sortedByDescending { it.sessionCount }
            
            _uiState.value = _uiState.value.copy(
                todaySessionCount = sessions.size,
                todayParticipantCount = sessions.map { it.internalMemberId }.distinct().size,
                todayTotalPoints = sessions.sumOf { it.points },
                leaderboard = leaderboard,
                recentActivity = recentActivity,
                statsByType = statsByType,
                lastSyncTime = Clock.System.now()
            )
        }
    }
    
    /**
     * Manually switches to a specific view.
     */
    fun switchView(view: DisplayView) {
        _uiState.value = _uiState.value.copy(currentView = view)
    }
    
    private fun formatTime(instant: Instant): String {
        val local = instant.toLocalDateTime(TimeZone.currentSystemDefault())
        return "%02d:%02d".format(local.hour, local.minute)
    }
}

/**
 * Display view modes for rotation.
 */
enum class DisplayView {
    LEADERBOARD,
    RECENT_ACTIVITY,
    STATS
}

/**
 * UI state for Practice Session Display screen.
 */
data class PracticeSessionDisplayUiState(
    val currentView: DisplayView = DisplayView.LEADERBOARD,
    val todaySessionCount: Int = 0,
    val todayParticipantCount: Int = 0,
    val todayTotalPoints: Int = 0,
    val leaderboard: List<LeaderboardEntry> = emptyList(),
    val recentActivity: List<RecentActivityEntry> = emptyList(),
    val statsByType: List<PracticeTypeStats> = emptyList(),
    val isOnline: Boolean = true,
    val lastSyncTime: Instant? = null
)

/**
 * Entry in the leaderboard.
 */
data class LeaderboardEntry(
    val memberName: String,
    val totalPoints: Int,
    val sessionCount: Int
)

/**
 * Entry in recent activity feed.
 */
data class RecentActivityEntry(
    val memberName: String,
    val practiceType: String,
    val points: Int,
    val time: String
)

/**
 * Stats for a practice type.
 */
data class PracticeTypeStats(
    val practiceType: String,
    val sessionCount: Int,
    val totalPoints: Int,
    val participantCount: Int
)
