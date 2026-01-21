package com.club.medlems.data.sync

import android.util.Log
import com.club.medlems.data.dao.CheckInDao
import com.club.medlems.data.dao.EquipmentCheckoutDao
import com.club.medlems.data.dao.EquipmentItemDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.MemberPreferenceDao
import com.club.medlems.data.dao.NewMemberRegistrationDao
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.dao.ScanEventDao
import com.club.medlems.data.dao.TrainerDisciplineDao
import com.club.medlems.data.dao.TrainerInfoDao
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberPreference
import com.club.medlems.data.entity.MemberStatus
import com.club.medlems.data.entity.MemberType
import com.club.medlems.data.entity.NewMemberRegistration
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.TrainerDiscipline
import com.club.medlems.data.entity.TrainerInfo
import com.club.medlems.domain.prefs.DeviceConfigPreferences
import com.club.medlems.domain.prefs.LastClassificationStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
// Equipment entity types - use fully qualified names in code to avoid conflicts with sync types
import com.club.medlems.data.entity.EquipmentCheckout as EntityEquipmentCheckout
import com.club.medlems.data.entity.EquipmentItem as EntityEquipmentItem

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
    private val equipmentItemDao: EquipmentItemDao,
    private val equipmentCheckoutDao: EquipmentCheckoutDao,
    private val memberPreferenceDao: MemberPreferenceDao,
    private val trainerInfoDao: TrainerInfoDao,
    private val trainerDisciplineDao: TrainerDisciplineDao,
    private val conflictDetector: ConflictDetector,
    private val conflictRepository: ConflictRepository,
    private val deviceConfigPreferences: DeviceConfigPreferences,
    private val lastClassificationStore: LastClassificationStore
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
        val equipmentItems = equipmentItemDao.getUnsynced().map { it.toSyncable(deviceId) }
        val equipmentCheckouts = equipmentCheckoutDao.getUnsynced().map { it.toSyncable(deviceId) }
        val trainerInfos = trainerInfoDao.getUnsynced().map { it.toSyncable(deviceId) }
        val trainerDisciplines = trainerDisciplineDao.getUnsynced().map { it.toSyncable(deviceId) }

        Log.i(TAG, "Collected: ${members.size} members, ${checkIns.size} check-ins, " +
            "${sessions.size} sessions, ${registrations.size} registrations, " +
            "${equipmentItems.size} equipment items, ${equipmentCheckouts.size} checkouts, " +
            "${trainerInfos.size} trainer infos, ${trainerDisciplines.size} trainer disciplines")

        SyncEntities(
            members = members,
            checkIns = checkIns,
            practiceSessions = sessions,
            newMemberRegistrations = registrations,
            equipmentItems = equipmentItems,
            equipmentCheckouts = equipmentCheckouts,
            trainerInfos = trainerInfos,
            trainerDisciplines = trainerDisciplines
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
                val existing = memberDao.getByInternalId(syncMember.internalId)
                if (existing == null || shouldAcceptMemberUpdate(existing, syncMember, payload.deviceType)) {
                    memberDao.upsert(syncMember.toEntity())
                    membersProcessed++
                } else {
                    // Conflict - keep existing (laptop wins rule)
                    conflicts.add(conflictDetector.createConflictRecord(
                        conflictType = ConflictType.MEMBER_DATA,
                        entityType = "Member",
                        entityId = syncMember.internalId,
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
                Log.e(TAG, "Error processing member ${syncMember.internalId}", e)
            }
        }
        
        // Process check-ins (append-only, skip duplicates)
        payload.entities.checkIns.forEach { syncCheckIn ->
            try {
                val existing = checkInDao.firstForDate(
                    syncCheckIn.internalMemberId,
                    syncCheckIn.localDate
                )
                if (existing == null) {
                    checkInDao.insert(syncCheckIn.toEntity())
                    checkInsProcessed++
                }
                // If exists for same date, skip (idempotent)
            } catch (e: Exception) {
                Log.e(TAG, "Error processing check-in for ${syncCheckIn.internalMemberId}", e)
            }
        }
        
        // Process practice sessions (append-only with conflict detection)
        payload.entities.practiceSessions.forEach { syncSession ->
            try {
                val existingSessions = practiceSessionDao.sessionsForMemberOnDate(
                    syncSession.internalMemberId,
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
        // Note: Updates existing registrations when incoming syncVersion is higher
        // This ensures approval/rejection status flows back from laptop to tablets
        payload.entities.newMemberRegistrations.forEach { syncReg ->
            try {
                val existing = newMemberRegistrationDao.get(syncReg.id)
                if (existing == null) {
                    // New registration - insert it
                    newMemberRegistrationDao.insert(syncReg.toEntity())
                    registrationsProcessed++
                } else if (syncReg.syncVersion > existing.syncVersion) {
                    // Incoming has higher version - update local record
                    // This handles approval/rejection status flowing from laptop
                    newMemberRegistrationDao.update(syncReg.toEntity())
                    registrationsProcessed++
                    Log.d(TAG, "Updated registration ${syncReg.id}: status=${syncReg.approvalStatus}, version=${syncReg.syncVersion}")
                }
                // If existing.syncVersion >= syncReg.syncVersion, skip (already up to date)
            } catch (e: Exception) {
                Log.e(TAG, "Error processing registration ${syncReg.id}", e)
            }
        }
        
        // Process equipment items
        // Laptop is master for equipment - updates flow from laptop to tablets
        var equipmentItemsProcessed = 0
        payload.entities.equipmentItems.forEach { syncItem ->
            try {
                val existing = equipmentItemDao.get(syncItem.id)
                if (existing == null) {
                    // New equipment item - insert it
                    equipmentItemDao.insert(syncItem.toEntity())
                    equipmentItemsProcessed++
                } else if (syncItem.syncVersion > existing.syncVersion) {
                    // Incoming has higher version - update local record
                    equipmentItemDao.update(syncItem.toEntity())
                    equipmentItemsProcessed++
                    Log.d(TAG, "Updated equipment item ${syncItem.id}: version=${syncItem.syncVersion}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing equipment item ${syncItem.id}", e)
            }
        }
        
        // Process equipment checkouts
        // Checkouts can come from any device - use version-based updates
        var equipmentCheckoutsProcessed = 0
        payload.entities.equipmentCheckouts.forEach { syncCheckout ->
            try {
                val existing = equipmentCheckoutDao.get(syncCheckout.id)
                if (existing == null) {
                    // New checkout - insert it
                    equipmentCheckoutDao.insert(syncCheckout.toEntity())
                    equipmentCheckoutsProcessed++
                } else if (syncCheckout.syncVersion > existing.syncVersion) {
                    // Incoming has higher version - update (handles check-in from other device)
                    equipmentCheckoutDao.update(syncCheckout.toEntity())
                    equipmentCheckoutsProcessed++
                    Log.d(TAG, "Updated checkout ${syncCheckout.id}: checkedIn=${syncCheckout.checkedInAtUtc != null}, version=${syncCheckout.syncVersion}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing checkout ${syncCheckout.id}", e)
            }
        }

        // Process member preferences
        // Only Member tablets need these preferences - apply to both Room and SharedPreferences
        var memberPreferencesProcessed = 0
        if (localDeviceType == DeviceType.MEMBER_TABLET && payload.entities.memberPreferences.isNotEmpty()) {
            try {
                val preferences = payload.entities.memberPreferences.map { it.toEntity() }
                lastClassificationStore.applyFromSync(preferences)
                memberPreferencesProcessed = preferences.size
                Log.d(TAG, "Applied ${preferences.size} member preferences from sync")
            } catch (e: Exception) {
                Log.e(TAG, "Error processing member preferences", e)
            }
        }

        // Process trainer infos
        // Laptop is master for trainer data - updates flow from laptop to tablets
        var trainerInfosProcessed = 0
        payload.entities.trainerInfos.forEach { syncTrainerInfo ->
            try {
                val existing = trainerInfoDao.get(syncTrainerInfo.memberId)
                if (existing == null) {
                    // New trainer info - insert it
                    trainerInfoDao.upsert(syncTrainerInfo.toEntity())
                    trainerInfosProcessed++
                } else if (syncTrainerInfo.syncVersion > existing.syncVersion) {
                    // Incoming has higher version - update local record
                    trainerInfoDao.upsert(syncTrainerInfo.toEntity())
                    trainerInfosProcessed++
                    Log.d(TAG, "Updated trainer info ${syncTrainerInfo.memberId}: version=${syncTrainerInfo.syncVersion}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing trainer info ${syncTrainerInfo.memberId}", e)
            }
        }

        // Process trainer disciplines
        var trainerDisciplinesProcessed = 0
        payload.entities.trainerDisciplines.forEach { syncDiscipline ->
            try {
                val existing = trainerDisciplineDao.get(syncDiscipline.id)
                if (existing == null) {
                    // New discipline - insert it
                    trainerDisciplineDao.upsert(syncDiscipline.toEntity())
                    trainerDisciplinesProcessed++
                } else if (syncDiscipline.syncVersion > existing.syncVersion) {
                    // Incoming has higher version - update local record
                    trainerDisciplineDao.upsert(syncDiscipline.toEntity())
                    trainerDisciplinesProcessed++
                    Log.d(TAG, "Updated trainer discipline ${syncDiscipline.id}: version=${syncDiscipline.syncVersion}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing trainer discipline ${syncDiscipline.id}", e)
            }
        }

        Log.i(TAG, "Sync applied: $membersProcessed members, $checkInsProcessed check-ins, " +
            "$sessionsProcessed sessions, $registrationsProcessed registrations, " +
            "$equipmentItemsProcessed equipment items, $equipmentCheckoutsProcessed checkouts, " +
            "$memberPreferencesProcessed member preferences, $trainerInfosProcessed trainer infos, " +
            "$trainerDisciplinesProcessed trainer disciplines, ${conflicts.size} conflicts")

        SyncResult(
            membersProcessed = membersProcessed,
            checkInsProcessed = checkInsProcessed,
            sessionsProcessed = sessionsProcessed,
            registrationsProcessed = registrationsProcessed,
            equipmentItemsProcessed = equipmentItemsProcessed,
            equipmentCheckoutsProcessed = equipmentCheckoutsProcessed,
            trainerInfosProcessed = trainerInfosProcessed,
            trainerDisciplinesProcessed = trainerDisciplinesProcessed,
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
     * Filtering rules for tablet-to-tablet sync:
     * - Members: Only push if destination is LAPTOP (laptops are master for member data)
     * - Check-ins/Sessions: Push to ANY peer (append-only, all devices share)
     * - Registrations: Push to ANY peer (will be approved by laptop)
     * 
     * @param deviceId This device's ID
     * @param destinationDeviceType The type of device we're pushing to (for filtering)
     * @return SyncEntities containing records appropriate for the destination
     */
    suspend fun collectUnsyncedEntities(
        deviceId: String,
        destinationDeviceType: DeviceType = DeviceType.LAPTOP
    ): SyncEntities = withContext(Dispatchers.IO) {
        // Only include members when pushing to laptop (laptop is master for member data)
        // Tablets don't need to share member data with each other
        val members = if (destinationDeviceType == DeviceType.LAPTOP) {
            memberDao.getUnsynced().map { it.toSyncable(deviceId) }
        } else {
            emptyList()
        }

        // Include member preferences when pushing to laptop (for backup/transfer to new tablets)
        val memberPreferences = if (destinationDeviceType == DeviceType.LAPTOP) {
            memberPreferenceDao.getAll().map { it.toSyncable() }
        } else {
            emptyList()
        }

        // Include trainer data when pushing to laptop (laptop is master for trainer data)
        val trainerInfos = if (destinationDeviceType == DeviceType.LAPTOP) {
            trainerInfoDao.getUnsynced().map { it.toSyncable(deviceId) }
        } else {
            emptyList()
        }
        val trainerDisciplines = if (destinationDeviceType == DeviceType.LAPTOP) {
            trainerDisciplineDao.getUnsynced().map { it.toSyncable(deviceId) }
        } else {
            emptyList()
        }

        SyncEntities(
            members = members,
            checkIns = checkInDao.getUnsynced().map { it.toSyncable(deviceId) },
            practiceSessions = practiceSessionDao.getUnsynced().map { it.toSyncable(deviceId) },
            newMemberRegistrations = newMemberRegistrationDao.getUnsynced().map { it.toSyncable(deviceId) },
            equipmentItems = equipmentItemDao.getUnsynced().map { it.toSyncable(deviceId) },
            equipmentCheckouts = equipmentCheckoutDao.getUnsynced().map { it.toSyncable(deviceId) },
            memberPreferences = memberPreferences,
            trainerInfos = trainerInfos,
            trainerDisciplines = trainerDisciplines
        )
    }
    
    /**
     * Marks all entities in a SyncEntities payload as synced.
     * 
     * @param entities The entities to mark as synced
     * @param syncedAt The timestamp to use
     */
    suspend fun markEntitiesSynced(entities: SyncEntities, syncedAt: Instant) = withContext(Dispatchers.IO) {
        entities.members.forEach { memberDao.markSynced(it.internalId, syncedAt) }
        entities.checkIns.forEach { checkInDao.markSynced(it.id, syncedAt) }
        entities.practiceSessions.forEach { practiceSessionDao.markSynced(it.id, syncedAt) }
        entities.newMemberRegistrations.forEach { newMemberRegistrationDao.markSynced(it.id, syncedAt) }
        entities.equipmentItems.forEach { equipmentItemDao.markSynced(it.id, syncedAt) }
        entities.equipmentCheckouts.forEach { equipmentCheckoutDao.markSynced(it.id, syncedAt) }
        entities.trainerInfos.forEach { trainerInfoDao.markSynced(it.memberId, syncedAt) }
        entities.trainerDisciplines.forEach { trainerDisciplineDao.markSynced(it.id, syncedAt) }
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
    
    private fun Member.toSyncable(deviceId: String): SyncableMember {
        // Encode photo to base64 for trial members (they may have registration photos)
        val photoBase64 = if (memberType == MemberType.TRIAL && !registrationPhotoPath.isNullOrEmpty()) {
            try {
                val photoFile = java.io.File(registrationPhotoPath)
                if (photoFile.exists()) {
                    android.util.Base64.encodeToString(photoFile.readBytes(), android.util.Base64.NO_WRAP)
                } else null
            } catch (e: Exception) {
                Log.w(TAG, "Failed to encode member photo for sync: ${e.message}")
                null
            }
        } else null
        
        return SyncableMember(
            internalId = internalId,
            membershipId = membershipId,
            memberType = memberType,
            status = status,
            firstName = firstName,
            lastName = lastName,
            birthDate = birthDate,
            gender = gender,
            email = email,
            phone = phone,
            address = address,
            zipCode = zipCode,
            city = city,
            guardianName = guardianName,
            guardianPhone = guardianPhone,
            guardianEmail = guardianEmail,
            expiresOn = expiresOn,
            registrationPhotoPath = registrationPhotoPath,
            photoBase64 = photoBase64,
            mergedIntoId = mergedIntoId,
            deviceId = deviceId,
            syncVersion = syncVersion,
            createdAtUtc = createdAtUtc,
            modifiedAtUtc = updatedAtUtc,
            syncedAtUtc = syncedAtUtc
        )
    }
    
    private fun SyncableMember.toEntity() = Member(
        internalId = internalId,
        membershipId = membershipId,
        memberType = memberType,
        status = status,
        firstName = firstName,
        lastName = lastName,
        birthDate = birthDate,
        gender = gender,
        email = email,
        phone = phone,
        address = address,
        zipCode = zipCode,
        city = city,
        guardianName = guardianName,
        guardianPhone = guardianPhone,
        guardianEmail = guardianEmail,
        expiresOn = expiresOn,
        registrationPhotoPath = registrationPhotoPath,
        mergedIntoId = mergedIntoId,
        createdAtUtc = createdAtUtc,
        updatedAtUtc = modifiedAtUtc,
        deviceId = deviceId,
        syncVersion = syncVersion,
        syncedAtUtc = syncedAtUtc
    )
    
    private fun CheckIn.toSyncable(deviceId: String) = SyncableCheckIn(
        id = id,
        internalMemberId = internalMemberId,
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
        internalMemberId = internalMemberId,
        membershipId = membershipId,
        localDate = localDate,
        firstOfDayFlag = firstOfDayFlag,
        createdAtUtc = createdAtUtc
    )
    
    private fun PracticeSession.toSyncable(deviceId: String) = SyncablePracticeSession(
        id = id,
        internalMemberId = internalMemberId,
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
        internalMemberId = internalMemberId,
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
        createdAtUtc = createdAtUtc,
        approvalStatus = when (approvalStatus) {
            ApprovalStatus.PENDING -> com.club.medlems.data.entity.ApprovalStatus.PENDING
            ApprovalStatus.APPROVED -> com.club.medlems.data.entity.ApprovalStatus.APPROVED
            ApprovalStatus.REJECTED -> com.club.medlems.data.entity.ApprovalStatus.REJECTED
        },
        syncVersion = syncVersion,
        syncedAtUtc = syncedAtUtc
    )
    
    // Equipment converters
    private fun EntityEquipmentItem.toSyncable(deviceId: String) = SyncableEquipmentItem(
        id = id,
        serialNumber = serialNumber,
        type = when (type) {
            com.club.medlems.data.entity.EquipmentType.TrainingMaterial -> EquipmentType.TRAINING_MATERIAL
        },
        description = description,
        status = when (status) {
            com.club.medlems.data.entity.EquipmentStatus.Available -> EquipmentStatus.AVAILABLE
            com.club.medlems.data.entity.EquipmentStatus.CheckedOut -> EquipmentStatus.CHECKED_OUT
            com.club.medlems.data.entity.EquipmentStatus.Maintenance -> EquipmentStatus.MAINTENANCE
            com.club.medlems.data.entity.EquipmentStatus.Retired -> EquipmentStatus.RETIRED
        },
        deviceId = deviceId,
        syncVersion = syncVersion,
        createdAtUtc = createdAtUtc,
        modifiedAtUtc = modifiedAtUtc,
        syncedAtUtc = syncedAtUtc
    )
    
    private fun SyncableEquipmentItem.toEntity() = EntityEquipmentItem(
        id = id,
        serialNumber = serialNumber,
        type = when (type) {
            EquipmentType.TRAINING_MATERIAL -> com.club.medlems.data.entity.EquipmentType.TrainingMaterial
        },
        description = description,
        status = when (status) {
            EquipmentStatus.AVAILABLE -> com.club.medlems.data.entity.EquipmentStatus.Available
            EquipmentStatus.CHECKED_OUT -> com.club.medlems.data.entity.EquipmentStatus.CheckedOut
            EquipmentStatus.MAINTENANCE -> com.club.medlems.data.entity.EquipmentStatus.Maintenance
            EquipmentStatus.RETIRED -> com.club.medlems.data.entity.EquipmentStatus.Retired
        },
        createdByDeviceId = deviceId,
        createdAtUtc = createdAtUtc,
        modifiedAtUtc = modifiedAtUtc,
        deviceId = deviceId,
        syncVersion = syncVersion,
        syncedAtUtc = syncedAtUtc
    )
    
    private fun EntityEquipmentCheckout.toSyncable(deviceId: String) = SyncableEquipmentCheckout(
        id = id,
        equipmentId = equipmentId,
        internalMemberId = internalMemberId,
        membershipId = membershipId,
        checkedOutAtUtc = checkedOutAtUtc,
        checkedInAtUtc = checkedInAtUtc,
        checkedOutByDeviceId = checkedOutByDeviceId,
        checkedInByDeviceId = checkedInByDeviceId,
        checkoutNotes = checkoutNotes,
        checkinNotes = checkinNotes,
        conflictStatus = conflictStatus?.let {
            when (it) {
                com.club.medlems.data.entity.ConflictStatus.Pending -> ConflictStatus.PENDING
                com.club.medlems.data.entity.ConflictStatus.Resolved -> ConflictStatus.RESOLVED
                com.club.medlems.data.entity.ConflictStatus.Cancelled -> ConflictStatus.CANCELLED
            }
        },
        deviceId = deviceId,
        syncVersion = syncVersion,
        createdAtUtc = createdAtUtc,
        modifiedAtUtc = modifiedAtUtc,
        syncedAtUtc = syncedAtUtc
    )
    
    private fun SyncableEquipmentCheckout.toEntity() = EntityEquipmentCheckout(
        id = id,
        equipmentId = equipmentId,
        internalMemberId = internalMemberId,
        membershipId = membershipId,
        checkedOutAtUtc = checkedOutAtUtc,
        checkedInAtUtc = checkedInAtUtc,
        checkedOutByDeviceId = checkedOutByDeviceId,
        checkedInByDeviceId = checkedInByDeviceId,
        checkoutNotes = checkoutNotes,
        checkinNotes = checkinNotes,
        conflictStatus = conflictStatus?.let {
            when (it) {
                ConflictStatus.PENDING -> com.club.medlems.data.entity.ConflictStatus.Pending
                ConflictStatus.RESOLVED -> com.club.medlems.data.entity.ConflictStatus.Resolved
                ConflictStatus.CANCELLED -> com.club.medlems.data.entity.ConflictStatus.Cancelled
            }
        },
        conflictResolutionNotes = null,
        createdAtUtc = createdAtUtc,
        modifiedAtUtc = modifiedAtUtc,
        deviceId = deviceId,
        syncVersion = syncVersion,
        syncedAtUtc = syncedAtUtc
    )

    // Member preference converters
    private fun MemberPreference.toSyncable() = SyncableMemberPreference(
        memberId = memberId,
        lastPracticeType = lastPracticeType,
        lastClassification = lastClassification,
        updatedAtUtc = updatedAtUtc
    )

    private fun SyncableMemberPreference.toEntity() = MemberPreference(
        memberId = memberId,
        lastPracticeType = lastPracticeType,
        lastClassification = lastClassification,
        updatedAtUtc = updatedAtUtc
    )

    // Trainer info converters
    private fun TrainerInfo.toSyncable(deviceId: String) = SyncableTrainerInfo(
        memberId = memberId,
        isTrainer = isTrainer,
        hasSkydelederCertificate = hasSkydelederCertificate,
        certifiedDate = certifiedDate,
        deviceId = deviceId,
        syncVersion = syncVersion,
        createdAtUtc = createdAtUtc,
        modifiedAtUtc = modifiedAtUtc,
        syncedAtUtc = syncedAtUtc
    )

    private fun SyncableTrainerInfo.toEntity() = TrainerInfo(
        memberId = memberId,
        isTrainer = isTrainer,
        hasSkydelederCertificate = hasSkydelederCertificate,
        certifiedDate = certifiedDate,
        createdAtUtc = createdAtUtc,
        modifiedAtUtc = modifiedAtUtc,
        deviceId = deviceId,
        syncVersion = syncVersion,
        syncedAtUtc = syncedAtUtc
    )

    // Trainer discipline converters
    private fun TrainerDiscipline.toSyncable(deviceId: String) = SyncableTrainerDiscipline(
        id = id,
        memberId = memberId,
        discipline = discipline,
        level = level,
        certifiedDate = certifiedDate,
        deviceId = deviceId,
        syncVersion = syncVersion,
        createdAtUtc = createdAtUtc,
        modifiedAtUtc = modifiedAtUtc,
        syncedAtUtc = syncedAtUtc
    )

    private fun SyncableTrainerDiscipline.toEntity() = TrainerDiscipline(
        id = id,
        memberId = memberId,
        discipline = discipline,
        level = level,
        certifiedDate = certifiedDate,
        createdAtUtc = createdAtUtc,
        modifiedAtUtc = modifiedAtUtc,
        deviceId = deviceId,
        syncVersion = syncVersion,
        syncedAtUtc = syncedAtUtc
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
    val equipmentItemsProcessed: Int = 0,
    val equipmentCheckoutsProcessed: Int = 0,
    val trainerInfosProcessed: Int = 0,
    val trainerDisciplinesProcessed: Int = 0,
    val conflicts: List<SyncConflict> = emptyList(),
    val errorMessage: String? = null
) {
    val totalProcessed: Int get() = membersProcessed + checkInsProcessed +
        sessionsProcessed + registrationsProcessed +
        equipmentItemsProcessed + equipmentCheckoutsProcessed +
        trainerInfosProcessed + trainerDisciplinesProcessed
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
        equipmentItemsProcessed = this.equipmentItemsProcessed + other.equipmentItemsProcessed,
        equipmentCheckoutsProcessed = this.equipmentCheckoutsProcessed + other.equipmentCheckoutsProcessed,
        trainerInfosProcessed = this.trainerInfosProcessed + other.trainerInfosProcessed,
        trainerDisciplinesProcessed = this.trainerDisciplinesProcessed + other.trainerDisciplinesProcessed,
        conflicts = this.conflicts + other.conflicts,
        errorMessage = this.errorMessage ?: other.errorMessage
    )
}
