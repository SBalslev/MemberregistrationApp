package com.club.medlems.data.sync

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import org.junit.Assert.*
import org.junit.Test
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes

/**
 * Unit tests for ConnectionModels - specifically for per-peer sync time tracking.
 *
 * Tests verify that:
 * - ConnectionStats.lastSuccessfulSync is updated correctly
 * - DeviceConnectionProfile tracks sync success timestamps
 * - AddressRecord reliability scoring works as expected
 *
 * @see [TrustManager.recordSyncSuccess] - Uses these models
 * @see [SyncManager.getSyncStatusDetail] - Reads lastSuccessfulSync for UI
 */
class ConnectionModelsTest {

    // ===== ConnectionStats.lastSuccessfulSync Tests =====

    @Test
    fun `ConnectionStats withSuccess should update lastSuccessfulSync`() {
        val stats = ConnectionStats()
        assertNull("Initial lastSuccessfulSync should be null", stats.lastSuccessfulSync)

        val now = Clock.System.now()
        val updatedStats = stats.withSuccess(now)

        assertEquals("lastSuccessfulSync should be set to now", now, updatedStats.lastSuccessfulSync)
        assertEquals("totalAttempts should be 1", 1, updatedStats.totalAttempts)
        assertEquals("totalSuccesses should be 1", 1, updatedStats.totalSuccesses)
    }

    @Test
    fun `ConnectionStats withSuccess should overwrite previous lastSuccessfulSync`() {
        val firstTime = Instant.parse("2026-02-01T10:00:00Z")
        val secondTime = Instant.parse("2026-02-03T14:30:00Z")

        val stats = ConnectionStats().withSuccess(firstTime)
        assertEquals(firstTime, stats.lastSuccessfulSync)

        val updatedStats = stats.withSuccess(secondTime)
        assertEquals("lastSuccessfulSync should be updated to second time", secondTime, updatedStats.lastSuccessfulSync)
        assertEquals("totalAttempts should be 2", 2, updatedStats.totalAttempts)
        assertEquals("totalSuccesses should be 2", 2, updatedStats.totalSuccesses)
    }

    @Test
    fun `ConnectionStats withFailure should not change lastSuccessfulSync`() {
        val successTime = Instant.parse("2026-02-01T10:00:00Z")
        val stats = ConnectionStats().withSuccess(successTime)

        val afterFailure = stats.withFailure()

        assertEquals("lastSuccessfulSync should remain unchanged after failure", successTime, afterFailure.lastSuccessfulSync)
        assertEquals("totalAttempts should be 2", 2, afterFailure.totalAttempts)
        assertEquals("totalSuccesses should still be 1", 1, afterFailure.totalSuccesses)
    }

    @Test
    fun `ConnectionStats copy with only lastSuccessfulSync changed should preserve other fields`() {
        val now = Clock.System.now()
        val stats = ConnectionStats(
            totalAttempts = 5,
            totalSuccesses = 4,
            averageReconnectMs = 1500,
            lastSuccessfulSync = now.minus(1.hours)
        )

        val newSyncTime = now
        val updated = stats.copy(lastSuccessfulSync = newSyncTime)

        assertEquals("totalAttempts should be preserved", 5, updated.totalAttempts)
        assertEquals("totalSuccesses should be preserved", 4, updated.totalSuccesses)
        assertEquals("averageReconnectMs should be preserved", 1500, updated.averageReconnectMs)
        assertEquals("lastSuccessfulSync should be updated", newSyncTime, updated.lastSuccessfulSync)
    }

    // ===== DeviceConnectionProfile Sync Success Tests =====

    @Test
    fun `DeviceConnectionProfile should track lastSuccessfulSync via ConnectionStats`() {
        val deviceInfo = DeviceInfo(
            id = "device-123",
            name = "Test Laptop",
            type = DeviceType.LAPTOP,
            pairedAtUtc = Clock.System.now()
        )
        val profile = DeviceConnectionProfile(
            deviceId = deviceInfo.id,
            deviceInfo = deviceInfo
        )

        assertNull("Initial profile should have no lastSuccessfulSync",
            profile.connectionStats.lastSuccessfulSync)

        val now = Clock.System.now()
        val updatedProfile = profile.copy(
            connectionStats = profile.connectionStats.copy(lastSuccessfulSync = now)
        )

        assertEquals("Profile should have updated lastSuccessfulSync",
            now, updatedProfile.connectionStats.lastSuccessfulSync)
    }

    @Test
    fun `DeviceConnectionProfile withSuccessfulConnection should update lastSuccessfulSync`() {
        val deviceInfo = DeviceInfo(
            id = "device-456",
            name = "Test Tablet",
            type = DeviceType.MEMBER_TABLET,
            pairedAtUtc = Clock.System.now()
        )
        val profile = DeviceConnectionProfile(
            deviceId = deviceInfo.id,
            deviceInfo = deviceInfo
        )

        val now = Clock.System.now()
        val updatedProfile = profile.withSuccessfulConnection("192.168.1.100", 8085, now)

        assertEquals("lastSuccessfulSync should be updated",
            now, updatedProfile.connectionStats.lastSuccessfulSync)
        assertEquals("Should have one known address", 1, updatedProfile.knownAddresses.size)
        assertEquals("Preferred port should be updated", 8085, updatedProfile.preferredPort)
    }

    // ===== AddressRecord Reliability Tests =====

    @Test
    fun `AddressRecord reliability should be 0 with no attempts`() {
        val record = AddressRecord(
            ip = "192.168.1.100",
            firstSeen = Clock.System.now(),
            lastSeen = Clock.System.now(),
            successCount = 0,
            failCount = 0
        )

        assertEquals("Reliability with no attempts should be 0", 0f, record.reliability)
    }

    @Test
    fun `AddressRecord reliability should be 1 with all successes`() {
        val record = AddressRecord(
            ip = "192.168.1.100",
            firstSeen = Clock.System.now(),
            lastSeen = Clock.System.now(),
            successCount = 10,
            failCount = 0
        )

        assertEquals("Reliability with all successes should be 1", 1f, record.reliability)
    }

    @Test
    fun `AddressRecord reliability should be 0 with all failures`() {
        val record = AddressRecord(
            ip = "192.168.1.100",
            firstSeen = Clock.System.now(),
            lastSeen = Clock.System.now(),
            successCount = 0,
            failCount = 10
        )

        assertEquals("Reliability with all failures should be 0", 0f, record.reliability)
    }

    @Test
    fun `AddressRecord reliability should be 0_5 with equal success and failure`() {
        val record = AddressRecord(
            ip = "192.168.1.100",
            firstSeen = Clock.System.now(),
            lastSeen = Clock.System.now(),
            successCount = 5,
            failCount = 5
        )

        assertEquals("Reliability with 50/50 should be 0.5", 0.5f, record.reliability)
    }

    @Test
    fun `AddressRecord withSuccess should increment successCount and update lastSeen`() {
        val firstTime = Instant.parse("2026-02-01T10:00:00Z")
        val secondTime = Instant.parse("2026-02-03T14:30:00Z")

        val record = AddressRecord(
            ip = "192.168.1.100",
            firstSeen = firstTime,
            lastSeen = firstTime,
            successCount = 3,
            failCount = 1
        )

        val updated = record.withSuccess(secondTime)

        assertEquals("successCount should be incremented", 4, updated.successCount)
        assertEquals("failCount should be unchanged", 1, updated.failCount)
        assertEquals("lastSeen should be updated", secondTime, updated.lastSeen)
        assertEquals("firstSeen should be unchanged", firstTime, updated.firstSeen)
    }

    @Test
    fun `AddressRecord withFailure should increment failCount and update lastSeen`() {
        val firstTime = Instant.parse("2026-02-01T10:00:00Z")
        val failTime = Instant.parse("2026-02-03T14:30:00Z")

        val record = AddressRecord(
            ip = "192.168.1.100",
            firstSeen = firstTime,
            lastSeen = firstTime,
            successCount = 3,
            failCount = 1
        )

        val updated = record.withFailure(failTime)

        assertEquals("successCount should be unchanged", 3, updated.successCount)
        assertEquals("failCount should be incremented", 2, updated.failCount)
        assertEquals("lastSeen should be updated", failTime, updated.lastSeen)
    }

    // ===== DeviceConnectionProfile Address Sorting Tests =====

    @Test
    fun `getAddressesByReliability should return addresses sorted by reliability descending`() {
        val now = Clock.System.now()
        val deviceInfo = DeviceInfo(
            id = "device-789",
            name = "Test Device",
            type = DeviceType.LAPTOP,
            pairedAtUtc = now
        )

        val addresses = listOf(
            AddressRecord("192.168.1.1", now, now, successCount = 5, failCount = 5),   // 0.5
            AddressRecord("192.168.1.2", now, now, successCount = 9, failCount = 1),   // 0.9
            AddressRecord("192.168.1.3", now, now, successCount = 1, failCount = 9)    // 0.1
        )

        val profile = DeviceConnectionProfile(
            deviceId = deviceInfo.id,
            deviceInfo = deviceInfo,
            knownAddresses = addresses
        )

        val sorted = profile.getAddressesByReliability()

        assertEquals("First address should be most reliable", "192.168.1.2", sorted[0].ip)
        assertEquals("Second address should be middle reliability", "192.168.1.1", sorted[1].ip)
        assertEquals("Third address should be least reliable", "192.168.1.3", sorted[2].ip)
    }

    @Test
    fun `getMostRecentAddress should return address with latest lastSeen`() {
        val oldest = Instant.parse("2026-01-01T10:00:00Z")
        val middle = Instant.parse("2026-01-15T10:00:00Z")
        val newest = Instant.parse("2026-02-01T10:00:00Z")

        val deviceInfo = DeviceInfo(
            id = "device-abc",
            name = "Test Device",
            type = DeviceType.LAPTOP,
            pairedAtUtc = oldest
        )

        val addresses = listOf(
            AddressRecord("192.168.1.1", oldest, middle, successCount = 1, failCount = 0),
            AddressRecord("192.168.1.2", oldest, oldest, successCount = 1, failCount = 0),
            AddressRecord("192.168.1.3", oldest, newest, successCount = 1, failCount = 0)
        )

        val profile = DeviceConnectionProfile(
            deviceId = deviceInfo.id,
            deviceInfo = deviceInfo,
            knownAddresses = addresses
        )

        val mostRecent = profile.getMostRecentAddress()

        assertNotNull("Should find most recent address", mostRecent)
        assertEquals("Most recent address should be .3", "192.168.1.3", mostRecent?.ip)
    }

    // ===== ConnectionStats successRate Tests =====

    @Test
    fun `ConnectionStats successRate should be 0 with no attempts`() {
        val stats = ConnectionStats()
        assertEquals("Success rate with no attempts should be 0", 0f, stats.successRate)
    }

    @Test
    fun `ConnectionStats successRate should be 1 with all successes`() {
        val stats = ConnectionStats(totalAttempts = 10, totalSuccesses = 10)
        assertEquals("Success rate with all successes should be 1", 1f, stats.successRate)
    }

    @Test
    fun `ConnectionStats successRate should calculate correctly with mixed results`() {
        val stats = ConnectionStats(totalAttempts = 10, totalSuccesses = 7)
        assertEquals("Success rate should be 0.7", 0.7f, stats.successRate, 0.001f)
    }

    // ===== ConnectionStats withReconnectTime Tests =====

    @Test
    fun `ConnectionStats withReconnectTime should set initial value directly`() {
        val stats = ConnectionStats()
        assertEquals("Initial averageReconnectMs should be 0", 0L, stats.averageReconnectMs)

        val updated = stats.withReconnectTime(1000)
        assertEquals("First reconnect time should be set directly", 1000L, updated.averageReconnectMs)
    }

    @Test
    fun `ConnectionStats withReconnectTime should use exponential moving average`() {
        // Start with 1000ms average
        val stats = ConnectionStats(averageReconnectMs = 1000)

        // New measurement of 500ms
        // EMA = (1000 * 0.7) + (500 * 0.3) = 700 + 150 = 850
        val updated = stats.withReconnectTime(500)

        assertEquals("EMA should be calculated correctly", 850L, updated.averageReconnectMs)
    }
}
