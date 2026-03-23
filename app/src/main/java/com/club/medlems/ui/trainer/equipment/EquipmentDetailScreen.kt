package com.club.medlems.ui.trainer.equipment

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.entity.EquipmentCheckout
import com.club.medlems.data.entity.EquipmentItem
import com.club.medlems.data.entity.EquipmentStatus
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.PracticeType
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * Equipment detail screen showing item info, current status, and transaction history.
 *
 * Features:
 * - Equipment info: serial number, type, description, discipline
 * - Current status with checkout info if applicable
 * - If Available: "Udlan" button opens member search dialog
 * - If CheckedOut: "Returner" button, shows who has it
 * - Transaction history list (recent checkouts/returns)
 *
 * @see [design.md FR-8.2] - Equipment Detail View
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EquipmentDetailScreen(
    equipmentId: String,
    viewModel: EquipmentManagementViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val memberSearchResults by viewModel.memberSearchResults.collectAsState()
    val recentMembers by viewModel.recentMembers.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    var showMemberSearchDialog by remember { mutableStateOf(false) }

    // Load equipment details on first composition
    LaunchedEffect(equipmentId) {
        viewModel.selectEquipment(equipmentId)
    }

    // Clear selection when leaving
    LaunchedEffect(Unit) {
        // This will be called when the composable is disposed
    }

    // Show snackbar for success/error messages
    LaunchedEffect(uiState.successMessage, uiState.error) {
        uiState.successMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearSuccessMessage()
        }
        uiState.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearError()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Udstyrsdetaljer") },
                navigationIcon = {
                    IconButton(onClick = {
                        viewModel.clearSelection()
                        onNavigateBack()
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Tilbage")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        if (uiState.isLoading && uiState.selectedEquipment == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else if (uiState.selectedEquipment == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Default.Build,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.error
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        "Udstyr ikke fundet",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        } else {
            EquipmentDetailContent(
                modifier = Modifier.padding(padding),
                equipment = uiState.selectedEquipment!!,
                currentCheckout = uiState.selectedEquipmentCheckout,
                currentMember = uiState.selectedEquipmentMember,
                checkoutHistory = uiState.checkoutHistory,
                isLoading = uiState.isLoading,
                onCheckoutClick = { showMemberSearchDialog = true },
                onCheckinClick = {
                    uiState.selectedEquipmentCheckout?.let { checkout ->
                        viewModel.checkinEquipment(checkout.id)
                    }
                }
            )
        }
    }

    // Member search dialog for checkout
    if (showMemberSearchDialog) {
        MemberSearchDialog(
            searchResults = memberSearchResults,
            recentMembers = recentMembers,
            onSearch = { query -> viewModel.searchMembers(query) },
            onDismiss = {
                showMemberSearchDialog = false
                viewModel.clearMemberSearch()
            },
            onMemberSelected = { member ->
                showMemberSearchDialog = false
                viewModel.clearMemberSearch()
                uiState.selectedEquipment?.let { equipment ->
                    viewModel.checkoutEquipment(equipment.id, member)
                }
            }
        )
    }
}

@Composable
private fun EquipmentDetailContent(
    modifier: Modifier = Modifier,
    equipment: EquipmentItem,
    currentCheckout: EquipmentCheckout?,
    currentMember: Member?,
    checkoutHistory: List<CheckoutHistoryItem>,
    isLoading: Boolean,
    onCheckoutClick: () -> Unit,
    onCheckinClick: () -> Unit
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Equipment info card
        item {
            EquipmentInfoCard(equipment = equipment)
        }

        // Current status card
        item {
            CurrentStatusCard(
                equipment = equipment,
                currentCheckout = currentCheckout,
                currentMember = currentMember,
                isLoading = isLoading,
                onCheckoutClick = onCheckoutClick,
                onCheckinClick = onCheckinClick
            )
        }

        // Transaction history header
        item {
            Text(
                "Transaktionshistorik",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        }

        // Transaction history list
        if (checkoutHistory.isEmpty()) {
            item {
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
                            "Ingen transaktioner endnu",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        } else {
            items(checkoutHistory, key = { it.checkout.id }) { historyItem ->
                TransactionHistoryCard(historyItem = historyItem)
            }
        }
    }
}

@Composable
private fun EquipmentInfoCard(equipment: EquipmentItem) {
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
                    Icons.Default.Build,
                    contentDescription = null,
                    modifier = Modifier.size(48.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.width(16.dp))
                Column {
                    Text(
                        text = equipment.serialNumber,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Serienummer",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (equipment.description != null) {
                Spacer(modifier = Modifier.height(16.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Beskrivelse",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = equipment.description,
                    style = MaterialTheme.typography.bodyLarge
                )
            }

            if (equipment.discipline != null) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Disciplin",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = getDisciplineDisplayName(equipment.discipline),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Type",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = getEquipmentTypeDisplayName(equipment.type.name),
                style = MaterialTheme.typography.bodyLarge
            )
        }
    }
}

@Composable
private fun CurrentStatusCard(
    equipment: EquipmentItem,
    currentCheckout: EquipmentCheckout?,
    currentMember: Member?,
    isLoading: Boolean,
    onCheckoutClick: () -> Unit,
    onCheckinClick: () -> Unit
) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            Text(
                text = "Aktuel status",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(12.dp))

            StatusBadgeLarge(status = equipment.status)

            if (equipment.status == EquipmentStatus.CheckedOut && currentCheckout != null) {
                Spacer(modifier = Modifier.height(16.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(16.dp))

                // Show who has it
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Person,
                        contentDescription = null,
                        modifier = Modifier.size(40.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = if (currentMember != null) {
                                "${currentMember.firstName} ${currentMember.lastName}".trim()
                            } else {
                                "Ukendt medlem"
                            },
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = "Medlemsnr: ${currentMember?.membershipId ?: currentCheckout.internalMemberId.take(8)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = "Udl\u00e5nt: ${formatInstant(currentCheckout.checkedOutAtUtc)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                if (currentCheckout.checkoutNotes != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Note: ${currentCheckout.checkoutNotes}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Action button based on status
            when (equipment.status) {
                EquipmentStatus.Available -> {
                    Button(
                        onClick = onCheckoutClick,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        enabled = !isLoading
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                color = MaterialTheme.colorScheme.onPrimary
                            )
                        } else {
                            Icon(
                                Icons.Default.Person,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Udl\u00e5n")
                        }
                    }
                }
                EquipmentStatus.CheckedOut -> {
                    Button(
                        onClick = onCheckinClick,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        enabled = !isLoading,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF4CAF50)
                        )
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                color = Color.White
                            )
                        } else {
                            Icon(
                                Icons.Default.Check,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Returner")
                        }
                    }
                }
                else -> {
                    OutlinedButton(
                        onClick = { },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        enabled = false
                    ) {
                        Text("Ikke tilg\u00e6ngelig")
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusBadgeLarge(status: EquipmentStatus) {
    val (backgroundColor, textColor, label) = when (status) {
        EquipmentStatus.Available -> Triple(
            Color(0xFF4CAF50),
            Color.White,
            "Ledig"
        )
        EquipmentStatus.CheckedOut -> Triple(
            Color(0xFFFFA000),
            Color.White,
            "Udl\u00e5nt"
        )
        EquipmentStatus.Maintenance -> Triple(
            Color(0xFFFF9800),
            Color.White,
            "Vedligeholdelse"
        )
        EquipmentStatus.Retired -> Triple(
            Color(0xFF9E9E9E),
            Color.White,
            "Udg\u00e5et"
        )
    }

    Box(
        modifier = Modifier
            .background(backgroundColor, RoundedCornerShape(8.dp))
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            color = textColor,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun TransactionHistoryCard(historyItem: CheckoutHistoryItem) {
    val checkout = historyItem.checkout
    val member = historyItem.member
    val isReturned = checkout.checkedInAtUtc != null

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (isReturned) {
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
            } else {
                MaterialTheme.colorScheme.surface
            }
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Member info
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        Icons.Default.Person,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            text = if (member != null) {
                                "${member.firstName} ${member.lastName}".trim()
                            } else {
                                "Ukendt medlem"
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = member?.membershipId ?: checkout.internalMemberId.take(8),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                // Status
                Box(
                    modifier = Modifier
                        .background(
                            if (isReturned) Color(0xFF4CAF50) else Color(0xFFFFA000),
                            RoundedCornerShape(4.dp)
                        )
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = if (isReturned) "Returneret" else "Aktiv",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Checkout date
            Text(
                text = "Udl\u00e5nt: ${formatInstant(checkout.checkedOutAtUtc)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            // Return date if returned
            if (checkout.checkedInAtUtc != null) {
                Text(
                    text = "Returneret: ${formatInstant(checkout.checkedInAtUtc)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Notes
            if (checkout.checkoutNotes != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Udl\u00e5nsnote: ${checkout.checkoutNotes}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (checkout.checkinNotes != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Returnote: ${checkout.checkinNotes}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/**
 * Formats an Instant to a human-readable Danish date/time string.
 */
private fun formatInstant(instant: Instant): String {
    val localDateTime = instant.toLocalDateTime(TimeZone.currentSystemDefault())
    return "${localDateTime.dayOfMonth}/${localDateTime.monthNumber}/${localDateTime.year} " +
        "${localDateTime.hour.toString().padStart(2, '0')}:${localDateTime.minute.toString().padStart(2, '0')}"
}

/**
 * Gets the Danish display name for a practice type/discipline.
 */
private fun getDisciplineDisplayName(discipline: PracticeType): String {
    return when (discipline) {
        PracticeType.Riffel -> "Riffel"
        PracticeType.Pistol -> "Pistol"
        PracticeType.LuftRiffel -> "Luftriffel"
        PracticeType.LuftPistol -> "Luftpistol"
        PracticeType.Andet -> "Andet"
    }
}

/**
 * Gets the Danish display name for equipment type.
 */
private fun getEquipmentTypeDisplayName(type: String): String {
    return when (type) {
        "TrainingMaterial" -> "Tr\u00e6ningsmateriale"
        else -> type
    }
}
