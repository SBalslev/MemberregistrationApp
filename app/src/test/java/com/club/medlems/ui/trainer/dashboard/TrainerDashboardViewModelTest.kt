package com.club.medlems.ui.trainer.dashboard

import com.club.medlems.data.dao.CheckInDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.MemberNameProjection
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberType
import com.club.medlems.data.entity.MemberStatus
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.data.entity.SessionSource
import com.club.medlems.domain.trainer.TrainerSessionManager
import com.club.medlems.domain.trainer.TrainerSessionState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

/**
 * Unit tests for TrainerDashboardViewModel.
 * Tests search filtering, trial member mapping, and stats calculation.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TrainerDashboardViewModelTest {
    private val testDispatcher = StandardTestDispatcher()

    private lateinit var checkInDao: CheckInDao
    private lateinit var practiceSessionDao: PracticeSessionDao
    private lateinit var memberDao: MemberDao
    private lateinit var trainerSessionManager: TrainerSessionManager

    private val sessionStateFlow = MutableStateFlow(TrainerSessionState())

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        checkInDao = mock {
            onBlocking { allCheckInsForDate(any()) } doReturn emptyList()
        }
        practiceSessionDao = mock {
            onBlocking { allSessionsForDate(any()) } doReturn emptyList()
        }
        memberDao = mock {
            onBlocking { getRecentTrialMembers(any()) } doReturn emptyList()
            onBlocking { getMemberNames(any()) } doReturn emptyList()
        }
        trainerSessionManager = mock {
            on { sessionState } doReturn sessionStateFlow
            on { isSessionActive } doReturn true
        }
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // Helper to create a test check-in
    private fun createCheckIn(
        id: String,
        memberId: String,
        timestamp: Instant = Clock.System.now()
    ) = CheckIn(
        id = id,
        internalMemberId = memberId,
        localDate = LocalDate(2026, 1, 28),
        createdAtUtc = timestamp,
        syncedAtUtc = null,
        syncVersion = 0
    )

    // Helper to create a test practice session
    private fun createSession(
        id: String,
        memberId: String,
        practiceType: PracticeType = PracticeType.Pistol,
        points: Int = 100,
        timestamp: Instant = Clock.System.now()
    ) = PracticeSession(
        id = id,
        internalMemberId = memberId,
        localDate = LocalDate(2026, 1, 28),
        practiceType = practiceType,
        points = points,
        krydser = null,
        source = SessionSource.attendant,
        createdAtUtc = timestamp,
        syncedAtUtc = null,
        syncVersion = 0
    )

    // Helper to create a test member
    private fun createMember(
        internalId: String,
        firstName: String = "Test",
        lastName: String = "Member",
        membershipId: String? = null,
        birthDate: LocalDate? = null,
        idPhotoPath: String? = null,
        registrationPhotoPath: String? = null,
        memberType: MemberType = MemberType.TRIAL,
        createdAt: Instant = Clock.System.now()
    ) = Member(
        internalId = internalId,
        membershipId = membershipId,
        memberType = memberType,
        status = MemberStatus.ACTIVE,
        firstName = firstName,
        lastName = lastName,
        birthDate = birthDate,
        registrationPhotoPath = registrationPhotoPath,
        idPhotoPath = idPhotoPath,
        createdAtUtc = createdAt,
        updatedAtUtc = createdAt,
        syncedAtUtc = null,
        syncVersion = 0
    )

    @Test
    fun `initial state has empty collections`() = runTest {
        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )

        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue(state.allCheckIns.isEmpty())
        assertTrue(state.allSessions.isEmpty())
        assertTrue(state.trialMembers.isEmpty())
        assertEquals(0, state.stats.totalCheckIns)
        assertEquals(0, state.stats.totalSessions)
    }

    @Test
    fun `search filters check-ins by member name`() = runTest {
        val checkIns = listOf(
            createCheckIn("c1", "m1"),
            createCheckIn("c2", "m2"),
            createCheckIn("c3", "m3")
        )
        val memberNames = listOf(
            MemberNameProjection("m1", "A001", "Alice", "Test"),
            MemberNameProjection("m2", "A002", "Bob", "Smith"),
            MemberNameProjection("m3", "A003", "Charlie", "Test")
        )

        whenever(checkInDao.allCheckInsForDate(any())).thenReturn(checkIns)
        whenever(memberDao.getMemberNames(any())).thenReturn(memberNames)

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        // Verify initial state has all check-ins
        assertEquals(3, viewModel.state.value.filteredCheckIns.size)

        // Filter by "Test" - should match Alice and Charlie
        viewModel.onSearchQueryChanged("Test")
        advanceUntilIdle()

        assertEquals(2, viewModel.state.value.filteredCheckIns.size)
        assertTrue(viewModel.state.value.filteredCheckIns.any { it.memberName == "Alice Test" })
        assertTrue(viewModel.state.value.filteredCheckIns.any { it.memberName == "Charlie Test" })

        // Stats should still show total unfiltered count
        assertEquals(3, viewModel.state.value.stats.totalCheckIns)
    }

    @Test
    fun `search filters check-ins by member ID`() = runTest {
        val checkIns = listOf(
            createCheckIn("c1", "m1"),
            createCheckIn("c2", "m2")
        )
        val memberNames = listOf(
            MemberNameProjection("m1", "A001", "Alice", ""),
            MemberNameProjection("m2", "A002", "Bob", "")
        )

        whenever(checkInDao.allCheckInsForDate(any())).thenReturn(checkIns)
        whenever(memberDao.getMemberNames(any())).thenReturn(memberNames)

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        // Filter by member ID
        viewModel.onSearchQueryChanged("A001")
        advanceUntilIdle()

        assertEquals(1, viewModel.state.value.filteredCheckIns.size)
        assertEquals("Alice", viewModel.state.value.filteredCheckIns[0].memberName)
    }

    @Test
    fun `search is case insensitive`() = runTest {
        val checkIns = listOf(createCheckIn("c1", "m1"))
        val memberNames = listOf(MemberNameProjection("m1", "A001", "Alice", "Test"))

        whenever(checkInDao.allCheckInsForDate(any())).thenReturn(checkIns)
        whenever(memberDao.getMemberNames(any())).thenReturn(memberNames)

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        viewModel.onSearchQueryChanged("ALICE")
        advanceUntilIdle()

        assertEquals(1, viewModel.state.value.filteredCheckIns.size)
    }

    @Test
    fun `clearing search shows all items`() = runTest {
        val checkIns = listOf(
            createCheckIn("c1", "m1"),
            createCheckIn("c2", "m2")
        )
        val memberNames = listOf(
            MemberNameProjection("m1", "A001", "Alice", ""),
            MemberNameProjection("m2", "A002", "Bob", "")
        )

        whenever(checkInDao.allCheckInsForDate(any())).thenReturn(checkIns)
        whenever(memberDao.getMemberNames(any())).thenReturn(memberNames)

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        // Apply filter
        viewModel.onSearchQueryChanged("Alice")
        advanceUntilIdle()
        assertEquals(1, viewModel.state.value.filteredCheckIns.size)

        // Clear filter
        viewModel.onSearchQueryChanged("")
        advanceUntilIdle()
        assertEquals(2, viewModel.state.value.filteredCheckIns.size)
    }

    @Test
    fun `search filters practice sessions by member name`() = runTest {
        val sessions = listOf(
            createSession("s1", "m1"),
            createSession("s2", "m2")
        )
        val memberNames = listOf(
            MemberNameProjection("m1", "A001", "Alice", ""),
            MemberNameProjection("m2", "A002", "Bob", "")
        )

        whenever(practiceSessionDao.allSessionsForDate(any())).thenReturn(sessions)
        whenever(memberDao.getMemberNames(any())).thenReturn(memberNames)

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        viewModel.onSearchQueryChanged("Bob")
        advanceUntilIdle()

        assertEquals(1, viewModel.state.value.filteredSessions.size)
        assertEquals("Bob", viewModel.state.value.filteredSessions[0].memberName)
    }

    @Test
    fun `stats reflect total counts not filtered`() = runTest {
        val checkIns = listOf(
            createCheckIn("c1", "m1"),
            createCheckIn("c2", "m2"),
            createCheckIn("c3", "m3")
        )
        val sessions = listOf(
            createSession("s1", "m1"),
            createSession("s2", "m2")
        )
        val memberNames = listOf(
            MemberNameProjection("m1", null, "Alice", ""),
            MemberNameProjection("m2", null, "Bob", ""),
            MemberNameProjection("m3", null, "Charlie", "")
        )

        whenever(checkInDao.allCheckInsForDate(any())).thenReturn(checkIns)
        whenever(practiceSessionDao.allSessionsForDate(any())).thenReturn(sessions)
        whenever(memberDao.getMemberNames(any())).thenReturn(memberNames)

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        // Apply restrictive filter
        viewModel.onSearchQueryChanged("Alice")
        advanceUntilIdle()

        // Filtered should have 1 check-in and 1 session
        assertEquals(1, viewModel.state.value.filteredCheckIns.size)
        assertEquals(1, viewModel.state.value.filteredSessions.size)

        // But stats should show total counts
        assertEquals(3, viewModel.state.value.stats.totalCheckIns)
        assertEquals(2, viewModel.state.value.stats.totalSessions)
    }

    @Test
    fun `trial member item calculates adult status correctly for adult`() = runTest {
        // Member born 2000-01-01 should be 26 years old (adult)
        val adultMember = createMember(
            internalId = "m1",
            firstName = "Adult",
            lastName = "Member",
            birthDate = LocalDate(2000, 1, 1)
        )

        whenever(memberDao.getRecentTrialMembers(any())).thenReturn(listOf(adultMember))

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        val trialMembers = viewModel.state.value.trialMembers
        assertEquals(1, trialMembers.size)
        assertTrue(trialMembers[0].isAdult)
        assertEquals(26, trialMembers[0].age)
    }

    @Test
    fun `trial member item calculates adult status correctly for minor`() = runTest {
        // Member born 2015-01-01 should be 11 years old (minor)
        val minorMember = createMember(
            internalId = "m1",
            firstName = "Minor",
            lastName = "Member",
            birthDate = LocalDate(2015, 1, 1)
        )

        whenever(memberDao.getRecentTrialMembers(any())).thenReturn(listOf(minorMember))

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        val trialMembers = viewModel.state.value.trialMembers
        assertEquals(1, trialMembers.size)
        assertFalse(trialMembers[0].isAdult)
        assertEquals(11, trialMembers[0].age)
    }

    @Test
    fun `trial member item handles null birthdate`() = runTest {
        val memberWithNoBirthDate = createMember(
            internalId = "m1",
            firstName = "Unknown",
            lastName = "Age",
            birthDate = null
        )

        whenever(memberDao.getRecentTrialMembers(any())).thenReturn(listOf(memberWithNoBirthDate))

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        val trialMembers = viewModel.state.value.trialMembers
        assertEquals(1, trialMembers.size)
        assertFalse(trialMembers[0].isAdult)
        assertEquals(null, trialMembers[0].age)
    }

    @Test
    fun `trial member item detects ID photo presence`() = runTest {
        val memberWithIdPhoto = createMember(
            internalId = "m1",
            firstName = "With",
            lastName = "IdPhoto",
            idPhotoPath = "/photos/id/m1.jpg"
        )
        val memberWithoutIdPhoto = createMember(
            internalId = "m2",
            firstName = "No",
            lastName = "IdPhoto",
            idPhotoPath = null
        )

        whenever(memberDao.getRecentTrialMembers(any())).thenReturn(listOf(memberWithIdPhoto, memberWithoutIdPhoto))

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        val trialMembers = viewModel.state.value.trialMembers
        assertEquals(2, trialMembers.size)

        val withPhoto = trialMembers.find { it.displayName == "With IdPhoto" }
        val withoutPhoto = trialMembers.find { it.displayName == "No IdPhoto" }

        assertTrue(withPhoto?.hasIdPhoto == true)
        assertFalse(withoutPhoto?.hasIdPhoto == true)
    }

    @Test
    fun `trial member item detects profile photo presence`() = runTest {
        val memberWithPhoto = createMember(
            internalId = "m1",
            firstName = "With",
            lastName = "Photo",
            registrationPhotoPath = "/photos/reg/m1.jpg"
        )
        val memberWithoutPhoto = createMember(
            internalId = "m2",
            firstName = "No",
            lastName = "Photo",
            registrationPhotoPath = null
        )

        whenever(memberDao.getRecentTrialMembers(any())).thenReturn(listOf(memberWithPhoto, memberWithoutPhoto))

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        val trialMembers = viewModel.state.value.trialMembers
        assertEquals(2, trialMembers.size)

        val withPhoto = trialMembers.find { it.displayName == "With Photo" }
        val withoutPhoto = trialMembers.find { it.displayName == "No Photo" }

        assertTrue(withPhoto?.hasProfilePhoto == true)
        assertFalse(withoutPhoto?.hasProfilePhoto == true)
    }

    @Test
    fun `trial member display name combines first and last name`() = runTest {
        val member = createMember(
            internalId = "m1",
            firstName = "John",
            lastName = "Doe"
        )

        whenever(memberDao.getRecentTrialMembers(any())).thenReturn(listOf(member))

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        assertEquals("John Doe", viewModel.state.value.trialMembers[0].displayName)
    }

    @Test
    fun `check-ins are sorted by timestamp descending`() = runTest {
        val now = Clock.System.now()
        val checkIns = listOf(
            createCheckIn("c1", "m1", now.minus(kotlin.time.Duration.parse("2h"))),
            createCheckIn("c2", "m2", now.minus(kotlin.time.Duration.parse("1h"))),
            createCheckIn("c3", "m3", now)
        )
        val memberNames = listOf(
            MemberNameProjection("m1", null, "First", ""),
            MemberNameProjection("m2", null, "Second", ""),
            MemberNameProjection("m3", null, "Third", "")
        )

        whenever(checkInDao.allCheckInsForDate(any())).thenReturn(checkIns)
        whenever(memberDao.getMemberNames(any())).thenReturn(memberNames)

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        // Most recent first
        assertEquals("Third", viewModel.state.value.filteredCheckIns[0].memberName)
        assertEquals("Second", viewModel.state.value.filteredCheckIns[1].memberName)
        assertEquals("First", viewModel.state.value.filteredCheckIns[2].memberName)
    }

    @Test
    fun `unknown member shows fallback name`() = runTest {
        val checkIns = listOf(createCheckIn("c1", "unknown-member"))

        whenever(checkInDao.allCheckInsForDate(any())).thenReturn(checkIns)
        whenever(memberDao.getMemberNames(any())).thenReturn(emptyList())

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        assertEquals("Ukendt medlem", viewModel.state.value.filteredCheckIns[0].memberName)
    }

    @Test
    fun `combined state includes trainer session info`() = runTest {
        sessionStateFlow.value = TrainerSessionState(
            trainerName = "John Trainer",
            isExpiring = true,
            secondsRemaining = 60
        )

        val viewModel = TrainerDashboardViewModel(
            checkInDao,
            practiceSessionDao,
            memberDao,
            trainerSessionManager
        )
        advanceUntilIdle()

        val combinedState = viewModel.combinedState.value
        assertEquals("John Trainer", combinedState.trainerName)
        assertTrue(combinedState.sessionExpiring)
        assertEquals(60, combinedState.sessionRemainingSeconds)
    }
}
