package com.club.medlems.network.display

class DisplayFeedRateLimiter(
    private val maxRequests: Int = 120,
    private val windowMillis: Long = 60_000L
) {
    private val requestTimes = ArrayDeque<Long>()

    @Synchronized
    fun tryAcquire(nowMillis: Long = System.currentTimeMillis()): Boolean {
        val windowStart = nowMillis - windowMillis
        while (requestTimes.firstOrNull()?.let { it <= windowStart } == true) {
            requestTimes.removeFirst()
        }
        if (requestTimes.size >= maxRequests) return false

        requestTimes.addLast(nowMillis)
        return true
    }
}