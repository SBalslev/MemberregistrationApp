package com.club.medlems.domain.csv

import android.content.Context
import android.os.Environment
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.club.medlems.domain.prefs.SdCardSyncPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import java.io.File
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SdCardSyncManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val csvService: CsvService,
    private val syncPrefs: SdCardSyncPreferences,
    private val checkInDao: com.club.medlems.data.dao.CheckInDao,
    private val sessionDao: com.club.medlems.data.dao.PracticeSessionDao
) {
    private val workManager = WorkManager.getInstance(context)
    private val TAG = "SdCardSync"
    
    companion object {
        private const val SYNC_INTERVAL_MS = 60 * 60 * 1000L // 1 hour
        private const val SD_FOLDER = "Medlemscheckin"
        private const val IMPORT_FILE = "members_import.csv"
        private const val EXPORT_CHECKINS_FILE = "checkins_backup.csv"
        private const val EXPORT_SESSIONS_FILE = "sessions_backup.csv"
    }
    
    fun startAutoSync() {
        // Create periodic work request that runs every 1 hour
        val syncWorkRequest = PeriodicWorkRequestBuilder<SdCardSyncWorker>(
            1, TimeUnit.HOURS,  // Repeat interval
            15, TimeUnit.MINUTES // Flex interval - can run up to 15 min earlier/later
        )
            .setConstraints(
                Constraints.Builder()
                    .setRequiresBatteryNotLow(false) // Don't wait for battery
                    .setRequiresStorageNotLow(true)  // Need storage for SD card operations
                    .build()
            )
            .build()

        // Use KEEP policy to avoid resetting the schedule if already running
        workManager.enqueueUniquePeriodicWork(
            SdCardSyncWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            syncWorkRequest
        )
        
        Log.d(TAG, "WorkManager auto-sync started (every 1 hour)")
    }
    
    fun stopAutoSync() {
        workManager.cancelUniqueWork(SdCardSyncWorker.WORK_NAME)
        Log.d(TAG, "WorkManager auto-sync stopped")
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
                    if (content.isBlank()) {
                        Log.w(TAG, "Import file is empty")
                        message += "Import file is empty. "
                    } else {
                        val result = csvService.importMembers(content)
                        if (result.errors.isEmpty()) {
                            syncPrefs.setLastImportTimestamp(lastModified)
                            syncPrefs.setLastSuccessfulSync(Clock.System.now().toEpochMilliseconds())
                            imported = true
                            message += "Imported: ${result.imported} members, ${result.skippedDuplicates} duplicates. "
                            Log.i(TAG, "Import successful: $message")
                        } else {
                            message += "Import partially failed: ${result.errors.joinToString(", ")}. "
                            Log.w(TAG, "Import had errors: ${result.errors}")
                        }
                    }
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
        val lastExportInstant = if (lastExportTime == 0L) {
            Instant.DISTANT_PAST
        } else {
            Instant.fromEpochMilliseconds(lastExportTime)
        }
        
        val hasNewData = hasDataSinceTimestamp(lastExportInstant)
        
        if (hasNewData) {
            try {
                val exportStartTime = Clock.System.now()
                
                // Export only new check-ins (incremental)
                val checkInsContent = csvService.exportCheckInsSince(lastExportInstant)
                val checkInsFile = File(syncFolder, EXPORT_CHECKINS_FILE)
                
                // Append to existing file or create new one (using atomic writes)
                if (lastExportTime == 0L || !checkInsFile.exists()) {
                    // First export - include header
                    atomicWriteFile(checkInsFile, checkInsContent)
                } else {
                    // Subsequent export - append without header
                    val lines = checkInsContent.lines()
                    if (lines.size > 1) { // Has more than just header
                        val dataOnly = lines.drop(1).joinToString("\n")
                        if (dataOnly.isNotBlank()) {
                            atomicAppendFile(checkInsFile, "\n" + dataOnly)
                        }
                    }
                }
                
                // Export only new sessions (incremental)
                val sessionsContent = csvService.exportSessionsSince(lastExportInstant)
                val sessionsFile = File(syncFolder, EXPORT_SESSIONS_FILE)
                
                // Append to existing file or create new one (using atomic writes)
                if (lastExportTime == 0L || !sessionsFile.exists()) {
                    // First export - include header
                    atomicWriteFile(sessionsFile, sessionsContent)
                } else {
                    // Subsequent export - append without header
                    val lines = sessionsContent.lines()
                    if (lines.size > 1) { // Has more than just header
                        val dataOnly = lines.drop(1).joinToString("\n")
                        if (dataOnly.isNotBlank()) {
                            atomicAppendFile(sessionsFile, "\n" + dataOnly)
                        }
                    }
                }
                
                syncPrefs.setLastExportTimestamp(exportStartTime.toEpochMilliseconds())
                syncPrefs.setLastSuccessfulSync(Clock.System.now().toEpochMilliseconds())
                exported = true
                
                // Count actual exported records for better feedback
                val checkInLines = checkInsContent.lines().size - 1
                val sessionLines = sessionsContent.lines().size - 1
                message += "Exported: $checkInLines check-ins, $sessionLines sessions. "
                Log.i(TAG, "Export successful: $message")
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
                var current: File? = sdCard
                while (current?.parentFile != null && current.parentFile?.name != "Android") {
                    current = current.parentFile
                }
                current?.parentFile?.parentFile?.absolutePath
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
    
    private suspend fun hasDataSinceTimestamp(sinceInstant: Instant): Boolean = withContext(Dispatchers.IO) {
        // Query database to check if there are any new check-ins or sessions
        // created after the given timestamp
        try {
            val newCheckIns = checkInDao.countCheckInsCreatedAfter(sinceInstant)
            val newSessions = sessionDao.countSessionsCreatedAfter(sinceInstant)
            val hasNew = newCheckIns > 0 || newSessions > 0
            Log.d(TAG, "Checking for new data since $sinceInstant: $newCheckIns check-ins, $newSessions sessions")
            hasNew
        } catch (e: Exception) {
            Log.e(TAG, "Error checking for new data", e)
            // On error, assume there might be new data
            true
        }
    }
    
    /**
     * Atomically writes content to a file using a temporary file to prevent corruption.
     * Writes to .tmp file first, then renames on success.
     */
    private fun atomicWriteFile(file: File, content: String) {
        val tempFile = File(file.parentFile, "${file.name}.tmp")
        try {
            tempFile.writeText(content)
            // Atomic rename (on most filesystems)
            if (file.exists()) {
                file.delete()
            }
            tempFile.renameTo(file)
        } catch (e: Exception) {
            tempFile.delete()
            throw e
        }
    }
    
    /**
     * Atomically appends content to a file using a temporary file.
     */
    private fun atomicAppendFile(file: File, content: String) {
        val tempFile = File(file.parentFile, "${file.name}.tmp")
        try {
            // Copy existing content + new content to temp file
            val existingContent = if (file.exists()) file.readText() else ""
            tempFile.writeText(existingContent + content)
            // Atomic rename
            if (file.exists()) {
                file.delete()
            }
            tempFile.renameTo(file)
        } catch (e: Exception) {
            tempFile.delete()
            throw e
        }
    }
}

data class SyncResult(
    val imported: Boolean,
    val exported: Boolean,
    val message: String
)
