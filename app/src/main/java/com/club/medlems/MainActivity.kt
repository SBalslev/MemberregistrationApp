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
import com.club.medlems.domain.security.AttendantModeManager
import javax.inject.Inject

@dagger.hilt.android.lifecycle.HiltViewModel
class RootViewModel @javax.inject.Inject constructor(
    val attendant: AttendantModeManager
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
    data object Ready: NavRoute("ready")
    data object Confirmation: NavRoute("confirmation/{membershipId}/{scanEventId}") {
        fun build(membershipId: String, scanEventId: String) = "confirmation/$membershipId/$scanEventId"
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
}

@Composable
fun AppRoot(
    navController: NavHostController = rememberNavController(),
    attendantManager: AttendantModeManager = androidx.hilt.navigation.compose.hiltViewModel<RootViewModel>().attendant
) {
    val attState by attendantManager.state.collectAsState()
    Surface(color = MaterialTheme.colorScheme.background) {
        NavHost(navController = navController, startDestination = NavRoute.Ready.route) {
            composable(NavRoute.Ready.route) {
                ReadyScreen(onFirstScan = { id, scanEventId -> navController.navigate(NavRoute.Confirmation.build(id, scanEventId)) },
                    onRepeatScan = { id, scanEventId -> navController.navigate(NavRoute.PracticeSession.build(id, scanEventId)) },
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
                ConfirmationScreen(memberId = memberId,
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
                    onBack = { navController.popBackStack() }
                )
            }
            composable(NavRoute.EditSessions.route) { backStackEntry ->
                val memberId = backStackEntry.arguments?.getString("membershipId") ?: "?"
                com.club.medlems.ui.attendant.EditSessionsScreen(memberId = memberId, onBack = { navController.popBackStack() })
            }
        }
    }
}

@Preview
@Composable
fun PreviewRoot() { AppRoot() }
