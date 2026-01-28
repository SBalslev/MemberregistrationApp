package com.club.medlems.ui.trainer.dashboard

import android.util.Base64
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.entity.Member
import com.club.medlems.data.sync.SyncOutboxManager
import com.club.medlems.data.sync.OutboxOperation
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.network.TrustManager
import com.club.medlems.util.BirthDateValidator
import com.club.medlems.util.BirthDateValidationResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import java.io.File
import java.util.concurrent.Executors
import javax.inject.Inject

/**
 * UI state for the trial member detail screen.
 */
data class TrialMemberDetailState(
    val member: Member? = null,
    val displayName: String = "",
    val age: Int? = null,
    val isAdult: Boolean = false,
    val hasProfilePhoto: Boolean = false,
    val hasIdPhoto: Boolean = false,
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
    val showProfileCamera: Boolean = false,
    val showIdCamera: Boolean = false,
    val isSaving: Boolean = false,
    val saveSuccess: Boolean = false
)

/**
 * ViewModel for the trial member detail screen.
 */
@HiltViewModel
class TrialMemberDetailViewModel @Inject constructor(
    private val memberDao: MemberDao,
    private val syncOutboxManager: SyncOutboxManager,
    private val syncManager: SyncManager,
    private val trustManager: TrustManager
) : ViewModel() {

    private val _state = MutableStateFlow(TrialMemberDetailState())
    val state: StateFlow<TrialMemberDetailState> = _state.asStateFlow()

    private var currentMemberId: String? = null

    fun loadMember(internalId: String) {
        currentMemberId = internalId
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, errorMessage = null)
            try {
                val member = memberDao.getByInternalId(internalId)
                if (member != null) {
                    val birthDateStr = member.birthDate?.toString()
                    val validationResult = if (birthDateStr != null) {
                        BirthDateValidator.validate(birthDateStr)
                    } else null
                    val age = when (validationResult) {
                        is BirthDateValidationResult.Valid -> validationResult.age
                        else -> null
                    }
                    val isAdult = age != null && age >= 18

                    _state.value = _state.value.copy(
                        member = member,
                        displayName = listOfNotNull(member.firstName, member.lastName).joinToString(" "),
                        age = age,
                        isAdult = isAdult,
                        hasProfilePhoto = member.registrationPhotoPath != null,
                        hasIdPhoto = member.idPhotoPath != null,
                        isLoading = false
                    )
                } else {
                    _state.value = _state.value.copy(
                        isLoading = false,
                        errorMessage = "Medlem ikke fundet"
                    )
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    errorMessage = "Fejl ved indlæsning: ${e.message}"
                )
            }
        }
    }

    fun showProfileCamera() {
        _state.value = _state.value.copy(showProfileCamera = true)
    }

    fun showIdCamera() {
        _state.value = _state.value.copy(showIdCamera = true)
    }

    fun hideCamera() {
        _state.value = _state.value.copy(showProfileCamera = false, showIdCamera = false)
    }

    fun onProfilePhotoTaken(photoPath: String) {
        viewModelScope.launch {
            val member = _state.value.member ?: return@launch
            _state.value = _state.value.copy(isSaving = true, showProfileCamera = false)

            try {
                val now = Clock.System.now()
                val updatedMember = member.copy(
                    registrationPhotoPath = photoPath,
                    updatedAtUtc = now
                )

                withContext(Dispatchers.IO) {
                    memberDao.upsert(updatedMember)

                    // Encode photo for sync
                    val photoBase64 = try {
                        val photoFile = File(photoPath)
                        if (photoFile.exists()) {
                            Base64.encodeToString(photoFile.readBytes(), Base64.NO_WRAP)
                        } else null
                    } catch (e: Exception) { null }

                    // Queue for sync
                    syncOutboxManager.queueMember(
                        updatedMember,
                        trustManager.getThisDeviceId(),
                        OutboxOperation.UPDATE,
                        photoBase64 = photoBase64
                    )
                    syncManager.notifyEntityChanged("Member", updatedMember.internalId)
                }

                _state.value = _state.value.copy(
                    member = updatedMember,
                    hasProfilePhoto = true,
                    isSaving = false,
                    saveSuccess = true
                )

                // Reset success flag after delay
                kotlinx.coroutines.delay(2000)
                _state.value = _state.value.copy(saveSuccess = false)

            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isSaving = false,
                    errorMessage = "Fejl ved gemning: ${e.message}"
                )
            }
        }
    }

    fun onIdPhotoTaken(photoPath: String) {
        viewModelScope.launch {
            val member = _state.value.member ?: return@launch
            _state.value = _state.value.copy(isSaving = true, showIdCamera = false)

            try {
                val now = Clock.System.now()
                val updatedMember = member.copy(
                    idPhotoPath = photoPath,
                    updatedAtUtc = now
                )

                withContext(Dispatchers.IO) {
                    memberDao.upsert(updatedMember)

                    // Encode both photos for sync
                    val photoBase64 = try {
                        member.registrationPhotoPath?.let { path ->
                            val photoFile = File(path)
                            if (photoFile.exists()) {
                                Base64.encodeToString(photoFile.readBytes(), Base64.NO_WRAP)
                            } else null
                        }
                    } catch (e: Exception) { null }

                    val idPhotoBase64 = try {
                        val idPhotoFile = File(photoPath)
                        if (idPhotoFile.exists()) {
                            Base64.encodeToString(idPhotoFile.readBytes(), Base64.NO_WRAP)
                        } else null
                    } catch (e: Exception) { null }

                    // Queue for sync
                    syncOutboxManager.queueMember(
                        updatedMember,
                        trustManager.getThisDeviceId(),
                        OutboxOperation.UPDATE,
                        photoBase64 = photoBase64,
                        idPhotoBase64 = idPhotoBase64
                    )
                    syncManager.notifyEntityChanged("Member", updatedMember.internalId)
                }

                _state.value = _state.value.copy(
                    member = updatedMember,
                    hasIdPhoto = true,
                    isSaving = false,
                    saveSuccess = true
                )

                // Reset success flag after delay
                kotlinx.coroutines.delay(2000)
                _state.value = _state.value.copy(saveSuccess = false)

            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isSaving = false,
                    errorMessage = "Fejl ved gemning: ${e.message}"
                )
            }
        }
    }

    fun clearError() {
        _state.value = _state.value.copy(errorMessage = null)
    }
}

/**
 * Trial member detail screen with photo viewing and retake functionality.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrialMemberDetailScreen(
    memberId: String,
    onBack: () -> Unit,
    viewModel: TrialMemberDetailViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(memberId) {
        viewModel.loadMember(memberId)
    }

    // Camera overlay for retaking photos
    if (state.showProfileCamera || state.showIdCamera) {
        CameraOverlay(
            isProfilePhoto = state.showProfileCamera,
            onPhotoTaken = { path ->
                if (state.showProfileCamera) {
                    viewModel.onProfilePhotoTaken(path)
                } else {
                    viewModel.onIdPhotoTaken(path)
                }
            },
            onCancel = { viewModel.hideCamera() }
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Prøvemedlem") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Tilbage")
                    }
                }
            )
        }
    ) { padding ->
        if (state.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else if (state.errorMessage != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = state.errorMessage!!,
                        color = MaterialTheme.colorScheme.error
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = { viewModel.loadMember(memberId) }) {
                        Text("Prøv igen")
                    }
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp)
            ) {
                // Success message
                if (state.saveSuccess) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer
                        )
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Billede gemt og synkroniseret")
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                }

                // Member info card
                ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = state.displayName,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        // Age and type
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            if (state.age != null) {
                                AssistChip(
                                    onClick = { },
                                    label = { Text("${state.age} år") },
                                    leadingIcon = {
                                        Icon(
                                            Icons.Default.Person,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                )
                            }

                            AssistChip(
                                onClick = { },
                                label = {
                                    Text(if (state.isAdult) "Voksen" else "Barn")
                                },
                                colors = AssistChipDefaults.assistChipColors(
                                    containerColor = if (state.isAdult) {
                                        MaterialTheme.colorScheme.tertiaryContainer
                                    } else {
                                        MaterialTheme.colorScheme.secondaryContainer
                                    }
                                )
                            )
                        }

                        // Contact info
                        state.member?.let { member ->
                            Spacer(modifier = Modifier.height(12.dp))
                            HorizontalDivider()
                            Spacer(modifier = Modifier.height(12.dp))

                            if (!member.email.isNullOrBlank()) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        Icons.Default.Email,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = member.email,
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                            }

                            if (!member.phone.isNullOrBlank()) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        Icons.Default.Phone,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = member.phone,
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Profile Photo Section
                PhotoSection(
                    title = "Profilbillede",
                    photoPath = state.member?.registrationPhotoPath,
                    hasPhoto = state.hasProfilePhoto,
                    onRetake = { viewModel.showProfileCamera() },
                    isSaving = state.isSaving
                )

                Spacer(modifier = Modifier.height(24.dp))

                // ID Photo Section (adults only)
                if (state.isAdult) {
                    PhotoSection(
                        title = "ID-billede",
                        photoPath = state.member?.idPhotoPath,
                        hasPhoto = state.hasIdPhoto,
                        onRetake = { viewModel.showIdCamera() },
                        isSaving = state.isSaving,
                        showWarning = !state.hasIdPhoto
                    )
                } else {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Info,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = "ID-billede kræves ikke for børn",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PhotoSection(
    title: String,
    photoPath: String?,
    hasPhoto: Boolean,
    onRetake: () -> Unit,
    isSaving: Boolean,
    showWarning: Boolean = false
) {
    val context = LocalContext.current
    var showConfirmDialog by remember { mutableStateOf(false) }
    var showEnlargedPhoto by remember { mutableStateOf(false) }

    // Confirmation dialog before retaking existing photo
    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            title = { Text("Erstat billede?") },
            text = { Text("Er du sikker på, at du vil tage et nyt $title? Det eksisterende billede vil blive erstattet.") },
            confirmButton = {
                Button(onClick = {
                    showConfirmDialog = false
                    onRetake()
                }) {
                    Text("Ja, tag nyt billede")
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { showConfirmDialog = false }) {
                    Text("Annuller")
                }
            }
        )
    }

    // Enlarged photo dialog
    if (showEnlargedPhoto && hasPhoto && photoPath != null) {
        Dialog(onDismissRequest = { showEnlargedPhoto = false }) {
            Card(
                modifier = Modifier.fillMaxWidth(0.95f),
                shape = MaterialTheme.shapes.large
            ) {
                Column {
                    Box(modifier = Modifier.fillMaxWidth()) {
                        AsyncImage(
                            model = ImageRequest.Builder(context)
                                .data(File(photoPath))
                                .crossfade(true)
                                .build(),
                            contentDescription = title,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 300.dp, max = 500.dp)
                        )
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(8.dp),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(onClick = { showEnlargedPhoto = false }) {
                            Text("Luk")
                        }
                    }
                }
            }
        }
    }

    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Medium
            )

            if (showWarning) {
                AssistChip(
                    onClick = { },
                    label = { Text("Mangler") },
                    leadingIcon = {
                        Icon(
                            Icons.Default.Warning,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    },
                    colors = AssistChipDefaults.assistChipColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        labelColor = MaterialTheme.colorScheme.onErrorContainer
                    )
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Card(
            modifier = Modifier
                .fillMaxWidth()
                .height(250.dp)
                .clickable(enabled = hasPhoto && photoPath != null) {
                    showEnlargedPhoto = true
                }
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                if (hasPhoto && photoPath != null) {
                    AsyncImage(
                        model = ImageRequest.Builder(context)
                            .data(File(photoPath))
                            .crossfade(true)
                            .build(),
                        contentDescription = title,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize()
                    )
                    // Tap hint
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(8.dp)
                            .background(
                                MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                                MaterialTheme.shapes.small
                            )
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.ZoomIn,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                "Tryk for at forstørre",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                            )
                        }
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                Icons.Default.PhotoCamera,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Intet billede",
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Button(
            onClick = {
                if (hasPhoto) {
                    showConfirmDialog = true
                } else {
                    onRetake()
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isSaving
        ) {
            if (isSaving) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Gemmer...")
            } else {
                Icon(
                    Icons.Default.CameraAlt,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(if (hasPhoto) "Tag nyt billede" else "Tag billede")
            }
        }
    }
}

@Composable
private fun CameraOverlay(
    isProfilePhoto: Boolean,
    onPhotoTaken: (String) -> Unit,
    onCancel: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }

    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    var isTakingPhoto by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }

    DisposableEffect(Unit) {
        onDispose {
            cameraExecutor.shutdown()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Camera preview
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx)

                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()

                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }

                    val imageCaptureBuilder = ImageCapture.Builder()
                    imageCapture = imageCaptureBuilder.build()

                    try {
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_FRONT_CAMERA, // Always front camera
                            preview,
                            imageCapture
                        )
                    } catch (e: Exception) {
                        errorMessage = "Kamerafejl: ${e.message}"
                    }
                }, ContextCompat.getMainExecutor(ctx))

                previewView
            },
            modifier = Modifier.fillMaxSize()
        )

        // Overlay UI
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            // Header
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onCancel) {
                        Icon(Icons.Default.Close, contentDescription = "Annuller")
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isProfilePhoto) "Tag nyt profilbillede" else "Tag nyt ID-billede",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            if (!isProfilePhoto) {
                Spacer(modifier = Modifier.height(8.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.9f)
                    )
                ) {
                    Text(
                        text = "Hold ID-kort eller kørekort op foran kameraet",
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }

            if (errorMessage != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    )
                ) {
                    Text(
                        text = errorMessage!!,
                        modifier = Modifier.padding(12.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // Capture button
            Button(
                onClick = {
                    val capture = imageCapture ?: return@Button
                    isTakingPhoto = true
                    errorMessage = null

                    val photoDir = File(context.filesDir, "photos")
                    if (!photoDir.exists()) photoDir.mkdirs()

                    val timestamp = System.currentTimeMillis()
                    val suffix = if (isProfilePhoto) "" else "_id"
                    val photoFile = File(photoDir, "retake_${timestamp}${suffix}.jpg")

                    val outputOptions = ImageCapture.OutputFileOptions.Builder(photoFile).build()

                    capture.takePicture(
                        outputOptions,
                        cameraExecutor,
                        object : ImageCapture.OnImageSavedCallback {
                            override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                                onPhotoTaken(photoFile.absolutePath)
                            }

                            override fun onError(exception: ImageCaptureException) {
                                errorMessage = "Billedefejl: ${exception.message}"
                                isTakingPhoto = false
                            }
                        }
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                enabled = !isTakingPhoto
            ) {
                if (isTakingPhoto) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Icon(
                        Icons.Default.PhotoCamera,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Tag billede", style = MaterialTheme.typography.titleMedium)
                }
            }
        }
    }
}
