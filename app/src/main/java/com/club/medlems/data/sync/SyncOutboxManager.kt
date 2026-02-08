package com.club.medlems.data.sync

import android.util.Log
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.EquipmentCheckout
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberType
import com.club.medlems.data.entity.NewMemberRegistration
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.ScanEvent
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.seconds

/**
 * Manages the persistent sync outbox queue.
 *
 * The outbox guarantees at-least-once delivery by persisting sync intentions
 * before transmission. Changes are queued here atomically with the local
 * database write, ensuring that even if the app crashes, pending syncs
 * will be retried on restart.
 *
 * @see [sync-reliability/prd.md] FR-1 - Persistent Outbox Queue
 */
@Singleton
class SyncOutboxManager @Inject constructor(
    @PublishedApi internal val outboxDao: SyncOutboxDao,
    @PublishedApi internal val json: Json
) {
    companion object {
        @PublishedApi internal const val TAG = "SyncOutboxManager"

        /** Backoff delays for retry attempts (in seconds) */
        val BACKOFF_DELAYS = listOf(0, 5, 15, 60, 300, 900) // 0s, 5s, 15s, 1m, 5m, 15m

        /** Maximum retry attempts before marking as failed */
        const val MAX_ATTEMPTS = 10

        /** Retention period for completed entries */
        val COMPLETED_RETENTION = 24.hours

        /** Retention period for processed message IDs */
        val MESSAGE_RETENTION = 24.hours
    }

    // === Queue Operations ===

    /**
     * Queues an entity for sync to all peers.
     *
     * Call this AFTER inserting/updating the entity in the local database,
     * ideally within the same transaction.
     *
     * @param entityType Type name (e.g., "CheckIn", "PracticeSession")
     * @param entityId UUID of the entity
     * @param operation INSERT, UPDATE, or DELETE
     * @param entity The entity to serialize and sync
     */
    suspend inline fun <reified T> queueForSync(
        entityType: String,
        entityId: String,
        operation: OutboxOperation,
        entity: T
    ): String {
        val id = UUID.randomUUID().toString()
        val payload = json.encodeToString(entity)
        val now = Clock.System.now()

        val entry = SyncOutboxEntry(
            id = id,
            entityType = entityType,
            entityId = entityId,
            operation = operation.name,
            payload = payload,
            createdAtUtc = now,
            attempts = 0,
            status = OutboxEntryStatus.PENDING.name
        )

        outboxDao.insert(entry)
        Log.d(TAG, "Queued $entityType/$entityId for sync (operation=$operation, outboxId=$id)")

        return id
    }

    /**
     * Gets all pending outbox entries ready to sync.
     */
    suspend fun getPendingEntries(): List<SyncOutboxEntry> {
        val now = Clock.System.now()
        return outboxDao.getReadyToSync(now)
    }

    /**
     * Gets pending outbox entries for a specific device.
     *
     * Returns entries that have not yet been delivered to this device.
     */
    suspend fun getPendingForDevice(deviceId: String): List<SyncOutboxEntry> {
        val now = Clock.System.now()
        return outboxDao.getPendingForDevice(deviceId, now)
    }

    /**
     * Gets all failed outbox entries (for manual retry UI).
     */
    suspend fun getFailedEntries(): List<SyncOutboxEntry> {
        return outboxDao.getFailed()
    }

    /**
     * Collects outbox entries for a device and deserializes them into SyncEntities.
     *
     * This is used by the sync push mechanism to get entities that need to
     * be sent to a specific peer device.
     *
     * @param deviceId The target device ID
     * @param destinationDeviceType The type of destination device (for filtering)
     * @return Pair of (SyncEntities, List<outboxIds>) for tracking delivery
     */
    suspend fun collectEntitiesForDevice(
        deviceId: String,
        destinationDeviceType: DeviceType
    ): Pair<SyncEntities, List<String>> {
        val entries = getPendingForDevice(deviceId)
        if (entries.isEmpty()) {
            return Pair(SyncEntities(), emptyList())
        }

        val outboxIds = mutableListOf<String>()
        val checkIns = mutableListOf<SyncableCheckIn>()
        val practiceSessions = mutableListOf<SyncablePracticeSession>()
        val scanEvents = mutableListOf<SyncableScanEvent>()
        val members = mutableListOf<SyncableMember>()
        val equipmentCheckouts = mutableListOf<SyncableEquipmentCheckout>()
        val newMemberRegistrations = mutableListOf<SyncableNewMemberRegistration>()

        entries.forEach { entry ->
            try {
                when (entry.entityType) {
                    "CheckIn" -> {
                        checkIns.add(json.decodeFromString<SyncableCheckIn>(entry.payload))
                        outboxIds.add(entry.id)
                    }
                    "PracticeSession" -> {
                        practiceSessions.add(json.decodeFromString<SyncablePracticeSession>(entry.payload))
                        outboxIds.add(entry.id)
                    }
                    "ScanEvent" -> {
                        scanEvents.add(json.decodeFromString<SyncableScanEvent>(entry.payload))
                        outboxIds.add(entry.id)
                    }
                    "Member" -> {
                        // Include TRIAL members for tablet sync (new registrations)
                        // Other members only sync to laptop
                        val member = json.decodeFromString<SyncableMember>(entry.payload)
                        if (destinationDeviceType == DeviceType.LAPTOP ||
                            member.memberType == MemberType.TRIAL) {
                            members.add(member)
                            outboxIds.add(entry.id)
                        }
                    }
                    "EquipmentCheckout" -> {
                        equipmentCheckouts.add(json.decodeFromString<SyncableEquipmentCheckout>(entry.payload))
                        outboxIds.add(entry.id)
                    }
                    "NewMemberRegistration" -> {
                        newMemberRegistrations.add(json.decodeFromString<SyncableNewMemberRegistration>(entry.payload))
                        outboxIds.add(entry.id)
                    }
                    else -> {
                        Log.w(TAG, "Unknown entity type in outbox: ${entry.entityType}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to deserialize outbox entry ${entry.id}: ${e.message}")
            }
        }

        val entities = SyncEntities(
            checkIns = checkIns,
            practiceSessions = practiceSessions,
            scanEvents = scanEvents,
            members = members,
            equipmentCheckouts = equipmentCheckouts,
            newMemberRegistrations = newMemberRegistrations
        )

        Log.d(TAG, "Collected ${outboxIds.size} outbox entries for $deviceId: " +
            "${checkIns.size} check-ins, ${practiceSessions.size} sessions, " +
            "${members.size} members, ${equipmentCheckouts.size} checkouts")

        return Pair(entities, outboxIds)
    }

    /**
     * Marks multiple outbox entries as delivered to a device.
     *
     * Called when a sync push is acknowledged by a peer.
     */
    suspend fun markDeliveredToDevice(outboxIds: List<String>, deviceId: String) {
        outboxIds.forEach { outboxId ->
            markDeliveredToDevice(outboxId, deviceId)
        }
    }

    // === Delivery Tracking ===

    /**
     * Marks an outbox entry as delivered to a specific device.
     *
     * Call this when a sync push is acknowledged by a peer.
     */
    suspend fun markDeliveredToDevice(outboxId: String, deviceId: String) {
        val now = Clock.System.now()
        outboxDao.markDeliveredToDevice(outboxId, deviceId, now)
        Log.d(TAG, "Marked $outboxId as delivered to $deviceId")

        // Check if all known peers have received it
        checkAndMarkCompleted(outboxId)
    }

    /**
     * Records a delivery attempt to a specific device.
     *
     * Creates or updates the delivery record for tracking.
     */
    suspend fun recordDeliveryAttempt(outboxId: String, deviceId: String, error: String? = null) {
        val now = Clock.System.now()
        val existing = outboxDao.getDeliveries(outboxId).find { it.deviceId == deviceId }

        val delivery = SyncOutboxDelivery(
            outboxId = outboxId,
            deviceId = deviceId,
            deliveredAtUtc = null,
            attempts = (existing?.attempts ?: 0) + 1,
            lastAttemptUtc = now,
            lastError = error
        )

        outboxDao.upsertDelivery(delivery)
    }

    /**
     * Marks an outbox entry as fully completed (delivered to all peers).
     */
    suspend fun markCompleted(outboxId: String) {
        outboxDao.markCompleted(outboxId)
        Log.d(TAG, "Marked $outboxId as completed")
    }

    /**
     * Checks if all known deliveries are confirmed and marks entry as completed.
     */
    private suspend fun checkAndMarkCompleted(outboxId: String) {
        val deliveries = outboxDao.getDeliveries(outboxId)
        val allDelivered = deliveries.isNotEmpty() && deliveries.all { it.deliveredAtUtc != null }

        if (allDelivered) {
            markCompleted(outboxId)
        }
    }

    // === Retry & Failure Handling ===

    /**
     * Records a failed sync attempt with exponential backoff.
     *
     * @param outboxId The outbox entry ID
     * @param error Error message from the failed attempt
     * @param httpStatusCode Optional HTTP status code - permanent errors (4xx) won't retry
     */
    suspend fun recordFailedAttempt(outboxId: String, error: String, httpStatusCode: Int? = null) {
        val entry = outboxDao.getById(outboxId) ?: return
        val newAttempts = entry.attempts + 1
        val now = Clock.System.now()

        // Check for permanent errors - don't retry on 4xx client errors
        val isPermanentError = httpStatusCode != null && isPermanentError(httpStatusCode)

        if (isPermanentError || newAttempts >= MAX_ATTEMPTS) {
            // Mark as permanently failed
            val failReason = if (isPermanentError) {
                "Permanent error (HTTP $httpStatusCode): $error"
            } else {
                error
            }
            outboxDao.recordAttempt(
                id = outboxId,
                status = OutboxEntryStatus.FAILED.name,
                attemptTime = now,
                error = failReason,
                nextRetry = null
            )
            Log.w(TAG, "Outbox entry $outboxId marked as FAILED: $failReason")
        } else {
            // Schedule retry with exponential backoff
            val delaySeconds = BACKOFF_DELAYS.getOrElse(newAttempts) { BACKOFF_DELAYS.last() }
            val nextRetry = now + delaySeconds.seconds

            outboxDao.recordAttempt(
                id = outboxId,
                status = OutboxEntryStatus.PENDING.name,
                attemptTime = now,
                error = error,
                nextRetry = nextRetry
            )
            Log.d(TAG, "Outbox entry $outboxId attempt $newAttempts failed, retry scheduled for $nextRetry")
        }
    }

    /**
     * Determines if an HTTP status code represents a permanent error that shouldn't be retried.
     *
     * 4xx client errors are permanent - retrying won't help.
     * 5xx server errors are transient - server may recover.
     */
    private fun isPermanentError(httpStatusCode: Int): Boolean {
        return httpStatusCode in 400..499
    }

    /**
     * Resets a failed entry to pending for manual retry.
     */
    suspend fun retryFailed(outboxId: String) {
        val entry = outboxDao.getById(outboxId) ?: return
        if (entry.status != OutboxEntryStatus.FAILED.name) return

        outboxDao.resetForRetry(outboxId, OutboxEntryStatus.PENDING.name)
        Log.i(TAG, "Reset failed outbox entry $outboxId for retry")
    }

    /**
     * Recovers entries that were left in IN_PROGRESS state after a crash.
     *
     * Call this on app startup to ensure entries stuck mid-sync are retried.
     * This handles the scenario where the app crashed during a sync operation.
     */
    suspend fun recoverStaleInProgressEntries() {
        val recovered = outboxDao.recoverInProgress(OutboxEntryStatus.PENDING.name)
        if (recovered > 0) {
            Log.i(TAG, "Recovered $recovered stale IN_PROGRESS entries after restart")
        }
    }

    // === Idempotency ===

    /**
     * Checks if a sync message has already been processed.
     *
     * Use this on the receiving side to prevent duplicate processing
     * when network retries occur.
     */
    suspend fun isMessageProcessed(messageId: String): Boolean {
        return outboxDao.isMessageProcessed(messageId)
    }

    /**
     * Records a processed message ID for idempotency.
     *
     * Call this after successfully applying a sync payload.
     */
    suspend fun recordProcessedMessage(messageId: String, sourceDeviceId: String) {
        val message = SyncProcessedMessage(
            messageId = messageId,
            sourceDeviceId = sourceDeviceId,
            processedAtUtc = Clock.System.now()
        )
        outboxDao.insertProcessedMessage(message)
        Log.d(TAG, "Recorded processed message $messageId from $sourceDeviceId")
    }

    // === Cleanup ===

    /**
     * Cleans up old completed entries and processed message IDs.
     *
     * Call this periodically (e.g., on app start, after sync cycles).
     */
    suspend fun cleanup() {
        val now = Clock.System.now()
        val completedCutoff = now - COMPLETED_RETENTION
        val messageCutoff = now - MESSAGE_RETENTION

        outboxDao.deleteOldCompleted(completedCutoff)
        outboxDao.deleteOldProcessedMessages(messageCutoff)

        Log.d(TAG, "Cleaned up old outbox entries and processed messages")
    }

    // === Observables ===

    /**
     * Observes the count of pending outbox entries.
     */
    fun observePendingCount(): Flow<Int> = outboxDao.observePendingCount()

    /**
     * Observes the count of failed outbox entries.
     */
    fun observeFailedCount(): Flow<Int> = outboxDao.observeFailedCount()

    // === Entity-Specific Queue Methods ===

    /**
     * Queues a CheckIn for sync after local insert.
     *
     * @param checkIn The CheckIn entity that was just inserted
     * @param deviceId The device ID creating this check-in
     */
    suspend fun queueCheckIn(checkIn: CheckIn, deviceId: String) {
        val syncable = SyncableCheckIn(
            id = checkIn.id,
            internalMemberId = checkIn.internalMemberId,
            membershipId = checkIn.membershipId,
            localDate = checkIn.localDate,
            firstOfDayFlag = checkIn.firstOfDayFlag,
            deviceId = deviceId,
            syncVersion = 1,
            createdAtUtc = checkIn.createdAtUtc,
            modifiedAtUtc = checkIn.createdAtUtc,
            syncedAtUtc = null
        )
        queueForSync(
            entityType = "CheckIn",
            entityId = checkIn.id,
            operation = OutboxOperation.INSERT,
            entity = syncable
        )
    }

    /**
     * Queues a PracticeSession for sync after local insert.
     *
     * @param session The PracticeSession entity that was just inserted
     * @param deviceId The device ID creating this session
     */
    suspend fun queuePracticeSession(session: PracticeSession, deviceId: String) {
        val syncable = SyncablePracticeSession(
            id = session.id,
            internalMemberId = session.internalMemberId,
            membershipId = session.membershipId,
            localDate = session.localDate,
            practiceType = session.practiceType,
            points = session.points,
            krydser = session.krydser,
            classification = session.classification,
            source = session.source,
            deviceId = deviceId,
            syncVersion = 1,
            createdAtUtc = session.createdAtUtc,
            modifiedAtUtc = session.createdAtUtc,
            syncedAtUtc = null
        )
        queueForSync(
            entityType = "PracticeSession",
            entityId = session.id,
            operation = OutboxOperation.INSERT,
            entity = syncable
        )
    }

    /**
     * Queues a PracticeSession deletion for sync.
     *
     * @param session The PracticeSession entity that was just deleted
     * @param deviceId The device ID deleting this session
     */
    suspend fun queuePracticeSessionDeletion(session: PracticeSession, deviceId: String) {
        val syncable = SyncablePracticeSession(
            id = session.id,
            internalMemberId = session.internalMemberId,
            membershipId = session.membershipId,
            localDate = session.localDate,
            practiceType = session.practiceType,
            points = session.points,
            krydser = session.krydser,
            classification = session.classification,
            source = session.source,
            deviceId = deviceId,
            syncVersion = (session.syncVersion ?: 0) + 1,
            createdAtUtc = session.createdAtUtc,
            modifiedAtUtc = Clock.System.now(),
            syncedAtUtc = null
        )
        queueForSync(
            entityType = "PracticeSession",
            entityId = session.id,
            operation = OutboxOperation.DELETE,
            entity = syncable
        )
    }

    /**
     * Queues a ScanEvent for sync after local insert.
     *
     * @param scanEvent The ScanEvent entity that was just inserted
     * @param deviceId The device ID creating this scan event
     */
    suspend fun queueScanEvent(scanEvent: ScanEvent, deviceId: String) {
        val syncable = SyncableScanEvent(
            id = scanEvent.id,
            internalMemberId = scanEvent.internalMemberId,
            membershipId = scanEvent.membershipId,
            type = scanEvent.type,
            linkedCheckInId = scanEvent.linkedCheckInId,
            linkedSessionId = scanEvent.linkedSessionId,
            canceledFlag = scanEvent.canceledFlag,
            deviceId = deviceId,
            syncVersion = 1,
            createdAtUtc = scanEvent.createdAtUtc,
            modifiedAtUtc = scanEvent.createdAtUtc,
            syncedAtUtc = null
        )
        queueForSync(
            entityType = "ScanEvent",
            entityId = scanEvent.id,
            operation = OutboxOperation.INSERT,
            entity = syncable
        )
    }

    /**
     * Queues an EquipmentCheckout for sync after local insert/update.
     *
     * @param checkout The EquipmentCheckout entity
     * @param deviceId The device ID creating/updating this checkout
     * @param operation INSERT for new checkouts, UPDATE for check-ins/modifications
     */
    suspend fun queueEquipmentCheckout(
        checkout: EquipmentCheckout,
        deviceId: String,
        operation: OutboxOperation = OutboxOperation.INSERT
    ) {
        val syncable = SyncableEquipmentCheckout(
            id = checkout.id,
            equipmentId = checkout.equipmentId,
            internalMemberId = checkout.internalMemberId,
            membershipId = checkout.membershipId,
            checkedOutAtUtc = checkout.checkedOutAtUtc,
            checkedInAtUtc = checkout.checkedInAtUtc,
            checkedOutByDeviceId = checkout.checkedOutByDeviceId,
            checkedInByDeviceId = checkout.checkedInByDeviceId,
            checkoutNotes = checkout.checkoutNotes,
            checkinNotes = checkout.checkinNotes,
            conflictStatus = checkout.conflictStatus?.let {
                when (it) {
                    com.club.medlems.data.entity.ConflictStatus.Pending -> ConflictStatus.PENDING
                    com.club.medlems.data.entity.ConflictStatus.Resolved -> ConflictStatus.RESOLVED
                    com.club.medlems.data.entity.ConflictStatus.Cancelled -> ConflictStatus.CANCELLED
                }
            },
            deviceId = deviceId,
            syncVersion = checkout.syncVersion + 1,
            createdAtUtc = checkout.createdAtUtc,
            modifiedAtUtc = checkout.modifiedAtUtc,
            syncedAtUtc = null
        )
        queueForSync(
            entityType = "EquipmentCheckout",
            entityId = checkout.id,
            operation = operation,
            entity = syncable
        )
    }

    /**
     * Queues a NewMemberRegistration for sync after local insert.
     *
     * @param registration The NewMemberRegistration entity
     * @param deviceId The device ID creating this registration
     * @param photoBase64 Optional base64-encoded photo data
     */
    suspend fun queueNewMemberRegistration(
        registration: NewMemberRegistration,
        deviceId: String,
        photoBase64: String? = null
    ) {
        val syncable = SyncableNewMemberRegistration(
            id = registration.id,
            temporaryId = registration.temporaryId,
            photoPath = registration.photoPath,
            photoBase64 = photoBase64,
            firstName = registration.firstName,
            lastName = registration.lastName,
            email = registration.email,
            phone = registration.phone,
            birthDate = registration.birthDate,
            gender = registration.gender,
            address = registration.address,
            zipCode = registration.zipCode,
            city = registration.city,
            guardianName = registration.guardianName,
            guardianPhone = registration.guardianPhone,
            guardianEmail = registration.guardianEmail,
            approvalStatus = when (registration.approvalStatus) {
                com.club.medlems.data.entity.ApprovalStatus.PENDING -> ApprovalStatus.PENDING
                com.club.medlems.data.entity.ApprovalStatus.APPROVED -> ApprovalStatus.APPROVED
                com.club.medlems.data.entity.ApprovalStatus.REJECTED -> ApprovalStatus.REJECTED
            },
            deviceId = deviceId,
            syncVersion = registration.syncVersion + 1,
            createdAtUtc = registration.createdAtUtc,
            modifiedAtUtc = registration.createdAtUtc,
            syncedAtUtc = null
        )
        queueForSync(
            entityType = "NewMemberRegistration",
            entityId = registration.id,
            operation = OutboxOperation.INSERT,
            entity = syncable
        )
    }

    /**
     * Queues a Member for sync after local insert/update.
     *
     * Used primarily for trial members created on tablets that need to
     * sync to the laptop for eventual conversion to full members.
     *
     * @param member The Member entity
     * @param deviceId The device ID creating/updating this member
     * @param operation INSERT for new members, UPDATE for modifications
     * @param photoBase64 Optional base64-encoded profile photo data (for trial members)
     * @param idPhotoBase64 Optional base64-encoded ID photo data (for adult trial members)
     */
    suspend fun queueMember(
        member: Member,
        deviceId: String,
        operation: OutboxOperation = OutboxOperation.INSERT,
        photoBase64: String? = null,
        idPhotoBase64: String? = null
    ) {
        val syncable = SyncableMember(
            internalId = member.internalId,
            membershipId = member.membershipId,
            memberType = member.memberType,
            status = member.status,
            firstName = member.firstName,
            lastName = member.lastName,
            birthDate = member.birthDate,
            gender = member.gender,
            email = member.email,
            phone = member.phone,
            address = member.address,
            zipCode = member.zipCode,
            city = member.city,
            guardianName = member.guardianName,
            guardianPhone = member.guardianPhone,
            guardianEmail = member.guardianEmail,
            expiresOn = member.expiresOn,
            registrationPhotoPath = member.registrationPhotoPath,
            photoBase64 = photoBase64,
            idPhotoPath = member.idPhotoPath,
            idPhotoBase64 = idPhotoBase64,
            mergedIntoId = member.mergedIntoId,
            deviceId = deviceId,
            syncVersion = member.syncVersion + 1,
            createdAtUtc = member.createdAtUtc,
            modifiedAtUtc = member.updatedAtUtc,
            syncedAtUtc = null
        )
        queueForSync(
            entityType = "Member",
            entityId = member.internalId,
            operation = operation,
            entity = syncable
        )
    }
}
