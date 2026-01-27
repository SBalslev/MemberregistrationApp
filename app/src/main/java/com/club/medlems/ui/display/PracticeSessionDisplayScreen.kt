package com.club.medlems.ui.display

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.SportsScore
import androidx.compose.material.icons.filled.TrendingUp
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.delay

/**
 * Full-screen practice session display for wall-mounted tablets.
 * Rotates between leaderboard, recent activity, and statistics views.
 * Auto-refreshes every 15 seconds.
 * 
 * @see [design.md FR-1.6] - Practice Session Display Tablet
 * @see [design.md FR-20] - Display Tablet Details
 */
@Composable
fun PracticeSessionDisplayScreen(
    viewModel: PracticeSessionDisplayViewModel = hiltViewModel()
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
        color = Color(0xFF1A1A2E)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp)
        ) {
            // Header
            DisplayHeader(
                title = "Træningssessioner i dag",
                subtitle = "${uiState.todaySessionCount} sessioner • ${uiState.todayParticipantCount} medlemmer",
                isOnline = uiState.isOnline,
                lastSyncTime = lastSyncTimeFormatted
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // View indicator
            ViewIndicator(
                currentView = uiState.currentView,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Content based on current view - animated
            AnimatedContent(
                targetState = uiState.currentView,
                transitionSpec = { fadeIn() togetherWith fadeOut() },
                modifier = Modifier.weight(1f),
                label = "view_transition"
            ) { view ->
                when (view) {
                    DisplayView.LEADERBOARD -> LeaderboardView(
                        entries = uiState.leaderboard
                    )
                    DisplayView.RECENT_ACTIVITY -> RecentActivityView(
                        recentActivity = uiState.recentActivity
                    )
                    DisplayView.STATS -> StatsView(
                        todaySessionCount = uiState.todaySessionCount,
                        todayParticipantCount = uiState.todayParticipantCount,
                        todayTotalPoints = uiState.todayTotalPoints,
                        statsByType = uiState.statsByType
                    )
                }
            }
        }
    }
}

/**
 * Header component for display screens.
 */
@Composable
private fun DisplayHeader(
    title: String,
    subtitle: String,
    isOnline: Boolean,
    lastSyncTime: String?
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Column {
            Text(
                text = title,
                fontSize = 48.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Text(
                text = subtitle,
                fontSize = 24.sp,
                color = Color.White.copy(alpha = 0.7f)
            )
        }
        
        // Sync status
        Column(horizontalAlignment = Alignment.End) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(if (isOnline) Color(0xFF4CAF50) else Color(0xFFFF9800))
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (isOnline) "Online" else "Offline",
                    fontSize = 18.sp,
                    color = Color.White.copy(alpha = 0.7f)
                )
            }
            lastSyncTime?.let {
                Text(
                    text = "Opdateret $it",
                    fontSize = 14.sp,
                    color = Color.White.copy(alpha = 0.5f)
                )
            }
        }
    }
}

/**
 * View indicator showing which view is currently active.
 */
@Composable
private fun ViewIndicator(
    currentView: DisplayView,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        DisplayView.entries.forEach { view ->
            Box(
                modifier = Modifier
                    .size(if (view == currentView) 12.dp else 8.dp)
                    .clip(CircleShape)
                    .background(
                        if (view == currentView) Color(0xFF6C63FF)
                        else Color.White.copy(alpha = 0.3f)
                    )
            )
        }
    }
}

/**
 * Leaderboard view showing top practitioners.
 */
@Composable
private fun LeaderboardView(
    entries: List<LeaderboardEntry>
) {
    Column {
        Text(
            text = "🏆 Topscorere i dag",
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier.padding(bottom = 16.dp)
        )
        
        if (entries.isEmpty()) {
            EmptyStateMessage("Ingen træningssessioner endnu i dag")
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(vertical = 8.dp)
            ) {
                itemsIndexed(entries.take(10)) { index, entry ->
                    LeaderboardEntryCard(
                        rank = index + 1,
                        entry = entry
                    )
                }
            }
        }
    }
}

/**
 * Card for a single leaderboard entry.
 */
@Composable
private fun LeaderboardEntryCard(
    rank: Int,
    entry: LeaderboardEntry
) {
    val backgroundColor = when (rank) {
        1 -> Color(0xFFFFD700).copy(alpha = 0.2f) // Gold
        2 -> Color(0xFFC0C0C0).copy(alpha = 0.2f) // Silver
        3 -> Color(0xFFCD7F32).copy(alpha = 0.2f) // Bronze
        else -> Color.White.copy(alpha = 0.1f)
    }
    
    val rankColor = when (rank) {
        1 -> Color(0xFFFFD700)
        2 -> Color(0xFFC0C0C0)
        3 -> Color(0xFFCD7F32)
        else -> Color.White.copy(alpha = 0.7f)
    }
    
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = backgroundColor),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Rank
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(rankColor.copy(alpha = 0.3f)),
                contentAlignment = Alignment.Center
            ) {
                if (rank <= 3) {
                    Icon(
                        imageVector = Icons.Default.EmojiEvents,
                        contentDescription = null,
                        tint = rankColor,
                        modifier = Modifier.size(32.dp)
                    )
                } else {
                    Text(
                        text = "#$rank",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = rankColor
                    )
                }
            }
            
            Spacer(modifier = Modifier.width(20.dp))
            
            // Member info
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = entry.memberName,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "${entry.sessionCount} sessioner",
                    fontSize = 18.sp,
                    color = Color.White.copy(alpha = 0.6f)
                )
            }
            
            // Total points
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "${entry.totalPoints}",
                    fontSize = 36.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF6C63FF)
                )
                Text(
                    text = "point",
                    fontSize = 14.sp,
                    color = Color.White.copy(alpha = 0.5f)
                )
            }
        }
    }
}

/**
 * Recent activity view showing latest sessions.
 */
@Composable
private fun RecentActivityView(
    recentActivity: List<RecentActivityEntry>
) {
    Column {
        Text(
            text = "📋 Seneste aktivitet",
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier.padding(bottom = 16.dp)
        )
        
        if (recentActivity.isEmpty()) {
            EmptyStateMessage("Ingen aktivitet endnu i dag")
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(vertical = 8.dp)
            ) {
                items(recentActivity.take(15)) { activity ->
                    RecentActivityCard(activity = activity)
                }
            }
        }
    }
}

/**
 * Card for a recent activity entry.
 */
@Composable
private fun RecentActivityCard(
    activity: RecentActivityEntry
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.1f)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Time
            Column(
                modifier = Modifier.width(80.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = Icons.Default.Schedule,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.6f),
                    modifier = Modifier.size(20.dp)
                )
                Text(
                    text = activity.time,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
            
            Spacer(modifier = Modifier.width(16.dp))
            
            // Member and practice type
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = activity.memberName,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = activity.practiceType,
                    fontSize = 16.sp,
                    color = Color(0xFF6C63FF)
                )
            }
            
            // Points badge
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF4CAF50).copy(alpha = 0.2f))
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Text(
                    text = "${activity.points} point",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF4CAF50)
                )
            }
        }
    }
}

/**
 * Statistics view showing summary stats.
 */
@Composable
private fun StatsView(
    todaySessionCount: Int,
    todayParticipantCount: Int,
    todayTotalPoints: Int,
    statsByType: List<PracticeTypeStats>
) {
    Column {
        Text(
            text = "📊 Statistik",
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier.padding(bottom = 24.dp)
        )
        
        // Stats grid
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            StatCard(
                icon = Icons.Default.SportsScore,
                value = "$todaySessionCount",
                label = "Sessioner i dag",
                color = Color(0xFF6C63FF),
                modifier = Modifier.weight(1f)
            )
            StatCard(
                icon = Icons.Default.Person,
                value = "$todayParticipantCount",
                label = "Unikke medlemmer",
                color = Color(0xFF4CAF50),
                modifier = Modifier.weight(1f)
            )
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            StatCard(
                icon = Icons.Default.EmojiEvents,
                value = "$todayTotalPoints",
                label = "Samlet point",
                color = Color(0xFFFF9800),
                modifier = Modifier.weight(1f)
            )
            StatCard(
                icon = Icons.Default.TrendingUp,
                value = statsByType.maxByOrNull { it.sessionCount }?.practiceType ?: "-",
                label = "Mest populære",
                color = Color(0xFFE91E63),
                modifier = Modifier.weight(1f)
            )
        }
        
        // Practice type breakdown
        if (statsByType.isNotEmpty()) {
            Spacer(modifier = Modifier.height(32.dp))
            
            Text(
                text = "Fordeling efter type",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                modifier = Modifier.padding(bottom = 16.dp)
            )
            
            val maxCount = statsByType.maxOfOrNull { it.sessionCount } ?: 1
            statsByType.forEach { stats ->
                PracticeTypeBar(
                    type = stats.practiceType,
                    count = stats.sessionCount,
                    maxCount = maxCount
                )
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}

/**
 * Stat card component.
 */
@Composable
private fun StatCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    value: String,
    label: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.15f)),
        shape = RoundedCornerShape(20.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(48.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = value,
                fontSize = 48.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                textAlign = TextAlign.Center
            )
            Text(
                text = label,
                fontSize = 18.sp,
                color = Color.White.copy(alpha = 0.7f),
                textAlign = TextAlign.Center
            )
        }
    }
}

/**
 * Practice type bar for breakdown chart.
 */
@Composable
private fun PracticeTypeBar(
    type: String,
    count: Int,
    maxCount: Int
) {
    val fraction = count.toFloat() / maxCount.toFloat()
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = type,
            fontSize = 18.sp,
            color = Color.White,
            modifier = Modifier.width(150.dp)
        )
        
        Box(
            modifier = Modifier
                .weight(1f)
                .height(32.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Color.White.copy(alpha = 0.1f))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction)
                    .height(32.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF6C63FF))
            )
        }
        
        Text(
            text = "$count",
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier.width(50.dp),
            textAlign = TextAlign.End
        )
    }
}

/**
 * Empty state message component.
 */
@Composable
private fun EmptyStateMessage(
    message: String
) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = message,
            fontSize = 24.sp,
            color = Color.White.copy(alpha = 0.5f),
            textAlign = TextAlign.Center
        )
    }
}
