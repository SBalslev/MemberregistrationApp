package com.club.medlems.ui.trainer.equipment

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.entity.EquipmentStatus
import com.club.medlems.data.entity.PracticeType
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * Equipment list screen for the trainer tablet.
 *
 * Features:
 * - List of equipment with status indicators (green=Available, orange=CheckedOut)
 * - Filter chips: Alle, Ledige, Aktive udlån, Udlånt
 * - "Aktive udlån" view with inline return buttons and batch return
 * - Quick checkout: tap "Udlån" directly on available items
 * - Search by serial number, description, or member name
 * - FAB to create new equipment
 * - Tap item to navigate to detail screen
 *
 * @see [design.md FR-8.1] - View Equipment Inventory
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EquipmentListScreen(
    viewModel: EquipmentManagementViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit,
    onNavigateToDetail: (equipmentId: String) -> Unit
) {
    val equipmentList by viewModel.equipmentList.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    val memberSearchResults by viewModel.memberSearchResults.collectAsState()
    val recentMembers by viewModel.recentMembers.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    var showAddDialog by remember { mutableStateOf(false) }
    var showBatchConfirm by remember { mutableStateOf(false) }

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
                title = { Text("Udstyrsstyring") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
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
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = MaterialTheme.colorScheme.primary
            ) {
                Icon(Icons.Default.Add, contentDescription = "Tilf\u00f8j udstyr")
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Search and Filter bar
            SearchAndFilterBar(
                searchQuery = uiState.searchQuery,
                onSearchQueryChanged = { viewModel.setSearchQuery(it) },
                statusFilter = uiState.statusFilter,
                onFilterChanged = { viewModel.setStatusFilter(it) }
            )

            // Batch return button when in active checkouts view
            if (uiState.statusFilter == EquipmentStatusFilter.ActiveCheckouts && equipmentList.isNotEmpty()) {
                BatchReturnBar(
                    activeCount = equipmentList.size,
                    onBatchReturn = { showBatchConfirm = true }
                )
            }

            // Equipment list
            if (equipmentList.isEmpty()) {
                EmptyEquipmentState(
                    hasFilter = uiState.statusFilter != EquipmentStatusFilter.All || uiState.searchQuery.isNotBlank(),
                    isActiveCheckoutsView = uiState.statusFilter == EquipmentStatusFilter.ActiveCheckouts
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(equipmentList, key = { it.equipment.id }) { item ->
                        if (uiState.statusFilter == EquipmentStatusFilter.ActiveCheckouts) {
                            ActiveCheckoutCard(
                                item = item,
                                onReturn = { viewModel.quickCheckin(item.equipment.id) },
                                onClick = { onNavigateToDetail(item.equipment.id) },
                                isLoading = uiState.isLoading
                            )
                        } else {
                            EquipmentItemCard(
                                item = item,
                                onClick = { onNavigateToDetail(item.equipment.id) },
                                onQuickCheckout = if (item.equipment.status == EquipmentStatus.Available) {
                                    { viewModel.startQuickCheckout(item.equipment.id) }
                                } else null,
                                onQuickReturn = if (item.equipment.status == EquipmentStatus.CheckedOut) {
                                    { viewModel.quickCheckin(item.equipment.id) }
                                } else null,
                                isLoading = uiState.isLoading
                            )
                        }
                    }
                }
            }
        }
    }

    // Add Equipment Dialog
    if (showAddDialog) {
        AddEquipmentDialog(
            onDismiss = { showAddDialog = false },
            onAdd = { serialNumber, description, discipline ->
                viewModel.createEquipment(serialNumber, description, discipline)
                showAddDialog = false
            }
        )
    }

    // Quick Checkout: member search dialog
    if (uiState.quickCheckoutEquipmentId != null) {
        MemberSearchDialog(
            searchResults = memberSearchResults,
            recentMembers = recentMembers,
            onSearch = { query -> viewModel.searchMembers(query) },
            onDismiss = {
                viewModel.cancelQuickCheckout()
                viewModel.clearMemberSearch()
            },
            onMemberSelected = { member ->
                val equipmentId = uiState.quickCheckoutEquipmentId!!
                viewModel.cancelQuickCheckout()
                viewModel.clearMemberSearch()
                viewModel.checkoutEquipment(equipmentId, member)
            }
        )
    }

    // Batch return confirmation
    if (showBatchConfirm) {
        AlertDialog(
            onDismissRequest = { showBatchConfirm = false },
            title = { Text("Returner alt udstyr") },
            text = {
                Text("Er du sikker p\u00e5 at du vil returnere alle ${equipmentList.size} aktive udl\u00e5n?")
            },
            confirmButton = {
                Button(
                    onClick = {
                        showBatchConfirm = false
                        viewModel.batchCheckinAll()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF4CAF50)
                    )
                ) {
                    Text("Returner alle")
                }
            },
            dismissButton = {
                TextButton(onClick = { showBatchConfirm = false }) {
                    Text("Annuller")
                }
            }
        )
    }
}

@Composable
private fun SearchAndFilterBar(
    searchQuery: String,
    onSearchQueryChanged: (String) -> Unit,
    statusFilter: EquipmentStatusFilter,
    onFilterChanged: (EquipmentStatusFilter) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        // Search field
        OutlinedTextField(
            value = searchQuery,
            onValueChange = onSearchQueryChanged,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("S\u00f8g serienummer, beskrivelse eller medlem...") },
            leadingIcon = {
                Icon(Icons.Default.Search, contentDescription = null)
            },
            trailingIcon = {
                if (searchQuery.isNotEmpty()) {
                    IconButton(onClick = { onSearchQueryChanged("") }) {
                        Icon(Icons.Default.Clear, contentDescription = "Ryd")
                    }
                }
            },
            singleLine = true
        )

        Spacer(modifier = Modifier.height(12.dp))

        // Filter chips
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FilterChip(
                selected = statusFilter == EquipmentStatusFilter.All,
                onClick = { onFilterChanged(EquipmentStatusFilter.All) },
                label = { Text("Alle") },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                    selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
            FilterChip(
                selected = statusFilter == EquipmentStatusFilter.Available,
                onClick = { onFilterChanged(EquipmentStatusFilter.Available) },
                label = { Text("Ledige") },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = Color(0xFF4CAF50).copy(alpha = 0.2f),
                    selectedLabelColor = Color(0xFF2E7D32)
                )
            )
            FilterChip(
                selected = statusFilter == EquipmentStatusFilter.ActiveCheckouts,
                onClick = { onFilterChanged(EquipmentStatusFilter.ActiveCheckouts) },
                label = { Text("Aktive udl\u00e5n") },
                leadingIcon = if (statusFilter == EquipmentStatusFilter.ActiveCheckouts) null else {
                    {
                        Icon(
                            Icons.Default.ShoppingCart,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = Color(0xFFFFA000).copy(alpha = 0.2f),
                    selectedLabelColor = Color(0xFFE65100)
                )
            )
            FilterChip(
                selected = statusFilter == EquipmentStatusFilter.CheckedOut,
                onClick = { onFilterChanged(EquipmentStatusFilter.CheckedOut) },
                label = { Text("Udl\u00e5nt") },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = Color(0xFFFFA000).copy(alpha = 0.2f),
                    selectedLabelColor = Color(0xFFE65100)
                )
            )
        }
    }
}

/**
 * Bar shown above the list in Active Checkouts view with a "Returner alle" button.
 */
@Composable
private fun BatchReturnBar(
    activeCount: Int,
    onBatchReturn: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFFFFA000).copy(alpha = 0.1f))
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "$activeCount aktive udl\u00e5n",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Medium,
            color = Color(0xFFE65100)
        )
        OutlinedButton(
            onClick = onBatchReturn,
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = Color(0xFF4CAF50)
            )
        ) {
            Icon(
                Icons.Default.Check,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text("Returner alle")
        }
    }
}

@Composable
private fun EmptyEquipmentState(hasFilter: Boolean, isActiveCheckoutsView: Boolean = false) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                if (isActiveCheckoutsView) Icons.Default.Check else Icons.Default.Build,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = if (isActiveCheckoutsView) Color(0xFF4CAF50) else MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = when {
                    isActiveCheckoutsView -> "Intet udstyr er udl\u00e5nt"
                    hasFilter -> "Ingen udstyr matcher filteret"
                    else -> "Intet udstyr registreret"
                },
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = when {
                    isActiveCheckoutsView -> "Alt udstyr er returneret"
                    hasFilter -> "Pr\u00f8v at \u00e6ndre filteret"
                    else -> "Tryk + for at tilf\u00f8je udstyr"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * Card for the "Aktive udlån" view - shows member prominently with a return button.
 */
@Composable
private fun ActiveCheckoutCard(
    item: EquipmentWithCheckout,
    onReturn: () -> Unit,
    onClick: () -> Unit,
    isLoading: Boolean
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left: member + equipment info
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.Person,
                    contentDescription = null,
                    modifier = Modifier.size(40.dp),
                    tint = Color(0xFFFFA000)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = item.currentMember?.let {
                            "${it.firstName} ${it.lastName}".trim()
                        } ?: "Ukendt medlem",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = item.equipment.serialNumber + (item.equipment.description?.let { " - $it" } ?: ""),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (item.currentCheckout != null) {
                        Text(
                            text = "Udl\u00e5nt: ${formatInstant(item.currentCheckout.checkedOutAtUtc)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Right: Return button
            Spacer(modifier = Modifier.width(12.dp))
            Button(
                onClick = onReturn,
                enabled = !isLoading,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF4CAF50)
                ),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text("Returner")
            }
        }
    }
}

/**
 * Standard equipment card with inline action buttons.
 */
@Composable
private fun EquipmentItemCard(
    item: EquipmentWithCheckout,
    onClick: () -> Unit,
    onQuickCheckout: (() -> Unit)?,
    onQuickReturn: (() -> Unit)?,
    isLoading: Boolean
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.equipment.serialNumber,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                if (item.equipment.description != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = item.equipment.description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                if (item.equipment.discipline != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = getDisciplineDisplayName(item.equipment.discipline),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StatusBadge(status = item.equipment.status)

                    // Show who has it checked out
                    if (item.equipment.status == EquipmentStatus.CheckedOut && item.currentMember != null) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Person,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "${item.currentMember.firstName} ${item.currentMember.lastName}".trim(),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            }

            // Inline action buttons
            Spacer(modifier = Modifier.width(8.dp))
            when {
                onQuickCheckout != null -> {
                    OutlinedButton(
                        onClick = onQuickCheckout,
                        enabled = !isLoading,
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Icon(
                            Icons.Default.Person,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Udl\u00e5n", style = MaterialTheme.typography.labelMedium)
                    }
                }
                onQuickReturn != null -> {
                    Button(
                        onClick = onQuickReturn,
                        enabled = !isLoading,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF4CAF50)
                        ),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Returner", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusBadge(status: EquipmentStatus) {
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
            .background(backgroundColor, RoundedCornerShape(4.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = textColor,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun AddEquipmentDialog(
    onDismiss: () -> Unit,
    onAdd: (serialNumber: String, description: String?, discipline: PracticeType?) -> Unit
) {
    var serialNumber by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var selectedDiscipline by remember { mutableStateOf<PracticeType?>(null) }
    var showDisciplineDropdown by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Tilf\u00f8j udstyr") },
        text = {
            Column {
                OutlinedTextField(
                    value = serialNumber,
                    onValueChange = { serialNumber = it },
                    label = { Text("Serienummer *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it.take(200) },
                    label = { Text("Beskrivelse (valgfri)") },
                    maxLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                    supportingText = { Text("${description.length}/200") }
                )
                Spacer(modifier = Modifier.height(16.dp))

                // Discipline dropdown
                Box {
                    OutlinedTextField(
                        value = selectedDiscipline?.let { getDisciplineDisplayName(it) } ?: "",
                        onValueChange = { },
                        label = { Text("Disciplin (valgfri)") },
                        readOnly = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showDisciplineDropdown = true },
                        trailingIcon = {
                            if (selectedDiscipline != null) {
                                IconButton(onClick = { selectedDiscipline = null }) {
                                    Icon(Icons.Default.Clear, contentDescription = "Ryd")
                                }
                            }
                        }
                    )
                    DropdownMenu(
                        expanded = showDisciplineDropdown,
                        onDismissRequest = { showDisciplineDropdown = false }
                    ) {
                        PracticeType.entries.forEach { discipline ->
                            DropdownMenuItem(
                                text = { Text(getDisciplineDisplayName(discipline)) },
                                onClick = {
                                    selectedDiscipline = discipline
                                    showDisciplineDropdown = false
                                }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onAdd(
                        serialNumber.trim(),
                        description.trim().ifEmpty { null },
                        selectedDiscipline
                    )
                },
                enabled = serialNumber.isNotBlank()
            ) {
                Text("Tilf\u00f8j")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Annuller")
            }
        }
    )
}

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
