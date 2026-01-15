package com.club.medlems.data.sync

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Centralized logging for sync operations.
 * Provides a visible log for debugging sync issues on the device.
 */
@Singleton
class SyncLogManager @Inject constructor() {
    companion object {
        private const val MAX_LOG_ENTRIES = 100
    }
    
    private val _logEntries = MutableStateFlow<List<SyncLogEntry>>(emptyList())
    val logEntries: StateFlow<List<SyncLogEntry>> = _logEntries.asStateFlow()
    
    /**
     * Logs an informational message.
     */
    fun info(source: String, message: String) {
        addEntry(SyncLogLevel.INFO, source, message)
    }
    
    /**
     * Logs a warning message.
     */
    fun warn(source: String, message: String) {
        addEntry(SyncLogLevel.WARN, source, message)
    }
    
    /**
     * Logs an error message.
     */
    fun error(source: String, message: String, exception: Throwable? = null) {
        val fullMessage = if (exception != null) {
            "$message: ${exception.message}"
        } else {
            message
        }
        addEntry(SyncLogLevel.ERROR, source, fullMessage)
    }
    
    /**
     * Logs a debug message.
     */
    fun debug(source: String, message: String) {
        addEntry(SyncLogLevel.DEBUG, source, message)
    }
    
    /**
     * Clears all log entries.
     */
    fun clear() {
        _logEntries.value = emptyList()
    }
    
    private fun addEntry(level: SyncLogLevel, source: String, message: String) {
        val entry = SyncLogEntry(
            timestamp = Clock.System.now(),
            level = level,
            source = source,
            message = message
        )
        
        _logEntries.value = (_logEntries.value + entry).takeLast(MAX_LOG_ENTRIES)
    }
}

/**
 * A single log entry.
 */
data class SyncLogEntry(
    val timestamp: Instant,
    val level: SyncLogLevel,
    val source: String,
    val message: String
)

/**
 * Log severity levels.
 */
enum class SyncLogLevel {
    DEBUG,
    INFO,
    WARN,
    ERROR
}
