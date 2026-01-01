package com.club.medlems

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.club.medlems.domain.csv.SdCardSyncManager
import com.club.medlems.domain.prefs.SdCardSyncPreferences
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class MedlemsApp : Application(), Configuration.Provider {
    @Inject lateinit var sdCardSyncManager: SdCardSyncManager
    @Inject lateinit var sdCardSyncPreferences: SdCardSyncPreferences
    @Inject lateinit var workerFactory: HiltWorkerFactory
    
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()
    
    override fun onCreate() {
        super.onCreate()
        
        // Start SD card auto-sync if enabled
        if (sdCardSyncPreferences.isAutoSyncEnabled()) {
            sdCardSyncManager.startAutoSync()
        }
    }
}
