package com.club.medlems.domain.csv

import com.club.medlems.data.dao.*
import com.club.medlems.data.entity.*
import com.github.doyaaaaaken.kotlincsv.client.CsvReader
import com.github.doyaaaaaken.kotlincsv.client.CsvWriter
import com.github.doyaaaaaken.kotlincsv.dsl.csvReader
import com.github.doyaaaaaken.kotlincsv.dsl.csvWriter
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

data class ImportResult(
    val imported: Int,
    val skippedDuplicates: Int,
    val newlyInactive: Int,
    val errors: List<String>
)

@Singleton
class CsvService @Inject constructor(
    private val memberDao: MemberDao,
    private val checkInDao: CheckInDao,
    private val sessionDao: PracticeSessionDao,
    private val scanEventDao: ScanEventDao
) {
    private val version = "2"

    suspend fun exportMembers(): String = withContext(Dispatchers.IO) {
        val members = memberDao.allMembers()
    val header = listOf("FORMAT_VERSION","membership_id","first_name","last_name","email","phone","status","expires_on","birth_date","updated_at_utc")
        buildString {
            appendLine(header.joinToString(","))
            members.forEach { m ->
                appendLine(listOf(
                    version,
                    m.membershipId.orEmpty(),
                    m.firstName,
                    m.lastName,
                    m.email.orEmpty(),
                    m.phone.orEmpty(),
                    m.status.name,
                    m.expiresOn.orEmpty(),
                    m.birthDate?.toString().orEmpty(),
                    m.updatedAtUtc.toString()
                ).joinToString(","))
            }
        }
    }

    suspend fun exportSessions(): String = withContext(Dispatchers.IO) {
        val sessions = sessionDao.allSessions()
        val header = listOf("FORMAT_VERSION","session_id","membership_id","created_at_utc","local_date","practice_type","points","krydser","classification","source")
        buildString {
            appendLine(header.joinToString(","))
            sessions.forEach { s ->
                appendLine(listOf(
                    version,
                    s.id,
                    s.membershipId,
                    s.createdAtUtc.toString(),
                    s.localDate.toString(),
                    s.practiceType.name,
                    s.points.toString(),
                    s.krydser?.toString() ?: "",
                    s.classification.orEmpty(),
                    s.source.name
                ).joinToString(","))
            }
        }
    }

    suspend fun exportSessionsSince(sinceTimestamp: Instant): String = withContext(Dispatchers.IO) {
        val sessions = sessionDao.sessionsCreatedAfter(sinceTimestamp)
        val header = listOf("FORMAT_VERSION","session_id","membership_id","created_at_utc","local_date","practice_type","points","krydser","classification","source")
        buildString {
            appendLine(header.joinToString(","))
            sessions.forEach { s ->
                appendLine(listOf(
                    version,
                    s.id,
                    s.membershipId,
                    s.createdAtUtc.toString(),
                    s.localDate.toString(),
                    s.practiceType.name,
                    s.points.toString(),
                    s.krydser?.toString() ?: "",
                    s.classification.orEmpty(),
                    s.source.name
                ).joinToString(","))
            }
        }
    }

    suspend fun exportTodaySessions(): String = withContext(Dispatchers.IO) {
        val today = kotlinx.datetime.Clock.System.now().toLocalDateTime(kotlinx.datetime.TimeZone.currentSystemDefault()).date
        val sessions = sessionDao.allSessionsForDate(today)
        val header = listOf("FORMAT_VERSION","session_id","membership_id","created_at_utc","local_date","practice_type","points","krydser","classification","source")
        buildString {
            appendLine(header.joinToString(","))
            sessions.forEach { s ->
                appendLine(listOf(
                    version,
                    s.id,
                    s.membershipId,
                    s.createdAtUtc.toString(),
                    s.localDate.toString(),
                    s.practiceType.name,
                    s.points.toString(),
                    s.krydser?.toString() ?: "",
                    s.classification.orEmpty(),
                    s.source.name
                ).joinToString(","))
            }
        }
    }

    suspend fun exportCheckIns(): String = withContext(Dispatchers.IO) {
        val list = checkInDao.allCheckIns()
        val header = listOf("FORMAT_VERSION","checkin_id","membership_id","created_at_utc","local_date")
        buildString {
            appendLine(header.joinToString(","))
            list.forEach { c ->
                appendLine(listOf(version,c.id,c.membershipId,c.createdAtUtc.toString(),c.localDate.toString()).joinToString(","))
            }
        }
    }

    suspend fun exportCheckInsSince(sinceTimestamp: Instant): String = withContext(Dispatchers.IO) {
        val list = checkInDao.checkInsCreatedAfter(sinceTimestamp)
        val header = listOf("FORMAT_VERSION","checkin_id","membership_id","created_at_utc","local_date")
        buildString {
            appendLine(header.joinToString(","))
            list.forEach { c ->
                appendLine(listOf(version,c.id,c.membershipId,c.createdAtUtc.toString(),c.localDate.toString()).joinToString(","))
            }
        }
    }

    suspend fun exportTodayCheckIns(): String = withContext(Dispatchers.IO) {
        val today = kotlinx.datetime.Clock.System.now().toLocalDateTime(kotlinx.datetime.TimeZone.currentSystemDefault()).date
        val list = checkInDao.allCheckInsForDate(today)
        val header = listOf("FORMAT_VERSION","checkin_id","membership_id","created_at_utc","local_date")
        buildString {
            appendLine(header.joinToString(","))
            list.forEach { c ->
                appendLine(listOf(version,c.id,c.membershipId,c.createdAtUtc.toString(),c.localDate.toString()).joinToString(","))
            }
        }
    }

    suspend fun exportScanEvents(): String = withContext(Dispatchers.IO) {
        val list = scanEventDao.allScanEvents()
        val header = listOf("FORMAT_VERSION","scan_event_id","membership_id","created_at_utc","type","linked_checkin_id","linked_session_id","canceled_flag")
        buildString {
            appendLine(header.joinToString(","))
            list.forEach { e ->
                appendLine(listOf(version,e.id,e.membershipId,e.createdAtUtc.toString(),e.type.name,e.linkedCheckInId.orEmpty(),e.linkedSessionId.orEmpty(),e.canceledFlag.toString()).joinToString(","))
            }
        }
    }

    suspend fun importMembers(csvContent: String): ImportResult = withContext(Dispatchers.IO) {
        // Auto-detect delimiter: check if first line contains semicolons or commas
        val firstLine = csvContent.lines().firstOrNull() ?: ""
        val delimiter = if (';' in firstLine) ';' else ','
        
        val lines = csvReader { this.delimiter = delimiter }.readAll(csvContent)
        if (lines.isEmpty()) return@withContext ImportResult(0,0,0,listOf("Empty file"))
        val header = lines.first()
    val required = setOf("FORMAT_VERSION","membership_id","first_name","last_name","status")
        if (!required.all { it in header }) return@withContext ImportResult(0,0,0,listOf("Missing required headers"))
        val idx = header.withIndex().associate { it.value to it.index }
        val seen = mutableSetOf<String>()
        val errors = mutableListOf<String>()
        var imported = 0
        var skippedDup = 0
        // Map membershipId -> internalId for existing members (for marking inactive)
        val allMembersBefore = memberDao.allMembers()
        val membershipIdToInternalId = allMembersBefore
            .filter { it.membershipId != null }
            .associateBy({ it.membershipId!! }, { it.internalId })
        val allMembershipIdsBefore = membershipIdToInternalId.keys
        val incomingMembershipIds = mutableSetOf<String>()
        val rows = lines.drop(1)
        rows.forEachIndexed { lineIdx, row ->
            val membershipId = row.getOrNull(idx["membership_id"] ?: -1).orEmpty()
            if (membershipId.isBlank()) { errors += "Line ${lineIdx+2}: blank membership_id"; return@forEachIndexed }
            if (!seen.add(membershipId)) { skippedDup++; return@forEachIndexed }
            incomingMembershipIds += membershipId
            try {
                val fn = row.getOrNull(idx["first_name"] ?: -1).orEmpty()
                val ln = row.getOrNull(idx["last_name"] ?: -1).orEmpty()
                val email = row.getOrNull(idx["email"] ?: -1).orEmpty().ifBlank { null }
                val phone = row.getOrNull(idx["phone"] ?: -1).orEmpty().ifBlank { null }
                val statusRaw = row.getOrNull(idx["status"] ?: -1).orEmpty()
                val status = runCatching { MemberStatus.valueOf(statusRaw.ifBlank { "ACTIVE" }) }.getOrElse { MemberStatus.ACTIVE }
                val expiresOn = row.getOrNull(idx["expires_on"] ?: -1).orEmpty().ifBlank { null }
                val birthRaw = row.getOrNull(idx["birth_date"] ?: -1).orEmpty().ifBlank { null }
                val birth = birthRaw?.let { runCatching { kotlinx.datetime.LocalDate.parse(it) }.getOrNull() }
                // existing fetch to preserve fields when blank (rule A)
                val existing = memberDao.getByMembershipId(membershipId)
                val now = Clock.System.now()
                val merged = Member(
                    // Use existing internalId or generate deterministic one from membershipId
                    internalId = existing?.internalId ?: java.util.UUID.nameUUIDFromBytes(membershipId.toByteArray()).toString(),
                    membershipId = membershipId,
                    memberType = existing?.memberType ?: MemberType.FULL, // CSV imports are full members
                    status = status,
                    firstName = if (fn.isNotBlank()) fn else existing?.firstName ?: "",
                    lastName = if (ln.isNotBlank()) ln else existing?.lastName ?: "",
                    email = if (email != null) email else existing?.email,
                    phone = if (phone != null) phone else existing?.phone,
                    expiresOn = if (expiresOn != null) expiresOn else existing?.expiresOn,
                    birthDate = birth ?: existing?.birthDate,
                    // Preserve existing fields
                    gender = existing?.gender,
                    address = existing?.address,
                    zipCode = existing?.zipCode,
                    city = existing?.city,
                    guardianName = existing?.guardianName,
                    guardianPhone = existing?.guardianPhone,
                    guardianEmail = existing?.guardianEmail,
                    registrationPhotoPath = existing?.registrationPhotoPath,
                    mergedIntoId = existing?.mergedIntoId,
                    createdAtUtc = existing?.createdAtUtc ?: now,
                    updatedAtUtc = now
                )
                memberDao.upsert(merged)
                imported++
            } catch (e: Exception) {
                errors += "Line ${lineIdx+2}: ${e.message}"
            }
        }
        // Mark missing as inactive (use internalIds for the update)
        val missingMembershipIds = allMembershipIdsBefore - incomingMembershipIds
        val missingInternalIds = missingMembershipIds.mapNotNull { membershipIdToInternalId[it] }
        if (missingInternalIds.isNotEmpty()) memberDao.updateStatus(missingInternalIds, MemberStatus.INACTIVE)
        ImportResult(imported, skippedDup, missingInternalIds.size, errors)
    }
}
