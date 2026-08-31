package com.club.medlems.ui.equipment

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.entity.EquipmentItem
import com.club.medlems.data.entity.EquipmentStatus
import com.club.medlems.data.entity.EquipmentType

/**
 * Screen displaying all equipment items with management options.
 * 
 * Features:
 * - View all equipment with status indicators
 * - Add new equipment
 * - Set maintenance/retire equipment
 * 
 * @see [design.md FR-5.1] - View Equipment Inventory
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EquipmentListScreen(
    viewModel: EquipmentViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit,
    onNavigateToCheckout: (String) -> Unit
) {
    val equipment by viewModel.allEquipment.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    
    var showAddDialog by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var statusFilter by remember { mutableStateOf<EquipmentStatus?>(null) }
    
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
    
    var equipmentBeingEdited by remember { mutableStateOf<EquipmentItem?>(null) }
    val filteredEquipment = equipment.filter { item ->
        val query = searchQuery.trim()
        val matchesSearch = query.isEmpty() ||
            item.serialNumber.contains(query, ignoreCase = true) ||
            item.description?.contains(query, ignoreCase = true) == true ||
            getEquipmentTypeDisplayName(item.type).contains(query, ignoreCase = true)
        val matchesStatus = statusFilter == null || item.status == statusFilter
        matchesSearch && matchesStatus
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Udstyr") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Tilbage")
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
        if (equipment.isEmpty()) {
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
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        "Intet udstyr registreret",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Tryk p\u00e5 + for at tilf\u00f8je udstyr",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    label = { Text("Søg efter serienummer, type eller beskrivelse") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    EquipmentStatusFilterChip(
                        selected = statusFilter == null,
                        label = "Alle (${equipment.size})",
                        onClick = { statusFilter = null }
                    )
                    EquipmentStatus.entries.forEach { status ->
                        val count = equipment.count { it.status == status }
                        EquipmentStatusFilterChip(
                            selected = statusFilter == status,
                            label = "${getEquipmentStatusDisplayName(status)} ($count)",
                            onClick = { statusFilter = status }
                        )
                    }
                }

                Text(
                    text = if (filteredEquipment.size == equipment.size) {
                        "${equipment.size} styk udstyr"
                    } else {
                        "Viser ${filteredEquipment.size} af ${equipment.size}"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                )

                if (filteredEquipment.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "Intet udstyr matcher søgningen",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 88.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(filteredEquipment, key = { it.id }) { item ->
                            EquipmentItemCard(
                                item = item,
                                onCheckout = { onNavigateToCheckout(item.id) },
                                onEdit = { equipmentBeingEdited = item },
                                onSetMaintenance = { viewModel.setMaintenance(item.id) },
                                onSetAvailable = { viewModel.setAvailable(item.id) },
                                onRetire = { viewModel.retireEquipment(item.id) }
                            )
                        }
                    }
                }
            }
        }
    }
    
    // Add Equipment Dialog
    if (showAddDialog) {
        EquipmentFormDialog(
            title = "Tilf\u00f8j udstyr",
            confirmLabel = "Tilf\u00f8j",
            initialSerialNumber = "",
            initialType = null,
            initialDescription = "",
            onDismiss = { showAddDialog = false },
            onConfirm = { serialNumber, type, description ->
                viewModel.createEquipment(serialNumber, type, description)
                showAddDialog = false
            }
        )
    }
    
    // Edit Equipment Dialog
    equipmentBeingEdited?.let { item ->
        EquipmentFormDialog(
            title = "Rediger udstyr",
            confirmLabel = "Gem",
            initialSerialNumber = item.serialNumber,
            initialType = item.type,
            initialDescription = item.description ?: "",
            onDismiss = { equipmentBeingEdited = null },
            onConfirm = { serialNumber, type, description ->
                viewModel.updateEquipment(item, serialNumber, type, description)
                equipmentBeingEdited = null
            }
        )
    }
}

@Composable
private fun EquipmentItemCard(
    item: EquipmentItem,
    onCheckout: () -> Unit,
    onEdit: () -> Unit,
    onSetMaintenance: () -> Unit,
    onSetAvailable: () -> Unit,
    onRetire: () -> Unit
) {
    var showMenu by remember { mutableStateOf(false) }
    var showRetireConfirmDialog by remember { mutableStateOf(false) }
    
    Card(
        modifier = Modifier.fillMaxWidth(),
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
                    text = item.serialNumber,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = getEquipmentTypeDisplayName(item.type),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                if (item.description != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = item.description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                StatusBadge(status = item.status)
            }
            
            Spacer(modifier = Modifier.width(16.dp))
            
            Box {
                IconButton(onClick = { showMenu = true }) {
                    Icon(
                        Icons.Default.MoreVert,
                        contentDescription = "Handlinger for ${item.serialNumber}",
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
                
                DropdownMenu(
                    expanded = showMenu,
                    onDismissRequest = { showMenu = false }
                ) {
                    DropdownMenuItem(
                        text = { Text("Rediger") },
                        onClick = {
                            showMenu = false
                            onEdit()
                        },
                        leadingIcon = {
                            Icon(Icons.Default.Edit, contentDescription = null)
                        }
                    )
                    if (item.status == EquipmentStatus.Available) {
                        DropdownMenuItem(
                            text = { Text("Udl\u00e5n") },
                            onClick = {
                                showMenu = false
                                onCheckout()
                            },
                            leadingIcon = {
                                Icon(Icons.Default.Check, contentDescription = null)
                            }
                        )
                    }
                    if (item.status == EquipmentStatus.Available) {
                        DropdownMenuItem(
                            text = { Text("S\u00e6t til vedligeholdelse") },
                            onClick = {
                                showMenu = false
                                onSetMaintenance()
                            },
                            leadingIcon = {
                                Icon(Icons.Default.Build, contentDescription = null)
                            }
                        )
                    }
                    if (item.status == EquipmentStatus.Maintenance || item.status == EquipmentStatus.Retired) {
                        DropdownMenuItem(
                            text = { Text("Sæt tilbage i drift") },
                            onClick = {
                                showMenu = false
                                onSetAvailable()
                            },
                            leadingIcon = {
                                Icon(Icons.Default.Refresh, contentDescription = null)
                            }
                        )
                    }
                    if (item.status != EquipmentStatus.Retired && item.status != EquipmentStatus.CheckedOut) {
                        DropdownMenuItem(
                            text = { Text("Pensionér") },
                            onClick = {
                                showMenu = false
                                showRetireConfirmDialog = true
                            },
                            leadingIcon = {
                                Icon(Icons.Default.Delete, contentDescription = null)
                            }
                        )
                    }
                }
            }
        }
    }

    // Retire confirmation dialog
    if (showRetireConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showRetireConfirmDialog = false },
            icon = {
                Icon(
                    Icons.Default.Warning,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error
                )
            },
            title = { Text("Pensionér udstyr") },
            text = {
                Column {
                    Text("Vil du pensionere dette udstyr?")
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = item.serialNumber,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    if (item.description != null) {
                        Text(
                            text = item.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Udstyret kan senere sættes tilbage i drift.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showRetireConfirmDialog = false
                        onRetire()
                    }
                ) {
                    Text(
                        "Pensionér",
                        color = MaterialTheme.colorScheme.error
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { showRetireConfirmDialog = false }) {
                    Text("Annuller")
                }
            }
        )
    }
}

@Composable
private fun EquipmentStatusFilterChip(
    selected: Boolean,
    label: String,
    onClick: () -> Unit
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) }
    )
}

private fun getEquipmentStatusDisplayName(status: EquipmentStatus): String {
    return when (status) {
        EquipmentStatus.Available -> "Tilgængeligt"
        EquipmentStatus.CheckedOut -> "Udlånt"
        EquipmentStatus.Maintenance -> "Til vedligeholdelse"
        EquipmentStatus.Retired -> "Pensioneret"
    }
}

@Composable
private fun StatusBadge(status: EquipmentStatus) {
    val (backgroundColor, textColor, label) = when (status) {
        EquipmentStatus.Available -> Triple(
            Color(0xFF4CAF50),
            Color.White,
            "Tilgængeligt"
        )
        EquipmentStatus.CheckedOut -> Triple(
            Color(0xFFFFC107),
            Color.Black,
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
            "Pensioneret"
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
private fun EquipmentFormDialog(
    title: String,
    confirmLabel: String,
    initialSerialNumber: String,
    initialType: EquipmentType?,
    initialDescription: String,
    onDismiss: () -> Unit,
    onConfirm: (serialNumber: String, type: EquipmentType, description: String?) -> Unit
) {
    var serialNumber by remember { mutableStateOf(initialSerialNumber) }
    var selectedType by remember { mutableStateOf(initialType) }
    var description by remember { mutableStateOf(initialDescription) }
    var showTypeDropdown by remember { mutableStateOf(false) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
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
                Box {
                    OutlinedTextField(
                        value = selectedType?.let { getEquipmentTypeDisplayName(it) } ?: "",
                        onValueChange = { },
                        label = { Text("Udstyrstype *") },
                        readOnly = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showTypeDropdown = true }
                    )
                    DropdownMenu(
                        expanded = showTypeDropdown,
                        onDismissRequest = { showTypeDropdown = false }
                    ) {
                        listOf(
                            EquipmentType.TrainingMaterial,
                            EquipmentType.Pistol,
                            EquipmentType.LuftPistol,
                            EquipmentType.LuftRiffel,
                            EquipmentType.Riffel,
                            EquipmentType.Langdistance,
                            EquipmentType.Andet
                        ).forEach { type ->
                            DropdownMenuItem(
                                text = { Text(getEquipmentTypeDisplayName(type)) },
                                onClick = {
                                    selectedType = type
                                    showTypeDropdown = false
                                }
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it.take(200) },
                    label = { Text("Beskrivelse (valgfri)") },
                    maxLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                    supportingText = { Text("${description.length}/200") }
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onConfirm(
                        serialNumber.trim(),
                        requireNotNull(selectedType),
                        description.trim().ifEmpty { null }
                    )
                },
                enabled = serialNumber.isNotBlank() && selectedType != null
            ) {
                Text(confirmLabel)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Annuller")
            }
        }
    )
}

private fun getEquipmentTypeDisplayName(type: EquipmentType): String {
    return when (type) {
        EquipmentType.TrainingMaterial -> "Tr\u00e6ningsmateriale"
        EquipmentType.Pistol -> "Pistol"
        EquipmentType.LuftPistol -> "Luftpistol"
        EquipmentType.LuftRiffel -> "Luftriffel"
        EquipmentType.Riffel -> "Riffel"
        EquipmentType.Langdistance -> "Langdistance"
        EquipmentType.Andet -> "Andet"
    }
}
