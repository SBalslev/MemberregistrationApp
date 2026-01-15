package com.club.medlems.data.sync

import android.util.Log
import com.club.medlems.data.dao.CheckInDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.NewMemberRegistrationDao
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.dao.ScanEventDao
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberStatus
import com.club.medlems.data.entity.NewMemberRegistration
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.domain.prefs.DeviceConfigPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Handles sync operations between local database and remote peers.
 * 
 * Responsibilities:
 * - Collect changes since last sync timestamp
 * - Apply incoming changes from peers
 * - Track sync metadata for each entity type
 * 
 * @see [design.md FR-8] - Sync Metadata and Tracking
 */
@Singleton
class SyncRepository @Inject constructor(
    private val memberDao: MemberDao,
    private val checkInDao: CheckInDao,
    private val practiceSessionDao: PracticeSessionDao,
    private val scanEventDao: ScanEventDao,
    private val newMemberRegistrationDao: NewMemberRegistrationDao,
    private val conflictDetector: ConflictDetector,
    private val conflictRepository: ConflictRepository,
    private val deviceConfigPreferences: DeviceConfigPreferences
) {
    companion object {
        private const val TAG = "SyncRepository"
    }
    
    /** Current device type - from device configuration preferences */
    val localDeviceType: DeviceType
        get() = deviceConfigPreferences.getDeviceType()
    
    /**
     * Collects all changes since the given timestamp for sync pull.
     * 
     * @param since The timestamp to collect changes from (exclusive)
     * @param deviceId This device's ID for filtering
     * @return SyncEntities containing all changes
     */
    suspend fun collectChangesSince(
        since: Instant,
        deviceId: String
    ): SyncEntities = withContext(Dispatchers.IO) {
        Log.d(TAG, "Collecting changes since $since")
        
        val members = memberDao.allMembers().map { it.toSyncable(deviceId) }
        val checkIns = checkInDao.checkInsCreatedAfter(since).map { it.toSyncable(deviceId) }
        val sessions = practiceSessionDao.sessionsCreatedAfter(since).map { it.toSyncable(deviceId) }
        val registrations = newMemberRegistrationDao.registrationsCreatedAfter(since)
            .map { it.toSyncable(deviceId) }
        
        Log.i(TAG, "Collected: ${members.size} members, ${checkIns.size} check-ins, " +
            "${sessions.size} sessions, ${registrations.size} registrations")
        
        SyncEntities(
            members = members,
            checkIns = checkIns,
            practiceSessions = sessions,
            newMemberRegistrations = registrations
        )
    }
    
    /**
     * Applies incoming sync payload from a peer device.
     * Returns a SyncResult with counts and any conflicts.
     * 
     * @param payload The incoming sync payload
     * @param sourceDeviceId The device ID that sent this payload
     * @return SyncResult with operation counts
     */
    suspend fun applySyncPayload(
        payload: SyncPayload,
        sourceDeviceId: String
    ): SyncResult = withContext(Dispatchers.IO) {
        Log.d(TAG, "Applying sync payload from $sourceDeviceId")
        
        var membersProcessed = 0
        var checkInsProcessed = 0
        var sessionsProcessed = 0
        var registrationsProcessed = 0
        val conflicts = mutableListOf<SyncConflict>()
        
        // Process members (laptop is master, tablets only receive)
        payload.entities.members.forEach { syncMember ->
            try {
                val existing = memberDao.get(syncMember.membershipId)
                if (existing == null || shouldAcceptMemberUpdate(existing, syncMember, payload.deviceType)) {
                    memberDao.upsert(syncMember.toEntity())
                    membersProcessed++
                } else {
                    // Conflict - keep existing (laptop wins rule)
                    conflicts.add(conflictDetector.createConflictRecord(
                        conflictType = ConflictType.MEMBER_DATA,
                        entityType = "Member",
                        entityId = syncMember.membershipId,
                        localDeviceId = sourceDeviceId,
                        localTimestamp = existing.updatedAtUtc,
                        localSyncVersion = 0L,
                        remoteDeviceId = payload.deviceId,
                        remoteDeviceName = null,
                        remoteTimestamp = syncMember.modifiedAtUtc,
                        remoteSyncVersion = syncMember.syncVersion,
                        suggestedResolution = ConflictResolution.KEEP_LOCAL
                    ))
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing member ${syncMember.membershipId}", e)
            }
        }
        
        // Process check-ins (append-only, skip duplicates)
        payload.entities.checkIns.forEach { syncCheckIn ->
            try {
                val existing = checkInDao.firstForDate(
                    syncCheckIn.membershipId,
                    syncCheckIn.localDate
                )
                if (existing == null) {
                    checkInDao.insert(syncCheckIn.toEntity())
                    checkInsProcessed++
                }
                // If exists for same date, skip (idempotent)
            } catch (e: Exception) {
                Log.e(TAG, "Error processing check-in for ${syncCheckIn.membershipId}", e)
            }
        }
        
        // Process practice sessions (append-only with conflict detection)
        payload.entities.practiceSessions.forEach { syncSession ->
            try {
                val existingSessions = practiceSessionDao.sessionsForMemberOnDate(
                    syncSession.membershipId,
                    syncSession.localDate
                )
                val isDuplicate = existingSessions.any { 
                    it.practiceType == syncSession.practiceType &&
                    it.points == syncSession.points &&
                    it.krydser == syncSession.krydser
                }
                
                if (!isDuplicate) {
                    practiceSessionDao.insert(syncSession.toEntity())
                    sessionsProcessed++
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing session for ${syncSession.membershipId}", e)
            }
        }
        
        // Process new member registrations
        payload.entities.newMemberRegistrations.forEach { syncReg ->
            try {
                val existing = newMemberRegistrationDao.get(syncReg.id)
                if (existing == null) {
                    newMemberRegistrationDao.insert(syncReg.toEntity())
                    registrationsProcessed++
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing registration ${syncReg.id}", e)
            }
        }
        
        Log.i(TAG, "Sync applied: $membersProcessed members, $checkInsProcessed check-ins, " +
            "$sessionsProcessed sessions, $registrationsProcessed registrations, " +
            "${conflicts.size} conflicts")
        
        SyncResult(
            membersProcessed = membersProcessed,
            checkInsProcessed = checkInsProcessed,
            sessionsProcessed = sessionsProcessed,
            registrationsProcessed = registrationsProcessed,
            conflicts = conflicts
        )
    }
    
    /**
     * Gets the count of pending changes since last sync.
     */
    suspend fun getPendingChangesCount(since: Instant): Int = withContext(Dispatchers.IO) {
        checkInDao.countCheckInsCreatedAfter(since) +
            practiceSessionDao.countSessionsCreatedAfter(since) +
            newMemberRegistrationDao.countRegistrationsCreatedAfter(since)
    }
    
    // ===== Sync status methods for SyncManager =====
    
    /**
     * Gets all members that haven't been synced yet.
     */
    suspend fun getUnsyncedMembers(): List<Member> = withContext(Dispatchers.IO) {
        memberDao.getUnsynced()
    }
    
    /**
     * Gets all check-ins that haven't been synced yet.
     */
    suspend fun getUnsyncedCheckIns(): List<CheckIn> = withContext(Dispatchers.IO) {
        checkInDao.getUnsynced()
    }
    
    /**
     * Gets all practice sessions that haven't been synced yet.
     */
    suspend fun getUnsyncedPracticeSessions(): List<PracticeSession> = withContext(Dispatchers.IO) {
        practiceSessionDao.getUnsynced()
    }
    
    /**
     * Gets all new member registrations that haven't been synced yet.
     */
    suspend fun getUnsyncedRegistrations(): List<NewMemberRegistration> = withContext(Dispatchers.IO) {
        newMemberRegistrationDao.getUnsynced()
    }
    
    /**
     * Marks a member as synced.
     */
    suspend fun markMemberSynced(membershipId: String, syncedAt: Instant) = withContext(Dispatchers.IO) {
        memberDao.markSynced(membershipId, syncedAt)
    }
    
    /**
     * Marks a check-in as synced.
     */
    suspend fun markCheckInSynced(id: String, syncedAt: Instant) = withContext(Dispatchers.IO) {
        checkInDao.markSynced(id, syncedAt)
    }
    
    /**
     * Marks a practice session as synced.
     */
    suspend fun markSessionSynced(id: String, syncedAt: Instant) = withContext(Dispatchers.IO) {
        practiceSessionDao.markSynced(id, syncedAt)
    }
    
    /**
     * Marks a new member registration as synced.
     */
    suspend fun markRegistrationSynced(id: String, syncedAt: Instant) = withContext(Dispatchers.IO) {
        newMemberRegistrationDao.markSynced(id, syncedAt)
    }
    
    /**
     * Collects all unsynced entities into a SyncEntities payload for pushing.
     * 
     * @param deviceId This device's ID
     * @return SyncEntities containing all unsynced records
     */
    suspend fun collectUnsyncedEntities(deviceId: String): SyncEntities = withContext(Dispatchers.IO) {
        SyncEntities(
            members = memberDao.getUnsynced().map { it.toSyncable(deviceId) },
            checkIns = checkInDao.getUnsynced().map { it.toSyncable(deviceId) },
            practiceSessions = practiceSessionDao.getUnsynced().map { it.toSyncable(deviceId) },
            newMemberRegistrations = newMemberRegistrationDao.getUnsynced().map { it.toSyncable(deviceId) }
        )
    }
    
    /**
     * Marks all entities in a SyncEntities payload as synced.
     * 
     * @param entities The entities to mark as synced
     * @param syncedAt The timestamp to use
     */
    suspend fun markEntitiesSynced(entities: SyncEntities, syncedAt: Instant) = withContext(Dispatchers.IO) {
        entities.members.forEach { memberDao.markSynced(it.membershipId, syncedAt) }
        entities.checkIns.forEach { checkInDao.markSynced(it.id, syncedAt) }
        entities.practiceSessions.forEach { practiceSessionDao.markSynced(it.id, syncedAt) }
        entities.newMemberRegistrations.forEach { newMemberRegistrationDao.markSynced(it.id, syncedAt) }
    }
    
    /**
     * Determines if a member update from sync should be accepted.
     * Rule: Laptop is master for member data (FR-7.3, FR-7.6).
     * 
     * @param existing The existing local member
     * @param incoming The incoming sync data
     * @param remoteDeviceType The device type of the source device
     */
    private fun shouldAcceptMemberUpdate(
        existing: Member,
        incoming: SyncableMember,
        remoteDeviceType: DeviceType
    ): Boolean {
        return conflictDetector.shouldAcceptMemberUpdate(
            local = existing,
            remote = incoming,
            localDeviceType = localDeviceType,
            remoteDeviceType = remoteDeviceType
        )
    }
    
    // Extension functions to convert between entity and syncable types
    
    private fun Member.toSyncable(deviceId: String) = SyncableMember(
        membershipId = membershipId,
        firstName = firstName,
        lastName = lastName,
        email = email,
        phone = phone,
        status = status,
        expiresOn = expiresOn,
        birthDate = birthDate,
        registrationId = null,
        deviceId = deviceId,
        syncVersion = 1,
        createdAtUtc = updatedAtUtc,
        modifiedAtUtc = updatedAtUtc,
        syncedAtUtc = null
    )
    
    private fun SyncableMember.toEntity() = Member(
        membershipId = membershipId,
        firstName = firstName,
        lastName = lastName,
        email = email,
        phone = phone,
        status = status,
        expiresOn = expiresOn,
        birthDate = birthDate,
        updatedAtUtc = modifiedAtUtc
    )
    
    private fun CheckIn.toSyncable(deviceId: String) = SyncableCheckIn(
        id = id,
        membershipId = membershipId,
        localDate = localDate,
        firstOfDayFlag = firstOfDayFlag,
        deviceId = deviceId,
        syncVersion = 1,
        createdAtUtc = createdAtUtc,
        modifiedAtUtc = createdAtUtc,
        syncedAtUtc = null
    )
    
    private fun SyncableCheckIn.toEntity() = CheckIn(
        id = id,
        membershipId = membershipId,
        localDate = localDate,
        firstOfDayFlag = firstOfDayFlag,
        createdAtUtc = createdAtUtc
    )
    
    private fun PracticeSession.toSyncable(deviceId: String) = SyncablePracticeSession(
        id = id,
        membershipId = membershipId,
        localDate = localDate,
        practiceType = practiceType,
        points = points,
        krydser = krydser,
        classification = classification,
        source = source,
        deviceId = deviceId,
        syncVersion = 1,
        createdAtUtc = createdAtUtc,
        modifiedAtUtc = createdAtUtc,
        syncedAtUtc = null
    )
    
    private fun SyncablePracticeSession.toEntity() = PracticeSession(
        id = id,
        membershipId = membershipId,
        localDate = localDate,
        practiceType = practiceType,
        points = points,
        krydser = krydser,
        classification = classification,
        source = source,
        createdAtUtc = createdAtUtc
    )
    
    private fun NewMemberRegistration.toSyncable(deviceId: String): SyncableNewMemberRegistration {
        // Encode photo to base64 for sync transfer
        val photoBase64 = try {
            val photoFile = java.io.File(photoPath)
            if (photoFile.exists()) {
                android.util.Base64.encodeToString(photoFile.readBytes(), android.util.Base64.NO_WRAP)
            } else null
        } catch (e: Exception) {
            Log.w(TAG, "Failed to encode photo for sync: ${e.message}")
            null
        }
        
        return SyncableNewMemberRegistration(
            id = id,
            temporaryId = temporaryId,
            photoPath = photoPath,
            photoBase64 = photoBase64,
            firstName = firstName,
            lastName = lastName,
            email = email,
            phone = phone,
            birthDate = birthDate,
            gender = gender,
            address = address,
            zipCode = zipCode,
            city = city,
            guardianName = guardianName,
            guardianPhone = guardianPhone,
            guardianEmail = guardianEmail,
            approvalStatus = when (approvalStatus) {
                com.club.medlems.data.entity.ApprovalStatus.PENDING -> ApprovalStatus.PENDING
                com.club.medlems.data.entity.ApprovalStatus.APPROVED -> ApprovalStatus.APPROVED
                com.club.medlems.data.entity.ApprovalStatus.REJECTED -> ApprovalStatus.REJECTED
            },
            deviceId = deviceId,
            syncVersion = syncVersion,
            createdAtUtc = createdAtUtc,
            modifiedAtUtc = createdAtUtc,
            syncedAtUtc = syncedAtUtc
        )
    }
    
    private fun SyncableNewMemberRegistration.toEntity() = NewMemberRegistration(
        id = id,
        temporaryId = temporaryId,
        photoPath = photoPath,
        firstName = firstName,
        lastName = lastName,
        email = email,
        phone = phone,
        birthDate = birthDate,
        gender = gender,
        address = address,
        zipCode = zipCode,
        city = city,
        guardianName = guardianName,
        guardianPhone = guardianPhone,
        guardianEmail = guardianEmail,
        createdAtUtc = createdAtUtc
    )
}

/**
 * Result of applying a sync payload.
 */
data class SyncResult(
    val membersProcessed: Int = 0,
    val checkInsProcessed: Int = 0,
    val sessionsProcessed: Int = 0,
    val registrationsProcessed: Int = 0,
    val conflicts: List<SyncConflict> = emptyList(),
    val errorMessage: String? = null
) {
    val totalProcessed: Int get() = membersProcessed + checkInsProcessed + 
        sessionsProcessed + registrationsProcessed
    val hasConflicts: Boolean get() = conflicts.isNotEmpty()
    val hasErrors: Boolean get() = errorMessage != null || conflicts.isNotEmpty()
    
    /**
     * Combines this result with another, summing counts and merging conflicts.
     */
    fun combine(other: SyncResult): SyncResult = SyncResult(
        membersProcessed = this.membersProcessed + other.membersProcessed,
        checkInsProcessed = this.checkInsProcessed + other.checkInsProcessed,
        sessionsProcessed = this.sessionsProcessed + other.sessionsProcessed,
        registrationsProcessed = this.registrationsProcessed + other.registrationsProcessed,
        conflicts = this.conflicts + other.conflicts,
        errorMessage = this.errorMessage ?: other.errorMessage
    )
}
