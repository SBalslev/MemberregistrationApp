package com.club.medlems.data.repository

import android.util.Log
import com.club.medlems.data.dao.EquipmentCheckoutDao
import com.club.medlems.data.dao.EquipmentItemDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.entity.ConflictStatus
import com.club.medlems.data.entity.EquipmentCheckout
import com.club.medlems.data.entity.EquipmentItem
import com.club.medlems.data.entity.EquipmentStatus
import com.club.medlems.data.entity.EquipmentType
import com.club.medlems.network.TrustManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for equipment management operations.
 * 
 * Handles:
 * - Equipment CRUD operations
 * - Checkout/checkin workflows
 * - Conflict detection for offline checkouts
 * 
 * @see [design.md FR-5] - Equipment Management
 */
@Singleton
class EquipmentRepository @Inject constructor(
    private val equipmentItemDao: EquipmentItemDao,
    private val equipmentCheckoutDao: EquipmentCheckoutDao,
    private val memberDao: MemberDao,
    private val trustManager: TrustManager
) {
    companion object {
        private const val TAG = "EquipmentRepository"
    }
    
    // ===== Equipment Item Operations =====
    
    /**
     * Creates a new equipment item.
     * 
     * @param serialNumber Human-readable serial number (must be unique)
     * @param type Equipment category
     * @param description Optional description (max 200 chars)
     * @return The created EquipmentItem
     */
    suspend fun createEquipmentItem(
        serialNumber: String,
        type: EquipmentType = EquipmentType.TrainingMaterial,
        description: String? = null
    ): Result<EquipmentItem> = withContext(Dispatchers.IO) {
        try {
            // Check for duplicate serial number
            val existing = equipmentItemDao.getBySerialNumber(serialNumber)
            if (existing != null) {
                return@withContext Result.failure(
                    IllegalArgumentException("Equipment with serial number '$serialNumber' already exists")
                )
            }
            
            val deviceId = trustManager.getThisDeviceId()
            val now = Clock.System.now()
            
            val item = EquipmentItem(
                id = UUID.randomUUID().toString(),
                serialNumber = serialNumber.trim(),
                type = type,
                description = description?.take(200),
                status = EquipmentStatus.Available,
                createdByDeviceId = deviceId,
                createdAtUtc = now,
                modifiedAtUtc = now,
                deviceId = deviceId
            )
            
            equipmentItemDao.insert(item)
            Log.i(TAG, "Created equipment item: $serialNumber")
            Result.success(item)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create equipment item", e)
            Result.failure(e)
        }
    }
    
    /**
     * Updates an equipment item.
     */
    suspend fun updateEquipmentItem(item: EquipmentItem): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val updated = item.copy(modifiedAtUtc = Clock.System.now())
            equipmentItemDao.update(updated)
            Log.i(TAG, "Updated equipment item: ${item.serialNumber}")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update equipment item", e)
            Result.failure(e)
        }
    }
    
    /**
     * Gets all equipment items.
     */
    suspend fun getAllEquipment(): List<EquipmentItem> = withContext(Dispatchers.IO) {
        equipmentItemDao.allItems()
    }
    
    /**
     * Gets all equipment items as a Flow for real-time updates.
     */
    fun getAllEquipmentFlow(): Flow<List<EquipmentItem>> = equipmentItemDao.allItemsFlow()
    
    /**
     * Gets available equipment items.
     */
    suspend fun getAvailableEquipment(): List<EquipmentItem> = withContext(Dispatchers.IO) {
        equipmentItemDao.itemsByStatus(EquipmentStatus.Available)
    }
    
    /**
     * Gets available equipment as a Flow.
     */
    fun getAvailableEquipmentFlow(): Flow<List<EquipmentItem>> = 
        equipmentItemDao.itemsByStatusFlow(EquipmentStatus.Available)
    
    /**
     * Gets an equipment item by ID.
     */
    suspend fun getEquipmentById(id: String): EquipmentItem? = withContext(Dispatchers.IO) {
        equipmentItemDao.get(id)
    }
    
    /**
     * Sets equipment to maintenance status.
     */
    suspend fun setMaintenance(equipmentId: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            equipmentItemDao.updateStatus(equipmentId, EquipmentStatus.Maintenance, Clock.System.now())
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    /**
     * Retires equipment (no longer available).
     */
    suspend fun retireEquipment(equipmentId: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            equipmentItemDao.updateStatus(equipmentId, EquipmentStatus.Retired, Clock.System.now())
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    // ===== Checkout Operations =====
    
    /**
     * Checks out equipment to a member.
     * 
     * @param equipmentId The equipment to check out
     * @param membershipId The member checking out the equipment
     * @param notes Optional notes
     * @return The checkout record, or failure if equipment not available
     */
    suspend fun checkoutEquipment(
        equipmentId: String,
        membershipId: String,
        notes: String? = null
    ): Result<EquipmentCheckout> = withContext(Dispatchers.IO) {
        try {
            // Verify equipment exists and is available
            val equipment = equipmentItemDao.get(equipmentId)
            if (equipment == null) {
                return@withContext Result.failure(
                    IllegalArgumentException("Equipment not found")
                )
            }
            if (equipment.status != EquipmentStatus.Available) {
                return@withContext Result.failure(
                    IllegalStateException("Equipment is not available (status: ${equipment.status})")
                )
            }
            
            // Verify member exists
            val member = memberDao.get(membershipId)
            if (member == null) {
                return@withContext Result.failure(
                    IllegalArgumentException("Member not found: $membershipId")
                )
            }
            
            // Check if member already has equipment checked out (FR-5.4)
            val existingCheckout = equipmentCheckoutDao.getActiveCheckoutForMember(membershipId)
            if (existingCheckout != null) {
                return@withContext Result.failure(
                    IllegalStateException("Member already has equipment checked out")
                )
            }
            
            val deviceId = trustManager.getThisDeviceId()
            val now = Clock.System.now()
            
            val checkout = EquipmentCheckout(
                id = UUID.randomUUID().toString(),
                equipmentId = equipmentId,
                membershipId = membershipId,
                checkedOutAtUtc = now,
                checkedOutByDeviceId = deviceId,
                checkoutNotes = notes?.take(500),
                createdAtUtc = now,
                modifiedAtUtc = now,
                deviceId = deviceId
            )
            
            // Update equipment status
            equipmentItemDao.updateStatus(equipmentId, EquipmentStatus.CheckedOut, now)
            
            // Create checkout record
            equipmentCheckoutDao.insert(checkout)
            
            Log.i(TAG, "Checked out equipment ${equipment.serialNumber} to member $membershipId")
            Result.success(checkout)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to checkout equipment", e)
            Result.failure(e)
        }
    }
    
    /**
     * Checks in (returns) equipment from a member.
     * 
     * @param checkoutId The checkout record ID
     * @param notes Optional notes
     * @return Success or failure
     */
    suspend fun checkinEquipment(
        checkoutId: String,
        notes: String? = null
    ): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val checkout = equipmentCheckoutDao.get(checkoutId)
            if (checkout == null) {
                return@withContext Result.failure(
                    IllegalArgumentException("Checkout record not found")
                )
            }
            if (checkout.checkedInAtUtc != null) {
                return@withContext Result.failure(
                    IllegalStateException("Equipment already checked in")
                )
            }
            
            val deviceId = trustManager.getThisDeviceId()
            val now = Clock.System.now()
            
            // Update checkout record
            equipmentCheckoutDao.checkIn(
                id = checkoutId,
                checkedInAt = now,
                deviceId = deviceId,
                notes = notes?.take(500),
                modifiedAt = now
            )
            
            // Update equipment status back to available
            equipmentItemDao.updateStatus(checkout.equipmentId, EquipmentStatus.Available, now)
            
            Log.i(TAG, "Checked in equipment from checkout $checkoutId")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to checkin equipment", e)
            Result.failure(e)
        }
    }
    
    /**
     * Gets all active (non-returned) checkouts.
     */
    suspend fun getActiveCheckouts(): List<EquipmentCheckout> = withContext(Dispatchers.IO) {
        equipmentCheckoutDao.allActiveCheckouts()
    }
    
    /**
     * Gets active checkouts as a Flow for real-time updates.
     */
    fun getActiveCheckoutsFlow(): Flow<List<EquipmentCheckout>> = 
        equipmentCheckoutDao.allActiveCheckoutsFlow()
    
    /**
     * Gets checkout history for a member.
     */
    suspend fun getCheckoutHistoryForMember(membershipId: String): List<EquipmentCheckout> = 
        withContext(Dispatchers.IO) {
            equipmentCheckoutDao.checkoutHistoryForMember(membershipId)
        }
    
    // ===== Conflict Resolution =====
    
    /**
     * Gets all pending checkout conflicts.
     */
    suspend fun getPendingConflicts(): List<EquipmentCheckout> = withContext(Dispatchers.IO) {
        equipmentCheckoutDao.getPendingConflicts()
    }
    
    /**
     * Gets pending conflicts as a Flow.
     */
    fun getPendingConflictsFlow(): Flow<List<EquipmentCheckout>> = 
        equipmentCheckoutDao.getPendingConflictsFlow()
    
    /**
     * Resolves a checkout conflict by keeping this checkout and cancelling the other.
     */
    suspend fun resolveConflict(
        checkoutId: String,
        resolution: ConflictStatus,
        notes: String? = null
    ): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            equipmentCheckoutDao.resolveConflict(
                id = checkoutId,
                status = resolution,
                notes = notes,
                modifiedAt = Clock.System.now()
            )
            Log.i(TAG, "Resolved conflict for checkout $checkoutId with $resolution")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to resolve conflict", e)
            Result.failure(e)
        }
    }
}
