package com.club.medlems.ui.equipment

import android.util.Base64
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.entity.ConflictStatus
import com.club.medlems.data.entity.EquipmentCheckout
import com.club.medlems.data.entity.EquipmentItem
import com.club.medlems.data.entity.EquipmentStatus
import com.club.medlems.data.entity.EquipmentType
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberType
import com.club.medlems.data.repository.EquipmentRepository
import com.club.medlems.data.repository.MemberRepository
import com.club.medlems.data.sync.OutboxOperation
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.data.sync.SyncOutboxManager
import com.club.medlems.domain.QrParser
import com.club.medlems.network.TrustManager
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import javax.inject.Inject

/**
 * ViewModel for equipment management screens.
 * 
 * Provides:
 * - Equipment inventory management
 * - Checkout/checkin workflows
 * - Conflict resolution
 * 
 * @see [design.md FR-5] - Equipment Management
 */
@HiltViewModel
class EquipmentViewModel @Inject constructor(
    private val equipmentRepository: EquipmentRepository,
    private val memberRepository: MemberRepository,
    private val memberDao: MemberDao,
    private val syncOutboxManager: SyncOutboxManager,
    private val syncManager: SyncManager,
    private val trustManager: TrustManager
) : ViewModel() {
    
    // ===== Equipment Inventory =====
    
    val allEquipment: StateFlow<List<EquipmentItem>> = equipmentRepository.getAllEquipmentFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    
    val availableEquipment: StateFlow<List<EquipmentItem>> = equipmentRepository.getAvailableEquipmentFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    
    // ===== Active Checkouts =====
    
    val activeCheckouts: StateFlow<List<EquipmentCheckout>> = equipmentRepository.getActiveCheckoutsFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    
    // ===== Conflicts =====
    
    val pendingConflicts: StateFlow<List<EquipmentCheckout>> = equipmentRepository.getPendingConflictsFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    
    // ===== UI State =====
    
    private val _uiState = MutableStateFlow(EquipmentUiState())
    val uiState: StateFlow<EquipmentUiState> = _uiState.asStateFlow()
    
    // Combined state for checkout screen - equipment with member info
    private val _checkoutDetails = MutableStateFlow<List<CheckoutWithDetails>>(emptyList())
    val checkoutDetails: StateFlow<List<CheckoutWithDetails>> = _checkoutDetails.asStateFlow()
    
    init {
        // Combine active checkouts with member information
        viewModelScope.launch {
            activeCheckouts.collect { checkouts ->
                val details = checkouts.mapNotNull { checkout ->
                    val equipment = equipmentRepository.getEquipmentById(checkout.equipmentId)
                    // Use internalMemberId for lookup (primary FK)
                    val member = memberRepository.getMemberByInternalId(checkout.internalMemberId)
                    if (equipment != null && member != null) {
                        CheckoutWithDetails(checkout, equipment, member)
                    } else null
                }
                _checkoutDetails.value = details
            }
        }
    }
    
    // ===== Equipment CRUD Operations =====
    
    /**
     * Creates a new equipment item.
     */
    fun createEquipment(
        serialNumber: String,
        type: EquipmentType = EquipmentType.TrainingMaterial,
        description: String? = null
    ) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            
            val result = equipmentRepository.createEquipmentItem(serialNumber, type, description)
            
            result.fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        successMessage = "Udstyr '$serialNumber' tilf\u00f8jet"
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message ?: "Kunne ikke oprette udstyr"
                    )
                }
            )
        }
    }
    
    /**
     * Updates an existing equipment item's details.
     */
    fun updateEquipment(
        item: EquipmentItem,
        serialNumber: String,
        type: EquipmentType,
        description: String?
    ) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            
            val updatedItem = item.copy(
                serialNumber = serialNumber.trim(),
                type = type,
                description = description?.take(200)
            )
            val result = equipmentRepository.updateEquipmentItem(updatedItem)
            
            result.fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        successMessage = "Udstyr '$serialNumber' opdateret"
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message ?: "Kunne ikke opdatere udstyr"
                    )
                }
            )
        }
    }
    
    /**
     * Sets equipment to maintenance status.
     */
    fun setMaintenance(equipmentId: String) {
        viewModelScope.launch {
            updateEquipmentStatus(
                result = equipmentRepository.setMaintenance(equipmentId),
                successMessage = "Udstyr sendt til vedligeholdelse"
            )
        }
    }

    /**
     * Returns equipment to active service.
     */
    fun setAvailable(equipmentId: String) {
        viewModelScope.launch {
            updateEquipmentStatus(
                result = equipmentRepository.setAvailable(equipmentId),
                successMessage = "Udstyr sat tilbage i drift"
            )
        }
    }
    
    /**
     * Retires equipment.
     */
    fun retireEquipment(equipmentId: String) {
        viewModelScope.launch {
            updateEquipmentStatus(
                result = equipmentRepository.retireEquipment(equipmentId),
                successMessage = "Udstyr pensioneret"
            )
        }
    }

    private fun updateEquipmentStatus(result: Result<Unit>, successMessage: String) {
        result.fold(
            onSuccess = {
                _uiState.value = _uiState.value.copy(successMessage = successMessage, error = null)
            },
            onFailure = { error ->
                _uiState.value = _uiState.value.copy(
                    error = error.message ?: "Kunne ikke ændre udstyrets status"
                )
            }
        )
    }
    
    // ===== Checkout/Checkin Operations =====
    
    /**
     * Checks out equipment to a member.
     */
    fun checkoutEquipment(
        equipmentId: String,
        membershipId: String,
        notes: String? = null
    ) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            
            val result = equipmentRepository.checkoutEquipment(equipmentId, membershipId, notes)
            
            result.fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        successMessage = "Udstyr udl\u00e5nt"
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message ?: "Kunne ikke udl\u00e5ne udstyr"
                    )
                }
            )
        }
    }

    /**
     * Checks out equipment to a known member object.
     *
     * If the selected member is TRIAL and does not yet have an ID photo on record,
     * the checkout is paused and the UI is asked to capture ID photo first.
     */
    fun checkoutEquipmentForMember(
        equipmentId: String,
        member: Member,
        notes: String? = null
    ) {
        if (member.memberType == MemberType.TRIAL && member.idPhotoPath.isNullOrBlank()) {
            _trialIdCaptureContext.value = TrialIdCaptureContext(
                equipmentId = equipmentId,
                member = member,
                notes = notes
            )
            _uiState.value = _uiState.value.copy(
                error = "Prøvemedlem mangler ID-billede. Tag ID-billede før udlån."
            )
            return
        }

        checkoutEquipment(
            equipmentId = equipmentId,
            membershipId = member.membershipId ?: member.internalId,
            notes = notes
        )
    }
    
    /**
     * Checks in (returns) equipment.
     */
    fun checkinEquipment(checkoutId: String, notes: String? = null) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            
            val result = equipmentRepository.checkinEquipment(checkoutId, notes)
            
            result.fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        successMessage = "Udstyr returneret"
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message ?: "Kunne ikke returnere udstyr"
                    )
                }
            )
        }
    }
    
    // ===== Conflict Resolution =====
    
    /**
     * Resolves a conflict by keeping the checkout (marks as Resolved).
     */
    fun resolveConflictKeep(checkoutId: String, notes: String? = null) {
        viewModelScope.launch {
            equipmentRepository.resolveConflict(checkoutId, ConflictStatus.Resolved, notes)
        }
    }
    
    /**
     * Resolves a conflict by cancelling the checkout.
     */
    fun resolveConflictCancel(checkoutId: String, notes: String? = null) {
        viewModelScope.launch {
            equipmentRepository.resolveConflict(checkoutId, ConflictStatus.Cancelled, notes)
        }
    }

    // ===== QR Scan: Checkout Flow (scan equipment, then scan/select member) =====

    private val _scannedEquipment = MutableStateFlow<EquipmentItem?>(null)
    val scannedEquipment: StateFlow<EquipmentItem?> = _scannedEquipment.asStateFlow()

    /**
     * Handles a scanned equipment QR code during the checkout flow.
     * Looks up the equipment and, if available, stages it for member selection.
     * Any other status (checked out, maintenance, retired, or unrecognized code)
     * surfaces an error so the trainer can fall back to manual selection.
     */
    fun onEquipmentQrScanned(raw: String) {
        val equipmentId = QrParser.extractEquipmentId(raw)
        if (equipmentId == null) {
            _uiState.value = _uiState.value.copy(error = "Ugyldigt QR-udstyrskort")
            return
        }
        viewModelScope.launch {
            val equipment = equipmentRepository.getEquipmentById(equipmentId)
            when {
                equipment == null -> _uiState.value = _uiState.value.copy(error = "Udstyr ikke fundet")
                equipment.status != EquipmentStatus.Available -> _uiState.value = _uiState.value.copy(
                    error = "Udstyr er ikke tilg\u00e6ngeligt (status: ${equipment.status})"
                )
                else -> _scannedEquipment.value = equipment
            }
        }
    }

    /** Clears the equipment staged via QR scan for checkout (e.g. user cancels or switches to manual pick). */
    fun clearScannedEquipment() {
        _scannedEquipment.value = null
    }

    /**
     * Handles a scanned member QR code during the checkout flow, resolving it to
     * a [Member] for confirmation. Falls back with an error if not found so the
     * trainer can use manual member search instead.
     */
    fun onMemberQrScanned(raw: String, onResolved: (Member) -> Unit) {
        val memberId = QrParser.extractMemberId(raw)
        if (memberId == null) {
            _uiState.value = _uiState.value.copy(error = "Ugyldigt QR-medlemskort")
            return
        }
        viewModelScope.launch {
            val member = memberRepository.getMemberByAnyId(memberId)
            if (member == null) {
                _uiState.value = _uiState.value.copy(error = "Medlem ikke fundet")
            } else {
                onResolved(member)
            }
        }
    }

    // ===== QR Scan: Check-in Flow (scan equipment only) =====

    /**
     * Handles a scanned equipment QR code during the check-in flow: resolves the
     * active checkout for that equipment and checks it in immediately.
     * Falls back with an error (e.g. equipment not currently checked out, or the
     * code is unrecognized) so the trainer can use the manual list instead.
     */
    fun checkinByEquipmentQr(raw: String) {
        val equipmentId = QrParser.extractEquipmentId(raw)
        if (equipmentId == null) {
            _uiState.value = _uiState.value.copy(error = "Ugyldigt QR-udstyrskort")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            val equipment = equipmentRepository.getEquipmentById(equipmentId)
            if (equipment == null) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = "Udstyr ikke fundet")
                return@launch
            }
            val checkout = equipmentRepository.getActiveCheckoutForEquipment(equipmentId)
            if (checkout == null) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "${equipment.serialNumber} er ikke udl\u00e5nt"
                )
                return@launch
            }
            val member = memberRepository.getMemberByInternalId(checkout.internalMemberId)
            val memberName = member?.let { "${it.firstName} ${it.lastName}".trim() } ?: "ukendt medlem"

            val result = equipmentRepository.checkinEquipment(checkout.id)
            result.fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        successMessage = "${equipment.serialNumber} returneret fra $memberName"
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message ?: "Kunne ikke returnere udstyr"
                    )
                }
            )
        }
    }

    // ===== Trial member ID photo capture during checkout =====

    private val _trialIdCaptureContext = MutableStateFlow<TrialIdCaptureContext?>(null)
    val trialIdCaptureContext: StateFlow<TrialIdCaptureContext?> = _trialIdCaptureContext.asStateFlow()

    fun cancelTrialIdCapture() {
        _trialIdCaptureContext.value = null
    }

    /**
     * Completes the pending trial checkout by persisting captured ID photo,
     * syncing the member update, then performing the original checkout.
     */
    fun completeTrialIdCapture(photoPath: String) {
        val pending = _trialIdCaptureContext.value ?: run {
            _uiState.value = _uiState.value.copy(error = "Ingen afventende udlån med ID-foto")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val now = Clock.System.now()
                val updatedMember = pending.member.copy(
                    idPhotoPath = photoPath,
                    updatedAtUtc = now
                )

                withContext(Dispatchers.IO) {
                    memberDao.upsert(updatedMember)

                    val profilePhotoBase64 = try {
                        pending.member.registrationPhotoPath?.let { path ->
                            val photoFile = File(path)
                            if (photoFile.exists()) Base64.encodeToString(photoFile.readBytes(), Base64.NO_WRAP) else null
                        }
                    } catch (_: Exception) {
                        null
                    }

                    val idPhotoBase64 = try {
                        val idPhotoFile = File(photoPath)
                        if (idPhotoFile.exists()) Base64.encodeToString(idPhotoFile.readBytes(), Base64.NO_WRAP) else null
                    } catch (_: Exception) {
                        null
                    }

                    syncOutboxManager.queueMember(
                        updatedMember,
                        trustManager.getThisDeviceId(),
                        OutboxOperation.UPDATE,
                        photoBase64 = profilePhotoBase64,
                        idPhotoBase64 = idPhotoBase64
                    )
                    syncManager.notifyEntityChanged("Member", updatedMember.internalId)
                }

                _trialIdCaptureContext.value = null

                val result = equipmentRepository.checkoutEquipment(
                    equipmentId = pending.equipmentId,
                    membershipId = updatedMember.membershipId ?: updatedMember.internalId,
                    notes = pending.notes
                )
                result.fold(
                    onSuccess = {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            successMessage = "ID-billede gemt. Udstyr udlånt."
                        )
                    },
                    onFailure = { error ->
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            error = error.message ?: "Kunne ikke udlåne udstyr"
                        )
                    }
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Kunne ikke gemme ID-billede: ${e.message}"
                )
            }
        }
    }

    // ===== Member Search for Checkout =====
    
    private val _memberSearchResults = MutableStateFlow<List<Member>>(emptyList())
    val memberSearchResults: StateFlow<List<Member>> = _memberSearchResults.asStateFlow()
    
    private val _preselectedMember = MutableStateFlow<Member?>(null)
    val preselectedMember: StateFlow<Member?> = _preselectedMember.asStateFlow()
    
    /**
     * Pre-loads a member by their membership ID for pre-selection in checkout.
     */
    fun preloadMember(membershipId: String) {
        viewModelScope.launch {
            val member = memberRepository.getMemberByMembershipId(membershipId)
            _preselectedMember.value = member
        }
    }
    
    /**
     * Clears the preselected member.
     */
    fun clearPreselectedMember() {
        _preselectedMember.value = null
    }
    
    /**
     * Searches for members by membership ID or name.
     */
    fun searchMembers(query: String) {
        viewModelScope.launch {
            if (query.isBlank()) {
                _memberSearchResults.value = emptyList()
                return@launch
            }
            
            // Try exact membership ID match first
            val exactMatch = memberRepository.getMemberByMembershipId(query)
            if (exactMatch != null) {
                _memberSearchResults.value = listOf(exactMatch)
                return@launch
            }
            
            // Otherwise search by name
            val results = memberRepository.searchMembersByName(query)
            _memberSearchResults.value = results
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

/**
 * UI state for equipment screens.
 */
data class EquipmentUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null
)

/**
 * Combined checkout information with equipment and member details.
 */
data class CheckoutWithDetails(
    val checkout: EquipmentCheckout,
    val equipment: EquipmentItem,
    val member: Member
)

data class TrialIdCaptureContext(
    val equipmentId: String,
    val member: Member,
    val notes: String?
)
