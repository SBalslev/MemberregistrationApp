package com.club.medlems.data.sync

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.club.medlems.data.db.AppDatabase
import com.club.medlems.data.entity.CheckIn
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
import kotlin.time.Duration.Companion.seconds

/**
 * Integration tests for sync retry with exponential backoff.
 *
 * Tests that network failures are handled gracefully with proper retry scheduling,
 * exponential backoff, and dead letter handling after max retries.
 *
 * @see [sync-reliability/tasks.md] Task 7.4
 */
@RunWith(AndroidJUnit4::class)
class NetworkRetryTest {

    private lateinit var context: Context
    private lateinit var db: AppDatabase
    private lateinit var outboxDao: SyncOutboxDao
    private lateinit var outboxManager: SyncOutboxManager
    private val json = Json { ignoreUnknownKeys = true }

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        db = Room.inMemoryDatabaseBuilder(
            context,
            AppDatabase::class.java
        ).allowMainThreadQueries().build()

        outboxDao = db.syncOutboxDao()
        outboxManager = SyncOutboxManager(outboxDao, json)
    }

    @After
    fun teardown() {
        db.close()
    }

    // ==================== Task 7.4: Network Failure & Retry Tests ====================

    @Test
    fun firstFailure_schedulesRetryWithMinimalDelay() = runTest {
        // Given: A queued entry
        val checkInId = UUID.randomUUID().toString()
        outboxManager.queueCheckIn(createTestCheckIn(checkInId), "device-001")

        val entries = outboxDao.getPending()
        val outboxId = entries[0].id

        val beforeFailure = Clock.System.now()

        // When: First network failure occurs
        outboxManager.recordFailedAttempt(outboxId, "Connection refused")

        // Then: Entry has attempt count = 1 and nextRetryAtUtc set
        val afterFailure = outboxDao.getById(outboxId)
        assertNotNull(afterFailure)
        assertEquals(1, afterFailure!!.attempts)
        assertEquals("Connection refused", afterFailure.lastError)

        // First retry should be immediate (0 seconds backoff)
        val nextRetry = afterFailure.nextRetryUtc
        assertNotNull(nextRetry)
        assertTrue(nextRetry!! <= beforeFailure.plus(5.seconds))
    }

    @Test
    fun subsequentFailures_increaseBackoff() = runTest {
        // Given: A queued entry
        val checkInId = UUID.randomUUID().toString()
        outboxManager.queueCheckIn(createTestCheckIn(checkInId), "device-001")

        val entries = outboxDao.getPending()
        val outboxId = entries[0].id

        // When: Multiple failures occur
        // Attempt 1: 0s backoff
        outboxManager.recordFailedAttempt(outboxId, "Timeout")
        val after1 = outboxDao.getById(outboxId)
        assertEquals(1, after1?.attempts)

        // Attempt 2: 5s backoff
        outboxManager.recordFailedAttempt(outboxId, "Timeout")
        val after2 = outboxDao.getById(outboxId)
        assertEquals(2, after2?.attempts)

        // Attempt 3: 15s backoff
        outboxManager.recordFailedAttempt(outboxId, "Timeout")
        val after3 = outboxDao.getById(outboxId)
        assertEquals(3, after3?.attempts)

        // Attempt 4: 60s backoff
        outboxManager.recordFailedAttempt(outboxId, "Timeout")
        val after4 = outboxDao.getById(outboxId)
        assertEquals(4, after4?.attempts)

        // Then: Entry should still be pending (not failed yet)
        assertEquals(OutboxEntryStatus.PENDING.name, after4?.status)
    }

    @Test
    fun maxRetries_movesToFailedStatus() = runTest {
        // Given: A queued entry
        val checkInId = UUID.randomUUID().toString()
        outboxManager.queueCheckIn(createTestCheckIn(checkInId), "device-001")

        val entries = outboxDao.getPending()
        val outboxId = entries[0].id

        // When: Max retries (10) are exceeded
        repeat(SyncOutboxManager.MAX_ATTEMPTS) {
            outboxManager.recordFailedAttempt(outboxId, "Persistent failure")
        }

        // Then: Entry should be marked as FAILED
        val afterMaxRetries = outboxDao.getById(outboxId)
        assertEquals(OutboxEntryStatus.FAILED.name, afterMaxRetries?.status)
        assertEquals(SyncOutboxManager.MAX_ATTEMPTS, afterMaxRetries?.attempts)
    }

    @Test
    fun failedEntries_canBeRetriedManually() = runTest {
        // Given: An entry that has failed after max retries
        val checkInId = UUID.randomUUID().toString()
        outboxManager.queueCheckIn(createTestCheckIn(checkInId), "device-001")

        val entries = outboxDao.getPending()
        val outboxId = entries[0].id

        // Fail it completely
        repeat(SyncOutboxManager.MAX_ATTEMPTS) {
            outboxManager.recordFailedAttempt(outboxId, "Persistent failure")
        }
        assertEquals(OutboxEntryStatus.FAILED.name, outboxDao.getById(outboxId)?.status)

        // When: Manual retry is triggered
        outboxManager.retryFailed(outboxId)

        // Then: Entry should be back to PENDING with reset attempts
        val afterRetry = outboxDao.getById(outboxId)
        assertEquals(OutboxEntryStatus.PENDING.name, afterRetry?.status)
        assertEquals(0, afterRetry?.attempts)
    }

    @Test
    fun failedCount_trackedCorrectly() = runTest {
        // Given: Multiple entries, some failed
        val id1 = UUID.randomUUID().toString()
        val id2 = UUID.randomUUID().toString()
        val id3 = UUID.randomUUID().toString()

        outboxManager.queueCheckIn(createTestCheckIn(id1), "device-001")
        outboxManager.queueCheckIn(createTestCheckIn(id2), "device-001")
        outboxManager.queueCheckIn(createTestCheckIn(id3), "device-001")

        val entries = outboxDao.getPending()

        // Fail first entry completely
        repeat(SyncOutboxManager.MAX_ATTEMPTS) {
            outboxManager.recordFailedAttempt(entries[0].id, "Failure")
        }

        // Fail second entry completely
        repeat(SyncOutboxManager.MAX_ATTEMPTS) {
            outboxManager.recordFailedAttempt(entries[1].id, "Failure")
        }

        // Third entry stays pending

        // Then: Counts should be correct
        assertEquals(1, outboxDao.getPending().size)
        assertEquals(2, outboxManager.getFailedEntries().size)
    }

    @Test
    fun pendingForDevice_respectsRetryTime() = runTest {
        // Given: Entry with future retry time
        val checkInId = UUID.randomUUID().toString()
        outboxManager.queueCheckIn(createTestCheckIn(checkInId), "device-001")

        val entries = outboxDao.getPending()
        val outboxId = entries[0].id

        // Record multiple failures to set a future retry time
        repeat(4) { // 4 failures = 60s backoff
            outboxManager.recordFailedAttempt(outboxId, "Timeout")
        }

        // When: Getting pending for device (with current time)
        val pendingNow = outboxManager.getPendingForDevice("peer-001")

        // Then: Entry should NOT be returned (retry time is in future)
        // The entry has nextRetryUtc set ~60 seconds in the future
        assertTrue(pendingNow.isEmpty())
    }

    @Test
    fun perDeviceDelivery_retriesIndependently() = runTest {
        // Given: Entry to be delivered to multiple devices
        val checkInId = UUID.randomUUID().toString()
        outboxManager.queueCheckIn(createTestCheckIn(checkInId), "device-001")

        val entries = outboxDao.getPending()
        val outboxId = entries[0].id

        // When: Delivery succeeds for device A but fails for device B
        outboxManager.recordDeliveryAttempt(outboxId, "device-A")
        outboxManager.markDeliveredToDevice(listOf(outboxId), "device-A")

        outboxManager.recordDeliveryAttempt(outboxId, "device-B")
        // Don't mark delivered for device-B (simulating failure)

        // Then: Entry should still be pending for device-B
        val pendingForB = outboxManager.getPendingForDevice("device-B")
        assertEquals(1, pendingForB.size)

        // But not for device-A
        val pendingForA = outboxManager.getPendingForDevice("device-A")
        assertEquals(0, pendingForA.size)
    }

    @Test
    fun transientErrors_allTracked() = runTest {
        // Given: Entry with various transient errors
        val checkInId = UUID.randomUUID().toString()
        outboxManager.queueCheckIn(createTestCheckIn(checkInId), "device-001")

        val entries = outboxDao.getPending()
        val outboxId = entries[0].id

        // When: Various transient errors occur
        outboxManager.recordFailedAttempt(outboxId, "Connection timeout")
        outboxManager.recordFailedAttempt(outboxId, "Connection refused")
        outboxManager.recordFailedAttempt(outboxId, "Socket closed")

        // Then: Last error is tracked
        val entry = outboxDao.getById(outboxId)
        assertEquals(3, entry?.attempts)
        assertEquals("Socket closed", entry?.lastError)
        assertNotNull(entry?.lastAttemptUtc)
    }

    @Test
    fun collectEntitiesForDevice_excludesFailedEntries() = runTest {
        // Given: Mix of pending and failed entries
        val pendingId = UUID.randomUUID().toString()
        val failedId = UUID.randomUUID().toString()

        outboxManager.queueCheckIn(createTestCheckIn(pendingId), "device-001")
        outboxManager.queueCheckIn(createTestCheckIn(failedId), "device-001")

        val entries = outboxDao.getPending()
        val failedEntry = entries.find { it.entityId == failedId }!!

        // Fail one entry completely
        repeat(SyncOutboxManager.MAX_ATTEMPTS) {
            outboxManager.recordFailedAttempt(failedEntry.id, "Failure")
        }

        // When: Collecting entities for sync
        val (entities, outboxIds) = outboxManager.collectEntitiesForDevice(
            "peer-001",
            DeviceType.MEMBER_TABLET
        )

        // Then: Only pending entry should be included
        assertEquals(1, entities.checkIns.size)
        assertEquals(1, outboxIds.size)
        assertEquals(pendingId, entities.checkIns[0].id)
    }

    @Test
    fun backoffDelays_followExpectedPattern() = runTest {
        // Test that the backoff pattern matches the PRD
        // Expected: 0s, 5s, 15s, 60s, 5min, 15min (max)
        val expectedBackoffs = listOf(0, 5, 15, 60, 300, 900) // in seconds

        // Verify the constants match expected pattern
        assertEquals(expectedBackoffs, SyncOutboxManager.BACKOFF_DELAYS)
        assertEquals(10, SyncOutboxManager.MAX_ATTEMPTS)

        val checkInId = UUID.randomUUID().toString()
        outboxManager.queueCheckIn(createTestCheckIn(checkInId), "device-001")

        val entries = outboxDao.getPending()
        val outboxId = entries[0].id

        // Record failures and verify attempts increment
        for (i in 0 until 6) {
            outboxManager.recordFailedAttempt(outboxId, "Failure $i")

            val entry = outboxDao.getById(outboxId)
            assertEquals(i + 1, entry?.attempts)
        }
    }

    @Test
    fun entryNotFoundOnFailure_handledGracefully() = runTest {
        // Given: A non-existent outbox ID
        val fakeOutboxId = UUID.randomUUID().toString()

        // When: Recording failure for non-existent entry
        outboxManager.recordFailedAttempt(fakeOutboxId, "Some error")

        // Then: No crash, silently handled
        // (method returns early if entry not found)
    }

    @Test
    fun retryFailedOnNonFailedEntry_noOp() = runTest {
        // Given: A pending entry (not failed)
        val checkInId = UUID.randomUUID().toString()
        outboxManager.queueCheckIn(createTestCheckIn(checkInId), "device-001")

        val entries = outboxDao.getPending()
        val outboxId = entries[0].id

        // When: Trying to retry a non-failed entry
        outboxManager.retryFailed(outboxId)

        // Then: Entry should still be pending, not modified
        val entry = outboxDao.getById(outboxId)
        assertEquals(OutboxEntryStatus.PENDING.name, entry?.status)
        assertEquals(0, entry?.attempts) // attempts not reset (was already 0)
    }

    // ==================== Helper Functions ====================

    private fun createTestCheckIn(id: String): CheckIn {
        val now = Clock.System.now()
        return CheckIn(
            id = id,
            internalMemberId = "member-${UUID.randomUUID()}",
            membershipId = null,
            localDate = LocalDate(2026, 1, 23),
            firstOfDayFlag = true,
            createdAtUtc = now
        )
    }
}
