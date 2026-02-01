package com.club.medlems.domain.minidraet

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class MinIdraetSearchRequest(
    val type: String,
    val query: String,
    @SerialName("max_rows") val maxRows: Int? = null
)

@Serializable
data class MinIdraetSearchResult(
    val text: String,
    val url: String,
    val idraet: String? = null
)

@Serializable
data class MinIdraetSearchResponse(
    val query: String,
    val type: String,
    val results: List<MinIdraetSearchResult> = emptyList(),
    @SerialName("fetched_at") val fetchedAt: String? = null,
    @SerialName("base_url") val baseUrl: String? = null
)

enum class MinIdraetSearchType(val apiValue: String, val label: String) {
    FORENING("forening", "Forening"),
    SPILLESTED("spillested", "Spillested"),
    UDOVER("udover", "Udøver/Skytte")
}
