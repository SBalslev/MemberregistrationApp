package com.club.medlems.data.dao

import androidx.room.*
import com.club.medlems.data.entity.*
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.Instant
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

    @Query("SELECT membershipId, firstName, lastName FROM Member WHERE membershipId IN (:ids)")
    suspend fun getMemberNames(ids: List<String>): List<MemberNameProjection>

    @Query("DELETE FROM Member")
    suspend fun deleteAll()
    
    // Sync-related queries
    @Query("SELECT * FROM Member WHERE updatedAtUtc > :since ORDER BY updatedAtUtc ASC")
    suspend fun getModifiedSince(since: Instant): List<Member>
    
    @Query("UPDATE Member SET syncedAtUtc = :syncedAt, syncVersion = syncVersion + 1 WHERE membershipId = :id")
    suspend fun markSynced(id: String, syncedAt: Instant)
    
    @Query("SELECT * FROM Member WHERE syncedAtUtc IS NULL OR syncedAtUtc < updatedAtUtc")
    suspend fun getUnsynced(): List<Member>
    
    // Search queries for equipment checkout
    @Query("""
        SELECT * FROM Member 
        WHERE status = 'ACTIVE' 
        AND (firstName LIKE '%' || :query || '%' 
             OR lastName LIKE '%' || :query || '%'
             OR membershipId LIKE '%' || :query || '%')
        ORDER BY lastName, firstName
        LIMIT 20
    """)
    suspend fun searchByNameOrId(query: String): List<Member>
}

data class MemberNameProjection(
    val membershipId: String,
    val firstName: String,
    val lastName: String
) {
    val displayName: String get() = listOfNotNull(firstName, lastName).joinToString(" ").trim()
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

    @Query("SELECT * FROM CheckIn WHERE localDate = :date")
    suspend fun allCheckInsForDate(date: LocalDate): List<CheckIn>

    @Query("SELECT * FROM CheckIn WHERE createdAtUtc > :since ORDER BY createdAtUtc ASC")
    suspend fun checkInsCreatedAfter(since: Instant): List<CheckIn>

    @Query("SELECT COUNT(*) FROM CheckIn WHERE createdAtUtc > :since")
    suspend fun countCheckInsCreatedAfter(since: Instant): Int
    
    // Sync-related queries
    @Query("UPDATE CheckIn SET syncedAtUtc = :syncedAt, syncVersion = syncVersion + 1 WHERE id = :id")
    suspend fun markSynced(id: String, syncedAt: Instant)
    
    @Query("SELECT * FROM CheckIn WHERE syncedAtUtc IS NULL")
    suspend fun getUnsynced(): List<CheckIn>
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

    @Query("SELECT * FROM PracticeSession WHERE localDate = :date")
    suspend fun allSessionsForDate(date: LocalDate): List<PracticeSession>

    @Query("SELECT * FROM PracticeSession WHERE createdAtUtc > :since ORDER BY createdAtUtc ASC")
    suspend fun sessionsCreatedAfter(since: Instant): List<PracticeSession>

    @Query("SELECT COUNT(*) FROM PracticeSession WHERE createdAtUtc > :since")
    suspend fun countSessionsCreatedAfter(since: Instant): Int

        @Query("DELETE FROM PracticeSession")
        suspend fun deleteAllSessions()
    
    // Sync-related queries
    @Query("UPDATE PracticeSession SET syncedAtUtc = :syncedAt, syncVersion = syncVersion + 1 WHERE id = :id")
    suspend fun markSynced(id: String, syncedAt: Instant)
    
    @Query("SELECT * FROM PracticeSession WHERE syncedAtUtc IS NULL")
    suspend fun getUnsynced(): List<PracticeSession>
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
    
    // Sync-related queries
    @Query("UPDATE ScanEvent SET syncedAtUtc = :syncedAt, syncVersion = syncVersion + 1 WHERE id = :id")
    suspend fun markSynced(id: String, syncedAt: Instant)
    
    @Query("SELECT * FROM ScanEvent WHERE syncedAtUtc IS NULL")
    suspend fun getUnsynced(): List<ScanEvent>
}

@Dao
interface NewMemberRegistrationDao {
    @Insert
    suspend fun insert(registration: NewMemberRegistration)
    
    @Query("SELECT * FROM NewMemberRegistration ORDER BY createdAtUtc DESC")
    suspend fun allRegistrations(): List<NewMemberRegistration>
    
    @Query("SELECT * FROM NewMemberRegistration WHERE id = :id")
    suspend fun get(id: String): NewMemberRegistration?
    
    @Query("SELECT * FROM NewMemberRegistration WHERE createdAtUtc > :sinceInstant ORDER BY createdAtUtc ASC")
    suspend fun registrationsCreatedAfter(sinceInstant: Instant): List<NewMemberRegistration>
    
    @Query("SELECT COUNT(*) FROM NewMemberRegistration WHERE createdAtUtc > :sinceInstant")
    suspend fun countRegistrationsCreatedAfter(sinceInstant: Instant): Int
    
    @Delete
    suspend fun delete(registration: NewMemberRegistration)
    
    @Query("DELETE FROM NewMemberRegistration")
    suspend fun deleteAll()
    
    // Approval workflow queries
    @Query("SELECT * FROM NewMemberRegistration WHERE approvalStatus = 'PENDING' ORDER BY createdAtUtc ASC")
    suspend fun getPendingRegistrations(): List<NewMemberRegistration>
    
    @Query("UPDATE NewMemberRegistration SET approvalStatus = :status, approvedAtUtc = :approvedAt WHERE id = :id")
    suspend fun approve(id: String, status: String = "APPROVED", approvedAt: Instant)
    
    @Query("UPDATE NewMemberRegistration SET approvalStatus = :status, rejectedAtUtc = :rejectedAt, rejectionReason = :reason WHERE id = :id")
    suspend fun reject(id: String, status: String = "REJECTED", rejectedAt: Instant, reason: String?)
    
    @Query("UPDATE NewMemberRegistration SET createdMemberId = :memberId WHERE id = :id")
    suspend fun linkCreatedMember(id: String, memberId: String)
    
    // Sync-related queries
    @Query("UPDATE NewMemberRegistration SET syncedAtUtc = :syncedAt, syncVersion = syncVersion + 1 WHERE id = :id")
    suspend fun markSynced(id: String, syncedAt: Instant)
    
    @Query("SELECT * FROM NewMemberRegistration WHERE syncedAtUtc IS NULL")
    suspend fun getUnsynced(): List<NewMemberRegistration>
}

// ===== Equipment Management DAOs (Phase 3 - Admin Tablet) =====

/**
 * DAO for EquipmentItem entity.
 * 
 * @see [design.md FR-8.2] - EquipmentItem schema
 */
@Dao
interface EquipmentItemDao {
    @Insert
    suspend fun insert(item: EquipmentItem)
    
    @Update
    suspend fun update(item: EquipmentItem)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: EquipmentItem)
    
    @Query("SELECT * FROM EquipmentItem WHERE id = :id")
    suspend fun get(id: String): EquipmentItem?
    
    @Query("SELECT * FROM EquipmentItem WHERE serialNumber = :serialNumber")
    suspend fun getBySerialNumber(serialNumber: String): EquipmentItem?
    
    @Query("SELECT * FROM EquipmentItem ORDER BY serialNumber ASC")
    suspend fun allItems(): List<EquipmentItem>
    
    @Query("SELECT * FROM EquipmentItem ORDER BY serialNumber ASC")
    fun allItemsFlow(): Flow<List<EquipmentItem>>
    
    @Query("SELECT * FROM EquipmentItem WHERE status = :status ORDER BY serialNumber ASC")
    suspend fun itemsByStatus(status: EquipmentStatus): List<EquipmentItem>
    
    @Query("SELECT * FROM EquipmentItem WHERE status = :status ORDER BY serialNumber ASC")
    fun itemsByStatusFlow(status: EquipmentStatus): Flow<List<EquipmentItem>>
    
    @Query("UPDATE EquipmentItem SET status = :status, modifiedAtUtc = :modifiedAt WHERE id = :id")
    suspend fun updateStatus(id: String, status: EquipmentStatus, modifiedAt: Instant)
    
    @Delete
    suspend fun delete(item: EquipmentItem)
    
    @Query("DELETE FROM EquipmentItem")
    suspend fun deleteAll()
    
    // Sync-related queries
    @Query("UPDATE EquipmentItem SET syncedAtUtc = :syncedAt, syncVersion = syncVersion + 1 WHERE id = :id")
    suspend fun markSynced(id: String, syncedAt: Instant)
    
    @Query("SELECT * FROM EquipmentItem WHERE syncedAtUtc IS NULL")
    suspend fun getUnsynced(): List<EquipmentItem>
}

/**
 * DAO for EquipmentCheckout entity.
 * 
 * @see [design.md FR-8.3] - EquipmentCheckout schema
 */
@Dao
interface EquipmentCheckoutDao {
    @Insert
    suspend fun insert(checkout: EquipmentCheckout)
    
    @Update
    suspend fun update(checkout: EquipmentCheckout)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(checkout: EquipmentCheckout)
    
    @Query("SELECT * FROM EquipmentCheckout WHERE id = :id")
    suspend fun get(id: String): EquipmentCheckout?
    
    /** Get active checkout for an equipment item (not yet returned) */
    @Query("SELECT * FROM EquipmentCheckout WHERE equipmentId = :equipmentId AND checkedInAtUtc IS NULL LIMIT 1")
    suspend fun getActiveCheckoutForEquipment(equipmentId: String): EquipmentCheckout?
    
    /** Get active checkout for a member (not yet returned) */
    @Query("SELECT * FROM EquipmentCheckout WHERE membershipId = :membershipId AND checkedInAtUtc IS NULL LIMIT 1")
    suspend fun getActiveCheckoutForMember(membershipId: String): EquipmentCheckout?
    
    /** Get all active (non-returned) checkouts */
    @Query("SELECT * FROM EquipmentCheckout WHERE checkedInAtUtc IS NULL ORDER BY checkedOutAtUtc DESC")
    suspend fun allActiveCheckouts(): List<EquipmentCheckout>
    
    /** Get all active checkouts as Flow for real-time updates */
    @Query("SELECT * FROM EquipmentCheckout WHERE checkedInAtUtc IS NULL ORDER BY checkedOutAtUtc DESC")
    fun allActiveCheckoutsFlow(): Flow<List<EquipmentCheckout>>
    
    /** Get checkout history for an equipment item */
    @Query("SELECT * FROM EquipmentCheckout WHERE equipmentId = :equipmentId ORDER BY checkedOutAtUtc DESC")
    suspend fun checkoutHistoryForEquipment(equipmentId: String): List<EquipmentCheckout>
    
    /** Get checkout history for a member */
    @Query("SELECT * FROM EquipmentCheckout WHERE membershipId = :membershipId ORDER BY checkedOutAtUtc DESC")
    suspend fun checkoutHistoryForMember(membershipId: String): List<EquipmentCheckout>
    
    /** Check in equipment (record return) */
    @Query("UPDATE EquipmentCheckout SET checkedInAtUtc = :checkedInAt, checkedInByDeviceId = :deviceId, checkinNotes = :notes, modifiedAtUtc = :modifiedAt WHERE id = :id")
    suspend fun checkIn(id: String, checkedInAt: Instant, deviceId: String, notes: String?, modifiedAt: Instant)
    
    /** Get checkouts with conflicts */
    @Query("SELECT * FROM EquipmentCheckout WHERE conflictStatus = :status ORDER BY checkedOutAtUtc DESC")
    suspend fun checkoutsWithConflictStatus(status: ConflictStatus): List<EquipmentCheckout>
    
    /** Get all pending conflict checkouts */
    @Query("SELECT * FROM EquipmentCheckout WHERE conflictStatus = 'Pending' ORDER BY checkedOutAtUtc DESC")
    suspend fun getPendingConflicts(): List<EquipmentCheckout>
    
    /** Get all pending conflicts as Flow */
    @Query("SELECT * FROM EquipmentCheckout WHERE conflictStatus = 'Pending' ORDER BY checkedOutAtUtc DESC")
    fun getPendingConflictsFlow(): Flow<List<EquipmentCheckout>>
    
    /** Resolve a conflict */
    @Query("UPDATE EquipmentCheckout SET conflictStatus = :status, conflictResolutionNotes = :notes, modifiedAtUtc = :modifiedAt WHERE id = :id")
    suspend fun resolveConflict(id: String, status: ConflictStatus, notes: String?, modifiedAt: Instant)
    
    @Delete
    suspend fun delete(checkout: EquipmentCheckout)
    
    @Query("DELETE FROM EquipmentCheckout")
    suspend fun deleteAll()
    
    // Sync-related queries
    @Query("UPDATE EquipmentCheckout SET syncedAtUtc = :syncedAt, syncVersion = syncVersion + 1 WHERE id = :id")
    suspend fun markSynced(id: String, syncedAt: Instant)
    
    @Query("SELECT * FROM EquipmentCheckout WHERE syncedAtUtc IS NULL")
    suspend fun getUnsynced(): List<EquipmentCheckout>
}
