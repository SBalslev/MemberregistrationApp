package com.club.medlems.data.sync

import android.content.Context
import android.util.Base64
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.CheckInDao
import com.club.medlems.data.dao.ActivityDao
import com.club.medlems.data.dao.ActivityGuestDao
import com.club.medlems.data.dao.GuestResultDao
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.dao.NewMemberRegistrationDao
import com.club.medlems.data.dao.EquipmentItemDao
import com.club.medlems.data.dao.EquipmentCheckoutDao
import com.club.medlems.data.dao.TrainerInfoDao
import com.club.medlems.data.dao.TrainerDisciplineDao
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberType
import com.club.medlems.domain.prefs.DeviceConfigPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kotlinx.datetime.Instant
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.Mockito.mockStatic
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

class TrainerMemberSyncTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    private val memberDao: MemberDao = mock()
    private val context: Context = mock()
    private val deviceConfig: DeviceConfigPreferences = mock()
    private val detector = ConflictDetector()
    private val timestamp = Instant.parse("2026-11-09T19:00:00Z")
    private val later = Instant.parse("2026-11-09T19:01:00Z")

    private fun member() = Member(
        internalId = "full-member",
        membershipId = "123",
        memberType = MemberType.FULL,
        firstName = "Test",
        lastName = "Member",
        registrationPhotoPath = "local-profile.jpg",
        idPhotoPath = "local-id.jpg",
        cardStatus = "requested",
        cardRequestedAtUtc = later.toString(),
        cardRequestedByDeviceId = "trainer",
        createdAtUtc = timestamp,
        updatedAtUtc = later,
        syncVersion = 6,
        syncedAtUtc = null
    )

    private fun snapshot(version: Long = 5, modified: Instant = timestamp) = SyncableMember(
        internalId = "full-member",
        membershipId = "123",
        memberType = MemberType.FULL,
        firstName = "Test",
        lastName = "Member",
        registrationPhotoPath = "another-device-profile.jpg",
        idPhotoPath = "another-device-id.jpg",
        cardStatus = "none",
        deviceId = "laptop",
        syncVersion = version,
        createdAtUtc = timestamp,
        modifiedAtUtc = modified
    )

    private fun repository(): SyncRepository {
        whenever(context.filesDir).thenReturn(temporaryFolder.root)
        whenever(deviceConfig.getDeviceType()).thenReturn(DeviceType.TRAINER_TABLET)
        return SyncRepository(
            context = context,
            memberDao = memberDao,
            checkInDao = mock<CheckInDao> {
                onBlocking { checkInsCreatedAfter(any()) } doReturn emptyList()
            },
            activityDao = mock<ActivityDao> {
                onBlocking { all() } doReturn emptyList()
            },
            activityGuestDao = mock<ActivityGuestDao> {
                onBlocking { all() } doReturn emptyList()
            },
            guestResultDao = mock<GuestResultDao> {
                onBlocking { all() } doReturn emptyList()
            },
            practiceSessionDao = mock<PracticeSessionDao> {
                onBlocking { sessionsCreatedAfter(any()) } doReturn emptyList()
            },
            scanEventDao = mock(),
            newMemberRegistrationDao = mock<NewMemberRegistrationDao> {
                onBlocking { registrationsCreatedAfter(any()) } doReturn emptyList()
            },
            equipmentItemDao = mock<EquipmentItemDao> {
                onBlocking { getUnsynced() } doReturn emptyList()
            },
            equipmentCheckoutDao = mock<EquipmentCheckoutDao> {
                onBlocking { getUnsynced() } doReturn emptyList()
            },
            memberPreferenceDao = mock(),
            trainerInfoDao = mock<TrainerInfoDao> {
                onBlocking { getUnsynced() } doReturn emptyList()
            },
            trainerDisciplineDao = mock<TrainerDisciplineDao> {
                onBlocking { getUnsynced() } doReturn emptyList()
            },
            conflictDetector = detector,
            conflictRepository = mock(),
            deviceConfigPreferences = deviceConfig,
            lastClassificationStore = mock()
        )
    }

    @Test
    fun `laptop push cannot overwrite a newer pending tablet card request`() = runTest {
        whenever(memberDao.getByInternalId("full-member")).thenReturn(member())
        val result = repository().applySyncPayload(
            SyncPayload(
                deviceId = "laptop",
                deviceType = DeviceType.LAPTOP,
                timestamp = later,
                entities = SyncEntities(members = listOf(snapshot()))
            ),
            "laptop"
        )

        assertEquals(0, result.membersProcessed)
        verify(memberDao, never()).upsert(any())
    }

    @Test
    fun `equal laptop acknowledgement keeps both device-local photo paths`() = runTest {
        whenever(memberDao.getByInternalId("full-member")).thenReturn(member())
        val incoming = snapshot(6, later).copy(
            cardStatus = "requested",
            cardRequestedAtUtc = later.toString(),
            cardRequestedByDeviceId = "trainer"
        )
        val result = repository().applySyncPayload(
            SyncPayload(
                deviceId = "laptop",
                deviceType = DeviceType.LAPTOP,
                timestamp = later,
                entities = SyncEntities(members = listOf(incoming))
            ),
            "laptop"
        )

        assertEquals(1, result.membersProcessed)
        val saved = argumentCaptor<Member>()
        verify(memberDao).upsert(saved.capture())
        assertEquals("local-profile.jpg", saved.firstValue.registrationPhotoPath)
        assertEquals("local-id.jpg", saved.firstValue.idPhotoPath)
        assertEquals("requested", saved.firstValue.cardStatus)
        assertEquals(later.toString(), saved.firstValue.cardRequestedAtUtc)
    }

    @Test
    fun `newer laptop changes remain authoritative`() {
        assertTrue(detector.shouldAcceptMemberUpdate(
            member(), snapshot(7, later), DeviceType.TRAINER_TABLET, DeviceType.LAPTOP
        ))
        assertTrue(detector.shouldAcceptMemberUpdate(
            member().copy(syncedAtUtc = later), snapshot(),
            DeviceType.TRAINER_TABLET, DeviceType.LAPTOP
        ))
    }

    @Test
    fun `pending tablet version survives clock skew in an older laptop snapshot`() {
        assertFalse(detector.shouldAcceptMemberUpdate(
            member().copy(updatedAtUtc = timestamp), snapshot(5, later),
            DeviceType.TRAINER_TABLET, DeviceType.LAPTOP
        ))
    }

    @Test
    fun `laptop pull includes both photos and current card request for full members`() = runTest {
        val profile = temporaryFolder.newFile("profile.jpg").apply { writeBytes(byteArrayOf(1, 2)) }
        val id = temporaryFolder.newFile("id.jpg").apply { writeBytes(byteArrayOf(3, 4)) }
        whenever(memberDao.allMembers()).thenReturn(listOf(member().copy(
            registrationPhotoPath = profile.absolutePath,
            idPhotoPath = id.absolutePath
        )))
        val repository = repository()

        withContext(Dispatchers.IO) {
            mockStatic(Base64::class.java).use { base64 ->
                base64.`when`<String> {
                    Base64.encodeToString(any<ByteArray>(), org.mockito.kotlin.eq(Base64.NO_WRAP))
                }.thenAnswer { invocation ->
                    java.util.Base64.getEncoder().encodeToString(invocation.getArgument<ByteArray>(0))
                }
                val exported = repository.collectChangesSince(Instant.DISTANT_PAST, "trainer").members.single()
                assertEquals("AQI=", exported.photoBase64)
                assertEquals("AwQ=", exported.idPhotoBase64)
                assertEquals(6L, exported.syncVersion)
                assertEquals("requested", exported.cardStatus)
                assertEquals(later.toString(), exported.cardRequestedAtUtc)
                assertEquals("trainer", exported.cardRequestedByDeviceId)
            }
        }
    }
}
