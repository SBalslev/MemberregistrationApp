package com.club.medlems.ui.trainer.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.dao.CheckInDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.domain.trainer.TrainerSessionManager
import com.club.medlems.util.BirthDateValidator
import kotlin.time.Duration.Companion.days
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import javax.inject.Inject

/**
 * Represents a check-in with member name for display.
 */
data class CheckInWithMember(
    val checkIn: CheckIn,
    val memberName: String,
    val memberId: String
)

/**
 * Represents a practice session with member name for display.
 */
data class PracticeSessionWithMember(
    val session: PracticeSession,
    val memberName: String,
    val memberId: String
)

/**
 * Stats cards data for the dashboard.
 */
data class DashboardStats(
    val totalCheckIns: Int = 0,
    val totalSessions: Int = 0
)

/**
 * Represents a trial member for the trainer dashboard list.
 */
data class TrialMemberListItem(
    val member: Member,
    val displayName: String,
    val registrationDate: String,
    val age: Int?,
    val isAdult: Boolean,
    val hasIdPhoto: Boolean,
    val hasProfilePhoto: Boolean
)

/**
 * UI state for the trainer dashboard.
 */
data class TrainerDashboardState(
    val trainerName: String = "",
    /** All check-ins for today (unfiltered) */
    val allCheckIns: List<CheckInWithMember> = emptyList(),
    /** All sessions for today (unfiltered) */
    val allSessions: List<PracticeSessionWithMember> = emptyList(),
    /** Filtered check-ins (based on search query) */
    val filteredCheckIns: List<CheckInWithMember> = emptyList(),
    /** Filtered sessions (based on search query) */
    val filteredSessions: List<PracticeSessionWithMember> = emptyList(),
    /** Recent trial members (last 7 days) */
    val trialMembers: List<TrialMemberListItem> = emptyList(),
    val stats: DashboardStats = DashboardStats(),
    val searchQuery: String = "",
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val lastUpdated: String = "",
    val sessionExpiring: Boolean = false,
    val sessionRemainingSeconds: Int = 0
)

/**
 * ViewModel for the Trainer Dashboard screen.
 *
 * Provides:
 * - Today's check-ins with member names
 * - Today's practice sessions with member names and discipline
 * - Stats cards (total check-ins, total sessions)
 * - Search/filter functionality by member name
 * - Real-time updates via periodic refresh
 * - Session expiry warning integration
 *
 * @see [trainer-experience/prd.md] Phase 3 - Dashboard Today's View
 */
@HiltViewModel
class TrainerDashboardViewModel @Inject constructor(
    private val checkInDao: CheckInDao,
    private val practiceSessionDao: PracticeSessionDao,
    private val memberDao: MemberDao,
    private val trainerSessionManager: TrainerSessionManager
) : ViewModel() {

    companion object {
        /** Auto-refresh interval in milliseconds (30 seconds) */
        private const val AUTO_REFRESH_INTERVAL_MS = 30_000L
    }

    private val _state = MutableStateFlow(TrainerDashboardState())
    val state: StateFlow<TrainerDashboardState> = _state.asStateFlow()

    // Combine dashboard state with trainer session state for expiry warnings
    val combinedState: StateFlow<TrainerDashboardState> = combine(
        _state,
        trainerSessionManager.sessionState
    ) { dashboardState, sessionState ->
        dashboardState.copy(
            trainerName = sessionState.trainerName ?: "",
            sessionExpiring = sessionState.isExpiring,
            sessionRemainingSeconds = sessionState.secondsRemaining
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = TrainerDashboardState()
    )

    init {
        // Load initial data
        loadData()

        // Start auto-refresh
        startAutoRefresh()
    }

    /**
     * Updates the search query and filters the displayed data.
     */
    fun onSearchQueryChanged(query: String) {
        _state.value = _state.value.copy(searchQuery = query)
        applyFilter()
    }

    /**
     * Manually refreshes the dashboard data.
     * Used for pull-to-refresh functionality.
     */
    fun refresh() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isRefreshing = true)
            loadDataInternal()
            _state.value = _state.value.copy(isRefreshing = false)
        }
    }

    /**
     * Extends the trainer session.
     */
    fun extendSession() {
        trainerSessionManager.extendSession()
    }

    /**
     * Logs out the current trainer.
     */
    fun logout() {
        trainerSessionManager.endSession()
    }

    /**
     * Registers user interaction to extend session timeout.
     */
    fun registerInteraction() {
        trainerSessionManager.registerInteraction()
    }

    private fun loadData() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true)
            loadDataInternal()
            _state.value = _state.value.copy(isLoading = false)
        }
    }

    private suspend fun loadDataInternal() {
        val today = getToday()
        val now = Clock.System.now()

        // Fetch today's check-ins and sessions
        val checkIns = checkInDao.allCheckInsForDate(today)
        val sessions = practiceSessionDao.allSessionsForDate(today)

        // Fetch recent trial members (last 7 days)
        val sevenDaysAgo = now - 7.days
        val recentTrialMembers = memberDao.getRecentTrialMembers(sevenDaysAgo)

        // Collect unique member IDs
        val memberIds = (checkIns.map { it.internalMemberId } + sessions.map { it.internalMemberId }).distinct()

        // Fetch member names
        val memberNames = if (memberIds.isNotEmpty()) {
            memberDao.getMemberNames(memberIds)
        } else {
            emptyList()
        }
        val nameMap = memberNames.associateBy { it.internalId }

        // Map check-ins with member names
        val checkInsWithMembers = checkIns.map { checkIn ->
            val member = nameMap[checkIn.internalMemberId]
            CheckInWithMember(
                checkIn = checkIn,
                memberName = member?.displayName ?: "Ukendt medlem",
                memberId = member?.membershipId ?: checkIn.internalMemberId
            )
        }.sortedByDescending { it.checkIn.createdAtUtc }

        // Map sessions with member names
        val sessionsWithMembers = sessions.map { session ->
            val member = nameMap[session.internalMemberId]
            PracticeSessionWithMember(
                session = session,
                memberName = member?.displayName ?: "Ukendt medlem",
                memberId = member?.membershipId ?: session.internalMemberId
            )
        }.sortedByDescending { it.session.createdAtUtc }

        // Map trial members for display
        val trialMemberItems = recentTrialMembers.map { member ->
            val birthDateStr = member.birthDate?.toString()
            val validationResult = if (birthDateStr != null) {
                BirthDateValidator.validate(birthDateStr)
            } else null
            val age = when (validationResult) {
                is com.club.medlems.util.BirthDateValidationResult.Valid -> validationResult.age
                else -> null
            }
            val isAdult = age != null && age >= 18

            val createdAt = member.createdAtUtc.toLocalDateTime(TimeZone.currentSystemDefault())
            val dateStr = String.format("%02d/%02d", createdAt.dayOfMonth, createdAt.monthNumber)

            TrialMemberListItem(
                member = member,
                displayName = listOfNotNull(member.firstName, member.lastName).joinToString(" "),
                registrationDate = dateStr,
                age = age,
                isAdult = isAdult,
                hasIdPhoto = member.idPhotoPath != null,
                hasProfilePhoto = member.registrationPhotoPath != null
            )
        }

        // Update time
        val nowLocal = now.toLocalDateTime(TimeZone.currentSystemDefault())
        val timeStr = String.format("%02d:%02d", nowLocal.hour, nowLocal.minute)

        _state.value = _state.value.copy(
            allCheckIns = checkInsWithMembers,
            allSessions = sessionsWithMembers,
            trialMembers = trialMemberItems,
            stats = DashboardStats(
                totalCheckIns = checkInsWithMembers.size,
                totalSessions = sessionsWithMembers.size
            ),
            lastUpdated = timeStr
        )

        // Apply any existing filter
        applyFilter()
    }

    /**
     * Applies the current search filter to the data.
     * Stats always reflect the full dataset, filtered lists are for display.
     */
    private fun applyFilter() {
        val query = _state.value.searchQuery.lowercase().trim()

        val filteredCheckIns: List<CheckInWithMember>
        val filteredSessions: List<PracticeSessionWithMember>

        if (query.isEmpty()) {
            // No filter - show all data
            filteredCheckIns = _state.value.allCheckIns
            filteredSessions = _state.value.allSessions
        } else {
            // Filter check-ins by member name or ID
            filteredCheckIns = _state.value.allCheckIns.filter { item ->
                item.memberName.lowercase().contains(query) ||
                        item.memberId.lowercase().contains(query)
            }

            // Filter sessions by member name or ID
            filteredSessions = _state.value.allSessions.filter { item ->
                item.memberName.lowercase().contains(query) ||
                        item.memberId.lowercase().contains(query)
            }
        }

        _state.value = _state.value.copy(
            filteredCheckIns = filteredCheckIns,
            filteredSessions = filteredSessions
        )
    }

    private fun startAutoRefresh() {
        viewModelScope.launch {
            while (isActive) {
                delay(AUTO_REFRESH_INTERVAL_MS)
                if (trainerSessionManager.isSessionActive) {
                    loadDataInternal()
                }
            }
        }
    }

    private fun getToday(): LocalDate {
        return Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
    }
}
