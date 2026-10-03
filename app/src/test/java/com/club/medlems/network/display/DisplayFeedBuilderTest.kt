package com.club.medlems.network.display

import com.club.medlems.data.entity.Activity
import com.club.medlems.data.entity.ActivityGuest
import com.club.medlems.data.entity.ActivityStatus
import com.club.medlems.data.entity.ActivityType
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.GuestResult
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
    fun `build includes every score from the club date`() {
        val today = LocalDate(2026, 8, 31)
        val members = listOf(member("member-1", "Søren", "Balslev"))
        val sessions = (0 until 12).map { index ->
            session(
                "session-$index",
                "member-1",
                today,
                PracticeType.Pistol,
                100 + index,
                "2026-08-31T18:${index.toString().padStart(2, '0')}:00Z"
            )
        }

        val feed = DisplayFeedBuilder.build(today, generatedAt, members, sessions)

        assertEquals(12, feed.recentScores.size)
        assertEquals((111 downTo 100).toList(), feed.recentScores.map { it.points })
    }

    @Test
    fun `participant count includes checked in members without a score`() {
        val today = LocalDate(2026, 8, 31)
        val members = listOf(
            member("member-1", "Søren", "Balslev"),
            member("member-2", "Anna", "Nielsen")
        )
        val checkIns = members.mapIndexed { index, member ->
            CheckIn(
                id = "check-in-$index",
                internalMemberId = member.internalId,
                createdAtUtc = generatedAt,
                localDate = today
            )
        }
        val sessions = listOf(
            session("session-1", "member-1", today, PracticeType.Pistol, 170, generatedAt.toString())
        )

        val feed = DisplayFeedBuilder.build(
            today = today,
            generatedAt = generatedAt,
            members = members,
            sessions = sessions,
            checkIns = checkIns
        )

        assertEquals(2, feed.stats.participantCount)
        assertEquals(1, feed.stats.sessionCount)
    }

    @Test
    fun `active activity combines member and visible guest results`() {
        val today = LocalDate(2026, 10, 3)
        val activity = Activity(
            id = "activity-private-id",
            title = "Åbent hus",
            type = ActivityType.OPEN_DAY,
            startsAtUtc = generatedAt,
            status = ActivityStatus.ACTIVE,
            createdAtUtc = generatedAt,
            updatedAtUtc = generatedAt
        )
        val guest = ActivityGuest(
            id = "guest-private-id",
            activityId = activity.id,
            displayName = "Maja K.",
            clubName = "Naboklubben",
            createdAtUtc = generatedAt,
            updatedAtUtc = generatedAt
        )
        val memberSession = session(
            "member-result",
            "member-1",
            today,
            PracticeType.Pistol,
            180,
            "2026-10-03T08:00:00Z",
            activity.id
        )
        val guestResult = GuestResult(
            id = "guest-result-private-id",
            activityId = activity.id,
            guestId = guest.id,
            createdAtUtc = Instant.parse("2026-10-03T08:05:00Z"),
            localDate = today,
            practiceType = PracticeType.Pistol,
            points = 185
        )

        val feed = DisplayFeedBuilder.build(
            today = today,
            generatedAt = generatedAt,
            members = listOf(member("member-1", "Søren", "Balslev")),
            sessions = listOf(memberSession),
            activeActivity = activity,
            activityGuests = listOf(guest),
            guestResults = listOf(guestResult)
        )
        val json = Json.encodeToString(DisplayFeed.serializer(), feed)

        assertEquals("Åbent hus", feed.activity?.title)
        assertEquals(2, feed.stats.participantCount)
        assertEquals(listOf("Maja K.", "Søren B."), feed.topScoresByDiscipline.single().entries.map { it.displayName })
        assertEquals("Naboklubben", feed.topScoresByDiscipline.single().entries.first().affiliation)
        assertFalse(json.contains("activity-private-id"))
        assertFalse(json.contains("guest-private-id"))
        assertFalse(json.contains("guest-result-private-id"))
    }

    @Test
    fun `active activity omits guests without display consent`() {
        val today = LocalDate(2026, 10, 3)
        val activity = Activity(
            id = "activity",
            title = "Konkurrence",
            type = ActivityType.COMPETITION,
            startsAtUtc = generatedAt,
            status = ActivityStatus.ACTIVE,
            createdAtUtc = generatedAt,
            updatedAtUtc = generatedAt
        )
        val hiddenGuest = ActivityGuest(
            id = "hidden-guest",
            activityId = activity.id,
            displayName = "Skjult navn",
            showOnDisplay = false,
            createdAtUtc = generatedAt,
            updatedAtUtc = generatedAt
        )
        val hiddenResult = GuestResult(
            id = "hidden-result",
            activityId = activity.id,
            guestId = hiddenGuest.id,
            createdAtUtc = generatedAt,
            localDate = today,
            practiceType = PracticeType.Riffel,
            points = 190
        )

        val feed = DisplayFeedBuilder.build(
            today,
            generatedAt,
            emptyList(),
            emptyList(),
            activity,
            listOf(hiddenGuest),
            listOf(hiddenResult)
        )

        assertEquals(0, feed.stats.participantCount)
        assertTrue(feed.recentScores.isEmpty())
    }

    @Test
    fun `active activity omits removed guest results`() {
        val today = LocalDate(2026, 10, 3)
        val activity = Activity(
            id = "activity",
            title = "Konkurrence",
            type = ActivityType.COMPETITION,
            startsAtUtc = generatedAt,
            status = ActivityStatus.ACTIVE,
            createdAtUtc = generatedAt,
            updatedAtUtc = generatedAt
        )
        val guest = ActivityGuest(
            id = "guest",
            activityId = activity.id,
            displayName = "Gæst",
            createdAtUtc = generatedAt,
            updatedAtUtc = generatedAt
        )
        val removedResult = GuestResult(
            id = "removed-result",
            activityId = activity.id,
            guestId = guest.id,
            createdAtUtc = generatedAt,
            localDate = today,
            practiceType = PracticeType.Riffel,
            points = 190,
            deletedAtUtc = generatedAt
        )

        val feed = DisplayFeedBuilder.build(
            today,
            generatedAt,
            emptyList(),
            emptyList(),
            activity,
            listOf(guest),
            listOf(removedResult)
        )

        assertEquals(0, feed.stats.participantCount)
        assertTrue(feed.recentScores.isEmpty())
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
        createdAt: String,
        activityId: String? = null
    ) = PracticeSession(
        id = id,
        internalMemberId = memberId,
        createdAtUtc = Instant.parse(createdAt),
        localDate = date,
        practiceType = practiceType,
        points = points,
        krydser = null,
        source = SessionSource.kiosk,
        activityId = activityId
    )
}