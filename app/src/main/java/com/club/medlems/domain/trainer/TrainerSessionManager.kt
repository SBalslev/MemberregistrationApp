package com.club.medlems.domain.trainer

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Session state for trainer authentication.
 *
 * @param isSessionActive Whether a trainer session is currently active
 * @param currentTrainerId The member ID of the currently authenticated trainer, or null
 * @param trainerName Display name of the authenticated trainer
 * @param sessionStartTime When the current session started, or null
 * @param secondsRemaining Seconds until session expires (for UI countdown)
 * @param isExpiring True when session is about to expire (last 10 seconds)
 */
data class TrainerSessionState(
    val isSessionActive: Boolean = false,
    val currentTrainerId: String? = null,
    val trainerName: String? = null,
    val sessionStartTime: Instant? = null,
    val secondsRemaining: Int = 0,
    val isExpiring: Boolean = false
)

/**
 * Singleton class managing trainer session state.
 *
 * Handles:
 * - Starting trainer sessions upon successful authentication
 * - 60-second session timeout with automatic expiry
 * - Warning callback at 10 seconds before expiry
 * - Session extension on user interaction
 * - Manual session termination (logout)
 *
 * @see [trainer-experience/prd.md] Phase 2 - Trainer Authentication
 */
@Singleton
class TrainerSessionManager @Inject constructor(
    private val scope: CoroutineScope
) {
    companion object {
        /** Session duration in milliseconds (60 seconds) */
        private const val SESSION_DURATION_MS = 60_000L

        /** Warning threshold in milliseconds (10 seconds before expiry) */
        private const val WARNING_THRESHOLD_MS = 10_000L

        /** Timer tick interval in milliseconds */
        private const val TICK_INTERVAL_MS = 1_000L
    }

    private val _sessionState = MutableStateFlow(TrainerSessionState())
    val sessionState: StateFlow<TrainerSessionState> = _sessionState.asStateFlow()

    private var timerJob: Job? = null
    private var sessionEndTime: Long = 0L

    /** Callback invoked when session is about to expire (10s warning) */
    var onSessionExpiring: (() -> Unit)? = null

    /** Callback invoked when session has expired */
    var onSessionExpired: (() -> Unit)? = null

    /**
     * Starts a new trainer session for the given member.
     *
     * @param memberId The internal member ID of the trainer
     * @param trainerName Display name of the trainer (for UI)
     */
    fun startSession(memberId: String, trainerName: String? = null) {
        val now = Clock.System.now()
        sessionEndTime = System.currentTimeMillis() + SESSION_DURATION_MS

        _sessionState.value = TrainerSessionState(
            isSessionActive = true,
            currentTrainerId = memberId,
            trainerName = trainerName,
            sessionStartTime = now,
            secondsRemaining = (SESSION_DURATION_MS / 1000).toInt(),
            isExpiring = false
        )

        startTimer()
    }

    /**
     * Extends the current session by resetting the timeout to 60 seconds.
     * Does nothing if no session is active.
     */
    fun extendSession() {
        if (!_sessionState.value.isSessionActive) return

        sessionEndTime = System.currentTimeMillis() + SESSION_DURATION_MS

        _sessionState.value = _sessionState.value.copy(
            secondsRemaining = (SESSION_DURATION_MS / 1000).toInt(),
            isExpiring = false
        )

        // Restart timer to sync with new end time
        startTimer()
    }

    /**
     * Ends the current trainer session immediately.
     * This is called when the trainer logs out manually.
     */
    fun endSession() {
        timerJob?.cancel()
        timerJob = null
        sessionEndTime = 0L

        _sessionState.value = TrainerSessionState()
    }

    /**
     * Registers user interaction, which extends the session.
     * Called when trainer performs any action in the app.
     */
    fun registerInteraction() {
        if (_sessionState.value.isSessionActive) {
            extendSession()
        }
    }

    /**
     * Gets the current trainer ID if a session is active.
     */
    val currentTrainerId: String?
        get() = _sessionState.value.currentTrainerId

    /**
     * Gets whether a session is currently active.
     */
    val isSessionActive: Boolean
        get() = _sessionState.value.isSessionActive

    /**
     * Gets the session start time, or null if no session is active.
     */
    val sessionStartTime: Instant?
        get() = _sessionState.value.sessionStartTime

    private fun startTimer() {
        timerJob?.cancel()
        timerJob = scope.launch(Dispatchers.Default) {
            var hasTriggeredWarning = false

            while (true) {
                val now = System.currentTimeMillis()
                val remaining = sessionEndTime - now

                if (remaining <= 0) {
                    // Session expired
                    endSession()
                    onSessionExpired?.invoke()
                    break
                }

                val secondsRemaining = (remaining / 1000).toInt()
                val isExpiring = remaining <= WARNING_THRESHOLD_MS

                // Trigger warning callback once when entering expiring state
                if (isExpiring && !hasTriggeredWarning) {
                    hasTriggeredWarning = true
                    onSessionExpiring?.invoke()
                }

                _sessionState.value = _sessionState.value.copy(
                    secondsRemaining = secondsRemaining,
                    isExpiring = isExpiring
                )

                delay(TICK_INTERVAL_MS)
            }
        }
    }
}
