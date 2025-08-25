package com.club.medlems.ui.attendant

import androidx.lifecycle.ViewModel
import com.club.medlems.data.dao.CheckInDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.dao.ScanEventDao
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberStatus
import com.club.medlems.data.entity.ScanEvent
import com.club.medlems.data.entity.ScanEventType
import com.club.medlems.ui.ready.ScanOutcome
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.Instant
import kotlinx.datetime.toInstant
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.minus
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import java.util.UUID
import javax.inject.Inject
import kotlin.random.Random
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.data.entity.SessionSource

@HiltViewModel
class AdminActionsViewModel @Inject constructor(
    private val memberDao: MemberDao,
    private val checkInDao: CheckInDao,
    private val practiceSessionDao: PracticeSessionDao,
    private val scanEventDao: ScanEventDao
) : ViewModel() {

    // Expose active members to support search/select UI
    val activeMembers: Flow<List<Member>> = memberDao.membersByStatus(MemberStatus.ACTIVE)

    /**
     * Perform the same logic as a QR scan but from a manually entered membershipId.
     * Returns ScanOutcome.First or ScanOutcome.Repeat, or ScanOutcome.Error if not found.
     */
    suspend fun manualScan(membershipId: String): ScanOutcome = withContext(Dispatchers.IO) {
        val id = membershipId.trim()
        if (id.isEmpty()) return@withContext ScanOutcome.Error("Tomt medlems-ID")
        val member = memberDao.get(id) ?: return@withContext ScanOutcome.Error("Medlem ikke fundet")

        val now = Clock.System.now()
        val tz = TimeZone.currentSystemDefault()
        val localDate = now.toLocalDateTime(tz).date
        val birth = member.birthDate
        val lastCheck = checkInDao.lastCheckDate(id)
        val birthdayTodayOrSince = if (birth != null) {
            val thisYear = localDate.year
            val thisBirthday = runCatching { kotlinx.datetime.LocalDate(thisYear, birth.monthNumber, birth.dayOfMonth) }.getOrElse {
                if (birth.monthNumber == 2 && birth.dayOfMonth == 29) kotlinx.datetime.LocalDate(thisYear, 2, 28)
                else kotlinx.datetime.LocalDate(thisYear, birth.monthNumber, birth.dayOfMonth.coerceAtLeast(1))
            }
            val lastOccurrence = if (thisBirthday <= localDate) thisBirthday else kotlinx.datetime.LocalDate(thisYear - 1, birth.monthNumber, birth.dayOfMonth)
            if (lastCheck == null) {
                lastOccurrence == localDate
            } else {
                (lastOccurrence > lastCheck) && (lastOccurrence <= localDate)
            }
        } else false
        val existingCheckIn = checkInDao.firstForDate(id, localDate)
        return@withContext if (existingCheckIn == null) {
            val checkIn = CheckIn(
                id = UUID.randomUUID().toString(),
                membershipId = id,
                createdAtUtc = now,
                localDate = localDate,
                firstOfDayFlag = true
            )
            checkInDao.insert(checkIn)
            val scanEventId = UUID.randomUUID().toString()
            scanEventDao.insert(
                ScanEvent(
                    id = scanEventId,
                    membershipId = id,
                    createdAtUtc = now,
                    type = ScanEventType.FIRST_SCAN,
                    linkedCheckInId = checkIn.id
                )
            )
            ScanOutcome.First(id, scanEventId, birthday = birthdayTodayOrSince)
        } else {
            val scanEventId = UUID.randomUUID().toString()
            scanEventDao.insert(
                ScanEvent(
                    id = scanEventId,
                    membershipId = id,
                    createdAtUtc = now,
                    type = ScanEventType.REPEAT_SCAN
                )
            )
            ScanOutcome.Repeat(id, scanEventId, birthday = birthdayTodayOrSince)
        }
    }

    /**
     * Generate demo data: check-ins for today (if missing) and random practice sessions
     * across the last 30 days for a subset of active members.
     */
    suspend fun generateDemoData(maxMembers: Int = 50, daysBack: Int = 60) = withContext(Dispatchers.IO) {
        val all = memberDao.allMembers().filter { it.status == MemberStatus.ACTIVE }
        if (all.isEmpty()) return@withContext
        // Ensure at least 10 members from the current import list get data if available.
        // Prefer stable selection: take first 10 by membershipId ordering, then fill randomly up to maxMembers.
        val preferred = all.sortedBy { it.membershipId }.take(10)
        val remaining = (all - preferred.toSet()).shuffled().take((maxMembers - preferred.size).coerceAtLeast(0))
        val selected = (preferred + remaining).distinct()
        val now = Clock.System.now()
        val tz = TimeZone.currentSystemDefault()
        val today = now.toLocalDateTime(tz).date
        fun randomInstantForDate(d: kotlinx.datetime.LocalDate): Instant {
            val h = Random.nextInt(9, 21) // 09:00..20:59
            val min = Random.nextInt(0, 60)
            val ldt = LocalDateTime(d, LocalTime(h, min))
            return ldt.toInstant(tz)
        }

        selected.forEach { m ->
            // Pick random unique dates in last [daysBack] days, include today
            val daysCount = Random.nextInt(24, 41) // 24..40 days with activity
            val dateSet = mutableSetOf(today)
            while (dateSet.size < daysCount) {
                val d = today.minus(DatePeriod(days = Random.nextInt(0, daysBack)))
                dateSet += d
            }
            val dates = dateSet.sorted()

            // Ensure check-in exists for each chosen date
            dates.forEach { d ->
                val existing = checkInDao.firstForDate(m.membershipId, d)
                if (existing == null) {
                    val createdTs = randomInstantForDate(d)
                    val ci = CheckIn(
                        id = UUID.randomUUID().toString(),
                        membershipId = m.membershipId,
                        createdAtUtc = createdTs,
                        localDate = d,
                        firstOfDayFlag = true
                    )
                    checkInDao.insert(ci)
                    val scanEventId = UUID.randomUUID().toString()
                    scanEventDao.insert(
                        ScanEvent(
                            id = scanEventId,
                            membershipId = m.membershipId,
                            createdAtUtc = createdTs,
                            type = ScanEventType.FIRST_SCAN,
                            linkedCheckInId = ci.id
                        )
                    )
                } else {
                    // Occasionally log a repeat scan
                    if (Random.nextFloat() < 0.2f) {
                        val repeatTs = randomInstantForDate(d)
                        scanEventDao.insert(
                            ScanEvent(
                                id = UUID.randomUUID().toString(),
                                membershipId = m.membershipId,
                                createdAtUtc = repeatTs,
                                type = ScanEventType.REPEAT_SCAN
                            )
                        )
                    }
                }
            }

            // Create practice sessions tied to some of those check-in dates
            val types = listOf(PracticeType.Riffel, PracticeType.Pistol, PracticeType.LuftRiffel, PracticeType.LuftPistol)
            dates.forEach { d ->
                types.forEach { t ->
                    // 45% chance per type per active day; sometimes add a second set
                    val chance = Random.nextFloat()
                    if (chance < 0.45f) {
                        val createdTs = randomInstantForDate(d)
                        val points = when (t) {
                            PracticeType.Riffel -> Random.nextInt(150, 301)
                            PracticeType.Pistol -> Random.nextInt(80, 201)
                            PracticeType.LuftRiffel -> Random.nextInt(120, 301)
                            PracticeType.LuftPistol -> Random.nextInt(120, 301)
                            PracticeType.Andet -> Random.nextInt(50, 151)
                        }
                        val krydser = if (Random.nextFloat() < 0.6f) Random.nextInt(0, 11) else null
                        val cls = when (t) {
                            PracticeType.Riffel -> listOf("BK 1","BK 2","BK 3","BK 4","J 1","J 2","ST 1","ST 2","ST 3","Å 1","Å 2","Å 3","SE 1","SE 2","SE 3","FRI 1","FRI 2").random()
                            PracticeType.LuftRiffel -> listOf("BK 1","BK 2","BK 3","J 1","J 2","ST 1","ST 2","ST 3","Å 1","Å 2","SE 1","SE 2","FRI 1","FRI 2").random()
                            PracticeType.Pistol -> listOf("BK","JUN","1H 1","1H 2","1H 3","2H 1","2H 2","SE1","SE2","FRI").random()
                            PracticeType.LuftPistol -> listOf("BK","JUN","1H 1","1H 2","2H 1","2H 2","SE","FRI").random()
                            PracticeType.Andet -> listOf("22 Mod","GP 32","GPA","GR","GM","22M").random()
                        }
                        val session = PracticeSession(
                            id = UUID.randomUUID().toString(),
                            membershipId = m.membershipId,
                            createdAtUtc = createdTs,
                            localDate = d,
                            practiceType = t,
                            points = points,
                            krydser = krydser,
                            classification = cls,
                            source = SessionSource.kiosk
                        )
                        practiceSessionDao.insert(session)
                        // 15% chance to add a second attempt for this type/day
                        if (Random.nextFloat() < 0.15f) {
                            val createdTs2 = randomInstantForDate(d)
                            val points2 = points + Random.nextInt(-10, 11)
                            val krydser2 = krydser?.let { (it + Random.nextInt(-1, 2)).coerceIn(0, 10) }
                            val session2 = PracticeSession(
                                id = UUID.randomUUID().toString(),
                                membershipId = m.membershipId,
                                createdAtUtc = createdTs2,
                                localDate = d,
                                practiceType = t,
                                points = points2.coerceAtLeast(0),
                                krydser = krydser2,
                                classification = cls,
                                source = SessionSource.kiosk
                            )
                            practiceSessionDao.insert(session2)
                        }
                    }
                }
            }
        }
    }

    suspend fun clearAllData() = withContext(Dispatchers.IO) {
        // Order matters to avoid FK-like constraints (even if not declared): delete children first
    practiceSessionDao.deleteAllSessions()
    scanEventDao.deleteAllEvents()
        checkInDao.deleteAll()
    memberDao.deleteAll()
    }
}
