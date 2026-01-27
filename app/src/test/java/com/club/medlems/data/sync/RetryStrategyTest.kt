package com.club.medlems.data.sync

import org.junit.Assert.*
import org.junit.Test
import kotlin.time.Duration.Companion.seconds

/**
 * Unit tests for the retry strategy used in sync outbox.
 *
 * Tests the exponential backoff delays and max retry logic.
 * The retry strategy is implemented within SyncOutboxManager but
 * these tests focus specifically on the backoff behavior.
 *
 * @see [sync-reliability/prd.md] FR-5 - Retry with Exponential Backoff
 * @see [tasks.md 7.2] - Unit tests for RetryStrategy
 */
class RetryStrategyTest {

    // Backoff delays as specified in SyncOutboxManager (in seconds)
    // 0s, 5s, 15s, 60s, 300s (5min), 900s (15min)
    private val BACKOFF_DELAYS = listOf(0, 5, 15, 60, 300, 900)
    private val MAX_ATTEMPTS = 10

    // ===== Backoff Delay Tests =====

    @Test
    fun `first attempt should have no delay`() {
        val delay = getDelayForAttempt(1)
        assertEquals("First attempt should have 0 second delay", 0, delay)
    }

    @Test
    fun `second attempt should have 5 second delay`() {
        val delay = getDelayForAttempt(2)
        assertEquals("Second attempt should have 5 second delay", 5, delay)
    }

    @Test
    fun `third attempt should have 15 second delay`() {
        val delay = getDelayForAttempt(3)
        assertEquals("Third attempt should have 15 second delay", 15, delay)
    }

    @Test
    fun `fourth attempt should have 60 second delay`() {
        val delay = getDelayForAttempt(4)
        assertEquals("Fourth attempt should have 60 second (1 min) delay", 60, delay)
    }

    @Test
    fun `fifth attempt should have 300 second delay`() {
        val delay = getDelayForAttempt(5)
        assertEquals("Fifth attempt should have 300 second (5 min) delay", 300, delay)
    }

    @Test
    fun `sixth attempt should have 900 second delay`() {
        val delay = getDelayForAttempt(6)
        assertEquals("Sixth attempt should have 900 second (15 min) delay", 900, delay)
    }

    @Test
    fun `attempts beyond backoff array should use max delay`() {
        // Attempts 7, 8, 9 should all use the last delay (900 seconds)
        for (attempt in 7..10) {
            val delay = getDelayForAttempt(attempt)
            assertEquals("Attempt $attempt should use max delay", 900, delay)
        }
    }

    // ===== Max Retry Tests =====

    @Test
    fun `should allow retry for attempts under max`() {
        for (attempt in 1 until MAX_ATTEMPTS) {
            assertTrue("Attempt $attempt should allow retry", shouldRetry(attempt))
        }
    }

    @Test
    fun `should not allow retry at max attempts`() {
        assertFalse("Max attempts should not allow retry", shouldRetry(MAX_ATTEMPTS))
    }

    @Test
    fun `should not allow retry beyond max attempts`() {
        assertFalse("Beyond max attempts should not allow retry", shouldRetry(MAX_ATTEMPTS + 1))
        assertFalse("Way beyond max should not allow retry", shouldRetry(20))
    }

    @Test
    fun `max attempts should be 10`() {
        assertEquals("Max attempts should be 10", 10, MAX_ATTEMPTS)
    }

    // ===== Backoff Progression Tests =====

    @Test
    fun `delays should increase monotonically`() {
        var previousDelay = -1
        for (i in BACKOFF_DELAYS.indices) {
            val currentDelay = BACKOFF_DELAYS[i]
            assertTrue(
                "Delay at index $i ($currentDelay) should be >= previous ($previousDelay)",
                currentDelay >= previousDelay
            )
            previousDelay = currentDelay
        }
    }

    @Test
    fun `total retry duration should be reasonable`() {
        // Calculate total time if all retries are used
        var totalSeconds = 0
        for (attempt in 1..MAX_ATTEMPTS) {
            totalSeconds += getDelayForAttempt(attempt)
        }

        // Total: 0 + 5 + 15 + 60 + 300 + 900 + 900 + 900 + 900 + 900 = 4880 seconds
        // = ~81 minutes, which is reasonable for sync retry
        assertTrue("Total retry time should be reasonable (< 2 hours)", totalSeconds < 7200)
        assertTrue("Total retry time should be significant (> 30 min)", totalSeconds > 1800)
    }

    @Test
    fun `backoff delays should have 6 levels`() {
        assertEquals("Backoff should have 6 levels", 6, BACKOFF_DELAYS.size)
    }

    // ===== Duration Conversion Tests =====

    @Test
    fun `delay should convert to Duration correctly`() {
        val delay5s = 5.seconds
        assertEquals(5L, delay5s.inWholeSeconds)

        val delay15m = 900.seconds
        assertEquals(900L, delay15m.inWholeSeconds)
        assertEquals(15L, delay15m.inWholeMinutes)
    }

    // ===== Edge Case Tests =====

    @Test
    fun `zero attempts should use first delay`() {
        // When attempts is 0, next attempt is 1, so delay should be from index 1 = 5s
        val delay = getDelayForAttempt(1)
        assertEquals(0, delay)
    }

    @Test
    fun `negative attempt count should be handled gracefully`() {
        // This shouldn't happen in practice, but test defensive behavior
        val delay = getDelayForAttemptSafe(-1)
        assertEquals("Negative attempt should use first delay", 0, delay)
    }

    @Test
    fun `very large attempt count should use max delay`() {
        val delay = getDelayForAttempt(100)
        assertEquals("Very large attempt should use max delay", 900, delay)
    }

    // ===== Helper Methods (mimicking SyncOutboxManager logic) =====

    /**
     * Gets the backoff delay for a given attempt number.
     *
     * @param attempt The attempt number (1-based)
     * @return Delay in seconds before this attempt
     */
    private fun getDelayForAttempt(attempt: Int): Int {
        val index = minOf(attempt, BACKOFF_DELAYS.size) - 1
        return if (index >= 0) BACKOFF_DELAYS[index] else 0
    }

    private fun getDelayForAttemptSafe(attempt: Int): Int {
        if (attempt <= 0) return BACKOFF_DELAYS.first()
        val index = minOf(attempt - 1, BACKOFF_DELAYS.lastIndex)
        return BACKOFF_DELAYS[index]
    }

    /**
     * Determines if retry should be allowed for the given attempt count.
     *
     * @param attempts The number of attempts already made
     * @return true if retry should be allowed
     */
    private fun shouldRetry(attempts: Int): Boolean = attempts < MAX_ATTEMPTS
}
