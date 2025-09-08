package com.club.medlems.ui.attendant

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import kotlinx.coroutines.launch
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import com.club.medlems.ui.ready.ScanOutcome
import android.media.ToneGenerator
import android.media.AudioManager
import androidx.compose.material.icons.filled.Delete
// Single-page admin menu (flattened for kiosk)

@Composable
fun AttendantMenuScreen(
    openImportExport: () -> Unit,
    openLeaderboard: () -> Unit,
    openPracticeSession: (memberId: String, scanEventId: String) -> Unit,
    openEditSessions: (memberId: String) -> Unit,
    onBack: () -> Unit,
    attendant: AttendantModeManager = androidx.hilt.navigation.compose.hiltViewModel<AttendantViewModel>().attendant
) {
    val context = LocalContext.current
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val adminVm: AdminActionsViewModel = hiltViewModel()
    val state by attendant.state.collectAsState()
    var pinInput by remember { mutableStateOf("") }
    val pinFocus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(state.unlocked) {
        if (state.unlocked) {
            pinInput = ""
        } else {
            // When locked view is visible, focus the PIN field and show keyboard
            // Small delay is usually not needed; request immediately.
            pinFocus.requestFocus()
            keyboard?.show()
        }
    }
    var showManual by remember { mutableStateOf(false) }
    var showAbout by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var manualId by remember { mutableStateOf("") }
    var showChangePin by remember { mutableStateOf(false) }
    val activeMembers by adminVm.activeMembers.collectAsState(initial = emptyList())
    val filtered = remember(query, activeMembers) {
        if (query.isBlank()) activeMembers else activeMembers.filter {
            it.membershipId.contains(query, ignoreCase = true) ||
            it.firstName.contains(query, ignoreCase = true) ||
            it.lastName.contains(query, ignoreCase = true)
        }.take(50)
    }
    // Hold last manual scan result to offer add-session option
    data class PostScan(val memberId: String, val scanEventId: String, val birthday: Boolean)
    var postScan by remember { mutableStateOf<PostScan?>(null) }
    Scaffold(snackbarHost = { SnackbarHost(snack) }) { innerPad ->
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
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
            OutlinedTextField(value = pinInput, onValueChange = {
                if (it.length <= 4 && it.all { c -> c.isDigit() }) pinInput = it
            }, label = { Text("PIN") }, enabled = state.cooldownRemainingMs == 0L, singleLine = true, modifier = Modifier.focusRequester(pinFocus))
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Spacer(Modifier.height(12.dp))
            Button(onClick = { attendant.attemptUnlock(pinInput) }, enabled = pinInput.length == 4 && state.cooldownRemainingMs == 0L) {
                Icon(Icons.Default.LockOpen, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Lås op")
            }
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
            val btnHeight = 72.dp
            // Single-page: all admin actions visible together
            ElevatedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.CenterVertically) {
                        Button(onClick = { attendant.registerInteraction(); openImportExport() }, modifier = Modifier.weight(1f).height(btnHeight)) {
                            Icon(Icons.Default.UploadFile, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Import / eksport")
                        }
                        Button(onClick = { attendant.registerInteraction(); openLeaderboard() }, modifier = Modifier.weight(1f).height(btnHeight)) {
                            Icon(Icons.Default.Leaderboard, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Resultatliste")
                        }
                    }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.CenterVertically) {
                        Button(onClick = { attendant.registerInteraction(); showManual = true }, modifier = Modifier.weight(1f).height(btnHeight)) {
                            Icon(Icons.Default.QrCode, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Manuel scanning")
                        }
                        Button(onClick = { attendant.registerInteraction(); showChangePin = true }, modifier = Modifier.weight(1f).height(btnHeight)) {
                            Icon(Icons.Default.Lock, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Skift PIN")
                        }
                        Spacer(Modifier.weight(1f))
                    }
                    var showEditPicker by remember { mutableStateOf(false) }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.CenterVertically) {
                        Button(onClick = { attendant.registerInteraction(); showEditPicker = true }, modifier = Modifier.weight(1f).height(btnHeight)) {
                            Icon(Icons.Default.VerifiedUser, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Redigér skydninger")
                        }
                        Spacer(Modifier.weight(1f))
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
                                        it.membershipId.contains(q, true) || it.firstName.contains(q, true) || it.lastName.contains(q, true)
                                    }.take(50)
                                    if (itemsList.isNotEmpty()) {
                                        LazyColumn(Modifier.heightIn(max = 300.dp)) {
                                            items(itemsList) { m ->
                                                ListItem(
                                                    headlineContent = { Text("${m.firstName} ${m.lastName}") },
                                                    supportingContent = { Text(m.membershipId) },
                                                    trailingContent = {
                                                        TextButton(onClick = {
                                                            attendant.registerInteraction();
                                                            showEditPicker = false;
                                                            openEditSessions(m.membershipId)
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
                    HorizontalDivider()
                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { attendant.registerInteraction(); attendant.lock(); onBack() }, modifier = Modifier.fillMaxWidth().height(btnHeight)) {
                            Icon(Icons.Default.Lock, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Log ud")
                        }
                        TextButton(onClick = { attendant.registerInteraction(); showAbout = true }, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("Om") }
                    }
                }
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
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = query,
                            onValueChange = { query = it },
                            label = { Text("Søg (navn eller ID)") },
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = manualId,
                            onValueChange = { manualId = it },
                            label = { Text("Medlems-ID (valgfri)") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                        )
                        val itemsList = filtered
                        if (itemsList.isNotEmpty()) {
                            LazyColumn(Modifier.heightIn(max = 240.dp)) {
                                items(itemsList) { m ->
                                    ListItem(
                                        headlineContent = { Text("${m.firstName} ${m.lastName}") },
                                        supportingContent = { Text(m.membershipId) },
                                        trailingContent = {
                                            TextButton(onClick = { manualId = m.membershipId }) { Text("Vælg") }
                                        }
                                    )
                                    HorizontalDivider()
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
                        OutlinedTextField(oldPin, onValueChange = { if (it.length <=4 && it.all(Char::isDigit)) oldPin = it }, label = { Text("Nuværende PIN") }, singleLine = true)
                        OutlinedTextField(newPin, onValueChange = { if (it.length <=4 && it.all(Char::isDigit)) newPin = it }, label = { Text("Ny PIN") }, singleLine = true)
                        OutlinedTextField(newPin2, onValueChange = { if (it.length <=4 && it.all(Char::isDigit)) newPin2 = it }, label = { Text("Gentag ny PIN") }, singleLine = true)
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

@dagger.hilt.android.lifecycle.HiltViewModel
class AttendantViewModel @javax.inject.Inject constructor(val attendant: AttendantModeManager): androidx.lifecycle.ViewModel()
