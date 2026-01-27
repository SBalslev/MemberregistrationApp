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
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
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

/**
 * Equipment list screen for the trainer tablet.
 *
 * Features:
 * - List of equipment with status indicators (green=Available, orange=CheckedOut)
 * - Filter chips: Alle, Ledige, Udlant
 * - Search by serial number or description
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
    val snackbarHostState = remember { SnackbarHostState() }

    var showAddDialog by remember { mutableStateOf(false) }

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

            // Equipment list
            if (equipmentList.isEmpty()) {
                EmptyEquipmentState(
                    hasFilter = uiState.statusFilter != EquipmentStatusFilter.All || uiState.searchQuery.isNotBlank()
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(equipmentList, key = { it.equipment.id }) { item ->
                        EquipmentItemCard(
                            item = item,
                            onClick = { onNavigateToDetail(item.equipment.id) }
                        )
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
            placeholder = { Text("S\u00f8g serienummer eller beskrivelse...") },
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

@Composable
private fun EmptyEquipmentState(hasFilter: Boolean) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Default.Build,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = if (hasFilter) "Ingen udstyr matcher filteret" else "Intet udstyr registreret",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = if (hasFilter) "Pr\u00f8v at \u00e6ndre filteret" else "Tryk + for at tilf\u00f8je udstyr",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun EquipmentItemCard(
    item: EquipmentWithCheckout,
    onClick: () -> Unit
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
