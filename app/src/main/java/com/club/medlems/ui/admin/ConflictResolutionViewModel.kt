package com.club.medlems.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.sync.ConflictEntityStatus
import com.club.medlems.data.sync.ConflictRepository
import com.club.medlems.data.sync.ConflictResolution
import com.club.medlems.data.sync.SyncConflictEntity
import com.club.medlems.network.TrustManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * UI state for conflict resolution screen.
 */
data class ConflictResolutionState(
    val selectedConflict: SyncConflictEntity? = null,
    val isResolving: Boolean = false,
    val resolveSuccess: String? = null,
    val error: String? = null
)

/**
 * ViewModel for the Conflict Resolution screen.
 * 
 * Allows admin users to:
 * - View all pending sync conflicts
 * - See details of each conflict (local vs remote versions)
 * - Resolve conflicts by choosing which version to keep
 * 
 * @see [design.md FR-19] - Equipment Conflict Resolution UI
 */
@HiltViewModel
class ConflictResolutionViewModel @Inject constructor(
    private val conflictRepository: ConflictRepository,
    private val trustManager: TrustManager
) : ViewModel() {
    
    /** Observable list of pending conflicts */
    val pendingConflicts: StateFlow<List<SyncConflictEntity>> = conflictRepository.observePendingConflicts()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    
    /** Observable count of pending conflicts (for badges) */
    val pendingCount: StateFlow<Int> = conflictRepository.observePendingCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)
    
    private val _uiState = MutableStateFlow(ConflictResolutionState())
    val uiState: StateFlow<ConflictResolutionState> = _uiState.asStateFlow()
    
    /**
     * Selects a conflict to view details.
     */
    fun selectConflict(conflict: SyncConflictEntity) {
        _uiState.value = _uiState.value.copy(
            selectedConflict = conflict,
            error = null,
            resolveSuccess = null
        )
    }
    
    /**
     * Clears the selected conflict.
     */
    fun clearSelection() {
        _uiState.value = _uiState.value.copy(selectedConflict = null)
    }
    
    /**
     * Resolves the selected conflict by keeping the local version.
     */
    fun resolveKeepLocal() {
        resolveConflict(ConflictResolution.KEEP_LOCAL)
    }
    
    /**
     * Resolves the selected conflict by accepting the remote version.
     */
    fun resolveAcceptRemote() {
        resolveConflict(ConflictResolution.ACCEPT_REMOTE)
    }
    
    /**
     * Resolves the selected conflict by keeping both versions.
     * Only valid for certain entity types (CheckIn, PracticeSession).
     */
    fun resolveKeepBoth() {
        resolveConflict(ConflictResolution.KEEP_BOTH)
    }
    
    private fun resolveConflict(resolution: ConflictResolution) {
        val conflict = _uiState.value.selectedConflict ?: return
        
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isResolving = true, error = null)
            
            try {
                conflictRepository.resolveConflict(
                    conflictId = conflict.id,
                    resolution = resolution,
                    resolverDeviceId = trustManager.getThisDeviceId()
                )
                
                _uiState.value = _uiState.value.copy(
                    isResolving = false,
                    selectedConflict = null,
                    resolveSuccess = "Konflikt løst: ${resolutionDisplayName(resolution)}"
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isResolving = false,
                    error = "Kunne ikke løse konflikt: ${e.message}"
                )
            }
        }
    }
    
    /**
     * Clears success/error messages.
     */
    fun clearMessages() {
        _uiState.value = _uiState.value.copy(
            resolveSuccess = null,
            error = null
        )
    }
    
    /**
     * Gets a display-friendly name for conflict type.
     */
    fun conflictTypeDisplayName(type: String): String {
        return when (type) {
            "EQUIPMENT_CHECKOUT" -> "Udstyr udlån"
            "CONCURRENT_MODIFICATION" -> "Samtidig ændring"
            "VERSION_MISMATCH" -> "Versionskonflikt"
            else -> type
        }
    }
    
    /**
     * Gets a display-friendly name for entity type.
     */
    fun entityTypeDisplayName(type: String): String {
        return when (type) {
            "EquipmentCheckout" -> "Udstyr udlån"
            "EquipmentItem" -> "Udstyrsenhed"
            "Member" -> "Medlem"
            "CheckIn" -> "Check-in"
            "PracticeSession" -> "Skydning"
            else -> type
        }
    }
    
    private fun resolutionDisplayName(resolution: ConflictResolution): String {
        return when (resolution) {
            ConflictResolution.KEEP_LOCAL -> "Behold lokal version"
            ConflictResolution.ACCEPT_REMOTE -> "Accepter fjern version"
            ConflictResolution.KEEP_BOTH -> "Behold begge"
            ConflictResolution.MANUAL_RESOLUTION -> "Manuel løsning"
        }
    }
}
