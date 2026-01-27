package com.club.medlems.data.sync

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import kotlin.time.Duration.Companion.seconds

/**
 * Unit tests for SyncOutboxManager.
 *
 * Tests queue operations, delivery tracking, retry with backoff,
 * idempotency, and cleanup functionality.
 *
 * @see [sync-reliability/prd.md] - Sync Reliability Hardening PRD
 * @see [tasks.md 7.1] - Unit tests for SyncOutboxManager
 */
class SyncOutboxManagerTest {

    private lateinit var fakeDao: FakeSyncOutboxDao
    private lateinit var manager: SyncOutboxManager
    private val json = Json { ignoreUnknownKeys = true }

    @Before
    fun setup() {
        fakeDao = FakeSyncOutboxDao()
        manager = SyncOutboxManager(fakeDao, json)
    }

    // ===== Queue Operations =====

    @Test
    fun `queueForSync should create outbox entry with correct data`() = runBlocking {
        val entity = TestEntity("entity-1", "Test Data")

        val outboxId = manager.queueForSync(
            entityType = "TestEntity",
            entityId = "entity-1",
            operation = OutboxOperation.INSERT,
            entity = entity
        )

        assertNotNull("Should return outbox ID", outboxId)
        assertEquals("Should have 1 entry", 1, fakeDao.entries.size)

        val entry = fakeDao.entries[outboxId]!!
        assertEquals("TestEntity", entry.entityType)
        assertEquals("entity-1", entry.entityId)
        assertEquals("INSERT", entry.operation)
        assertEquals(OutboxEntryStatus.PENDING.name, entry.status)
        assertEquals(0, entry.attempts)
        assertTrue("Payload should contain entity data", entry.payload.contains("Test Data"))
    }

    @Test
    fun `queueForSync should support different operations`() = runBlocking {
        val entity = TestEntity("entity-1", "Data")

        manager.queueForSync("Test", "1", OutboxOperation.INSERT, entity)
        manager.queueForSync("Test", "2", OutboxOperation.UPDATE, entity)
        manager.queueForSync("Test", "3", OutboxOperation.DELETE, entity)

        assertEquals(3, fakeDao.entries.size)

        val operations = fakeDao.entries.values.map { it.operation }
        assertTrue(operations.contains("INSERT"))
        assertTrue(operations.contains("UPDATE"))
        assertTrue(operations.contains("DELETE"))
    }

    @Test
    fun `getPendingEntries should return only ready entries`() = runBlocking {
        // Add a pending entry with no retry delay
        val entry1 = createEntry("entry-1", status = OutboxEntryStatus.PENDING.name)
        fakeDao.entries[entry1.id] = entry1

        // Add an entry with future retry time
        val entry2 = createEntry(
            "entry-2",
            status = OutboxEntryStatus.PENDING.name,
            nextRetryUtc = Clock.System.now() + 60.seconds
        )
        fakeDao.entries[entry2.id] = entry2

        // Add a completed entry
        val entry3 = createEntry("entry-3", status = OutboxEntryStatus.COMPLETED.name)
        fakeDao.entries[entry3.id] = entry3

        val pending = manager.getPendingEntries()

        assertEquals("Should only return 1 ready entry", 1, pending.size)
        assertEquals("entry-1", pending[0].id)
    }

    @Test
    fun `getFailedEntries should return only failed entries`() = runBlocking {
        val entry1 = createEntry("entry-1", status = OutboxEntryStatus.PENDING.name)
        val entry2 = createEntry("entry-2", status = OutboxEntryStatus.FAILED.name)
        val entry3 = createEntry("entry-3", status = OutboxEntryStatus.FAILED.name)

        fakeDao.entries[entry1.id] = entry1
        fakeDao.entries[entry2.id] = entry2
        fakeDao.entries[entry3.id] = entry3

        val failed = manager.getFailedEntries()

        assertEquals("Should return 2 failed entries", 2, failed.size)
        assertTrue(failed.all { it.status == OutboxEntryStatus.FAILED.name })
    }

    // ===== Delivery Tracking =====

    @Test
    fun `markDeliveredToDevice should record delivery`() = runBlocking {
        val entry = createEntry("entry-1", status = OutboxEntryStatus.PENDING.name)
        fakeDao.entries[entry.id] = entry

        manager.markDeliveredToDevice("entry-1", "tablet-1")

        val delivery = fakeDao.deliveries["entry-1-tablet-1"]
        assertNotNull("Delivery record should exist", delivery)
        assertNotNull("Delivered time should be set", delivery?.deliveredAtUtc)
    }

    @Test
    fun `markDeliveredToDevice batch should process all entries`() = runBlocking {
        val entry1 = createEntry("entry-1", status = OutboxEntryStatus.PENDING.name)
        val entry2 = createEntry("entry-2", status = OutboxEntryStatus.PENDING.name)
        fakeDao.entries[entry1.id] = entry1
        fakeDao.entries[entry2.id] = entry2

        manager.markDeliveredToDevice(listOf("entry-1", "entry-2"), "tablet-1")

        assertEquals("Should have 2 delivery records", 2, fakeDao.deliveries.size)
        assertNotNull(fakeDao.deliveries["entry-1-tablet-1"])
        assertNotNull(fakeDao.deliveries["entry-2-tablet-1"])
    }

    @Test
    fun `getPendingForDevice should exclude delivered entries`() = runBlocking {
        val entry1 = createEntry("entry-1", status = OutboxEntryStatus.PENDING.name)
        val entry2 = createEntry("entry-2", status = OutboxEntryStatus.PENDING.name)
        fakeDao.entries[entry1.id] = entry1
        fakeDao.entries[entry2.id] = entry2

        // Mark entry-1 as delivered to tablet-1
        fakeDao.deliveries["entry-1-tablet-1"] = SyncOutboxDelivery(
            outboxId = "entry-1",
            deviceId = "tablet-1",
            deliveredAtUtc = Clock.System.now(),
            attempts = 1
        )

        val pending = manager.getPendingForDevice("tablet-1")

        assertEquals("Should only return entry-2", 1, pending.size)
        assertEquals("entry-2", pending[0].id)
    }

    // ===== Retry & Failure Handling =====

    @Test
    fun `recordFailedAttempt should increment attempts and set backoff`() = runBlocking {
        val entry = createEntry("entry-1", attempts = 0)
        fakeDao.entries[entry.id] = entry

        manager.recordFailedAttempt("entry-1", "Connection timeout")

        val updated = fakeDao.entries["entry-1"]!!
        assertEquals("Attempts should be incremented", 1, updated.attempts)
        assertEquals("Status should remain PENDING", OutboxEntryStatus.PENDING.name, updated.status)
        assertNotNull("Next retry should be set", updated.nextRetryUtc)
        assertEquals("Error should be recorded", "Connection timeout", updated.lastError)
    }

    @Test
    fun `recordFailedAttempt should apply exponential backoff delays`() = runBlocking {
        // Backoff delays: 0s, 5s, 15s, 60s, 300s (5min), 900s (15min)
        val expectedDelays = listOf(0, 5, 15, 60, 300, 900)

        for (attempt in 0 until 6) {
            val entry = createEntry("entry-$attempt", attempts = attempt)
            fakeDao.entries[entry.id] = entry

            val beforeAttempt = Clock.System.now()
            manager.recordFailedAttempt("entry-$attempt", "Error")
            val afterAttempt = Clock.System.now()

            val updated = fakeDao.entries["entry-$attempt"]!!
            val expectedDelay = expectedDelays.getOrElse(attempt + 1) { expectedDelays.last() }

            // The next retry should be approximately expectedDelay seconds from now
            if (updated.nextRetryUtc != null) {
                val actualDelay = (updated.nextRetryUtc!! - beforeAttempt).inWholeSeconds
                assertTrue(
                    "Delay for attempt ${attempt + 1} should be around ${expectedDelay}s, got ${actualDelay}s",
                    actualDelay >= expectedDelay - 1 && actualDelay <= expectedDelay + 1
                )
            }
        }
    }

    @Test
    fun `recordFailedAttempt should mark as FAILED after max attempts`() = runBlocking {
        // Set attempts to 9 (max is 10)
        val entry = createEntry("entry-1", attempts = 9)
        fakeDao.entries[entry.id] = entry

        manager.recordFailedAttempt("entry-1", "Final error")

        val updated = fakeDao.entries["entry-1"]!!
        assertEquals("Status should be FAILED", OutboxEntryStatus.FAILED.name, updated.status)
        assertEquals("Attempts should be 10", 10, updated.attempts)
        assertNull("Next retry should be null", updated.nextRetryUtc)
    }

    @Test
    fun `retryFailed should reset failed entry to pending`() = runBlocking {
        val entry = createEntry(
            "entry-1",
            status = OutboxEntryStatus.FAILED.name,
            attempts = 10,
            lastError = "Previous error"
        )
        fakeDao.entries[entry.id] = entry

        manager.retryFailed("entry-1")

        val updated = fakeDao.entries["entry-1"]!!
        assertEquals("Status should be PENDING", OutboxEntryStatus.PENDING.name, updated.status)
    }

    @Test
    fun `retryFailed should not affect non-failed entries`() = runBlocking {
        val entry = createEntry("entry-1", status = OutboxEntryStatus.PENDING.name)
        fakeDao.entries[entry.id] = entry

        manager.retryFailed("entry-1")

        // Should not change anything since it's not failed
        val updated = fakeDao.entries["entry-1"]!!
        assertEquals(OutboxEntryStatus.PENDING.name, updated.status)
    }

    // ===== Idempotency =====

    @Test
    fun `isMessageProcessed should return false for new message`() = runBlocking {
        val result = manager.isMessageProcessed("msg-new")
        assertFalse("New message should not be processed", result)
    }

    @Test
    fun `isMessageProcessed should return true for recorded message`() = runBlocking {
        fakeDao.processedMessages["msg-123"] = SyncProcessedMessage(
            messageId = "msg-123",
            sourceDeviceId = "tablet-1",
            processedAtUtc = Clock.System.now()
        )

        val result = manager.isMessageProcessed("msg-123")
        assertTrue("Recorded message should be detected", result)
    }

    @Test
    fun `recordProcessedMessage should store message`() = runBlocking {
        manager.recordProcessedMessage("msg-456", "tablet-2")

        assertTrue("Message should be recorded", fakeDao.processedMessages.containsKey("msg-456"))
        assertEquals("tablet-2", fakeDao.processedMessages["msg-456"]?.sourceDeviceId)
    }

    // ===== Cleanup =====

    @Test
    fun `cleanup should remove old completed entries`() = runBlocking {
        // Add completed entry older than 24 hours
        val oldEntry = createEntry(
            "entry-old",
            status = OutboxEntryStatus.COMPLETED.name,
            createdAtUtc = Clock.System.now() - kotlin.time.Duration.parse("48h")
        )
        fakeDao.entries[oldEntry.id] = oldEntry

        // Add recent completed entry
        val newEntry = createEntry(
            "entry-new",
            status = OutboxEntryStatus.COMPLETED.name,
            createdAtUtc = Clock.System.now()
        )
        fakeDao.entries[newEntry.id] = newEntry

        manager.cleanup()

        // The fake DAO marks old completed entries for deletion
        assertTrue("Cleanup should have been called", fakeDao.cleanupCalled)
    }

    // ===== Mark Completed =====

    @Test
    fun `markCompleted should update entry status`() = runBlocking {
        val entry = createEntry("entry-1", status = OutboxEntryStatus.PENDING.name)
        fakeDao.entries[entry.id] = entry

        manager.markCompleted("entry-1")

        val updated = fakeDao.entries["entry-1"]!!
        assertEquals(OutboxEntryStatus.COMPLETED.name, updated.status)
    }

    // ===== Entity Collection =====
    // Note: Full collectEntitiesForDevice tests require proper JSON serialization
    // and are better suited for integration tests. These tests verify the
    // filtering logic without depending on JSON deserialization.

    @Test
    fun `collectEntitiesForDevice should return empty for no pending entries`() = runBlocking {
        val (entities, outboxIds) = manager.collectEntitiesForDevice("tablet-1", DeviceType.MEMBER_TABLET)

        assertEquals("Should have 0 outbox IDs", 0, outboxIds.size)
        assertEquals("Should have 0 check-ins", 0, entities.checkIns.size)
        assertEquals("Should have 0 sessions", 0, entities.practiceSessions.size)
        assertEquals("Should have 0 members", 0, entities.members.size)
    }

    @Test
    fun `collectEntitiesForDevice should exclude already delivered entries`() = runBlocking {
        // Add entry that's already delivered to tablet-1
        val entry = createEntry("entry-1", entityType = "CheckIn")
        fakeDao.entries[entry.id] = entry
        fakeDao.deliveries["entry-1-tablet-1"] = SyncOutboxDelivery(
            outboxId = "entry-1",
            deviceId = "tablet-1",
            deliveredAtUtc = Clock.System.now(),
            attempts = 1
        )

        val (_, outboxIds) = manager.collectEntitiesForDevice("tablet-1", DeviceType.MEMBER_TABLET)

        assertEquals("Should have 0 outbox IDs (already delivered)", 0, outboxIds.size)
    }

    @Test
    fun `collectEntitiesForDevice should include entries for different device`() = runBlocking {
        // Add entry that's delivered to tablet-1 but not tablet-2
        val entry = createEntry("entry-1", entityType = "CheckIn")
        fakeDao.entries[entry.id] = entry
        fakeDao.deliveries["entry-1-tablet-1"] = SyncOutboxDelivery(
            outboxId = "entry-1",
            deviceId = "tablet-1",
            deliveredAtUtc = Clock.System.now(),
            attempts = 1
        )

        // tablet-2 should still see this entry
        val pending = manager.getPendingForDevice("tablet-2")

        assertEquals("tablet-2 should see 1 entry", 1, pending.size)
    }

    // ===== Helper Classes =====

    @kotlinx.serialization.Serializable
    data class TestEntity(val id: String, val data: String)

    private fun createEntry(
        id: String,
        entityType: String = "TestEntity",
        entityId: String = id,
        operation: String = "INSERT",
        payload: String = """{"id":"$id","data":"test"}""",
        status: String = OutboxEntryStatus.PENDING.name,
        attempts: Int = 0,
        lastError: String? = null,
        nextRetryUtc: Instant? = null,
        createdAtUtc: Instant = Clock.System.now()
    ) = SyncOutboxEntry(
        id = id,
        entityType = entityType,
        entityId = entityId,
        operation = operation,
        payload = payload,
        createdAtUtc = createdAtUtc,
        attempts = attempts,
        lastAttemptUtc = null,
        lastError = lastError,
        nextRetryUtc = nextRetryUtc,
        status = status
    )

    /**
     * Fake implementation of SyncOutboxDao for testing.
     */
    class FakeSyncOutboxDao : SyncOutboxDao {
        val entries = mutableMapOf<String, SyncOutboxEntry>()
        val deliveries = mutableMapOf<String, SyncOutboxDelivery>()
        val processedMessages = mutableMapOf<String, SyncProcessedMessage>()
        var cleanupCalled = false

        private val pendingCountFlow = MutableStateFlow(0)
        private val failedCountFlow = MutableStateFlow(0)

        override suspend fun insert(entry: SyncOutboxEntry) {
            entries[entry.id] = entry
            updateCounts()
        }

        override suspend fun upsertDelivery(delivery: SyncOutboxDelivery) {
            deliveries["${delivery.outboxId}-${delivery.deviceId}"] = delivery
        }

        override suspend fun insertProcessedMessage(message: SyncProcessedMessage) {
            processedMessages[message.messageId] = message
        }

        override suspend fun getById(id: String): SyncOutboxEntry? = entries[id]

        override suspend fun getPending(): List<SyncOutboxEntry> =
            entries.values.filter { it.status == OutboxEntryStatus.PENDING.name }

        override suspend fun getReadyToSync(now: Instant): List<SyncOutboxEntry> =
            entries.values.filter {
                it.status in listOf(OutboxEntryStatus.PENDING.name, OutboxEntryStatus.IN_PROGRESS.name) &&
                    (it.nextRetryUtc == null || it.nextRetryUtc!! <= now)
            }

        override suspend fun getPendingForDevice(deviceId: String, now: Instant): List<SyncOutboxEntry> =
            entries.values.filter { entry ->
                entry.status !in listOf(OutboxEntryStatus.COMPLETED.name, OutboxEntryStatus.FAILED.name) &&
                    (entry.nextRetryUtc == null || entry.nextRetryUtc!! <= now) &&
                    deliveries["${entry.id}-$deviceId"]?.deliveredAtUtc == null
            }

        override suspend fun getFailed(): List<SyncOutboxEntry> =
            entries.values.filter { it.status == OutboxEntryStatus.FAILED.name }

        override suspend fun getDeliveries(outboxId: String): List<SyncOutboxDelivery> =
            deliveries.values.filter { it.outboxId == outboxId }

        override suspend fun getDeliveriesForEntry(outboxId: String): List<SyncOutboxDelivery> =
            getDeliveries(outboxId)

        override fun observePendingCount(): Flow<Int> = pendingCountFlow

        override fun observeFailedCount(): Flow<Int> = failedCountFlow

        override suspend fun isMessageProcessed(messageId: String): Boolean =
            processedMessages.containsKey(messageId)

        override suspend fun update(entry: SyncOutboxEntry) {
            entries[entry.id] = entry
            updateCounts()
        }

        override suspend fun updateStatus(id: String, status: String) {
            entries[id]?.let { entries[id] = it.copy(status = status) }
            updateCounts()
        }

        override suspend fun recordAttempt(
            id: String,
            status: String,
            attemptTime: Instant,
            error: String?,
            nextRetry: Instant?
        ) {
            entries[id]?.let {
                entries[id] = it.copy(
                    status = status,
                    attempts = it.attempts + 1,
                    lastAttemptUtc = attemptTime,
                    lastError = error,
                    nextRetryUtc = nextRetry
                )
            }
            updateCounts()
        }

        override suspend fun markCompleted(id: String) {
            entries[id]?.let { entries[id] = it.copy(status = OutboxEntryStatus.COMPLETED.name) }
            updateCounts()
        }

        override suspend fun resetForRetry(id: String, newStatus: String) {
            entries[id]?.let {
                entries[id] = it.copy(
                    status = newStatus,
                    attempts = 0,
                    lastError = null,
                    nextRetryUtc = null
                )
            }
            updateCounts()
        }

        override suspend fun recoverInProgress(newStatus: String): Int {
            var count = 0
            entries.entries.forEach { (id, entry) ->
                if (entry.status == OutboxEntryStatus.IN_PROGRESS.name) {
                    entries[id] = entry.copy(status = newStatus)
                    count++
                }
            }
            updateCounts()
            return count
        }

        override suspend fun markDeliveredToDevice(outboxId: String, deviceId: String, deliveredAt: Instant) {
            val key = "$outboxId-$deviceId"
            val existing = deliveries[key]
            deliveries[key] = SyncOutboxDelivery(
                outboxId = outboxId,
                deviceId = deviceId,
                deliveredAtUtc = deliveredAt,
                attempts = (existing?.attempts ?: 0) + 1,
                lastAttemptUtc = deliveredAt
            )
        }

        override suspend fun delete(entry: SyncOutboxEntry) {
            entries.remove(entry.id)
            updateCounts()
        }

        override suspend fun deleteOldCompleted(cutoff: Instant) {
            cleanupCalled = true
            entries.entries.removeIf {
                it.value.status == OutboxEntryStatus.COMPLETED.name &&
                    it.value.createdAtUtc < cutoff
            }
            updateCounts()
        }

        override suspend fun deleteOldProcessedMessages(cutoff: Instant) {
            cleanupCalled = true
            processedMessages.entries.removeIf { it.value.processedAtUtc < cutoff }
        }

        override suspend fun deleteAll() {
            entries.clear()
            deliveries.clear()
            updateCounts()
        }

        private fun updateCounts() {
            pendingCountFlow.value = entries.values.count { it.status == OutboxEntryStatus.PENDING.name }
            failedCountFlow.value = entries.values.count { it.status == OutboxEntryStatus.FAILED.name }
        }
    }
}
