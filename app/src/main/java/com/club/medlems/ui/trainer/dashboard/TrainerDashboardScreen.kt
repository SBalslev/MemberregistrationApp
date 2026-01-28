package com.club.medlems.ui.trainer.dashboard

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.ui.common.displayName
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * Trainer Dashboard screen - equipment-first design.
 *
 * Primary function: Equipment checkout/checkin
 * Secondary function: Monitor today's check-ins and practice sessions
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrainerDashboardScreen(
    onLogout: () -> Unit,
    onNavigateToEquipment: () -> Unit,
    onNavigateToCheckouts: () -> Unit,
    onNavigateToAdmin: () -> Unit,
    onNavigateToTrialMemberDetail: (String) -> Unit = {},
    viewModel: TrainerDashboardViewModel = hiltViewModel()
) {
    val state by viewModel.combinedState.collectAsState()

    // Assisted check-in dialog state
    var showAssistedCheckInDialog by remember { mutableStateOf(false) }

    // Assisted check-in dialog
    if (showAssistedCheckInDialog) {
        AssistedCheckInDialog(
            onDismiss = { showAssistedCheckInDialog = false },
            onCheckInComplete = {
                showAssistedCheckInDialog = false
                viewModel.refresh()
            }
        )
    }

    // Session expiry warning dialog
    if (state.sessionExpiring) {
        SessionExpiryDialog(
            remainingSeconds = state.sessionRemainingSeconds,
            onExtend = { viewModel.extendSession() },
            onLogout = {
                viewModel.logout()
                onLogout()
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Træner") },
                actions = {
                    // Trainer name chip
                    if (state.trainerName.isNotEmpty()) {
                        AssistChip(
                            onClick = { },
                            label = { Text(state.trainerName) },
                            leadingIcon = {
                                Icon(
                                    Icons.Default.Person,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                            },
                            modifier = Modifier.padding(end = 8.dp)
                        )
                    }

                    // Logout button
                    IconButton(onClick = {
                        viewModel.logout()
                        onLogout()
                    }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ExitToApp,
                            contentDescription = "Log ud"
                        )
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            // ═══════════════════════════════════════════════════════════
            // PRIMARY: Equipment Section (Large, prominent buttons)
            // ═══════════════════════════════════════════════════════════
            Text(
                text = "UDSTYR",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(bottom = 12.dp)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Large "Udlån" button (Current checkouts - most used)
                LargeEquipmentButton(
                    title = "Aktive udlån",
                    subtitle = "Se og returner",
                    icon = Icons.Default.Inventory2,
                    onClick = onNavigateToCheckouts,
                    modifier = Modifier.weight(1f)
                )

                // Large "Udstyr" button (Equipment list)
                LargeEquipmentButton(
                    title = "Alt udstyr",
                    subtitle = "Oversigt og udlån",
                    icon = Icons.Default.Build,
                    onClick = onNavigateToEquipment,
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // ═══════════════════════════════════════════════════════════
            // TRIAL MEMBERS: Recent trial registrations (last 7 days)
            // ═══════════════════════════════════════════════════════════
            if (state.trialMembers.isNotEmpty()) {
                TrialMembersSection(
                    trialMembers = state.trialMembers,
                    onMemberClick = { member ->
                        onNavigateToTrialMemberDetail(member.member.internalId)
                    }
                )
                Spacer(modifier = Modifier.height(24.dp))
            }

            // ═══════════════════════════════════════════════════════════
            // SECONDARY: Today's Overview (Smaller, below equipment)
            // ═══════════════════════════════════════════════════════════
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "DAGENS OVERBLIK",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    // Assisted check-in button
                    FilledTonalButton(
                        onClick = { showAssistedCheckInDialog = true },
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                    ) {
                        Icon(
                            Icons.Default.PersonSearch,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Check-in", style = MaterialTheme.typography.labelMedium)
                    }

                    // Admin button (smaller, secondary)
                    TextButton(onClick = onNavigateToAdmin) {
                        Icon(
                            Icons.Default.Settings,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Admin")
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Stats cards (smaller)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                SmallStatCard(
                    title = "Fremmødte",
                    value = state.stats.totalCheckIns.toString(),
                    modifier = Modifier.weight(1f)
                )
                SmallStatCard(
                    title = "Skydninger",
                    value = state.stats.totalSessions.toString(),
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Search bar
            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = { viewModel.onSearchQueryChanged(it) },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Søg medlem...") },
                leadingIcon = {
                    Icon(Icons.Default.Search, contentDescription = null)
                },
                singleLine = true
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Last updated info
            if (state.lastUpdated.isNotEmpty()) {
                Text(
                    text = "Opdateret: ${state.lastUpdated}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Loading indicator or content
            if (state.isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else {
                // Two-column layout for check-ins and sessions
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    CheckInsColumn(
                        checkIns = state.filteredCheckIns,
                        modifier = Modifier.weight(1f)
                    )

                    VerticalDivider()

                    SessionsColumn(
                        sessions = state.filteredSessions,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

@Composable
private fun LargeEquipmentButton(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ElevatedCard(
        onClick = onClick,
        modifier = modifier.height(100.dp),
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(32.dp),
                tint = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
            )
        }
    }
}

@Composable
private fun SmallStatCard(
    title: String,
    value: String,
    modifier: Modifier = Modifier
) {
    OutlinedCard(modifier = modifier) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@Composable
private fun CheckInsColumn(
    checkIns: List<CheckInWithMember>,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        Text(
            text = "Fremmødte i dag",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        if (checkIns.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Ingen endnu",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                items(checkIns, key = { it.checkIn.id }) { item ->
                    CheckInListItem(item)
                }
            }
        }
    }
}

@Composable
private fun CheckInListItem(item: CheckInWithMember) {
    val time = item.checkIn.createdAtUtc
        .toLocalDateTime(TimeZone.currentSystemDefault())
    val timeStr = String.format("%02d:%02d", time.hour, time.minute)

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.CheckCircle,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(16.dp)
            )

            Spacer(modifier = Modifier.width(8.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.memberName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = item.memberId,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Text(
                text = timeStr,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun SessionsColumn(
    sessions: List<PracticeSessionWithMember>,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        Text(
            text = "Skydninger i dag",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        if (sessions.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Ingen endnu",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                items(sessions, key = { it.session.id }) { item ->
                    SessionListItem(item)
                }
            }
        }
    }
}

@Composable
private fun SessionListItem(item: PracticeSessionWithMember) {
    val time = item.session.createdAtUtc
        .toLocalDateTime(TimeZone.currentSystemDefault())
    val timeStr = String.format("%02d:%02d", time.hour, time.minute)

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.memberName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = item.session.practiceType.displayName,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = timeStr,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (item.session.points > 0) {
                    Text(
                        text = "${item.session.points} pt",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}

@Composable
private fun SessionExpiryDialog(
    remainingSeconds: Int,
    onExtend: () -> Unit,
    onLogout: () -> Unit
) {
    AlertDialog(
        onDismissRequest = { /* Cannot dismiss manually */ },
        title = { Text("Session udløber") },
        text = {
            Text("Din session udløber om $remainingSeconds sekunder.\nVil du forlænge sessionen?")
        },
        confirmButton = {
            Button(onClick = onExtend) {
                Text("Forlæng")
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onLogout) {
                Text("Log ud")
            }
        }
    )
}

// ═══════════════════════════════════════════════════════════
// Trial Members Section
// ═══════════════════════════════════════════════════════════

@Composable
private fun TrialMembersSection(
    trialMembers: List<TrialMemberListItem>,
    onMemberClick: (TrialMemberListItem) -> Unit
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.PersonAdd,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.tertiary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "NYE PRØVEMEDLEMMER",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.tertiary
                )
            }
            AssistChip(
                onClick = { },
                label = { Text("${trialMembers.size}") }
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Horizontal scrolling list of trial members
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            trialMembers.take(4).forEach { member ->
                TrialMemberCard(
                    member = member,
                    onClick = { onMemberClick(member) },
                    modifier = Modifier.weight(1f)
                )
            }
            // Fill remaining space if less than 4 members
            repeat(maxOf(0, 4 - trialMembers.size)) {
                Spacer(modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun TrialMemberCard(
    member: TrialMemberListItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedCard(
        onClick = onClick,
        modifier = modifier.height(100.dp),
        colors = CardDefaults.outlinedCardColors(
            containerColor = if (member.isAdult && !member.hasIdPhoto) {
                MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f)
            } else {
                MaterialTheme.colorScheme.surface
            }
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Name and date
            Column {
                Text(
                    text = member.displayName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = member.registrationDate,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Status icons row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Age badge
                if (member.age != null) {
                    AssistChip(
                        onClick = { },
                        label = {
                            Text(
                                text = "${member.age} år",
                                style = MaterialTheme.typography.labelSmall
                            )
                        },
                        modifier = Modifier.height(24.dp)
                    )
                }

                // Photo status icons
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    // Profile photo indicator
                    Icon(
                        imageVector = Icons.Default.Photo,
                        contentDescription = if (member.hasProfilePhoto) "Har billede" else "Mangler billede",
                        modifier = Modifier.size(16.dp),
                        tint = if (member.hasProfilePhoto) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                        }
                    )

                    // ID photo indicator (only for adults)
                    if (member.isAdult) {
                        Icon(
                            imageVector = Icons.Default.CreditCard,
                            contentDescription = if (member.hasIdPhoto) "Har ID-billede" else "Mangler ID-billede",
                            modifier = Modifier.size(16.dp),
                            tint = if (member.hasIdPhoto) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.error
                            }
                        )
                    }
                }
            }
        }
    }
}
