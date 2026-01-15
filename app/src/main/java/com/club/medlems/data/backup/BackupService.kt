package com.club.medlems.data.backup

import android.content.Context
import android.util.Log
import com.club.medlems.data.db.AppDatabase
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Service for creating and managing database backups.
 *
 * Features:
 * - Creates timestamped backup files
 * - Compresses backups to save space
 * - Manages backup retention policy
 * - Validates backup integrity
 *
 * @see [design.md FR-14] - Backup and Restore requirements
 */
@Singleton
class BackupService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val database: AppDatabase
) {
    companion object {
        private const val TAG = "BackupService"
        
        /** Directory name for backups within app's files directory */
        const val BACKUP_DIR = "backups"
        
        /** File extension for backup files */
        const val BACKUP_EXTENSION = ".zip"
        
        /** Prefix for backup filenames */
        const val BACKUP_PREFIX = "medlems-backup-"
        
        /** Database filename */
        const val DATABASE_NAME = "medlems-db"
        
        /** Default number of backups to retain */
        const val DEFAULT_RETENTION_COUNT = 7
        
        /** Metadata filename inside backup */
        const val METADATA_FILE = "backup-metadata.json"
    }

    /**
     * Creates a backup of the current database.
     *
     * @param description Optional description for the backup
     * @return BackupResult with backup file path and metadata
     */
    suspend fun createBackup(
        description: String? = null
    ): BackupResult = withContext(Dispatchers.IO) {
        Log.i(TAG, "Starting backup creation...")
        
        try {
            // Ensure backup directory exists
            val backupDir = getBackupDirectory()
            if (!backupDir.exists()) {
                backupDir.mkdirs()
            }
            
            // Generate timestamped filename
            val timestamp = Clock.System.now()
            val localDateTime = timestamp.toLocalDateTime(TimeZone.currentSystemDefault())
            val dateStr = "${localDateTime.year}-${localDateTime.monthNumber.toString().padStart(2, '0')}-${localDateTime.dayOfMonth.toString().padStart(2, '0')}"
            val timeStr = "${localDateTime.hour.toString().padStart(2, '0')}${localDateTime.minute.toString().padStart(2, '0')}${localDateTime.second.toString().padStart(2, '0')}"
            val backupFilename = "$BACKUP_PREFIX$dateStr-$timeStr$BACKUP_EXTENSION"
            val backupFile = File(backupDir, backupFilename)
            
            // Checkpoint the database to ensure all data is written
            database.openHelper.writableDatabase.query("PRAGMA wal_checkpoint(FULL)")
            
            // Get database file
            val dbFile = context.getDatabasePath(DATABASE_NAME)
            val dbWalFile = File(dbFile.path + "-wal")
            val dbShmFile = File(dbFile.path + "-shm")
            
            if (!dbFile.exists()) {
                return@withContext BackupResult.Error("Database file not found")
            }
            
            // Create metadata
            val metadata = BackupMetadata(
                version = 1,
                createdAt = timestamp.toString(),
                databaseVersion = database.openHelper.readableDatabase.version,
                schemaVersion = com.club.medlems.data.sync.SyncSchemaVersion.version,
                description = description,
                deviceId = getDeviceId(),
                fileSize = dbFile.length()
            )
            
            // Create compressed backup
            ZipOutputStream(FileOutputStream(backupFile)).use { zos ->
                // Add database file
                addFileToZip(zos, dbFile, DATABASE_NAME)
                
                // Add WAL file if exists
                if (dbWalFile.exists()) {
                    addFileToZip(zos, dbWalFile, "$DATABASE_NAME-wal")
                }
                
                // Add SHM file if exists
                if (dbShmFile.exists()) {
                    addFileToZip(zos, dbShmFile, "$DATABASE_NAME-shm")
                }
                
                // Add metadata
                val metadataJson = kotlinx.serialization.json.Json.encodeToString(
                    BackupMetadata.serializer(),
                    metadata
                )
                zos.putNextEntry(ZipEntry(METADATA_FILE))
                zos.write(metadataJson.toByteArray())
                zos.closeEntry()
            }
            
            Log.i(TAG, "Backup created: ${backupFile.absolutePath} (${backupFile.length()} bytes)")
            
            // Apply retention policy
            applyRetentionPolicy()
            
            BackupResult.Success(
                backupFile = backupFile,
                metadata = metadata
            )
        } catch (e: Exception) {
            Log.e(TAG, "Backup creation failed", e)
            BackupResult.Error("Backup failed: ${e.message}")
        }
    }

    /**
     * Lists all available backups.
     *
     * @return List of backup files sorted by date (newest first)
     */
    suspend fun listBackups(): List<BackupInfo> = withContext(Dispatchers.IO) {
        val backupDir = getBackupDirectory()
        if (!backupDir.exists()) {
            return@withContext emptyList()
        }
        
        backupDir.listFiles { file ->
            file.name.startsWith(BACKUP_PREFIX) && file.name.endsWith(BACKUP_EXTENSION)
        }?.map { file ->
            val metadata = readBackupMetadata(file)
            BackupInfo(
                file = file,
                metadata = metadata,
                size = file.length(),
                lastModified = file.lastModified()
            )
        }?.sortedByDescending { it.lastModified } ?: emptyList()
    }

    /**
     * Validates a backup file.
     *
     * @param backupFile The backup file to validate
     * @return ValidationResult with validation status
     */
    suspend fun validateBackup(backupFile: File): ValidationResult = withContext(Dispatchers.IO) {
        try {
            if (!backupFile.exists()) {
                return@withContext ValidationResult.Invalid("Backup file does not exist")
            }
            
            if (!backupFile.canRead()) {
                return@withContext ValidationResult.Invalid("Cannot read backup file")
            }
            
            var hasDatabase = false
            var hasMetadata = false
            var metadata: BackupMetadata? = null
            
            ZipInputStream(FileInputStream(backupFile)).use { zis ->
                var entry: ZipEntry?
                while (zis.nextEntry.also { entry = it } != null) {
                    when (entry?.name) {
                        DATABASE_NAME -> hasDatabase = true
                        METADATA_FILE -> {
                            hasMetadata = true
                            val content = zis.readBytes().toString(Charsets.UTF_8)
                            metadata = kotlinx.serialization.json.Json.decodeFromString(
                                BackupMetadata.serializer(),
                                content
                            )
                        }
                    }
                    zis.closeEntry()
                }
            }
            
            if (!hasDatabase) {
                return@withContext ValidationResult.Invalid("Backup does not contain database")
            }
            
            if (!hasMetadata || metadata == null) {
                return@withContext ValidationResult.Invalid("Backup does not contain metadata")
            }
            
            // Check schema compatibility
            val backupSchemaVersion = metadata!!.schemaVersion
            val currentSchemaVersion = com.club.medlems.data.sync.SyncSchemaVersion.version
            val isCompatible = com.club.medlems.data.sync.SyncSchemaVersion.isCompatible(backupSchemaVersion)
            
            if (!isCompatible) {
                return@withContext ValidationResult.IncompatibleSchema(
                    backupVersion = backupSchemaVersion,
                    currentVersion = currentSchemaVersion
                )
            }
            
            ValidationResult.Valid(metadata!!)
        } catch (e: Exception) {
            Log.e(TAG, "Backup validation failed", e)
            ValidationResult.Invalid("Validation failed: ${e.message}")
        }
    }

    /**
     * Restores the database from a backup file.
     *
     * @param backupFile The backup file to restore from
     * @return RestoreResult with restore status
     */
    suspend fun restoreFromBackup(backupFile: File): RestoreResult = withContext(Dispatchers.IO) {
        Log.i(TAG, "Starting restore from: ${backupFile.absolutePath}")
        
        try {
            // Validate backup first
            val validation = validateBackup(backupFile)
            if (validation !is ValidationResult.Valid) {
                return@withContext RestoreResult.Error(
                    when (validation) {
                        is ValidationResult.Invalid -> validation.reason
                        is ValidationResult.IncompatibleSchema -> 
                            "Incompatible schema: backup=${validation.backupVersion}, current=${validation.currentVersion}"
                        else -> "Validation failed"
                    }
                )
            }
            
            // Close database before restore
            database.close()
            
            // Get database paths
            val dbFile = context.getDatabasePath(DATABASE_NAME)
            val dbWalFile = File(dbFile.path + "-wal")
            val dbShmFile = File(dbFile.path + "-shm")
            
            // Delete existing database files
            dbFile.delete()
            dbWalFile.delete()
            dbShmFile.delete()
            
            // Extract backup
            ZipInputStream(FileInputStream(backupFile)).use { zis ->
                var entry: ZipEntry?
                while (zis.nextEntry.also { entry = it } != null) {
                    val entryName = entry?.name ?: continue
                    
                    val targetFile = when (entryName) {
                        DATABASE_NAME -> dbFile
                        "$DATABASE_NAME-wal" -> dbWalFile
                        "$DATABASE_NAME-shm" -> dbShmFile
                        else -> null
                    }
                    
                    targetFile?.let { file ->
                        file.parentFile?.mkdirs()
                        FileOutputStream(file).use { fos ->
                            zis.copyTo(fos)
                        }
                    }
                    zis.closeEntry()
                }
            }
            
            Log.i(TAG, "Restore completed successfully")
            
            RestoreResult.Success(
                metadata = validation.metadata,
                requiresRestart = true
            )
        } catch (e: Exception) {
            Log.e(TAG, "Restore failed", e)
            RestoreResult.Error("Restore failed: ${e.message}")
        }
    }

    /**
     * Deletes a specific backup file.
     *
     * @param backupFile The backup file to delete
     * @return true if deleted successfully
     */
    suspend fun deleteBackup(backupFile: File): Boolean = withContext(Dispatchers.IO) {
        try {
            backupFile.delete()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete backup: ${backupFile.name}", e)
            false
        }
    }

    /**
     * Exports a backup to an external location.
     *
     * @param backupFile The backup file to export
     * @param destinationDir The destination directory
     * @return The exported file path, or null if failed
     */
    suspend fun exportBackup(
        backupFile: File,
        destinationDir: File
    ): File? = withContext(Dispatchers.IO) {
        try {
            if (!destinationDir.exists()) {
                destinationDir.mkdirs()
            }
            
            val destFile = File(destinationDir, backupFile.name)
            backupFile.copyTo(destFile, overwrite = true)
            
            Log.i(TAG, "Backup exported to: ${destFile.absolutePath}")
            destFile
        } catch (e: Exception) {
            Log.e(TAG, "Export failed", e)
            null
        }
    }

    /**
     * Gets the backup directory path.
     */
    fun getBackupDirectory(): File {
        return File(context.filesDir, BACKUP_DIR)
    }

    /**
     * Applies retention policy - keeps only the most recent backups.
     *
     * @param retentionCount Number of backups to keep (default: 7)
     */
    private suspend fun applyRetentionPolicy(retentionCount: Int = DEFAULT_RETENTION_COUNT) {
        val backups = listBackups()
        if (backups.size > retentionCount) {
            backups.drop(retentionCount).forEach { backup ->
                Log.d(TAG, "Deleting old backup: ${backup.file.name}")
                deleteBackup(backup.file)
            }
        }
    }

    /**
     * Reads backup metadata from a backup file.
     */
    private fun readBackupMetadata(backupFile: File): BackupMetadata? {
        return try {
            ZipInputStream(FileInputStream(backupFile)).use { zis ->
                var entry: ZipEntry?
                while (zis.nextEntry.also { entry = it } != null) {
                    if (entry?.name == METADATA_FILE) {
                        val content = zis.readBytes().toString(Charsets.UTF_8)
                        return@use kotlinx.serialization.json.Json.decodeFromString(
                            BackupMetadata.serializer(),
                            content
                        )
                    }
                    zis.closeEntry()
                }
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read backup metadata: ${backupFile.name}", e)
            null
        }
    }

    /**
     * Adds a file to a zip output stream.
     */
    private fun addFileToZip(zos: ZipOutputStream, file: File, entryName: String) {
        zos.putNextEntry(ZipEntry(entryName))
        FileInputStream(file).use { fis ->
            fis.copyTo(zos)
        }
        zos.closeEntry()
    }

    /**
     * Gets the device ID from TrustManager or generates a default.
     */
    private fun getDeviceId(): String {
        return try {
            // Try to get from shared preferences
            val prefs = context.getSharedPreferences("sync_prefs", Context.MODE_PRIVATE)
            prefs.getString("device_id", null) ?: "unknown"
        } catch (e: Exception) {
            "unknown"
        }
    }
}

/**
 * Metadata stored with each backup file.
 */
@kotlinx.serialization.Serializable
data class BackupMetadata(
    /** Backup format version */
    val version: Int,
    
    /** Timestamp when backup was created (ISO-8601) */
    val createdAt: String,
    
    /** Room database version */
    val databaseVersion: Int,
    
    /** Sync schema version */
    val schemaVersion: String,
    
    /** Optional description */
    val description: String? = null,
    
    /** Device that created the backup */
    val deviceId: String,
    
    /** Original database file size in bytes */
    val fileSize: Long
)

/**
 * Information about a backup file.
 */
data class BackupInfo(
    val file: File,
    val metadata: BackupMetadata?,
    val size: Long,
    val lastModified: Long
)

/**
 * Result of backup creation.
 */
sealed class BackupResult {
    data class Success(
        val backupFile: File,
        val metadata: BackupMetadata
    ) : BackupResult()
    
    data class Error(val message: String) : BackupResult()
}

/**
 * Result of backup validation.
 */
sealed class ValidationResult {
    data class Valid(val metadata: BackupMetadata) : ValidationResult()
    data class Invalid(val reason: String) : ValidationResult()
    data class IncompatibleSchema(
        val backupVersion: String,
        val currentVersion: String
    ) : ValidationResult()
}

/**
 * Result of restore operation.
 */
sealed class RestoreResult {
    data class Success(
        val metadata: BackupMetadata,
        val requiresRestart: Boolean
    ) : RestoreResult()
    
    data class Error(val message: String) : RestoreResult()
}
