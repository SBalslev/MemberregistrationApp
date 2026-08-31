package com.club.medlems.network.display

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DisplayFeedRateLimiterTest {
    @Test
    fun `rejects requests above limit within window`() {
        val limiter = DisplayFeedRateLimiter(maxRequests = 2, windowMillis = 1_000)

        assertTrue(limiter.tryAcquire(1_000))
        assertTrue(limiter.tryAcquire(1_100))
        assertFalse(limiter.tryAcquire(1_200))
    }

    @Test
    fun `allows requests after window expires`() {
        val limiter = DisplayFeedRateLimiter(maxRequests = 1, windowMillis = 1_000)

        assertTrue(limiter.tryAcquire(1_000))
        assertFalse(limiter.tryAcquire(1_999))
        assertTrue(limiter.tryAcquire(2_000))
    }
}