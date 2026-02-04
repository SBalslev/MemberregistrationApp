package com.club.medlems.ui.session

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.ui.common.displayName
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.SessionSource
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.dao.ScanEventDao
import com.club.medlems.data.dao.MemberDao
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import androidx.lifecycle.viewModelScope
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.DateTimeUnit
import java.util.UUID
import com.club.medlems.ui.util.IdleCountdown
import com.club.medlems.domain.prefs.LastClassificationStore
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.data.sync.SyncOutboxManager
import com.club.medlems.network.TrustManager
import javax.inject.Inject
import com.club.medlems.domain.ClassificationOptions
import com.club.medlems.ui.common.Formatters

@dagger.hilt.android.lifecycle.HiltViewModel
class PracticeSessionViewModel @javax.inject.Inject constructor(
    private val practiceSessionDao: PracticeSessionDao,
    private val scanEventDao: ScanEventDao,
    private val lastStore: LastClassificationStore,
    private val memberDao: MemberDao,
    private val syncOutboxManager: SyncOutboxManager,
    private val syncManager: SyncManager,
    private val trustManager: TrustManager
) : androidx.lifecycle.ViewModel() {
    fun getLast(memberId: String): Pair<PracticeType?, String?> = lastStore.get(memberId)
    var saving by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    fun save(memberId: String, scanEventId: String, type: PracticeType, classification: String?, points: String, krydser: String?, onDone: () -> Unit) {
        val pointsVal = points.toIntOrNull()
        if (pointsVal == null || pointsVal < 0) { error = "Points ugyldige"; return }
        val krydserVal = krydser?.takeIf { it.isNotBlank() }?.toIntOrNull()?.takeIf { it >= 0 }
        saving = true
        error = null
        viewModelScope.launch {
            // Look up member to get internalId
            val member = memberDao.get(memberId)
            if (member == null) {
                error = "Medlem ikke fundet"
                saving = false
                return@launch
            }
            val now = Clock.System.now()
            val date = now.toLocalDateTime(TimeZone.currentSystemDefault()).date
            val session = PracticeSession(
                id = UUID.randomUUID().toString(),
                internalMemberId = member.internalId,
                membershipId = memberId,
                createdAtUtc = now,
                localDate = date,
                practiceType = type,
                points = pointsVal,
                krydser = krydserVal,
                classification = classification,
                source = SessionSource.kiosk
            )
            practiceSessionDao.insert(session)
            // Queue practice session for sync and trigger reactive sync
            syncOutboxManager.queuePracticeSession(session, trustManager.getThisDeviceId())
            syncManager.notifyEntityChanged("PracticeSession", session.id)
            // Trigger immediate tablet sync (non-blocking)
            syncManager.triggerImmediateTabletSync()
            scanEventDao.linkSession(scanEventId, session.id)
            lastStore.set(memberId, type, classification)
            saving = false
            onDone()
        }
    }

    fun cancel(scanEventId: String, after: () -> Unit) {
        viewModelScope.launch {
            scanEventDao.cancel(scanEventId)
            after()
        }
    }

    suspend fun loadMemberName(memberId: String): String? {
        val m = memberDao.get(memberId) ?: return null
        val first = m.firstName.trim()
        val last = m.lastName.trim()
        val full = "$first $last".trim()
        return full.ifBlank { null }
    }

    suspend fun loadHistory(
        memberId: String,
        type: PracticeType,
        classification: String
    ): List<PracticeSession> {
        val end = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        val start = kotlinx.datetime.LocalDate(end.year - 1, end.month, end.dayOfMonth)
        return practiceSessionDao.historyForMember(memberId, start, end, type, classification)
    }

    suspend fun loadHistoryAllClasses(
        memberId: String,
        type: PracticeType
    ): List<PracticeSession> {
        val end = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        val start = kotlinx.datetime.LocalDate(end.year - 1, end.month, end.dayOfMonth)
        return practiceSessionDao.historyForMemberAllClassifications(memberId, start, end, type)
    }

    suspend fun hasAnyHistoryAllClasses(
        memberId: String,
        type: PracticeType
    ): Boolean {
        val end = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        val start = kotlinx.datetime.LocalDate(end.year - 1, end.month, end.dayOfMonth)
        return practiceSessionDao.historyCountForMemberAllClassifications(memberId, start, end, type) > 0
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PracticeSessionScreen(
    memberId: String,
    scanEventId: String,
    onSaved: () -> Unit,
    onCancel: () -> Unit,
    vm: PracticeSessionViewModel = hiltViewModel()
) {
    var points by remember { mutableStateOf("") }
    var krydser by remember { mutableStateOf("") }
    var practiceType by remember { mutableStateOf<PracticeType?>(null) }
    var classification by remember { mutableStateOf<String?>(null) }
    var showHistory by remember { mutableStateOf(false) }
    var history by remember { mutableStateOf<List<PracticeSession>>(emptyList()) }
    var memberName by remember { mutableStateOf<String?>(null) }

    // Classification options provided centrally
    fun optionsFor(t: PracticeType): List<String> = ClassificationOptions.optionsFor(t)

    // Load last selection
    LaunchedEffect(memberId) {
        val (t, cls) = vm.getLast(memberId)
        practiceType = t
        classification = cls
        memberName = vm.loadMemberName(memberId)
    }

    var idleSeconds by remember { mutableStateOf(90) }
    // Restart key is any change to user input, practice type, or classification
    IdleCountdown(
        totalSeconds = 90,
        restartKey = listOf(points, krydser, practiceType ?: "", classification ?: ""),
        active = true,
        onTick = { idleSeconds = it },
        onTimeout = { vm.cancel(scanEventId) { onCancel() } }
    )
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Indtast skydning", style = MaterialTheme.typography.headlineSmall) },
                actions = {
                    val idAndName = memberName?.let { "$memberId – $it" } ?: memberId
                    AssistChip(onClick = {}, label = { Text(idAndName) }, enabled = false)
                    Spacer(Modifier.width(8.dp))
                    AssistChip(onClick = {}, label = { Text("${idleSeconds}s") }, enabled = false)
                }
            )
        }
    ) { pad ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(pad)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // === STEP 1: Practice Type ===
            ElevatedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            color = if (practiceType != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.primaryContainer,
                            shape = MaterialTheme.shapes.small
                        ) {
                            Text(
                                "1",
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                style = MaterialTheme.typography.titleMedium,
                                color = if (practiceType != null) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                        Spacer(Modifier.width(12.dp))
                        Text("Vælg skydningstype", style = MaterialTheme.typography.titleLarge)
                    }
                    Spacer(Modifier.height(4.dp))
                    val types = PracticeType.values().toList()
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        types.forEach { pt ->
                            FilterChip(
                                selected = practiceType == pt,
                                onClick = { practiceType = pt; classification = null },
                                label = { Text(pt.displayName, style = MaterialTheme.typography.titleMedium) },
                                modifier = Modifier.height(48.dp)
                            )
                        }
                    }
                }
            }

            // === STEP 2: Classification (only show after type selected) ===
            if (practiceType != null) {
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Surface(
                                color = if (classification != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.primaryContainer,
                                shape = MaterialTheme.shapes.small
                            ) {
                                Text(
                                    "2",
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                    style = MaterialTheme.typography.titleMedium,
                                    color = if (classification != null) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onPrimaryContainer
                                )
                            }
                            Spacer(Modifier.width(12.dp))
                            Text("Vælg klassifikation", style = MaterialTheme.typography.titleLarge)
                        }
                        Spacer(Modifier.height(4.dp))
                        val opts = optionsFor(practiceType!!)
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            opts.forEach { opt ->
                                FilterChip(
                                    selected = classification == opt,
                                    onClick = { classification = opt },
                                    label = { Text(opt, style = MaterialTheme.typography.titleMedium) },
                                    modifier = Modifier.height(48.dp)
                                )
                            }
                        }
                    }
                }
            }

            // === STEP 3: Score input (only show after classification selected) ===
            if (practiceType != null && classification != null) {
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Surface(
                                color = if (points.isNotBlank()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.primaryContainer,
                                shape = MaterialTheme.shapes.small
                            ) {
                                Text(
                                    "3",
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                    style = MaterialTheme.typography.titleMedium,
                                    color = if (points.isNotBlank()) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onPrimaryContainer
                                )
                            }
                            Spacer(Modifier.width(12.dp))
                            Text("Indtast resultat", style = MaterialTheme.typography.titleLarge)
                        }
                        Spacer(Modifier.height(4.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            OutlinedTextField(
                                value = points,
                                onValueChange = { points = it.filter { c -> c.isDigit() } },
                                label = { Text("Point") },
                                placeholder = { Text("0") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.weight(1f),
                                textStyle = MaterialTheme.typography.headlineMedium
                            )
                            OutlinedTextField(
                                value = krydser,
                                onValueChange = { krydser = it.filter { c -> c.isDigit() } },
                                label = { Text("Krydser (valgfri)") },
                                placeholder = { Text("0") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.weight(1f),
                                textStyle = MaterialTheme.typography.headlineMedium
                            )
                        }
                        vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyLarge) }
                    }
                }
            }

            // === SAVE BUTTON (only show when form is complete) ===
            if (practiceType != null && classification != null && points.isNotBlank()) {
                Button(
                    onClick = {
                        val cls = classification
                        val pt = practiceType
                        if (pt == null || cls == null || !ClassificationOptions.isValid(pt, cls)) {
                            return@Button
                        }
                        vm.save(memberId, scanEventId, pt, cls, points, krydser, onSaved)
                    },
                    enabled = !vm.saving,
                    modifier = Modifier.fillMaxWidth().height(64.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) {
                    Text(
                        if (vm.saving) "Gemmer..." else "GEM RESULTAT",
                        style = MaterialTheme.typography.titleLarge
                    )
                }
            }

            // === SECONDARY ACTIONS (always visible) ===
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                var hasHistory by remember { mutableStateOf<Boolean?>(null) }
                LaunchedEffect(memberId, practiceType) {
                    practiceType?.let { pt ->
                        hasHistory = vm.hasAnyHistoryAllClasses(memberId, pt)
                    }
                }
                OutlinedButton(
                    onClick = { showHistory = true },
                    enabled = (hasHistory == true && practiceType != null),
                    modifier = Modifier.weight(1f).height(48.dp)
                ) { Text("Mine resultater") }
                TextButton(
                    onClick = { vm.cancel(scanEventId) { onCancel() } },
                    enabled = !vm.saving,
                    modifier = Modifier.weight(1f).height(48.dp)
                ) { Text("Annuller") }
            }
        }
    }
    // IdleCountdown handles timing; no manual loop needed now.

    if (showHistory && practiceType != null) {
        val currentType = practiceType!! // Safe - checked above
        LaunchedEffect(showHistory, currentType, classification) {
            // Load across all classifications for the selected discipline
            history = vm.loadHistoryAllClasses(memberId, currentType)
        }
    ModalBottomSheet(onDismissRequest = { showHistory = false }) {
            val top3Ids = remember(history) {
                history.sortedWith(compareByDescending<PracticeSession> { it.points }
                    .thenByDescending { it.krydser ?: -1 }
                    .thenByDescending { it.createdAtUtc })
                    .take(3)
                    .map { it.id }
                    .toSet()
            }
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Text("${currentType.displayName} – Mine resultater (12 mdr.)", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                // Summary
                val total = history.size
                val best = history.maxWithOrNull(compareBy<PracticeSession> { it.points }
                    .thenBy { it.krydser ?: -1 }
                    .thenBy { it.createdAtUtc })
                if (total > 0) {
                    val bestText = best?.let { b -> "${b.points}${b.krydser?.let { "/$it" } ?: ""} (${Formatters.daDate(b.localDate)})" } ?: "—"
                    Text("Antal skydninger: ${total}", style = MaterialTheme.typography.bodyMedium)
                    Text("Bedste: ${bestText}", style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(8.dp))
                }
                if (history.isEmpty()) {
                    Text("Ingen resultater de sidste 12 måneder", style = MaterialTheme.typography.bodyMedium)
                } else {
                    // Group by classification (null/blank -> Uklassificeret)
                    val grouped = history.groupBy { it.classification?.takeIf { c -> c.isNotBlank() } ?: "Uklassificeret" }
                    LazyColumn(Modifier.fillMaxHeight(0.7f)) {
                        grouped.toSortedMap().forEach { (cls, list) ->
                            item { Text(cls, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp)) }
                            items(list) { s ->
                                val highlight = top3Ids.contains(s.id)
                                val bg = if (highlight) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface
                                Row(
                                    Modifier.fillMaxWidth().padding(vertical = 4.dp).background(bg).padding(8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(Formatters.daDate(s.localDate), style = MaterialTheme.typography.bodyMedium)
                                    val score = "${s.points}${s.krydser?.let { "/$it" } ?: ""}"
                                    Text(score, style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = { showHistory = false }) { Text("Luk") }
                }
            }
        }
    }
}
