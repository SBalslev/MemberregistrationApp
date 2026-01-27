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
    val searchQuery: String = ""
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
    }

    // ===== UI State =====

    private val _uiState = MutableStateFlow(EquipmentManagementState())
    val uiState: StateFlow<EquipmentManagementState> = _uiState.asStateFlow()

    // ===== Equipment List with Status =====

    private val allEquipmentFlow = equipmentItemDao.allItemsFlow()
    private val activeCheckoutsFlow = equipmentCheckoutDao.allActiveCheckoutsFlow()

    /**
     * Equipment list combined with checkout info, filtered by status and search query.
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
                EquipmentWithCheckout(
                    equipment = item,
                    currentCheckout = checkout,
                    currentMember = null // Loaded on demand for performance
                )
            }
            .filter { item ->
                // Apply status filter
                when (state.statusFilter) {
                    EquipmentStatusFilter.All -> true
                    EquipmentStatusFilter.Available -> item.equipment.status == EquipmentStatus.Available
                    EquipmentStatusFilter.CheckedOut -> item.equipment.status == EquipmentStatus.CheckedOut
                }
            }
            .filter { item ->
                // Apply search filter
                if (state.searchQuery.isBlank()) {
                    true
                } else {
                    val query = state.searchQuery.lowercase()
                    item.equipment.serialNumber.lowercase().contains(query) ||
                        item.equipment.description?.lowercase()?.contains(query) == true
                }
            }
            .sortedBy { it.equipment.serialNumber }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // ===== Member Search for Checkout =====

    private val _memberSearchResults = MutableStateFlow<List<Member>>(emptyList())
    val memberSearchResults: StateFlow<List<Member>> = _memberSearchResults.asStateFlow()

    // ===== Filter and Search =====

    /**
     * Sets the status filter for the equipment list.
     */
    fun setStatusFilter(filter: EquipmentStatusFilter) {
        _uiState.value = _uiState.value.copy(statusFilter = filter)
    }

    /**
     * Updates the search query for equipment filtering.
     */
    fun setSearchQuery(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
    }

    // ===== Equipment CRUD =====

    /**
     * Creates a new equipment item.
     *
     * @param serialNumber Human-readable serial number (must be unique)
     * @param description Optional description
     * @param discipline Optional discipline association
     */
    fun createEquipment(
        serialNumber: String,
        description: String? = null,
        discipline: PracticeType? = null
    ) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            try {
                // Check for duplicate serial number
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

    /**
     * Selects an equipment item for viewing details.
     */
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

                // Load current checkout and member info if checked out
                val currentCheckout = equipmentCheckoutDao.getActiveCheckoutForEquipment(equipmentId)
                val currentMember = currentCheckout?.let { checkout ->
                    memberDao.getByInternalId(checkout.internalMemberId)
                }

                // Load checkout history
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

    /**
     * Clears the selected equipment.
     */
    fun clearSelection() {
        _uiState.value = _uiState.value.copy(
            selectedEquipment = null,
            selectedEquipmentCheckout = null,
            selectedEquipmentMember = null,
            checkoutHistory = emptyList()
        )
    }

    // ===== Checkout/Checkin =====

    /**
     * Checks out equipment to a member.
     *
     * @param equipmentId The equipment to check out
     * @param member The member receiving the equipment
     * @param notes Optional checkout notes
     */
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

                // Check if member already has equipment checked out
                val existingCheckout = equipmentCheckoutDao.getActiveCheckoutForMember(member.internalId)
                if (existingCheckout != null) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Medlem har allerede udstyr udlånt"
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

                // Update equipment status
                equipmentItemDao.updateStatus(equipmentId, EquipmentStatus.CheckedOut, now)

                // Create checkout record
                equipmentCheckoutDao.insert(checkout)

                Log.i(TAG, "Checked out ${equipment.serialNumber} to ${member.firstName} ${member.lastName}")

                val memberName = "${member.firstName} ${member.lastName}".trim()
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    successMessage = "Udlånt til $memberName",
                    selectedEquipmentCheckout = checkout,
                    selectedEquipmentMember = member
                )

                // Refresh selection to update history
                selectEquipment(equipmentId)
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
     * Checks in (returns) equipment.
     *
     * @param checkoutId The checkout record ID
     * @param notes Optional return notes
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

                // Update checkout record
                equipmentCheckoutDao.checkIn(
                    id = checkoutId,
                    checkedInAt = now,
                    deviceId = deviceId,
                    notes = buildCheckoutNotes(notes, trainerId),
                    modifiedAt = now
                )

                // Update equipment status back to available
                equipmentItemDao.updateStatus(checkout.equipmentId, EquipmentStatus.Available, now)

                Log.i(TAG, "Checked in equipment from checkout $checkoutId")

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    successMessage = "Udstyr returneret",
                    selectedEquipmentCheckout = null,
                    selectedEquipmentMember = null
                )

                // Refresh selection to update history
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
     * Builds checkout notes with trainer audit info.
     */
    private fun buildCheckoutNotes(userNotes: String?, trainerId: String?): String? {
        val parts = mutableListOf<String>()
        userNotes?.trim()?.takeIf { it.isNotEmpty() }?.let { parts.add(it) }
        trainerId?.let { parts.add("[Træner: $it]") }
        return parts.joinToString(" ").takeIf { it.isNotEmpty() }?.take(500)
    }

    // ===== Member Search =====

    /**
     * Searches for members by name or membership ID.
     */
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

    /**
     * Clears member search results.
     */
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
