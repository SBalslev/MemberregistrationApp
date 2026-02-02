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
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.layout.ContentScale
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
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberStatus
import com.club.medlems.data.entity.MemberType
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.data.sync.SyncOutboxManager
import com.club.medlems.network.TrustManager
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.todayIn
import kotlinx.datetime.toLocalDateTime
import java.io.File
import com.club.medlems.util.BirthDateValidator
import com.club.medlems.util.BirthDateValidationResult
import coil.compose.AsyncImage
import coil.request.ImageRequest
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType

data class RegistrationState(
    val currentStep: Int = 1, // 1=details, 2=camera, 3=photo preview, 4=ID camera (adults), 5=ID preview (adults), 6=guardian/save
    val firstName: String = "",
    val lastName: String = "",
    val email: String = "",
    val phone: String = "",
    val birthDate: String = "",
    val birthDateError: String? = null,
    val birthDateValid: Boolean = false,
    val calculatedAge: Int? = null,
    val isAdult: Boolean = false,
    val gender: String = "",
    val address: String = "",
    val zipCode: String = "",
    val city: String = "",
    val photoPath: String? = null,
    val idPhotoPath: String? = null, // ID photo for adults
    val guardianName: String = "",
    val guardianPhone: String = "",
    val guardianEmail: String = "",
    val isSaving: Boolean = false,
    val isTakingPhoto: Boolean = false,
    val showGuardianFields: Boolean = false,
    val saveSuccess: Boolean = false,
    val errorMessage: String? = null,
    // Created member info for confirmation display
    val createdMemberName: String? = null,
    val createdMemberInternalId: String? = null
)

@HiltViewModel
class RegistrationViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val memberDao: MemberDao,
    private val syncOutboxManager: SyncOutboxManager,
    private val syncManager: SyncManager,
    private val trustManager: TrustManager
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
        val validationResult = BirthDateValidator.validate(date)
        val errorMessage = BirthDateValidator.getErrorMessage(validationResult)

        val (isValid, age, isAdult) = when (validationResult) {
            is BirthDateValidationResult.Valid -> Triple(true, validationResult.age, validationResult.age >= 18)
            is BirthDateValidationResult.Empty -> Triple(false, null, false)
            else -> Triple(false, null, false)
        }

        val showGuardianFields = when {
            isValid && !isAdult -> true
            isValid && isAdult -> false
            else -> _state.value.showGuardianFields
        }

        _state.value = _state.value.copy(
            birthDate = date,
            birthDateError = errorMessage,
            birthDateValid = isValid,
            calculatedAge = age,
            isAdult = isAdult,
            showGuardianFields = showGuardianFields
        )
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
        val maxStep = if (_state.value.isAdult) 6 else 6 // 6 is final step for both
        if (current < maxStep) {
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

    /** Profile photo taken - go to preview (step 3) */
    fun setPhotoTaken(path: String) {
        _state.value = _state.value.copy(
            photoPath = path,
            currentStep = 3, // Photo preview step
            errorMessage = null,
            isTakingPhoto = false
        )
    }

    /** Accept profile photo - proceed to ID photo (adults) or final step (minors) */
    fun acceptPhoto() {
        val nextStep = if (_state.value.isAdult) 4 else 6 // Adults go to ID camera, minors skip to save
        _state.value = _state.value.copy(currentStep = nextStep, errorMessage = null)
    }

    /** Retake profile photo - go back to camera */
    fun retakePhoto() {
        _state.value = _state.value.copy(
            photoPath = null,
            currentStep = 2, // Back to camera
            errorMessage = null
        )
    }

    /** ID photo taken - go to ID preview (step 5) */
    fun setIdPhotoTaken(path: String) {
        _state.value = _state.value.copy(
            idPhotoPath = path,
            currentStep = 5, // ID photo preview step
            errorMessage = null,
            isTakingPhoto = false
        )
    }

    /** Accept ID photo - proceed to final step */
    fun acceptIdPhoto() {
        _state.value = _state.value.copy(currentStep = 6, errorMessage = null)
    }

    /** Retake ID photo - go back to ID camera */
    fun retakeIdPhoto() {
        _state.value = _state.value.copy(
            idPhotoPath = null,
            currentStep = 4, // Back to ID camera
            errorMessage = null
        )
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
                
                val now = Clock.System.now()
                val internalId = UUID.randomUUID().toString()
                
                // Parse birthDate string to LocalDate if provided
                val birthDateLocal = _state.value.birthDate.takeIf { it.isNotBlank() }?.let {
                    try {
                        LocalDate.parse(it)
                    } catch (e: Exception) {
                        // Try parsing DD-MM-YYYY format
                        val parts = it.split("-", "/", ".")
                        if (parts.size == 3) {
                            try {
                                LocalDate(parts[2].toInt(), parts[1].toInt(), parts[0].toInt())
                            } catch (e2: Exception) { null }
                        } else null
                    }
                }
                
                // Create trial member directly (no NewMemberRegistration)
                val member = Member(
                    internalId = internalId,
                    membershipId = null, // Trial member has no club ID yet
                    memberType = MemberType.TRIAL,
                    status = MemberStatus.ACTIVE,
                    firstName = _state.value.firstName.trim(),
                    lastName = _state.value.lastName.trim(),
                    birthDate = birthDateLocal,
                    gender = _state.value.gender.takeIf { it.isNotBlank() },
                    email = _state.value.email.takeIf { it.isNotBlank() },
                    phone = _state.value.phone.takeIf { it.isNotBlank() },
                    address = _state.value.address.takeIf { it.isNotBlank() },
                    zipCode = _state.value.zipCode.takeIf { it.isNotBlank() },
                    city = _state.value.city.takeIf { it.isNotBlank() },
                    guardianName = _state.value.guardianName.takeIf { it.isNotBlank() },
                    guardianPhone = _state.value.guardianPhone.takeIf { it.isNotBlank() },
                    guardianEmail = _state.value.guardianEmail.takeIf { it.isNotBlank() },
                    registrationPhotoPath = photoPath,
                    idPhotoPath = _state.value.idPhotoPath, // ID photo for adults
                    expiresOn = null,
                    mergedIntoId = null,
                    createdAtUtc = now,
                    updatedAtUtc = now,
                    deviceId = null,
                    syncVersion = 0L,
                    syncedAtUtc = null
                )
                
                withContext(Dispatchers.IO) {
                    memberDao.upsert(member)
                    // Encode profile photo for sync if available
                    val photoBase64 = try {
                        val photoFile = File(photoPath)
                        if (photoFile.exists()) {
                            android.util.Base64.encodeToString(photoFile.readBytes(), android.util.Base64.NO_WRAP)
                        } else null
                    } catch (e: Exception) { null }
                    // Encode ID photo for sync if available (adults only)
                    val idPhotoBase64 = try {
                        _state.value.idPhotoPath?.let { idPath ->
                            val idPhotoFile = File(idPath)
                            if (idPhotoFile.exists()) {
                                android.util.Base64.encodeToString(idPhotoFile.readBytes(), android.util.Base64.NO_WRAP)
                            } else null
                        }
                    } catch (e: Exception) { null }
                    // Queue trial member for sync and trigger reactive sync
                    syncOutboxManager.queueMember(member, trustManager.getThisDeviceId(), photoBase64 = photoBase64, idPhotoBase64 = idPhotoBase64)
                    syncManager.notifyEntityChanged("Member", member.internalId)
                    saveRegistrationInfo(internalId, photoPath)
                }
                
                val fullName = "${_state.value.firstName.trim()} ${_state.value.lastName.trim()}"
                _state.value = _state.value.copy(
                    isSaving = false,
                    saveSuccess = true,
                    createdMemberName = fullName,
                    createdMemberInternalId = internalId
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isSaving = false,
                    errorMessage = "Fejl ved gemning: ${e.message}"
                )
            }
        }
    }
    
    private suspend fun saveRegistrationInfo(internalId: String, photoPath: String) {
        val state = _state.value
        
        try {
            val photoFile = File(photoPath)
            val infoFile = File(photoFile.parent, "${photoFile.nameWithoutExtension}_info.txt")
            
            val hasGuardianInfo = state.guardianName.isNotBlank() || 
                                 state.guardianPhone.isNotBlank() || 
                                 state.guardianEmail.isNotBlank()
            
            val info = buildString {
                appendLine("Prøvemedlem oprettet")
                appendLine("Dato: ${SimpleDateFormat("dd-MM-yyyy HH:mm", Locale("da", "DK")).format(Date())}")
                appendLine("Intern ID: $internalId")
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
                val totalSteps = if (state.isAdult) 6 else 4

                // Visual step progress indicator
                RegistrationStepIndicator(
                    currentStep = state.currentStep,
                    totalSteps = totalSteps,
                    isAdult = state.isAdult,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                )

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
                        stepLabel = "Trin 2 af $totalSteps: Tag profilbillede",
                        useFrontCamera = true,
                        modifier = Modifier.weight(1f)
                    )
                    3 -> PhotoPreviewScreen(
                        photoPath = state.photoPath ?: "",
                        onAccept = viewModel::acceptPhoto,
                        onRetake = viewModel::retakePhoto,
                        stepLabel = "Trin 3 af $totalSteps: Godkend profilbillede",
                        photoLabel = "Profilbillede",
                        modifier = Modifier.weight(1f)
                    )
                    4 -> CameraPreview(
                        onPhotoTaken = { path ->
                            viewModel.setIdPhotoTaken(path)
                        },
                        onPhotoError = { error ->
                            viewModel.setPhotoError(error)
                        },
                        onStartTaking = viewModel::startTakingPhoto,
                        onBack = viewModel::acceptPhoto, // Go back to after profile photo accepted
                        errorMessage = state.errorMessage,
                        isTakingPhoto = state.isTakingPhoto,
                        stepLabel = "Trin 4 af $totalSteps: Tag billede af ID",
                        useFrontCamera = true, // Front camera (tablet is wall-mounted)
                        instructionText = "Hold dit ID-kort eller kørekort op foran kameraet",
                        modifier = Modifier.weight(1f)
                    )
                    5 -> PhotoPreviewScreen(
                        photoPath = state.idPhotoPath ?: "",
                        onAccept = viewModel::acceptIdPhoto,
                        onRetake = viewModel::retakeIdPhoto,
                        stepLabel = "Trin 5 af $totalSteps: Godkend ID-billede",
                        photoLabel = "ID-billede",
                        modifier = Modifier.weight(1f)
                    )
                    6 -> RegistrationForm(
                        state = state,
                        onGuardianNameChange = viewModel::updateGuardianName,
                        onGuardianPhoneChange = viewModel::updateGuardianPhone,
                        onGuardianEmailChange = viewModel::updateGuardianEmail,
                        onToggleGuardianFields = viewModel::toggleGuardianFields,
                        onSave = viewModel::saveRegistration,
                        onRetakePhoto = { viewModel.retakePhoto() },
                        modifier = Modifier
                            .weight(1f)
                            .verticalScroll(rememberScrollState())
                    )
                }
            }
        }
    }
}

/**
 * Visual step progress indicator showing current registration progress.
 * Displays colored dots for each step with the current step highlighted.
 */
@Composable
private fun RegistrationStepIndicator(
    currentStep: Int,
    totalSteps: Int,
    isAdult: Boolean,
    modifier: Modifier = Modifier
) {
    val stepLabels = if (isAdult) {
        listOf("Oplysninger", "Profilbillede", "Godkend", "ID-billede", "Godkend ID", "Gem")
    } else {
        listOf("Oplysninger", "Profilbillede", "Godkend", "Gem")
    }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Step dots row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            for (i in 1..totalSteps) {
                // Step dot
                Surface(
                    modifier = Modifier.size(if (i == currentStep) 16.dp else 12.dp),
                    shape = MaterialTheme.shapes.small,
                    color = when {
                        i < currentStep -> MaterialTheme.colorScheme.primary
                        i == currentStep -> MaterialTheme.colorScheme.primary
                        else -> MaterialTheme.colorScheme.surfaceVariant
                    }
                ) {
                    if (i < currentStep) {
                        // Completed step - show checkmark
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = null,
                                modifier = Modifier.size(if (i == currentStep) 16.dp else 12.dp),
                                tint = MaterialTheme.colorScheme.onPrimary
                            )
                        }
                    }
                }

                // Connector line (except after last step)
                if (i < totalSteps) {
                    Box(
                        modifier = Modifier
                            .width(24.dp)
                            .height(2.dp)
                            .background(
                                if (i < currentStep) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.surfaceVariant
                            )
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Current step label
        Text(
            text = "Trin $currentStep af $totalSteps: ${stepLabels.getOrElse(currentStep - 1) { "" }}",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary
        )
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
        // Step label is now shown in the RegistrationStepIndicator

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
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words)
        )
        
        OutlinedTextField(
            value = state.lastName,
            onValueChange = onLastNameChange,
            label = { Text("Efternavn *") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words)
        )
        
        OutlinedTextField(
            value = state.email,
            onValueChange = onEmailChange,
            label = { Text("E-mail") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Email
            )
        )
        
        OutlinedTextField(
            value = state.phone,
            onValueChange = onPhoneChange,
            label = { Text("Telefon") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone
            )
        )

        var showBirthDatePicker by remember { mutableStateOf(false) }
        val timeZone = TimeZone.currentSystemDefault()
        val initialBirthDate = remember(state.birthDate) {
            when (val result = BirthDateValidator.validate(state.birthDate)) {
                is BirthDateValidationResult.Valid -> result.date
                else -> Clock.System.todayIn(timeZone)
            }
        }
        val initialBirthMillis = remember(initialBirthDate) {
            initialBirthDate.atStartOfDayIn(timeZone).toEpochMilliseconds()
        }
        val birthDatePickerState = rememberDatePickerState(
            initialSelectedDateMillis = initialBirthMillis
        )

        OutlinedTextField(
            value = state.birthDate,
            onValueChange = onBirthDateChange,
            label = { Text("Fødselsdato (dd-mm-åååå) *") },
            placeholder = { Text("01-01-2000") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            isError = state.birthDateError != null,
            readOnly = true,
            trailingIcon = {
                IconButton(onClick = { showBirthDatePicker = true }) {
                    Icon(Icons.Default.CalendarToday, contentDescription = "Vælg dato")
                }
            },
            supportingText = {
                when {
                    state.birthDateError != null -> {
                        Text(
                            text = state.birthDateError,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                    state.birthDateValid && state.calculatedAge != null -> {
                        val ageText = if (state.isAdult) {
                            "Alder: ${state.calculatedAge} år (voksen - ID kræves)"
                        } else {
                            "Alder: ${state.calculatedAge} år (barn)"
                        }
                        Text(
                            text = ageText,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        )

        if (showBirthDatePicker) {
            DatePickerDialog(
                onDismissRequest = { showBirthDatePicker = false },
                confirmButton = {
                    TextButton(
                        onClick = {
                            birthDatePickerState.selectedDateMillis?.let { millis ->
                                val selectedDate = kotlinx.datetime.Instant.fromEpochMilliseconds(millis)
                                    .toLocalDateTime(timeZone).date
                                val formatted = String.format(
                                    Locale.getDefault(),
                                    "%02d-%02d-%04d",
                                    selectedDate.dayOfMonth,
                                    selectedDate.monthNumber,
                                    selectedDate.year
                                )
                                onBirthDateChange(formatted)
                            }
                            showBirthDatePicker = false
                        }
                    ) {
                        Text("OK")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showBirthDatePicker = false }) {
                        Text("Annuller")
                    }
                }
            ) {
                DatePicker(
                    state = birthDatePickerState,
                    title = { Text("Vælg fødselsdato", modifier = Modifier.padding(16.dp)) }
                )
            }
        }
        
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
                keyboardOptions = KeyboardOptions(
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
            enabled = state.firstName.isNotBlank() && state.lastName.isNotBlank() && state.birthDateValid
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
    modifier: Modifier = Modifier,
    stepLabel: String = "Tag billede",
    useFrontCamera: Boolean = true,
    instructionText: String? = null
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    val cameraSelector = if (useFrontCamera) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA

    // Rebind camera when selector changes
    DisposableEffect(useFrontCamera) {
        onDispose { }
    }

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
                    text = stepLabel,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            if (instructionText != null) {
                Text(
                    text = instructionText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 48.dp, top = 4.dp)
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
                    previewView.scaleX = if (useFrontCamera) -1f else 1f

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
                            cameraSelector,
                            preview,
                            imageCapture
                        )
                    } catch (e: Exception) {
                        onPhotoError("Kamerafejl: ${e.message}")
                    }
                }, ContextCompat.getMainExecutor(ctx))

                previewView
            },
            modifier = Modifier.fillMaxSize(),
            update = { view ->
                view.scaleX = if (useFrontCamera) -1f else 1f
            }
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

/**
 * Photo preview screen with Accept/Retake options.
 * Used for both profile photo and ID photo preview.
 */
@Composable
fun PhotoPreviewScreen(
    photoPath: String,
    onAccept: () -> Unit,
    onRetake: () -> Unit,
    stepLabel: String,
    photoLabel: String,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Header
        Text(
            text = stepLabel,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp)
        )

        Text(
            text = photoLabel,
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        // Photo preview
        Card(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            if (photoPath.isNotBlank()) {
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(File(photoPath))
                        .crossfade(true)
                        .build(),
                    contentDescription = photoLabel,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Intet billede",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        Text(
            text = "Er billedet tydeligt og korrekt?",
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(vertical = 16.dp)
        )

        // Action buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedButton(
                onClick = onRetake,
                modifier = Modifier.weight(1f)
            ) {
                Icon(
                    Icons.Default.CameraAlt,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Tag nyt")
            }

            Button(
                onClick = onAccept,
                modifier = Modifier.weight(1f)
            ) {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Godkend")
            }
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
    Box(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Step label is now shown in the RegistrationStepIndicator

            if (state.saveSuccess) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    )
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Default.CheckCircle, "Succes")
                            Text(
                                "Prøvemedlem oprettet!",
                                style = MaterialTheme.typography.titleMedium
                            )
                        }
                        if (state.createdMemberName != null) {
                            Text(
                                state.createdMemberName,
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                        Text(
                            "Kan tjekke ind nu",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
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
                val guardianToggleEnabled = !state.birthDateValid || state.isAdult
                Checkbox(
                    checked = if (guardianToggleEnabled) state.showGuardianFields else true,
                    onCheckedChange = onToggleGuardianFields,
                    enabled = guardianToggleEnabled
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
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words)
                        )

                        OutlinedTextField(
                            value = state.guardianPhone,
                            onValueChange = onGuardianPhoneChange,
                            label = { Text("Værge telefon") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone
                            )
                        )

                        OutlinedTextField(
                            value = state.guardianEmail,
                            onValueChange = onGuardianEmailChange,
                            label = { Text("Værge e-mail") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
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

        if (state.isSaving) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.85f)),
                contentAlignment = Alignment.Center
            ) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surface
                    )
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        CircularProgressIndicator()
                        Text(
                            text = "Gemmer medlem...",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = "Vent venligst",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
