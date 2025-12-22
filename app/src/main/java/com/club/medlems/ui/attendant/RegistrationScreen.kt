package com.club.medlems.ui.attendant

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Environment
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.dao.NewMemberRegistrationDao
import com.club.medlems.data.entity.NewMemberRegistration
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import java.io.File
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

data class RegistrationState(
    val photoTaken: Boolean = false,
    val photoPath: String? = null,
    val guardianName: String = "",
    val guardianPhone: String = "",
    val guardianEmail: String = "",
    val isSaving: Boolean = false,
    val showGuardianFields: Boolean = false,
    val saveSuccess: Boolean = false,
    val errorMessage: String? = null
)

@HiltViewModel
class RegistrationViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val registrationDao: NewMemberRegistrationDao
) : ViewModel() {
    
    private val _state = MutableStateFlow(RegistrationState())
    val state: StateFlow<RegistrationState> = _state.asStateFlow()
    
    fun setPhotoTaken(path: String) {
        _state.value = _state.value.copy(photoTaken = true, photoPath = path)
    }
    
    fun updateGuardianName(name: String) {
        _state.value = _state.value.copy(guardianName = name)
    }
    
    fun updateGuardianPhone(phone: String) {
        _state.value = _state.value.copy(guardianPhone = phone)
    }
    
    fun updateGuardianEmail(email: String) {
        _state.value = _state.value.copy(guardianEmail = email)
    }
    
    fun toggleGuardianFields(show: Boolean) {
        _state.value = _state.value.copy(showGuardianFields = show)
    }
    
    fun saveRegistration() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, errorMessage = null)
            
            try {
                val photoPath = _state.value.photoPath
                if (photoPath == null) {
                    _state.value = _state.value.copy(
                        isSaving = false,
                        errorMessage = "Intet billede taget"
                    )
                    return@launch
                }
                
                val timestamp = System.currentTimeMillis()
                val tempId = "NYT-$timestamp"
                
                val registration = NewMemberRegistration(
                    id = UUID.randomUUID().toString(),
                    temporaryId = tempId,
                    createdAtUtc = Clock.System.now(),
                    photoPath = photoPath,
                    guardianName = _state.value.guardianName.takeIf { it.isNotBlank() },
                    guardianPhone = _state.value.guardianPhone.takeIf { it.isNotBlank() },
                    guardianEmail = _state.value.guardianEmail.takeIf { it.isNotBlank() }
                )
                
                withContext(Dispatchers.IO) {
                    registrationDao.insert(registration)
                    saveGuardianInfo(tempId, photoPath)
                }
                
                _state.value = _state.value.copy(
                    isSaving = false,
                    saveSuccess = true
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isSaving = false,
                    errorMessage = "Fejl ved gemning: ${e.message}"
                )
            }
        }
    }
    
    private suspend fun saveGuardianInfo(tempId: String, photoPath: String) {
        val state = _state.value
        if (!state.showGuardianFields) return
        
        val hasGuardianInfo = state.guardianName.isNotBlank() || 
                             state.guardianPhone.isNotBlank() || 
                             state.guardianEmail.isNotBlank()
        
        if (!hasGuardianInfo) return
        
        try {
            val photoFile = File(photoPath)
            val infoFile = File(photoFile.parent, "${photoFile.nameWithoutExtension}_vaerge.txt")
            
            val info = buildString {
                appendLine("Midlertidig ID: $tempId")
                appendLine("Registreret: ${SimpleDateFormat("dd-MM-yyyy HH:mm", Locale("da", "DK")).format(Date())}")
                if (state.guardianName.isNotBlank()) appendLine("Værge navn: ${state.guardianName}")
                if (state.guardianPhone.isNotBlank()) appendLine("Værge telefon: ${state.guardianPhone}")
                if (state.guardianEmail.isNotBlank()) appendLine("Værge e-mail: ${state.guardianEmail}")
            }
            
            infoFile.writeText(info)
        } catch (e: Exception) {
            // Log but don't fail the registration
        }
    }
    
    fun reset() {
        _state.value = RegistrationState()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegistrationScreen(
    onBack: () -> Unit,
    viewModel: RegistrationViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    
    var hasCameraPermission by remember { 
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        )
    }
    
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }
    
    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }
    
    if (state.saveSuccess) {
        LaunchedEffect(Unit) {
            kotlinx.coroutines.delay(2000)
            viewModel.reset()
            onBack()
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tilmeld nyt medlem") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Tilbage")
                    }
                }
            )
        }
    ) { padding ->
        if (!hasCameraPermission) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Text("Kameraadgang er påkrævet")
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                if (!state.photoTaken) {
                    CameraPreview(
                        onPhotoTaken = { path ->
                            viewModel.setPhotoTaken(path)
                        },
                        modifier = Modifier.weight(1f)
                    )
                } else {
                    RegistrationForm(
                        state = state,
                        onGuardianNameChange = viewModel::updateGuardianName,
                        onGuardianPhoneChange = viewModel::updateGuardianPhone,
                        onGuardianEmailChange = viewModel::updateGuardianEmail,
                        onToggleGuardianFields = viewModel::toggleGuardianFields,
                        onSave = viewModel::saveRegistration,
                        onRetakePhoto = { viewModel.reset() },
                        modifier = Modifier
                            .weight(1f)
                            .verticalScroll(rememberScrollState())
                    )
                }
            }
        }
    }
}

@Composable
fun CameraPreview(
    onPhotoTaken: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    
    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    
    Box(modifier = modifier.fillMaxSize()) {
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
                            CameraSelector.DEFAULT_FRONT_CAMERA,
                            preview,
                            imageCapture
                        )
                    } catch (e: Exception) {
                        // Handle error
                    }
                }, ContextCompat.getMainExecutor(ctx))
                
                previewView
            },
            modifier = Modifier.fillMaxSize()
        )
        
        Button(
            onClick = {
                val capture = imageCapture ?: return@Button
                
                val photoDir = File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM),
                    "Nyt medlem"
                )
                photoDir.mkdirs()
                
                val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
                val photoFile = File(photoDir, "NYT_$timestamp.jpg")
                
                val outputOptions = ImageCapture.OutputFileOptions.Builder(photoFile).build()
                
                capture.takePicture(
                    outputOptions,
                    ContextCompat.getMainExecutor(context),
                    object : ImageCapture.OnImageSavedCallback {
                        override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                            onPhotoTaken(photoFile.absolutePath)
                        }
                        
                        override fun onError(exc: ImageCaptureException) {
                            // Handle error
                        }
                    }
                )
            },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 32.dp)
                .size(80.dp)
        ) {
            Icon(
                Icons.Default.CameraAlt,
                contentDescription = "Tag billede",
                modifier = Modifier.size(48.dp)
            )
        }
    }
}

@Composable
fun RegistrationForm(
    state: RegistrationState,
    onGuardianNameChange: (String) -> Unit,
    onGuardianPhoneChange: (String) -> Unit,
    onGuardianEmailChange: (String) -> Unit,
    onToggleGuardianFields: (Boolean) -> Unit,
    onSave: () -> Unit,
    onRetakePhoto: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (state.saveSuccess) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Default.CheckCircle, "Succes")
                    Text("Tilmelding gemt!")
                }
            }
        }
        
        if (state.errorMessage != null) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Text(
                    state.errorMessage,
                    modifier = Modifier.padding(16.dp),
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
        }
        
        Text(
            "Billede taget!",
            style = MaterialTheme.typography.headlineSmall
        )
        
        Text(
            "Foto gemt på SD-kort i mappen 'Nyt medlem'",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Checkbox(
                checked = state.showGuardianFields,
                onCheckedChange = onToggleGuardianFields
            )
            Text("Dette er en barnetilmelding (tilføj værge)")
        }
        
        if (state.showGuardianFields) {
            Card(
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        "Værge oplysninger (valgfrit)",
                        style = MaterialTheme.typography.titleMedium
                    )
                    
                    OutlinedTextField(
                        value = state.guardianName,
                        onValueChange = onGuardianNameChange,
                        label = { Text("Værge navn") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    OutlinedTextField(
                        value = state.guardianPhone,
                        onValueChange = onGuardianPhoneChange,
                        label = { Text("Værge telefon") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    OutlinedTextField(
                        value = state.guardianEmail,
                        onValueChange = onGuardianEmailChange,
                        label = { Text("Værge e-mail") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.weight(1f))
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = onRetakePhoto,
                modifier = Modifier.weight(1f),
                enabled = !state.isSaving
            ) {
                Text("Tag nyt billede")
            }
            
            Button(
                onClick = onSave,
                modifier = Modifier.weight(1f),
                enabled = !state.isSaving
            ) {
                if (state.isSaving) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Text("Gem")
                }
            }
        }
    }
}
