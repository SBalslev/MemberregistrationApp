package com.club.medlems.ui.display

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.dao.EquipmentCheckoutDao
import com.club.medlems.data.dao.EquipmentItemDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.entity.EquipmentItem
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.data.sync.SyncState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import javax.inject.Inject

/**
 * ViewModel for the Equipment Display screen.
 * Provides equipment status data with checkout information.
 * 
 * @see [design.md FR-1.5] - Equipment Display Tablet
 * @see [design.md FR-20] - Display Tablet Details
 */
@HiltViewModel
class EquipmentDisplayViewModel @Inject constructor(
    private val equipmentItemDao: EquipmentItemDao,
    private val equipmentCheckoutDao: EquipmentCheckoutDao,
    private val memberDao: MemberDao,
    private val syncManager: SyncManager
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(EquipmentDisplayUiState())
    val uiState: StateFlow<EquipmentDisplayUiState> = _uiState.asStateFlow()
    
    init {
        loadEquipment()
        observeSyncState()
    }
    
    /**
     * Loads equipment with checkout information.
     */
    private fun loadEquipment() {
        viewModelScope.launch {
            combine(
                equipmentItemDao.allItemsFlow(),
                equipmentCheckoutDao.allActiveCheckoutsFlow()
            ) { equipment, checkouts ->
                equipment.map { item ->
                    val checkout = checkouts.find { c -> c.equipmentId == item.id }
                    val memberName = checkout?.let { co -> 
                        memberDao.get(co.internalMemberId ?: co.membershipId ?: "")?.let { m ->
                            "${m.firstName} ${m.lastName}"
                        }
                    }
                    
                    EquipmentDisplayItem(
                        id = item.id,
                        name = item.serialNumber,
                        category = item.type.name,
                        checkoutInfo = checkout?.let { co ->
                            CheckoutDisplayInfo(
                                memberName = memberName ?: "Ukendt medlem",
                                checkoutTimeFormatted = formatCheckoutTime(co.checkedOutAtUtc)
                            )
                        }
                    )
                }
            }.collectLatest { items ->
                _uiState.value = _uiState.value.copy(
                    equipment = items,
                    lastSyncTime = Clock.System.now()
                )
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
     * Manually triggers a refresh of equipment data.
     */
    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(lastSyncTime = Clock.System.now())
        }
    }
    
    /**
     * Formats checkout time as relative time string.
     */
    private fun formatCheckoutTime(time: Instant): String {
        val local = time.toLocalDateTime(TimeZone.currentSystemDefault())
        return "%02d:%02d".format(local.hour, local.minute)
    }
}

/**
 * UI state for Equipment Display screen.
 */
data class EquipmentDisplayUiState(
    val equipment: List<EquipmentDisplayItem> = emptyList(),
    val isOnline: Boolean = true,
    val lastSyncTime: Instant? = null
)

/**
 * Display model for a single equipment item.
 */
data class EquipmentDisplayItem(
    val id: String,
    val name: String,
    val category: String,
    val checkoutInfo: CheckoutDisplayInfo? = null
)

/**
 * Display model for checkout information.
 */
data class CheckoutDisplayInfo(
    val memberName: String,
    val checkoutTimeFormatted: String
)
