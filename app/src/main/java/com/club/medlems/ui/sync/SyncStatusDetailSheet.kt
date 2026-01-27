package com.club.medlems.ui.sync

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Laptop
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Tablet
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.sync.DeviceInfo
import com.club.medlems.data.sync.DeviceType
import com.club.medlems.data.sync.SyncStatusDetail
import com.club.medlems.data.sync.SyncStatusState
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * Bottom sheet showing detailed sync status information.
 * Shows connected devices, pending items, failed items, and allows manual sync.
 *
 * @param onDismiss Called when the sheet should be dismissed
 * @param viewModel SyncViewModel instance
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncStatusDetailSheet(
    onDismiss: () -> Unit,
    viewModel: SyncViewModel = hiltViewModel()
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val syncStatusState by viewModel.syncStatusState.collectAsState()
    val syncUiState by viewModel.syncUiState.collectAsState()
    val trustedDevices by viewModel.trustedDevices.collectAsState()

    var statusDetail by remember { mutableStateOf<SyncStatusDetail?>(null) }

    // Load detailed status on sheet open
    LaunchedEffect(Unit) {
        statusDetail = viewModel.getSyncStatusDetail()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 32.dp)
        ) {
            // Header
            Text(
                text = "Synkroniseringsstatus",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Current status card
            SyncStatusCard(
                syncStatusState = syncStatusState,
                lastSyncTime = syncUiState.lastSyncTime
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Connected devices section
            Text(
                text = "Forbundne enheder",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Medium
            )

            Spacer(modifier = Modifier.height(8.dp))

            if (trustedDevices.isEmpty()) {
                Text(
                    text = "Ingen enheder forbundet",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                LazyColumn(
                    modifier = Modifier.height(150.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(trustedDevices) { device ->
                        DeviceStatusRow(
                            device = device,
                            lastSyncTime = statusDetail?.connectedPeers?.find { it.deviceId == device.id }?.lastSyncTime
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Pending and failed counts
            statusDetail?.let { detail ->
                if (detail.pendingCount > 0 || detail.failedCount > 0) {
                    HorizontalDivider()
                    Spacer(modifier = Modifier.height(16.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        StatusCountBadge(
                            count = detail.pendingCount,
                            label = "Afventer",
                            color = MaterialTheme.colorScheme.tertiary
                        )
                        StatusCountBadge(
                            count = detail.failedCount,
                            label = "Fejlet",
                            color = MaterialTheme.colorScheme.error
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                }
            }

            // Action buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Manual sync button
                Button(
                    onClick = { viewModel.syncNow() },
                    modifier = Modifier.weight(1f),
                    enabled = syncStatusState !is SyncStatusState.Syncing
                ) {
                    if (syncStatusState is SyncStatusState.Syncing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Sync,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Synkroniser nu")
                }

                // Retry failed button (only show if there are failed items)
                statusDetail?.let { detail ->
                    if (detail.failedCount > 0) {
                        OutlinedButton(
                            onClick = { viewModel.retryFailedEntries() },
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = MaterialTheme.colorScheme.error
                            )
                        ) {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Prøv igen")
                        }
                    }
                }
            }
        }
    }
}

/**
 * Card showing the current sync status with icon and description.
 */
@Composable
private fun SyncStatusCard(
    syncStatusState: SyncStatusState,
    lastSyncTime: Instant?
) {
    val (icon, iconColor, statusText, statusDescription) = when (syncStatusState) {
        is SyncStatusState.Synced -> Quadruple(
            Icons.Default.CloudDone,
            MaterialTheme.colorScheme.primary,
            "Synkroniseret",
            "Alle data er synkroniseret med ${syncStatusState.connectedPeerCount} enhed(er)"
        )
        is SyncStatusState.Syncing -> Quadruple(
            Icons.Default.Sync,
            MaterialTheme.colorScheme.primary,
            "Synkroniserer...",
            syncStatusState.peerName?.let { "Synkroniserer med $it" } ?: "Synkronisering i gang"
        )
        is SyncStatusState.Pending -> Quadruple(
            Icons.Default.Warning,
            MaterialTheme.colorScheme.tertiary,
            "Afventer synkronisering",
            "${syncStatusState.count} ændring(er) afventer"
        )
        is SyncStatusState.Error -> Quadruple(
            Icons.Default.Error,
            MaterialTheme.colorScheme.error,
            "Synkroniseringsfejl",
            syncStatusState.message
        )
        SyncStatusState.Offline -> Quadruple(
            Icons.Default.Warning,
            MaterialTheme.colorScheme.outline,
            "Offline",
            "Ingen netværksforbindelse"
        )
        SyncStatusState.NoPeers -> Quadruple(
            Icons.Default.Warning,
            MaterialTheme.colorScheme.outline,
            "Ingen enheder",
            "Ingen andre enheder fundet på netværket"
        )
        SyncStatusState.Idle -> Quadruple(
            Icons.Default.Check,
            MaterialTheme.colorScheme.outline,
            "Klar",
            "Synkronisering er klar"
        )
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = iconColor.copy(alpha = 0.1f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(40.dp),
                tint = iconColor
            )

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = statusText,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                    color = iconColor
                )
                Text(
                    text = statusDescription,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                lastSyncTime?.let {
                    Text(
                        text = "Sidst synkroniseret: ${formatTime(it)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                }
            }
        }
    }
}

/**
 * Row showing a connected device and its last sync time.
 */
@Composable
private fun DeviceStatusRow(
    device: DeviceInfo,
    lastSyncTime: Instant?
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = when (device.type) {
                    DeviceType.LAPTOP -> Icons.Default.Laptop
                    else -> Icons.Default.Tablet
                },
                contentDescription = null,
                modifier = Modifier.size(24.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = device.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = device.type.name.replace("_", " ").lowercase()
                        .replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            lastSyncTime?.let {
                Text(
                    text = formatTime(it),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/**
 * Badge showing a count with a label.
 */
@Composable
private fun StatusCountBadge(
    count: Int,
    label: String,
    color: Color
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = color
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/**
 * Formats an Instant as a relative or absolute time string.
 */
private fun formatTime(instant: Instant): String {
    val now = kotlinx.datetime.Clock.System.now()
    val diff = now - instant

    return when {
        diff.inWholeMinutes < 1 -> "Lige nu"
        diff.inWholeMinutes < 60 -> "for ${diff.inWholeMinutes} min. siden"
        diff.inWholeHours < 24 -> "for ${diff.inWholeHours} t. siden"
        else -> {
            val local = instant.toLocalDateTime(TimeZone.currentSystemDefault())
            "${local.dayOfMonth}/${local.monthNumber} kl. ${local.hour}:${local.minute.toString().padStart(2, '0')}"
        }
    }
}

/**
 * Helper data class for quadruple values.
 */
private data class Quadruple<A, B, C, D>(
    val first: A,
    val second: B,
    val third: C,
    val fourth: D
)
