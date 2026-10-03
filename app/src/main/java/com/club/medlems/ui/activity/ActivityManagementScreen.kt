package com.club.medlems.ui.activity

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Event
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.dao.ActivityDao
import com.club.medlems.data.dao.ActivityGuestDao
import com.club.medlems.data.dao.GuestResultDao
import com.club.medlems.data.entity.Activity
import com.club.medlems.data.entity.ActivityGuest
import com.club.medlems.data.entity.ActivityStatus
import com.club.medlems.data.entity.ActivityType
import com.club.medlems.data.entity.GuestResult
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.data.sync.SyncOutboxManager
import com.club.medlems.network.TrustManager
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

data class GuestResultListItem(
    val id: String,
    val guestId: String,
    val displayName: String,
    val clubName: String?,
    val startNumber: String?,
    val showOnDisplay: Boolean,
    val practiceType: PracticeType,
    val classification: String?,
    val points: Int,
    val krydser: Int?
)

@HiltViewModel
class ActivityManagementViewModel @Inject constructor(
    private val activityDao: ActivityDao,
    private val activityGuestDao: ActivityGuestDao,
    private val guestResultDao: GuestResultDao,
    private val syncOutboxManager: SyncOutboxManager,
    private val syncManager: SyncManager,
    private val trustManager: TrustManager
) : ViewModel() {
    val activities: StateFlow<List<Activity>> = activityDao.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val activeActivity: StateFlow<Activity?> = activityDao.observeActive()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val guests: StateFlow<List<ActivityGuest>> = activeActivity
        .flatMapLatest { activity ->
            activity?.let { activityGuestDao.observeForActivity(it.id) } ?: flowOf(emptyList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val activeResults = activeActivity
        .flatMapLatest { activity ->
            activity?.let { guestResultDao.observeForActivity(it.id) } ?: flowOf(emptyList())
        }

    val guestResults: StateFlow<List<GuestResultListItem>> = combine(
        guests,
        activeResults
    ) { guests, results ->
        val guestsById = guests.associateBy { it.id }
        results.mapNotNull { result ->
            guestsById[result.guestId]?.let { guest ->
                GuestResultListItem(
                    id = result.id,
                    guestId = guest.id,
                    displayName = guest.displayName,
                    clubName = guest.clubName,
                    startNumber = guest.startNumber,
                    showOnDisplay = guest.showOnDisplay,
                    practiceType = result.practiceType,
                    classification = result.classification,
                    points = result.points,
                    krydser = result.krydser
                )
            }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message

    fun clearMessage() {
        _message.value = null
    }

    fun createAndStart(title: String, type: ActivityType) {
        val normalizedTitle = title.trim()
        if (normalizedTitle.isBlank()) {
            _message.value = "Skriv et navn til aktiviteten"
            return
        }
        viewModelScope.launch {
            val now = Clock.System.now()
            val deviceId = trustManager.getThisDeviceId()
            completeCurrentActivity(now, deviceId)
            val activity = Activity(
                id = UUID.randomUUID().toString(),
                title = normalizedTitle,
                type = type,
                startsAtUtc = now,
                status = ActivityStatus.ACTIVE,
                displayEnabled = true,
                createdAtUtc = now,
                updatedAtUtc = now,
                deviceId = deviceId
            )
            activityDao.upsert(activity)
            syncOutboxManager.queueActivity(activity, deviceId)
            syncManager.notifyEntityChanged("Activity", activity.id)
            _message.value = "Aktiviteten er startet"
        }
    }

    fun start(activity: Activity) {
        viewModelScope.launch {
            val now = Clock.System.now()
            val deviceId = trustManager.getThisDeviceId()
            completeCurrentActivity(now, deviceId, activity.id)
            val updated = activity.copy(
                status = ActivityStatus.ACTIVE,
                startsAtUtc = now,
                endsAtUtc = null,
                updatedAtUtc = now,
                deviceId = deviceId
            )
            activityDao.upsert(updated)
            syncOutboxManager.queueActivity(updated, deviceId)
            syncManager.notifyEntityChanged("Activity", updated.id)
        }
    }

    fun complete(activity: Activity) {
        viewModelScope.launch {
            val now = Clock.System.now()
            val deviceId = trustManager.getThisDeviceId()
            val updated = activity.copy(
                status = ActivityStatus.COMPLETED,
                endsAtUtc = now,
                updatedAtUtc = now,
                deviceId = deviceId
            )
            activityDao.upsert(updated)
            syncOutboxManager.queueActivity(updated, deviceId)
            syncManager.notifyEntityChanged("Activity", updated.id)
            _message.value = "Aktiviteten er afsluttet"
        }
    }

    fun updateActivity(
        activity: Activity,
        title: String,
        type: ActivityType,
        displayEnabled: Boolean
    ) {
        val normalizedTitle = title.trim()
        if (normalizedTitle.isBlank()) {
            _message.value = "Skriv et navn til aktiviteten"
            return
        }
        viewModelScope.launch {
            val now = Clock.System.now()
            val deviceId = trustManager.getThisDeviceId()
            val updated = activity.copy(
                title = normalizedTitle,
                type = type,
                displayEnabled = displayEnabled,
                updatedAtUtc = now,
                deviceId = deviceId
            )
            activityDao.upsert(updated)
            syncOutboxManager.queueActivity(updated, deviceId)
            syncManager.notifyEntityChanged("Activity", updated.id)
            _message.value = "Aktiviteten er opdateret"
        }
    }

    fun saveGuestResult(
        displayName: String,
        clubName: String,
        startNumber: String,
        showOnDisplay: Boolean,
        practiceType: PracticeType,
        classification: String,
        points: String,
        krydser: String
    ) {
        val activity = activeActivity.value
        if (activity == null) {
            _message.value = "Start en aktivitet først"
            return
        }
        val normalizedName = displayName.trim()
        val pointsValue = points.toIntOrNull()
        val krydserValue = krydser.trim().takeIf { it.isNotEmpty() }?.toIntOrNull()
        if (normalizedName.isBlank()) {
            _message.value = "Skriv gæstens navn"
            return
        }
        if (pointsValue == null || pointsValue < 0) {
            _message.value = "Point skal være et positivt tal eller nul"
            return
        }
        if (krydserValue != null && krydserValue < 0) {
            _message.value = "Krydser skal være et positivt tal eller nul"
            return
        }

        viewModelScope.launch {
            val now = Clock.System.now()
            val deviceId = trustManager.getThisDeviceId()
            val normalizedClub = clubName.trim().takeIf { it.isNotEmpty() }
            val existingGuest = activityGuestDao.find(activity.id, normalizedName, normalizedClub)
            val guest = existingGuest?.copy(
                startNumber = startNumber.trim().takeIf { it.isNotEmpty() } ?: existingGuest.startNumber,
                showOnDisplay = showOnDisplay,
                updatedAtUtc = now,
                deviceId = deviceId
            ) ?: ActivityGuest(
                id = UUID.randomUUID().toString(),
                activityId = activity.id,
                displayName = normalizedName,
                clubName = normalizedClub,
                startNumber = startNumber.trim().takeIf { it.isNotEmpty() },
                showOnDisplay = showOnDisplay,
                createdAtUtc = now,
                updatedAtUtc = now,
                deviceId = deviceId
            )
            activityGuestDao.upsert(guest)
            syncOutboxManager.queueActivityGuest(guest, deviceId)
            syncManager.notifyEntityChanged("ActivityGuest", guest.id)

            val result = GuestResult(
                id = UUID.randomUUID().toString(),
                activityId = activity.id,
                guestId = guest.id,
                createdAtUtc = now,
                localDate = now.toLocalDateTime(TimeZone.currentSystemDefault()).date,
                practiceType = practiceType,
                points = pointsValue,
                krydser = krydserValue,
                classification = classification.trim().takeIf { it.isNotEmpty() },
                deviceId = deviceId
            )
            guestResultDao.upsert(result)
            syncOutboxManager.queueGuestResult(result, deviceId)
            syncManager.notifyEntityChanged("GuestResult", result.id)
            _message.value = "Resultatet er gemt"
        }
    }

    fun updateGuestResult(
        item: GuestResultListItem,
        displayName: String,
        clubName: String,
        startNumber: String,
        showOnDisplay: Boolean,
        practiceType: PracticeType,
        classification: String,
        points: String,
        krydser: String
    ) {
        val normalizedName = displayName.trim()
        val pointsValue = points.toIntOrNull()
        val krydserValue = krydser.trim().takeIf { it.isNotEmpty() }?.toIntOrNull()
        if (normalizedName.isBlank()) {
            _message.value = "Skriv gæstens navn"
            return
        }
        if (pointsValue == null || pointsValue < 0) {
            _message.value = "Point skal være et positivt tal eller nul"
            return
        }
        if (krydserValue != null && krydserValue < 0) {
            _message.value = "Krydser skal være et positivt tal eller nul"
            return
        }

        viewModelScope.launch {
            val guest = activityGuestDao.get(item.guestId)
            val result = guestResultDao.get(item.id)
            if (guest == null || result == null || result.deletedAtUtc != null) {
                _message.value = "Resultatet findes ikke længere"
                return@launch
            }
            val now = Clock.System.now()
            val deviceId = trustManager.getThisDeviceId()
            val updatedGuest = guest.copy(
                displayName = normalizedName,
                clubName = clubName.trim().takeIf { it.isNotEmpty() },
                startNumber = startNumber.trim().takeIf { it.isNotEmpty() },
                showOnDisplay = showOnDisplay,
                updatedAtUtc = now,
                deviceId = deviceId
            )
            val updatedResult = result.copy(
                practiceType = practiceType,
                points = pointsValue,
                krydser = krydserValue,
                classification = classification.trim().takeIf { it.isNotEmpty() },
                deviceId = deviceId
            )
            activityGuestDao.upsert(updatedGuest)
            guestResultDao.upsert(updatedResult)
            syncOutboxManager.queueActivityGuest(updatedGuest, deviceId)
            syncOutboxManager.queueGuestResult(updatedResult, deviceId)
            syncManager.notifyEntityChanged("ActivityGuest", updatedGuest.id)
            syncManager.notifyEntityChanged("GuestResult", updatedResult.id)
            _message.value = "Resultatet er opdateret"
        }
    }

    fun removeGuestResult(item: GuestResultListItem) {
        viewModelScope.launch {
            val result = guestResultDao.get(item.id)
            if (result == null || result.deletedAtUtc != null) return@launch
            val now = Clock.System.now()
            val deviceId = trustManager.getThisDeviceId()
            val removed = result.copy(deletedAtUtc = now, deviceId = deviceId)
            guestResultDao.upsert(removed)
            syncOutboxManager.queueGuestResult(removed, deviceId)
            syncManager.notifyEntityChanged("GuestResult", removed.id)
            _message.value = "Resultatet er fjernet"
        }
    }

    private suspend fun completeCurrentActivity(
        now: kotlinx.datetime.Instant,
        deviceId: String,
        exceptId: String? = null
    ) {
        val current = activityDao.active()?.takeIf { it.id != exceptId } ?: return
        val completed = current.copy(
            status = ActivityStatus.COMPLETED,
            endsAtUtc = now,
            updatedAtUtc = now,
            deviceId = deviceId
        )
        activityDao.upsert(completed)
        syncOutboxManager.queueActivity(completed, deviceId)
        syncManager.notifyEntityChanged("Activity", completed.id)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActivityManagementScreen(
    onBack: () -> Unit,
    viewModel: ActivityManagementViewModel = hiltViewModel()
) {
    val activities by viewModel.activities.collectAsState()
    val activeActivity by viewModel.activeActivity.collectAsState()
    val guestResults by viewModel.guestResults.collectAsState()
    val guests by viewModel.guests.collectAsState()
    val message by viewModel.message.collectAsState()
    var showCreateDialog by remember { mutableStateOf(false) }
    var showResultDialog by remember { mutableStateOf(false) }
    var editingActivity by remember { mutableStateOf<Activity?>(null) }
    var editingResult by remember { mutableStateOf<GuestResultListItem?>(null) }
    var removingResult by remember { mutableStateOf<GuestResultListItem?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Aktiviteter") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Tilbage")
                    }
                },
                actions = {
                    IconButton(onClick = { showCreateDialog = true }) {
                        Icon(Icons.Default.Add, contentDescription = "Opret aktivitet")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Spacer(Modifier.height(4.dp))
                ActiveActivityCard(
                    activity = activeActivity,
                    onAddGuestResult = { showResultDialog = true },
                    onEdit = { activeActivity?.let { editingActivity = it } },
                    onComplete = { activeActivity?.let(viewModel::complete) },
                    onCreate = { showCreateDialog = true }
                )
            }

            if (guestResults.isNotEmpty()) {
                item {
                    Text(
                        "Gæsteresultater",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
                items(guestResults, key = { it.id }) { result ->
                    GuestResultCard(
                        result = result,
                        onEdit = { editingResult = result },
                        onRemove = { removingResult = result }
                    )
                }
            }

            item {
                Text(
                    "Tidligere aktiviteter",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            items(activities.filter { it.id != activeActivity?.id }, key = { it.id }) { activity ->
                ActivityHistoryCard(
                    activity = activity,
                    onStart = { viewModel.start(activity) },
                    onEdit = { editingActivity = activity }
                )
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }

    if (showCreateDialog) {
        CreateActivityDialog(
            onDismiss = { showCreateDialog = false },
            onCreate = { title, type ->
                viewModel.createAndStart(title, type)
                showCreateDialog = false
            }
        )
    }
    if (showResultDialog) {
        GuestResultDialog(
            guests = guests,
            initial = null,
            onDismiss = { showResultDialog = false },
            onSave = { name, club, number, visible, type, classification, points, krydser ->
                viewModel.saveGuestResult(
                    name,
                    club,
                    number,
                    visible,
                    type,
                    classification,
                    points,
                    krydser
                )
                showResultDialog = false
            }
        )
    }
    editingActivity?.let { activity ->
        EditActivityDialog(
            activity = activity,
            onDismiss = { editingActivity = null },
            onSave = { title, type, displayEnabled ->
                viewModel.updateActivity(activity, title, type, displayEnabled)
                editingActivity = null
            }
        )
    }
    editingResult?.let { result ->
        GuestResultDialog(
            guests = guests,
            initial = result,
            onDismiss = { editingResult = null },
            onSave = { name, club, number, visible, type, classification, points, krydser ->
                viewModel.updateGuestResult(
                    result,
                    name,
                    club,
                    number,
                    visible,
                    type,
                    classification,
                    points,
                    krydser
                )
                editingResult = null
            }
        )
    }
    removingResult?.let { result ->
        AlertDialog(
            onDismissRequest = { removingResult = null },
            title = { Text("Fjern gæsteresultat?") },
            text = { Text("${result.displayName}: ${result.points} point fjernes fra aktiviteten og fællesskærmen.") },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.removeGuestResult(result)
                        removingResult = null
                    }
                ) {
                    Text("Fjern")
                }
            },
            dismissButton = {
                TextButton(onClick = { removingResult = null }) { Text("Annuller") }
            }
        )
    }
    message?.let {
        AlertDialog(
            onDismissRequest = viewModel::clearMessage,
            confirmButton = {
                TextButton(onClick = viewModel::clearMessage) { Text("OK") }
            },
            text = { Text(it) }
        )
    }
}

@Composable
private fun ActiveActivityCard(
    activity: Activity?,
    onAddGuestResult: () -> Unit,
    onEdit: () -> Unit,
    onComplete: () -> Unit,
    onCreate: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Event, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(
                    if (activity == null) "Ingen aktiv aktivitet" else "Aktiv aktivitet",
                    style = MaterialTheme.typography.labelLarge
                )
            }
            if (activity == null) {
                Text("Start en aktivitet for at samle medlems- og gæsteresultater.")
                Button(onClick = onCreate) { Text("Opret og start") }
            } else {
                Text(activity.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(activity.type.displayName())
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(onClick = onAddGuestResult) { Text("Registrer gæsteresultat") }
                    OutlinedButton(onClick = onEdit) { Text("Rediger") }
                    OutlinedButton(onClick = onComplete) { Text("Afslut") }
                }
                Text(
                    "Nye medlemsresultater knyttes automatisk til aktiviteten.",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

@Composable
private fun ActivityHistoryCard(
    activity: Activity,
    onStart: () -> Unit,
    onEdit: () -> Unit
) {
    Card(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(Modifier.weight(1f)) {
                Text(activity.title, fontWeight = FontWeight.SemiBold)
                Text(
                    "${activity.type.displayName()} · ${activity.status.displayName()}",
                    style = MaterialTheme.typography.bodySmall
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconButton(onClick = onEdit) {
                    Icon(Icons.Default.Edit, contentDescription = "Rediger aktivitet")
                }
                OutlinedButton(onClick = onStart) { Text("Start") }
            }
        }
    }
}

@Composable
private fun GuestResultCard(
    result: GuestResultListItem,
    onEdit: () -> Unit,
    onRemove: () -> Unit
) {
    Card(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text(result.displayName, fontWeight = FontWeight.SemiBold)
                Text(
                    listOfNotNull(result.clubName, result.practiceType.name, result.classification)
                        .joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    buildString {
                        append(result.points)
                        result.krydser?.let { append(" / $it X") }
                    },
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                IconButton(onClick = onEdit) {
                    Icon(Icons.Default.Edit, contentDescription = "Rediger resultat")
                }
                IconButton(onClick = onRemove) {
                    Icon(Icons.Default.Delete, contentDescription = "Fjern resultat")
                }
            }
        }
    }
}

@Composable
private fun CreateActivityDialog(
    onDismiss: () -> Unit,
    onCreate: (String, ActivityType) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var type by remember { mutableStateOf(ActivityType.OPEN_DAY) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Opret aktivitet") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Navn") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                ActivityType.entries.forEach { option ->
                    FilterChip(
                        selected = type == option,
                        onClick = { type = option },
                        label = { Text(option.displayName()) }
                    )
                }
            }
        },
        confirmButton = {
            Button(onClick = { onCreate(title, type) }, enabled = title.isNotBlank()) {
                Text("Opret og start")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuller") } }
    )
}

@Composable
private fun EditActivityDialog(
    activity: Activity,
    onDismiss: () -> Unit,
    onSave: (String, ActivityType, Boolean) -> Unit
) {
    var title by remember(activity.id) { mutableStateOf(activity.title) }
    var type by remember(activity.id) { mutableStateOf(activity.type) }
    var displayEnabled by remember(activity.id) { mutableStateOf(activity.displayEnabled) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rediger aktivitet") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Navn") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                ActivityType.entries.forEach { option ->
                    FilterChip(
                        selected = type == option,
                        onClick = { type = option },
                        label = { Text(option.displayName()) }
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(
                        checked = displayEnabled,
                        onCheckedChange = { displayEnabled = it }
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("Vis aktiviteten på fællesskærmen")
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(title, type, displayEnabled) },
                enabled = title.isNotBlank()
            ) {
                Text("Gem")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuller") } }
    )
}

@Composable
private fun GuestResultDialog(
    guests: List<ActivityGuest>,
    initial: GuestResultListItem?,
    onDismiss: () -> Unit,
    onSave: (String, String, String, Boolean, PracticeType, String, String, String) -> Unit
) {
    var name by remember(initial?.id) { mutableStateOf(initial?.displayName.orEmpty()) }
    var club by remember(initial?.id) { mutableStateOf(initial?.clubName.orEmpty()) }
    var startNumber by remember(initial?.id) { mutableStateOf(initial?.startNumber.orEmpty()) }
    var showOnDisplay by remember(initial?.id) { mutableStateOf(initial?.showOnDisplay ?: true) }
    var practiceType by remember(initial?.id) {
        mutableStateOf(initial?.practiceType ?: PracticeType.Riffel)
    }
    var classification by remember(initial?.id) {
        mutableStateOf(initial?.classification.orEmpty())
    }
    var points by remember(initial?.id) { mutableStateOf(initial?.points?.toString().orEmpty()) }
    var krydser by remember(initial?.id) {
        mutableStateOf(initial?.krydser?.toString().orEmpty())
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "Registrer gæsteresultat" else "Rediger gæsteresultat") },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (initial == null && guests.isNotEmpty()) {
                    item {
                        Text("Vælg en tidligere gæst", style = MaterialTheme.typography.labelLarge)
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            guests.forEach { guest ->
                                item {
                                    FilterChip(
                                        selected = name == guest.displayName && club == guest.clubName.orEmpty(),
                                        onClick = {
                                            name = guest.displayName
                                            club = guest.clubName.orEmpty()
                                            startNumber = guest.startNumber.orEmpty()
                                            showOnDisplay = guest.showOnDisplay
                                        },
                                        label = { Text(guest.displayName) }
                                    )
                                }
                            }
                        }
                    }
                }
                item {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Navn til resultatlisten") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    OutlinedTextField(
                        value = club,
                        onValueChange = { club = it },
                        label = { Text("Klub (valgfri)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    OutlinedTextField(
                        value = startNumber,
                        onValueChange = { startNumber = it },
                        label = { Text("Startnummer (valgfrit)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Switch(checked = showOnDisplay, onCheckedChange = { showOnDisplay = it })
                        Spacer(Modifier.width(8.dp))
                        Text("Vis på fællesskærmen")
                    }
                }
                item {
                    Text("Disciplin", style = MaterialTheme.typography.labelLarge)
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        PracticeType.entries.forEach { option ->
                            item {
                                FilterChip(
                                    selected = practiceType == option,
                                    onClick = { practiceType = option },
                                    label = { Text(option.name) }
                                )
                            }
                        }
                    }
                }
                item {
                    OutlinedTextField(
                        value = classification,
                        onValueChange = { classification = it },
                        label = { Text("Klasse (valgfri)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = points,
                            onValueChange = { if (it.all(Char::isDigit)) points = it },
                            label = { Text("Point") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = krydser,
                            onValueChange = { if (it.all(Char::isDigit)) krydser = it },
                            label = { Text("Krydser") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSave(
                        name,
                        club,
                        startNumber,
                        showOnDisplay,
                        practiceType,
                        classification,
                        points,
                        krydser
                    )
                },
                enabled = name.isNotBlank() && points.toIntOrNull() != null
            ) {
                Text(if (initial == null) "Gem resultat" else "Gem ændringer")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuller") } }
    )
}

private fun ActivityType.displayName(): String = when (this) {
    ActivityType.OPEN_DAY -> "Åbent hus"
    ActivityType.COMPETITION -> "Konkurrence"
    ActivityType.TRAINING -> "Træningsaktivitet"
    ActivityType.OTHER -> "Andet"
}

private fun ActivityStatus.displayName(): String = when (this) {
    ActivityStatus.DRAFT -> "Kladde"
    ActivityStatus.ACTIVE -> "Aktiv"
    ActivityStatus.COMPLETED -> "Afsluttet"
}
