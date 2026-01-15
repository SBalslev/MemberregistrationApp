package com.club.medlems.ui.equipment

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.entity.EquipmentItem
import com.club.medlems.data.entity.EquipmentStatus
import com.club.medlems.data.entity.Member

/**
 * Screen for checking out equipment to a member.
 * 
 * Features:
 * - Search for member by name or ID
 * - Select equipment to checkout
 * - Add optional notes
 * - Supports pre-selected member (from Member Lookup screen)
 * 
 * @see [design.md FR-5.2] - Check Out Equipment
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EquipmentCheckoutScreen(
    equipmentId: String? = null,
    preselectedMembershipId: String? = null,
    viewModel: EquipmentViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit,
    onCheckoutComplete: () -> Unit
) {
    val availableEquipment by viewModel.availableEquipment.collectAsState()
    val memberSearchResults by viewModel.memberSearchResults.collectAsState()
    val preselectedMember by viewModel.preselectedMember.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    
    var selectedEquipment by remember { mutableStateOf<EquipmentItem?>(null) }
    var selectedMember by remember { mutableStateOf<Member?>(null) }
    var memberSearchQuery by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    
    // Pre-load member if ID provided
    LaunchedEffect(preselectedMembershipId) {
        if (preselectedMembershipId != null) {
            viewModel.preloadMember(preselectedMembershipId)
        }
    }
    
    // Apply preselected member when loaded
    LaunchedEffect(preselectedMember) {
        if (preselectedMember != null && selectedMember == null) {
            selectedMember = preselectedMember
        }
    }
    
    // Pre-select equipment if ID provided
    LaunchedEffect(equipmentId, availableEquipment) {
        if (equipmentId != null && selectedEquipment == null) {
            selectedEquipment = availableEquipment.find { it.id == equipmentId }
        }
    }
    
    // Handle success/error
    LaunchedEffect(uiState.successMessage, uiState.error) {
        uiState.successMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearSuccessMessage()
            onCheckoutComplete()
        }
        uiState.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearError()
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Checkout Equipment") },
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
                .padding(16.dp)
        ) {
            // Step 1: Select Equipment
            Text(
                text = "1. Select Equipment",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            
            if (selectedEquipment != null) {
                SelectedEquipmentCard(
                    equipment = selectedEquipment!!,
                    onClear = { selectedEquipment = null }
                )
            } else {
                LazyColumn(
                    modifier = Modifier.height(150.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(availableEquipment, key = { it.id }) { equipment ->
                        EquipmentSelectionCard(
                            equipment = equipment,
                            onSelect = { selectedEquipment = equipment }
                        )
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // Step 2: Search Member
            Text(
                text = "2. Select Member",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            
            if (selectedMember != null) {
                SelectedMemberCard(
                    member = selectedMember!!,
                    onClear = {
                        selectedMember = null
                        memberSearchQuery = ""
                        viewModel.clearMemberSearch()
                    }
                )
            } else {
                OutlinedTextField(
                    value = memberSearchQuery,
                    onValueChange = { query ->
                        memberSearchQuery = query
                        viewModel.searchMembers(query)
                    },
                    label = { Text("Search by name or member ID") },
                    leadingIcon = {
                        Icon(Icons.Default.Search, contentDescription = null)
                    },
                    trailingIcon = {
                        if (memberSearchQuery.isNotEmpty()) {
                            IconButton(onClick = {
                                memberSearchQuery = ""
                                viewModel.clearMemberSearch()
                            }) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear")
                            }
                        }
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                LazyColumn(
                    modifier = Modifier.height(150.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(memberSearchResults, key = { it.membershipId }) { member ->
                        MemberSelectionCard(
                            member = member,
                            onSelect = { selectedMember = member }
                        )
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // Step 3: Notes (optional)
            Text(
                text = "3. Notes (optional)",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it.take(500) },
                label = { Text("Checkout notes") },
                maxLines = 3,
                modifier = Modifier.fillMaxWidth(),
                supportingText = { Text("${notes.length}/500") }
            )
            
            Spacer(modifier = Modifier.weight(1f))
            
            // Checkout Button
            Button(
                onClick = {
                    viewModel.checkoutEquipment(
                        equipmentId = selectedEquipment!!.id,
                        membershipId = selectedMember!!.membershipId,
                        notes = notes.ifEmpty { null }
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                enabled = selectedEquipment != null && selectedMember != null && !uiState.isLoading
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Icon(Icons.Default.Check, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Checkout Equipment")
                }
            }
        }
    }
}

@Composable
private fun SelectedEquipmentCard(
    equipment: EquipmentItem,
    onClear: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = equipment.serialNumber,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                if (equipment.description != null) {
                    Text(
                        text = equipment.description,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
            IconButton(onClick = onClear) {
                Icon(Icons.Default.Clear, contentDescription = "Clear selection")
            }
        }
    }
}

@Composable
private fun EquipmentSelectionCard(
    equipment: EquipmentItem,
    onSelect: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onSelect),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = equipment.serialNumber,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                if (equipment.description != null) {
                    Text(
                        text = equipment.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun SelectedMemberCard(
    member: Member,
    onClear: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.Person,
                    contentDescription = null,
                    modifier = Modifier.size(40.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = "${member.firstName} ${member.lastName}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "ID: ${member.membershipId}",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
            IconButton(onClick = onClear) {
                Icon(Icons.Default.Clear, contentDescription = "Clear selection")
            }
        }
    }
}

@Composable
private fun MemberSelectionCard(
    member: Member,
    onSelect: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onSelect),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Person,
                contentDescription = null,
                modifier = Modifier.size(32.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(
                    text = "${member.firstName} ${member.lastName}",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = "ID: ${member.membershipId}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
