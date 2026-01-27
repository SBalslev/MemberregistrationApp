package com.club.medlems.data.sync

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.Instant

/**
 * Status of a sync outbox entry.
 */
enum class OutboxEntryStatus {
    /** Entry is waiting to be synced */
    PENDING,
    /** Entry is currently being synced */
    IN_PROGRESS,
    /** Entry has been delivered to all known peers */
    COMPLETED,
    /** Entry failed after max retries */
    FAILED
}

/**
 * Operation type for outbox entries.
 */
enum class OutboxOperation {
    INSERT,
    UPDATE,
    DELETE
}

/**
 * Persistent outbox queue entry for guaranteed sync delivery.
 *
 * When a local entity is created/updated/deleted, an entry is added here
 * BEFORE the transaction completes. This ensures that even if the app crashes
 * before sync, the change will be retried on next startup.
 *
 * @see [sync-reliability/prd.md] FR-1 - Persistent Outbox Queue
 */
@Entity(
    tableName = "sync_outbox",
    indices = [
        Index(value = ["status", "createdAtUtc"]),
        Index(value = ["entityType", "entityId"])
    ]
)
data class SyncOutboxEntry(
    @PrimaryKey
    val id: String,

    /** Entity type: "CheckIn", "PracticeSession", "EquipmentCheckout", etc. */
    val entityType: String,

    /** UUID of the entity being synced */
    val entityId: String,

    /** Operation type: INSERT, UPDATE, DELETE */
    val operation: String,

    /** JSON serialized snapshot of the entity at time of change */
    val payload: String,

    /** When this entry was created */
    val createdAtUtc: Instant,

    /** Number of sync attempts made */
    val attempts: Int = 0,

    /** Time of last sync attempt */
    val lastAttemptUtc: Instant? = null,

    /** Error message from last failed attempt */
    val lastError: String? = null,

    /** Next retry time (for exponential backoff) */
    val nextRetryUtc: Instant? = null,

    /** Current status: PENDING, IN_PROGRESS, COMPLETED, FAILED */
    val status: String = OutboxEntryStatus.PENDING.name
)

/**
 * Tracks delivery status of an outbox entry to a specific device.
 *
 * An outbox entry is only fully "delivered" when all known peer devices
 * have acknowledged receipt. This table tracks per-device delivery.
 *
 * @see [sync-reliability/prd.md] - Per-device delivery tracking
 */
@Entity(
    tableName = "sync_outbox_delivery",
    primaryKeys = ["outboxId", "deviceId"],
    foreignKeys = [
        ForeignKey(
            entity = SyncOutboxEntry::class,
            parentColumns = ["id"],
            childColumns = ["outboxId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["outboxId"]),
        Index(value = ["deviceId"])
    ]
)
data class SyncOutboxDelivery(
    /** Reference to the outbox entry */
    val outboxId: String,

    /** Device ID this delivery is for */
    val deviceId: String,

    /** When delivery was confirmed (null if not yet delivered) */
    val deliveredAtUtc: Instant? = null,

    /** Number of delivery attempts to this device */
    val attempts: Int = 0,

    /** Time of last delivery attempt */
    val lastAttemptUtc: Instant? = null,

    /** Error from last failed attempt */
    val lastError: String? = null
)

/**
 * Tracks processed sync messages to prevent duplicate processing.
 *
 * When a sync push is received, we record its messageId here.
 * If the same messageId arrives again (network retry), we skip processing.
 *
 * @see [sync-reliability/prd.md] FR-3 - Idempotency
 */
@Entity(
    tableName = "sync_processed_messages",
    indices = [
        Index(value = ["processedAtUtc"])
    ]
)
data class SyncProcessedMessage(
    @PrimaryKey
    val messageId: String,

    /** Device that sent this message */
    val sourceDeviceId: String,

    /** When the message was processed */
    val processedAtUtc: Instant
)

/**
 * DAO for sync outbox operations.
 */
@Dao
interface SyncOutboxDao {

    // === Insert Operations ===

    @Insert
    suspend fun insert(entry: SyncOutboxEntry)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertDelivery(delivery: SyncOutboxDelivery)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertProcessedMessage(message: SyncProcessedMessage)

    // === Query Operations ===

    @Query("SELECT * FROM sync_outbox WHERE id = :id")
    suspend fun getById(id: String): SyncOutboxEntry?

    @Query("SELECT * FROM sync_outbox WHERE status = 'PENDING' ORDER BY createdAtUtc ASC")
    suspend fun getPending(): List<SyncOutboxEntry>

    @Query("""
        SELECT * FROM sync_outbox
        WHERE status IN ('PENDING', 'IN_PROGRESS')
        AND (nextRetryUtc IS NULL OR nextRetryUtc <= :now)
        ORDER BY createdAtUtc ASC
    """)
    suspend fun getReadyToSync(now: Instant): List<SyncOutboxEntry>

    @Query("""
        SELECT o.* FROM sync_outbox o
        WHERE o.status NOT IN ('COMPLETED', 'FAILED')
        AND NOT EXISTS (
            SELECT 1 FROM sync_outbox_delivery d
            WHERE d.outboxId = o.id
            AND d.deviceId = :deviceId
            AND d.deliveredAtUtc IS NOT NULL
        )
        AND (o.nextRetryUtc IS NULL OR o.nextRetryUtc <= :now)
        ORDER BY o.createdAtUtc ASC
    """)
    suspend fun getPendingForDevice(deviceId: String, now: Instant): List<SyncOutboxEntry>

    @Query("SELECT * FROM sync_outbox WHERE status = 'FAILED' ORDER BY createdAtUtc DESC")
    suspend fun getFailed(): List<SyncOutboxEntry>

    @Query("SELECT * FROM sync_outbox_delivery WHERE outboxId = :outboxId")
    suspend fun getDeliveries(outboxId: String): List<SyncOutboxDelivery>

    /** Alias for getDeliveries for clearer API */
    @Query("SELECT * FROM sync_outbox_delivery WHERE outboxId = :outboxId")
    suspend fun getDeliveriesForEntry(outboxId: String): List<SyncOutboxDelivery>

    @Query("SELECT COUNT(*) FROM sync_outbox WHERE status = 'PENDING'")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM sync_outbox WHERE status = 'FAILED'")
    fun observeFailedCount(): Flow<Int>

    @Query("SELECT EXISTS(SELECT 1 FROM sync_processed_messages WHERE messageId = :messageId)")
    suspend fun isMessageProcessed(messageId: String): Boolean

    // === Update Operations ===

    @Update
    suspend fun update(entry: SyncOutboxEntry)

    @Query("UPDATE sync_outbox SET status = :status WHERE id = :id")
    suspend fun updateStatus(id: String, status: String)

    @Query("""
        UPDATE sync_outbox
        SET status = :status,
            attempts = attempts + 1,
            lastAttemptUtc = :attemptTime,
            lastError = :error,
            nextRetryUtc = :nextRetry
        WHERE id = :id
    """)
    suspend fun recordAttempt(
        id: String,
        status: String,
        attemptTime: Instant,
        error: String?,
        nextRetry: Instant?
    )

    @Query("UPDATE sync_outbox SET status = 'COMPLETED' WHERE id = :id")
    suspend fun markCompleted(id: String)

    @Query("""
        UPDATE sync_outbox
        SET status = :newStatus, attempts = 0, lastError = NULL, nextRetryUtc = NULL
        WHERE id = :id
    """)
    suspend fun resetForRetry(id: String, newStatus: String)

    @Query("""
        UPDATE sync_outbox
        SET status = :newStatus
        WHERE status = 'IN_PROGRESS'
    """)
    suspend fun recoverInProgress(newStatus: String): Int

    @Query("""
        UPDATE sync_outbox_delivery
        SET deliveredAtUtc = :deliveredAt,
            attempts = attempts + 1,
            lastAttemptUtc = :deliveredAt,
            lastError = NULL
        WHERE outboxId = :outboxId AND deviceId = :deviceId
    """)
    suspend fun markDeliveredToDevice(outboxId: String, deviceId: String, deliveredAt: Instant)

    // === Delete Operations ===

    @Delete
    suspend fun delete(entry: SyncOutboxEntry)

    @Query("DELETE FROM sync_outbox WHERE status = 'COMPLETED' AND createdAtUtc < :cutoff")
    suspend fun deleteOldCompleted(cutoff: Instant)

    @Query("DELETE FROM sync_processed_messages WHERE processedAtUtc < :cutoff")
    suspend fun deleteOldProcessedMessages(cutoff: Instant)

    @Query("DELETE FROM sync_outbox")
    suspend fun deleteAll()
}
