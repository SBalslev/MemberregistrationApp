package com.club.medlems

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.club.medlems.data.sync.DeviceInfo
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.data.sync.toDisplayName
import com.club.medlems.domain.csv.SdCardSyncManager
import com.club.medlems.domain.prefs.DeviceConfigPreferences
import com.club.medlems.domain.prefs.SdCardSyncPreferences
import com.club.medlems.network.TrustManager
import dagger.hilt.android.HiltAndroidApp
import kotlinx.datetime.Clock
import javax.inject.Inject

@HiltAndroidApp
class MedlemsApp : Application(), Configuration.Provider {
    @Inject lateinit var sdCardSyncManager: SdCardSyncManager
    @Inject lateinit var sdCardSyncPreferences: SdCardSyncPreferences
    @Inject lateinit var deviceConfigPreferences: DeviceConfigPreferences
    @Inject lateinit var trustManager: TrustManager
    @Inject lateinit var syncManager: SyncManager
    @Inject lateinit var workerFactory: HiltWorkerFactory
    
    override val workManagerConfiguration: Configuration by lazy {
        Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()
    }
    
    override fun onCreate() {
        super.onCreate()
        
        // Start SD card auto-sync if enabled
        if (sdCardSyncPreferences.isAutoSyncEnabled()) {
            sdCardSyncManager.startAutoSync()
        }

        // Start network sync on app launch to keep devices updated
        val deviceType = deviceConfigPreferences.getDeviceType()
        val deviceName = deviceConfigPreferences.getDeviceName().takeIf { it.isNotBlank() }
            ?: "${deviceType.toDisplayName()} (${android.os.Build.MODEL})"
        val deviceInfo = DeviceInfo(
            id = trustManager.getThisDeviceId(),
            name = deviceName,
            type = deviceType,
            pairedAtUtc = Clock.System.now()
        )
        syncManager.start(deviceInfo)
    }
}
