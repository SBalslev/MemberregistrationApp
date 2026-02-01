package com.club.medlems.ui.admin

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.domain.minidraet.MinIdraetSearchResult
import com.club.medlems.domain.minidraet.MinIdraetSearchType

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MinIdraetSearchScreen(
    onBack: () -> Unit,
    viewModel: MinIdraetSearchViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("DGI søgning") },
                navigationIcon = {
                    androidx.compose.material3.IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Tilbage")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Søg i Min Idræt efter foreninger, spillesteder eller udøvere.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = state.type == MinIdraetSearchType.FORENING,
                    onClick = { viewModel.setType(MinIdraetSearchType.FORENING) },
                    label = { Text("Forening") },
                    colors = FilterChipDefaults.filterChipColors()
                )
                FilterChip(
                    selected = state.type == MinIdraetSearchType.SPILLESTED,
                    onClick = { viewModel.setType(MinIdraetSearchType.SPILLESTED) },
                    label = { Text("Spillested") },
                    colors = FilterChipDefaults.filterChipColors()
                )
                FilterChip(
                    selected = state.type == MinIdraetSearchType.UDOVER,
                    onClick = { viewModel.setType(MinIdraetSearchType.UDOVER) },
                    label = { Text("Udøver/Skytte") },
                    colors = FilterChipDefaults.filterChipColors()
                )
            }

            OutlinedTextField(
                value = state.query,
                onValueChange = viewModel::onQueryChanged,
                modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                placeholder = { Text("Søg (mindst 3 tegn)") },
                singleLine = true
            )

            if (state.isSearching) {
                AssistChip(
                    onClick = { },
                    label = { Text("Søger...") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    enabled = false,
                    colors = AssistChipDefaults.assistChipColors(
                        disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                )
            }

            state.errorMessage?.let { message ->
                Text(
                    text = message,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            if (!state.isSearching && state.query.trim().length < 3) {
                Text(
                    text = "Indtast mindst 3 tegn for at søge.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            MinIdraetResultsList(
                results = state.results,
                baseUrl = state.baseUrl
            )
        }
    }
}

@Composable
private fun MinIdraetResultsList(
    results: List<MinIdraetSearchResult>,
    baseUrl: String
) {
    val context = LocalContext.current

    if (results.isEmpty()) {
        Spacer(modifier = Modifier.height(8.dp))
        return
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items(results) { result ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        val url = if (result.url.startsWith("http")) result.url else baseUrl + result.url
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        context.startActivity(intent)
                    },
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = result.text,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f)
                        )
                        Icon(
                            Icons.Default.OpenInNew,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    result.idraet?.let {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Idræt: $it",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
