package com.club.medlems.ui.ready

import android.Manifest
import android.content.pm.PackageManager
import android.util.Size
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.AspectRatio
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.BarcodeResult
import com.journeyapps.barcodescanner.DecoratedBarcodeView
import com.journeyapps.barcodescanner.DefaultDecoderFactory
import com.google.zxing.ResultPoint
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.derivedStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.ui.common.displayName
import com.club.medlems.domain.LeaderboardEntry
import com.club.medlems.ui.leaderboard.LeaderboardRange
import com.club.medlems.ui.leaderboard.LeaderboardViewModel
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Close
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.BarcodeFormat
import java.nio.ByteBuffer
import kotlinx.coroutines.flow.collectLatest
import java.util.concurrent.Executors
import android.widget.FrameLayout
import android.view.ViewGroup
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import android.media.ToneGenerator
import android.media.AudioManager
import androidx.compose.runtime.rememberCoroutineScope
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.launch
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.text.font.FontWeight

private const val TAG = "ReadyScreen"
private val cameraExecutor by lazy { Executors.newSingleThreadExecutor() }

data class ScanDiagnostics(
    var cameraInitialized: Boolean = false,
    var cameraError: String? = null,
    var analyzerActive: Boolean = false,
    var framesProcessed: Long = 0,
    var lastFrameTime: Long = 0,
    var scanAttempts: Long = 0,
    var successfulScans: Long = 0,
    var lastError: String? = null,
    var lastScanText: String? = null,
    var lastScanTime: Long = 0,
    var resolutionWidth: Int = 0,
    var resolutionHeight: Int = 0,
    var currentCamera: String = "Front",
    var pipelineStage: String = "Not started",
    var analysisBuilt: Boolean = false,
    var analyzerSet: Boolean = false,
    var analysisBound: Boolean = false,
    var androidVersion: String = "Unknown"
)

@Composable
fun ReadyScreen(
    onFirstScan: (String, String) -> Unit,
    onRepeatScan: (String, String) -> Unit,
    openAttendant: () -> Unit,
    openLeaderboard: () -> Unit,
    vm: ReadyViewModel = hiltViewModel(),
    deviceConfig: com.club.medlems.domain.prefs.DeviceConfigPreferences = hiltViewModel<ReadyViewModel>().deviceConfig
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val diagnosticsEnabled by vm.diagnosticPrefs.diagnosticsEnabled.collectAsState()
    var showDiagnosticPanel by remember { mutableStateOf(false) }
    var hasCameraPermission by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCameraPermission = granted
    }
    var lastProcessed by remember { mutableStateOf(0L) }
    var useBackCamera by remember { mutableStateOf(false) }
    val lensSelector by remember(useBackCamera) {
        mutableStateOf(if (useBackCamera) CameraSelector.DEFAULT_BACK_CAMERA else CameraSelector.DEFAULT_FRONT_CAMERA)
    }
    val snackHost = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val lbVm: LeaderboardViewModel = hiltViewModel()
    val lbState by lbVm.state.collectAsState()
    LaunchedEffect(Unit) { lbVm.setRange(LeaderboardRange.TODAY) }
    
    // Diagnostics state - minimized updates to reduce recompositions
    var diagnostics by remember { 
        mutableStateOf(ScanDiagnostics(
            androidVersion = "Android ${android.os.Build.VERSION.RELEASE} (API ${android.os.Build.VERSION.SDK_INT})"
        )) 
    }
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    
    LaunchedEffect(useBackCamera) {
        diagnostics = diagnostics.copy(currentCamera = if (useBackCamera) "Back" else "Front")
    }

    LaunchedEffect(Unit) {
        vm.events.collectLatest { outcome ->
            when (outcome) {
        is ScanOutcome.First -> {
                    if (outcome.birthday) {
                        // short celebratory tone and snackbar
                        runCatching { ToneGenerator(AudioManager.STREAM_MUSIC, 100).startTone(ToneGenerator.TONE_PROP_BEEP, 200) }
            scope.launch { snackHost.showSnackbar("Tillykke med fødselsdagen!") }
                    }
                    onFirstScan(outcome.membershipId, outcome.scanEventId)
                }
                is ScanOutcome.Repeat -> {
                    if (outcome.birthday) {
                        runCatching { ToneGenerator(AudioManager.STREAM_MUSIC, 100).startTone(ToneGenerator.TONE_PROP_BEEP, 200) }
            scope.launch { snackHost.showSnackbar("Tillykke med fødselsdagen!") }
                    }
                    onRepeatScan(outcome.membershipId, outcome.scanEventId)
                }
                is ScanOutcome.Error -> snackHost.showSnackbar(outcome.message)
                is ScanOutcome.AttendantUnlocked -> {
                    // Navigate straight to Admin (already unlocked)
                    openAttendant()
                }
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackHost) },
        bottomBar = {
            Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AssistChip(
                        onClick = { useBackCamera = true },
                        label = { Text("Bagside") },
                        leadingIcon = {},
                        enabled = !useBackCamera
                    )
                    AssistChip(
                        onClick = { useBackCamera = false },
                        label = { Text("Front") },
                        leadingIcon = {},
                        enabled = useBackCamera
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = openLeaderboard) { Text("Resultatliste") }
                    Button(onClick = openAttendant) { Text("Admin") }
                }
            }
        }
    ) { pad ->
    if (!hasCameraPermission) {
            Column(
                Modifier.fillMaxSize().padding(pad).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text("Kameratilladelse kræves for scanning")
                Spacer(Modifier.height(12.dp))
                Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }) { Text("Giv tilladelse") }
            }
        } else {
            Column(Modifier.fillMaxSize().padding(pad)) {
                // Camera area (top half)
                Box(
                    Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .background(MaterialTheme.colorScheme.surface)
                ) {
                    var barcodeView by remember { mutableStateOf<DecoratedBarcodeView?>(null) }
                    
                    // Recreate the view when camera selection changes
                    key(useBackCamera) {
                        AndroidView(
                            modifier = Modifier.fillMaxSize(),
                            factory = { ctx ->
                                Log.i(TAG, "Creating DecoratedBarcodeView (ZXing native) - ${if (useBackCamera) "back" else "front"} camera")
                                mainHandler.post {
                                    diagnostics = diagnostics.copy(pipelineStage = "Creating ZXing BarcodeView")
                                }
                                
                                DecoratedBarcodeView(ctx).apply {
                                // Only scan QR codes
                                val formats = listOf(BarcodeFormat.QR_CODE)
                                barcodeView = this
                                decoderFactory = DefaultDecoderFactory(formats)
                                
                                // Configure camera settings
                                val settings = barcodeView?.cameraSettings
                                settings?.requestedCameraId = if (useBackCamera) 0 else 1 // 0=back, 1=front
                                settings?.isAutoFocusEnabled = true
                                settings?.isContinuousFocusEnabled = true
                                settings?.isAutoTorchEnabled = false
                                barcodeView?.cameraSettings = settings
                                
                                val callback = object : BarcodeCallback {
                                    override fun barcodeResult(result: BarcodeResult?) {
                                        result?.text?.let { raw ->
                                            Log.i(TAG, "QR detected via ZXing: $raw")
                                            val now = System.currentTimeMillis()
                                            mainHandler.post {
                                                diagnostics = diagnostics.copy(
                                                    analyzerActive = true,
                                                    framesProcessed = diagnostics.framesProcessed + 1,
                                                    scanAttempts = diagnostics.scanAttempts + 1,
                                                    successfulScans = diagnostics.successfulScans + 1,
                                                    lastScanText = raw.take(50),
                                                    lastScanTime = now,
                                                    lastFrameTime = now,
                                                    lastError = null
                                                )
                                            }
                                            if (now - lastProcessed > 1500) {
                                                lastProcessed = now
                                                vm.onRawQr(raw)
                                            }
                                        }
                                    }
                                    
                                    override fun possibleResultPoints(resultPoints: MutableList<ResultPoint>?) {
                                        // Frames are being processed
                                        val now = System.currentTimeMillis()
                                        val newCount = diagnostics.framesProcessed + 1
                                        if (newCount == 1L) {
                                            mainHandler.post {
                                                diagnostics = diagnostics.copy(analyzerActive = true, framesProcessed = 1)
                                            }
                                        } else if (newCount % 30L == 0L) {
                                            mainHandler.post {
                                                diagnostics = diagnostics.copy(
                                                    framesProcessed = newCount,
                                                    lastFrameTime = now,
                                                    scanAttempts = diagnostics.scanAttempts + 1
                                                )
                                            }
                                        }
                                    }
                                }
                                
                                decodeContinuous(callback)
                                
                                mainHandler.post {
                                    diagnostics = diagnostics.copy(
                                        analysisBuilt = true,
                                        analyzerSet = true,
                                        analysisBound = true,
                                        cameraInitialized = true,
                                        pipelineStage = "ZXing scanner ready"
                                    )
                                }
                                Log.i(TAG, "ZXing BarcodeView initialized")
                                }
                            }
                        )
                        
                        // Start/stop scanning based on lifecycle
                        DisposableEffect(Unit) {
                            Log.i(TAG, "Starting camera: ${if (useBackCamera) "back" else "front"}")
                            barcodeView?.resume()
                            onDispose {
                                Log.i(TAG, "Stopping camera")
                                barcodeView?.pause()
                            }
                        }
                    }
                    
                    // Diagnostic button overlay (top-right) - only visible when enabled
                    if (diagnosticsEnabled) {
                        IconButton(
                            onClick = { showDiagnosticPanel = true },
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(8.dp)
                        ) {
                            Icon(
                                Icons.Default.BugReport,
                                contentDescription = "Diagnostik",
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                    
                    // Admin mode indicator (top-left) - visible on admin build flavor
                    if (deviceConfig.isAdminBuild) {
                        Surface(
                            modifier = Modifier
                                .align(Alignment.TopStart)
                                .padding(8.dp),
                            color = MaterialTheme.colorScheme.tertiary,
                            shape = MaterialTheme.shapes.small
                        ) {
                            Text(
                                "ADMIN MODE",
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                color = MaterialTheme.colorScheme.onTertiary,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
                // Instruction banner between camera and leaderboard
                ElevatedCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                ) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Default.Info, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Hold dit medlemskort foran kameraet for at scanne",
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }

                HorizontalDivider()
                // Compact leaderboard (bottom half)
                Box(Modifier.fillMaxWidth().weight(1f)) {
                    if (lbState.loading) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    } else {
                        CompactLeaderboardGrid(groupedRecent = lbState.groupedRecent)
                    }
                    // Watermark overlay (ensure visibility above cards)
                    Image(
                        painter = painterResource(id = com.club.medlems.R.drawable.bg_iss_logo),
                        contentDescription = null,
                        modifier = Modifier
                            .matchParentSize()
                            .padding(8.dp),
                        contentScale = ContentScale.Inside,
                        alpha = 0.12f
                    )
                }
            }
        }
        
        // Diagnostic panel dialog
        if (showDiagnosticPanel) {
            AlertDialog(
                onDismissRequest = { showDiagnosticPanel = false },
                confirmButton = {
                    TextButton(onClick = { 
                        diagnostics = diagnostics.copy(
                            framesProcessed = 0,
                            scanAttempts = 0,
                            successfulScans = 0,
                            lastError = null,
                            lastScanText = null
                        )
                    }) {
                        Text("Nulstil")
                    }
                },
                dismissButton = {
                    IconButton(onClick = { showDiagnosticPanel = false }) {
                        Icon(Icons.Default.Close, contentDescription = "Luk")
                    }
                },
                title = { Text("QR Scanner Diagnostik") },
                text = {
                    Column(
                        modifier = Modifier.verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        DiagnosticRow("Kamera initialiseret", if (diagnostics.cameraInitialized) "Ja" else "Nej", diagnostics.cameraInitialized)
                        DiagnosticRow("Analysator aktiv", if (diagnostics.analyzerActive) "Ja" else "Nej", diagnostics.analyzerActive)
                        DiagnosticRow("Frames behandlet", diagnostics.framesProcessed.toString(), diagnostics.framesProcessed > 0)
                        DiagnosticRow("Scanforsøg", diagnostics.scanAttempts.toString(), true)
                        DiagnosticRow("Vellykkede scans", diagnostics.successfulScans.toString(), diagnostics.successfulScans > 0)
                        DiagnosticRow("Opløsning", "${diagnostics.resolutionWidth}x${diagnostics.resolutionHeight}", diagnostics.resolutionWidth > 0)
                        DiagnosticRow("Aktuel kamera", diagnostics.currentCamera, true)
                        DiagnosticRow("Pipeline stadie", diagnostics.pipelineStage, diagnostics.cameraInitialized)
                        DiagnosticRow("Android version", diagnostics.androidVersion, true)
                        
                        if (diagnostics.lastScanText != null) {
                            HorizontalDivider()
                            Text("Sidste scan:", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall)
                            Text(diagnostics.lastScanText ?: "N/A", style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace))
                            Text("Tid: ${if (diagnostics.lastScanTime > 0) java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date(diagnostics.lastScanTime)) else "N/A"}", style = MaterialTheme.typography.bodySmall)
                        }
                        
                        if (diagnostics.lastError != null) {
                            HorizontalDivider()
                            TroubleshootingTip(diagnostics.lastError ?: "", isError = true)
                        }
                        
                        HorizontalDivider()
                        Text("Fejlfinding:", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall)
                        if (!diagnostics.cameraInitialized) {
                            TroubleshootingTip("• Kameraet kunne ikke initialiseres. Tjek tilladelser.", isError = true)
                        }
                        if (diagnostics.framesProcessed == 0L && diagnostics.cameraInitialized) {
                            TroubleshootingTip("• Ingen frames modtaget. Prøv at skifte kamera.", isError = true)
                        }
                        if (diagnostics.scanAttempts > 50 && diagnostics.successfulScans == 0L) {
                            TroubleshootingTip("• Mange forsøg uden succes. Tjek QR-kode kvalitet og lys.", isError = true)
                        }
                        if (diagnostics.successfulScans > 0) {
                            TroubleshootingTip("• Scanner fungerer korrekt.")
                        }
                    }
                }
            )
        }
    }
}

@Composable
private fun DiagnosticRow(label: String, value: String, isGood: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
            color = if (isGood) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun TroubleshootingTip(text: String, isError: Boolean = false) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 2.dp)
    )
}

@Composable
private fun CompactLeaderboardGrid(groupedRecent: Map<PracticeType, Map<String, List<LeaderboardEntry>>>) {
    val types = remember { PracticeType.values().toList() }
    // Two-column grid of discipline cards
    val typesToRender by remember(groupedRecent) {
        derivedStateOf {
            types.filter { t -> groupedRecent[t]?.any { (_, list) -> list.isNotEmpty() } == true }
        }
    }
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.fillMaxSize().padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
            if (typesToRender.isEmpty()) {
                item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                    Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) {
                        Text("Ingen resultater", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            items(typesToRender) { type ->
                val byCls = groupedRecent[type].orEmpty().filterValues { it.isNotEmpty() }
            ElevatedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(8.dp)) {
                    Text(type.displayName, style = MaterialTheme.typography.titleSmall)
                    if (byCls.isEmpty()) {
                        Text("—", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        byCls.toSortedMap().forEach { (cls, list) ->
                                val label = if (cls.isBlank()) "Uklassificeret" else cls
                                Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                            list.take(3).forEach { entry ->
                                Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                    val name = entry.memberName
                                    val left = if (name.isNullOrBlank()) entry.membershipId else "${entry.membershipId} – ${name}"
                                    Text(left, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text("${entry.points}${entry.krydser?.let { "/$it" } ?: ""}", style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
