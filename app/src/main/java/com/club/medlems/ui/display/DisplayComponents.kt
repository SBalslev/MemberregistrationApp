package com.club.medlems.ui.display

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Monitor
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * Display mode types for the display tablet variants.
 * 
 * @see [design.md FR-1.5, FR-1.6] - Equipment Display and Practice Display
 */
enum class DisplayType {
    EQUIPMENT,
    PRACTICE
}

/**
 * Header bar for display tablet mode.
 * Shows the display type prominently with sync status indicator.
 * 
 * @see [design.md FR-20] - Display Tablet Details
 */
@Composable
fun DisplayModeHeader(
    displayType: DisplayType,
    lastSyncTime: String? = null,
    isOnline: Boolean = true,
    modifier: Modifier = Modifier
) {
    val displayTitle = when (displayType) {
        DisplayType.EQUIPMENT -> "Udstyr Display"
        DisplayType.PRACTICE -> "Træning Display"
    }
    
    val displayColor = when (displayType) {
        DisplayType.EQUIPMENT -> Color(0xFF2196F3) // Blue
        DisplayType.PRACTICE -> Color(0xFF4CAF50) // Green
    }
    
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = displayColor,
        shadowElevation = 4.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Title with icon
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Monitor,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(32.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = displayTitle,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
            
            // Sync status
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Online indicator
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .background(
                            color = if (isOnline) Color(0xFF4CAF50) else Color(0xFFFF5722),
                            shape = CircleShape
                        )
                )
                Spacer(modifier = Modifier.width(8.dp))
                
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = if (isOnline) "Online" else "Offline",
                        fontSize = 14.sp,
                        color = Color.White.copy(alpha = 0.9f)
                    )
                    if (lastSyncTime != null) {
                        Text(
                            text = "Sidst synkroniseret: $lastSyncTime",
                            fontSize = 12.sp,
                            color = Color.White.copy(alpha = 0.7f)
                        )
                    }
                }
                
                Spacer(modifier = Modifier.width(8.dp))
                Icon(
                    imageVector = Icons.Default.Sync,
                    contentDescription = "Sync status",
                    tint = Color.White.copy(alpha = 0.7f),
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

/**
 * Clock display for display tablets showing current time.
 * Updates every second.
 */
@Composable
fun DisplayClock(
    modifier: Modifier = Modifier
) {
    var currentTime by remember { mutableStateOf("") }
    var currentDate by remember { mutableStateOf("") }
    
    LaunchedEffect(Unit) {
        while (true) {
            val now = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault())
            currentTime = "%02d:%02d".format(now.hour, now.minute)
            currentDate = "%02d/%02d/%d".format(now.dayOfMonth, now.monthNumber, now.year)
            delay(1000)
        }
    }
    
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = currentTime,
            fontSize = 48.sp,
            fontWeight = FontWeight.Light,
            color = MaterialTheme.colorScheme.onSurface
        )
        Text(
            text = currentDate,
            fontSize = 18.sp,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
        )
    }
}

/**
 * Auto-refresh indicator showing countdown to next refresh.
 * 
 * @see [design.md FR-20] - Configurable auto-refresh timer
 */
@Composable
fun AutoRefreshIndicator(
    refreshIntervalSeconds: Int = 15,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    var secondsUntilRefresh by remember { mutableIntStateOf(refreshIntervalSeconds) }
    
    LaunchedEffect(refreshIntervalSeconds) {
        while (true) {
            delay(1000)
            secondsUntilRefresh--
            if (secondsUntilRefresh <= 0) {
                onRefresh()
                secondsUntilRefresh = refreshIntervalSeconds
            }
        }
    }
    
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Default.Refresh,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = "Opdaterer om ${secondsUntilRefresh}s",
            fontSize = 14.sp,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
        )
    }
}

/**
 * Large empty state for display tablets.
 * Uses extra-large fonts for distance visibility.
 */
@Composable
fun DisplayEmptyState(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = title,
            fontSize = 36.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = subtitle,
            fontSize = 24.sp,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
        )
    }
}
