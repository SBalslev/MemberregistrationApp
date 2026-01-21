package com.club.medlems.ui.trainer.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.dao.CheckInDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.MemberNameProjection
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.PracticeType
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import javax.inject.Inject

/**
 * Represents a check-in history item with member name resolved.
 */
data class CheckInHistoryItem(
    val id: String,
    val internalMemberId: String,
    val memberName: String,
    val membershipId: String?,
    val localDate: LocalDate,
    val createdAtUtc: String
)

/**
 * Represents a practice session history item with member name resolved.
 */
data class SessionHistoryItem(
    val id: String,
    val internalMemberId: String,
    val memberName: String,
    val membershipId: String?,
    val localDate: LocalDate,
    val createdAtUtc: String,
    val practiceType: PracticeType,
    val classification: String?,
    val points: Int,
    val krydser: Int?
)

/**
 * Active tab selection for the history screen.
 */
enum class HistoryTab {
    CHECK_INS,
    SESSIONS
}

/**
 * UI State for the history screen.
 */
data class HistoryState(
    val startDate: LocalDate,
    val endDate: LocalDate,
    val minSelectableDate: LocalDate,
    val memberFilter: String = "",
    val disciplineFilter: PracticeType? = null,
    val activeTab: HistoryTab = HistoryTab.CHECK_INS,
    val checkInHistory: List<CheckInHistoryItem> = emptyList(),
    val sessionHistory: List<SessionHistoryItem> = emptyList(),
    val isLoading: Boolean = false,
    val hasMoreCheckIns: Boolean = false,
    val hasMoreSessions: Boolean = false,
    val error: String? = null
) {
    companion object {
        private const val MAX_LOOKBACK_DAYS = 90
        private const val DEFAULT_LOOKBACK_DAYS = 7

        fun initial(): HistoryState {
            val now = Clock.System.now()
            val tz = TimeZone.currentSystemDefault()
            val today = now.toLocalDateTime(tz).date
            val startDate = today.minus(DatePeriod(days = DEFAULT_LOOKBACK_DAYS))
            val minDate = today.minus(DatePeriod(days = MAX_LOOKBACK_DAYS))
            return HistoryState(
                startDate = startDate,
                endDate = today,
                minSelectableDate = minDate
            )
        }
    }
}

/**
 * ViewModel for the historical data viewing screen.
 *
 * Features:
 * - Date range selection with max 90 days lookback
 * - Filter by member name and discipline
 * - Paginated loading for large datasets
 * - Separate tabs for check-ins and practice sessions
 *
 * @see [Phase 5: Historical Data] - Trainer App Historical Data Viewing
 */
@HiltViewModel
class HistoryViewModel @Inject constructor(
    private val checkInDao: CheckInDao,
    private val practiceSessionDao: PracticeSessionDao,
    private val memberDao: MemberDao
) : ViewModel() {

    companion object {
        private const val PAGE_SIZE = 50
        private const val MAX_LOOKBACK_DAYS = 90
    }

    private val _state = MutableStateFlow(HistoryState.initial())
    val state: StateFlow<HistoryState> = _state.asStateFlow()

    private var checkInOffset = 0
    private var sessionOffset = 0
    private var allCheckIns: List<CheckIn> = emptyList()
    private var allSessions: List<PracticeSession> = emptyList()
    private var memberNames: Map<String, MemberNameProjection> = emptyMap()

    init {
        loadInitialData()
    }

    /**
     * Loads initial data when the ViewModel is created.
     */
    private fun loadInitialData() {
        viewModelScope.launch {
            loadData()
        }
    }

    /**
     * Sets the date range for the history query.
     * Validates that:
     * - Start date is not more than 90 days in the past
     * - End date is not before start date
     */
    fun setDateRange(start: LocalDate, end: LocalDate) {
        val now = Clock.System.now()
        val tz = TimeZone.currentSystemDefault()
        val today = now.toLocalDateTime(tz).date
        val minDate = today.minus(DatePeriod(days = MAX_LOOKBACK_DAYS))

        // Validate start date is within allowed range
        val validStart = if (start < minDate) minDate else start

        // Validate end date is not before start and not in future
        val validEnd = when {
            end < validStart -> validStart
            end > today -> today
            else -> end
        }

        _state.value = _state.value.copy(
            startDate = validStart,
            endDate = validEnd
        )

        // Reset pagination and reload
        resetAndLoad()
    }

    /**
     * Sets the member name filter.
     */
    fun setMemberFilter(query: String) {
        _state.value = _state.value.copy(memberFilter = query)
        resetAndLoad()
    }

    /**
     * Sets the discipline filter. Null means all disciplines.
     */
    fun setDisciplineFilter(discipline: PracticeType?) {
        _state.value = _state.value.copy(disciplineFilter = discipline)
        // Only affects sessions, but we reload both for consistency
        resetAndLoad()
    }

    /**
     * Switches between Check-ins and Sessions tabs.
     */
    fun setActiveTab(tab: HistoryTab) {
        _state.value = _state.value.copy(activeTab = tab)
    }

    /**
     * Loads check-ins for the current date range and filters.
     */
    fun loadCheckIns() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val filtered = getFilteredCheckIns()
                val page = filtered.take(PAGE_SIZE)
                checkInOffset = page.size

                val items = mapCheckIns(page)
                _state.value = _state.value.copy(
                    checkInHistory = items,
                    hasMoreCheckIns = filtered.size > PAGE_SIZE,
                    isLoading = false
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    error = "Kunne ikke indlæse check-ins: ${e.message}"
                )
            }
        }
    }

    /**
     * Loads sessions for the current date range and filters.
     */
    fun loadSessions() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val filtered = getFilteredSessions()
                val page = filtered.take(PAGE_SIZE)
                sessionOffset = page.size

                val items = mapSessions(page)
                _state.value = _state.value.copy(
                    sessionHistory = items,
                    hasMoreSessions = filtered.size > PAGE_SIZE,
                    isLoading = false
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    error = "Kunne ikke indlæse sessioner: ${e.message}"
                )
            }
        }
    }

    /**
     * Loads more items for the current tab (pagination).
     */
    fun loadMore() {
        when (_state.value.activeTab) {
            HistoryTab.CHECK_INS -> loadMoreCheckIns()
            HistoryTab.SESSIONS -> loadMoreSessions()
        }
    }

    private fun loadMoreCheckIns() {
        viewModelScope.launch {
            if (!_state.value.hasMoreCheckIns) return@launch

            _state.value = _state.value.copy(isLoading = true)
            try {
                val filtered = getFilteredCheckIns()
                val nextPage = filtered.drop(checkInOffset).take(PAGE_SIZE)
                checkInOffset += nextPage.size

                val items = mapCheckIns(nextPage)
                _state.value = _state.value.copy(
                    checkInHistory = _state.value.checkInHistory + items,
                    hasMoreCheckIns = checkInOffset < filtered.size,
                    isLoading = false
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    error = "Kunne ikke indlæse flere check-ins: ${e.message}"
                )
            }
        }
    }

    private fun loadMoreSessions() {
        viewModelScope.launch {
            if (!_state.value.hasMoreSessions) return@launch

            _state.value = _state.value.copy(isLoading = true)
            try {
                val filtered = getFilteredSessions()
                val nextPage = filtered.drop(sessionOffset).take(PAGE_SIZE)
                sessionOffset += nextPage.size

                val items = mapSessions(nextPage)
                _state.value = _state.value.copy(
                    sessionHistory = _state.value.sessionHistory + items,
                    hasMoreSessions = sessionOffset < filtered.size,
                    isLoading = false
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    error = "Kunne ikke indlæse flere sessioner: ${e.message}"
                )
            }
        }
    }

    /**
     * Clears any error state.
     */
    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }

    private fun resetAndLoad() {
        checkInOffset = 0
        sessionOffset = 0
        allCheckIns = emptyList()
        allSessions = emptyList()
        memberNames = emptyMap()
        viewModelScope.launch {
            loadData()
        }
    }

    private suspend fun loadData() {
        _state.value = _state.value.copy(isLoading = true, error = null)
        try {
            val state = _state.value

            // Fetch all data in range first
            allCheckIns = fetchCheckInsInRange(state.startDate, state.endDate)
            allSessions = fetchSessionsInRange(state.startDate, state.endDate)

            // Collect all member IDs and fetch names
            val memberIds = buildSet {
                allCheckIns.forEach { add(it.internalMemberId) }
                allSessions.forEach { add(it.internalMemberId) }
            }

            if (memberIds.isNotEmpty()) {
                val names = memberDao.getMemberNames(memberIds.toList())
                memberNames = names.associateBy { it.internalId }
            }

            // Apply filters and paginate
            loadCheckIns()
            loadSessions()

        } catch (e: Exception) {
            _state.value = _state.value.copy(
                isLoading = false,
                error = "Kunne ikke indlæse data: ${e.message}"
            )
        }
    }

    private suspend fun fetchCheckInsInRange(start: LocalDate, end: LocalDate): List<CheckIn> {
        // Room doesn't have a direct date range query for CheckIn,
        // so we get all and filter in memory
        return checkInDao.allCheckIns()
            .filter { it.localDate in start..end }
            .sortedByDescending { it.createdAtUtc }
    }

    private suspend fun fetchSessionsInRange(start: LocalDate, end: LocalDate): List<PracticeSession> {
        return practiceSessionDao.allSessions()
            .filter { it.localDate in start..end }
            .sortedByDescending { it.createdAtUtc }
    }

    private fun getFilteredCheckIns(): List<CheckIn> {
        val memberFilter = _state.value.memberFilter.lowercase().trim()
        if (memberFilter.isEmpty()) return allCheckIns

        return allCheckIns.filter { checkIn ->
            val memberName = memberNames[checkIn.internalMemberId]
            memberName?.let { m ->
                val fullName = "${m.firstName} ${m.lastName}".lowercase()
                val memberId = m.membershipId?.lowercase() ?: ""
                fullName.contains(memberFilter) || memberId.contains(memberFilter)
            } ?: false
        }
    }

    private fun getFilteredSessions(): List<PracticeSession> {
        var filtered = allSessions

        // Filter by discipline
        _state.value.disciplineFilter?.let { discipline ->
            filtered = filtered.filter { it.practiceType == discipline }
        }

        // Filter by member name
        val memberFilter = _state.value.memberFilter.lowercase().trim()
        if (memberFilter.isNotEmpty()) {
            filtered = filtered.filter { session ->
                val memberName = memberNames[session.internalMemberId]
                memberName?.let { m ->
                    val fullName = "${m.firstName} ${m.lastName}".lowercase()
                    val memberId = m.membershipId?.lowercase() ?: ""
                    fullName.contains(memberFilter) || memberId.contains(memberFilter)
                } ?: false
            }
        }

        return filtered
    }

    private fun mapCheckIns(checkIns: List<CheckIn>): List<CheckInHistoryItem> {
        return checkIns.map { checkIn ->
            val member = memberNames[checkIn.internalMemberId]
            val displayName = member?.let { "${it.firstName} ${it.lastName}".trim() }
                ?.ifEmpty { null }
                ?: member?.membershipId
                ?: checkIn.internalMemberId

            CheckInHistoryItem(
                id = checkIn.id,
                internalMemberId = checkIn.internalMemberId,
                memberName = displayName,
                membershipId = member?.membershipId,
                localDate = checkIn.localDate,
                createdAtUtc = checkIn.createdAtUtc.toString()
            )
        }
    }

    private fun mapSessions(sessions: List<PracticeSession>): List<SessionHistoryItem> {
        return sessions.map { session ->
            val member = memberNames[session.internalMemberId]
            val displayName = member?.let { "${it.firstName} ${it.lastName}".trim() }
                ?.ifEmpty { null }
                ?: member?.membershipId
                ?: session.internalMemberId

            SessionHistoryItem(
                id = session.id,
                internalMemberId = session.internalMemberId,
                memberName = displayName,
                membershipId = member?.membershipId,
                localDate = session.localDate,
                createdAtUtc = session.createdAtUtc.toString(),
                practiceType = session.practiceType,
                classification = session.classification,
                points = session.points,
                krydser = session.krydser
            )
        }
    }
}
