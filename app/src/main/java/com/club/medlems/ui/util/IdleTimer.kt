package com.club.medlems.ui.util

import androidx.compose.runtime.*
import kotlinx.coroutines.delay

/**
 * Generic idle countdown composable.
 * @param totalSeconds total countdown start value
 * @param restartKey any value that when changed resets the timer
 * @param active when false the timer is paused
 * @param onTick receives remaining seconds (after decrement)
 * @param onTimeout invoked when remaining hits 0 while active
 */
@Composable
fun IdleCountdown(
    totalSeconds: Int,
    restartKey: Any?,
    active: Boolean,
    onTick: (Int) -> Unit,
    onTimeout: () -> Unit
) {
    var remaining by remember(totalSeconds, restartKey, active) { mutableStateOf(totalSeconds) }
    LaunchedEffect(totalSeconds, restartKey, active) {
        if (!active) return@LaunchedEffect
        remaining = totalSeconds
        while (remaining > 0 && active) {
            delay(1000)
            remaining -= 1
            onTick(remaining)
        }
        if (remaining == 0 && active) onTimeout()
    }
}
