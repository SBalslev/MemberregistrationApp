package com.club.medlems.domain.csv

import com.club.medlems.data.dao.CheckInDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.dao.ScanEventDao
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberStatus
import com.club.medlems.data.entity.MemberType
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.data.entity.SessionSource
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

class CsvServiceTest {
    @Test
    fun `importSessions inserts valid sessions`() = runTest {
        val member = buildMember("member-1", "M001")
        val memberDao = mock<MemberDao>()
        val sessionDao = mock<PracticeSessionDao>()
        whenever(memberDao.allMembers()).thenReturn(listOf(member))
        whenever(sessionDao.countById("session-1")).thenReturn(0)
        val csvService = CsvService(
            memberDao = memberDao,
            checkInDao = mock<CheckInDao>(),
            sessionDao = sessionDao,
            scanEventDao = mock<ScanEventDao>()
        )

        val csv = listOf(
            "FORMAT_VERSION,session_id,membership_id,created_at_utc,local_date,practice_type,points,krydser,classification,source",
            "2,session-1,M001,2025-08-25T18:02:16.918Z,2025-08-25,Pistol,178,,2H 2,kiosk"
        ).joinToString("\n")

        val result = csvService.importSessions(csv)

        assertEquals(1, result.imported)
        assertEquals(0, result.skippedDuplicates)
        assertTrue(result.errors.isEmpty())

        val captor = argumentCaptor<PracticeSession>()
        verify(sessionDao).insert(captor.capture())
        val inserted = captor.firstValue
        assertEquals("session-1", inserted.id)
        assertEquals("member-1", inserted.internalMemberId)
        assertEquals("M001", inserted.membershipId)
        assertEquals(PracticeType.Pistol, inserted.practiceType)
        assertEquals(178, inserted.points)
        assertEquals("2H 2", inserted.classification)
        assertEquals(SessionSource.kiosk, inserted.source)
    }

    @Test
    fun `importSessions skips duplicate session ids`() = runTest {
        val member = buildMember("member-1", "M001")
        val memberDao = mock<MemberDao>()
        val sessionDao = mock<PracticeSessionDao>()
        whenever(memberDao.allMembers()).thenReturn(listOf(member))
        whenever(sessionDao.countById("session-dup")).thenReturn(1)
        val csvService = CsvService(
            memberDao = memberDao,
            checkInDao = mock<CheckInDao>(),
            sessionDao = sessionDao,
            scanEventDao = mock<ScanEventDao>()
        )

        val csv = listOf(
            "FORMAT_VERSION,session_id,membership_id,created_at_utc,local_date,practice_type,points,krydser,classification,source",
            "2,session-dup,M001,2025-08-25T18:02:16.918Z,2025-08-25,Pistol,178,,2H 2,kiosk"
        ).joinToString("\n")

        val result = csvService.importSessions(csv)

        assertEquals(0, result.imported)
        assertEquals(1, result.skippedDuplicates)
        assertTrue(result.errors.isEmpty())
        verify(sessionDao, never()).insert(any())
    }

    @Test
    fun `importSessions reports missing members`() = runTest {
        val memberDao = mock<MemberDao>()
        val sessionDao = mock<PracticeSessionDao>()
        whenever(memberDao.allMembers()).thenReturn(emptyList())
        whenever(sessionDao.countById("session-2")).thenReturn(0)
        val csvService = CsvService(
            memberDao = memberDao,
            checkInDao = mock<CheckInDao>(),
            sessionDao = sessionDao,
            scanEventDao = mock<ScanEventDao>()
        )

        val csv = listOf(
            "FORMAT_VERSION,session_id,membership_id,created_at_utc,local_date,practice_type,points,krydser,classification,source",
            "2,session-2,M404,2025-08-25T18:02:16.918Z,2025-08-25,Pistol,178,,2H 2,kiosk"
        ).joinToString("\n")

        val result = csvService.importSessions(csv)

        assertEquals(0, result.imported)
        assertEquals(0, result.skippedDuplicates)
        assertEquals(1, result.errors.size)
        verify(sessionDao, never()).insert(any())
    }

    private fun buildMember(internalId: String, membershipId: String): Member {
        return Member(
            internalId = internalId,
            membershipId = membershipId,
            memberType = MemberType.FULL,
            status = MemberStatus.ACTIVE,
            firstName = "Test",
            lastName = "Member",
            createdAtUtc = Instant.parse("2025-01-01T00:00:00Z"),
            updatedAtUtc = Instant.parse("2025-01-01T00:00:00Z")
        )
    }
}
