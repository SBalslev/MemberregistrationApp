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
import androidx.compose.foundation.background
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
    val currentStep: Int = 1, // 1=details, 2=photo, 3=guardian/save
    val firstName: String = "",
    val lastName: String = "",
    val email: String = "",
    val phone: String = "",
    val birthDate: String = "",
    val gender: String = "",
    val address: String = "",
    val zipCode: String = "",
    val city: String = "",
    val photoPath: String? = null,
    val guardianName: String = "",
    val guardianPhone: String = "",
    val guardianEmail: String = "",
    val isSaving: Boolean = false,
    val isTakingPhoto: Boolean = false,
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
    
    fun updateFirstName(name: String) {
        _state.value = _state.value.copy(firstName = name)
    }
    
    fun updateLastName(name: String) {
        _state.value = _state.value.copy(lastName = name)
    }
    
    fun updateEmail(email: String) {
        _state.value = _state.value.copy(email = email)
    }
    
    fun updatePhone(phone: String) {
        _state.value = _state.value.copy(phone = phone)
    }
    
    fun updateBirthDate(date: String) {
        _state.value = _state.value.copy(birthDate = date)
    }
    
    fun updateGender(gender: String) {
        _state.value = _state.value.copy(gender = gender)
    }
    
    fun updateAddress(address: String) {
        _state.value = _state.value.copy(address = address)
    }
    
    fun updateZipCode(zipCode: String) {
        _state.value = _state.value.copy(zipCode = zipCode)
    }
    
    fun updateCity(city: String) {
        _state.value = _state.value.copy(city = city)
    }
    
    fun nextStep() {
        val current = _state.value.currentStep
        if (current < 3) {
            _state.value = _state.value.copy(currentStep = current + 1)
        }
    }
    
    fun previousStep() {
        val current = _state.value.currentStep
        if (current > 1) {
            _state.value = _state.value.copy(currentStep = current - 1, errorMessage = null)
        }
    }
    
    fun startTakingPhoto() {
        _state.value = _state.value.copy(isTakingPhoto = true, errorMessage = null)
    }
    
    fun setPhotoTaken(path: String) {
        _state.value = _state.value.copy(photoPath = path, currentStep = 3, errorMessage = null, isTakingPhoto = false)
    }
    
    fun setPhotoError(error: String) {
        _state.value = _state.value.copy(errorMessage = error, isTakingPhoto = false)
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
                // Validate required fields
                if (_state.value.firstName.isBlank() || _state.value.lastName.isBlank()) {
                    _state.value = _state.value.copy(
                        isSaving = false,
                        errorMessage = "Fornavn og efternavn er påkrævet"
                    )
                    return@launch
                }
                
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
                    firstName = _state.value.firstName,
                    lastName = _state.value.lastName,
                    email = _state.value.email.takeIf { it.isNotBlank() },
                    phone = _state.value.phone.takeIf { it.isNotBlank() },
                    birthDate = _state.value.birthDate.takeIf { it.isNotBlank() },
                    gender = _state.value.gender.takeIf { it.isNotBlank() },
                    address = _state.value.address.takeIf { it.isNotBlank() },
                    zipCode = _state.value.zipCode.takeIf { it.isNotBlank() },
                    city = _state.value.city.takeIf { it.isNotBlank() },
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
        
        try {
            val photoFile = File(photoPath)
            val infoFile = File(photoFile.parent, "${photoFile.nameWithoutExtension}_info.txt")
            
            val hasGuardianInfo = state.guardianName.isNotBlank() || 
                                 state.guardianPhone.isNotBlank() || 
                                 state.guardianEmail.isNotBlank()
            
            val info = buildString {
                appendLine("Nyt medlem tilmelding")
                appendLine("Dato: ${SimpleDateFormat("dd-MM-yyyy HH:mm", Locale("da", "DK")).format(Date())}")
                appendLine("Midlertidigt ID: $tempId")
                appendLine()
                appendLine("Fornavn: ${state.firstName}")
                appendLine("Efternavn: ${state.lastName}")
                if (state.email.isNotBlank()) appendLine("E-mail: ${state.email}")
                if (state.phone.isNotBlank()) appendLine("Telefon: ${state.phone}")
                if (state.birthDate.isNotBlank()) appendLine("Fødselsdato: ${state.birthDate}")
                
                if (hasGuardianInfo) {
                    appendLine()
                    appendLine("Værge oplysninger:")
                    if (state.guardianName.isNotBlank()) appendLine("Værge navn: ${state.guardianName}")
                    if (state.guardianPhone.isNotBlank()) appendLine("Værge telefon: ${state.guardianPhone}")
                    if (state.guardianEmail.isNotBlank()) appendLine("Værge e-mail: ${state.guardianEmail}")
                }
            }
            
            infoFile.writeText(info)
        } catch (e: Exception) {
            // Log but don't fail the registration
        }
    }
    
    fun reset() {
        _state.value = RegistrationState(currentStep = 1)
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
                when (state.currentStep) {
                    1 -> MemberDetailsForm(
                        state = state,
                        onFirstNameChange = viewModel::updateFirstName,
                        onLastNameChange = viewModel::updateLastName,
                        onEmailChange = viewModel::updateEmail,
                        onPhoneChange = viewModel::updatePhone,
                        onBirthDateChange = viewModel::updateBirthDate,
                        onGenderChange = viewModel::updateGender,
                        onAddressChange = viewModel::updateAddress,
                        onZipCodeChange = viewModel::updateZipCode,
                        onCityChange = viewModel::updateCity,
                        onNext = viewModel::nextStep,
                        modifier = Modifier
                            .weight(1f)
                            .verticalScroll(rememberScrollState())
                    )
                    2 -> CameraPreview(
                        onPhotoTaken = { path ->
                            viewModel.setPhotoTaken(path)
                        },
                        onPhotoError = { error ->
                            viewModel.setPhotoError(error)
                        },
                        onStartTaking = viewModel::startTakingPhoto,
                        onBack = viewModel::previousStep,
                        errorMessage = state.errorMessage,
                        isTakingPhoto = state.isTakingPhoto,
                        modifier = Modifier.weight(1f)
                    )
                    3 -> RegistrationForm(
                        state = state,
                        onGuardianNameChange = viewModel::updateGuardianName,
                        onGuardianPhoneChange = viewModel::updateGuardianPhone,
                        onGuardianEmailChange = viewModel::updateGuardianEmail,
                        onToggleGuardianFields = viewModel::toggleGuardianFields,
                        onSave = viewModel::saveRegistration,
                        onRetakePhoto = viewModel::previousStep,
                        modifier = Modifier
                            .weight(1f)
                            .verticalScroll(rememberScrollState())
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemberDetailsForm(
    state: RegistrationState,
    onFirstNameChange: (String) -> Unit,
    onLastNameChange: (String) -> Unit,
    onEmailChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onBirthDateChange: (String) -> Unit,
    onGenderChange: (String) -> Unit,
    onAddressChange: (String) -> Unit,
    onZipCodeChange: (String) -> Unit,
    onCityChange: (String) -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "Trin 1 af 3: Indtast medlemsoplysninger",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.primary
        )
        
        if (state.errorMessage != null) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Text(
                    text = state.errorMessage,
                    modifier = Modifier.padding(16.dp),
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
        }
        
        OutlinedTextField(
            value = state.firstName,
            onValueChange = onFirstNameChange,
            label = { Text("Fornavn *") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        
        OutlinedTextField(
            value = state.lastName,
            onValueChange = onLastNameChange,
            label = { Text("Efternavn *") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        
        OutlinedTextField(
            value = state.email,
            onValueChange = onEmailChange,
            label = { Text("E-mail") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Email
            )
        )
        
        OutlinedTextField(
            value = state.phone,
            onValueChange = onPhoneChange,
            label = { Text("Telefon") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone
            )
        )
        
        OutlinedTextField(
            value = state.birthDate,
            onValueChange = onBirthDateChange,
            label = { Text("Fødselsdato (dd-mm-åååå)") },
            placeholder = { Text("01-01-2000") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        
        // Gender dropdown
        var genderExpanded by remember { mutableStateOf(false) }
        val genderOptions = listOf("" to "Vælg køn", "MALE" to "Mand", "FEMALE" to "Kvinde", "OTHER" to "Andet")
        
        ExposedDropdownMenuBox(
            expanded = genderExpanded,
            onExpandedChange = { genderExpanded = !genderExpanded }
        ) {
            OutlinedTextField(
                value = genderOptions.find { it.first == state.gender }?.second ?: "Vælg køn",
                onValueChange = {},
                readOnly = true,
                label = { Text("Køn") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = genderExpanded) },
                modifier = Modifier
                    .fillMaxWidth()
                    .menuAnchor()
            )
            ExposedDropdownMenu(
                expanded = genderExpanded,
                onDismissRequest = { genderExpanded = false }
            ) {
                genderOptions.forEach { (value, label) ->
                    DropdownMenuItem(
                        text = { Text(label) },
                        onClick = {
                            onGenderChange(value)
                            genderExpanded = false
                        }
                    )
                }
            }
        }
        
        OutlinedTextField(
            value = state.address,
            onValueChange = onAddressChange,
            label = { Text("Adresse") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = state.zipCode,
                onValueChange = onZipCodeChange,
                label = { Text("Postnr.") },
                modifier = Modifier.weight(1f),
                singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                )
            )
            OutlinedTextField(
                value = state.city,
                onValueChange = onCityChange,
                label = { Text("By") },
                modifier = Modifier.weight(2f),
                singleLine = true
            )
        }
        
        Text(
            text = "* Påkrævet",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.weight(1f))
        
        Button(
            onClick = onNext,
            modifier = Modifier.fillMaxWidth(),
            enabled = state.firstName.isNotBlank() && state.lastName.isNotBlank()
        ) {
            Text("Næste: Tag billede")
        }
    }
}

@Composable
fun CameraPreview(
    onPhotoTaken: (String) -> Unit,
    onPhotoError: (String) -> Unit,
    onStartTaking: () -> Unit,
    onBack: () -> Unit,
    errorMessage: String?,
    isTakingPhoto: Boolean,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    
    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    
    Box(modifier = modifier.fillMaxSize()) {
        // Header with step indicator and back button
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter)
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.9f))
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, "Tilbage")
                }
                Text(
                    text = "Trin 2 af 3: Tag billede",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            
            if (errorMessage != null) {
                Card(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    )
                ) {
                    Text(
                        text = errorMessage,
                        modifier = Modifier.padding(12.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
        
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
                        onPhotoError("Kamerafejl: ${e.message}")
                    }
                }, ContextCompat.getMainExecutor(ctx))
                
                previewView
            },
            modifier = Modifier.fillMaxSize()
        )
        
        // Taking photo indicator
        if (isTakingPhoto) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.7f)),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    CircularProgressIndicator()
                    Text(
                        "Tager billede...",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }
        
        Button(
            onClick = {
                val capture = imageCapture ?: run {
                    onPhotoError("Kamera ikke klar endnu")
                    return@Button
                }
                
                onStartTaking()
                
                // Use app's private directory for better compatibility
                val photoDir = File(context.getExternalFilesDir(Environment.DIRECTORY_PICTURES), "Nyt medlem")
                if (!photoDir.exists()) {
                    photoDir.mkdirs()
                }
                
                val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
                val photoFile = File(photoDir, "NYT_$timestamp.jpg")
                
                val outputOptions = ImageCapture.OutputFileOptions.Builder(photoFile).build()
                
                capture.takePicture(
                    outputOptions,
                    ContextCompat.getMainExecutor(context),
                    object : ImageCapture.OnImageSavedCallback {
                        override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                            android.util.Log.d("RegistrationScreen", "Photo saved: ${photoFile.absolutePath}")
                            onPhotoTaken(photoFile.absolutePath)
                        }
                        
                        override fun onError(exc: ImageCaptureException) {
                            android.util.Log.e("RegistrationScreen", "Photo capture failed", exc)
                            onPhotoError("Kunne ikke tage billede: ${exc.message}")
                        }
                    }
                )
            },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 32.dp)
                .size(80.dp),
            enabled = !isTakingPhoto
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
        Text(
            text = "Trin 3 af 3: Valgfri værgeoplysninger",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.primary
        )
        
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
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    
                    OutlinedTextField(
                        value = state.guardianPhone,
                        onValueChange = onGuardianPhoneChange,
                        label = { Text("Værge telefon") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                            keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone
                        )
                    )
                    
                    OutlinedTextField(
                        value = state.guardianEmail,
                        onValueChange = onGuardianEmailChange,
                        label = { Text("Værge e-mail") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                            keyboardType = androidx.compose.ui.text.input.KeyboardType.Email
                        )
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
