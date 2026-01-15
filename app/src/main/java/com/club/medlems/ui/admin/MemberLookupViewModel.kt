package com.club.medlems.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.dao.CheckInDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.dao.ScanEventDao
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.ScanEvent
import com.club.medlems.data.entity.ScanEventType
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.minus
import java.util.UUID
import javax.inject.Inject

/**
 * Result of an assisted check-in operation.
 */
sealed class AssistedCheckInResult {
    data class Success(
        val memberId: String,
        val scanEventId: String,
        val isFirstScan: Boolean,
        val memberName: String
    ) : AssistedCheckInResult()
    
    data class Error(val message: String) : AssistedCheckInResult()
}

/**
 * UI state for member lookup screen.
 */
data class MemberLookupState(
    val searchQuery: String = "",
    val searchResults: List<Member> = emptyList(),
    val isSearching: Boolean = false,
    val selectedMember: Member? = null,
    val recentSessions: List<RecentSessionInfo> = emptyList(),
    val todayCheckedIn: Boolean = false,
    val lastCheckInDate: kotlinx.datetime.LocalDate? = null,
    val checkInInProgress: Boolean = false,
    val checkInResult: AssistedCheckInResult? = null
)

/**
 * Recent session info for display.
 */
data class RecentSessionInfo(
    val id: String,
    val date: kotlinx.datetime.LocalDate,
    val practiceType: String,
    val points: Int,
    val krydser: Int
)

/**
 * ViewModel for member lookup and assisted check-in.
 * 
 * Allows admin tablet users to:
 * - Search for members by name or membership ID
 * - View member details and recent activity
 * - Perform check-ins on behalf of members
 * 
 * @see [design.md FR-10] - Admin Tablet Member Lookup
 */
@HiltViewModel
class MemberLookupViewModel @Inject constructor(
    private val memberDao: MemberDao,
    private val checkInDao: CheckInDao,
    private val practiceSessionDao: PracticeSessionDao,
    private val scanEventDao: ScanEventDao
) : ViewModel() {
    
    private val _state = MutableStateFlow(MemberLookupState())
    val state: StateFlow<MemberLookupState> = _state.asStateFlow()
    
    /**
     * Updates the search query and triggers a search.
     */
    fun onSearchQueryChanged(query: String) {
        _state.value = _state.value.copy(searchQuery = query)
        if (query.length >= 2) {
            searchMembers(query)
        } else {
            _state.value = _state.value.copy(searchResults = emptyList())
        }
    }
    
    /**
     * Searches for members matching the query.
     */
    private fun searchMembers(query: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isSearching = true)
            try {
                val results = memberDao.searchByNameOrId(query)
                _state.value = _state.value.copy(
                    searchResults = results,
                    isSearching = false
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    searchResults = emptyList(),
                    isSearching = false
                )
            }
        }
    }
    
    /**
     * Selects a member to view details.
     */
    fun selectMember(member: Member) {
        viewModelScope.launch {
            _state.value = _state.value.copy(
                selectedMember = member,
                recentSessions = emptyList(),
                todayCheckedIn = false,
                lastCheckInDate = null,
                checkInResult = null
            )
            
            // Load member's recent activity
            loadMemberDetails(member.membershipId)
        }
    }
    
    /**
     * Clears the selected member.
     */
    fun clearSelection() {
        _state.value = _state.value.copy(
            selectedMember = null,
            recentSessions = emptyList(),
            todayCheckedIn = false,
            lastCheckInDate = null,
            checkInResult = null
        )
    }
    
    /**
     * Loads detailed information about a member.
     */
    private suspend fun loadMemberDetails(membershipId: String) {
        val now = Clock.System.now()
        val tz = TimeZone.currentSystemDefault()
        val today = now.toLocalDateTime(tz).date
        
        // Check if already checked in today
        val todayCheckIn = checkInDao.firstForDate(membershipId, today)
        val lastCheckDate = checkInDao.lastCheckDate(membershipId)
        
        // Get recent sessions (last 30 days)
        val thirtyDaysAgo = today.minus(DatePeriod(days = 30))
        
        val sessions = practiceSessionDao.sessionsForMemberInRange(
            membershipId, 
            thirtyDaysAgo, 
            today
        )
        
        val recentSessionInfo = sessions.take(10).map { session ->
            RecentSessionInfo(
                id = session.id,
                date = session.localDate,
                practiceType = session.practiceType.name,
                points = session.points,
                krydser = session.krydser ?: 0
            )
        }
        
        _state.value = _state.value.copy(
            todayCheckedIn = todayCheckIn != null,
            lastCheckInDate = lastCheckDate,
            recentSessions = recentSessionInfo
        )
    }
    
    /**
     * Performs an assisted check-in for the selected member.
     * 
     * This creates a check-in record and scan event as if the member
     * had scanned their badge, but marks it as an assisted check-in.
     */
    fun performAssistedCheckIn() {
        val member = _state.value.selectedMember ?: return
        
        viewModelScope.launch {
            _state.value = _state.value.copy(checkInInProgress = true)
            
            try {
                val now = Clock.System.now()
                val tz = TimeZone.currentSystemDefault()
                val localDate = now.toLocalDateTime(tz).date
                
                val existingCheckIn = checkInDao.firstForDate(member.membershipId, localDate)
                val isFirstScan = existingCheckIn == null
                
                val scanEventId = UUID.randomUUID().toString()
                
                if (isFirstScan) {
                    // Create check-in record
                    val checkIn = CheckIn(
                        id = UUID.randomUUID().toString(),
                        membershipId = member.membershipId,
                        createdAtUtc = now,
                        localDate = localDate,
                        firstOfDayFlag = true
                    )
                    checkInDao.insert(checkIn)
                    
                    // Create scan event (marked as assisted)
                    scanEventDao.insert(
                        ScanEvent(
                            id = scanEventId,
                            membershipId = member.membershipId,
                            createdAtUtc = now,
                            type = ScanEventType.FIRST_SCAN,
                            linkedCheckInId = checkIn.id
                        )
                    )
                } else {
                    // Create repeat scan event
                    scanEventDao.insert(
                        ScanEvent(
                            id = scanEventId,
                            membershipId = member.membershipId,
                            createdAtUtc = now,
                            type = ScanEventType.REPEAT_SCAN
                        )
                    )
                }
                
                val memberName = listOfNotNull(member.firstName, member.lastName)
                    .joinToString(" ")
                    .ifEmpty { member.membershipId }
                
                _state.value = _state.value.copy(
                    checkInInProgress = false,
                    todayCheckedIn = true,
                    checkInResult = AssistedCheckInResult.Success(
                        memberId = member.membershipId,
                        scanEventId = scanEventId,
                        isFirstScan = isFirstScan,
                        memberName = memberName
                    )
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    checkInInProgress = false,
                    checkInResult = AssistedCheckInResult.Error(
                        "Kunne ikke registrere check-in: ${e.message}"
                    )
                )
            }
        }
    }
    
    /**
     * Clears the check-in result after it has been acknowledged.
     */
    fun clearCheckInResult() {
        _state.value = _state.value.copy(checkInResult = null)
    }
}
