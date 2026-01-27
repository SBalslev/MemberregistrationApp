package com.club.medlems.ui.sync

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.SyncDisabled
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.sync.SyncState
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * Compact sync status indicator for display in app bars or headers.
 * Shows current sync state with visual feedback.
 * 
 * @param modifier Modifier for the composable
 * @param onClick Called when the indicator is tapped (typically to trigger manual sync)
 * @param viewModel SyncViewModel instance
 */
@Composable
fun SyncStatusIndicator(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    viewModel: SyncViewModel = hiltViewModel()
) {
    val uiState by viewModel.syncUiState.collectAsState()
    
    SyncStatusIndicatorContent(
        state = uiState.state,
        pendingCount = uiState.pendingChangesCount,
        peerCount = uiState.connectedPeerCount,
        isNetworkAvailable = uiState.isNetworkAvailable,
        lastSyncTime = uiState.lastSyncTime,
        onClick = onClick ?: { viewModel.syncNow() },
        modifier = modifier
    )
}

/**
 * Stateless content composable for the sync status indicator.
 */
@Composable
fun SyncStatusIndicatorContent(
    state: SyncState,
    pendingCount: Int,
    peerCount: Int,
    isNetworkAvailable: Boolean,
    lastSyncTime: Instant?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val backgroundColor by animateColorAsState(
        targetValue = when {
            state == SyncState.SYNCING -> MaterialTheme.colorScheme.primaryContainer
            state == SyncState.ERROR -> MaterialTheme.colorScheme.errorContainer
            !isNetworkAvailable -> MaterialTheme.colorScheme.surfaceVariant
            pendingCount > 0 -> MaterialTheme.colorScheme.tertiaryContainer
            else -> MaterialTheme.colorScheme.secondaryContainer
        },
        label = "background"
    )
    
    val contentColor by animateColorAsState(
        targetValue = when {
            state == SyncState.SYNCING -> MaterialTheme.colorScheme.onPrimaryContainer
            state == SyncState.ERROR -> MaterialTheme.colorScheme.onErrorContainer
            !isNetworkAvailable -> MaterialTheme.colorScheme.onSurfaceVariant
            pendingCount > 0 -> MaterialTheme.colorScheme.onTertiaryContainer
            else -> MaterialTheme.colorScheme.onSecondaryContainer
        },
        label = "content"
    )
    
    Surface(
        modifier = modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(8.dp),
        color = backgroundColor
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            SyncIcon(
                state = state,
                isNetworkAvailable = isNetworkAvailable,
                tint = contentColor
            )
            
            Column {
                Text(
                    text = getSyncStatusText(state, isNetworkAvailable, peerCount),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Medium,
                    color = contentColor
                )
                
                if (pendingCount > 0 && state != SyncState.SYNCING) {
                    Text(
                        text = "$pendingCount pending",
                        style = MaterialTheme.typography.labelSmall,
                        color = contentColor.copy(alpha = 0.7f)
                    )
                } else if (lastSyncTime != null) {
                    Text(
                        text = formatLastSyncTime(lastSyncTime),
                        style = MaterialTheme.typography.labelSmall,
                        color = contentColor.copy(alpha = 0.7f)
                    )
                }
            }
            
            // Peer indicator
            if (peerCount > 0) {
                Spacer(modifier = Modifier.width(4.dp))
                PeerIndicator(peerCount = peerCount, tint = contentColor)
            }
        }
    }
}

/**
 * Animated sync icon based on current state.
 */
@Composable
private fun SyncIcon(
    state: SyncState,
    isNetworkAvailable: Boolean,
    tint: Color
) {
    val infiniteTransition = rememberInfiniteTransition(label = "sync")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "rotation"
    )
    
    val icon = when {
        state == SyncState.SYNCING -> Icons.Default.Sync
        state == SyncState.ERROR -> Icons.Default.Error
        !isNetworkAvailable -> Icons.Default.CloudOff
        state == SyncState.STOPPED -> Icons.Default.SyncDisabled
        else -> Icons.Default.Check
    }
    
    Icon(
        imageVector = icon,
        contentDescription = "Sync status",
        modifier = Modifier
            .size(20.dp)
            .then(
                if (state == SyncState.SYNCING) {
                    Modifier.rotate(rotation)
                } else {
                    Modifier
                }
            ),
        tint = tint
    )
}

/**
 * Small indicator showing connected peer count.
 */
@Composable
private fun PeerIndicator(
    peerCount: Int,
    tint: Color
) {
    Box(
        modifier = Modifier
            .size(20.dp)
            .background(tint.copy(alpha = 0.2f), CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = peerCount.toString(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = tint
        )
    }
}

/**
 * Returns human-readable status text.
 */
private fun getSyncStatusText(
    state: SyncState,
    isNetworkAvailable: Boolean,
    peerCount: Int
): String {
    return when {
        state == SyncState.SYNCING -> "Syncing..."
        state == SyncState.ERROR -> "Sync Error"
        !isNetworkAvailable -> "Offline"
        state == SyncState.STOPPED -> "Sync Stopped"
        peerCount == 0 -> "No Peers"
        else -> "Synced"
    }
}

/**
 * Formats the last sync time as a relative or absolute string.
 */
private fun formatLastSyncTime(instant: Instant): String {
    val now = kotlinx.datetime.Clock.System.now()
    val diff = now - instant
    
    return when {
        diff.inWholeMinutes < 1 -> "Just now"
        diff.inWholeMinutes < 60 -> "${diff.inWholeMinutes}m ago"
        diff.inWholeHours < 24 -> "${diff.inWholeHours}h ago"
        else -> {
            val local = instant.toLocalDateTime(TimeZone.currentSystemDefault())
            "${local.dayOfMonth}/${local.monthNumber} ${local.hour}:${local.minute.toString().padStart(2, '0')}"
        }
    }
}
