package com.club.medlems.ui.equipment

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
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
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
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.entity.ConflictStatus
import com.club.medlems.data.entity.EquipmentCheckout
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * Screen displaying current equipment checkouts and pending conflicts.
 * 
 * Features:
 * - View all active checkouts
 * - Return equipment (checkin)
 * - View and resolve conflicts
 * 
 * @see [design.md FR-5.3] - Check In Equipment
 * @see [design.md FR-5.5] - Conflict Resolution
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CurrentCheckoutsScreen(
    viewModel: EquipmentViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit
) {
    val checkoutDetails by viewModel.checkoutDetails.collectAsState()
    val pendingConflicts by viewModel.pendingConflicts.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    
    var selectedTab by remember { mutableIntStateOf(0) }
    var checkinCheckout by remember { mutableStateOf<CheckoutWithDetails?>(null) }
    var conflictCheckout by remember { mutableStateOf<EquipmentCheckout?>(null) }
    
    // Handle success/error
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
                title = { Text("Current Checkouts") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Tab Row
            TabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Active (${checkoutDetails.size})") }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = {
                        if (pendingConflicts.isNotEmpty()) {
                            BadgedBox(
                                badge = {
                                    Badge { Text("${pendingConflicts.size}") }
                                }
                            ) {
                                Text("Conflicts")
                            }
                        } else {
                            Text("Conflicts")
                        }
                    }
                )
            }
            
            when (selectedTab) {
                0 -> ActiveCheckoutsList(
                    checkouts = checkoutDetails,
                    onCheckin = { checkinCheckout = it }
                )
                1 -> ConflictsList(
                    conflicts = pendingConflicts,
                    onResolve = { conflictCheckout = it }
                )
            }
        }
    }
    
    // Checkin Dialog
    checkinCheckout?.let { checkout ->
        CheckinDialog(
            checkout = checkout,
            onDismiss = { checkinCheckout = null },
            onConfirm = { notes ->
                viewModel.checkinEquipment(checkout.checkout.id, notes)
                checkinCheckout = null
            }
        )
    }
    
    // Conflict Resolution Dialog
    conflictCheckout?.let { checkout ->
        ConflictResolutionDialog(
            checkout = checkout,
            onDismiss = { conflictCheckout = null },
            onKeep = { notes ->
                viewModel.resolveConflictKeep(checkout.id, notes)
                conflictCheckout = null
            },
            onCancel = { notes ->
                viewModel.resolveConflictCancel(checkout.id, notes)
                conflictCheckout = null
            }
        )
    }
}

@Composable
private fun ActiveCheckoutsList(
    checkouts: List<CheckoutWithDetails>,
    onCheckin: (CheckoutWithDetails) -> Unit
) {
    if (checkouts.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = null,
                    modifier = Modifier.size(64.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    "No active checkouts",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    } else {
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(checkouts, key = { it.checkout.id }) { checkout ->
                CheckoutCard(
                    checkout = checkout,
                    onCheckin = { onCheckin(checkout) }
                )
            }
        }
    }
}

@Composable
private fun CheckoutCard(
    checkout: CheckoutWithDetails,
    onCheckin: () -> Unit
) {
    val checkedOutTime = remember(checkout.checkout.checkedOutAtUtc) {
        val local = checkout.checkout.checkedOutAtUtc.toLocalDateTime(TimeZone.currentSystemDefault())
        "${local.date} ${local.hour.toString().padStart(2, '0')}:${local.minute.toString().padStart(2, '0')}"
    }
    
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Equipment Info
            Text(
                text = checkout.equipment.serialNumber,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            if (checkout.equipment.description != null) {
                Text(
                    text = checkout.equipment.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            
            // Member Info
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.Person,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "${checkout.member.firstName} ${checkout.member.lastName}",
                    style = MaterialTheme.typography.bodyLarge
                )
            }
            
            Text(
                text = "ID: ${checkout.member.membershipId}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 28.dp)
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            // Checkout Time
            Text(
                text = "Checked out: $checkedOutTime",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            if (checkout.checkout.checkoutNotes != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Notes: ${checkout.checkout.checkoutNotes}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Return Button
            Button(
                onClick = onCheckin,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.KeyboardArrowDown, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Return Equipment")
            }
        }
    }
}

@Composable
private fun ConflictsList(
    conflicts: List<EquipmentCheckout>,
    onResolve: (EquipmentCheckout) -> Unit
) {
    if (conflicts.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = null,
                    modifier = Modifier.size(64.dp),
                    tint = Color(0xFF4CAF50)
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    "No pending conflicts",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    } else {
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(conflicts, key = { it.id }) { conflict ->
                ConflictCard(
                    conflict = conflict,
                    onResolve = { onResolve(conflict) }
                )
            }
        }
    }
}

@Composable
private fun ConflictCard(
    conflict: EquipmentCheckout,
    onResolve: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.Warning,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Checkout Conflict",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            
            Text(
                text = "Equipment: ${conflict.equipmentId}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onErrorContainer
            )
            Text(
                text = "Member: ${conflict.membershipId}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onErrorContainer
            )
            
            if (conflict.conflictResolutionNotes != null) {
                Text(
                    text = "Notes: ${conflict.conflictResolutionNotes}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.7f)
                )
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            OutlinedButton(
                onClick = onResolve,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Resolve Conflict")
            }
        }
    }
}

@Composable
private fun CheckinDialog(
    checkout: CheckoutWithDetails,
    onDismiss: () -> Unit,
    onConfirm: (String?) -> Unit
) {
    var notes by remember { mutableStateOf("") }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Return Equipment") },
        text = {
            Column {
                Text("Returning: ${checkout.equipment.serialNumber}")
                Text(
                    "From: ${checkout.member.firstName} ${checkout.member.lastName}",
                    style = MaterialTheme.typography.bodySmall
                )
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it.take(500) },
                    label = { Text("Return notes (optional)") },
                    maxLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(onClick = { onConfirm(notes.ifEmpty { null }) }) {
                Text("Confirm Return")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
private fun ConflictResolutionDialog(
    checkout: EquipmentCheckout,
    onDismiss: () -> Unit,
    onKeep: (String?) -> Unit,
    onCancel: (String?) -> Unit
) {
    var notes by remember { mutableStateOf("") }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Resolve Conflict") },
        text = {
            Column {
                Text(
                    "This checkout conflicts with another checkout made on a different device while offline.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "Equipment: ${checkout.equipmentId}",
                    style = MaterialTheme.typography.bodySmall
                )
                Text(
                    "Member: ${checkout.membershipId}",
                    style = MaterialTheme.typography.bodySmall
                )
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it.take(500) },
                    label = { Text("Resolution notes (optional)") },
                    maxLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(onClick = { onKeep(notes.ifEmpty { null }) }) {
                Text("Keep This Checkout")
            }
        },
        dismissButton = {
            TextButton(onClick = { onCancel(notes.ifEmpty { null }) }) {
                Text("Cancel This Checkout")
            }
        }
    )
}
