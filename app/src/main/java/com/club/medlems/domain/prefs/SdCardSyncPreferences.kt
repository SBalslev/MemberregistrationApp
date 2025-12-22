package com.club.medlems.domain.prefs

import android.content.Context
import android.content.SharedPreferences
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SdCardSyncPreferences @Inject constructor(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("sdcard_sync", Context.MODE_PRIVATE)
    
    companion object {
        private const val KEY_LAST_IMPORT = "last_import_timestamp"
        private const val KEY_LAST_EXPORT = "last_export_timestamp"
        private const val KEY_AUTO_SYNC_ENABLED = "auto_sync_enabled"
    }
    
    fun getLastImportTimestamp(): Long = prefs.getLong(KEY_LAST_IMPORT, 0L)
    
    fun setLastImportTimestamp(timestamp: Long) {
        prefs.edit().putLong(KEY_LAST_IMPORT, timestamp).apply()
    }
    
    fun getLastExportTimestamp(): Long = prefs.getLong(KEY_LAST_EXPORT, 0L)
    
    fun setLastExportTimestamp(timestamp: Long) {
        prefs.edit().putLong(KEY_LAST_EXPORT, timestamp).apply()
    }
    
    fun isAutoSyncEnabled(): Boolean = prefs.getBoolean(KEY_AUTO_SYNC_ENABLED, false)
    
    fun setAutoSyncEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_AUTO_SYNC_ENABLED, enabled).apply()
    }
}
