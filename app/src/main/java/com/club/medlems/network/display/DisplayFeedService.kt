package com.club.medlems.network.display

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
    private val practiceSessionDao: PracticeSessionDao
) {
    suspend fun getFeed(): DisplayFeed {
        val now = Clock.System.now()
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        return DisplayFeedBuilder.build(
            today = today,
            generatedAt = now,
            members = memberDao.allMembers(),
            sessions = practiceSessionDao.allSessions()
        )
    }
}