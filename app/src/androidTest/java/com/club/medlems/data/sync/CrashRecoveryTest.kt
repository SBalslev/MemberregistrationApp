package com.club.medlems.data.sync

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.club.medlems.data.db.AppDatabase
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.ScanEvent
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

/**
 * Integration tests for sync outbox crash recovery.
 *
 * Tests that outbox entries persist across database close/reopen (simulating app restart),
 * ensuring at-least-once delivery semantics survive process death.
 *
 * @see [sync-reliability/tasks.md] Task 7.3
 */
@RunWith(AndroidJUnit4::class)
class CrashRecoveryTest {

    private lateinit var context: Context
    private lateinit var db: AppDatabase
    private lateinit var outboxDao: SyncOutboxDao
    private lateinit var outboxManager: SyncOutboxManager
    private val json = Json { ignoreUnknownKeys = true }
    private lateinit var testDbName: String

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        testDbName = "test-crash-recovery-${UUID.randomUUID()}"
        // Use a real (not in-memory) database for persistence testing
        db = Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            testDbName
        ).allowMainThreadQueries().build()

        outboxDao = db.syncOutboxDao()
        outboxManager = SyncOutboxManager(outboxDao, json)
    }

    @After
    fun teardown() {
        db.close()
        // Clean up the test database file
        context.deleteDatabase(testDbName)
    }

    // ==================== Task 7.3: Crash Recovery Tests ====================

    @Test
    fun outboxEntries_surviveDbCloseAndReopen() = runTest {
        // Given: Queue a check-in to the outbox
        val checkInId = UUID.randomUUID().toString()
        val checkIn = createTestCheckIn(checkInId)
        outboxManager.queueCheckIn(checkIn, "device-001")

        // Verify entry exists
        val beforeClose = outboxDao.getPending()
        assertEquals(1, beforeClose.size)
        assertEquals(checkInId, beforeClose[0].entityId)

        // When: Close the database (simulating app death)
        db.close()

        // Reopen the database (simulating app restart)
        db = Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            testDbName
        ).allowMainThreadQueries().build()

        val reopenedDao = db.syncOutboxDao()

        // Then: Entry should still be there
        val afterReopen = reopenedDao.getPending()
        assertEquals(1, afterReopen.size)
        assertEquals(checkInId, afterReopen[0].entityId)
        assertEquals("CheckIn", afterReopen[0].entityType)
        assertEquals(OutboxEntryStatus.PENDING.name, afterReopen[0].status)
    }

    @Test
    fun multipleOutboxEntries_allSurviveRestart() = runTest {
        // Given: Queue multiple entities of different types
        val checkInId = UUID.randomUUID().toString()
        val sessionId = UUID.randomUUID().toString()
        val scanEventId = UUID.randomUUID().toString()

        outboxManager.queueCheckIn(createTestCheckIn(checkInId), "device-001")
        outboxManager.queuePracticeSession(createTestSession(sessionId), "device-001")
        outboxManager.queueScanEvent(createTestScanEvent(scanEventId), "device-001")

        assertEquals(3, outboxDao.getPending().size)

        // When: Close and reopen database
        db.close()

        db = Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            testDbName
        ).allowMainThreadQueries().build()

        // Then: All entries survive
        val afterReopen = db.syncOutboxDao().getPending()
        assertEquals(3, afterReopen.size)

        val entityTypes = afterReopen.map { it.entityType }.toSet()
        assertTrue(entityTypes.contains("CheckIn"))
        assertTrue(entityTypes.contains("PracticeSession"))
        assertTrue(entityTypes.contains("ScanEvent"))
    }

    @Test
    fun deliveryTracking_surviveRestart() = runTest {
        // Given: Queue entry and mark delivery attempt
        val checkInId = UUID.randomUUID().toString()
        val deviceId = "peer-device-001"

        outboxManager.queueCheckIn(createTestCheckIn(checkInId), "device-001")
        val entries = outboxDao.getPending()
        val outboxId = entries[0].id

        // Record a delivery attempt
        outboxManager.recordDeliveryAttempt(outboxId, deviceId)

        // When: Close and reopen database
        db.close()

        db = Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            testDbName
        ).allowMainThreadQueries().build()

        // Then: Delivery tracking survives
        val deliveries = db.syncOutboxDao().getDeliveriesForEntry(outboxId)
        assertEquals(1, deliveries.size)
        assertEquals(deviceId, deliveries[0].deviceId)
        assertEquals(1, deliveries[0].attempts)
    }

    @Test
    fun failedAttempts_surviveRestart_andRetryWorks() = runTest {
        // Given: Queue entry and record failure
        val checkInId = UUID.randomUUID().toString()

        outboxManager.queueCheckIn(createTestCheckIn(checkInId), "device-001")
        val entries = outboxDao.getPending()
        val outboxId = entries[0].id

        // Record a failed attempt
        outboxManager.recordFailedAttempt(outboxId, "Network timeout")

        // Entry should now have nextRetryAtUtc set
        val afterFailure = outboxDao.getById(outboxId)
        assertEquals(1, afterFailure?.attempts)
        assertTrue(afterFailure?.lastError?.contains("Network timeout") == true)

        // When: Close and reopen database
        db.close()

        db = Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            testDbName
        ).allowMainThreadQueries().build()

        val reopenedDao = db.syncOutboxDao()
        val reopenedManager = SyncOutboxManager(reopenedDao, json)

        // Then: Failed entry state survives
        val afterReopen = reopenedDao.getById(outboxId)
        assertEquals(1, afterReopen?.attempts)
        assertTrue(afterReopen?.lastError?.contains("Network timeout") == true)

        // Mark as failed for retry test
        repeat(SyncOutboxManager.MAX_ATTEMPTS - 1) {
            reopenedManager.recordFailedAttempt(outboxId, "Persistent failure")
        }
        assertEquals(OutboxEntryStatus.FAILED.name, reopenedDao.getById(outboxId)?.status)

        // And: Retry should be possible
        reopenedManager.retryFailed(outboxId)
        val afterRetry = reopenedDao.getById(outboxId)
        assertEquals(OutboxEntryStatus.PENDING.name, afterRetry?.status)
        assertEquals(0, afterRetry?.attempts)
    }

    @Test
    fun pendingCountFlow_emitsAfterRestart() = runTest {
        // Given: Queue some entries
        outboxManager.queueCheckIn(createTestCheckIn(UUID.randomUUID().toString()), "device-001")
        outboxManager.queueCheckIn(createTestCheckIn(UUID.randomUUID().toString()), "device-001")

        // When: Close and reopen database
        db.close()

        db = Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            testDbName
        ).allowMainThreadQueries().build()

        val reopenedManager = SyncOutboxManager(db.syncOutboxDao(), json)

        // Then: Flow should emit correct count
        val pendingCount = reopenedManager.observePendingCount().first()
        assertEquals(2, pendingCount)
    }

    @Test
    fun inProgressEntries_resetToPendingOnRestart() = runTest {
        // This tests the scenario where app crashed during sync
        // Given: Entry marked as in_progress (simulating mid-sync crash)
        val checkInId = UUID.randomUUID().toString()
        outboxManager.queueCheckIn(createTestCheckIn(checkInId), "device-001")

        val entries = outboxDao.getPending()
        val outboxId = entries[0].id

        // Manually set to in_progress (simulating sync started but crashed)
        outboxDao.updateStatus(outboxId, OutboxEntryStatus.IN_PROGRESS.name)

        // Verify it's in_progress
        assertEquals(OutboxEntryStatus.IN_PROGRESS.name, outboxDao.getById(outboxId)?.status)

        // When: Close and reopen database (simulating restart after crash)
        db.close()

        db = Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            testDbName
        ).allowMainThreadQueries().build()

        val reopenedDao = db.syncOutboxDao()
        val reopenedManager = SyncOutboxManager(reopenedDao, json)

        // Then: Entry should be reset to pending (call recovery method)
        reopenedManager.recoverStaleInProgressEntries()

        val afterRecovery = reopenedDao.getById(outboxId)
        assertEquals(OutboxEntryStatus.PENDING.name, afterRecovery?.status)
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

    private fun createTestSession(id: String): PracticeSession {
        val now = Clock.System.now()
        return PracticeSession(
            id = id,
            internalMemberId = "member-${UUID.randomUUID()}",
            membershipId = null,
            localDate = LocalDate(2026, 1, 23),
            practiceType = "Pistol",
            points = 0,
            krydser = 0,
            classification = null,
            source = "TABLET",
            createdAtUtc = now
        )
    }

    private fun createTestScanEvent(id: String): ScanEvent {
        val now = Clock.System.now()
        return ScanEvent(
            id = id,
            internalMemberId = "member-${UUID.randomUUID()}",
            membershipId = null,
            type = "CHECKIN",
            linkedCheckInId = null,
            linkedSessionId = null,
            canceledFlag = false,
            createdAtUtc = now
        )
    }
}
