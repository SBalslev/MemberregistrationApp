package com.club.medlems.ui.ready

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.dao.CheckInDao
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.dao.ScanEventDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.ScanEvent
import com.club.medlems.data.entity.ScanEventType
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.domain.QrParser
import com.club.medlems.domain.security.AttendantModeManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import java.util.UUID
import javax.inject.Inject
import kotlinx.datetime.toLocalDate

sealed class ScanOutcome {
    data class First(val membershipId: String, val scanEventId: String, val birthday: Boolean = false): ScanOutcome()
    data class Repeat(val membershipId: String, val scanEventId: String, val birthday: Boolean = false): ScanOutcome()
    data class Error(val message: String): ScanOutcome()
    data object AttendantUnlocked: ScanOutcome()
}

@HiltViewModel
class ReadyViewModel @Inject constructor(
    private val memberDao: MemberDao,
    private val checkInDao: CheckInDao,
    private val practiceSessionDao: PracticeSessionDao,
    private val scanEventDao: ScanEventDao,
    private val attendant: AttendantModeManager
): ViewModel() {

    private val _events = Channel<ScanOutcome>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    private var lastScanTs: Long = 0
    private var lastId: String? = null

    fun onRawQr(raw: String) {
        val id = QrParser.extractMembershipId(raw)
        if (id == null) {
            val hint = raw.take(80)
            viewModelScope.launch { _events.send(ScanOutcome.Error("Ugyldigt QR – kunne ikke finde 'id='. Læste: $hint")) }
            return
        }
        // Special attendant auto-unlock badge bypasses member lookup
        if (id == "99000009") {
            viewModelScope.launch {
                attendant.autoUnlock()
                _events.send(ScanOutcome.AttendantUnlocked)
            }
            return
        }
        val nowMillis = System.currentTimeMillis()
        if (lastId == id && nowMillis - lastScanTs < 2000) {
            // debounce duplicate scans within 2s
            return
        }
        lastId = id
        lastScanTs = nowMillis
        viewModelScope.launch {
            val member = memberDao.get(id)
            if (member == null) {
                _events.send(ScanOutcome.Error("Medlem ikke fundet: $id"))
                return@launch
            }
            val now = Clock.System.now()
            val tz = TimeZone.currentSystemDefault()
            val localDate = now.toLocalDateTime(tz).date
            // Birthday check: if member has birthDate and last check date < this year's birthday <= today
            val birth = member.birthDate
            val lastCheck = checkInDao.lastCheckDate(id)
            val birthdayTodayOrSince = if (birth != null) {
                // compute the most recent birthday occurrence (this year or previous if not yet this year)
                val thisYear = localDate.year
                val thisBirthday = runCatching { kotlinx.datetime.LocalDate(thisYear, birth.monthNumber, birth.dayOfMonth) }.getOrElse {
                    if (birth.monthNumber == 2 && birth.dayOfMonth == 29) kotlinx.datetime.LocalDate(thisYear, 2, 28)
                    else kotlinx.datetime.LocalDate(thisYear, birth.monthNumber, birth.dayOfMonth.coerceAtLeast(1))
                }
                val lastOccurrence = if (thisBirthday <= localDate) thisBirthday else kotlinx.datetime.LocalDate(thisYear - 1, birth.monthNumber, birth.dayOfMonth)
                if (lastCheck == null) {
                    // If never checked before, celebrate if their lastOccurrence is today
                    lastOccurrence == localDate
                } else {
                    // Celebrate if lastOccurrence is after lastCheck and on/before today
                    (lastOccurrence > lastCheck) && (lastOccurrence <= localDate)
                }
            } else false
            val existingCheckIn = checkInDao.firstForDate(id, localDate)
            if (existingCheckIn == null) {
                // First scan
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
                _events.send(ScanOutcome.First(id, scanEventId, birthday = birthdayTodayOrSince))
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
                _events.send(ScanOutcome.Repeat(id, scanEventId, birthday = birthdayTodayOrSince))
            }
        }
    }
}
