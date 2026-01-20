package com.club.medlems.ui.display

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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.delay

/**
 * Full-screen equipment status display for wall-mounted tablets.
 * Shows all equipment with checkout status in a grid layout.
 * Auto-refreshes every 15 seconds.
 * 
 * @see [design.md FR-1.5] - Equipment Display Tablet
 * @see [design.md FR-20] - Display Tablet Details
 */
@Composable
fun EquipmentDisplayScreen(
    viewModel: EquipmentDisplayViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var lastSyncTimeFormatted by remember { mutableStateOf<String?>(null) }
    
    // Auto-refresh every 15 seconds
    LaunchedEffect(Unit) {
        while (true) {
            viewModel.refresh()
            delay(15_000)
        }
    }
    
    // Update last sync time display
    LaunchedEffect(uiState.lastSyncTime) {
        uiState.lastSyncTime?.let { syncTime ->
            val now = kotlinx.datetime.Clock.System.now()
            val diff = now - syncTime
            lastSyncTimeFormatted = when {
                diff.inWholeMinutes < 1 -> "lige nu"
                diff.inWholeMinutes < 60 -> "${diff.inWholeMinutes} min siden"
                diff.inWholeHours < 24 -> "${diff.inWholeHours} timer siden"
                else -> "${diff.inWholeDays} dage siden"
            }
        }
    }
    
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Color(0xFF1A1A2E) // Dark blue background
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Header
            DisplayModeHeader(
                displayType = DisplayType.EQUIPMENT,
                lastSyncTime = lastSyncTimeFormatted,
                isOnline = uiState.isOnline
            )
            
            // Stats bar
            EquipmentStatsBar(
                totalEquipment = uiState.equipment.size,
                availableCount = uiState.equipment.count { it.checkoutInfo == null },
                checkedOutCount = uiState.equipment.count { it.checkoutInfo != null }
            )
            
            // Main content - equipment grid
            if (uiState.equipment.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    DisplayEmptyState(
                        title = "Intet udstyr registreret",
                        subtitle = "Tilføj udstyr via træner-tablet"
                    )
                }
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 280.dp),
                    contentPadding = PaddingValues(24.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(uiState.equipment) { item ->
                        EquipmentDisplayCard(
                            name = item.name,
                            category = item.category,
                            isCheckedOut = item.checkoutInfo != null,
                            borrowerName = item.checkoutInfo?.memberName,
                            checkoutTime = item.checkoutInfo?.checkoutTimeFormatted
                        )
                    }
                }
            }
        }
    }
}

/**
 * Stats bar showing equipment availability summary.
 */
@Composable
private fun EquipmentStatsBar(
    totalEquipment: Int,
    availableCount: Int,
    checkedOutCount: Int
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF16213E))
            .padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        StatItem(
            label = "I alt",
            value = totalEquipment.toString(),
            color = Color.White
        )
        StatItem(
            label = "Tilgængelig",
            value = availableCount.toString(),
            color = Color(0xFF4CAF50)
        )
        StatItem(
            label = "Udlånt",
            value = checkedOutCount.toString(),
            color = Color(0xFFFF9800)
        )
    }
}

@Composable
private fun StatItem(
    label: String,
    value: String,
    color: Color
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            fontSize = 48.sp,
            fontWeight = FontWeight.Bold,
            color = color
        )
        Text(
            text = label,
            fontSize = 18.sp,
            color = Color.White.copy(alpha = 0.7f)
        )
    }
}

/**
 * Large card showing equipment status.
 * Green = available, Orange = checked out.
 */
@Composable
private fun EquipmentDisplayCard(
    name: String,
    category: String?,
    isCheckedOut: Boolean,
    borrowerName: String?,
    checkoutTime: String?
) {
    val cardColor = if (isCheckedOut) {
        Color(0xFFFF9800).copy(alpha = 0.15f)
    } else {
        Color(0xFF4CAF50).copy(alpha = 0.15f)
    }
    
    val statusColor = if (isCheckedOut) Color(0xFFFF9800) else Color(0xFF4CAF50)
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(160.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = cardColor)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Top: Name and category
            Column {
                Text(
                    text = name,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (category != null) {
                    Text(
                        text = category,
                        fontSize = 16.sp,
                        color = Color.White.copy(alpha = 0.6f)
                    )
                }
            }
            
            // Bottom: Status
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (isCheckedOut && borrowerName != null) {
                    // Show borrower info
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .background(statusColor.copy(alpha = 0.3f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            tint = statusColor,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = borrowerName,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color.White,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (checkoutTime != null) {
                            Text(
                                text = "Siden $checkoutTime",
                                fontSize = 14.sp,
                                color = Color.White.copy(alpha = 0.6f)
                            )
                        }
                    }
                } else {
                    // Available
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .background(statusColor.copy(alpha = 0.3f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = statusColor,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "Tilgængelig",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Medium,
                        color = statusColor
                    )
                }
            }
        }
    }
}
