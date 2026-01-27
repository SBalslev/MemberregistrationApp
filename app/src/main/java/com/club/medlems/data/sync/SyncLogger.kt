package com.club.medlems.data.sync

import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Centralized logging for sync events and troubleshooting.
 * 
 * Provides structured logging for all sync-related operations,
 * with log rotation and export capabilities for support.
 * 
 * @see [design.md FR-12] - Logging and Troubleshooting
 * @see [tasks.md 29.0] - Implement logging and troubleshooting infrastructure
 */
@Singleton
class SyncLogger @Inject constructor() {
    
    companion object {
        private const val TAG = "SyncLogger"
        private const val MAX_LOG_ENTRIES = 1000
        private const val LOG_RETENTION_DAYS = 7
    }
    
    /**
     * Log entry for sync events.
     */
    data class SyncLogEntry(
        val id: String = java.util.UUID.randomUUID().toString(),
        val timestamp: Instant = Clock.System.now(),
        val level: LogLevel,
        val category: LogCategory,
        val message: String,
        val deviceId: String? = null,
        val details: Map<String, Any?> = emptyMap()
    ) {
        val formattedTime: String
            get() {
                val local = timestamp.toLocalDateTime(TimeZone.currentSystemDefault())
                return "%02d:%02d:%02d".format(local.hour, local.minute, local.second)
            }
        
        val formattedDate: String
            get() {
                val local = timestamp.toLocalDateTime(TimeZone.currentSystemDefault())
                return "${local.year}-%02d-%02d".format(local.monthNumber, local.dayOfMonth)
            }
    }
    
    enum class LogLevel {
        DEBUG,
        INFO,
        WARNING,
        ERROR
    }
    
    enum class LogCategory {
        SYNC_INITIATED,
        SYNC_COMPLETED,
        SYNC_FAILED,
        DEVICE_DISCOVERED,
        DEVICE_CONNECTED,
        DEVICE_DISCONNECTED,
        PAIRING_STARTED,
        PAIRING_COMPLETED,
        PAIRING_FAILED,
        EQUIPMENT_CHECKOUT,
        EQUIPMENT_CHECKIN,
        CONFLICT_DETECTED,
        CONFLICT_RESOLVED,
        BACKUP_STARTED,
        BACKUP_COMPLETED,
        BACKUP_FAILED,
        RESTORE_STARTED,
        RESTORE_COMPLETED,
        RESTORE_FAILED
    }
    
    private val _logs = MutableStateFlow<List<SyncLogEntry>>(emptyList())
    val logs: StateFlow<List<SyncLogEntry>> = _logs.asStateFlow()
    
    private val _recentErrors = MutableStateFlow<List<SyncLogEntry>>(emptyList())
    val recentErrors: StateFlow<List<SyncLogEntry>> = _recentErrors.asStateFlow()
    
    // ===== Sync Events (29.2) =====
    
    /**
     * Log sync initiated event.
     */
    fun logSyncInitiated(targetDeviceId: String?, targetCount: Int = 1) {
        addLog(
            level = LogLevel.INFO,
            category = LogCategory.SYNC_INITIATED,
            message = "Sync initiated with ${if (targetDeviceId != null) "device $targetDeviceId" else "$targetCount devices"}",
            deviceId = targetDeviceId,
            details = mapOf("targetCount" to targetCount)
        )
    }
    
    /**
     * Log sync completed successfully.
     */
    fun logSyncCompleted(
        deviceId: String,
        membersPushed: Int,
        checkInsReceived: Int,
        sessionsReceived: Int,
        durationMs: Long
    ) {
        addLog(
            level = LogLevel.INFO,
            category = LogCategory.SYNC_COMPLETED,
            message = "Sync completed: $membersPushed members pushed, $checkInsReceived check-ins, $sessionsReceived sessions received",
            deviceId = deviceId,
            details = mapOf(
                "membersPushed" to membersPushed,
                "checkInsReceived" to checkInsReceived,
                "sessionsReceived" to sessionsReceived,
                "durationMs" to durationMs
            )
        )
    }
    
    /**
     * Log sync failed.
     */
    fun logSyncFailed(deviceId: String?, error: String, errorCode: Int? = null) {
        addLog(
            level = LogLevel.ERROR,
            category = LogCategory.SYNC_FAILED,
            message = "Sync failed: $error",
            deviceId = deviceId,
            details = mapOf("error" to error, "errorCode" to errorCode)
        )
    }
    
    // ===== Equipment Events (29.3) =====
    
    /**
     * Log equipment checkout.
     */
    fun logEquipmentCheckout(
        equipmentId: String,
        memberId: String,
        memberName: String?,
        deviceId: String
    ) {
        addLog(
            level = LogLevel.INFO,
            category = LogCategory.EQUIPMENT_CHECKOUT,
            message = "Equipment $equipmentId checked out to ${memberName ?: memberId}",
            deviceId = deviceId,
            details = mapOf(
                "equipmentId" to equipmentId,
                "memberId" to memberId,
                "memberName" to memberName
            )
        )
    }
    
    /**
     * Log equipment checkin (return).
     */
    fun logEquipmentCheckin(
        equipmentId: String,
        memberId: String,
        memberName: String?,
        deviceId: String,
        durationMinutes: Long?
    ) {
        addLog(
            level = LogLevel.INFO,
            category = LogCategory.EQUIPMENT_CHECKIN,
            message = "Equipment $equipmentId returned by ${memberName ?: memberId}${durationMinutes?.let { " after ${it}min" } ?: ""}",
            deviceId = deviceId,
            details = mapOf(
                "equipmentId" to equipmentId,
                "memberId" to memberId,
                "memberName" to memberName,
                "durationMinutes" to durationMinutes
            )
        )
    }
    
    // ===== Conflict Events (29.4) =====
    
    /**
     * Log conflict detected.
     */
    fun logConflictDetected(
        entityType: String,
        entityId: String,
        localDeviceId: String,
        remoteDeviceId: String,
        description: String
    ) {
        addLog(
            level = LogLevel.WARNING,
            category = LogCategory.CONFLICT_DETECTED,
            message = "Conflict detected: $description",
            deviceId = localDeviceId,
            details = mapOf(
                "entityType" to entityType,
                "entityId" to entityId,
                "localDeviceId" to localDeviceId,
                "remoteDeviceId" to remoteDeviceId
            )
        )
    }
    
    /**
     * Log conflict resolved.
     */
    fun logConflictResolved(
        entityType: String,
        entityId: String,
        resolution: String,
        resolvedBy: String?
    ) {
        addLog(
            level = LogLevel.INFO,
            category = LogCategory.CONFLICT_RESOLVED,
            message = "Conflict resolved for $entityType $entityId: $resolution",
            details = mapOf(
                "entityType" to entityType,
                "entityId" to entityId,
                "resolution" to resolution,
                "resolvedBy" to resolvedBy
            )
        )
    }
    
    // ===== Device Events =====
    
    /**
     * Log device discovered via mDNS or subnet scan.
     */
    fun logDeviceDiscovered(deviceId: String, deviceName: String, address: String) {
        addLog(
            level = LogLevel.DEBUG,
            category = LogCategory.DEVICE_DISCOVERED,
            message = "Discovered device: $deviceName at $address",
            deviceId = deviceId,
            details = mapOf("deviceName" to deviceName, "address" to address)
        )
    }
    
    /**
     * Log pairing started.
     */
    fun logPairingStarted(pairingCode: String) {
        addLog(
            level = LogLevel.INFO,
            category = LogCategory.PAIRING_STARTED,
            message = "Pairing started with code $pairingCode",
            details = mapOf("pairingCode" to pairingCode)
        )
    }
    
    /**
     * Log pairing completed.
     */
    fun logPairingCompleted(deviceId: String, deviceName: String, deviceType: String) {
        addLog(
            level = LogLevel.INFO,
            category = LogCategory.PAIRING_COMPLETED,
            message = "Device paired: $deviceName ($deviceType)",
            deviceId = deviceId,
            details = mapOf("deviceName" to deviceName, "deviceType" to deviceType)
        )
    }
    
    // ===== Log Management (29.5, 29.6) =====
    
    /**
     * Get all logs for a specific date.
     */
    fun getLogsForDate(date: String): List<SyncLogEntry> {
        return _logs.value.filter { it.formattedDate == date }
    }
    
    /**
     * Get logs by category.
     */
    fun getLogsByCategory(category: LogCategory): List<SyncLogEntry> {
        return _logs.value.filter { it.category == category }
    }
    
    /**
     * Get errors from the last N hours.
     */
    fun getRecentErrors(hoursBack: Int = 24): List<SyncLogEntry> {
        val cutoff = Clock.System.now().minus(kotlin.time.Duration.parse("${hoursBack}h"))
        return _logs.value.filter { 
            it.level == LogLevel.ERROR && it.timestamp >= cutoff
        }
    }
    
    /**
     * Export logs for sharing with support.
     * Returns logs as a formatted string.
     */
    fun exportLogs(daysBack: Int = 7): String {
        val cutoff = Clock.System.now().minus(kotlin.time.Duration.parse("${daysBack}d"))
        val filteredLogs = _logs.value.filter { it.timestamp >= cutoff }
        
        return buildString {
            appendLine("=== SYNC LOG EXPORT ===")
            appendLine("Generated: ${Clock.System.now()}")
            appendLine("Days: $daysBack")
            appendLine("Entries: ${filteredLogs.size}")
            appendLine()
            
            filteredLogs.forEach { log ->
                appendLine("[${log.formattedDate} ${log.formattedTime}] [${log.level}] [${log.category}]")
                appendLine("  ${log.message}")
                if (log.deviceId != null) {
                    appendLine("  Device: ${log.deviceId}")
                }
                if (log.details.isNotEmpty()) {
                    appendLine("  Details: ${log.details}")
                }
                appendLine()
            }
        }
    }
    
    /**
     * Clear old logs beyond retention period.
     */
    fun rotateOldLogs() {
        val cutoff = Clock.System.now().minus(kotlin.time.Duration.parse("${LOG_RETENTION_DAYS}d"))
        
        _logs.value = _logs.value.filter { it.timestamp >= cutoff }
        Log.d(TAG, "Log rotation complete. Entries: ${_logs.value.size}")
    }
    
    /**
     * Clear all logs.
     */
    fun clearLogs() {
        _logs.value = emptyList()
        _recentErrors.value = emptyList()
    }
    
    // ===== Internal =====
    
    private fun addLog(
        level: LogLevel,
        category: LogCategory,
        message: String,
        deviceId: String? = null,
        details: Map<String, Any?> = emptyMap()
    ) {
        val entry = SyncLogEntry(
            level = level,
            category = category,
            message = message,
            deviceId = deviceId,
            details = details
        )
        
        // Add to logs, keeping max size
        _logs.value = (_logs.value + entry).takeLast(MAX_LOG_ENTRIES)
        
        // Update recent errors
        if (level == LogLevel.ERROR) {
            _recentErrors.value = (_recentErrors.value + entry).takeLast(10)
        }
        
        // Also log to Android logcat
        when (level) {
            LogLevel.DEBUG -> Log.d(TAG, "[${category.name}] $message")
            LogLevel.INFO -> Log.i(TAG, "[${category.name}] $message")
            LogLevel.WARNING -> Log.w(TAG, "[${category.name}] $message")
            LogLevel.ERROR -> Log.e(TAG, "[${category.name}] $message")
        }
    }
}
