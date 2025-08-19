package com.club.medlems.ui.attendant

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.ui.common.Formatters
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import javax.inject.Inject

@HiltViewModel
class EditSessionsViewModel @Inject constructor(
    private val sessionDao: PracticeSessionDao,
    private val memberDao: MemberDao
): androidx.lifecycle.ViewModel() {
    var loading by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    suspend fun memberName(memberId: String): String? = memberDao.get(memberId)?.let { "${it.firstName} ${it.lastName}".trim().ifBlank { null } }

    suspend fun load(memberId: String): List<PracticeSession> {
        loading = true; error = null
        val end = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        val start = kotlinx.datetime.LocalDate(end.year - 1, end.month, end.dayOfMonth)
        return try {
            sessionDao.sessionsForMemberInRange(memberId, start, end).also { loading = false }
        } catch (t: Throwable) {
            error = t.message; loading = false; emptyList()
        }
    }

    suspend fun loadRange(memberId: String, start: kotlinx.datetime.LocalDate, end: kotlinx.datetime.LocalDate): List<PracticeSession> {
        loading = true; error = null
        return try {
            sessionDao.sessionsForMemberInRange(memberId, start, end).also { loading = false }
        } catch (t: Throwable) {
            error = t.message; loading = false; emptyList()
        }
    }

    suspend fun save(session: PracticeSession) {
        sessionDao.update(session.copy())
    }

    suspend fun remove(session: PracticeSession) {
        sessionDao.delete(session)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditSessionsScreen(
    memberId: String,
    onBack: () -> Unit,
    vm: EditSessionsViewModel = hiltViewModel()
) {
    var name by remember { mutableStateOf<String?>(null) }
    var list by remember { mutableStateOf<List<PracticeSession>>(emptyList()) }
    var start by remember { mutableStateOf<kotlinx.datetime.LocalDate?>(null) }
    var end by remember { mutableStateOf<kotlinx.datetime.LocalDate?>(null) }
    var editing by remember { mutableStateOf<PracticeSession?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(memberId) {
        name = vm.memberName(memberId)
        list = vm.load(memberId)
        // default range = last 12 months
        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        end = today
        start = kotlinx.datetime.LocalDate(today.year - 1, today.month, today.dayOfMonth)
    }
    Scaffold(topBar = {
        TopAppBar(title = { Text("Redigér skydninger for ${name?.let { "$memberId – $it" } ?: memberId}") }, navigationIcon = {
            TextButton(onClick = onBack) { Text("Tilbage") }
        })
    }) { pad ->
        Column(Modifier.fillMaxSize().padding(pad).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            // Date range quick filters
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
                    val s = kotlinx.datetime.LocalDate(today.year, today.month, 1)
                    val e = today
                    start = s; end = e
                    scope.launch { list = vm.loadRange(memberId, s, e) }
                }) { Text("Denne måned") }
                Button(onClick = {
                    val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
                    val e = today
                    val s = kotlinx.datetime.LocalDate(today.year - 1, today.month, today.dayOfMonth)
                    start = s; end = e
                    scope.launch { list = vm.loadRange(memberId, s, e) }
                }) { Text("Sidste 12 mdr.") }
            }
             if (vm.error != null) Text(vm.error!!, color = MaterialTheme.colorScheme.error)
             if (vm.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
             if (list.isEmpty() && !vm.loading) Text("Ingen skydninger de sidste 12 måneder")
             LazyColumn(Modifier.fillMaxSize()) {
                 items(list) { s ->
                    ElevatedCard(onClick = { editing = s }, modifier = Modifier.fillMaxWidth()) {
                         Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                             Text("${s.practiceType} ${s.classification ?: "Uklassificeret"}", style = MaterialTheme.typography.titleSmall)
                             Text("${Formatters.daDate(s.localDate)} – ${s.points}${s.krydser?.let { "/$it" } ?: ""}")
                         }
                     }
                 }
             }
        }
    }
    editing?.let { sess ->
        var points by remember(sess) { mutableStateOf(sess.points.toString()) }
        var krydser by remember(sess) { mutableStateOf(sess.krydser?.toString() ?: "") }
        var cls by remember(sess) { mutableStateOf(sess.classification ?: "") }
        var type by remember(sess) { mutableStateOf(sess.practiceType) }
        AlertDialog(
            onDismissRequest = { editing = null },
            confirmButton = {
                TextButton(onClick = {
                    val p = points.toIntOrNull()?.coerceAtLeast(0) ?: 0
                    val k = krydser.toIntOrNull()?.coerceAtLeast(0)
                    val c = cls.ifBlank { null }
                    val updated = sess.copy(points = p, krydser = k, classification = c, practiceType = type, source = com.club.medlems.data.entity.SessionSource.attendant)
                    scope.launch {
                        vm.save(updated)
                        // Refresh list
                        val s = start ?: sess.localDate
                        val e = end ?: sess.localDate
                        list = vm.loadRange(memberId, s, e)
                         editing = null
                     }
                 }) { Text("Gem") }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { editing = null }) { Text("Annuller") }
                    TextButton(onClick = {
                        // Confirm delete inline
                        scope.launch {
                            vm.remove(sess)
                            val s = start ?: sess.localDate
                            val e = end ?: sess.localDate
                            list = vm.loadRange(memberId, s, e)
                            editing = null
                        }
                    }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Slet") }
                }
            },
            title = { Text("Redigér skydning") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    // Type selection
                    val types = PracticeType.values()
                    var expanded by remember { mutableStateOf(false) }
                    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
                        OutlinedTextField(value = type.name, onValueChange = {}, readOnly = true, label = { Text("Disciplin") }, modifier = Modifier.menuAnchor())
                        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                            types.forEach { t -> DropdownMenuItem(text = { Text(t.name) }, onClick = { type = t; expanded = false }) }
                        }
                    }
                    OutlinedTextField(value = cls, onValueChange = { cls = it }, label = { Text("Klassifikation (valgfri)") })
                    OutlinedTextField(value = points, onValueChange = { points = it.filter { ch -> ch.isDigit() } }, label = { Text("Point") })
                    OutlinedTextField(value = krydser, onValueChange = { krydser = it.filter { ch -> ch.isDigit() } }, label = { Text("Krydser (valgfri)") })
                }
            }
        )
    }
}
