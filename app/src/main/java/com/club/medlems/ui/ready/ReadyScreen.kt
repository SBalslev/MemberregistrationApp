package com.club.medlems.ui.ready

import android.Manifest
import android.content.pm.PackageManager
import android.util.Size
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.AspectRatio
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
import kotlinx.coroutines.launch

@Composable
fun ReadyScreen(
    onFirstScan: (String, String) -> Unit,
    onRepeatScan: (String, String) -> Unit,
    openAttendant: () -> Unit,
    openLeaderboard: () -> Unit,
    vm: ReadyViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
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
                    var previewView by remember { mutableStateOf<PreviewView?>(null) }
                    AndroidView(
                        modifier = Modifier.fillMaxSize().clipToBounds(),
                        factory = { ctx ->
                            FrameLayout(ctx).apply {
                                clipToPadding = true
                                clipChildren = true
                                val pv = PreviewView(ctx).apply {
                                    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                                    scaleType = PreviewView.ScaleType.FIT_CENTER
                                    layoutParams = FrameLayout.LayoutParams(
                                        ViewGroup.LayoutParams.MATCH_PARENT,
                                        ViewGroup.LayoutParams.MATCH_PARENT
                                    )
                                }
                                addView(pv)
                                previewView = pv
                            }
                        }
                    )

                    // Bind camera when previewView or lens changes
                    val ctx = LocalContext.current
                    LaunchedEffect(previewView, lensSelector) {
                        val pv = previewView ?: return@LaunchedEffect
                        val cameraProvider = ProcessCameraProvider.getInstance(ctx).get()
                        val preview = androidx.camera.core.Preview.Builder().build()
                        val reader = MultiFormatReader().apply {
                            setHints(mapOf(com.google.zxing.DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE)))
                        }
                        val analysis = ImageAnalysis.Builder()
                            .setTargetResolution(Size(640, 480))
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()
                        analysis.setAnalyzer(Executors.newSingleThreadExecutor()) { imageProxy: ImageProxy ->
                            try {
                                val buffer = imageProxy.planes[0].buffer
                                val data = ByteArray(buffer.remaining())
                                buffer.get(data)
                                val source = PlanarYUVLuminanceSource(
                                    data,
                                    imageProxy.width,
                                    imageProxy.height,
                                    0, 0,
                                    imageProxy.width,
                                    imageProxy.height,
                                    false
                                )
                                val bitmap = BinaryBitmap(HybridBinarizer(source))
                                val result = reader.decodeWithState(bitmap)
                                result?.text?.let { raw ->
                                    val now = System.currentTimeMillis()
                                    if (now - lastProcessed > 2000) {
                                        lastProcessed = now
                                        vm.onRawQr(raw)
                                    }
                                }
                            } catch (_: Exception) {
                                // No QR code found, ignore
                            } finally {
                                reader.reset()
                                imageProxy.close()
                            }
                        }
                        try {
                            cameraProvider.unbindAll()
                            preview.setSurfaceProvider(pv.surfaceProvider)
                            val camera = cameraProvider.bindToLifecycle(
                                lifecycleOwner,
                                lensSelector,
                                preview,
                                analysis
                            )
                            // Enable tap-to-focus
                            pv.setOnTouchListener { _, _ ->
                                val factory = pv.meteringPointFactory
                                val point = factory.createPoint(pv.width / 2f, pv.height / 2f)
                                val action = androidx.camera.core.FocusMeteringAction.Builder(point).build()
                                camera.cameraControl.startFocusAndMetering(action)
                                true
                            }
                        } catch (_: Exception) { /* ignore for MVP */ }
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
    }
}

@Composable
private fun CompactLeaderboardGrid(groupedRecent: Map<PracticeType, Map<String, List<LeaderboardEntry>>>) {
    val types = PracticeType.values().toList()
    // Two-column grid of discipline cards
        val typesToRender = types.filter { t -> groupedRecent[t]?.any { (_, list) -> list.isNotEmpty() } == true }
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
