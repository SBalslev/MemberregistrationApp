package com.club.medlems

import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.tooling.preview.Preview
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint
import com.club.medlems.ui.ready.ReadyScreen
import com.club.medlems.ui.confirmation.ConfirmationScreen
import com.club.medlems.ui.session.PracticeSessionScreen
import com.club.medlems.ui.leaderboard.LeaderboardScreen
import com.club.medlems.ui.importexport.ImportExportScreen
import com.club.medlems.ui.attendant.AttendantMenuScreen
import com.club.medlems.ui.display.EquipmentDisplayScreen
import com.club.medlems.ui.display.PracticeSessionDisplayScreen
import com.club.medlems.ui.trainer.TrainerAuthScreen
import com.club.medlems.ui.trainer.dashboard.TrainerDashboardScreen
import com.club.medlems.ui.trainer.dashboard.TrialMemberDetailScreen
import com.club.medlems.domain.security.AttendantModeManager
import com.club.medlems.domain.prefs.DeviceConfigPreferences
import javax.inject.Inject

@dagger.hilt.android.lifecycle.HiltViewModel
class RootViewModel @javax.inject.Inject constructor(
    val attendant: AttendantModeManager,
    val deviceConfig: DeviceConfigPreferences
): androidx.lifecycle.ViewModel()

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Keep screen on for kiosk usage
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContent { AppRoot() }
        enableImmersive()
    }

    private fun enableImmersive() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_FULLSCREEN
            )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enableImmersive()
    }
}

sealed class NavRoute(val route: String) {
    data object DeviceSetup: NavRoute("deviceSetup")
    data object Ready: NavRoute("ready")
    data object Confirmation: NavRoute("confirmation/{membershipId}/{scanEventId}/{isTrial}") {
        fun build(membershipId: String, scanEventId: String, isTrial: Boolean = false) = "confirmation/$membershipId/$scanEventId/$isTrial"
    }
    data object PracticeSession: NavRoute("session/{membershipId}/{scanEventId}") {
        fun build(membershipId: String, scanEventId: String) = "session/$membershipId/$scanEventId"
    }
    data object Leaderboard: NavRoute("leaderboard")
    data object ImportExport: NavRoute("importExport")
    data object AttendantMenu: NavRoute("attendantMenu")
    data object EditSessions: NavRoute("editSessions/{membershipId}") {
        fun build(membershipId: String) = "editSessions/$membershipId"
    }
    data object Registration: NavRoute("registration")
    
    // Equipment management routes (Trainer Tablet)
    data object EquipmentList: NavRoute("equipment")
    data object EquipmentCheckout: NavRoute("equipment/checkout/{equipmentId}") {
        fun build(equipmentId: String) = "equipment/checkout/$equipmentId"
        fun buildNoSelection() = "equipment/checkout/_"
    }
    data object CurrentCheckouts: NavRoute("equipment/checkouts")
    data object MemberEquipmentCheckout: NavRoute("trainer/members/{membershipId}/equipment") {
        fun build(membershipId: String) = "trainer/members/$membershipId/equipment"
    }
    
    // Trainer tablet member lookup
    data object MemberLookup: NavRoute("trainer/members")

    // MinIdraet search
    data object MinIdraetSearch: NavRoute("minidraet/search")
    
    // Conflict resolution (Trainer Tablet)
    data object ConflictResolution: NavRoute("trainer/conflicts")
    
    // Device pairing (sync network)
    data object DevicePairing: NavRoute("sync/pairing")

    // Trainer authentication flow
    data object TrainerAuth: NavRoute("trainer/auth")
    data object TrainerDashboard: NavRoute("trainer/dashboard")
    data object TrialMemberDetail: NavRoute("trainer/trial/{internalId}") {
        fun build(internalId: String) = "trainer/trial/$internalId"
    }
}

@Composable
fun AppRoot(
    navController: NavHostController = rememberNavController(),
    rootViewModel: RootViewModel = androidx.hilt.navigation.compose.hiltViewModel()
) {
    val attendantManager = rootViewModel.attendant
    val deviceConfig = rootViewModel.deviceConfig
    val attState by attendantManager.state.collectAsState()
    val setupComplete by deviceConfig.setupCompleteFlow.collectAsState()
    
    // Check if this is a display-only tablet (equipment or practice display)
    val isDisplayMode = BuildConfig.DISPLAY_MODE
    val deviceRole = BuildConfig.DEVICE_ROLE
    
    // Display mode tablets show full-screen status displays without navigation
    if (isDisplayMode) {
        Surface(color = MaterialTheme.colorScheme.background) {
            when (deviceRole) {
                "EQUIPMENT_DISPLAY" -> EquipmentDisplayScreen()
                "PRACTICE_DISPLAY" -> PracticeSessionDisplayScreen()
                else -> EquipmentDisplayScreen() // Default fallback
            }
        }
        return
    }
    
    // Determine start destination based on setup state and device role
    val isTrainerBuild = deviceConfig.isTrainerBuild
    val startDestination = when {
        !setupComplete -> NavRoute.DeviceSetup.route
        isTrainerBuild -> NavRoute.TrainerAuth.route
        else -> NavRoute.Ready.route
    }
    
    Surface(color = MaterialTheme.colorScheme.background) {
        NavHost(navController = navController, startDestination = startDestination) {
            composable(NavRoute.DeviceSetup.route) {
                com.club.medlems.ui.setup.DeviceSetupScreen(
                    onSetupComplete = {
                        val destination = if (isTrainerBuild) NavRoute.TrainerAuth.route else NavRoute.Ready.route
                        navController.navigate(destination) {
                            popUpTo(NavRoute.DeviceSetup.route) { inclusive = true }
                        }
                    }
                )
            }
            composable(NavRoute.Ready.route) {
                ReadyScreen(onFirstScan = { id, scanEventId, isTrial -> navController.navigate(NavRoute.Confirmation.build(id, scanEventId, isTrial)) },
                    onRepeatScan = { id, scanEventId, isTrial -> navController.navigate(NavRoute.PracticeSession.build(id, scanEventId)) },
                    openAttendant = {
                        if (attState.unlocked) navController.navigate(NavRoute.AttendantMenu.route)
                        else navController.navigate(NavRoute.AttendantMenu.route) // will show lock UI
                    },
                    openLeaderboard = { navController.navigate(NavRoute.Leaderboard.route) }
                )
            }
            composable(NavRoute.Confirmation.route) { backStackEntry ->
                val memberId = backStackEntry.arguments?.getString("membershipId") ?: "?"
                val scanEventId = backStackEntry.arguments?.getString("scanEventId") ?: "?"
                val isTrial = backStackEntry.arguments?.getString("isTrial")?.toBoolean() ?: false
                ConfirmationScreen(memberId = memberId, isTrial = isTrial,
                    onAddSession = { navController.navigate(NavRoute.PracticeSession.build(memberId, scanEventId)) },
                    onDone = { navController.popBackStack(NavRoute.Ready.route, inclusive = false) }
                )
            }
            composable(NavRoute.PracticeSession.route) { backStackEntry ->
                val memberId = backStackEntry.arguments?.getString("membershipId") ?: "?"
                val scanEventId = backStackEntry.arguments?.getString("scanEventId") ?: "?"
                PracticeSessionScreen(memberId = memberId, scanEventId = scanEventId,
                    onSaved = { navController.popBackStack(NavRoute.Ready.route, inclusive = false) },
                    onCancel = { navController.popBackStack() }
                )
            }
            composable(NavRoute.Leaderboard.route) {
                LeaderboardScreen(onBack = { navController.popBackStack() })
            }
            composable(NavRoute.ImportExport.route) {
                ImportExportScreen(onBack = { navController.popBackStack() })
            }
            composable(NavRoute.AttendantMenu.route) {
                AttendantMenuScreen(
                    openImportExport = { navController.navigate(NavRoute.ImportExport.route) },
                    openLeaderboard = { navController.navigate(NavRoute.Leaderboard.route) },
                    openPracticeSession = { memberId, scanEventId ->
                        navController.navigate(NavRoute.PracticeSession.build(memberId, scanEventId))
                    },
                    openEditSessions = { memberId -> navController.navigate(NavRoute.EditSessions.build(memberId)) },
                    openRegistration = { navController.navigate(NavRoute.Registration.route) },
                    openEquipmentList = { navController.navigate(NavRoute.EquipmentList.route) },
                    openCurrentCheckouts = { navController.navigate(NavRoute.CurrentCheckouts.route) },
                    openMemberLookup = { navController.navigate(NavRoute.MemberLookup.route) },
                    openMinIdraetSearch = { navController.navigate(NavRoute.MinIdraetSearch.route) },
                    openConflictResolution = { navController.navigate(NavRoute.ConflictResolution.route) },
                    openDevicePairing = { navController.navigate(NavRoute.DevicePairing.route) },
                    onBack = { navController.popBackStack() }
                )
            }
            composable(NavRoute.EditSessions.route) { backStackEntry ->
                val memberId = backStackEntry.arguments?.getString("membershipId") ?: "?"
                com.club.medlems.ui.attendant.EditSessionsScreen(memberId = memberId, onBack = { navController.popBackStack() })
            }
            composable(NavRoute.Registration.route) {
                com.club.medlems.ui.attendant.RegistrationScreen(onBack = { navController.popBackStack() })
            }
            
            // Equipment management screens (Trainer Tablet)
            composable(NavRoute.EquipmentList.route) {
                com.club.medlems.ui.equipment.EquipmentListScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToCheckout = { equipmentId ->
                        navController.navigate(NavRoute.EquipmentCheckout.build(equipmentId))
                    }
                )
            }
            composable(NavRoute.EquipmentCheckout.route) { backStackEntry ->
                val equipmentId = backStackEntry.arguments?.getString("equipmentId")?.takeIf { it != "_" }
                com.club.medlems.ui.equipment.EquipmentCheckoutScreen(
                    equipmentId = equipmentId,
                    onNavigateBack = { navController.popBackStack() },
                    onCheckoutComplete = { navController.popBackStack() }
                )
            }
            composable(NavRoute.CurrentCheckouts.route) {
                com.club.medlems.ui.equipment.CurrentCheckoutsScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            
            // Trainer tablet member lookup
            composable(NavRoute.MemberLookup.route) {
                com.club.medlems.ui.admin.MemberLookupScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToPracticeSession = { memberId, scanEventId ->
                        navController.navigate(NavRoute.PracticeSession.build(memberId, scanEventId))
                    },
                    onNavigateToEquipmentCheckout = { memberId ->
                        navController.navigate(NavRoute.MemberEquipmentCheckout.build(memberId))
                    }
                )
            }

            // MinIdraet search
            composable(NavRoute.MinIdraetSearch.route) {
                com.club.medlems.ui.admin.MinIdraetSearchScreen(
                    onBack = { navController.popBackStack() }
                )
            }
            
            // Trainer tablet equipment checkout with pre-selected member
            composable(NavRoute.MemberEquipmentCheckout.route) { backStackEntry ->
                val membershipId = backStackEntry.arguments?.getString("membershipId")
                com.club.medlems.ui.equipment.EquipmentCheckoutScreen(
                    equipmentId = null,
                    preselectedMembershipId = membershipId,
                    onNavigateBack = { navController.popBackStack() },
                    onCheckoutComplete = { navController.popBackStack() }
                )
            }
            
            // Conflict resolution screen (Trainer Tablet)
            composable(NavRoute.ConflictResolution.route) {
                com.club.medlems.ui.admin.ConflictResolutionScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            
            // Device pairing screen (sync network)
            composable(NavRoute.DevicePairing.route) {
                com.club.medlems.ui.sync.DevicePairingScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            // Trainer authentication screen
            composable(NavRoute.TrainerAuth.route) {
                TrainerAuthScreen(
                    onAuthenticated = { trainerId, trainerName ->
                        navController.navigate(NavRoute.TrainerDashboard.route) {
                            popUpTo(NavRoute.TrainerAuth.route) { inclusive = true }
                        }
                    },
                    onBack = {
                        // On trainer app, back from auth does nothing (it's the start screen)
                    }
                )
            }

            // Trainer dashboard screen
            composable(NavRoute.TrainerDashboard.route) {
                TrainerDashboardScreen(
                    onLogout = {
                        navController.navigate(NavRoute.TrainerAuth.route) {
                            popUpTo(NavRoute.TrainerDashboard.route) { inclusive = true }
                        }
                    },
                    onNavigateToEquipment = {
                        navController.navigate(NavRoute.EquipmentList.route)
                    },
                    onNavigateToCheckouts = {
                        navController.navigate(NavRoute.CurrentCheckouts.route)
                    },
                    onNavigateToAdmin = {
                        navController.navigate(NavRoute.AttendantMenu.route)
                    },
                    onNavigateToMinIdraetSearch = {
                        navController.navigate(NavRoute.MinIdraetSearch.route)
                    },
                    onNavigateToTrialMemberDetail = { internalId ->
                        navController.navigate(NavRoute.TrialMemberDetail.build(internalId))
                    }
                )
            }

            // Trial member detail screen (for viewing/editing trial member info and photos)
            composable(NavRoute.TrialMemberDetail.route) { backStackEntry ->
                val internalId = backStackEntry.arguments?.getString("internalId") ?: return@composable
                TrialMemberDetailScreen(
                    memberId = internalId,
                    onBack = { navController.popBackStack() }
                )
            }
        }
    }
}

@Preview
@Composable
fun PreviewRoot() { AppRoot() }
