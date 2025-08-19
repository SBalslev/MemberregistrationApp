package com.club.medlems.data.dao

import androidx.room.*
import com.club.medlems.data.entity.*
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.LocalDate

@Dao
interface MemberDao {
    @Query("SELECT * FROM Member WHERE membershipId = :id")
    suspend fun get(id: String): Member?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(member: Member)

    @Query("SELECT * FROM Member WHERE status = :status")
    fun membersByStatus(status: MemberStatus = MemberStatus.ACTIVE): Flow<List<Member>>

    @Query("UPDATE Member SET status = :status WHERE membershipId IN (:ids)")
    suspend fun updateStatus(ids: List<String>, status: MemberStatus)

    @Query("SELECT * FROM Member")
    suspend fun allMembers(): List<Member>
}

@Dao
interface CheckInDao {
    @Query("SELECT * FROM CheckIn WHERE membershipId = :membershipId AND localDate = :date LIMIT 1")
    suspend fun firstForDate(membershipId: String, date: LocalDate): CheckIn?

    @Insert
    suspend fun insert(ci: CheckIn)

    @Delete
    suspend fun delete(ci: CheckIn)

    @Query("SELECT MAX(localDate) FROM CheckIn WHERE membershipId = :membershipId")
    suspend fun lastCheckDate(membershipId: String): LocalDate?

    @Query("DELETE FROM CheckIn")
    suspend fun deleteAll()

    @Query("SELECT * FROM CheckIn")
    suspend fun allCheckIns(): List<CheckIn>
}

@Dao
interface PracticeSessionDao {
    @Insert
    suspend fun insert(session: PracticeSession)

    @Update
    suspend fun update(session: PracticeSession)

    @Delete
    suspend fun delete(session: PracticeSession)

    @Query("SELECT * FROM PracticeSession WHERE localDate = :date AND membershipId = :memberId")
    suspend fun sessionsForMemberOnDate(memberId: String, date: LocalDate): List<PracticeSession>

    @Query("SELECT * FROM PracticeSession WHERE localDate BETWEEN :start AND :end AND practiceType = :practiceType AND points > 0 ORDER BY points DESC, krydser DESC, createdAtUtc DESC")
    suspend fun rangeForType(start: LocalDate, end: LocalDate, practiceType: PracticeType): List<PracticeSession>

    @Query("SELECT * FROM PracticeSession WHERE membershipId = :memberId AND localDate BETWEEN :start AND :end AND practiceType = :practiceType AND classification = :classification AND points > 0 ORDER BY createdAtUtc DESC")
    suspend fun historyForMember(
        memberId: String,
        start: LocalDate,
        end: LocalDate,
        practiceType: PracticeType,
        classification: String
    ): List<PracticeSession>

    @Query("SELECT * FROM PracticeSession WHERE membershipId = :memberId AND localDate BETWEEN :start AND :end ORDER BY createdAtUtc DESC")
    suspend fun sessionsForMemberInRange(
        memberId: String,
        start: LocalDate,
        end: LocalDate
    ): List<PracticeSession>

    @Query("SELECT * FROM PracticeSession WHERE membershipId = :memberId AND localDate BETWEEN :start AND :end AND practiceType = :practiceType AND points > 0 ORDER BY createdAtUtc DESC")
    suspend fun historyForMemberAllClassifications(
        memberId: String,
        start: LocalDate,
        end: LocalDate,
        practiceType: PracticeType
    ): List<PracticeSession>

    @Query("SELECT COUNT(*) FROM PracticeSession WHERE membershipId = :memberId AND localDate BETWEEN :start AND :end AND practiceType = :practiceType AND points > 0")
    suspend fun historyCountForMemberAllClassifications(
        memberId: String,
        start: LocalDate,
        end: LocalDate,
        practiceType: PracticeType
    ): Int

    @Query("SELECT * FROM PracticeSession")
    suspend fun allSessions(): List<PracticeSession>

        @Query("DELETE FROM PracticeSession")
        suspend fun deleteAllSessions()
}

@Dao
interface ScanEventDao {
    @Insert
    suspend fun insert(event: ScanEvent)

    @Query("UPDATE ScanEvent SET linkedSessionId = :sessionId WHERE id = :scanEventId")
    suspend fun linkSession(scanEventId: String, sessionId: String)

    @Query("UPDATE ScanEvent SET canceledFlag = 1 WHERE id = :scanEventId")
    suspend fun cancel(scanEventId: String)

    @Query("SELECT * FROM ScanEvent")
    suspend fun allScanEvents(): List<ScanEvent>

    @Query("SELECT createdAtUtc FROM ScanEvent WHERE membershipId = :membershipId ORDER BY createdAtUtc DESC LIMIT 1")
    suspend fun lastEventInstant(membershipId: String): kotlinx.datetime.Instant?

        @Query("DELETE FROM ScanEvent")
        suspend fun deleteAllEvents()
}
