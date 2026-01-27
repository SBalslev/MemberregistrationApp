package com.club.medlems.ui.trainer.history

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.ui.common.Formatters
import com.club.medlems.ui.common.displayName
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.toLocalDateTime

/**
 * History screen for viewing historical check-ins and practice sessions.
 *
 * Features:
 * - Date range picker with max 90 days lookback
 * - Member name search filter
 * - Discipline dropdown filter
 * - Tabs for Check-ins and Sessions
 * - Paginated lazy loading
 * - Read-only view (no editing)
 *
 * @see [Phase 5: Historical Data] - Trainer App Historical Data Viewing
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    onNavigateBack: () -> Unit,
    viewModel: HistoryViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    // Handle errors
    LaunchedEffect(state.error) {
        state.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearError()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Historik") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Tilbage"
                        )
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Date range selector
            DateRangeSelector(
                startDate = state.startDate,
                endDate = state.endDate,
                minSelectableDate = state.minSelectableDate,
                onDateRangeChanged = { start, end ->
                    viewModel.setDateRange(start, end)
                }
            )

            HorizontalDivider()

            // Filter row
            FilterRow(
                memberFilter = state.memberFilter,
                disciplineFilter = state.disciplineFilter,
                onMemberFilterChanged = { viewModel.setMemberFilter(it) },
                onDisciplineFilterChanged = { viewModel.setDisciplineFilter(it) }
            )

            HorizontalDivider()

            // Tabs
            TabRow(
                selectedTabIndex = state.activeTab.ordinal
            ) {
                Tab(
                    selected = state.activeTab == HistoryTab.CHECK_INS,
                    onClick = { viewModel.setActiveTab(HistoryTab.CHECK_INS) },
                    text = { Text("Check-ins") }
                )
                Tab(
                    selected = state.activeTab == HistoryTab.SESSIONS,
                    onClick = { viewModel.setActiveTab(HistoryTab.SESSIONS) },
                    text = { Text("Sessioner") }
                )
            }

            // Content
            when (state.activeTab) {
                HistoryTab.CHECK_INS -> CheckInHistoryList(
                    items = state.checkInHistory,
                    isLoading = state.isLoading,
                    hasMore = state.hasMoreCheckIns,
                    onLoadMore = { viewModel.loadMore() }
                )
                HistoryTab.SESSIONS -> SessionHistoryList(
                    items = state.sessionHistory,
                    isLoading = state.isLoading,
                    hasMore = state.hasMoreSessions,
                    onLoadMore = { viewModel.loadMore() }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateRangeSelector(
    startDate: LocalDate,
    endDate: LocalDate,
    minSelectableDate: LocalDate,
    onDateRangeChanged: (LocalDate, LocalDate) -> Unit
) {
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Start date
        DateField(
            label = "Fra",
            date = startDate,
            onClick = { showStartPicker = true },
            modifier = Modifier.weight(1f)
        )

        // End date
        DateField(
            label = "Til",
            date = endDate,
            onClick = { showEndPicker = true },
            modifier = Modifier.weight(1f)
        )
    }

    // Start date picker dialog
    if (showStartPicker) {
        val tz = TimeZone.currentSystemDefault()
        val initialMillis = startDate.atStartOfDayIn(tz).toEpochMilliseconds()
        val minMillis = minSelectableDate.atStartOfDayIn(tz).toEpochMilliseconds()
        val maxMillis = endDate.atStartOfDayIn(tz).toEpochMilliseconds()

        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = initialMillis
        )

        DatePickerDialog(
            onDismissRequest = { showStartPicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePickerState.selectedDateMillis?.let { millis ->
                            val selected = Instant.fromEpochMilliseconds(millis)
                                .toLocalDateTime(tz).date
                            // Validate selection
                            if (selected >= minSelectableDate && selected <= endDate) {
                                onDateRangeChanged(selected, endDate)
                            }
                        }
                        showStartPicker = false
                    }
                ) {
                    Text("OK")
                }
            },
            dismissButton = {
                TextButton(onClick = { showStartPicker = false }) {
                    Text("Annuller")
                }
            }
        ) {
            DatePicker(
                state = datePickerState,
                title = { Text("Vælg startdato", modifier = Modifier.padding(16.dp)) }
            )
        }
    }

    // End date picker dialog
    if (showEndPicker) {
        val tz = TimeZone.currentSystemDefault()
        val initialMillis = endDate.atStartOfDayIn(tz).toEpochMilliseconds()
        val today = kotlinx.datetime.Clock.System.now().toLocalDateTime(tz).date

        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = initialMillis
        )

        DatePickerDialog(
            onDismissRequest = { showEndPicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePickerState.selectedDateMillis?.let { millis ->
                            val selected = Instant.fromEpochMilliseconds(millis)
                                .toLocalDateTime(tz).date
                            // Validate selection
                            if (selected >= startDate && selected <= today) {
                                onDateRangeChanged(startDate, selected)
                            }
                        }
                        showEndPicker = false
                    }
                ) {
                    Text("OK")
                }
            },
            dismissButton = {
                TextButton(onClick = { showEndPicker = false }) {
                    Text("Annuller")
                }
            }
        ) {
            DatePicker(
                state = datePickerState,
                title = { Text("Vælg slutdato", modifier = Modifier.padding(16.dp)) }
            )
        }
    }
}

@Composable
private fun DateField(
    label: String,
    date: LocalDate,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.height(56.dp),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                Icons.Default.CalendarToday,
                contentDescription = null,
                modifier = Modifier.size(20.dp)
            )
            Column {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall
                )
                Text(
                    text = Formatters.daDate(date),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
private fun FilterRow(
    memberFilter: String,
    disciplineFilter: PracticeType?,
    onMemberFilterChanged: (String) -> Unit,
    onDisciplineFilterChanged: (PracticeType?) -> Unit
) {
    var showDisciplineMenu by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Member search field
        OutlinedTextField(
            value = memberFilter,
            onValueChange = onMemberFilterChanged,
            modifier = Modifier.weight(1f),
            placeholder = { Text("Søg medlem") },
            leadingIcon = {
                Icon(
                    Icons.Default.Search,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
            },
            singleLine = true
        )

        // Discipline dropdown
        Box {
            FilterChip(
                selected = disciplineFilter != null,
                onClick = { showDisciplineMenu = true },
                label = {
                    Text(disciplineFilter?.displayName ?: "Alle discipliner")
                }
            )

            DropdownMenu(
                expanded = showDisciplineMenu,
                onDismissRequest = { showDisciplineMenu = false }
            ) {
                DropdownMenuItem(
                    text = { Text("Alle discipliner") },
                    onClick = {
                        onDisciplineFilterChanged(null)
                        showDisciplineMenu = false
                    }
                )
                HorizontalDivider()
                PracticeType.entries.forEach { type ->
                    DropdownMenuItem(
                        text = { Text(type.displayName) },
                        onClick = {
                            onDisciplineFilterChanged(type)
                            showDisciplineMenu = false
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun CheckInHistoryList(
    items: List<CheckInHistoryItem>,
    isLoading: Boolean,
    hasMore: Boolean,
    onLoadMore: () -> Unit
) {
    val listState = rememberLazyListState()

    // Detect when scrolled near the end to trigger load more
    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisibleItem = listState.layoutInfo.visibleItemsInfo.lastOrNull()
            lastVisibleItem != null && lastVisibleItem.index >= items.size - 5
        }
    }

    LaunchedEffect(listState) {
        snapshotFlow { shouldLoadMore }
            .distinctUntilChanged()
            .filter { it && hasMore && !isLoading }
            .collect { onLoadMore() }
    }

    if (items.isEmpty() && !isLoading) {
        EmptyState(message = "Ingen check-ins i den valgte periode")
    } else {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Group items by date
            val groupedByDate = items.groupBy { it.localDate }
                .toSortedMap(compareByDescending { it })

            groupedByDate.forEach { (date, dateItems) ->
                item(key = "header_$date") {
                    DateHeader(date = date)
                }

                items(
                    items = dateItems,
                    key = { it.id }
                ) { item ->
                    CheckInHistoryCard(item = item)
                }
            }

            // Load more button/indicator
            if (hasMore) {
                item(key = "load_more") {
                    LoadMoreButton(
                        isLoading = isLoading,
                        onClick = onLoadMore
                    )
                }
            }
        }
    }
}

@Composable
private fun SessionHistoryList(
    items: List<SessionHistoryItem>,
    isLoading: Boolean,
    hasMore: Boolean,
    onLoadMore: () -> Unit
) {
    val listState = rememberLazyListState()

    // Detect when scrolled near the end to trigger load more
    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisibleItem = listState.layoutInfo.visibleItemsInfo.lastOrNull()
            lastVisibleItem != null && lastVisibleItem.index >= items.size - 5
        }
    }

    LaunchedEffect(listState) {
        snapshotFlow { shouldLoadMore }
            .distinctUntilChanged()
            .filter { it && hasMore && !isLoading }
            .collect { onLoadMore() }
    }

    if (items.isEmpty() && !isLoading) {
        EmptyState(message = "Ingen sessioner i den valgte periode")
    } else {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Group items by date
            val groupedByDate = items.groupBy { it.localDate }
                .toSortedMap(compareByDescending { it })

            groupedByDate.forEach { (date, dateItems) ->
                item(key = "header_$date") {
                    DateHeader(date = date)
                }

                items(
                    items = dateItems,
                    key = { it.id }
                ) { item ->
                    SessionHistoryCard(item = item)
                }
            }

            // Load more button/indicator
            if (hasMore) {
                item(key = "load_more") {
                    LoadMoreButton(
                        isLoading = isLoading,
                        onClick = onLoadMore
                    )
                }
            }
        }
    }
}

@Composable
private fun DateHeader(date: LocalDate) {
    val formattedDate = formatDanishDate(date)
    Text(
        text = formattedDate,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(vertical = 8.dp)
    )
}

@Composable
private fun CheckInHistoryCard(item: CheckInHistoryItem) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Time
                Text(
                    text = formatTime(item.createdAtUtc),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.primary
                )

                // Member name
                Text(
                    text = item.memberName,
                    style = MaterialTheme.typography.bodyLarge
                )
            }

            // Membership ID badge if available
            item.membershipId?.let { id ->
                Box(
                    modifier = Modifier
                        .background(
                            color = MaterialTheme.colorScheme.primaryContainer,
                            shape = RoundedCornerShape(4.dp)
                        )
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = id,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
        }
    }
}

@Composable
private fun SessionHistoryCard(item: SessionHistoryItem) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Time
                Text(
                    text = formatTime(item.createdAtUtc),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.primary
                )

                Column {
                    // Member name
                    Text(
                        text = item.memberName,
                        style = MaterialTheme.typography.bodyLarge
                    )

                    // Discipline and classification
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = item.practiceType.displayName,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        item.classification?.let { cls ->
                            Text(
                                text = cls,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            // Points and krydser
            Column(
                horizontalAlignment = Alignment.End
            ) {
                Text(
                    text = "${item.points} pt",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                item.krydser?.let { k ->
                    Text(
                        text = "$k kr",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun LoadMoreButton(
    isLoading: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 16.dp),
        contentAlignment = Alignment.Center
    ) {
        if (isLoading) {
            CircularProgressIndicator(modifier = Modifier.size(32.dp))
        } else {
            OutlinedButton(onClick = onClick) {
                Text("Indlæs flere...")
            }
        }
    }
}

@Composable
private fun EmptyState(message: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                Icons.Default.History,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
    }
}

/**
 * Formats a LocalDate to Danish format: "21. jan 2026"
 */
private fun formatDanishDate(date: LocalDate): String {
    val dayOfMonth = date.dayOfMonth
    val month = when (date.monthNumber) {
        1 -> "jan"
        2 -> "feb"
        3 -> "mar"
        4 -> "apr"
        5 -> "maj"
        6 -> "jun"
        7 -> "jul"
        8 -> "aug"
        9 -> "sep"
        10 -> "okt"
        11 -> "nov"
        12 -> "dec"
        else -> ""
    }
    return "$dayOfMonth. $month ${date.year}"
}

/**
 * Extracts and formats time from an ISO timestamp string.
 * Returns format: "HH:mm"
 */
private fun formatTime(isoTimestamp: String): String {
    return try {
        val instant = Instant.parse(isoTimestamp)
        val tz = TimeZone.currentSystemDefault()
        val localDateTime = instant.toLocalDateTime(tz)
        String.format("%02d:%02d", localDateTime.hour, localDateTime.minute)
    } catch (e: Exception) {
        "--:--"
    }
}
