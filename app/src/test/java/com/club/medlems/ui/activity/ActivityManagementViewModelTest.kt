package com.club.medlems.ui.activity

import androidx.lifecycle.viewModelScope
import com.club.medlems.data.dao.ActivityDao
import com.club.medlems.data.entity.Activity
import com.club.medlems.data.entity.ActivityStatus
import com.club.medlems.data.entity.ActivityType
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.data.sync.SyncOutboxManager
import com.club.medlems.network.TrustManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.datetime.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.times
import org.mockito.kotlin.whenever

class ActivityManagementViewModelTest {
    @Test
    fun `activity lifecycle persists and queues increasing versions`() = runTest {
        Dispatchers.setMain(UnconfinedTestDispatcher(testScheduler))
        val dao: ActivityDao = mock()
        val outbox: SyncOutboxManager = mock()
        val manager: SyncManager = mock()
        val trust: TrustManager = mock()
        whenever(dao.observeAll()).thenReturn(flowOf(emptyList()))
        whenever(dao.observeActive()).thenReturn(flowOf(null))
        whenever(trust.getThisDeviceId()).thenReturn("trainer")
        val viewModel = ActivityManagementViewModel(dao, mock(), mock(), outbox, manager, trust)
        val timestamp = Instant.parse("2026-11-23T18:00:00Z")
        val initial = Activity(
            id = "activity", title = "Klubskydning", type = ActivityType.COMPETITION,
            startsAtUtc = timestamp, status = ActivityStatus.ACTIVE,
            createdAtUtc = timestamp, updatedAtUtc = timestamp,
            syncVersion = 8, syncedAtUtc = timestamp
        )
        try {
            viewModel.complete(initial)
            val completed = argumentCaptor<Activity>()
            verify(dao).upsert(completed.capture())
            assertEquals(ActivityStatus.COMPLETED, completed.firstValue.status)
            assertEquals(9L, completed.firstValue.syncVersion)
            assertNull(completed.firstValue.syncedAtUtc)
            verify(outbox).queueActivity(eq(completed.firstValue), eq("trainer"))
            verify(manager).notifyEntityChanged("Activity", initial.id)

            org.mockito.kotlin.clearInvocations(dao, outbox, manager)
            viewModel.start(completed.firstValue)
            val restarted = argumentCaptor<Activity>()
            verify(dao).upsert(restarted.capture())
            assertEquals(ActivityStatus.ACTIVE, restarted.firstValue.status)
            assertEquals(10L, restarted.firstValue.syncVersion)
            assertNull(restarted.firstValue.endsAtUtc)
            verify(outbox).queueActivity(eq(restarted.firstValue), eq("trainer"))

            org.mockito.kotlin.clearInvocations(dao, outbox, manager)
            viewModel.updateActivity(restarted.firstValue, "Ny titel", ActivityType.TRAINING, false)
            val edited = argumentCaptor<Activity>()
            verify(dao).upsert(edited.capture())
            assertEquals(11L, edited.firstValue.syncVersion)
            verify(outbox).queueActivity(eq(edited.firstValue), eq("trainer"))

            org.mockito.kotlin.clearInvocations(dao, outbox, manager)
            whenever(dao.active()).thenReturn(initial)
            viewModel.createAndStart("Ny aktivitet", ActivityType.TRAINING)
            val changes = argumentCaptor<Activity>()
            verify(dao, times(2)).upsert(changes.capture())
            assertEquals(9L, changes.firstValue.syncVersion)
            assertEquals(ActivityStatus.COMPLETED, changes.firstValue.status)
            assertEquals(1L, changes.secondValue.syncVersion)
            verify(outbox).queueActivity(eq(changes.firstValue), eq("trainer"))
            verify(outbox).queueActivity(eq(changes.secondValue), eq("trainer"))
        } finally {
            viewModel.viewModelScope.cancel()
            Dispatchers.resetMain()
        }
    }
}
