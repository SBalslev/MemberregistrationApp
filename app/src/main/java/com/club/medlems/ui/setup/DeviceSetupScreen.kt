package com.club.medlems.ui.setup

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import com.club.medlems.data.sync.DeviceType
import com.club.medlems.domain.prefs.DeviceConfigPreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/**
 * ViewModel for device setup screen.
 */
@HiltViewModel
class DeviceSetupViewModel @Inject constructor(
    val deviceConfig: DeviceConfigPreferences
) : ViewModel() {
    
    fun saveConfiguration(deviceType: DeviceType, deviceName: String) {
        deviceConfig.setDeviceType(deviceType)
        deviceConfig.setDeviceName(deviceName)
        deviceConfig.setSetupComplete(true)
    }
}

/**
 * Initial device setup screen shown on first launch.
 * 
 * Allows selecting device type and setting a friendly name.
 * Pre-selects the device type based on the build flavor.
 * 
 * @see [design.md FR-22] - Device Pairing Ceremony Flow
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceSetupScreen(
    viewModel: DeviceSetupViewModel = hiltViewModel(),
    onSetupComplete: () -> Unit
) {
    // Pre-select device type from build flavor
    val defaultType = viewModel.deviceConfig.getDeviceType()
    var selectedType by remember { mutableStateOf(defaultType) }
    var deviceName by remember { mutableStateOf("") }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Device Setup") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // Header
            Text(
                text = "Configure This Device",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Select the role this device will serve in the membership system.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            // Device Type Selection
            Text(
                text = "Device Type",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            
            Column(
                modifier = Modifier.selectableGroup(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                DeviceTypeOption(
                    type = DeviceType.MEMBER_TABLET,
                    title = "Member Tablet",
                    description = "Self-service check-in for members",
                    icon = Icons.Default.Person,
                    selected = selectedType == DeviceType.MEMBER_TABLET,
                    onClick = { selectedType = DeviceType.MEMBER_TABLET }
                )
                
                DeviceTypeOption(
                    type = DeviceType.ADMIN_TABLET,
                    title = "Admin Tablet",
                    description = "Check-in + equipment management + admin features",
                    icon = Icons.Default.AdminPanelSettings,
                    selected = selectedType == DeviceType.ADMIN_TABLET,
                    onClick = { selectedType = DeviceType.ADMIN_TABLET }
                )
                
                DeviceTypeOption(
                    type = DeviceType.DISPLAY_EQUIPMENT,
                    title = "Equipment Display",
                    description = "Read-only display of equipment status",
                    icon = Icons.Default.Tv,
                    selected = selectedType == DeviceType.DISPLAY_EQUIPMENT,
                    onClick = { selectedType = DeviceType.DISPLAY_EQUIPMENT }
                )
                
                DeviceTypeOption(
                    type = DeviceType.DISPLAY_PRACTICE,
                    title = "Practice Display",
                    description = "Read-only display of practice session results",
                    icon = Icons.Default.Tv,
                    selected = selectedType == DeviceType.DISPLAY_PRACTICE,
                    onClick = { selectedType = DeviceType.DISPLAY_PRACTICE }
                )
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Device Name
            Text(
                text = "Device Name",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            
            OutlinedTextField(
                value = deviceName,
                onValueChange = { deviceName = it.take(50) },
                label = { Text("Friendly name (e.g., 'Admin Tablet 1')") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                supportingText = { 
                    Text("This name will be shown when pairing with other devices")
                }
            )
            
            Spacer(modifier = Modifier.weight(1f))
            
            // Complete Setup Button
            Button(
                onClick = {
                    viewModel.saveConfiguration(selectedType, deviceName)
                    onSetupComplete()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                enabled = deviceName.isNotBlank()
            ) {
                Icon(Icons.Default.Check, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Complete Setup")
            }
        }
    }
}

@Composable
private fun DeviceTypeOption(
    type: DeviceType,
    title: String,
    description: String,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(
                selected = selected,
                onClick = onClick,
                role = Role.RadioButton
            ),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surface
            }
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = if (selected) 4.dp else 1.dp
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            RadioButton(
                selected = selected,
                onClick = null // Handled by selectable modifier
            )
            Spacer(modifier = Modifier.width(12.dp))
            Icon(
                icon,
                contentDescription = null,
                modifier = Modifier.size(32.dp),
                tint = if (selected) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                }
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
