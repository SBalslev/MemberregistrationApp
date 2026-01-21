package com.club.medlems.data.dao

import androidx.room.*
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.ConflictStatus
import com.club.medlems.data.entity.EquipmentCheckout
import com.club.medlems.data.entity.EquipmentItem
import com.club.medlems.data.entity.EquipmentStatus
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberPreference
import com.club.medlems.data.entity.MemberStatus
import com.club.medlems.data.entity.NewMemberRegistration
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.data.entity.ScanEvent
import com.club.medlems.data.entity.TrainerDiscipline
import com.club.medlems.data.entity.TrainerInfo
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate

@Dao
interface MemberDao {
    /** Get member by internalId (primary key) */
    @Query("SELECT * FROM Member WHERE internalId = :internalId")
    suspend fun getByInternalId(internalId: String): Member?
    
    /** Get member by membershipId (club-assigned ID, may be null for trials) */
    @Query("SELECT * FROM Member WHERE membershipId = :membershipId")
    suspend fun getByMembershipId(membershipId: String): Member?
    
    /** @deprecated Use getByInternalId or getByMembershipId */
    @Query("SELECT * FROM Member WHERE membershipId = :id OR internalId = :id")
    suspend fun get(id: String): Member?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(member: Member)

    @Query("SELECT * FROM Member WHERE status = :status")
    fun membersByStatus(status: MemberStatus = MemberStatus.ACTIVE): Flow<List<Member>>

    @Query("UPDATE Member SET status = :status WHERE internalId IN (:ids)")
    suspend fun updateStatus(ids: List<String>, status: MemberStatus)

    @Query("SELECT * FROM Member")
    suspend fun allMembers(): List<Member>
    
    /** Get trial members (those without membershipId assigned) */
    @Query("SELECT * FROM Member WHERE memberType = 'TRIAL' ORDER BY createdAtUtc DESC")
    suspend fun getTrialMembers(): List<Member>

    @Query("SELECT internalId, membershipId, firstName, lastName FROM Member WHERE internalId IN (:ids)")
    suspend fun getMemberNames(ids: List<String>): List<MemberNameProjection>

    @Query("DELETE FROM Member")
    suspend fun deleteAll()
    
    // Sync-related queries
    @Query("SELECT * FROM Member WHERE updatedAtUtc > :since ORDER BY updatedAtUtc ASC")
    suspend fun getModifiedSince(since: Instant): List<Member>
    
    @Query("UPDATE Member SET syncedAtUtc = :syncedAt, syncVersion = syncVersion + 1 WHERE internalId = :internalId")
    suspend fun markSynced(internalId: String, syncedAt: Instant)
    
    @Query("SELECT * FROM Member WHERE syncedAtUtc IS NULL OR syncedAtUtc < updatedAtUtc")
    suspend fun getUnsynced(): List<Member>
    
    // Search queries for equipment checkout and check-in
    @Query("""
        SELECT * FROM Member 
        WHERE status = 'ACTIVE' 
        AND (firstName LIKE '%' || :query || '%' 
             OR lastName LIKE '%' || :query || '%'
             OR membershipId LIKE '%' || :query || '%'
             OR internalId LIKE '%' || :query || '%')
        ORDER BY lastName, firstName
        LIMIT 20
    """)
    suspend fun searchByNameOrId(query: String): List<Member>
}

data class MemberNameProjection(
    val internalId: String,
    val membershipId: String?,
    val firstName: String,
    val lastName: String
) {
    val displayName: String get() = listOfNotNull(firstName, lastName).joinToString(" ").trim()
}

@Dao
interface CheckInDao {
    /** Get first check-in for member on date using internalMemberId */
    @Query("SELECT * FROM CheckIn WHERE internalMemberId = :internalMemberId AND localDate = :date LIMIT 1")
    suspend fun firstForDate(internalMemberId: String, date: LocalDate): CheckIn?

    @Insert
    suspend fun insert(ci: CheckIn)

    @Delete
    suspend fun delete(ci: CheckIn)

    /** Get last check-in date for member using internalMemberId */
    @Query("SELECT MAX(localDate) FROM CheckIn WHERE internalMemberId = :internalMemberId")
    suspend fun lastCheckDate(internalMemberId: String): LocalDate?

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

    /** Get sessions for member on date using internalMemberId */
    @Query("SELECT * FROM PracticeSession WHERE localDate = :date AND internalMemberId = :internalMemberId")
    suspend fun sessionsForMemberOnDate(internalMemberId: String, date: LocalDate): List<PracticeSession>

    @Query("SELECT * FROM PracticeSession WHERE localDate BETWEEN :start AND :end AND practiceType = :practiceType AND points > 0 ORDER BY points DESC, krydser DESC, createdAtUtc DESC")
    suspend fun rangeForType(start: LocalDate, end: LocalDate, practiceType: PracticeType): List<PracticeSession>

    /** Get history for member using internalMemberId */
    @Query("SELECT * FROM PracticeSession WHERE internalMemberId = :internalMemberId AND localDate BETWEEN :start AND :end AND practiceType = :practiceType AND classification = :classification AND points > 0 ORDER BY createdAtUtc DESC")
    suspend fun historyForMember(
        internalMemberId: String,
        start: LocalDate,
        end: LocalDate,
        practiceType: PracticeType,
        classification: String
    ): List<PracticeSession>

    /** Get sessions for member in range using internalMemberId */
    @Query("SELECT * FROM PracticeSession WHERE internalMemberId = :internalMemberId AND localDate BETWEEN :start AND :end ORDER BY createdAtUtc DESC")
    suspend fun sessionsForMemberInRange(
        internalMemberId: String,
        start: LocalDate,
        end: LocalDate
    ): List<PracticeSession>

    /** Get history for member all classifications using internalMemberId */
    @Query("SELECT * FROM PracticeSession WHERE internalMemberId = :internalMemberId AND localDate BETWEEN :start AND :end AND practiceType = :practiceType AND points > 0 ORDER BY createdAtUtc DESC")
    suspend fun historyForMemberAllClassifications(
        internalMemberId: String,
        start: LocalDate,
        end: LocalDate,
        practiceType: PracticeType
    ): List<PracticeSession>

    /** Get history count for member using internalMemberId */
    @Query("SELECT COUNT(*) FROM PracticeSession WHERE internalMemberId = :internalMemberId AND localDate BETWEEN :start AND :end AND practiceType = :practiceType AND points > 0")
    suspend fun historyCountForMemberAllClassifications(
        internalMemberId: String,
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

    /** Get last event instant for member using internalMemberId */
    @Query("SELECT createdAtUtc FROM ScanEvent WHERE internalMemberId = :internalMemberId ORDER BY createdAtUtc DESC LIMIT 1")
    suspend fun lastEventInstant(internalMemberId: String): kotlinx.datetime.Instant?

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
    
    @Update
    suspend fun update(registration: NewMemberRegistration)
    
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

// ===== Equipment Management DAOs (Phase 3 - Trainer Tablet) =====

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
    
    /** Get active checkout for a member using internalMemberId (not yet returned) */
    @Query("SELECT * FROM EquipmentCheckout WHERE internalMemberId = :internalMemberId AND checkedInAtUtc IS NULL LIMIT 1")
    suspend fun getActiveCheckoutForMember(internalMemberId: String): EquipmentCheckout?
    
    /** Get all active (non-returned) checkouts */
    @Query("SELECT * FROM EquipmentCheckout WHERE checkedInAtUtc IS NULL ORDER BY checkedOutAtUtc DESC")
    suspend fun allActiveCheckouts(): List<EquipmentCheckout>
    
    /** Get all active checkouts as Flow for real-time updates */
    @Query("SELECT * FROM EquipmentCheckout WHERE checkedInAtUtc IS NULL ORDER BY checkedOutAtUtc DESC")
    fun allActiveCheckoutsFlow(): Flow<List<EquipmentCheckout>>
    
    /** Get checkout history for an equipment item */
    @Query("SELECT * FROM EquipmentCheckout WHERE equipmentId = :equipmentId ORDER BY checkedOutAtUtc DESC")
    suspend fun checkoutHistoryForEquipment(equipmentId: String): List<EquipmentCheckout>
    
    /** Get checkout history for a member using internalMemberId */
    @Query("SELECT * FROM EquipmentCheckout WHERE internalMemberId = :internalMemberId ORDER BY checkedOutAtUtc DESC")
    suspend fun checkoutHistoryForMember(internalMemberId: String): List<EquipmentCheckout>
    
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

// ===== Member Preference DAO (for sync of UI preferences) =====

/**
 * DAO for MemberPreference entity.
 * Used to sync practice preferences between tablets via the laptop.
 *
 * @see [design.md member-preference-sync] - Member Preference Sync feature
 */
@Dao
interface MemberPreferenceDao {
    /** Get preference for a specific member */
    @Query("SELECT * FROM member_preference WHERE memberId = :memberId")
    suspend fun get(memberId: String): MemberPreference?

    /** Insert or update a preference */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(preference: MemberPreference)

    /** Get all preferences (for sync push) */
    @Query("SELECT * FROM member_preference")
    suspend fun getAll(): List<MemberPreference>

    /** Get preferences updated since a timestamp (for incremental sync) */
    @Query("SELECT * FROM member_preference WHERE updatedAtUtc > :since ORDER BY updatedAtUtc ASC")
    suspend fun getModifiedSince(since: Instant): List<MemberPreference>

    /** Delete preference for a member */
    @Query("DELETE FROM member_preference WHERE memberId = :memberId")
    suspend fun delete(memberId: String)

    /** Delete all preferences */
    @Query("DELETE FROM member_preference")
    suspend fun deleteAll()
}

// ===== Trainer Experience DAOs =====

/**
 * DAO for TrainerInfo entity.
 * Manages trainer designations and certifications.
 *
 * @see [trainer-experience/prd.md] - Trainer Experience Feature
 */
@Dao
interface TrainerInfoDao {
    /** Get trainer info for a specific member */
    @Query("SELECT * FROM trainer_info WHERE memberId = :memberId")
    suspend fun get(memberId: String): TrainerInfo?

    /** Get all trainers (members marked as trainers) */
    @Query("SELECT * FROM trainer_info WHERE isTrainer = 1")
    suspend fun getAllTrainers(): List<TrainerInfo>

    /** Get all trainers as Flow for real-time updates */
    @Query("SELECT * FROM trainer_info WHERE isTrainer = 1")
    fun getAllTrainersFlow(): Flow<List<TrainerInfo>>

    /** Insert or update trainer info */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(trainerInfo: TrainerInfo)

    /** Delete trainer info for a member */
    @Query("DELETE FROM trainer_info WHERE memberId = :memberId")
    suspend fun delete(memberId: String)

    /** Delete all trainer info */
    @Query("DELETE FROM trainer_info")
    suspend fun deleteAll()

    // Sync-related queries
    @Query("SELECT * FROM trainer_info WHERE syncedAtUtc IS NULL OR syncedAtUtc < modifiedAtUtc")
    suspend fun getUnsynced(): List<TrainerInfo>

    @Query("UPDATE trainer_info SET syncedAtUtc = :syncedAt, syncVersion = syncVersion + 1 WHERE memberId = :memberId")
    suspend fun markSynced(memberId: String, syncedAt: Instant)
}

/**
 * DAO for TrainerDiscipline entity.
 * Manages discipline qualifications for trainers.
 *
 * @see [trainer-experience/prd.md] - Trainer Experience Feature
 */
@Dao
interface TrainerDisciplineDao {
    /** Get all disciplines for a trainer */
    @Query("SELECT * FROM trainer_discipline WHERE memberId = :memberId")
    suspend fun getDisciplinesForTrainer(memberId: String): List<TrainerDiscipline>

    /** Get all disciplines for a trainer as Flow */
    @Query("SELECT * FROM trainer_discipline WHERE memberId = :memberId")
    fun getDisciplinesForTrainerFlow(memberId: String): Flow<List<TrainerDiscipline>>

    /** Get a specific discipline by ID */
    @Query("SELECT * FROM trainer_discipline WHERE id = :id")
    suspend fun get(id: String): TrainerDiscipline?

    /** Get trainers qualified for a specific discipline */
    @Query("SELECT * FROM trainer_discipline WHERE discipline = :discipline")
    suspend fun getTrainersForDiscipline(discipline: PracticeType): List<TrainerDiscipline>

    /** Insert a new discipline qualification */
    @Insert
    suspend fun insert(discipline: TrainerDiscipline)

    /** Insert or update a discipline qualification */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(discipline: TrainerDiscipline)

    /** Delete a discipline qualification */
    @Delete
    suspend fun delete(discipline: TrainerDiscipline)

    /** Delete all disciplines for a trainer */
    @Query("DELETE FROM trainer_discipline WHERE memberId = :memberId")
    suspend fun deleteAllForTrainer(memberId: String)

    /** Delete all discipline qualifications */
    @Query("DELETE FROM trainer_discipline")
    suspend fun deleteAll()

    // Sync-related queries
    @Query("SELECT * FROM trainer_discipline WHERE syncedAtUtc IS NULL OR syncedAtUtc < modifiedAtUtc")
    suspend fun getUnsynced(): List<TrainerDiscipline>

    @Query("UPDATE trainer_discipline SET syncedAtUtc = :syncedAt, syncVersion = syncVersion + 1 WHERE id = :id")
    suspend fun markSynced(id: String, syncedAt: Instant)
}
