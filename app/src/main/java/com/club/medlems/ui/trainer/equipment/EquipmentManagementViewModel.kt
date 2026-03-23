package com.club.medlems.ui.trainer.equipment

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.dao.EquipmentCheckoutDao
import com.club.medlems.data.dao.EquipmentItemDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.entity.EquipmentCheckout
import com.club.medlems.data.entity.EquipmentItem
import com.club.medlems.data.entity.EquipmentStatus
import com.club.medlems.data.entity.EquipmentType
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.domain.trainer.TrainerSessionManager
import com.club.medlems.network.TrustManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import java.util.UUID
import javax.inject.Inject

/**
 * Status filter for equipment list.
 */
enum class EquipmentStatusFilter {
    All,
    Available,
    ActiveCheckouts,
    CheckedOut
}

/**
 * UI state for equipment management screens.
 */
data class EquipmentManagementState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null,
    val selectedEquipment: EquipmentItem? = null,
    val selectedEquipmentCheckout: EquipmentCheckout? = null,
    val selectedEquipmentMember: Member? = null,
    val checkoutHistory: List<CheckoutHistoryItem> = emptyList(),
    val statusFilter: EquipmentStatusFilter = EquipmentStatusFilter.All,
    val searchQuery: String = "",
    val quickCheckoutEquipmentId: String? = null
)

/**
 * Checkout history item with member details.
 */
data class CheckoutHistoryItem(
    val checkout: EquipmentCheckout,
    val member: Member?
)

/**
 * Equipment item with current checkout info.
 */
data class EquipmentWithCheckout(
    val equipment: EquipmentItem,
    val currentCheckout: EquipmentCheckout? = null,
    val currentMember: Member? = null
)

/**
 * ViewModel for trainer equipment management.
 *
 * Provides:
 * - Equipment inventory management with status filters
 * - Checkout/checkin workflows with audit trail
 * - Quick inline checkout/checkin from the list screen
 * - Batch return for active checkouts
 * - Recent members for fast checkout
 * - Search by serial number or description
 * - Transaction history
 *
 * @see [design.md FR-8] - Equipment Management
 */
@HiltViewModel
class EquipmentManagementViewModel @Inject constructor(
    private val equipmentItemDao: EquipmentItemDao,
    private val equipmentCheckoutDao: EquipmentCheckoutDao,
    private val memberDao: MemberDao,
    private val trainerSessionManager: TrainerSessionManager,
    private val trustManager: TrustManager
) : ViewModel() {

    companion object {
        private const val TAG = "EquipmentMgmtVM"
        private const val MAX_RECENT_MEMBERS = 8
    }

    // ===== UI State =====

    private val _uiState = MutableStateFlow(EquipmentManagementState())
    val uiState: StateFlow<EquipmentManagementState> = _uiState.asStateFlow()

    // ===== Equipment List with Status =====

    private val allEquipmentFlow = equipmentItemDao.allItemsFlow()
    private val activeCheckoutsFlow = equipmentCheckoutDao.allActiveCheckoutsFlow()

    /**
     * Equipment list combined with checkout info and resolved member names,
     * filtered by status and search query.
     */
    val equipmentList: StateFlow<List<EquipmentWithCheckout>> = combine(
        allEquipmentFlow,
        activeCheckoutsFlow,
        _uiState
    ) { equipment, checkouts, state ->
        val checkoutMap = checkouts.associateBy { it.equipmentId }

        equipment
            .map { item ->
                val checkout = checkoutMap[item.id]
                val member = if (checkout != null) {
                    memberDao.getByInternalId(checkout.internalMemberId)
                } else null
                EquipmentWithCheckout(
                    equipment = item,
                    currentCheckout = checkout,
                    currentMember = member
                )
            }
            .filter { item ->
                when (state.statusFilter) {
                    EquipmentStatusFilter.All -> true
                    EquipmentStatusFilter.Available -> item.equipment.status == EquipmentStatus.Available
                    EquipmentStatusFilter.ActiveCheckouts -> item.equipment.status == EquipmentStatus.CheckedOut
                    EquipmentStatusFilter.CheckedOut -> item.equipment.status == EquipmentStatus.CheckedOut
                }
            }
            .filter { item ->
                if (state.searchQuery.isBlank()) {
                    true
                } else {
                    val query = state.searchQuery.lowercase()
                    item.equipment.serialNumber.lowercase().contains(query) ||
                        item.equipment.description?.lowercase()?.contains(query) == true ||
                        item.currentMember?.let { m ->
                            "${m.firstName} ${m.lastName}".lowercase().contains(query)
                        } == true
                }
            }
            .let { list ->
                if (state.statusFilter == EquipmentStatusFilter.ActiveCheckouts) {
                    list.sortedByDescending { it.currentCheckout?.checkedOutAtUtc }
                } else {
                    list.sortedBy { it.equipment.serialNumber }
                }
            }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // ===== Member Search for Checkout =====

    private val _memberSearchResults = MutableStateFlow<List<Member>>(emptyList())
    val memberSearchResults: StateFlow<List<Member>> = _memberSearchResults.asStateFlow()

    // ===== Recent Members =====

    private val _recentMembers = MutableStateFlow<List<Member>>(emptyList())
    val recentMembers: StateFlow<List<Member>> = _recentMembers.asStateFlow()

    init {
        loadRecentMembers()
    }

    /**
     * Loads recently-used members from recent checkout history.
     */
    private fun loadRecentMembers() {
        viewModelScope.launch {
            try {
                val recentCheckouts = equipmentCheckoutDao.allActiveCheckouts() +
                    equipmentCheckoutDao.recentCheckouts(limit = 20)
                val seenIds = mutableSetOf<String>()
                val members = mutableListOf<Member>()
                for (checkout in recentCheckouts.sortedByDescending { it.checkedOutAtUtc }) {
                    if (checkout.internalMemberId in seenIds) continue
                    seenIds.add(checkout.internalMemberId)
                    memberDao.getByInternalId(checkout.internalMemberId)?.let { members.add(it) }
                    if (members.size >= MAX_RECENT_MEMBERS) break
                }
                _recentMembers.value = members
            } catch (e: Exception) {
                Log.w(TAG, "Failed to load recent members", e)
            }
        }
    }

    /**
     * Adds a member to the top of the recent members list.
     */
    private fun addToRecentMembers(member: Member) {
        val current = _recentMembers.value.toMutableList()
        current.removeAll { it.internalId == member.internalId }
        current.add(0, member)
        _recentMembers.value = current.take(MAX_RECENT_MEMBERS)
    }

    // ===== Filter and Search =====

    fun setStatusFilter(filter: EquipmentStatusFilter) {
        _uiState.value = _uiState.value.copy(statusFilter = filter)
    }

    fun setSearchQuery(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
    }

    // ===== Quick Checkout from List =====

    /**
     * Opens the member search dialog for quick checkout of the given equipment.
     */
    fun startQuickCheckout(equipmentId: String) {
        _uiState.value = _uiState.value.copy(quickCheckoutEquipmentId = equipmentId)
    }

    /**
     * Cancels a pending quick checkout.
     */
    fun cancelQuickCheckout() {
        _uiState.value = _uiState.value.copy(quickCheckoutEquipmentId = null)
    }

    // ===== Equipment CRUD =====

    fun createEquipment(
        serialNumber: String,
        description: String? = null,
        discipline: PracticeType? = null
    ) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            try {
                val existing = equipmentItemDao.getBySerialNumber(serialNumber)
                if (existing != null) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Udstyr med serienummer '$serialNumber' findes allerede"
                    )
                    return@launch
                }

                val deviceId = trustManager.getThisDeviceId()
                val now = Clock.System.now()

                val item = EquipmentItem(
                    id = UUID.randomUUID().toString(),
                    serialNumber = serialNumber.trim(),
                    type = EquipmentType.TrainingMaterial,
                    description = description?.trim()?.take(200)?.ifEmpty { null },
                    status = EquipmentStatus.Available,
                    discipline = discipline,
                    createdByDeviceId = deviceId,
                    createdAtUtc = now,
                    modifiedAtUtc = now,
                    deviceId = deviceId
                )

                equipmentItemDao.insert(item)
                Log.i(TAG, "Created equipment: $serialNumber")

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    successMessage = "Udstyr '$serialNumber' oprettet"
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to create equipment", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Kunne ikke oprette udstyr: ${e.message}"
                )
            }
        }
    }

    // ===== Equipment Selection and Detail =====

    fun selectEquipment(equipmentId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            try {
                val equipment = equipmentItemDao.get(equipmentId)
                if (equipment == null) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Udstyr ikke fundet"
                    )
                    return@launch
                }

                val currentCheckout = equipmentCheckoutDao.getActiveCheckoutForEquipment(equipmentId)
                val currentMember = currentCheckout?.let { checkout ->
                    memberDao.getByInternalId(checkout.internalMemberId)
                }

                val history = equipmentCheckoutDao.checkoutHistoryForEquipment(equipmentId)
                val historyWithMembers = history.map { checkout ->
                    CheckoutHistoryItem(
                        checkout = checkout,
                        member = memberDao.getByInternalId(checkout.internalMemberId)
                    )
                }

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    selectedEquipment = equipment,
                    selectedEquipmentCheckout = currentCheckout,
                    selectedEquipmentMember = currentMember,
                    checkoutHistory = historyWithMembers
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load equipment details", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Kunne ikke hente udstyr: ${e.message}"
                )
            }
        }
    }

    fun clearSelection() {
        _uiState.value = _uiState.value.copy(
            selectedEquipment = null,
            selectedEquipmentCheckout = null,
            selectedEquipmentMember = null,
            checkoutHistory = emptyList()
        )
    }

    // ===== Checkout/Checkin =====

    fun checkoutEquipment(
        equipmentId: String,
        member: Member,
        notes: String? = null
    ) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            try {
                val equipment = equipmentItemDao.get(equipmentId)
                if (equipment == null) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Udstyr ikke fundet"
                    )
                    return@launch
                }

                if (equipment.status != EquipmentStatus.Available) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Udstyr er ikke tilgængeligt (status: ${equipment.status})"
                    )
                    return@launch
                }

                val deviceId = trustManager.getThisDeviceId()
                val now = Clock.System.now()
                val trainerId = trainerSessionManager.currentTrainerId

                val checkout = EquipmentCheckout(
                    id = UUID.randomUUID().toString(),
                    equipmentId = equipmentId,
                    internalMemberId = member.internalId,
                    membershipId = member.membershipId,
                    checkedOutAtUtc = now,
                    checkedOutByDeviceId = deviceId,
                    checkoutNotes = buildCheckoutNotes(notes, trainerId),
                    createdAtUtc = now,
                    modifiedAtUtc = now,
                    deviceId = deviceId
                )

                equipmentItemDao.updateStatus(equipmentId, EquipmentStatus.CheckedOut, now)
                equipmentCheckoutDao.insert(checkout)

                Log.i(TAG, "Checked out ${equipment.serialNumber} to ${member.firstName} ${member.lastName}")

                addToRecentMembers(member)

                val memberName = "${member.firstName} ${member.lastName}".trim()
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    successMessage = "${equipment.serialNumber} udlånt til $memberName",
                    selectedEquipmentCheckout = checkout,
                    selectedEquipmentMember = member,
                    quickCheckoutEquipmentId = null
                )

                // Refresh selection if on detail screen
                if (_uiState.value.selectedEquipment?.id == equipmentId) {
                    selectEquipment(equipmentId)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to checkout equipment", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Kunne ikke udlåne udstyr: ${e.message}"
                )
            }
        }
    }

    /**
     * Quick check-in from the list screen by equipment ID.
     */
    fun quickCheckin(equipmentId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            try {
                val checkout = equipmentCheckoutDao.getActiveCheckoutForEquipment(equipmentId)
                if (checkout == null) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Intet aktivt udlån fundet"
                    )
                    return@launch
                }

                val equipment = equipmentItemDao.get(equipmentId)
                val member = memberDao.getByInternalId(checkout.internalMemberId)
                val deviceId = trustManager.getThisDeviceId()
                val now = Clock.System.now()
                val trainerId = trainerSessionManager.currentTrainerId

                equipmentCheckoutDao.checkIn(
                    id = checkout.id,
                    checkedInAt = now,
                    deviceId = deviceId,
                    notes = buildCheckoutNotes(null, trainerId),
                    modifiedAt = now
                )

                equipmentItemDao.updateStatus(equipmentId, EquipmentStatus.Available, now)

                val memberName = member?.let { "${it.firstName} ${it.lastName}".trim() } ?: "ukendt"
                val serial = equipment?.serialNumber ?: equipmentId.take(8)
                Log.i(TAG, "Quick checked in $serial from $memberName")

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    successMessage = "$serial returneret fra $memberName"
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to quick checkin", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Kunne ikke returnere udstyr: ${e.message}"
                )
            }
        }
    }

    /**
     * Checks in (returns) equipment by checkout ID (used from detail screen).
     */
    fun checkinEquipment(checkoutId: String, notes: String? = null) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            try {
                val checkout = equipmentCheckoutDao.get(checkoutId)
                if (checkout == null) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Udlån ikke fundet"
                    )
                    return@launch
                }

                if (checkout.checkedInAtUtc != null) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Udstyr er allerede returneret"
                    )
                    return@launch
                }

                val deviceId = trustManager.getThisDeviceId()
                val now = Clock.System.now()
                val trainerId = trainerSessionManager.currentTrainerId

                equipmentCheckoutDao.checkIn(
                    id = checkoutId,
                    checkedInAt = now,
                    deviceId = deviceId,
                    notes = buildCheckoutNotes(notes, trainerId),
                    modifiedAt = now
                )

                equipmentItemDao.updateStatus(checkout.equipmentId, EquipmentStatus.Available, now)

                Log.i(TAG, "Checked in equipment from checkout $checkoutId")

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    successMessage = "Udstyr returneret",
                    selectedEquipmentCheckout = null,
                    selectedEquipmentMember = null
                )

                selectEquipment(checkout.equipmentId)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to checkin equipment", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Kunne ikke returnere udstyr: ${e.message}"
                )
            }
        }
    }

    /**
     * Returns all currently checked-out equipment in one batch operation.
     */
    fun batchCheckinAll() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            try {
                val activeCheckouts = equipmentCheckoutDao.allActiveCheckouts()
                if (activeCheckouts.isEmpty()) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Ingen aktive udlån at returnere"
                    )
                    return@launch
                }

                val deviceId = trustManager.getThisDeviceId()
                val now = Clock.System.now()
                val trainerId = trainerSessionManager.currentTrainerId
                val notes = buildCheckoutNotes(null, trainerId)

                var count = 0
                for (checkout in activeCheckouts) {
                    equipmentCheckoutDao.checkIn(
                        id = checkout.id,
                        checkedInAt = now,
                        deviceId = deviceId,
                        notes = notes,
                        modifiedAt = now
                    )
                    equipmentItemDao.updateStatus(checkout.equipmentId, EquipmentStatus.Available, now)
                    count++
                }

                Log.i(TAG, "Batch checked in $count items")

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    successMessage = "$count udlån returneret"
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to batch checkin", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Kunne ikke returnere alt udstyr: ${e.message}"
                )
            }
        }
    }

    private fun buildCheckoutNotes(userNotes: String?, trainerId: String?): String? {
        val parts = mutableListOf<String>()
        userNotes?.trim()?.takeIf { it.isNotEmpty() }?.let { parts.add(it) }
        trainerId?.let { parts.add("[Træner: $it]") }
        return parts.joinToString(" ").takeIf { it.isNotEmpty() }?.take(500)
    }

    // ===== Member Search =====

    fun searchMembers(query: String) {
        viewModelScope.launch {
            if (query.isBlank()) {
                _memberSearchResults.value = emptyList()
                return@launch
            }

            try {
                val results = memberDao.searchByNameOrId(query)
                _memberSearchResults.value = results
            } catch (e: Exception) {
                Log.e(TAG, "Failed to search members", e)
                _memberSearchResults.value = emptyList()
            }
        }
    }

    fun clearMemberSearch() {
        _memberSearchResults.value = emptyList()
    }

    // ===== UI State Management =====

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    fun clearSuccessMessage() {
        _uiState.value = _uiState.value.copy(successMessage = null)
    }
}
