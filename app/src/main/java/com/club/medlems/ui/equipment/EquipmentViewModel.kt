package com.club.medlems.ui.equipment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.entity.ConflictStatus
import com.club.medlems.data.entity.EquipmentCheckout
import com.club.medlems.data.entity.EquipmentItem
import com.club.medlems.data.entity.EquipmentStatus
import com.club.medlems.data.entity.EquipmentType
import com.club.medlems.data.entity.Member
import com.club.medlems.data.repository.EquipmentRepository
import com.club.medlems.data.repository.MemberRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
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
    private val memberRepository: MemberRepository
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
                    val member = memberRepository.getMemberByMembershipId(checkout.membershipId)
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
                        successMessage = "Equipment '$serialNumber' added"
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message ?: "Failed to create equipment"
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
            equipmentRepository.setMaintenance(equipmentId)
        }
    }
    
    /**
     * Retires equipment.
     */
    fun retireEquipment(equipmentId: String) {
        viewModelScope.launch {
            equipmentRepository.retireEquipment(equipmentId)
        }
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
                        successMessage = "Equipment checked out successfully"
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message ?: "Failed to checkout equipment"
                    )
                }
            )
        }
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
                        successMessage = "Equipment returned successfully"
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message ?: "Failed to return equipment"
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
