package com.club.medlems.data.backup

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit

/**
 * WorkManager worker for scheduled automatic backups.
 *
 * Runs daily to create database backups per FR-14.1.
 *
 * @see [design.md FR-14.1] - Scheduled automatic backups
 */
@HiltWorker
class BackupWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted workerParams: WorkerParameters,
    private val backupService: BackupService
) : CoroutineWorker(context, workerParams) {

    companion object {
        private const val TAG = "BackupWorker"
        
        /** Unique work name for the periodic backup */
        const val WORK_NAME = "automatic_backup"
        
        /** Interval between backups in hours */
        const val BACKUP_INTERVAL_HOURS = 24L
        
        /**
         * Schedules the automatic backup worker.
         *
         * @param context Application context
         * @param replaceExisting Whether to replace existing scheduled work
         */
        fun schedule(context: Context, replaceExisting: Boolean = false) {
            val constraints = Constraints.Builder()
                .setRequiresBatteryNotLow(true)
                .setRequiresStorageNotLow(true)
                .build()
            
            val backupRequest = PeriodicWorkRequestBuilder<BackupWorker>(
                BACKUP_INTERVAL_HOURS, TimeUnit.HOURS
            )
                .setConstraints(constraints)
                .addTag(WORK_NAME)
                .build()
            
            val policy = if (replaceExisting) {
                ExistingPeriodicWorkPolicy.UPDATE
            } else {
                ExistingPeriodicWorkPolicy.KEEP
            }
            
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(
                    WORK_NAME,
                    policy,
                    backupRequest
                )
            
            Log.i(TAG, "Scheduled automatic backup every $BACKUP_INTERVAL_HOURS hours")
        }
        
        /**
         * Cancels the scheduled automatic backup.
         *
         * @param context Application context
         */
        fun cancel(context: Context) {
            WorkManager.getInstance(context)
                .cancelUniqueWork(WORK_NAME)
            
            Log.i(TAG, "Cancelled automatic backup")
        }
    }

    override suspend fun doWork(): Result {
        Log.i(TAG, "Starting automatic backup...")
        
        return try {
            val result = backupService.createBackup(description = "Automatic backup")
            
            when (result) {
                is BackupResult.Success -> {
                    Log.i(TAG, "Automatic backup completed: ${result.backupFile.name}")
                    Result.success()
                }
                is BackupResult.Error -> {
                    Log.e(TAG, "Automatic backup failed: ${result.message}")
                    // Retry on failure
                    if (runAttemptCount < 3) {
                        Result.retry()
                    } else {
                        Result.failure()
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Automatic backup exception", e)
            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }
}

/**
 * Manager for backup scheduling and status.
 */
object BackupScheduler {
    
    /**
     * Initializes automatic backups at app startup.
     *
     * @param context Application context
     */
    fun initialize(context: Context) {
        BackupWorker.schedule(context, replaceExisting = false)
    }
    
    /**
     * Checks if automatic backup is currently scheduled.
     *
     * @param context Application context
     * @return true if backup is scheduled
     */
    suspend fun isScheduled(context: Context): Boolean {
        val workInfos = WorkManager.getInstance(context)
            .getWorkInfosForUniqueWork(BackupWorker.WORK_NAME)
            .get()
        
        return workInfos.any { !it.state.isFinished }
    }
    
    /**
     * Enables or disables automatic backups.
     *
     * @param context Application context
     * @param enabled Whether to enable automatic backups
     */
    fun setEnabled(context: Context, enabled: Boolean) {
        if (enabled) {
            BackupWorker.schedule(context, replaceExisting = true)
        } else {
            BackupWorker.cancel(context)
        }
    }
}
