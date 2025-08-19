package com.club.medlems.ui.importexport

import androidx.compose.foundation.layout.*
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

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.Start
    ) {
        Text("CSV import / eksport", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(12.dp))

        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Eksport", style = MaterialTheme.typography.titleMedium)
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { scope.launch { membersCsv = csvService.exportMembers() } }) {
                            Icon(Icons.Default.FileDownload, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Eksporter medlemmer (forhåndsvisning)")
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { scope.launch { sessionsCsv = csvService.exportSessions() } }) {
                            Icon(Icons.Default.FileDownload, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Eksporter skydninger")
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { scope.launch { checkInsCsv = csvService.exportCheckIns() } }) {
                            Icon(Icons.Default.FileDownload, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Eksporter check-ins")
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { scope.launch { scanEventsCsv = csvService.exportScanEvents() } }) {
                            Icon(Icons.Default.FileDownload, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Eksporter scanninger")
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Gem / del", style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = {
                        scope.launch { val f = exporter.saveCsv("members", csvService.exportMembers()); Toast.makeText(context, "Gemt ${'$'}{f.name}", Toast.LENGTH_SHORT).show() }
                    }) { Text("Medlemmer") }
                    Button(onClick = { scope.launch { val f = exporter.saveCsv("members", csvService.exportMembers()); context.startActivity(exporter.shareIntent(f)) } }) { Icon(Icons.Default.Share, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Del") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { scope.launch { val f = exporter.saveCsv("sessions", csvService.exportSessions()); Toast.makeText(context, "Gemt ${'$'}{f.name}", Toast.LENGTH_SHORT).show() } }) { Text("Skydninger") }
                    Button(onClick = { scope.launch { val f = exporter.saveCsv("sessions", csvService.exportSessions()); context.startActivity(exporter.shareIntent(f)) } }) { Icon(Icons.Default.Share, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Del") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { scope.launch { val f = exporter.saveCsv("checkins", csvService.exportCheckIns()); Toast.makeText(context, "Gemt ${'$'}{f.name}", Toast.LENGTH_SHORT).show() } }) { Text("Check-ins") }
                    Button(onClick = { scope.launch { val f = exporter.saveCsv("checkins", csvService.exportCheckIns()); context.startActivity(exporter.shareIntent(f)) } }) { Icon(Icons.Default.Share, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Del") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { scope.launch { val f = exporter.saveCsv("scanevents", csvService.exportScanEvents()); Toast.makeText(context, "Gemt ${'$'}{f.name}", Toast.LENGTH_SHORT).show() } }) { Text("Scanninger") }
                    Button(onClick = { scope.launch { val f = exporter.saveCsv("scanevents", csvService.exportScanEvents()); context.startActivity(exporter.shareIntent(f)) } }) { Icon(Icons.Default.Share, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Del") }
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
                            Toast.makeText(context, "Gemt ${'$'}{zip.name}", Toast.LENGTH_SHORT).show()
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
                            context.startActivity(exporter.shareZipIntent(zip))
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

        Spacer(Modifier.height(16.dp))
    OutlinedButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Tilbage") }
    }
}

@dagger.hilt.android.lifecycle.HiltViewModel
class ImportExportViewModel @javax.inject.Inject constructor(val csvService: CsvService): androidx.lifecycle.ViewModel()
