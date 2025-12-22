package com.club.medlems

import android.app.Application
import com.club.medlems.domain.csv.SdCardSyncManager
import com.club.medlems.domain.prefs.SdCardSyncPreferences
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class MedlemsApp : Application() {
    @Inject lateinit var sdCardSyncManager: SdCardSyncManager
    @Inject lateinit var sdCardSyncPreferences: SdCardSyncPreferences
    
    override fun onCreate() {
        super.onCreate()
        
        // Start SD card auto-sync if enabled
        if (sdCardSyncPreferences.isAutoSyncEnabled()) {
            sdCardSyncManager.startAutoSync()
        }
    }
}
