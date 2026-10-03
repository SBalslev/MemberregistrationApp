package com.club.medlems.data.sync

import com.club.medlems.data.dao.ActivityDao
import com.club.medlems.data.entity.ActivityStatus
import com.club.medlems.data.entity.ActivityType
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Instant
import org.junit.Assert.assertEquals
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify

class SyncRepositoryActivityTest {
    @Test
    fun `applies activities when payload contains no practice sessions`() = runTest {
        val activityDao: ActivityDao = mock()
        val repository = SyncRepository(
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
}
