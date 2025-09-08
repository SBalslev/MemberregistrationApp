package com.club.medlems.ui.importexport

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.net.Uri
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.domain.csv.CsvService
import com.club.medlems.domain.csv.CsvFileExporter
import kotlinx.coroutines.launch
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FileUpload
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Archive
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import com.club.medlems.ui.attendant.AdminActionsViewModel

@Composable
fun ImportExportScreen(onBack: () -> Unit, csvService: CsvService = hiltViewModel<ImportExportViewModel>().csvService) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val exporter = remember { CsvFileExporter(context) }
    var membersCsv by remember { mutableStateOf<String?>(null) }
    var sessionsCsv by remember { mutableStateOf<String?>(null) }
    var checkInsCsv by remember { mutableStateOf<String?>(null) }
    var scanEventsCsv by remember { mutableStateOf<String?>(null) }
    var importResult by remember { mutableStateOf<String?>(null) }
    var importing by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            scope.launch {
                runCatching {
                    importing = true
                    val csv = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } ?: ""
                    val res = csvService.importMembers(csv)
                    importResult = "Importeret=${res.imported}, dubletter=${res.skippedDuplicates}, inaktive=${res.newlyInactive}, fejl=${res.errors.size}"
                }.onFailure { e -> importResult = "Fejl: ${e.message}" }
                importing = false
            }
        }
    }

    val scrollState = rememberScrollState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.Start
    ) {
        Text("CSV import / eksport", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(12.dp))

        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Eksport (forhåndsvisning)", style = MaterialTheme.typography.titleMedium)
                // Export action buttons
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { scope.launch { membersCsv = csvService.exportMembers() } }) {
                            Icon(Icons.Default.FileDownload, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Medlemmer")
                        }
                        if (membersCsv != null) OutlinedButton(onClick = { membersCsv = null }) { Text("Ryd") }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { scope.launch { sessionsCsv = csvService.exportSessions() } }) {
                            Icon(Icons.Default.FileDownload, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Skydninger")
                        }
                        if (sessionsCsv != null) OutlinedButton(onClick = { sessionsCsv = null }) { Text("Ryd") }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { scope.launch { checkInsCsv = csvService.exportCheckIns() } }) {
                            Icon(Icons.Default.FileDownload, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Check-ins")
                        }
                        if (checkInsCsv != null) OutlinedButton(onClick = { checkInsCsv = null }) { Text("Ryd") }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { scope.launch { scanEventsCsv = csvService.exportScanEvents() } }) {
                            Icon(Icons.Default.FileDownload, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Scanninger")
                        }
                        if (scanEventsCsv != null) OutlinedButton(onClick = { scanEventsCsv = null }) { Text("Ryd") }
                    }
                }
                // Previews
                @Composable
                fun PreviewBlock(label: String, content: String?) {
                    if (content == null) return
                    val lines = content.lineSequence().toList()
                    val count = if (lines.isNotEmpty()) lines.size - 1 else 0 // minus header
                    var expanded by remember(label) { mutableStateOf(false) }
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                Text("$label ($count rækker)", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "Skjul" else "Vis") }
                            }
                            if (expanded) {
                                val listLines = lines
                                val listState = rememberLazyListState()
                                Surface(tonalElevation = 2.dp, modifier = Modifier.fillMaxWidth().height(240.dp)) {
                                    LazyColumn(
                                        state = listState,
                                        modifier = Modifier.fillMaxSize().padding(8.dp),
                                        verticalArrangement = Arrangement.spacedBy(2.dp)
                                    ) {
                                        items(listLines) { line ->
                                            Text(line, style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                PreviewBlock("Medlemmer", membersCsv)
                PreviewBlock("Skydninger", sessionsCsv)
                PreviewBlock("Check-ins", checkInsCsv)
                PreviewBlock("Scanninger", scanEventsCsv)
            }
        }

        Spacer(Modifier.height(12.dp))

        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Gem / del", style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = {
                        scope.launch {
                            val result = exporter.saveCsv("members", csvService.exportMembers())
                            val pathLabel = result.absolutePublicPath ?: result.publicPath ?: result.file.absolutePath
                            Toast.makeText(context, "Gemt $pathLabel", Toast.LENGTH_LONG).show()
                        }
                    }) { Text("Medlemmer") }
                    Button(onClick = { scope.launch { val r = exporter.saveCsv("members", csvService.exportMembers()); context.startActivity(exporter.shareIntent(r.file)) } }) { Icon(Icons.Default.Share, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Del") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { scope.launch { val r = exporter.saveCsv("sessions", csvService.exportSessions()); val pathLabel = r.absolutePublicPath ?: r.publicPath ?: r.file.absolutePath; Toast.makeText(context, "Gemt $pathLabel", Toast.LENGTH_LONG).show() } }) { Text("Skydninger") }
                    Button(onClick = { scope.launch { val r = exporter.saveCsv("sessions", csvService.exportSessions()); context.startActivity(exporter.shareIntent(r.file)) } }) { Icon(Icons.Default.Share, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Del") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { scope.launch { val r = exporter.saveCsv("checkins", csvService.exportCheckIns()); val pathLabel = r.absolutePublicPath ?: r.publicPath ?: r.file.absolutePath; Toast.makeText(context, "Gemt $pathLabel", Toast.LENGTH_LONG).show() } }) { Text("Check-ins") }
                    Button(onClick = { scope.launch { val r = exporter.saveCsv("checkins", csvService.exportCheckIns()); context.startActivity(exporter.shareIntent(r.file)) } }) { Icon(Icons.Default.Share, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Del") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { scope.launch { val r = exporter.saveCsv("scanevents", csvService.exportScanEvents()); val pathLabel = r.absolutePublicPath ?: r.publicPath ?: r.file.absolutePath; Toast.makeText(context, "Gemt $pathLabel", Toast.LENGTH_LONG).show() } }) { Text("Scanninger") }
                    Button(onClick = { scope.launch { val r = exporter.saveCsv("scanevents", csvService.exportScanEvents()); context.startActivity(exporter.shareIntent(r.file)) } }) { Icon(Icons.Default.Share, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Del") }
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Batch-eksport", style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = {
                        scope.launch {
                            val bundle = listOf(
                                "members" to csvService.exportMembers(),
                                "sessions" to csvService.exportSessions(),
                                "checkins" to csvService.exportCheckIns(),
                                "scanevents" to csvService.exportScanEvents()
                            )
                            val zip = exporter.saveZip(bundle)
                            val pathLabel = zip.absolutePublicPath ?: zip.publicPath ?: zip.file.absolutePath
                            Toast.makeText(context, "Gemt $pathLabel", Toast.LENGTH_LONG).show()
                        }
                    }) { Icon(Icons.Default.Archive, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Gem ZIP") }
                    Button(onClick = {
                        scope.launch {
                            val bundle = listOf(
                                "members" to csvService.exportMembers(),
                                "sessions" to csvService.exportSessions(),
                                "checkins" to csvService.exportCheckIns(),
                                "scanevents" to csvService.exportScanEvents()
                            )
                            val zip = exporter.saveZip(bundle)
                            context.startActivity(exporter.shareZipIntent(zip.file))
                        }
                    }) { Icon(Icons.Default.Share, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Del ZIP") }
                }
            }
        }

        Spacer(Modifier.height(12.dp))

    ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Importer medlems-CSV", style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { picker.launch(arrayOf("text/*","text/csv","application/octet-stream")) }, enabled = !importing) {
                        Icon(Icons.Default.FileUpload, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text(if (importing) "Importer..." else "Vælg fil")
                    }
                    OutlinedButton(onClick = { importResult = null }) { Text("Ryd resultat") }
                }
                importResult?.let { Text(it) }
            }
        }

        Spacer(Modifier.height(12.dp))

        // Maintenance section: demo data generation & clear data (moved from admin menu)
        val adminVm: AdminActionsViewModel = hiltViewModel()
        var generatingDemo by remember { mutableStateOf(false) }
        var clearingData by remember { mutableStateOf(false) }
        var showClearConfirm by remember { mutableStateOf(false) }
        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Vedligeholdelse", style = MaterialTheme.typography.titleMedium)
                Text("Værktøjer til test og oprydning.", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(enabled = !generatingDemo && !clearingData, onClick = {
                        scope.launch {
                            generatingDemo = true
                            runCatching { adminVm.generateDemoData() }
                                .onSuccess { Toast.makeText(context, "Demodata oprettet", Toast.LENGTH_SHORT).show() }
                                .onFailure { Toast.makeText(context, "Fejl: ${it.message}", Toast.LENGTH_SHORT).show() }
                            generatingDemo = false
                        }
                    }) { if (generatingDemo) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) else Icon(Icons.Default.FileDownload, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Generér demodata") }
                    Button(enabled = !clearingData && !generatingDemo, onClick = { showClearConfirm = true }) {
                        Icon(Icons.Default.FileUpload, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Ryd data")
                    }
                }
            }
        }

        if (showClearConfirm) {
            AlertDialog(
                onDismissRequest = { if (!clearingData) showClearConfirm = false },
                confirmButton = {
                    TextButton(enabled = !clearingData, onClick = {
                        scope.launch {
                            clearingData = true
                            runCatching { adminVm.clearAllData() }
                                .onSuccess { Toast.makeText(context, "Data ryddet", Toast.LENGTH_SHORT).show() }
                                .onFailure { Toast.makeText(context, "Fejl: ${it.message}", Toast.LENGTH_SHORT).show() }
                            clearingData = false
                            showClearConfirm = false
                        }
                    }) { Text(if (clearingData) "Rydder..." else "Ryd") }
                },
                dismissButton = { TextButton(enabled = !clearingData, onClick = { showClearConfirm = false }) { Text("Annuller") } },
                title = { Text("Bekræft rydning") },
                text = { Text("Dette sletter alle sessions, scanninger og check-ins. Fortsæt?") }
            )
        }

        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Tilbage") }
    }
}

@dagger.hilt.android.lifecycle.HiltViewModel
class ImportExportViewModel @javax.inject.Inject constructor(val csvService: CsvService): androidx.lifecycle.ViewModel()
