package com.club.medlems.domain.prefs

import android.content.Context
import com.club.medlems.BuildConfig
import com.club.medlems.data.sync.DeviceType
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Preferences for device configuration in the distributed sync system.
 * 
 * Stores:
 * - Device type (Member Tablet, Admin Tablet, etc.)
 * - Device name for display in pairing UI
 * - Whether initial setup has been completed
 * 
 * The default device type is determined by the build flavor (DEVICE_ROLE).
 * 
 * @see [design.md FR-22] - Device Pairing Ceremony Flow
 */
@Singleton
class DeviceConfigPreferences @Inject constructor(
    @ApplicationContext context: Context
) {
    companion object {
        private const val PREFS_NAME = "device_config"
        private const val KEY_DEVICE_TYPE = "device_type"
        private const val KEY_DEVICE_NAME = "device_name"
        private const val KEY_SETUP_COMPLETE = "setup_complete"
        private const val KEY_DEVICE_ID = "device_id"
        
        /** Default device type from build flavor */
        private val DEFAULT_DEVICE_TYPE: DeviceType = try {
            DeviceType.valueOf(BuildConfig.DEVICE_ROLE)
        } catch (e: Exception) {
            DeviceType.MEMBER_TABLET
        }
    }
    
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    
    private val _deviceType = MutableStateFlow(getDeviceType())
    val deviceTypeFlow: StateFlow<DeviceType> = _deviceType.asStateFlow()
    
    private val _deviceName = MutableStateFlow(getDeviceName())
    val deviceNameFlow: StateFlow<String> = _deviceName.asStateFlow()
    
    private val _setupComplete = MutableStateFlow(isSetupComplete())
    val setupCompleteFlow: StateFlow<Boolean> = _setupComplete.asStateFlow()
    
    /** Whether equipment management is enabled for this build flavor */
    val equipmentEnabled: Boolean = BuildConfig.EQUIPMENT_ENABLED
    
    /** Whether this is the admin build flavor */
    val isAdminBuild: Boolean = BuildConfig.DEVICE_ROLE == DeviceType.ADMIN_TABLET.name
    
    /**
     * Gets the configured device type.
     * Defaults to the build flavor's DEVICE_ROLE if not set.
     */
    fun getDeviceType(): DeviceType {
        val typeStr = prefs.getString(KEY_DEVICE_TYPE, null)
        return typeStr?.let {
            try {
                DeviceType.valueOf(it)
            } catch (e: IllegalArgumentException) {
                DEFAULT_DEVICE_TYPE
            }
        } ?: DEFAULT_DEVICE_TYPE
    }
    
    /**
     * Sets the device type.
     */
    fun setDeviceType(type: DeviceType) {
        prefs.edit().putString(KEY_DEVICE_TYPE, type.name).apply()
        _deviceType.value = type
    }
    
    /**
     * Gets the friendly device name for display.
     */
    fun getDeviceName(): String {
        return prefs.getString(KEY_DEVICE_NAME, "") ?: ""
    }
    
    /**
     * Sets the friendly device name.
     */
    fun setDeviceName(name: String) {
        prefs.edit().putString(KEY_DEVICE_NAME, name.trim()).apply()
        _deviceName.value = name.trim()
    }
    
    /**
     * Checks if initial setup has been completed.
     */
    fun isSetupComplete(): Boolean {
        return prefs.getBoolean(KEY_SETUP_COMPLETE, false)
    }
    
    /**
     * Marks initial setup as complete.
     */
    fun setSetupComplete(complete: Boolean) {
        prefs.edit().putBoolean(KEY_SETUP_COMPLETE, complete).apply()
        _setupComplete.value = complete
    }
    
    /**
     * Checks if this device is configured as an admin device (Admin Tablet or Laptop).
     */
    fun isAdminDevice(): Boolean {
        val type = getDeviceType()
        return type == DeviceType.ADMIN_TABLET || type == DeviceType.LAPTOP
    }
    
    /**
     * Checks if this device has equipment management capabilities.
     * Only Admin Tablet and Laptop can manage equipment.
     */
    fun canManageEquipment(): Boolean = isAdminDevice()
    
    /**
     * Checks if this device can approve new member registrations.
     * Only the Master Laptop can approve registrations.
     */
    fun canApproveRegistrations(): Boolean = getDeviceType() == DeviceType.LAPTOP
    
    /**
     * Clears all device configuration (for testing or reset).
     */
    fun clearAll() {
        prefs.edit().clear().apply()
        _deviceType.value = DeviceType.MEMBER_TABLET
        _deviceName.value = ""
        _setupComplete.value = false
    }
}
