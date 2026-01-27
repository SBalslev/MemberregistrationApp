/**
 * Member activity repository - data access for attendance and practice insights.
 */

import { query } from './db';

export type TrialFilter = 'all' | 'without-trial' | 'only-trial';

export type ActivityType =
  | 'CHECK_IN'
  | 'PRACTICE_SESSION'
  | 'EQUIPMENT_CHECKOUT'
  | 'EQUIPMENT_RETURN';

export interface MemberActivityEntry {
  id: string;
  localDate: string;
  occurredAtUtc: string;
  activityType: ActivityType;
  practiceType?: string | null;
  classification?: string | null;
  points?: number | null;
  equipmentId?: string | null;
  equipmentName?: string | null;
}

export interface AttendanceMemberRow {
  internalId: string;
  membershipId: string | null;
  firstName: string;
  lastName: string;
  memberLifecycleStage: string;
  firstCheckInAtUtc: string;
}

export interface AttendanceCountRow {
  localDate: string;
  memberCount: number;
}

export interface AttendanceBreakdownRow {
  memberLifecycleStage: string;
  memberCount: number;
}

export interface PracticeSummaryRow {
  practiceType: string;
  classification: string;
  sessionCount: number;
  memberCount: number;
}

export interface PracticeMemberRow {
  internalId: string;
  membershipId: string | null;
  firstName: string;
  lastName: string;
  memberLifecycleStage: string;
  sessionCount: number;
}

function buildTrialFilterClause(filter: TrialFilter, memberAlias = 'm'): string {
  if (filter === 'only-trial') return `AND ${memberAlias}.memberLifecycleStage = 'TRIAL'`;
  if (filter === 'without-trial') return `AND ${memberAlias}.memberLifecycleStage = 'FULL'`;
  return '';
}

function buildInClause(values: string[], column: string): { clause: string; params: string[] } {
  if (values.length === 0) return { clause: '', params: [] };
  const placeholders = values.map(() => '?').join(', ');
  return { clause: `AND ${column} IN (${placeholders})`, params: values };
}

function toGmtPlusOneDate(utcTimestamp: string): string {
  const base = new Date(utcTimestamp);
  const adjusted = new Date(base.getTime() + 60 * 60 * 1000);
  return adjusted.toISOString().slice(0, 10);
}

export function getSeasonDateRange(seasonYear?: number): { startDate: string; endDate: string } {
  const year = seasonYear ?? Number(toGmtPlusOneDate(new Date().toISOString()).slice(0, 4));
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`
  };
}

function isDateInRange(date: string, startDate?: string, endDate?: string): boolean {
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

export function getMemberActivityTimeline(
  internalMemberId: string,
  options?: {
    startDate?: string;
    endDate?: string;
    activityTypes?: ActivityType[];
  }
): MemberActivityEntry[] {
  const activityTypes = options?.activityTypes ?? [];
  const includeCheckIns = activityTypes.length === 0 || activityTypes.includes('CHECK_IN');
  const includePractice = activityTypes.length === 0 || activityTypes.includes('PRACTICE_SESSION');
  const includeCheckout = activityTypes.length === 0 || activityTypes.includes('EQUIPMENT_CHECKOUT');
  const includeReturn = activityTypes.length === 0 || activityTypes.includes('EQUIPMENT_RETURN');

  const entries: MemberActivityEntry[] = [];

  if (includeCheckIns) {
    const params: string[] = [internalMemberId];
    let dateClause = '';
    if (options?.startDate) {
      dateClause += ' AND localDate >= ?';
      params.push(options.startDate);
    }
    if (options?.endDate) {
      dateClause += ' AND localDate <= ?';
      params.push(options.endDate);
    }

    const checkIns = query<{ id: string; localDate: string; createdAtUtc: string }>(
      `SELECT id, localDate, createdAtUtc
       FROM CheckIn
       WHERE internalMemberId = ?${dateClause}`,
      params
    );

    entries.push(
      ...checkIns.map(row => ({
        id: row.id,
        localDate: row.localDate,
        occurredAtUtc: row.createdAtUtc,
        activityType: 'CHECK_IN' as ActivityType
      }))
    );
  }

  if (includePractice) {
    const params: string[] = [internalMemberId];
    let dateClause = '';
    if (options?.startDate) {
      dateClause += ' AND localDate >= ?';
      params.push(options.startDate);
    }
    if (options?.endDate) {
      dateClause += ' AND localDate <= ?';
      params.push(options.endDate);
    }

    const sessions = query<{
      id: string;
      localDate: string;
      createdAtUtc: string;
      practiceType: string;
      classification: string;
      points: number;
    }>(
      `SELECT id, localDate, createdAtUtc, practiceType, classification, points
       FROM PracticeSession
       WHERE internalMemberId = ?${dateClause}`,
      params
    );

    entries.push(
      ...sessions.map(row => ({
        id: row.id,
        localDate: row.localDate,
        occurredAtUtc: row.createdAtUtc,
        activityType: 'PRACTICE_SESSION' as ActivityType,
        practiceType: row.practiceType,
        classification: row.classification,
        points: row.points
      }))
    );
  }

  if (includeCheckout || includeReturn) {
    const checkouts = query<{
      id: string;
      checkedOutAtUtc: string;
      checkedInAtUtc: string | null;
      equipmentId: string;
      equipmentName: string;
    }>(
      `SELECT ec.id, ec.checkedOutAtUtc, ec.checkedInAtUtc, ec.equipmentId, ei.name as equipmentName
       FROM EquipmentCheckout ec
       JOIN EquipmentItem ei ON ei.id = ec.equipmentId
       WHERE ec.internalMemberId = ?`,
      [internalMemberId]
    );

    for (const checkout of checkouts) {
      if (includeCheckout) {
        const checkoutDate = toGmtPlusOneDate(checkout.checkedOutAtUtc);
        if (isDateInRange(checkoutDate, options?.startDate, options?.endDate)) {
          entries.push({
            id: checkout.id,
            localDate: checkoutDate,
            occurredAtUtc: checkout.checkedOutAtUtc,
            activityType: 'EQUIPMENT_CHECKOUT' as ActivityType,
            equipmentId: checkout.equipmentId,
            equipmentName: checkout.equipmentName
          });
        }
      }

      if (includeReturn && checkout.checkedInAtUtc) {
        const returnDate = toGmtPlusOneDate(checkout.checkedInAtUtc);
        if (isDateInRange(returnDate, options?.startDate, options?.endDate)) {
          entries.push({
            id: `${checkout.id}-return`,
            localDate: returnDate,
            occurredAtUtc: checkout.checkedInAtUtc,
            activityType: 'EQUIPMENT_RETURN' as ActivityType,
            equipmentId: checkout.equipmentId,
            equipmentName: checkout.equipmentName
          });
        }
      }
    }
  }

  return entries.sort((a, b) => (a.occurredAtUtc < b.occurredAtUtc ? 1 : -1));
}

export function getDailyAttendanceMembers(
  localDate: string,
  trialFilter: TrialFilter
): AttendanceMemberRow[] {
  const trialClause = buildTrialFilterClause(trialFilter, 'm');
  return query<AttendanceMemberRow>(
    `SELECT
      m.internalId,
      m.membershipId,
      m.firstName,
      m.lastName,
      m.memberLifecycleStage,
      MIN(c.createdAtUtc) as firstCheckInAtUtc
     FROM CheckIn c
     JOIN Member m ON m.internalId = c.internalMemberId
     WHERE c.localDate = ?
       AND m.mergedIntoId IS NULL
       ${trialClause}
     GROUP BY m.internalId
     ORDER BY m.lastName, m.firstName`,
    [localDate]
  );
}

export function getAttendanceCountsByDay(
  startDate: string,
  endDate: string,
  trialFilter: TrialFilter
): AttendanceCountRow[] {
  const trialClause = buildTrialFilterClause(trialFilter, 'm');
  return query<AttendanceCountRow>(
    `SELECT c.localDate, COUNT(DISTINCT c.internalMemberId) as memberCount
     FROM CheckIn c
     JOIN Member m ON m.internalId = c.internalMemberId
     WHERE c.localDate >= ?
       AND c.localDate <= ?
       AND m.mergedIntoId IS NULL
       ${trialClause}
     GROUP BY c.localDate
     ORDER BY c.localDate`,
    [startDate, endDate]
  );
}

export function getAttendanceBreakdown(
  startDate: string,
  endDate: string
): AttendanceBreakdownRow[] {
  return query<AttendanceBreakdownRow>(
    `SELECT m.memberLifecycleStage, COUNT(DISTINCT c.internalMemberId) as memberCount
     FROM CheckIn c
     JOIN Member m ON m.internalId = c.internalMemberId
     WHERE c.localDate >= ?
       AND c.localDate <= ?
       AND m.mergedIntoId IS NULL
     GROUP BY m.memberLifecycleStage`,
    [startDate, endDate]
  );
}

export function getPracticeSummaryByDisciplineAndClassification(
  startDate: string,
  endDate: string,
  options?: {
    trialFilter?: TrialFilter;
    practiceTypes?: string[];
    classifications?: string[];
  }
): PracticeSummaryRow[] {
  const trialClause = buildTrialFilterClause(options?.trialFilter ?? 'all', 'm');
  const typeClause = buildInClause(options?.practiceTypes ?? [], 'p.practiceType');
  const classificationClause = buildInClause(options?.classifications ?? [], 'p.classification');

  return query<PracticeSummaryRow>(
    `SELECT
      p.practiceType,
      p.classification,
      COUNT(*) as sessionCount,
      COUNT(DISTINCT p.internalMemberId) as memberCount
     FROM PracticeSession p
     JOIN Member m ON m.internalId = p.internalMemberId
     WHERE p.localDate >= ?
       AND p.localDate <= ?
       AND m.mergedIntoId IS NULL
       ${trialClause}
       ${typeClause.clause}
       ${classificationClause.clause}
     GROUP BY p.practiceType, p.classification
     ORDER BY p.practiceType, p.classification`,
    [startDate, endDate, ...typeClause.params, ...classificationClause.params]
  );
}

export function getPracticeMembersForGroup(
  startDate: string,
  endDate: string,
  practiceType: string,
  classification: string,
  trialFilter: TrialFilter
): PracticeMemberRow[] {
  const trialClause = buildTrialFilterClause(trialFilter, 'm');
  return query<PracticeMemberRow>(
    `SELECT
      m.internalId,
      m.membershipId,
      m.firstName,
      m.lastName,
      m.memberLifecycleStage,
      COUNT(p.id) as sessionCount
     FROM PracticeSession p
     JOIN Member m ON m.internalId = p.internalMemberId
     WHERE p.localDate >= ?
       AND p.localDate <= ?
       AND p.practiceType = ?
       AND p.classification = ?
       AND m.mergedIntoId IS NULL
       ${trialClause}
     GROUP BY m.internalId
     ORDER BY m.lastName, m.firstName`,
    [startDate, endDate, practiceType, classification]
  );
}

export function getPracticeTypeOptions(
  startDate: string,
  endDate: string,
  trialFilter: TrialFilter
): string[] {
  const trialClause = buildTrialFilterClause(trialFilter, 'm');
  const rows = query<{ practiceType: string }>(
    `SELECT DISTINCT p.practiceType as practiceType
     FROM PracticeSession p
     JOIN Member m ON m.internalId = p.internalMemberId
     WHERE p.localDate >= ?
       AND p.localDate <= ?
       AND m.mergedIntoId IS NULL
       ${trialClause}
     ORDER BY p.practiceType`,
    [startDate, endDate]
  );

  return rows.map(row => row.practiceType);
}

export function getPracticeClassificationOptions(
  startDate: string,
  endDate: string,
  trialFilter: TrialFilter,
  practiceTypes?: string[]
): string[] {
  const trialClause = buildTrialFilterClause(trialFilter, 'm');
  const typeClause = buildInClause(practiceTypes ?? [], 'p.practiceType');
  const rows = query<{ classification: string }>(
    `SELECT DISTINCT p.classification as classification
     FROM PracticeSession p
     JOIN Member m ON m.internalId = p.internalMemberId
     WHERE p.localDate >= ?
       AND p.localDate <= ?
       AND m.mergedIntoId IS NULL
       ${trialClause}
       ${typeClause.clause}
     ORDER BY p.classification`,
    [startDate, endDate, ...typeClause.params]
  );

  return rows.map(row => row.classification);
}
