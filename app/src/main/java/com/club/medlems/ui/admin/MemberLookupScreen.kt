package com.club.medlems.ui.admin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberStatus
import kotlinx.datetime.LocalDate

/**
 * Member lookup screen for admin tablet.
 * 
 * Allows attendants to:
 * - Search for members by name or ID
 * - View member details
 * - Perform assisted check-ins
 * - Navigate to practice session entry
 * 
 * @see [design.md FR-10] - Admin Tablet Member Lookup
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemberLookupScreen(
    onNavigateBack: () -> Unit,
    onNavigateToPracticeSession: (memberId: String, scanEventId: String) -> Unit,
    onNavigateToEquipmentCheckout: (memberId: String) -> Unit = {},
    viewModel: MemberLookupViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    
    // Handle check-in result
    LaunchedEffect(state.checkInResult) {
        when (val result = state.checkInResult) {
            is AssistedCheckInResult.Success -> {
                snackbarHostState.showSnackbar(
                    message = "${result.memberName} er nu tjekket ind",
                    duration = SnackbarDuration.Short
                )
            }
            is AssistedCheckInResult.Error -> {
                snackbarHostState.showSnackbar(
                    message = result.message,
                    duration = SnackbarDuration.Long
                )
            }
            null -> { /* No result yet */ }
        }
        if (state.checkInResult != null) {
            viewModel.clearCheckInResult()
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Medlemssøgning") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Tilbage")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Left panel: Search and results
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(16.dp)
            ) {
                // Search field
                OutlinedTextField(
                    value = state.searchQuery,
                    onValueChange = { viewModel.onSearchQueryChanged(it) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Søg efter navn eller medlemsnummer...") },
                    leadingIcon = {
                        Icon(Icons.Default.Search, contentDescription = null)
                    },
                    singleLine = true
                )
                
                Spacer(modifier = Modifier.height(16.dp))
                
                // Search results
                if (state.isSearching) {
                    Box(
                        modifier = Modifier.fillMaxWidth(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                } else if (state.searchQuery.length < 2) {
                    // Prompt to search
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                Icons.Default.PersonSearch,
                                contentDescription = null,
                                modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.outline
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                "Indtast mindst 2 tegn for at søge",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.outline
                            )
                        }
                    }
                } else if (state.searchResults.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "Ingen medlemmer fundet",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(state.searchResults) { member ->
                            MemberSearchResultCard(
                                member = member,
                                isSelected = state.selectedMember?.membershipId == member.membershipId,
                                onClick = { viewModel.selectMember(member) }
                            )
                        }
                    }
                }
            }
            
            // Divider
            VerticalDivider()
            
            // Right panel: Member details
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(16.dp)
            ) {
                if (state.selectedMember != null) {
                    MemberDetailPanel(
                        member = state.selectedMember!!,
                        todayCheckedIn = state.todayCheckedIn,
                        lastCheckInDate = state.lastCheckInDate,
                        recentSessions = state.recentSessions,
                        checkInInProgress = state.checkInInProgress,
                        checkInResult = state.checkInResult,
                        onCheckIn = { viewModel.performAssistedCheckIn() },
                        onAddSession = { scanEventId ->
                            onNavigateToPracticeSession(
                                state.selectedMember!!.membershipId,
                                scanEventId
                            )
                        },
                        onEquipmentCheckout = {
                            onNavigateToEquipmentCheckout(state.selectedMember!!.membershipId)
                        }
                    )
                } else {
                    // No member selected
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                Icons.Default.Person,
                                contentDescription = null,
                                modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.outline
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                "Vælg et medlem for at se detaljer",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.outline
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MemberSearchResultCard(
    member: Member,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val containerColor = if (isSelected) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.surface
    }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = containerColor)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Person,
                contentDescription = null,
                modifier = Modifier.size(40.dp),
                tint = if (member.status == MemberStatus.ACTIVE) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.outline
                }
            )
            
            Spacer(modifier = Modifier.width(16.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${member.firstName} ${member.lastName}".trim().ifEmpty { "Ukendt" },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "Nr: ${member.membershipId}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            if (member.status != MemberStatus.ACTIVE) {
                AssistChip(
                    onClick = {},
                    label = { Text(member.status.name) },
                    colors = AssistChipDefaults.assistChipColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    )
                )
            }
        }
    }
}

@Composable
private fun MemberDetailPanel(
    member: Member,
    todayCheckedIn: Boolean,
    lastCheckInDate: LocalDate?,
    recentSessions: List<RecentSessionInfo>,
    checkInInProgress: Boolean,
    checkInResult: AssistedCheckInResult?,
    onCheckIn: () -> Unit,
    onAddSession: (scanEventId: String) -> Unit,
    onEquipmentCheckout: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize()
    ) {
        // Member header
        ElevatedCard(
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Person,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Column {
                        Text(
                            text = "${member.firstName} ${member.lastName}".trim().ifEmpty { "Ukendt" },
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Medlemsnummer: ${member.membershipId}",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(16.dp))
                
                // Status row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text(
                            "Status",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            when (member.status) {
                                MemberStatus.ACTIVE -> "Aktiv"
                                MemberStatus.INACTIVE -> "Inaktiv"
                            },
                            style = MaterialTheme.typography.bodyLarge,
                            color = if (member.status == MemberStatus.ACTIVE) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.error
                            }
                        )
                    }
                    
                    Column {
                        Text(
                            "Tjekket ind i dag",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (todayCheckedIn) {
                                Icon(
                                    Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    "Ja",
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            } else {
                                Text(
                                    "Nej",
                                    style = MaterialTheme.typography.bodyLarge
                                )
                            }
                        }
                    }
                    
                    Column {
                        Text(
                            "Sidste check-in",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            lastCheckInDate?.toString() ?: "Aldrig",
                            style = MaterialTheme.typography.bodyLarge
                        )
                    }
                }
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Action buttons - Row 1: Check-in and Session
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Button(
                onClick = onCheckIn,
                modifier = Modifier
                    .weight(1f)
                    .height(56.dp),
                enabled = !checkInInProgress && member.status == MemberStatus.ACTIVE
            ) {
                if (checkInInProgress) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Text(if (todayCheckedIn) "Check ind igen" else "Check ind")
                }
            }
            
            // Add session button - only enabled after check-in
            val lastSuccessResult = checkInResult as? AssistedCheckInResult.Success
            OutlinedButton(
                onClick = { lastSuccessResult?.let { onAddSession(it.scanEventId) } },
                modifier = Modifier
                    .weight(1f)
                    .height(56.dp),
                enabled = lastSuccessResult != null || todayCheckedIn
            ) {
                Text("Tilføj skydning")
            }
        }
        
        Spacer(modifier = Modifier.height(12.dp))
        
        // Action buttons - Row 2: Equipment checkout
        OutlinedButton(
            onClick = onEquipmentCheckout,
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            enabled = member.status == MemberStatus.ACTIVE
        ) {
            Icon(
                Icons.Default.Build,
                contentDescription = null,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Udlån udstyr")
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Recent sessions
        Text(
            "Seneste skydninger (30 dage)",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Medium
        )
        
        Spacer(modifier = Modifier.height(12.dp))
        
        if (recentSessions.isEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "Ingen skydninger i de seneste 30 dage",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(recentSessions) { session ->
                    Card(
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    session.date.toString(),
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium
                                )
                                Text(
                                    session.practiceType,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        "${session.points}",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        "point",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        "${session.krydser}",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        "krydser",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
