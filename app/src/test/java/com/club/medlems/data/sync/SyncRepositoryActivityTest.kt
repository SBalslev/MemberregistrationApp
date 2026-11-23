package com.club.medlems.data.sync

import com.club.medlems.data.dao.ActivityDao
import com.club.medlems.data.entity.Activity
import com.club.medlems.data.entity.ActivityStatus
import com.club.medlems.data.entity.ActivityType
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Instant
import org.junit.Assert.assertEquals
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.never
import org.mockito.kotlin.whenever

class SyncRepositoryActivityTest {
    @Test
    fun `activity completion survives stale sync while newer restart is allowed`() = runTest {
        val earlier = Instant.parse("2026-11-23T17:00:00Z")
        val closedAt = Instant.parse("2026-11-23T18:00:00Z")
        val later = Instant.parse("2026-11-23T19:00:00Z")
        val completed = Activity(
            id = "activity",
            title = "Klubskydning",
            type = ActivityType.COMPETITION,
            startsAtUtc = earlier,
            endsAtUtc = closedAt,
            status = ActivityStatus.COMPLETED,
            createdAtUtc = earlier,
            updatedAtUtc = closedAt,
            syncVersion = 2
        )
        val incoming = SyncableActivity(
            id = completed.id, title = completed.title, type = completed.type,
            startsAtUtc = earlier, status = ActivityStatus.ACTIVE, displayEnabled = true,
            deviceId = "trainer", syncVersion = 99, createdAtUtc = earlier,
            modifiedAtUtc = earlier
        )
        val cases = listOf(
            Triple(completed, incoming, false),
            Triple(completed, incoming.copy(modifiedAtUtc = closedAt), false),
            Triple(completed, incoming.copy(modifiedAtUtc = later), true),
            Triple(completed, incoming.copy(status = ActivityStatus.COMPLETED, modifiedAtUtc = closedAt, syncVersion = 2), false),
            Triple(completed.copy(status = ActivityStatus.ACTIVE, updatedAtUtc = earlier, syncVersion = 99),
                incoming.copy(status = ActivityStatus.COMPLETED, modifiedAtUtc = closedAt, endsAtUtc = closedAt, syncVersion = 2), true),
            Triple(completed.copy(status = ActivityStatus.ACTIVE),
                incoming.copy(status = ActivityStatus.COMPLETED, modifiedAtUtc = closedAt, syncVersion = 2), true)
        )
        for ((local, remote, applied) in cases) {
            val dao: ActivityDao = mock()
            whenever(dao.get(local.id)).thenReturn(local)
            val result = repository(dao).applySyncPayload(
                SyncPayload(deviceId = "trainer", deviceType = DeviceType.TRAINER_TABLET,
                    timestamp = later, entities = SyncEntities(activities = listOf(remote))),
                "trainer"
            )
            assertEquals(if (applied) 1 else 0, result.activitiesProcessed)
            if (applied) verify(dao).upsert(any()) else verify(dao, never()).upsert(any())
        }
    }

    @Test
    fun `applies activities when payload contains no practice sessions`() = runTest {
        val activityDao: ActivityDao = mock()
        val repository = repository(activityDao)
        val timestamp = Instant.parse("2026-10-03T11:00:00Z")
        val activity = SyncableActivity(
            id = "activity-1",
            title = "Skydesportens Dag 2026",
            type = ActivityType.OPEN_DAY,
            startsAtUtc = timestamp,
            status = ActivityStatus.ACTIVE,
            displayEnabled = true,
            deviceId = "trainer",
            syncVersion = 1,
            createdAtUtc = timestamp,
            modifiedAtUtc = timestamp
        )
        val payload = SyncPayload(
            deviceId = "trainer",
            deviceType = DeviceType.TRAINER_TABLET,
            timestamp = timestamp,
            entities = SyncEntities(activities = listOf(activity))
        )

        val result = repository.applySyncPayload(payload, "trainer")

        assertEquals(1, result.activitiesProcessed)
        verify(activityDao).upsert(any())
    }

    private fun repository(activityDao: ActivityDao) = SyncRepository(
            context = mock(),
            memberDao = mock(),
            checkInDao = mock(),
            activityDao = activityDao,
            activityGuestDao = mock(),
            guestResultDao = mock(),
            practiceSessionDao = mock(),
            scanEventDao = mock(),
            newMemberRegistrationDao = mock(),
            equipmentItemDao = mock(),
            equipmentCheckoutDao = mock(),
            memberPreferenceDao = mock(),
            trainerInfoDao = mock(),
            trainerDisciplineDao = mock(),
            conflictDetector = mock(),
            conflictRepository = mock(),
            deviceConfigPreferences = mock(),
            lastClassificationStore = mock()
        )
}
