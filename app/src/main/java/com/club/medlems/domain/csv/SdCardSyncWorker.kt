package com.club.medlems.domain.csv

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * WorkManager worker for reliable background SD card sync.
 * Runs even when app is killed or in background.
 */
@HiltWorker
class SdCardSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val sdCardSyncManager: SdCardSyncManager
) : CoroutineWorker(appContext, workerParams) {

    companion object {
        private const val TAG = "SdCardSyncWorker"
        const val WORK_NAME = "sd_card_auto_sync"
    }

    override suspend fun doWork(): Result {
        Log.d(TAG, "Starting SD card sync work")
        
        return try {
            val result = sdCardSyncManager.performSync()
            Log.i(TAG, "Sync completed: ${result.message}")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Sync failed", e)
            // Retry on failure
            Result.retry()
        }
    }
}
