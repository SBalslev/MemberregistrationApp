package com.club.medlems.ui.trainer.dashboard

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
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
 * Trainer Dashboard screen for viewing today's check-ins and practice sessions.
 *
 * Features:
 * - Top bar with trainer name and logout button
 * - Stats cards showing total check-ins and sessions for today
 * - Search bar for filtering by member name
 * - Two-column layout showing check-ins and practice sessions
 * - Pull-to-refresh functionality
 * - Session expiry warning with extension option
 *
 * @param onLogout Callback when trainer logs out
 * @param viewModel The ViewModel providing dashboard data
 *
 * @see [trainer-experience/prd.md] Phase 3 - Dashboard Today's View
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrainerDashboardScreen(
    onLogout: () -> Unit,
    viewModel: TrainerDashboardViewModel = hiltViewModel()
) {
    val state by viewModel.combinedState.collectAsState()

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
                title = { Text("Tr\u00e6ner Dashboard") },
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
                            Icons.Default.ExitToApp,
                            contentDescription = "Log ud"
                        )
                    }
                }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                // Stats cards row
                StatsCardsRow(stats = state.stats)

                Spacer(modifier = Modifier.height(16.dp))

                // Search bar
                OutlinedTextField(
                    value = state.searchQuery,
                    onValueChange = { viewModel.onSearchQueryChanged(it) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("S\u00f8g medlem...") },
                    leadingIcon = {
                        Icon(Icons.Default.Search, contentDescription = null)
                    },
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Last updated info
                if (state.lastUpdated.isNotEmpty()) {
                    Text(
                        text = "Sidst opdateret: ${state.lastUpdated}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                }

                // Loading indicator
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
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Check-ins column
                        CheckInsColumn(
                            checkIns = state.filteredCheckIns,
                            modifier = Modifier.weight(1f)
                        )

                        // Vertical divider
                        VerticalDivider()

                        // Sessions column
                        SessionsColumn(
                            sessions = state.filteredSessions,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatsCardsRow(stats: DashboardStats) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Check-ins stat card
        StatCard(
            title = "Check-ins",
            value = stats.totalCheckIns.toString(),
            modifier = Modifier.weight(1f)
        )

        // Sessions stat card
        StatCard(
            title = "Sessioner",
            value = stats.totalSessions.toString(),
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun StatCard(
    title: String,
    value: String,
    modifier: Modifier = Modifier
) {
    ElevatedCard(
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.headlineLarge,
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
            text = "Check-ins i dag",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        HorizontalDivider(modifier = Modifier.padding(bottom = 8.dp))

        if (checkIns.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Ingen check-ins endnu",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
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
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.CheckCircle,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.memberName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "Nr: ${item.memberId}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Text(
                text = timeStr,
                style = MaterialTheme.typography.bodyMedium,
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
            text = "Sessioner i dag",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        HorizontalDivider(modifier = Modifier.padding(bottom = 8.dp))

        if (sessions.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Ingen sessioner endnu",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
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
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.memberName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Discipline chip
                    AssistChip(
                        onClick = { },
                        label = {
                            Text(
                                item.session.practiceType.displayName,
                                style = MaterialTheme.typography.labelSmall
                            )
                        },
                        modifier = Modifier.height(24.dp)
                    )

                    // Classification if present
                    item.session.classification?.let { classification ->
                        Text(
                            text = classification,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = timeStr,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                if (item.session.points > 0) {
                    Text(
                        text = "${item.session.points} pt",
                        style = MaterialTheme.typography.bodyMedium,
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
        title = { Text("Session udl\u00f8ber") },
        text = {
            Text("Din session udl\u00f8ber om $remainingSeconds sekunder.\nVil du forl\u00e6nge sessionen?")
        },
        confirmButton = {
            Button(onClick = onExtend) {
                Text("Forl\u00e6ng session")
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onLogout) {
                Text("Log ud")
            }
        }
    )
}
