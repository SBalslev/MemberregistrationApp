package com.club.medlems.network.display

import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberStatus
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.data.entity.SessionSource
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DisplayFeedBuilderTest {
    private val generatedAt = Instant.parse("2026-08-31T18:30:00Z")

    @Test
    fun `build aggregates public daily statistics and best score per member`() {
        val today = LocalDate(2026, 8, 31)
        val members = listOf(
            member("member-1", "Søren", "Balslev"),
            member("member-2", "Anna", "Nielsen")
        )
        val sessions = listOf(
            session("session-1", "member-1", today, PracticeType.Pistol, 170, "2026-08-31T17:00:00Z"),
            session("session-2", "member-1", today, PracticeType.Pistol, 185, "2026-08-31T18:00:00Z"),
            session("session-3", "member-2", today, PracticeType.Pistol, 180, "2026-08-31T18:15:00Z")
        )

        val feed = DisplayFeedBuilder.build(today, generatedAt, members, sessions)

        assertEquals(2, feed.stats.participantCount)
        assertEquals(3, feed.stats.sessionCount)
        assertEquals(535, feed.stats.totalPoints)
        assertEquals(listOf("Søren B.", "Anna N."), feed.topScoresByDiscipline.single().entries.map { it.displayName })
        assertEquals(listOf(185, 180), feed.topScoresByDiscipline.single().entries.map { it.points })
        assertEquals("Anna N.", feed.recentScores.first().displayName)
    }

    @Test
    fun `build includes birthdays from today through seven days ago across year boundary`() {
        val today = LocalDate(2026, 1, 3)
        val members = listOf(
            member("today", "Iben", "Andersen", LocalDate(1980, 1, 3)),
            member("seven-days", "Bo", "Christensen", LocalDate(1975, 12, 27)),
            member("eight-days", "Clara", "Dahl", LocalDate(1990, 12, 26)),
            member("inactive", "Dan", "Eriksen", LocalDate(1985, 1, 1), MemberStatus.INACTIVE)
        )

        val feed = DisplayFeedBuilder.build(today, generatedAt, members, emptyList())

        assertEquals(listOf("Bo C.", "Iben A."), feed.birthdays.map { it.displayName })
    }

    @Test
    fun `build reports only strict personal bests`() {
        val today = LocalDate(2026, 8, 31)
        val members = listOf(
            member("improved", "Asta", "Friis"),
            member("equal", "Bent", "Gade"),
            member("first", "Carl", "Holm")
        )
        val sessions = listOf(
            session("old-improved", "improved", LocalDate(2026, 8, 20), PracticeType.Riffel, 170, "2026-08-20T18:00:00Z"),
            session("new-improved", "improved", today, PracticeType.Riffel, 180, "2026-08-31T18:00:00Z"),
            session("old-equal", "equal", LocalDate(2026, 8, 20), PracticeType.Riffel, 175, "2026-08-20T18:00:00Z"),
            session("new-equal", "equal", today, PracticeType.Riffel, 175, "2026-08-31T18:05:00Z"),
            session("first-score", "first", today, PracticeType.Pistol, 160, "2026-08-31T18:10:00Z")
        )

        val feed = DisplayFeedBuilder.build(today, generatedAt, members, sessions)

        assertEquals(listOf("Asta F.", "Carl H."), feed.personalBests.map { it.displayName })
        assertEquals(170, feed.personalBests.first().previousBest)
        assertNull(feed.personalBests.last().previousBest)
    }

    @Test
    fun `serialized feed excludes private member fields and values`() {
        val today = LocalDate(2026, 8, 31)
        val members = listOf(
            member("private-internal-id", "Søren", "Balslev", LocalDate(1980, 8, 30)).copy(
                membershipId = "private-membership-id",
                email = "private@example.com",
                phone = "12345678",
                address = "Private Street 1"
            )
        )
        val sessions = listOf(
            session("private-session-id", "private-internal-id", today, PracticeType.Pistol, 185, "2026-08-31T18:00:00Z")
        )

        val feed = DisplayFeedBuilder.build(today, generatedAt, members, sessions)
        val json = Json.encodeToString(DisplayFeed.serializer(), feed)

        assertTrue(json.contains("Søren B."))
        listOf(
            "internalId",
            "membershipId",
            "birthDate",
            "email",
            "phone",
            "address",
            "private-internal-id",
            "private-membership-id",
            "private@example.com",
            "12345678",
            "Private Street 1",
            "private-session-id"
        ).forEach { privateValue ->
            assertFalse("Feed contained private value: $privateValue", json.contains(privateValue))
        }
    }

    @Test
    fun `build handles leap-day birthday within lookback window`() {
        val today = LocalDate(2028, 3, 3)
        val members = listOf(
            member("leap-day", "Liva", "Iversen", LocalDate(2000, 2, 29))
        )

        val feed = DisplayFeedBuilder.build(today, generatedAt, members, emptyList())

        assertEquals(listOf("Liva I."), feed.birthdays.map { it.displayName })
    }

    @Test
    fun `build returns empty collections and zero stats when no data exists`() {
        val feed = DisplayFeedBuilder.build(
            today = LocalDate(2026, 8, 31),
            generatedAt = generatedAt,
            members = emptyList(),
            sessions = emptyList()
        )

        assertEquals(0, feed.stats.participantCount)
        assertEquals(0, feed.stats.sessionCount)
        assertEquals(0, feed.stats.totalPoints)
        assertTrue(feed.topScoresByDiscipline.isEmpty())
        assertTrue(feed.recentScores.isEmpty())
        assertTrue(feed.personalBests.isEmpty())
        assertTrue(feed.birthdays.isEmpty())
    }

    private fun member(
        id: String,
        firstName: String,
        lastName: String,
        birthDate: LocalDate? = null,
        status: MemberStatus = MemberStatus.ACTIVE
    ) = Member(
        internalId = id,
        membershipId = null,
        status = status,
        firstName = firstName,
        lastName = lastName,
        birthDate = birthDate,
        createdAtUtc = Instant.parse("2020-01-01T00:00:00Z")
    )

    private fun session(
        id: String,
        memberId: String,
        date: LocalDate,
        practiceType: PracticeType,
        points: Int,
        createdAt: String
    ) = PracticeSession(
        id = id,
        internalMemberId = memberId,
        createdAtUtc = Instant.parse(createdAt),
        localDate = date,
        practiceType = practiceType,
        points = points,
        krydser = null,
        source = SessionSource.kiosk
    )
}