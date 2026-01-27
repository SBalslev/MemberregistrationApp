package com.club.medlems.ui.trainer

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.domain.QrParser
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.BarcodeResult
import com.journeyapps.barcodescanner.DecoratedBarcodeView
import com.journeyapps.barcodescanner.DefaultDecoderFactory
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val TAG = "TrainerAuthScreen"

/**
 * Trainer authentication screen with QR code scanning.
 *
 * States:
 * - Waiting for card scan: Shows camera with "Venter på trænerkort..." message
 * - Access Granted: Shows success message with trainer name
 * - Access Denied: Shows denial message
 * - Session Expiring: Shows extend session dialog
 *
 * @param onAuthenticated Callback when trainer is successfully authenticated
 * @param onBack Callback to navigate back
 * @param viewModel The TrainerAuthViewModel instance
 */
@Composable
fun TrainerAuthScreen(
    onAuthenticated: (trainerId: String, trainerName: String) -> Unit,
    onBack: () -> Unit,
    viewModel: TrainerAuthViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val authState by viewModel.authState.collectAsState()
    val sessionState by viewModel.sessionState.collectAsState()

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    var showExtendDialog by remember { mutableStateOf(false) }
    var showPinDialog by remember { mutableStateOf(false) }
    var lastProcessedScan by remember { mutableStateOf(0L) }

    // Show extend dialog when session is expiring
    LaunchedEffect(authState) {
        when (val state = authState) {
            is TrainerAuthState.SessionExpiring -> {
                showExtendDialog = true
            }
            is TrainerAuthState.Authenticated -> {
                showExtendDialog = false
                // Navigate to trainer dashboard on successful authentication
                onAuthenticated(state.trainerId, state.trainerName)
            }
            is TrainerAuthState.Denied -> {
                scope.launch {
                    snackbarHostState.showSnackbar("Adgang nægtet: ${state.reason}")
                }
                // Reset to idle after showing message
                delay(3000)
                viewModel.resetToIdle()
            }
            is TrainerAuthState.Error -> {
                scope.launch {
                    snackbarHostState.showSnackbar(state.message)
                }
                delay(2000)
                viewModel.clearError()
            }
            else -> {}
        }
    }

    // Extend dialog
    if (showExtendDialog && authState is TrainerAuthState.SessionExpiring) {
        ExtendSessionDialog(
            secondsRemaining = (authState as TrainerAuthState.SessionExpiring).secondsRemaining,
            onExtend = {
                viewModel.extendSession()
                showExtendDialog = false
            },
            onLogout = {
                viewModel.logout()
                showExtendDialog = false
            }
        )
    }

    // PIN entry dialog
    if (showPinDialog) {
        PinEntryDialog(
            onPinEntered = { pin ->
                if (viewModel.onPinEntered(pin)) {
                    showPinDialog = false
                }
            },
            onDismiss = { showPinDialog = false },
            errorMessage = viewModel.getPinError(),
            cooldownMs = viewModel.getCooldownRemaining()
        )
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Header banner
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(100.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .background(
                            Brush.horizontalGradient(
                                listOf(
                                    MaterialTheme.colorScheme.tertiary.copy(alpha = 0.85f),
                                    MaterialTheme.colorScheme.tertiaryContainer
                                )
                            )
                        )
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Badge,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(32.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "Træner Login",
                        color = Color.White,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Back button
                IconButton(
                    onClick = onBack,
                    modifier = Modifier
                        .align(Alignment.CenterStart)
                        .padding(start = 8.dp)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Tilbage",
                        tint = Color.White
                    )
                }
            }

            when (authState) {
                is TrainerAuthState.Idle, is TrainerAuthState.Scanning -> {
                    // Show camera scanner
                    if (!hasCameraPermission) {
                        CameraPermissionRequest(
                            onRequestPermission = {
                                permissionLauncher.launch(Manifest.permission.CAMERA)
                            }
                        )
                    } else {
                        ScannerView(
                            isScanning = authState is TrainerAuthState.Scanning,
                            onQrScanned = { raw ->
                                val now = System.currentTimeMillis()
                                if (now - lastProcessedScan > 2000) {
                                    lastProcessedScan = now
                                    val memberId = QrParser.extractMemberId(raw)
                                    if (memberId != null) {
                                        viewModel.onCardScanned(memberId)
                                    } else {
                                        scope.launch {
                                            snackbarHostState.showSnackbar(
                                                "Ugyldigt QR-kode format"
                                            )
                                        }
                                    }
                                }
                            },
                            onPinLoginClicked = { showPinDialog = true }
                        )
                    }
                }

                is TrainerAuthState.Denied -> {
                    val state = authState as TrainerAuthState.Denied
                    AccessDeniedView(
                        memberName = state.memberName ?: state.memberId,
                        reason = state.reason,
                        onDismiss = { viewModel.resetToIdle() }
                    )
                }

                is TrainerAuthState.Authenticated -> {
                    val state = authState as TrainerAuthState.Authenticated
                    AuthenticatedView(
                        trainerName = state.trainerName,
                        onLogout = { viewModel.logout() }
                    )
                }

                is TrainerAuthState.SessionExpiring -> {
                    // Show authenticated view with overlay handled by dialog
                    val session = sessionState
                    AuthenticatedView(
                        trainerName = session.trainerName ?: "",
                        onLogout = { viewModel.logout() }
                    )
                }

                is TrainerAuthState.Error -> {
                    ErrorView(
                        message = (authState as TrainerAuthState.Error).message,
                        onDismiss = { viewModel.clearError() }
                    )
                }
            }
        }
    }
}

@Composable
private fun CameraPermissionRequest(
    onRequestPermission: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.CreditCard,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Kameratilladelse kræves for at scanne trænerkort",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onRequestPermission) {
            Text("Giv tilladelse")
        }
    }
}

@Composable
private fun ScannerView(
    isScanning: Boolean,
    onQrScanned: (String) -> Unit,
    onPinLoginClicked: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize()
    ) {
        // Camera area
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(MaterialTheme.colorScheme.surface)
        ) {
            var barcodeView by remember { mutableStateOf<DecoratedBarcodeView?>(null) }

            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    Log.i(TAG, "Creating DecoratedBarcodeView for trainer auth")
                    DecoratedBarcodeView(ctx).apply {
                        val formats = listOf(BarcodeFormat.QR_CODE)
                        barcodeView = this
                        decoderFactory = DefaultDecoderFactory(formats)

                        val settings = barcodeView?.cameraSettings
                        settings?.requestedCameraId = 1 // Front camera
                        settings?.isAutoFocusEnabled = true
                        settings?.isContinuousFocusEnabled = true
                        barcodeView?.cameraSettings = settings

                        val callback = object : BarcodeCallback {
                            override fun barcodeResult(result: BarcodeResult?) {
                                result?.text?.let { raw ->
                                    Log.i(TAG, "QR detected: ${raw.take(50)}")
                                    onQrScanned(raw)
                                }
                            }

                            override fun possibleResultPoints(
                                resultPoints: MutableList<com.google.zxing.ResultPoint>?
                            ) {
                                // Frames being processed
                            }
                        }

                        decodeContinuous(callback)
                        Log.i(TAG, "Trainer auth scanner initialized")
                    }
                }
            )

            // Start/stop scanning based on lifecycle
            DisposableEffect(Unit) {
                Log.i(TAG, "Starting trainer auth camera")
                barcodeView?.resume()
                onDispose {
                    Log.i(TAG, "Stopping trainer auth camera")
                    barcodeView?.pause()
                }
            }

            // Scanning overlay
            if (isScanning) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .size(64.dp),
                    color = MaterialTheme.colorScheme.tertiary
                )
            }
        }

        // Instruction card
        ElevatedCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            colors = CardDefaults.elevatedCardColors(
                containerColor = MaterialTheme.colorScheme.tertiaryContainer
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Default.CreditCard,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onTertiaryContainer,
                    modifier = Modifier.size(32.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "Venter på trænerkort...",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                    fontWeight = FontWeight.Medium
                )
            }
        }

        // PIN login button
        OutlinedButton(
            onClick = onPinLoginClicked,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 16.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Lock,
                contentDescription = null,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Log ind med PIN")
        }
    }
}

@Composable
private fun AccessDeniedView(
    memberName: String,
    reason: String,
    onDismiss: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.errorContainer
            ),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = null,
                    modifier = Modifier.size(64.dp),
                    tint = MaterialTheme.colorScheme.error
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Adgang nægtet",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = memberName,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = reason,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    textAlign = TextAlign.Center
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        OutlinedButton(onClick = onDismiss) {
            Text("Prøv igen")
        }
    }
}

@Composable
private fun AuthenticatedView(
    trainerName: String,
    onLogout: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer
            ),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = null,
                    modifier = Modifier.size(64.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Velkommen",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = trainerName,
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onLogout,
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.error
            )
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Logout,
                contentDescription = null
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Log ud")
        }
    }
}

@Composable
private fun ErrorView(
    message: String,
    onDismiss: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.errorContainer
            ),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Fejl",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    textAlign = TextAlign.Center
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        OutlinedButton(onClick = onDismiss) {
            Text("Prøv igen")
        }
    }
}

@Composable
private fun PinEntryDialog(
    onPinEntered: (String) -> Unit,
    onDismiss: () -> Unit,
    errorMessage: String?,
    cooldownMs: Long
) {
    var pin by remember { mutableStateOf("") }
    val isCoolingDown = cooldownMs > 0

    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Administrator login") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Indtast 4-cifret PIN kode",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(16.dp))

                // PIN display (dots/numbers)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
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

                // Number pad
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
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
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

                // Error message
                if (errorMessage != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = errorMessage,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            OutlinedButton(onClick = onDismiss) {
                Text("Annuller")
            }
        }
    )
}
