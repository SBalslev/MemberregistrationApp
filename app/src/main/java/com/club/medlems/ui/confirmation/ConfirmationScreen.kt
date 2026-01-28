package com.club.medlems.ui.confirmation

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.ui.util.IdleCountdown
import com.club.medlems.data.dao.MemberDao
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.launch
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

@Composable
fun ConfirmationScreen(
    memberId: String,
    isTrial: Boolean = false,
    onAddSession: () -> Unit,
    onDone: () -> Unit,
    vm: ConfirmationViewModel = hiltViewModel()
) {
    var seconds by remember { mutableStateOf(8) }
    val name by vm.memberName.collectAsState()
    LaunchedEffect(memberId) { vm.load(memberId) }
    // Use IdleCountdown to unify idle logic.
    // Extended to 8 seconds to give users more time to read and decide
    IdleCountdown(
        totalSeconds = 8,
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
        val label = name?.takeIf { it.isNotBlank() }?.let { "$memberId – $it" } ?: memberId
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Medlem $label er tjekket ind")
            if (isTrial) {
                Surface(
                    color = MaterialTheme.colorScheme.tertiaryContainer,
                    shape = MaterialTheme.shapes.small
                ) {
                    Text(
                        "Prøvemedlem",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onTertiaryContainer
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text("Går automatisk tilbage om $seconds s")
        Spacer(Modifier.height(16.dp))
    Button(onClick = { onAddSession() }) { Text("Tilføj skydning") }
        Spacer(Modifier.height(8.dp))
    Button(onClick = { onDone() }) { Text("Færdig") }
    }
}

@HiltViewModel
class ConfirmationViewModel @Inject constructor(private val memberDao: MemberDao): ViewModel() {
    private val _memberName = MutableStateFlow<String?>(null)
    val memberName: StateFlow<String?> = _memberName
    fun load(id: String) {
        viewModelScope.launch {
            val m = memberDao.get(id)
            _memberName.value = m?.let { listOfNotNull(it.firstName, it.lastName).joinToString(" ").trim().ifBlank { null } }
        }
    }
}
