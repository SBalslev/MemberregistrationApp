package com.club.medlems.ui.sync

import com.club.medlems.data.sync.DiscoveryProgress
import com.club.medlems.data.sync.DeviceType
import com.club.medlems.data.sync.SyncLogManager
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.data.sync.SyncOutboxManager
import com.club.medlems.data.sync.SyncResult
import com.club.medlems.data.sync.SyncState
import com.club.medlems.domain.prefs.DeviceConfigPreferences
import com.club.medlems.network.DeviceDiscoveryService
import com.club.medlems.network.DiscoveredDevice
import com.club.medlems.network.SyncClient
import com.club.medlems.network.TrustManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.datetime.Instant
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import java.net.InetAddress

@OptIn(ExperimentalCoroutinesApi::class)
class SyncViewModelTest {
    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `pairWithDevice requires code`() = runTest {
        val syncManager = mock<SyncManager> {
            on { syncState } doReturn MutableStateFlow(SyncState.IDLE)
            on { lastSyncTime } doReturn MutableStateFlow<Instant?>(null)
            on { lastSyncResult } doReturn MutableStateFlow<SyncResult?>(null)
            on { pendingChangesCount } doReturn MutableStateFlow(0)
            on { isNetworkAvailable } doReturn MutableStateFlow(true)
            on { discoveryProgress } doReturn MutableStateFlow(DiscoveryProgress())
        }
        val discoveryService = mock<DeviceDiscoveryService> {
            on { discoveredDevices } doReturn MutableStateFlow(emptyList())
        }
        val trustManager = mock<TrustManager> {
            on { trustedDevices } doReturn MutableStateFlow(emptyList())
            on { getThisDeviceId() } doReturn "device-1"
        }
        val syncLogManager = mock<SyncLogManager> {
            on { logEntries } doReturn MutableStateFlow(emptyList())
        }
        val deviceConfigPreferences = mock<DeviceConfigPreferences>()
        val syncClient = mock<SyncClient>()
        val syncOutboxManager = mock<SyncOutboxManager> {
            on { observePendingCount() } doReturn MutableStateFlow(0)
            on { observeFailedCount() } doReturn MutableStateFlow(0)
        }

        val viewModel = SyncViewModel(
            syncManager,
            discoveryService,
            trustManager,
            syncLogManager,
            deviceConfigPreferences,
            syncClient,
            syncOutboxManager
        )

        val device = DiscoveredDevice(
            deviceId = "laptop-1",
            deviceType = DeviceType.LAPTOP,
            deviceName = "Laptop",
            address = InetAddress.getByName("192.168.1.10"),
            port = 8085,
            schemaVersion = "1.2.0",
            networkId = "net-1",
            lastSeen = 0L
        )

        viewModel.pairWithDevice(device)
        advanceUntilIdle()

        val state = viewModel.pairingState.value
        assertTrue(state is PairingState.Error)
        assertEquals("Parring kræver kode", (state as PairingState.Error).message)
    }
}
