package com.club.medlems.ui.trainer.dashboard

import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberType
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.data.sync.SyncOutboxManager
import com.club.medlems.network.TrustManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.datetime.Instant
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class TrialMemberDetailViewModelTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    private val dispatcher = StandardTestDispatcher()
    private val memberDao: MemberDao = mock()
    private val outbox: SyncOutboxManager = mock()
    private val syncManager: SyncManager = mock()
    private val trustManager: TrustManager = mock()
    private val timestamp = Instant.parse("2026-11-09T19:00:00Z")

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        whenever(trustManager.getThisDeviceId()).thenReturn("trainer")
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private suspend fun load(): TrialMemberDetailViewModel {
        whenever(memberDao.getByInternalId("member")).thenReturn(Member(
            internalId = "member",
            memberType = MemberType.FULL,
            firstName = "Test",
            lastName = "Member",
            createdAtUtc = timestamp,
            updatedAtUtc = timestamp,
            syncVersion = 5,
            syncedAtUtc = timestamp
        ))
        return TrialMemberDetailViewModel(memberDao, outbox, syncManager, trustManager).also {
            it.loadMember("member")
            it.state.first { state -> !state.isLoading }
        }
    }

    @Test
    fun `profile retake ID retake and card request each persist the version they queue`() = runTest(dispatcher) {
        val viewModel = load()
        val profile = temporaryFolder.newFile("profile.jpg").apply { writeBytes(byteArrayOf(1)) }
        val id = temporaryFolder.newFile("id.jpg").apply { writeBytes(byteArrayOf(2)) }

        viewModel.onProfilePhotoTaken(profile.absolutePath)
        viewModel.state.first { it.member?.syncVersion == 6L && !it.isSaving }
        viewModel.onIdPhotoTaken(id.absolutePath)
        viewModel.state.first { it.member?.syncVersion == 7L && !it.isSaving }
        viewModel.requestCard()
        viewModel.state.first { it.member?.syncVersion == 8L && !it.isSaving }

        val saved = argumentCaptor<Member>()
        verify(memberDao, times(3)).upsert(saved.capture())
        assertEquals(listOf(6L, 7L, 8L), saved.allValues.map { it.syncVersion })
        assertTrue(saved.allValues.all { it.syncedAtUtc == null })
        assertEquals(profile.absolutePath, saved.lastValue.registrationPhotoPath)
        assertEquals(id.absolutePath, saved.lastValue.idPhotoPath)
        assertEquals("requested", saved.lastValue.cardStatus)
        assertNotNull(saved.lastValue.cardRequestedAtUtc)
        assertEquals("trainer", saved.lastValue.cardRequestedByDeviceId)

        val queued = argumentCaptor<Member>()
        verify(outbox, times(3)).queueMember(queued.capture(), eq("trainer"), any(), anyOrNull(), anyOrNull())
        assertEquals(saved.allValues, queued.allValues)
        verify(syncManager, times(3)).notifyEntityChanged(eq("Member"), eq("member"), any())
    }

    @Test
    fun `unreadable captured photo reports error without saving or queuing success`() = runTest(dispatcher) {
        val viewModel = load()
        viewModel.onProfilePhotoTaken(temporaryFolder.root.resolve("missing.jpg").absolutePath)
        val failed = viewModel.state.first { it.errorMessage != null }

        assertFalse(failed.saveSuccess)
        assertFalse(failed.isSaving)
        assertEquals(5L, failed.member?.syncVersion)
        verify(memberDao, org.mockito.kotlin.never()).upsert(any())
        verify(outbox, org.mockito.kotlin.never()).queueMember(any(), any(), any(), anyOrNull(), anyOrNull())
    }
}
