package com.club.medlems.ui.attendant

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.derivedStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.domain.security.AttendantModeManager
import com.club.medlems.domain.security.AttendantState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Leaderboard
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.launch
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import com.club.medlems.ui.ready.ScanOutcome
import android.media.ToneGenerator
import android.media.AudioManager
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sync
import com.club.medlems.data.entity.MemberType
import androidx.compose.material.icons.filled.Wifi
// Single-page admin menu (flattened for kiosk)

@Composable
fun AttendantMenuScreen(
    openImportExport: () -> Unit,
    openLeaderboard: () -> Unit,
    openPracticeSession: (memberId: String, scanEventId: String) -> Unit,
    openEditSessions: (memberId: String) -> Unit,
    openRegistration: () -> Unit,
    openEquipmentList: () -> Unit = {},
    openCurrentCheckouts: () -> Unit = {},
    openMemberLookup: () -> Unit = {},
    openMinIdraetSearch: () -> Unit = {},
    openConflictResolution: () -> Unit = {},
    openDevicePairing: () -> Unit = {},
    onBack: () -> Unit,
    attendant: AttendantModeManager = androidx.hilt.navigation.compose.hiltViewModel<AttendantViewModel>().attendant,
    deviceConfig: com.club.medlems.domain.prefs.DeviceConfigPreferences = androidx.hilt.navigation.compose.hiltViewModel<AttendantViewModel>().deviceConfig
){
    val context = LocalContext.current
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val adminVm: AdminActionsViewModel = hiltViewModel()
    val state by attendant.state.collectAsState()
    // Equipment is available if enabled by build flavor OR if device is configured as admin
    val canManageEquipment = deviceConfig.equipmentEnabled || deviceConfig.canManageEquipment()
    var showManual by remember { mutableStateOf(false) }
    var showAbout by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var manualId by remember { mutableStateOf("") }
    var showChangePin by remember { mutableStateOf(false) }
    val activeMembers by adminVm.activeMembers.collectAsState(initial = emptyList())
    val filtered by remember {
        derivedStateOf {
            if (query.isBlank()) activeMembers else activeMembers.filter {
                (it.membershipId?.contains(query, ignoreCase = true) == true) ||
                it.internalId.contains(query, ignoreCase = true) ||
                it.firstName.contains(query, ignoreCase = true) ||
                it.lastName.contains(query, ignoreCase = true)
            }.take(50)
        }
    }
    // Hold last manual scan result to offer add-session option
    data class PostScan(val memberId: String, val scanEventId: String, val birthday: Boolean)
    var postScan by remember { mutableStateOf<PostScan?>(null) }
    Scaffold(snackbarHost = { SnackbarHost(snack) }) { innerPad ->
    Column(
        modifier = Modifier.fillMaxSize().padding(innerPad).padding(24.dp),
        verticalArrangement = if (state.unlocked) Arrangement.Top else Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
    if (!state.unlocked) {
            // Header banner
            Box(
                Modifier.fillMaxWidth().height(120.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    Modifier.matchParentSize().background(
                        Brush.horizontalGradient(
                            listOf(
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.85f),
                                MaterialTheme.colorScheme.primaryContainer
                            )
                        )
                    )
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.VerifiedUser, contentDescription = null, tint = Color.White)
                    Spacer(Modifier.width(8.dp))
                    Text("Admin", color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(16.dp))
            Text("Indtast PIN-kode", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(12.dp))
            AdminPinEntry(
                onPinEntered = { pin -> attendant.attemptUnlock(pin) },
                errorMessage = state.error,
                cooldownMs = state.cooldownRemainingMs
            )
            Spacer(Modifier.height(16.dp))
            OutlinedButton(onClick = {
                // When locked, back just navigates away
                onBack()
            }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Tilbage")
            }
    } else {
            // Header banner
            Box(
                Modifier.fillMaxWidth().height(120.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    Modifier.matchParentSize().background(
                        Brush.horizontalGradient(
                            listOf(
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.85f),
                                MaterialTheme.colorScheme.primaryContainer
                            )
                        )
                    )
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.VerifiedUser, contentDescription = null, tint = Color.White)
                    Spacer(Modifier.width(8.dp))
                    Text("Admin-menu", color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(16.dp))
            val btnHeight = 64.dp
            var showEditPicker by remember { mutableStateOf(false) }
            val diagnosticPrefs: com.club.medlems.domain.prefs.DiagnosticPreferences = hiltViewModel<AttendantViewModel>().diagnosticPrefs
            val diagnosticsEnabled by diagnosticPrefs.diagnosticsEnabled.collectAsState()

            // Scrollable menu with sections
            Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // === DAGLIG BRUG ===
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            "Daglig brug",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold
                        )
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(onClick = { attendant.registerInteraction(); openLeaderboard() }, modifier = Modifier.weight(1f).height(btnHeight)) {
                                Icon(Icons.Default.Leaderboard, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("Resultatliste")
                            }
                            Button(onClick = { attendant.registerInteraction(); showManual = true }, modifier = Modifier.weight(1f).height(btnHeight)) {
                                Icon(Icons.Default.QrCode, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("Manuel scanning")
                            }
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(onClick = { attendant.registerInteraction(); openRegistration() }, modifier = Modifier.weight(1f).height(btnHeight)) {
                                Icon(Icons.Default.PersonAdd, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("Tilmeld medlem")
                            }
                            Spacer(Modifier.weight(1f))
                        }
                    }
                }

                // === UDSTYR (conditional) ===
                if (canManageEquipment) {
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(
                                "Udstyr",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Bold
                            )
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Button(onClick = { attendant.registerInteraction(); openEquipmentList() }, modifier = Modifier.weight(1f).height(btnHeight)) {
                                    Icon(Icons.Default.Build, contentDescription = null)
                                    Spacer(Modifier.width(8.dp))
                                    Text("Udstyr")
                                }
                                Button(onClick = { attendant.registerInteraction(); openCurrentCheckouts() }, modifier = Modifier.weight(1f).height(btnHeight)) {
                                    Icon(Icons.Default.Inventory, contentDescription = null)
                                    Spacer(Modifier.width(8.dp))
                                    Text("Udlån")
                                }
                            }
                        }
                    }
                }

                // === ADMINISTRATION ===
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            "Administration",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold
                        )
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(onClick = { attendant.registerInteraction(); openImportExport() }, modifier = Modifier.weight(1f).height(btnHeight)) {
                                Icon(Icons.Default.UploadFile, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("Import / eksport")
                            }
                            Button(onClick = { attendant.registerInteraction(); showEditPicker = true }, modifier = Modifier.weight(1f).height(btnHeight)) {
                                Icon(Icons.Default.VerifiedUser, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("Redigér skydninger")
                            }
                        }
                        if (canManageEquipment) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Button(onClick = { attendant.registerInteraction(); openMemberLookup() }, modifier = Modifier.weight(1f).height(btnHeight)) {
                                    Icon(Icons.Default.PersonSearch, contentDescription = null)
                                    Spacer(Modifier.width(8.dp))
                                    Text("Medlemssøgning")
                                }
                                Button(onClick = { attendant.registerInteraction(); openMinIdraetSearch() }, modifier = Modifier.weight(1f).height(btnHeight)) {
                                    Icon(Icons.Default.Search, contentDescription = null)
                                    Spacer(Modifier.width(8.dp))
                                    Text("DGI søgning")
                                }
                            }
                        }
                    }
                }

                // === SYSTEM ===
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            "System",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold
                        )
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(onClick = { attendant.registerInteraction(); openDevicePairing() }, modifier = Modifier.weight(1f).height(btnHeight)) {
                                Icon(Icons.Default.Wifi, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("Enheder")
                            }
                            Button(onClick = { attendant.registerInteraction(); showChangePin = true }, modifier = Modifier.weight(1f).height(btnHeight)) {
                                Icon(Icons.Default.Lock, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("Skift PIN")
                            }
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(
                                onClick = {
                                    attendant.registerInteraction()
                                    diagnosticPrefs.setDiagnosticsEnabled(!diagnosticsEnabled)
                                },
                                modifier = Modifier.weight(1f).height(btnHeight)
                            ) {
                                Icon(Icons.Default.BugReport, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text(if (diagnosticsEnabled) "Skjul diagnostik" else "Vis diagnostik")
                            }
                            if (canManageEquipment) {
                                Button(onClick = { attendant.registerInteraction(); openConflictResolution() }, modifier = Modifier.weight(1f).height(btnHeight)) {
                                    Icon(Icons.Default.Sync, contentDescription = null)
                                    Spacer(Modifier.width(8.dp))
                                    Text("Konflikter")
                                }
                            } else {
                                Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                }

                // === LOG UD ===
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { attendant.registerInteraction(); attendant.lock(); onBack() },
                            modifier = Modifier.fillMaxWidth().height(btnHeight),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                        ) {
                            Icon(Icons.Default.Lock, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Log ud")
                        }
                        TextButton(onClick = { attendant.registerInteraction(); showAbout = true }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                            Text("Om")
                        }
                    }
                }
            }

            if (showEditPicker) {
                        AlertDialog(
                            onDismissRequest = { showEditPicker = false },
                            confirmButton = { TextButton(onClick = { showEditPicker = false }) { Text("Luk") } },
                            title = { Text("Vælg medlem") },
                            text = {
                                var q by remember { mutableStateOf("") }
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(value = q, onValueChange = { q = it }, label = { Text("Søg (navn eller ID)") }, singleLine = true)
                                    val itemsList = if (q.isBlank()) activeMembers else activeMembers.filter {
                                        (it.membershipId?.contains(q, true) == true) || it.internalId.contains(q, true) || it.firstName.contains(q, true) || it.lastName.contains(q, true)
                                    }.take(50)
                                    if (itemsList.isNotEmpty()) {
                                        LazyColumn(Modifier.heightIn(max = 300.dp)) {
                                            items(itemsList) { m ->
                                                ListItem(
                                                    headlineContent = { 
                                                        Row(
                                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                            verticalAlignment = Alignment.CenterVertically
                                                        ) {
                                                            Text("${m.firstName} ${m.lastName}")
                                                            if (m.memberType == MemberType.TRIAL) {
                                                                Surface(
                                                                    color = MaterialTheme.colorScheme.tertiaryContainer,
                                                                    shape = MaterialTheme.shapes.small
                                                                ) {
                                                                    Text(
                                                                        "Prøve",
                                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                                                        style = MaterialTheme.typography.labelSmall,
                                                                        color = MaterialTheme.colorScheme.onTertiaryContainer
                                                                    )
                                                                }
                                                            }
                                                        }
                                                    },
                                                    supportingContent = { Text(m.membershipId ?: m.internalId.take(8)) },
                                                    trailingContent = {
                                                        TextButton(onClick = {
                                                            attendant.registerInteraction();
                                                            showEditPicker = false;
                                                            openEditSessions(m.membershipId ?: m.internalId)
                                                        }) { Text("Vælg") }
                                                    }
                                                )
                                                HorizontalDivider()
                                            }
                                        }
                                    } else Text("Ingen resultater")
                                }
                            }
                        )
                    }
            // No separate back button in admin menu; use "Log ud" above
        }
        if (showManual) {
            AlertDialog(
                onDismissRequest = { showManual = false },
                confirmButton = {
                    TextButton(onClick = {
                        scope.launch {
                            attendant.registerInteraction()
                            val res = adminVm.manualScan(manualId.ifBlank { query })
                            showManual = false
                            when (res) {
                                is ScanOutcome.First, is ScanOutcome.Repeat -> {
                                    val memberId = when (res) {
                                        is ScanOutcome.First -> res.membershipId
                                        is ScanOutcome.Repeat -> res.membershipId
                                        else -> ""
                                    }
                                    val scanEventId = when (res) {
                                        is ScanOutcome.First -> res.scanEventId
                                        is ScanOutcome.Repeat -> res.scanEventId
                                        else -> ""
                                    }
                                    val birthday = when (res) {
                                        is ScanOutcome.First -> res.birthday
                                        is ScanOutcome.Repeat -> res.birthday
                                        else -> false
                                    }
                                    val msg = if (res is ScanOutcome.First) "Check-in oprettet for $memberId" else "Gentag-scanning for $memberId"
                                    snack.showSnackbar(msg)
                                    if (birthday) {
                                        runCatching { ToneGenerator(AudioManager.STREAM_MUSIC, 100).startTone(ToneGenerator.TONE_PROP_BEEP, 200) }
                                        snack.showSnackbar("Tillykke med fødselsdagen!")
                                    }
                                    // Directly open practice session screen (skip choice dialog)
                                    openPracticeSession(memberId, scanEventId)
                                }
                                is ScanOutcome.Error -> snack.showSnackbar(res.message)
                                is ScanOutcome.AttendantUnlocked -> snack.showSnackbar("Admin låst op")
                            }
                        }
                    }) { Text("OK") }
                },
                dismissButton = { TextButton(onClick = { showManual = false }) { Text("Annuller") } },
                title = { Text("Manuel scanning") },
                text = {
                    Column(
                        modifier = Modifier.verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            "Brug denne funktion når QR scanning ikke virker korrekt.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        
                        OutlinedTextField(
                            value = query,
                            onValueChange = { query = it },
                            label = { Text("Søg (navn eller ID)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = manualId,
                            onValueChange = { manualId = it },
                            label = { Text("Medlems-ID (valgfri)") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth()
                        )
                        
                        val itemsList = filtered
                        if (itemsList.isNotEmpty()) {
                            Text(
                                "Matchende medlemmer:",
                                style = MaterialTheme.typography.labelMedium,
                                modifier = Modifier.padding(top = 8.dp)
                            )
                            LazyColumn(Modifier.heightIn(max = 240.dp)) {
                                items(itemsList) { m ->
                                    ListItem(
                                        headlineContent = { Text("${m.firstName} ${m.lastName}") },
                                        supportingContent = { Text(m.membershipId ?: m.internalId.take(8)) },
                                        trailingContent = {
                                            TextButton(onClick = { manualId = m.membershipId ?: m.internalId }) { Text("Vælg") }
                                        }
                                    )
                                    HorizontalDivider()
                                }
                            }
                        } else if (query.isNotBlank()) {
                            Text(
                                "Ingen medlemmer fundet",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.padding(vertical = 8.dp)
                            )
                        }
                        
                        if (query.isBlank() && manualId.isBlank()) {
                            ElevatedCard(
                                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                                colors = CardDefaults.elevatedCardColors(
                                    containerColor = MaterialTheme.colorScheme.secondaryContainer
                                )
                            ) {
                                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        "Tip til QR scanning problemer:",
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text("• Tryk på fejlfindingsknappen (🐞) på skærmen", style = MaterialTheme.typography.bodySmall)
                                    Text("• Skift mellem front/bag kamera", style = MaterialTheme.typography.bodySmall)
                                    Text("• Sørg for god belysning", style = MaterialTheme.typography.bodySmall)
                                    Text("• Hold kortet stabilt i fokus", style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
            )
        }
    // Manual scan now opens practice session directly, skipping choice dialog
    // Clear data dialog moved to ImportExport screen
    if (showAbout) {
            AlertDialog(
                onDismissRequest = { showAbout = false },
                confirmButton = { TextButton(onClick = { showAbout = false }) { Text("Luk") } },
                title = { Text("Om") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("ISS Skydning Registrering")
            Text("© 2025 Balslev.biz (CVR 32402402)")
            Text("Licens: MIT – fri brug, kopiering og ændring med angivelse af ophavsret og licens.")
                    }
                }
            )
        }
        if (showChangePin) {
            AlertDialog(
                onDismissRequest = { showChangePin = false },
                confirmButton = {},
                title = { Text("Skift PIN") },
                text = {
                    var oldPin by remember { mutableStateOf("") }
                    var newPin by remember { mutableStateOf("") }
                    var newPin2 by remember { mutableStateOf("") }
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedTextField(
                            value = oldPin,
                            onValueChange = { if (it.length <= 4 && it.all(Char::isDigit)) oldPin = it },
                            label = { Text("Nuværende PIN") },
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = newPin,
                            onValueChange = { if (it.length <= 4 && it.all(Char::isDigit)) newPin = it },
                            label = { Text("Ny PIN") },
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = newPin2,
                            onValueChange = { if (it.length <= 4 && it.all(Char::isDigit)) newPin2 = it },
                            label = { Text("Gentag ny PIN") },
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                            singleLine = true
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            TextButton(onClick = { showChangePin = false }) { Text("Annuller") }
                            val enabled = oldPin.length==4 && newPin.length==4 && newPin == newPin2
                            Button(onClick = {
                                attendant.registerInteraction()
                                val ok = attendant.changePin(oldPin, newPin)
                                if (ok) {
                                    scope.launch { snack.showSnackbar("PIN opdateret") }
                                    showChangePin = false
                                } else {
                                    scope.launch { snack.showSnackbar("Kunne ikke skifte PIN") }
                                }
                            }, enabled = enabled) { Text("Gem") }
                        }
                        Text("Standard-PIN er 3715 første gang.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
                    }
                }
            )
        }
    }
    }
}

@Composable
private fun AdminPinEntry(
    onPinEntered: (String) -> Unit,
    errorMessage: String?,
    cooldownMs: Long
) {
    var pin by remember { mutableStateOf("") }
    val isCoolingDown = cooldownMs > 0

    LaunchedEffect(isCoolingDown) {
        if (isCoolingDown) {
            pin = ""
        }
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(4) { index ->
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant,
                            MaterialTheme.shapes.medium
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    if (index < pin.length) {
                        Text(
                            text = "●",
                            style = MaterialTheme.typography.headlineMedium
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf(
                listOf("1", "2", "3"),
                listOf("4", "5", "6"),
                listOf("7", "8", "9"),
                listOf("", "0", "⌫")
            ).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { digit ->
                        if (digit.isEmpty()) {
                            Spacer(modifier = Modifier.size(64.dp))
                        } else {
                            Button(
                                onClick = {
                                    if (digit == "⌫") {
                                        if (pin.isNotEmpty()) {
                                            pin = pin.dropLast(1)
                                        }
                                    } else if (pin.length < 4) {
                                        pin += digit
                                        if (pin.length == 4) {
                                            onPinEntered(pin)
                                            pin = ""
                                        }
                                    }
                                },
                                modifier = Modifier.size(64.dp),
                                enabled = !isCoolingDown
                            ) {
                                Text(
                                    text = digit,
                                    style = MaterialTheme.typography.titleLarge
                                )
                            }
                        }
                    }
                }
            }
        }

        if (errorMessage != null) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = errorMessage,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@dagger.hilt.android.lifecycle.HiltViewModel
class AttendantViewModel @javax.inject.Inject constructor(
    val attendant: AttendantModeManager,
    val diagnosticPrefs: com.club.medlems.domain.prefs.DiagnosticPreferences,
    val deviceConfig: com.club.medlems.domain.prefs.DeviceConfigPreferences
): androidx.lifecycle.ViewModel()
