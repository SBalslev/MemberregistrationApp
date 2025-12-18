package com.club.medlems.domain.prefs

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DiagnosticPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val prefs = context.getSharedPreferences("diagnostic_prefs", Context.MODE_PRIVATE)
    
    private val _diagnosticsEnabled = MutableStateFlow(
        prefs.getBoolean(KEY_DIAGNOSTICS_ENABLED, false)
    )
    val diagnosticsEnabled: StateFlow<Boolean> = _diagnosticsEnabled.asStateFlow()
    
    fun setDiagnosticsEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_DIAGNOSTICS_ENABLED, enabled).apply()
        _diagnosticsEnabled.value = enabled
    }
    
    companion object {
        private const val KEY_DIAGNOSTICS_ENABLED = "diagnostics_enabled"
    }
}
