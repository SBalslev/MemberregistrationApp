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
    private val sessionDao: com.club.medlems.data.dao.PracticeSessionDao,
    private val registrationDao: com.club.medlems.data.dao.NewMemberRegistrationDao
) {
    private val workManager by lazy { WorkManager.getInstance(context) }
    private val TAG = "SdCardSync"
    
    companion object {
        private const val SYNC_INTERVAL_MS = 60 * 60 * 1000L // 1 hour
        private const val SD_FOLDER = "Medlemscheckin"
        private const val IMPORT_FILE = "members_import.csv"
        private const val EXPORT_CHECKINS_FILE = "checkins_backup.csv"
        private const val EXPORT_SESSIONS_FILE = "sessions_backup.csv"
        private const val PHOTOS_FOLDER = "member_photos"
        private const val PHOTO_RETENTION_DAYS = 30 // Keep local copies for 30 days after sync
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
                
                // Sync new member registration photos
                val photosSynced = syncPhotos(syncFolder, lastExportInstant)
                if (photosSynced > 0) {
                    message += "Synced $photosSynced photos. "
                    Log.i(TAG, "Synced $photosSynced member registration photos")
                }
                
                // Clean up old local photos (retention policy)
                val photosDeleted = cleanupOldLocalPhotos()
                if (photosDeleted > 0) {
                    Log.i(TAG, "Cleaned up $photosDeleted old local photos")
                }
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
            
            // Find removable storage (SD card) and return app-specific directory
            val sdCard = externalDirs.firstOrNull { dir ->
                dir != null && Environment.isExternalStorageRemovable(dir)
            }
            
            if (sdCard != null) {
                // Use app-specific directory on SD card (has write permissions)
                Log.d(TAG, "Using SD card app directory: ${sdCard.absolutePath}")
                sdCard.absolutePath
            } else {
                // Fallback to primary external storage
                val primary = externalDirs.firstOrNull()
                Log.d(TAG, "Using primary storage app directory: ${primary?.absolutePath}")
                primary?.absolutePath
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error finding SD card", e)
            null
        }
    }
    
    /**
     * Syncs new member registration photos to SD card.
     * Returns count of photos synced.
     */
    private suspend fun syncPhotos(syncFolder: File, sinceInstant: Instant): Int = withContext(Dispatchers.IO) {
        try {
            val newRegistrations = registrationDao.registrationsCreatedAfter(sinceInstant)
            if (newRegistrations.isEmpty()) {
                return@withContext 0
            }
            
            val photosFolder = File(syncFolder, PHOTOS_FOLDER)
            photosFolder.mkdirs()
            
            var syncedCount = 0
            
            for (registration in newRegistrations) {
                try {
                    val sourcePhotoFile = File(registration.photoPath)
                    if (!sourcePhotoFile.exists()) {
                        Log.w(TAG, "Photo file not found: ${registration.photoPath}")
                        continue
                    }
                    
                    // Copy photo to SD card with timestamp and temp ID in filename
                    val destFileName = "${registration.temporaryId}_${sourcePhotoFile.name}"
                    val destPhotoFile = File(photosFolder, destFileName)
                    
                    // Copy the photo file
                    sourcePhotoFile.copyTo(destPhotoFile, overwrite = true)
                    
                    // Also copy the info text file if it exists
                    val sourceInfoFile = File(sourcePhotoFile.parent, "${sourcePhotoFile.nameWithoutExtension}_info.txt")
                    if (sourceInfoFile.exists()) {
                        val destInfoFile = File(photosFolder, "${registration.temporaryId}_${sourceInfoFile.name}")
                        sourceInfoFile.copyTo(destInfoFile, overwrite = true)
                    }
                    
                    syncedCount++
                    Log.d(TAG, "Synced photo: ${registration.temporaryId}")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to sync photo for ${registration.temporaryId}", e)
                }
            }
            
            syncedCount
        } catch (e: Exception) {
            Log.e(TAG, "Error syncing photos", e)
            0
        }
    }
    
    /**
     * Cleans up local photo copies that are older than PHOTO_RETENTION_DAYS
     * and have been successfully synced to SD card.
     * Returns count of photos deleted.
     */
    private suspend fun cleanupOldLocalPhotos(): Int = withContext(Dispatchers.IO) {
        try {
            val allRegistrations = registrationDao.allRegistrations()
            val retentionCutoff = Clock.System.now().toEpochMilliseconds() - (PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000L)
            
            var deletedCount = 0
            
            for (registration in allRegistrations) {
                // Only delete if older than retention period
                if (registration.createdAtUtc.toEpochMilliseconds() < retentionCutoff) {
                    try {
                        val photoFile = File(registration.photoPath)
                        if (photoFile.exists()) {
                            photoFile.delete()
                            deletedCount++
                            Log.d(TAG, "Deleted old local photo: ${registration.temporaryId}")
                        }
                        
                        // Also delete info file
                        val infoFile = File(photoFile.parent, "${photoFile.nameWithoutExtension}_info.txt")
                        if (infoFile.exists()) {
                            infoFile.delete()
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to delete old photo for ${registration.temporaryId}", e)
                    }
                }
            }
            
            deletedCount
        } catch (e: Exception) {
            Log.e(TAG, "Error cleaning up old photos", e)
            0
        }
    }
    
    private suspend fun hasDataSinceTimestamp(sinceInstant: Instant): Boolean = withContext(Dispatchers.IO) {
        // Query database to check if there are any new check-ins, sessions, or registrations
        // created after the given timestamp
        try {
            val newCheckIns = checkInDao.countCheckInsCreatedAfter(sinceInstant)
            val newSessions = sessionDao.countSessionsCreatedAfter(sinceInstant)
            val newRegistrations = registrationDao.countRegistrationsCreatedAfter(sinceInstant)
            val hasNew = newCheckIns > 0 || newSessions > 0 || newRegistrations > 0
            Log.d(TAG, "Checking for new data since $sinceInstant: $newCheckIns check-ins, $newSessions sessions, $newRegistrations registrations")
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
        // Ensure parent directory exists
        file.parentFile?.mkdirs()
        
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
        // Ensure parent directory exists
        file.parentFile?.mkdirs()
        
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
