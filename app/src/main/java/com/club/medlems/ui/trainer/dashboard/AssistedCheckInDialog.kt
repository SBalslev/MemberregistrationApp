package com.club.medlems.ui.trainer.dashboard

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.club.medlems.data.dao.CheckInDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberStatus
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.data.entity.SessionSource
import com.club.medlems.data.sync.SyncOutboxManager
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.domain.ClassificationOptions
import com.club.medlems.domain.prefs.LastClassificationStore
import com.club.medlems.network.TrustManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import java.io.File
import java.util.UUID
import javax.inject.Inject

/**
 * State for the assisted check-in dialog.
 */
data class AssistedCheckInState(
    val searchQuery: String = "",
    val searchResults: List<Member> = emptyList(),
    val selectedMember: Member? = null,
    val isSearching: Boolean = false,
    val isCheckingIn: Boolean = false,
    val checkInResult: CheckInResult? = null,
    val errorMessage: String? = null,
    // Practice session fields
    val showPracticeForm: Boolean = false,
    val selectedPracticeType: PracticeType = PracticeType.Riffel,
    val selectedClassification: String? = null,
    val practicePoints: String = "",
    val isSavingSession: Boolean = false,
    val sessionSaved: Boolean = false
)

sealed class CheckInResult {
    data class Success(val memberName: String, val isFirstToday: Boolean) : CheckInResult()
    data class AlreadyCheckedIn(val memberName: String) : CheckInResult()
}

/**
 * ViewModel for assisted check-in functionality.
 */
@HiltViewModel
class AssistedCheckInViewModel @Inject constructor(
    private val memberDao: MemberDao,
    private val checkInDao: CheckInDao,
    private val practiceSessionDao: PracticeSessionDao,
    private val syncOutboxManager: SyncOutboxManager,
    private val syncManager: SyncManager,
    private val trustManager: TrustManager,
    private val lastClassificationStore: LastClassificationStore
) : ViewModel() {

    private val _state = MutableStateFlow(AssistedCheckInState())
    val state: StateFlow<AssistedCheckInState> = _state.asStateFlow()

    fun onSearchQueryChanged(query: String) {
        _state.value = _state.value.copy(searchQuery = query)

        if (query.length >= 2) {
            viewModelScope.launch {
                _state.value = _state.value.copy(isSearching = true)
                val today = Clock.System.now()
                    .toLocalDateTime(TimeZone.currentSystemDefault())
                    .date
                val results = memberDao.searchByNameOrIdExcludingCheckedIn(query, today)
                _state.value = _state.value.copy(
                    searchResults = results,
                    isSearching = false
                )
            }
        } else {
            _state.value = _state.value.copy(searchResults = emptyList())
        }
    }

    fun selectMember(member: Member) {
        _state.value = _state.value.copy(selectedMember = member)
    }

    fun clearSelection() {
        _state.value = _state.value.copy(selectedMember = null, checkInResult = null)
    }

    fun performCheckIn() {
        val member = _state.value.selectedMember ?: return

        viewModelScope.launch {
            _state.value = _state.value.copy(isCheckingIn = true, errorMessage = null)

            try {
                val today = Clock.System.now()
                    .toLocalDateTime(TimeZone.currentSystemDefault())
                    .date
                val memberName = "${member.firstName} ${member.lastName}".trim()

                // Check if already checked in today
                val existingCheckIn = checkInDao.firstForDate(member.internalId, today)

                if (existingCheckIn != null) {
                    _state.value = _state.value.copy(
                        isCheckingIn = false,
                        checkInResult = CheckInResult.AlreadyCheckedIn(memberName)
                    )
                    return@launch
                }

                // Create check-in
                val checkIn = CheckIn(
                    id = UUID.randomUUID().toString(),
                    internalMemberId = member.internalId,
                    membershipId = member.membershipId,
                    localDate = today,
                    firstOfDayFlag = true,
                    createdAtUtc = Clock.System.now(),
                    syncVersion = 0,
                    syncedAtUtc = null
                )

                checkInDao.insert(checkIn)

                // Queue for sync
                syncOutboxManager.queueCheckIn(checkIn, trustManager.getThisDeviceId())
                syncManager.notifyEntityChanged("CheckIn", checkIn.id)

                _state.value = _state.value.copy(
                    isCheckingIn = false,
                    checkInResult = CheckInResult.Success(memberName, isFirstToday = true)
                )

            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isCheckingIn = false,
                    errorMessage = "Fejl: ${e.message}"
                )
            }
        }
    }

    fun reset() {
        _state.value = AssistedCheckInState()
    }

    // Practice session methods
    fun showPracticeForm() {
        val member = _state.value.selectedMember ?: return
        val (lastType, lastClassification) = lastClassificationStore.get(member.internalId)
        _state.value = _state.value.copy(
            showPracticeForm = true,
            selectedPracticeType = lastType ?: PracticeType.Riffel,
            selectedClassification = lastClassification
        )
    }

    fun hidePracticeForm() {
        _state.value = _state.value.copy(showPracticeForm = false, practicePoints = "")
    }

    fun selectPracticeType(type: PracticeType) {
        _state.value = _state.value.copy(
            selectedPracticeType = type,
            selectedClassification = null
        )
    }

    fun selectClassification(classification: String) {
        _state.value = _state.value.copy(selectedClassification = classification)
    }

    fun onPointsChanged(points: String) {
        // Only allow digits
        if (points.isEmpty() || points.all { it.isDigit() }) {
            _state.value = _state.value.copy(practicePoints = points)
        }
    }

    fun savePracticeSession() {
        val member = _state.value.selectedMember ?: return

        viewModelScope.launch {
            _state.value = _state.value.copy(isSavingSession = true)

            try {
                val today = Clock.System.now()
                    .toLocalDateTime(TimeZone.currentSystemDefault())
                    .date
                val points = _state.value.practicePoints.toIntOrNull() ?: 0

                // Save last selection for this member
                lastClassificationStore.set(
                    member.internalId,
                    _state.value.selectedPracticeType,
                    _state.value.selectedClassification
                )

                val session = PracticeSession(
                    id = UUID.randomUUID().toString(),
                    internalMemberId = member.internalId,
                    membershipId = member.membershipId,
                    createdAtUtc = Clock.System.now(),
                    localDate = today,
                    practiceType = _state.value.selectedPracticeType,
                    points = points,
                    krydser = null,
                    classification = _state.value.selectedClassification,
                    source = SessionSource.attendant,
                    deviceId = trustManager.getThisDeviceId(),
                    syncVersion = 0,
                    syncedAtUtc = null
                )

                practiceSessionDao.insert(session)

                // Queue for sync
                syncOutboxManager.queuePracticeSession(session, trustManager.getThisDeviceId())
                syncManager.notifyEntityChanged("PracticeSession", session.id)

                _state.value = _state.value.copy(
                    isSavingSession = false,
                    sessionSaved = true,
                    showPracticeForm = false
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isSavingSession = false,
                    errorMessage = "Kunne ikke gemme skydning: ${e.message}"
                )
            }
        }
    }
}

/**
 * Dialog for trainer-assisted member check-in.
 *
 * Allows trainer to search for a member by name or ID,
 * confirm the member with their photo, and record a check-in.
 */
@Composable
fun AssistedCheckInDialog(
    onDismiss: () -> Unit,
    onCheckInComplete: () -> Unit,
    viewModel: AssistedCheckInViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    // Auto-dismiss after successful check-in (unless adding practice session)
    // Longer timeout (5s) gives users time to read and optionally add a practice session
    LaunchedEffect(state.checkInResult, state.showPracticeForm, state.sessionSaved) {
        if (state.checkInResult is CheckInResult.Success && !state.showPracticeForm) {
            kotlinx.coroutines.delay(if (state.sessionSaved) 3000 else 5000)
            viewModel.reset()
            onCheckInComplete()
        }
    }

    Dialog(
        onDismissRequest = {
            viewModel.reset()
            onDismiss()
        },
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true
        )
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .fillMaxHeight(0.8f),
            shape = MaterialTheme.shapes.extraLarge,
            tonalElevation = 6.dp
        ) {
            Column(
                modifier = Modifier.padding(24.dp)
            ) {
                // Title
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Check-in medlem",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                    IconButton(onClick = {
                        viewModel.reset()
                        onDismiss()
                    }) {
                        Icon(Icons.Default.Close, contentDescription = "Luk")
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Show result or search
                when (val result = state.checkInResult) {
                    is CheckInResult.Success -> {
                        // Success view
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer
                            )
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(
                                    Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    modifier = Modifier.size(64.dp),
                                    tint = MaterialTheme.colorScheme.primary
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                Text(
                                    text = if (state.sessionSaved) "Check-in og skydning gemt!" else "Check-in gennemført!",
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = result.memberName,
                                    style = MaterialTheme.typography.titleLarge
                                )
                            }
                        }

                        // Practice session form or button
                        if (!state.sessionSaved) {
                            Spacer(modifier = Modifier.height(16.dp))

                            if (state.showPracticeForm) {
                                // Practice session form
                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.surfaceVariant
                                    )
                                ) {
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(16.dp)
                                    ) {
                                        Text(
                                            text = "Tilføj skydning",
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold
                                        )
                                        Spacer(modifier = Modifier.height(16.dp))

                                        // Practice type selector
                                        Text(
                                            text = "Type",
                                            style = MaterialTheme.typography.labelMedium
                                        )
                                        Spacer(modifier = Modifier.height(8.dp))
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            PracticeType.entries.forEach { type ->
                                                FilterChip(
                                                    selected = state.selectedPracticeType == type,
                                                    onClick = { viewModel.selectPracticeType(type) },
                                                    label = { Text(type.name) }
                                                )
                                            }
                                        }

                                        // Classification selector
                                        val classificationOptions = ClassificationOptions.optionsFor(state.selectedPracticeType)
                                        if (classificationOptions.isNotEmpty()) {
                                            Spacer(modifier = Modifier.height(16.dp))
                                            Text(
                                                text = "Klassifikation",
                                                style = MaterialTheme.typography.labelMedium
                                            )
                                            Spacer(modifier = Modifier.height(8.dp))
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .horizontalScroll(rememberScrollState()),
                                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                                            ) {
                                                classificationOptions.forEach { option ->
                                                    FilterChip(
                                                        selected = state.selectedClassification == option,
                                                        onClick = { viewModel.selectClassification(option) },
                                                        label = { Text(option) }
                                                    )
                                                }
                                            }
                                        }

                                        Spacer(modifier = Modifier.height(16.dp))

                                        // Points input
                                        OutlinedTextField(
                                            value = state.practicePoints,
                                            onValueChange = { viewModel.onPointsChanged(it) },
                                            label = { Text("Point (valgfrit)") },
                                            modifier = Modifier.fillMaxWidth(),
                                            singleLine = true,
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                                        )

                                        Spacer(modifier = Modifier.height(16.dp))

                                        // Buttons
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            OutlinedButton(
                                                onClick = { viewModel.hidePracticeForm() },
                                                modifier = Modifier.weight(1f)
                                            ) {
                                                Text("Annuller")
                                            }
                                            Button(
                                                onClick = { viewModel.savePracticeSession() },
                                                modifier = Modifier.weight(1f),
                                                enabled = !state.isSavingSession && state.selectedClassification != null
                                            ) {
                                                if (state.isSavingSession) {
                                                    CircularProgressIndicator(
                                                        modifier = Modifier.size(16.dp),
                                                        strokeWidth = 2.dp
                                                    )
                                                } else {
                                                    Text("Gem skydning")
                                                }
                                            }
                                        }
                                    }
                                }
                            } else {
                                // Add practice session button
                                OutlinedButton(
                                    onClick = { viewModel.showPracticeForm() },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Icon(
                                        Icons.Default.Add,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Tilføj skydning")
                                }
                            }
                        }
                    }

                    is CheckInResult.AlreadyCheckedIn -> {
                        // Already checked in view
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.secondaryContainer
                            )
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(
                                    Icons.Default.Info,
                                    contentDescription = null,
                                    modifier = Modifier.size(64.dp),
                                    tint = MaterialTheme.colorScheme.secondary
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                Text(
                                    text = "Allerede tjekket ind",
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = result.memberName,
                                    style = MaterialTheme.typography.titleLarge
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "er allerede tjekket ind i dag",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        Button(
                            onClick = { viewModel.clearSelection() },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Søg efter et andet medlem")
                        }
                    }

                    null -> {
                        // Selected member confirmation or search
                        if (state.selectedMember != null) {
                            val member = state.selectedMember!!
                            val photoPath = member.registrationPhotoPath

                            // Confirmation view
                            Card(
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    // Photo
                                    Card(
                                        modifier = Modifier.size(150.dp),
                                        shape = MaterialTheme.shapes.medium
                                    ) {
                                        if (photoPath != null) {
                                            AsyncImage(
                                                model = ImageRequest.Builder(context)
                                                    .data(File(photoPath))
                                                    .crossfade(true)
                                                    .build(),
                                                contentDescription = "Medlemsbillede",
                                                contentScale = ContentScale.Crop,
                                                modifier = Modifier.fillMaxSize()
                                            )
                                        } else {
                                            Box(
                                                modifier = Modifier.fillMaxSize(),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Icon(
                                                    Icons.Default.Person,
                                                    contentDescription = null,
                                                    modifier = Modifier.size(64.dp),
                                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }
                                        }
                                    }

                                    Spacer(modifier = Modifier.height(16.dp))

                                    Text(
                                        text = "${member.firstName} ${member.lastName}",
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Bold
                                    )

                                    Text(
                                        text = member.membershipId ?: "Prøvemedlem",
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(16.dp))

                            if (state.errorMessage != null) {
                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.errorContainer
                                    )
                                ) {
                                    Text(
                                        text = state.errorMessage!!,
                                        modifier = Modifier.padding(12.dp),
                                        color = MaterialTheme.colorScheme.onErrorContainer
                                    )
                                }
                                Spacer(modifier = Modifier.height(16.dp))
                            }

                            Text(
                                text = "Er dette det rigtige medlem?",
                                style = MaterialTheme.typography.bodyLarge
                            )

                            Spacer(modifier = Modifier.height(16.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                OutlinedButton(
                                    onClick = { viewModel.clearSelection() },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Nej, søg igen")
                                }

                                Button(
                                    onClick = { viewModel.performCheckIn() },
                                    modifier = Modifier.weight(1f),
                                    enabled = !state.isCheckingIn
                                ) {
                                    if (state.isCheckingIn) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(20.dp),
                                            strokeWidth = 2.dp
                                        )
                                    } else {
                                        Icon(
                                            Icons.Default.CheckCircle,
                                            contentDescription = null,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Ja, check ind")
                                    }
                                }
                            }
                        } else {
                            // Search view
                            OutlinedTextField(
                                value = state.searchQuery,
                                onValueChange = viewModel::onSearchQueryChanged,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .focusRequester(focusRequester),
                                placeholder = { Text("Søg efter navn eller medlemsnummer...") },
                                leadingIcon = {
                                    Icon(Icons.Default.Search, contentDescription = null)
                                },
                                trailingIcon = {
                                    if (state.searchQuery.isNotEmpty()) {
                                        IconButton(onClick = { viewModel.onSearchQueryChanged("") }) {
                                            Icon(Icons.Default.Clear, contentDescription = "Ryd")
                                        }
                                    }
                                },
                                singleLine = true
                            )

                            Spacer(modifier = Modifier.height(16.dp))

                            // Search results
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .weight(1f)
                            ) {
                                when {
                                    state.searchQuery.length < 2 -> {
                                        Column(
                                            modifier = Modifier.fillMaxSize(),
                                            horizontalAlignment = Alignment.CenterHorizontally,
                                            verticalArrangement = Arrangement.Center
                                        ) {
                                            Icon(
                                                Icons.Default.Search,
                                                contentDescription = null,
                                                modifier = Modifier.size(48.dp),
                                                tint = MaterialTheme.colorScheme.outline
                                            )
                                            Spacer(modifier = Modifier.height(12.dp))
                                            Text(
                                                "Indtast mindst 2 tegn for at søge",
                                                style = MaterialTheme.typography.bodyLarge,
                                                color = MaterialTheme.colorScheme.outline
                                            )
                                        }
                                    }

                                    state.isSearching -> {
                                        Box(
                                            modifier = Modifier.fillMaxSize(),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            CircularProgressIndicator()
                                        }
                                    }

                                    state.searchResults.isEmpty() -> {
                                        Column(
                                            modifier = Modifier.fillMaxSize(),
                                            horizontalAlignment = Alignment.CenterHorizontally,
                                            verticalArrangement = Arrangement.Center
                                        ) {
                                            Icon(
                                                Icons.Default.PersonOff,
                                                contentDescription = null,
                                                modifier = Modifier.size(48.dp),
                                                tint = MaterialTheme.colorScheme.outline
                                            )
                                            Spacer(modifier = Modifier.height(12.dp))
                                            Text(
                                                "Ingen medlemmer fundet",
                                                style = MaterialTheme.typography.bodyLarge,
                                                color = MaterialTheme.colorScheme.outline
                                            )
                                            Spacer(modifier = Modifier.height(8.dp))
                                            Text(
                                                "Prøv at søge på fornavn, efternavn eller medlemsnummer",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.7f)
                                            )
                                        }
                                    }

                                    else -> {
                                        LazyColumn(
                                            verticalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            items(state.searchResults, key = { it.internalId }) { member ->
                                                MemberSearchResultCard(
                                                    member = member,
                                                    onClick = { viewModel.selectMember(member) }
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MemberSearchResultCard(
    member: Member,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val isActive = member.status == MemberStatus.ACTIVE

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = isActive, onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = if (isActive) {
                MaterialTheme.colorScheme.surface
            } else {
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
            }
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Photo thumbnail
            Card(
                modifier = Modifier.size(48.dp),
                shape = MaterialTheme.shapes.small
            ) {
                if (member.registrationPhotoPath != null) {
                    AsyncImage(
                        model = ImageRequest.Builder(context)
                            .data(File(member.registrationPhotoPath))
                            .crossfade(true)
                            .build(),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.Person,
                            contentDescription = null,
                            modifier = Modifier.size(24.dp),
                            tint = if (isActive) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.outline
                            }
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${member.firstName} ${member.lastName}".trim().ifEmpty { "Ukendt" },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = member.membershipId ?: "Prøvemedlem",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (!isActive) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Inaktiv - kan ikke tjekke ind",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }

            if (isActive) {
                Icon(
                    Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
