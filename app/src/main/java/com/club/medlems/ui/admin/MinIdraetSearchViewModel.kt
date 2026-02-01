package com.club.medlems.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.domain.minidraet.MinIdraetSearchResult
import com.club.medlems.domain.minidraet.MinIdraetSearchService
import com.club.medlems.domain.minidraet.MinIdraetSearchType
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MinIdraetSearchViewModel @Inject constructor(
    private val service: MinIdraetSearchService
) : ViewModel() {

    private val _state = MutableStateFlow(MinIdraetSearchState())
    val state: StateFlow<MinIdraetSearchState> = _state.asStateFlow()

    private var searchJob: Job? = null

    fun setType(type: MinIdraetSearchType) {
        _state.update { it.copy(type = type) }
        triggerSearch(_state.value.query)
    }

    fun onQueryChanged(query: String) {
        _state.update { it.copy(query = query, errorMessage = null) }
        triggerSearch(query)
    }

    private fun triggerSearch(query: String) {
        searchJob?.cancel()

        val trimmed = query.trim()
        if (trimmed.length < 3) {
            _state.update { it.copy(results = emptyList(), isSearching = false) }
            return
        }

        searchJob = viewModelScope.launch {
            delay(300)
            performSearch(trimmed)
        }
    }

    private suspend fun performSearch(query: String) {
        _state.update { it.copy(isSearching = true, errorMessage = null) }

        try {
            val response = service.search(_state.value.type, query)
            _state.update {
                it.copy(
                    results = response.results,
                    isSearching = false,
                    baseUrl = response.baseUrl ?: it.baseUrl
                )
            }
        } catch (ex: Exception) {
            _state.update {
                it.copy(
                    results = emptyList(),
                    isSearching = false,
                    errorMessage = ex.message ?: "Søgning fejlede"
                )
            }
        }
    }
}

data class MinIdraetSearchState(
    val type: MinIdraetSearchType = MinIdraetSearchType.FORENING,
    val query: String = "",
    val results: List<MinIdraetSearchResult> = emptyList(),
    val isSearching: Boolean = false,
    val errorMessage: String? = null,
    val baseUrl: String = "https://minidraet.dgi.dk"
)
