package com.club.medlems.ui.sync

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.LinkOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.sync.DeviceInfo
import com.club.medlems.data.sync.DeviceType
import com.club.medlems.data.sync.SyncLogEntry
import com.club.medlems.data.sync.SyncLogLevel
import com.club.medlems.network.DiscoveredDevice
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * Screen for device discovery and pairing.
 * Allows users to find and pair with other devices on the local network.
 * 
 * @see [design.md FR-9] - Device Pairing and Trust
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DevicePairingScreen(
    onNavigateBack: () -> Unit,
    viewModel: SyncViewModel = hiltViewModel()
) {
    val discoveredDevices by viewModel.discoveredDevices.collectAsState()
    val trustedDevices by viewModel.trustedDevices.collectAsState()
    val pairingState by viewModel.pairingState.collectAsState()
    val isScanning by viewModel.isScanning.collectAsState()
    val isNetworkAvailable by viewModel.isNetworkAvailable.collectAsState()
    val logEntries by viewModel.logEntries.collectAsState()
    
    var isLogExpanded by remember { mutableStateOf(false) }
    
    val snackbarHostState = remember { SnackbarHostState() }
    
    // Handle pairing state changes
    LaunchedEffect(pairingState) {
        when (val state = pairingState) {
            is PairingState.Success -> {
                snackbarHostState.showSnackbar("Paired with ${state.deviceName}")
                viewModel.resetPairingState()
            }
            is PairingState.Error -> {
                snackbarHostState.showSnackbar("Error: ${state.message}")
                viewModel.resetPairingState()
            }
            else -> {}
        }
    }
    
    // Start discovery when screen opens
    LaunchedEffect(Unit) {
        viewModel.startDiscovery()
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Device Pairing") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            if (isScanning) viewModel.stopDiscovery()
                            else viewModel.startDiscovery()
                        }
                    ) {
                        Icon(
                            Icons.Default.Refresh,
                            contentDescription = if (isScanning) "Stop scanning" else "Refresh"
                        )
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            // Network status card
            NetworkStatusCard(
                isNetworkAvailable = isNetworkAvailable,
                isScanning = isScanning
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Trusted devices section
            if (trustedDevices.isNotEmpty()) {
                Text(
                    text = "Paired Devices",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                
                LazyColumn(
                    contentPadding = PaddingValues(vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(0.4f)
                ) {
                    items(trustedDevices, key = { it.id }) { device ->
                        TrustedDeviceCard(
                            device = device,
                            isOnline = discoveredDevices.any { it.deviceId == device.id },
                            onUnpair = { viewModel.unpairDevice(device.id) }
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
            }
            
            // Available devices section
            Text(
                text = "Available Devices",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            
            val unpairedDevices = discoveredDevices.filter { discovered ->
                trustedDevices.none { it.id == discovered.deviceId }
            }
            
            if (unpairedDevices.isEmpty()) {
                EmptyDevicesPlaceholder(
                    isScanning = isScanning,
                    isNetworkAvailable = isNetworkAvailable
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    items(unpairedDevices, key = { it.deviceId }) { device ->
                        DiscoveredDeviceCard(
                            device = device,
                            isPairing = pairingState is PairingState.Pairing &&
                                (pairingState as PairingState.Pairing).deviceName == device.deviceName,
                            onPair = { viewModel.pairWithDevice(device) }
                        )
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Sync Log Panel
            SyncLogPanel(
                logEntries = logEntries,
                isExpanded = isLogExpanded,
                onToggleExpanded = { isLogExpanded = !isLogExpanded },
                onClearLogs = { viewModel.clearLogs() }
            )
        }
    }
}

/**
 * Card showing network connection status.
 */
@Composable
private fun NetworkStatusCard(
    isNetworkAvailable: Boolean,
    isScanning: Boolean
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (isNetworkAvailable)
                MaterialTheme.colorScheme.primaryContainer
            else
                MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Wifi,
                contentDescription = null,
                tint = if (isNetworkAvailable)
                    MaterialTheme.colorScheme.onPrimaryContainer
                else
                    MaterialTheme.colorScheme.onErrorContainer
            )
            
            Spacer(modifier = Modifier.width(12.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (isNetworkAvailable) "Connected to Network" else "No Network",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = if (isNetworkAvailable)
                        MaterialTheme.colorScheme.onPrimaryContainer
                    else
                        MaterialTheme.colorScheme.onErrorContainer
                )
                Text(
                    text = if (isScanning) "Scanning for devices..." else "Tap refresh to scan",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (isNetworkAvailable)
                        MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                    else
                        MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.7f)
                )
            }
            
            AnimatedVisibility(
                visible = isScanning,
                enter = fadeIn(),
                exit = fadeOut()
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    strokeWidth = 2.dp
                )
            }
        }
    }
}

/**
 * Card for a trusted/paired device.
 */
@Composable
private fun TrustedDeviceCard(
    device: DeviceInfo,
    isOnline: Boolean,
    onUnpair: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            DeviceTypeIcon(deviceType = device.type)
            
            Spacer(modifier = Modifier.width(12.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = device.name,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    OnlineIndicator(isOnline = isOnline)
                }
                Text(
                    text = device.type.displayName,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            IconButton(onClick = onUnpair) {
                Icon(
                    imageVector = Icons.Default.LinkOff,
                    contentDescription = "Unpair",
                    tint = MaterialTheme.colorScheme.error
                )
            }
        }
    }
}

/**
 * Card for a discovered (unpaired) device.
 */
@Composable
private fun DiscoveredDeviceCard(
    device: DiscoveredDevice,
    isPairing: Boolean,
    onPair: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            DeviceTypeIcon(deviceType = device.deviceType)
            
            Spacer(modifier = Modifier.width(12.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = device.deviceName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = "${device.deviceType.displayName} • ${device.address.hostAddress}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (!device.isCompatible()) {
                    Text(
                        text = "Incompatible version",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
            
            if (isPairing) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    strokeWidth = 2.dp
                )
            } else {
                FilledTonalButton(
                    onClick = onPair,
                    enabled = device.isCompatible()
                ) {
                    Icon(Icons.Default.Link, contentDescription = null)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Pair")
                }
            }
        }
    }
}

/**
 * Placeholder shown when no devices are discovered.
 */
@Composable
private fun EmptyDevicesPlaceholder(
    isScanning: Boolean,
    isNetworkAvailable: Boolean
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(32.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.Devices,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = when {
                    !isNetworkAvailable -> "Connect to Wi-Fi to find devices"
                    isScanning -> "Searching for devices..."
                    else -> "No devices found"
                },
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (!isScanning && isNetworkAvailable) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Make sure other devices are on the same network",
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )
            }
        }
    }
}

/**
 * Icon representing the device type.
 */
@Composable
private fun DeviceTypeIcon(deviceType: DeviceType) {
    Surface(
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
        modifier = Modifier.size(40.dp)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = Icons.Default.Devices,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

/**
 * Small indicator showing online/offline status.
 */
@Composable
private fun OnlineIndicator(isOnline: Boolean) {
    Box(
        modifier = Modifier
            .size(8.dp)
            .background(
                color = if (isOnline) 
                    MaterialTheme.colorScheme.primary 
                else 
                    MaterialTheme.colorScheme.outline,
                shape = CircleShape
            )
    )
}

/**
 * Display name for device types.
 */
private val DeviceType.displayName: String
    get() = when (this) {
        DeviceType.LAPTOP -> "Master Laptop"
        DeviceType.ADMIN_TABLET -> "Admin Tablet"
        DeviceType.MEMBER_TABLET -> "Member Tablet"
        DeviceType.DISPLAY_EQUIPMENT -> "Equipment Display"
        DeviceType.DISPLAY_PRACTICE -> "Practice Display"
    }

/**
 * Expandable panel showing sync operation logs.
 */
@Composable
private fun SyncLogPanel(
    logEntries: List<SyncLogEntry>,
    isExpanded: Boolean,
    onToggleExpanded: () -> Unit,
    onClearLogs: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // Header row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Sync Log",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                
                Text(
                    text = "${logEntries.size} entries",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                
                Spacer(modifier = Modifier.width(8.dp))
                
                if (logEntries.isNotEmpty()) {
                    IconButton(
                        onClick = onClearLogs,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Clear,
                            contentDescription = "Clear logs",
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
                
                IconButton(
                    onClick = onToggleExpanded,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = if (isExpanded) "Collapse" else "Expand",
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            
            // Log entries (visible when expanded)
            if (isExpanded) {
                if (logEntries.isEmpty()) {
                    Text(
                        text = "No log entries yet. Start discovery or sync to see events.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp)
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 16.dp)
                            .padding(bottom = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        // Show newest entries first
                        logEntries.reversed().forEach { entry ->
                            SyncLogEntryRow(entry)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Single log entry row.
 */
@Composable
private fun SyncLogEntryRow(entry: SyncLogEntry) {
    val localDateTime = entry.timestamp.toLocalDateTime(TimeZone.currentSystemDefault())
    val timeStr = "%02d:%02d:%02d".format(
        localDateTime.hour,
        localDateTime.minute,
        localDateTime.second
    )
    
    val levelColor = when (entry.level) {
        SyncLogLevel.DEBUG -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
        SyncLogLevel.INFO -> MaterialTheme.colorScheme.onSurface
        SyncLogLevel.WARN -> MaterialTheme.colorScheme.tertiary
        SyncLogLevel.ERROR -> MaterialTheme.colorScheme.error
    }
    
    val levelLabel = when (entry.level) {
        SyncLogLevel.DEBUG -> "DBG"
        SyncLogLevel.INFO -> "INF"
        SyncLogLevel.WARN -> "WRN"
        SyncLogLevel.ERROR -> "ERR"
    }
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = timeStr,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(56.dp)
        )
        
        Text(
            text = levelLabel,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = levelColor,
            modifier = Modifier.width(32.dp)
        )
        
        Text(
            text = "[${entry.source}]",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.width(64.dp)
        )
        
        Text(
            text = entry.message,
            style = MaterialTheme.typography.labelSmall,
            color = levelColor,
            modifier = Modifier.weight(1f)
        )
    }
}
