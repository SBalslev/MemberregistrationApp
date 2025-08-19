package com.club.medlems.ui.confirmation

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.ui.util.IdleCountdown

@Composable
fun ConfirmationScreen(
    memberId: String,
    onAddSession: () -> Unit,
    onDone: () -> Unit,
    vm: ConfirmationViewModel = hiltViewModel()
) {
    var seconds by remember { mutableStateOf(5) }
    // Use IdleCountdown to unify idle logic.
    IdleCountdown(
        totalSeconds = 5,
        restartKey = Unit,
        active = true,
        onTick = { seconds = it },
        onTimeout = { onDone() }
    )
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Medlem $memberId er tjekket ind")
        Spacer(Modifier.height(8.dp))
        Text("Går automatisk tilbage om $seconds s")
        Spacer(Modifier.height(16.dp))
    Button(onClick = { onAddSession() }) { Text("Tilføj skydning") }
        Spacer(Modifier.height(8.dp))
    Button(onClick = { onDone() }) { Text("Færdig") }
    }
}
