package com.club.medlems.ui.equipment

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberType
import com.club.medlems.ui.common.IdPhotoCaptureOverlay
import com.club.medlems.ui.common.QrScannerView

/**
 * Fast checkout flow: scan the equipment's QR code, then the member's QR code
 * (or fall back to manual search), then confirm.
 *
 * This is the "Udlån" scan mode, distinct from the manual list-based
 * [EquipmentCheckoutScreen]. Manual fallbacks are always available at both
 * steps for lost equipment cards or members without their card.
 *
 * @see [design.md FR-5.2] - Check Out Equipment
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EquipmentCheckoutScanScreen(
    viewModel: EquipmentViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit,
    onNavigateToManualCheckout: (equipmentId: String?) -> Unit,
    onCheckoutComplete: () -> Unit
) {
    val scannedEquipment by viewModel.scannedEquipment.collectAsState()
    val memberSearchResults by viewModel.memberSearchResults.collectAsState()
    val trialIdCaptureContext by viewModel.trialIdCaptureContext.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    var selectedMember by remember { mutableStateOf<Member?>(null) }
    var showManualMemberSearch by remember { mutableStateOf(false) }
    var memberSearchQuery by remember { mutableStateOf("") }
    var lastScanTs by remember { mutableLongStateOf(0L) }

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

    trialIdCaptureContext?.let { context ->
        IdPhotoCaptureOverlay(
            memberName = "${context.member.firstName} ${context.member.lastName}".trim(),
            onPhotoTaken = { photoPath ->
                viewModel.completeTrialIdCapture(photoPath)
            },
            onCancel = { viewModel.cancelTrialIdCapture() }
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(if (scannedEquipment == null) "Scan udstyr - Udlån" else "Scan medlemskort")
                },
                navigationIcon = {
                    IconButton(onClick = {
                        if (scannedEquipment != null) {
                            viewModel.clearScannedEquipment()
                            selectedMember = null
                            showManualMemberSearch = false
                        } else {
                            onNavigateBack()
                        }
                    }) {
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
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                scannedEquipment == null -> {
                    // Step 1: scan equipment QR code
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .background(MaterialTheme.colorScheme.surface)
                    ) {
                        QrScannerView(
                            useBackCamera = true,
                            onQrScanned = { raw ->
                                val now = System.currentTimeMillis()
                                if (now - lastScanTs < 2000) return@QrScannerView
                                lastScanTs = now
                                viewModel.onEquipmentQrScanned(raw)
                            },
                            modifier = Modifier.fillMaxSize()
                        )
                        if (uiState.isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier
                                    .align(Alignment.Center)
                                    .size(64.dp),
                                color = MaterialTheme.colorScheme.tertiary
                            )
                        }
                    }
                    InstructionCard(
                        text = "Scan udstyrets QR-kode for at starte udlån",
                        fallbackLabel = "Mistet QR-kort? Vælg udstyr manuelt",
                        onFallback = { onNavigateToManualCheckout(null) }
                    )
                }
                selectedMember == null && !showManualMemberSearch -> {
                    // Step 2: scan member QR code (with manual fallback)
                    SelectedEquipmentCard(
                        equipment = scannedEquipment!!,
                        onClear = {
                            viewModel.clearScannedEquipment()
                            selectedMember = null
                        }
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .background(MaterialTheme.colorScheme.surface)
                    ) {
                        QrScannerView(
                            useBackCamera = false,
                            onQrScanned = { raw ->
                                val now = System.currentTimeMillis()
                                if (now - lastScanTs < 2000) return@QrScannerView
                                lastScanTs = now
                                viewModel.onMemberQrScanned(raw) { member ->
                                    selectedMember = member
                                }
                            },
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                    InstructionCard(
                        text = "Scan medlemmets QR-kort",
                        fallbackLabel = "Medlem har ikke sit kort? Find manuelt",
                        fallbackIcon = Icons.Default.PersonSearch,
                        onFallback = { showManualMemberSearch = true }
                    )
                }
                selectedMember == null && showManualMemberSearch -> {
                    // Step 2 fallback: manual member search
                    SelectedEquipmentCard(
                        equipment = scannedEquipment!!,
                        onClear = {
                            viewModel.clearScannedEquipment()
                            selectedMember = null
                        }
                    )
                    Column(modifier = Modifier.padding(16.dp)) {
                        OutlinedTextField(
                            value = memberSearchQuery,
                            onValueChange = {
                                memberSearchQuery = it
                                viewModel.searchMembers(it)
                            },
                            label = { Text("Søg på navn eller medlemsnummer") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        LazyColumn(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(memberSearchResults, key = { it.internalId }) { member ->
                                MemberSelectionCard(member = member, onSelect = { selectedMember = member })
                            }
                        }
                        OutlinedButton(
                            onClick = { showManualMemberSearch = false },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Scan medlemskort i stedet")
                        }
                    }
                }
                else -> {
                    // Step 3: confirm
                    Column(modifier = Modifier.padding(16.dp)) {
                        SelectedEquipmentCard(
                            equipment = scannedEquipment!!,
                            onClear = {
                                viewModel.clearScannedEquipment()
                                selectedMember = null
                            }
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        SelectedMemberCard(
                            member = selectedMember!!,
                            onClear = {
                                selectedMember = null
                                showManualMemberSearch = false
                                memberSearchQuery = ""
                                viewModel.clearMemberSearch()
                            }
                        )
                        if (selectedMember?.memberType == MemberType.TRIAL && selectedMember?.idPhotoPath.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Prøvemedlem uden ID-billede: Kamera åbnes ved udlån",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                        Spacer(modifier = Modifier.height(24.dp))
                        Button(
                            onClick = {
                                val equipment = scannedEquipment ?: return@Button
                                val member = selectedMember ?: return@Button
                                viewModel.checkoutEquipmentForMember(
                                    equipmentId = equipment.id,
                                    member = member
                                )
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                            enabled = !uiState.isLoading
                        ) {
                            if (uiState.isLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp),
                                    color = MaterialTheme.colorScheme.onPrimary
                                )
                            } else {
                                Icon(Icons.Default.Check, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Udlån udstyr")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun InstructionCard(
    text: String,
    fallbackLabel: String,
    onFallback: () -> Unit,
    fallbackIcon: androidx.compose.ui.graphics.vector.ImageVector = Icons.Default.QrCodeScanner
) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.QrCodeScanner,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onTertiaryContainer
                )
                Text(
                    text = text,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                    modifier = Modifier.padding(start = 8.dp)
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = onFallback,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(fallbackIcon, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(fallbackLabel)
            }
        }
    }
}
