package com.club.medlems.domain.security

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class AttendantModeManager(private val scope: CoroutineScope, context: Context) {
    private val _state = MutableStateFlow(AttendantState())
    val state: StateFlow<AttendantState> = _state

    private var timerJob: Job? = null
    private var cooldownJob: Job? = null
    private val prefs = context.getSharedPreferences("attendant_mode", Context.MODE_PRIVATE)
    private var hashedPin: String = prefs.getString(KEY_PIN_HASH, null)
        ?: run {
            // Seed default PIN 3715 if not set yet
            val h = hash(DEFAULT_PIN)
            prefs.edit().putString(KEY_PIN_HASH, h).apply()
            h
        }
    private var failedAttempts = 0
    private val maxAttempts = 5
    private val cooldownMillis = 30_000L

    fun attemptUnlock(input: String) {
        if (_state.value.cooldownRemainingMs > 0) return
        if (hash(input) == hashedPin) {
            failedAttempts = 0
            _state.value = _state.value.copy(unlocked = true, error = null, cooldownRemainingMs = 0)
            startTimer()
        } else {
            failedAttempts++
            if (failedAttempts >= maxAttempts) {
                startCooldown()
            } else {
                _state.value = _state.value.copy(error = "Forkert PIN (${maxAttempts - failedAttempts} forsøg tilbage)")
            }
        }
    }

    fun lock() {
        _state.value = _state.value.copy(unlocked = false)
        timerJob?.cancel()
        timerJob = null
    }

    fun autoUnlock() {
        failedAttempts = 0
        _state.value = _state.value.copy(unlocked = true, error = null, cooldownRemainingMs = 0)
        startTimer()
    }

    fun registerInteraction() {
        if (_state.value.unlocked) startTimer()
    }

    /** Attempt to change the PIN. Returns true if successful. */
    fun changePin(oldPin: String, newPin: String): Boolean {
        if (hash(oldPin) != hashedPin) {
            _state.value = _state.value.copy(error = "Forkert nuværende PIN")
            return false
        }
        if (newPin.length != 4 || !newPin.all { it.isDigit() }) {
            _state.value = _state.value.copy(error = "Ny PIN skal være 4 cifre")
            return false
        }
        val newHash = hash(newPin)
        hashedPin = newHash
        prefs.edit().putString(KEY_PIN_HASH, newHash).apply()
        // Clear error to avoid lingering messages
        _state.value = _state.value.copy(error = null)
        return true
    }

    private fun startTimer() {
        timerJob?.cancel()
        timerJob = scope.launch(Dispatchers.Default) {
            delay(60_000) // 60s
            lock()
        }
    }

    private fun startCooldown() {
        cooldownJob?.cancel()
        val start = System.currentTimeMillis()
        cooldownJob = scope.launch(Dispatchers.Default) {
            while (true) {
                val elapsed = System.currentTimeMillis() - start
                val remaining = cooldownMillis - elapsed
                if (remaining <= 0) {
                    failedAttempts = 0
                    _state.value = _state.value.copy(error = null, cooldownRemainingMs = 0)
                    break
                } else {
                    _state.value = _state.value.copy(error = "Låst i ${(remaining/1000)}s", cooldownRemainingMs = remaining)
                }
                delay(1000)
            }
        }
    }

    private fun hash(pin: String): String {
        // Simple SHA-256 hash (not salted for MVP). Replace with proper KDF later.
        return java.security.MessageDigest.getInstance("SHA-256").digest(pin.toByteArray()).joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val KEY_PIN_HASH = "pin_hash"
        private const val DEFAULT_PIN = "3715"
    }
}

data class AttendantState(
    val unlocked: Boolean = false,
    val error: String? = null,
    val cooldownRemainingMs: Long = 0
)
