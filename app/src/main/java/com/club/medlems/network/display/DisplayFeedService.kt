package com.club.medlems.network.display

import com.club.medlems.data.dao.ActivityDao
import com.club.medlems.data.dao.ActivityGuestDao
import com.club.medlems.data.dao.CheckInDao
import com.club.medlems.data.dao.GuestResultDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.PracticeSessionDao
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DisplayFeedService @Inject constructor(
    private val memberDao: MemberDao,
    private val checkInDao: CheckInDao,
    private val practiceSessionDao: PracticeSessionDao,
    private val activityDao: ActivityDao,
    private val activityGuestDao: ActivityGuestDao,
    private val guestResultDao: GuestResultDao
) {
    suspend fun getFeed(): DisplayFeed {
        val now = Clock.System.now()
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        val activeActivity = activityDao.active()?.takeIf { it.displayEnabled }
        return DisplayFeedBuilder.build(
            today = today,
            generatedAt = now,
            members = memberDao.allMembers(),
            sessions = practiceSessionDao.allSessions(),
            checkIns = checkInDao.allCheckInsForDate(today),
            activeActivity = activeActivity,
            activityGuests = activeActivity?.let { activityGuestDao.forActivity(it.id) }.orEmpty(),
            guestResults = activeActivity?.let { guestResultDao.forActivity(it.id) }.orEmpty()
        )
    }
}