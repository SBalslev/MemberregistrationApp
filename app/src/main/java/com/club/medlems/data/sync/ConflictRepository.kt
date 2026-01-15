package com.club.medlems.data.sync

import android.util.Log
import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Duration.Companion.days

/**
 * Room entity for persisting sync conflicts that require resolution.
 *
 * Primarily used for equipment checkout conflicts (FR-7.4, FR-19).
 *
 * @see [design.md FR-19] - Equipment Conflict Resolution UI
 */
@Entity(tableName = "sync_conflicts")
data class SyncConflictEntity(
    @PrimaryKey
    val id: String,
    
    /** Type of conflict (equipment, member, etc.) */
    val conflictType: String,
    
    /** Entity type involved (e.g., "EquipmentCheckout") */
    val entityType: String,
    
    /** ID of the conflicting entity */
    val entityId: String,
    
    /** ID of the second conflicting entity (for equipment: second checkout ID) */
    val conflictingEntityId: String? = null,
    
    /** Local device ID */
    val localDeviceId: String,
    
    /** Local device name */
    val localDeviceName: String? = null,
    
    /** Local version timestamp */
    val localTimestamp: Instant,
    
    /** Local sync version */
    val localSyncVersion: Long,
    
    /** Remote device ID */
    val remoteDeviceId: String,
    
    /** Remote device name */
    val remoteDeviceName: String? = null,
    
    /** Remote version timestamp */
    val remoteTimestamp: Instant,
    
    /** Remote sync version */
    val remoteSyncVersion: Long,
    
    /** Additional context (e.g., member names for equipment conflict) */
    val context: String? = null,
    
    /** Current resolution status */
    val status: ConflictEntityStatus = ConflictEntityStatus.PENDING,
    
    /** Chosen resolution (once resolved) */
    val resolution: String? = null,
    
    /** Who resolved the conflict */
    val resolvedByDeviceId: String? = null,
    
    /** When the conflict was detected */
    val detectedAtUtc: Instant,
    
    /** When the conflict was resolved */
    val resolvedAtUtc: Instant? = null
)

/**
 * Status of a persisted conflict.
 */
enum class ConflictEntityStatus {
    /** Conflict is awaiting resolution */
    PENDING,
    
    /** Conflict has been resolved */
    RESOLVED,
    
    /** Conflict resolution has been synced to all devices */
    SYNCED
}

/**
 * DAO for sync conflict persistence.
 */
@Dao
interface SyncConflictDao {
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(conflict: SyncConflictEntity)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(conflicts: List<SyncConflictEntity>)
    
    @Update
    suspend fun update(conflict: SyncConflictEntity)
    
    @Query("SELECT * FROM sync_conflicts WHERE id = :id")
    suspend fun getById(id: String): SyncConflictEntity?
    
    @Query("SELECT * FROM sync_conflicts WHERE status = :status ORDER BY detectedAtUtc DESC")
    suspend fun getByStatus(status: ConflictEntityStatus): List<SyncConflictEntity>
    
    @Query("SELECT * FROM sync_conflicts WHERE status = 'PENDING' ORDER BY detectedAtUtc DESC")
    fun observePendingConflicts(): Flow<List<SyncConflictEntity>>
    
    @Query("SELECT COUNT(*) FROM sync_conflicts WHERE status = 'PENDING'")
    fun observePendingCount(): Flow<Int>
    
    @Query("SELECT * FROM sync_conflicts WHERE entityType = :entityType AND status = 'PENDING'")
    suspend fun getPendingByEntityType(entityType: String): List<SyncConflictEntity>
    
    @Query("SELECT * FROM sync_conflicts WHERE entityId = :entityId OR conflictingEntityId = :entityId")
    suspend fun getByEntityId(entityId: String): List<SyncConflictEntity>
    
    @Query("""
        UPDATE sync_conflicts 
        SET status = :status, 
            resolution = :resolution, 
            resolvedByDeviceId = :resolvedByDeviceId,
            resolvedAtUtc = :resolvedAtUtc
        WHERE id = :id
    """)
    suspend fun resolve(
        id: String,
        status: ConflictEntityStatus,
        resolution: String,
        resolvedByDeviceId: String,
        resolvedAtUtc: Instant
    )
    
    @Query("DELETE FROM sync_conflicts WHERE id = :id")
    suspend fun delete(id: String)
    
    @Query("DELETE FROM sync_conflicts WHERE status = 'SYNCED' AND resolvedAtUtc < :before")
    suspend fun deleteOldSynced(before: Instant)
}

/**
 * Repository for managing sync conflicts.
 *
 * @see [design.md FR-7.4] - Equipment conflict flagging
 * @see [design.md FR-19] - Equipment Conflict Resolution UI
 */
@Singleton
class ConflictRepository @Inject constructor(
    private val conflictDao: SyncConflictDao
) {
    companion object {
        private const val TAG = "ConflictRepository"
    }

    /**
     * Stores a new conflict for later resolution.
     *
     * @param syncConflict The sync conflict to store
     * @param conflictingEntityId Optional ID of the second entity in conflict
     * @return The generated conflict ID
     */
    suspend fun storeConflict(
        syncConflict: SyncConflict,
        conflictingEntityId: String? = null
    ): String {
        val id = generateConflictId(syncConflict)
        
        val entity = SyncConflictEntity(
            id = id,
            conflictType = syncConflict.conflictType.name,
            entityType = syncConflict.entityType,
            entityId = syncConflict.entityId,
            conflictingEntityId = conflictingEntityId,
            localDeviceId = syncConflict.localVersion.deviceId,
            localDeviceName = syncConflict.localVersion.deviceName,
            localTimestamp = syncConflict.localVersion.timestamp,
            localSyncVersion = syncConflict.localVersion.syncVersion,
            remoteDeviceId = syncConflict.remoteVersion.deviceId,
            remoteDeviceName = syncConflict.remoteVersion.deviceName,
            remoteTimestamp = syncConflict.remoteVersion.timestamp,
            remoteSyncVersion = syncConflict.remoteVersion.syncVersion,
            context = syncConflict.localVersion.context ?: syncConflict.remoteVersion.context,
            status = ConflictEntityStatus.PENDING,
            detectedAtUtc = Clock.System.now()
        )
        
        conflictDao.insert(entity)
        Log.i(TAG, "Stored conflict: $id for ${syncConflict.entityType}/${syncConflict.entityId}")
        
        return id
    }

    /**
     * Stores an equipment conflict with both checkout IDs.
     */
    suspend fun storeEquipmentConflict(conflictInfo: EquipmentConflictInfo): String {
        val first = conflictInfo.firstCheckout
        val second = conflictInfo.secondCheckout
        
        val id = "eq-conflict-${first.equipmentId}-${first.id}-${second.id}"
        
        val entity = SyncConflictEntity(
            id = id,
            conflictType = ConflictType.EQUIPMENT_CHECKOUT.name,
            entityType = "EquipmentCheckout",
            entityId = first.id,
            conflictingEntityId = second.id,
            localDeviceId = first.checkedOutByDeviceId,
            localDeviceName = null,
            localTimestamp = first.checkedOutAtUtc,
            localSyncVersion = first.syncVersion,
            remoteDeviceId = second.checkedOutByDeviceId,
            remoteDeviceName = null,
            remoteTimestamp = second.checkedOutAtUtc,
            remoteSyncVersion = second.syncVersion,
            context = "Equipment: ${first.equipmentId}",
            status = ConflictEntityStatus.PENDING,
            detectedAtUtc = conflictInfo.detectedAtUtc
        )
        
        conflictDao.insert(entity)
        Log.i(TAG, "Stored equipment conflict: $id")
        
        return id
    }

    /**
     * Gets all pending conflicts.
     */
    suspend fun getPendingConflicts(): List<SyncConflictEntity> {
        return conflictDao.getByStatus(ConflictEntityStatus.PENDING)
    }

    /**
     * Gets pending equipment conflicts.
     */
    suspend fun getPendingEquipmentConflicts(): List<SyncConflictEntity> {
        return conflictDao.getPendingByEntityType("EquipmentCheckout")
    }

    /**
     * Observes pending conflicts for UI updates.
     */
    fun observePendingConflicts(): Flow<List<SyncConflictEntity>> {
        return conflictDao.observePendingConflicts()
    }

    /**
     * Observes pending conflict count for badge display.
     */
    fun observePendingCount(): Flow<Int> {
        return conflictDao.observePendingCount()
    }

    /**
     * Resolves a conflict with the given resolution.
     *
     * @param conflictId The conflict ID to resolve
     * @param resolution The chosen resolution (KEEP_LOCAL, ACCEPT_REMOTE, etc.)
     * @param resolverDeviceId The device that resolved the conflict
     */
    suspend fun resolveConflict(
        conflictId: String,
        resolution: ConflictResolution,
        resolverDeviceId: String
    ) {
        conflictDao.resolve(
            id = conflictId,
            status = ConflictEntityStatus.RESOLVED,
            resolution = resolution.name,
            resolvedByDeviceId = resolverDeviceId,
            resolvedAtUtc = Clock.System.now()
        )
        Log.i(TAG, "Resolved conflict $conflictId with $resolution")
    }

    /**
     * Marks a resolved conflict as synced to all devices.
     */
    suspend fun markSynced(conflictId: String) {
        val existing = conflictDao.getById(conflictId) ?: return
        if (existing.status == ConflictEntityStatus.RESOLVED) {
            conflictDao.update(existing.copy(status = ConflictEntityStatus.SYNCED))
        }
    }

    /**
     * Gets conflicts that have been resolved but not yet synced.
     */
    suspend fun getUnyncedResolutions(): List<SyncConflictEntity> {
        return conflictDao.getByStatus(ConflictEntityStatus.RESOLVED)
    }

    /**
     * Cleans up old synced conflicts (older than 30 days).
     */
    suspend fun cleanupOldConflicts() {
        val thirtyDaysAgo = Clock.System.now().minus(30.days)
        conflictDao.deleteOldSynced(thirtyDaysAgo)
    }

    private fun generateConflictId(conflict: SyncConflict): String {
        return "conflict-${conflict.conflictType.name.lowercase()}-${conflict.entityId}-${System.currentTimeMillis()}"
    }
}
