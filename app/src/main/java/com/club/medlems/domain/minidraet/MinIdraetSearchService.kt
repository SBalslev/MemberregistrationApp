package com.club.medlems.domain.minidraet

import android.util.Log
import com.club.medlems.BuildConfig
import com.club.medlems.data.sync.SyncJson
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MinIdraetSearchService @Inject constructor() {
    companion object {
        private const val TAG = "MinIdraetSearchService"
        private const val TIMEOUT_MS = 10_000L
    }

    private val client = HttpClient(CIO) {
        install(ContentNegotiation) {
            json(SyncJson.json)
        }
        install(HttpTimeout) {
            requestTimeoutMillis = TIMEOUT_MS
            connectTimeoutMillis = TIMEOUT_MS
            socketTimeoutMillis = TIMEOUT_MS
        }
    }

    suspend fun search(type: MinIdraetSearchType, query: String, maxRows: Int = 20): MinIdraetSearchResponse {
        val request = MinIdraetSearchRequest(
            type = type.apiValue,
            query = query,
            maxRows = maxRows
        )

        val url = "${BuildConfig.MINIDRAET_API_BASE_URL}/minidraet/search"

        return withContext(Dispatchers.IO) {
            val response = client.post(url) {
                contentType(ContentType.Application.Json)
                setBody(request)
            }

            if (!response.status.isSuccess()) {
                val errorBody = try {
                    response.body<String>()
                } catch (_: Exception) {
                    ""
                }
                Log.e(TAG, "Search failed: HTTP ${response.status.value} - $errorBody")
                throw IllegalStateException("Search failed: HTTP ${response.status.value}")
            }

            response.body()
        }
    }
}
