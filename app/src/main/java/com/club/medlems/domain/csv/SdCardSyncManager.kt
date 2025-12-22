package com.club.medlems.domain.csv

import android.content.Context
import android.os.Environment
import com.club.medlems.domain.prefs.SdCardSyncPreferences
import kotlinx.coroutines.*
import kotlinx.datetime.Clock
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import android.util.Log

@Singleton
class SdCardSyncManager @Inject constructor(
    private val context: Context,
    private val csvService: CsvService,
    private val syncPrefs: SdCardSyncPreferences
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var syncJob: Job? = null
    private val TAG = "SdCardSync"
    
    companion object {
        private const val SYNC_INTERVAL_MS = 60 * 60 * 1000L // 1 hour
        private const val SD_FOLDER = "Medlemscheckin"
        private const val IMPORT_FILE = "members_import.csv"
        private const val EXPORT_CHECKINS_FILE = "checkins_backup.csv"
        private const val EXPORT_SESSIONS_FILE = "sessions_backup.csv"
    }
    
    fun startAutoSync() {
        syncJob?.cancel()
        syncJob = scope.launch {
            while (isActive) {
                try {
                    performSync()
                } catch (e: Exception) {
                    Log.e(TAG, "Sync error: ${e.message}", e)
                }
                delay(SYNC_INTERVAL_MS)
            }
        }
        Log.d(TAG, "Auto-sync started")
    }
    
    fun stopAutoSync() {
        syncJob?.cancel()
        syncJob = null
        Log.d(TAG, "Auto-sync stopped")
    }
    
    suspend fun performSync(): SyncResult = withContext(Dispatchers.IO) {
        val sdCardPath = getSdCardPath()
        if (sdCardPath == null) {
            Log.d(TAG, "SD card not available")
            return@withContext SyncResult(imported = false, exported = false, message = "SD card not found")
        }
        
        val syncFolder = File(sdCardPath, SD_FOLDER)
        if (!syncFolder.exists()) {
            syncFolder.mkdirs()
        }
        
        var imported = false
        var exported = false
        var message = ""
        
        // Import members if file exists and has been modified
        val importFile = File(syncFolder, IMPORT_FILE)
        if (importFile.exists()) {
            val lastModified = importFile.lastModified()
            val lastImportTime = syncPrefs.getLastImportTimestamp()
            
            if (lastModified > lastImportTime) {
                try {
                    val content = importFile.readText()
                    val result = csvService.importMembers(content)
                    syncPrefs.setLastImportTimestamp(lastModified)
                    imported = true
                    message += "Imported: ${result.imported} members, ${result.skippedDuplicates} duplicates. "
                    Log.i(TAG, "Import successful: $message")
                } catch (e: Exception) {
                    message += "Import error: ${e.message}. "
                    Log.e(TAG, "Import failed", e)
                }
            } else {
                Log.d(TAG, "Import file not modified since last sync")
            }
        }
        
        // Export check-ins and sessions only if there are new ones
        val lastExportTime = syncPrefs.getLastExportTimestamp()
        val hasNewData = hasDataSinceTimestamp(lastExportTime)
        
        if (hasNewData) {
            try {
                // Export check-ins
                val checkInsContent = csvService.exportCheckIns()
                val checkInsFile = File(syncFolder, EXPORT_CHECKINS_FILE)
                checkInsFile.writeText(checkInsContent)
                
                // Export sessions
                val sessionsContent = csvService.exportSessions()
                val sessionsFile = File(syncFolder, EXPORT_SESSIONS_FILE)
                sessionsFile.writeText(sessionsContent)
                
                syncPrefs.setLastExportTimestamp(Clock.System.now().toEpochMilliseconds())
                exported = true
                message += "Exported check-ins and sessions. "
                Log.i(TAG, "Export successful")
            } catch (e: Exception) {
                message += "Export error: ${e.message}. "
                Log.e(TAG, "Export failed", e)
            }
        } else {
            Log.d(TAG, "No new data to export")
        }
        
        SyncResult(imported, exported, message.ifBlank { "No changes" })
    }
    
    private fun getSdCardPath(): String? {
        return try {
            // Check for removable storage
            val externalDirs = context.getExternalFilesDirs(null)
            
            // Find removable storage (SD card)
            val sdCard = externalDirs.firstOrNull { dir ->
                dir != null && Environment.isExternalStorageRemovable(dir)
            }
            
            if (sdCard != null) {
                // Navigate up to root of SD card from app-specific directory
                var current = sdCard
                while (current.parentFile != null && current.parentFile?.name != "Android") {
                    current = current.parentFile!!
                }
                current.parentFile?.parentFile?.absolutePath
            } else {
                // Fallback to primary external storage for testing
                val primary = externalDirs.firstOrNull()
                primary?.parentFile?.parentFile?.parentFile?.parentFile?.absolutePath
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error finding SD card", e)
            null
        }
    }
    
    private suspend fun hasDataSinceTimestamp(timestamp: Long): Boolean {
        // Simple check: if timestamp is 0, always export on first run
        // Otherwise, export every time since we don't track creation time for all entities
        return timestamp == 0L || Clock.System.now().toEpochMilliseconds() - timestamp > SYNC_INTERVAL_MS
    }
}

data class SyncResult(
    val imported: Boolean,
    val exported: Boolean,
    val message: String
)
