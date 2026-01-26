package com.club.medlems.ui.trainer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.TrainerInfoDao
import com.club.medlems.domain.security.AttendantModeManager
import com.club.medlems.domain.trainer.TrainerSessionManager
import com.club.medlems.domain.trainer.TrainerSessionState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Authentication state for trainer login flow.
 */
sealed class TrainerAuthState {
    /** Idle state, waiting for card scan */
    data object Idle : TrainerAuthState()

    /** Processing a scanned card */
    data object Scanning : TrainerAuthState()

    /** Successfully authenticated as trainer */
    data class Authenticated(
        val trainerId: String,
        val trainerName: String
    ) : TrainerAuthState()

    /** Access denied - member is not a trainer */
    data class Denied(
        val memberId: String,
        val memberName: String?,
        val reason: String
    ) : TrainerAuthState()

    /** Session is about to expire */
    data class SessionExpiring(
        val secondsRemaining: Int
    ) : TrainerAuthState()

    /** Error state */
    data class Error(val message: String) : TrainerAuthState()
}

/**
 * ViewModel for trainer authentication screen.
 *
 * Handles:
 * - Card scan processing
 * - Member lookup and trainer verification
 * - Session state management
 * - Extend/logout operations
 *
 * @see [trainer-experience/prd.md] Phase 2 - Trainer Authentication
 */
@HiltViewModel
class TrainerAuthViewModel @Inject constructor(
    private val memberDao: MemberDao,
    private val trainerInfoDao: TrainerInfoDao,
    private val trainerSessionManager: TrainerSessionManager,
    private val attendantModeManager: AttendantModeManager
) : ViewModel() {

    private val _authState = MutableStateFlow<TrainerAuthState>(TrainerAuthState.Idle)
    val authState: StateFlow<TrainerAuthState> = _authState.asStateFlow()

    /** Current session state from the session manager */
    val sessionState: StateFlow<TrainerSessionState> = trainerSessionManager.sessionState
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), TrainerSessionState())

    init {
        // Set up session expiring callback
        trainerSessionManager.onSessionExpiring = {
            val currentState = _authState.value
            if (currentState is TrainerAuthState.Authenticated) {
                _authState.value = TrainerAuthState.SessionExpiring(
                    secondsRemaining = trainerSessionManager.sessionState.value.secondsRemaining
                )
            }
        }

        // Set up session expired callback
        trainerSessionManager.onSessionExpired = {
            _authState.value = TrainerAuthState.Idle
        }

        // Observe session state to update auth state
        viewModelScope.launch {
            trainerSessionManager.sessionState.collect { session ->
                when {
                    !session.isSessionActive && _authState.value !is TrainerAuthState.Idle
                        && _authState.value !is TrainerAuthState.Scanning
                        && _authState.value !is TrainerAuthState.Denied
                        && _authState.value !is TrainerAuthState.Error -> {
                        // Session ended, return to idle
                        _authState.value = TrainerAuthState.Idle
                    }
                    session.isExpiring && session.isSessionActive -> {
                        // Update expiring countdown
                        _authState.value = TrainerAuthState.SessionExpiring(session.secondsRemaining)
                    }
                    session.isSessionActive && !session.isExpiring -> {
                        // Restore authenticated state if we were expiring
                        if (_authState.value is TrainerAuthState.SessionExpiring) {
                            _authState.value = TrainerAuthState.Authenticated(
                                trainerId = session.currentTrainerId ?: "",
                                trainerName = session.trainerName ?: ""
                            )
                        }
                    }
                }
            }
        }
    }

    /**
     * Handles a scanned membership card.
     *
     * Flow:
     * 1. Look up member by membershipId
     * 2. Check if member has trainer designation in TrainerInfo
     * 3. If trainer: start session, navigate to dashboard
     * 4. If not trainer: show "Adgang nægtet" message
     *
     * @param membershipId The scanned membership ID
     */
    fun onCardScanned(membershipId: String) {
        if (_authState.value is TrainerAuthState.Scanning) return

        viewModelScope.launch {
            _authState.value = TrainerAuthState.Scanning

            try {
                // Look up member by membershipId
                val member = memberDao.getByMembershipId(membershipId)
                    ?: memberDao.get(membershipId) // Fallback to combined lookup

                if (member == null) {
                    _authState.value = TrainerAuthState.Error("Medlem ikke fundet: $membershipId")
                    return@launch
                }

                val memberName = listOfNotNull(member.firstName, member.lastName)
                    .joinToString(" ")
                    .trim()
                    .ifEmpty { membershipId }

                // Check trainer status using internalId
                val trainerInfo = trainerInfoDao.get(member.internalId)

                if (trainerInfo != null && trainerInfo.isTrainer) {
                    // Authenticated as trainer
                    trainerSessionManager.startSession(member.internalId, memberName)
                    _authState.value = TrainerAuthState.Authenticated(
                        trainerId = member.internalId,
                        trainerName = memberName
                    )
                } else {
                    // Not a trainer - access denied
                    _authState.value = TrainerAuthState.Denied(
                        memberId = membershipId,
                        memberName = memberName,
                        reason = "Dette medlem er ikke registreret som træner"
                    )
                }
            } catch (e: Exception) {
                _authState.value = TrainerAuthState.Error(
                    e.message ?: "Ukendt fejl ved autentificering"
                )
            }
        }
    }

    /**
     * Extends the current session.
     * Called when user chooses to extend from the expiring dialog.
     */
    fun extendSession() {
        trainerSessionManager.extendSession()

        // Restore authenticated state
        val session = trainerSessionManager.sessionState.value
        if (session.isSessionActive) {
            _authState.value = TrainerAuthState.Authenticated(
                trainerId = session.currentTrainerId ?: "",
                trainerName = session.trainerName ?: ""
            )
        }
    }

    /**
     * Logs out the current trainer session.
     */
    fun logout() {
        trainerSessionManager.endSession()
        _authState.value = TrainerAuthState.Idle
    }

    /**
     * Registers user interaction to extend session timeout.
     */
    fun registerInteraction() {
        trainerSessionManager.registerInteraction()
    }

    /**
     * Resets auth state to idle (e.g., after showing denied message).
     */
    fun resetToIdle() {
        _authState.value = TrainerAuthState.Idle
    }

    /**
     * Clears error state.
     */
    fun clearError() {
        if (_authState.value is TrainerAuthState.Error) {
            _authState.value = TrainerAuthState.Idle
        }
    }

    /**
     * Authenticates using admin PIN.
     * This allows initial setup when no trainers are registered yet.
     *
     * @param pin The 4-digit PIN code
     * @return true if PIN was correct, false otherwise
     */
    fun onPinEntered(pin: String): Boolean {
        // Use AttendantModeManager to validate the PIN
        attendantModeManager.attemptUnlock(pin)

        val attendantState = attendantModeManager.state.value
        return if (attendantState.unlocked) {
            // PIN correct - authenticate as admin
            trainerSessionManager.startSession("ADMIN", "Administrator")
            _authState.value = TrainerAuthState.Authenticated(
                trainerId = "ADMIN",
                trainerName = "Administrator"
            )
            true
        } else {
            // PIN incorrect - show error
            val errorMsg = attendantState.error ?: "Forkert PIN"
            _authState.value = TrainerAuthState.Error(errorMsg)
            false
        }
    }

    /**
     * Gets the current PIN error state from AttendantModeManager.
     */
    fun getPinError(): String? = attendantModeManager.state.value.error

    /**
     * Gets cooldown remaining in milliseconds.
     */
    fun getCooldownRemaining(): Long = attendantModeManager.state.value.cooldownRemainingMs
}
