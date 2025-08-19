package com.club.medlems.ui.leaderboard

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.animation.animateColorAsState
import androidx.compose.runtime.getValue
import androidx.compose.material3.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.ui.common.displayName
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeaderboardScreen(onBack: () -> Unit, vm: LeaderboardViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    var selectedType by remember { mutableStateOf<PracticeType?>(null) }
    // Ensure data loads on first open
    LaunchedEffect(Unit) { vm.setRange(state.range) }
    Scaffold(topBar = {
    TopAppBar(title = { Text("Resultatliste") }, navigationIcon = {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Tilbage") }
        }, actions = {
            FilterChip(selected = state.range == LeaderboardRange.TODAY, onClick = { vm.setRange(LeaderboardRange.TODAY) }, label = { Text("I dag") })
            Spacer(Modifier.width(8.dp))
            FilterChip(selected = state.range == LeaderboardRange.THIS_MONTH, onClick = { vm.setRange(LeaderboardRange.THIS_MONTH) }, label = { Text("Denne måned") })
            Spacer(Modifier.width(8.dp))
            FilterChip(selected = state.range == LeaderboardRange.LAST_12_MONTHS, onClick = { vm.setRange(LeaderboardRange.LAST_12_MONTHS) }, label = { Text("Sidste 12 mdr.") })
        })
    }) { pad ->
        if (state.loading) {
            Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else {
            Column(Modifier.fillMaxSize().padding(pad)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = selectedType == null, onClick = { selectedType = null }, label = { Text("Alle") })
                    PracticeType.values().forEach { pt ->
                        FilterChip(selected = selectedType == pt, onClick = { selectedType = pt }, label = { Text(pt.displayName) })
                    }
                }
                HorizontalDivider()
                LazyColumn(Modifier.fillMaxSize().padding(12.dp)) {
                    val types = (selectedType?.let { listOf(it) } ?: PracticeType.values().toList())
                    val typesToRender = types.filter { t ->
                        state.groupedBest[t]?.any { (_, list) -> list.isNotEmpty() } == true
                    }
                    if (typesToRender.isEmpty()) {
                        item { 
                            Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                                Text("Ingen resultater", style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    } else {
                        typesToRender.forEach { type ->
                            val byCls = state.groupedBest[type].orEmpty().filterValues { it.isNotEmpty() }
                            item { Text(type.displayName, style = MaterialTheme.typography.titleMedium) }
                            byCls.toSortedMap().forEach { (cls, list) ->
                                val label = if (cls.isBlank()) "Uklassificeret" else cls
                                item { Text(label, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 6.dp)) }
                                item { Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) { Text("Medlem", Modifier.weight(1f)); Text("Points/Krydser") } }
                                items(list, key = { it.practiceType.name + ":" + (it.classification ?: "") + ":" + it.membershipId }) { entry ->
                                    val key = entry.practiceType.name + ":" + entry.membershipId
                                    val isNew = state.justAddedKeys.contains(key)
                                    val targetColor = if (isNew) MaterialTheme.colorScheme.primary.copy(alpha = 0.25f) else MaterialTheme.colorScheme.background
                                    val bg by animateColorAsState(targetValue = targetColor, label = "lbItemBg")
                                    Row(
                                        Modifier.fillMaxWidth().padding(vertical = 4.dp).background(bg).padding(4.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        val name = entry.memberName
                                        val left = if (name.isNullOrBlank()) entry.membershipId else "${entry.membershipId} – ${name}"
                                        Text(left, Modifier.weight(1f))
                                        Text("${entry.points}${entry.krydser?.let { "/$it" } ?: ""}")
                                    }
                                }
                            }
                            item { Spacer(Modifier.height(12.dp)) }
                        }
                    }
                }
            }
        }
    }
}
