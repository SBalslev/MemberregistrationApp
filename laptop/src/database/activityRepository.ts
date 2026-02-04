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

export interface PracticeCountRow {
  localDate: string;
  sessionCount: number;
  memberCount: number;
  totalPoints: number;
}

export interface PracticeCountByTypeRow {
  localDate: string;
  practiceType: string;
  sessionCount: number;
}

export function getPracticeCountsByDay(
  startDate: string,
  endDate: string,
  trialFilter: TrialFilter,
  practiceTypes?: string[],
  classifications?: string[]
): PracticeCountRow[] {
  const trialClause = buildTrialFilterClause(trialFilter, 'm');
  const typeClause = buildInClause(practiceTypes ?? [], 'p.practiceType');
  const classificationClause = buildInClause(classifications ?? [], 'p.classification');
  return query<PracticeCountRow>(
    `SELECT
      p.localDate,
      COUNT(*) as sessionCount,
      COUNT(DISTINCT p.internalMemberId) as memberCount,
      SUM(p.points) as totalPoints
     FROM PracticeSession p
     JOIN Member m ON m.internalId = p.internalMemberId
     WHERE p.localDate >= ?
       AND p.localDate <= ?
       AND m.mergedIntoId IS NULL
       ${trialClause}
       ${typeClause.clause}
       ${classificationClause.clause}
     GROUP BY p.localDate
     ORDER BY p.localDate`,
    [startDate, endDate, ...typeClause.params, ...classificationClause.params]
  );
}

export function getPracticeCountsByDayAndType(
  startDate: string,
  endDate: string,
  trialFilter: TrialFilter,
  practiceTypes?: string[],
  classifications?: string[]
): PracticeCountByTypeRow[] {
  const trialClause = buildTrialFilterClause(trialFilter, 'm');
  const typeClause = buildInClause(practiceTypes ?? [], 'p.practiceType');
  const classificationClause = buildInClause(classifications ?? [], 'p.classification');
  return query<PracticeCountByTypeRow>(
    `SELECT
      p.localDate,
      p.practiceType,
      COUNT(*) as sessionCount
     FROM PracticeSession p
     JOIN Member m ON m.internalId = p.internalMemberId
     WHERE p.localDate >= ?
       AND p.localDate <= ?
       AND m.mergedIntoId IS NULL
       ${trialClause}
       ${typeClause.clause}
       ${classificationClause.clause}
     GROUP BY p.localDate, p.practiceType
     ORDER BY p.localDate, p.practiceType`,
    [startDate, endDate, ...typeClause.params, ...classificationClause.params]
  );
}

export interface DailyPracticeSessionRow {
  id: string;
  internalMemberId: string;
  membershipId: string | null;
  firstName: string;
  lastName: string;
  memberLifecycleStage: string;
  practiceType: string;
  classification: string;
  points: number;
  createdAtUtc: string;
}

export function getDailyPracticeSessions(
  localDate: string,
  trialFilter: TrialFilter,
  practiceTypes?: string[],
  classifications?: string[]
): DailyPracticeSessionRow[] {
  const trialClause = buildTrialFilterClause(trialFilter, 'm');
  const typeClause = buildInClause(practiceTypes ?? [], 'p.practiceType');
  const classificationClause = buildInClause(classifications ?? [], 'p.classification');
  return query<DailyPracticeSessionRow>(
    `SELECT
      p.id,
      p.internalMemberId,
      m.membershipId,
      m.firstName,
      m.lastName,
      m.memberLifecycleStage,
      p.practiceType,
      p.classification,
      p.points,
      p.createdAtUtc
     FROM PracticeSession p
     JOIN Member m ON m.internalId = p.internalMemberId
     WHERE p.localDate = ?
       AND m.mergedIntoId IS NULL
       ${trialClause}
       ${typeClause.clause}
       ${classificationClause.clause}
     ORDER BY p.createdAtUtc DESC`,
    [localDate, ...typeClause.params, ...classificationClause.params]
  );
}

export interface PracticeTotalsRow {
  totalSessions: number;
  totalMembers: number;
  totalPoints: number;
}

export function getPracticeTotals(
  startDate: string,
  endDate: string,
  trialFilter: TrialFilter,
  practiceTypes?: string[],
  classifications?: string[]
): PracticeTotalsRow {
  const trialClause = buildTrialFilterClause(trialFilter, 'm');
  const typeClause = buildInClause(practiceTypes ?? [], 'p.practiceType');
  const classificationClause = buildInClause(classifications ?? [], 'p.classification');
  const rows = query<PracticeTotalsRow>(
    `SELECT
      COUNT(*) as totalSessions,
      COUNT(DISTINCT p.internalMemberId) as totalMembers,
      COALESCE(SUM(p.points), 0) as totalPoints
     FROM PracticeSession p
     JOIN Member m ON m.internalId = p.internalMemberId
     WHERE p.localDate >= ?
       AND p.localDate <= ?
       AND m.mergedIntoId IS NULL
       ${trialClause}
       ${typeClause.clause}
       ${classificationClause.clause}`,
    [startDate, endDate, ...typeClause.params, ...classificationClause.params]
  );
  return rows[0] ?? { totalSessions: 0, totalMembers: 0, totalPoints: 0 };
}

// ===== Leaderboard / Rankings =====

export interface LeaderboardRow {
  rank: number;
  internalId: string;
  membershipId: string | null;
  firstName: string;
  lastName: string;
  memberLifecycleStage: string;
  totalPoints: number;
  totalKrydser: number;
  sessionCount: number;
  avgPointsPerSession: number;
  bestSession: number;
}

export function getPracticeLeaderboard(
  startDate: string,
  endDate: string,
  trialFilter: TrialFilter,
  practiceTypes?: string[],
  classifications?: string[],
  limit = 20
): LeaderboardRow[] {
  const trialClause = buildTrialFilterClause(trialFilter, 'm');
  const typeClause = buildInClause(practiceTypes ?? [], 'p.practiceType');
  const classificationClause = buildInClause(classifications ?? [], 'p.classification');

  const rows = query<Omit<LeaderboardRow, 'rank'>>(
    `SELECT
      m.internalId,
      m.membershipId,
      m.firstName,
      m.lastName,
      m.memberLifecycleStage,
      COALESCE(SUM(p.points), 0) as totalPoints,
      COALESCE(SUM(p.krydser), 0) as totalKrydser,
      COUNT(*) as sessionCount,
      ROUND(COALESCE(AVG(p.points), 0), 1) as avgPointsPerSession,
      COALESCE(MAX(p.points), 0) as bestSession
     FROM PracticeSession p
     JOIN Member m ON m.internalId = p.internalMemberId
     WHERE p.localDate >= ?
       AND p.localDate <= ?
       AND m.mergedIntoId IS NULL
       ${trialClause}
       ${typeClause.clause}
       ${classificationClause.clause}
     GROUP BY m.internalId
     ORDER BY avgPointsPerSession DESC, totalKrydser DESC, sessionCount DESC
     LIMIT ?`,
    [startDate, endDate, ...typeClause.params, ...classificationClause.params, limit]
  );

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

// ===== Classification Comparison =====

export interface ClassificationComparisonRow {
  classification: string;
  memberCount: number;
  sessionCount: number;
  totalPoints: number;
  avgPointsPerSession: number;
  avgPointsPerMember: number;
}

export function getClassificationComparison(
  startDate: string,
  endDate: string,
  trialFilter: TrialFilter,
  practiceTypes?: string[]
): ClassificationComparisonRow[] {
  const trialClause = buildTrialFilterClause(trialFilter, 'm');
  const typeClause = buildInClause(practiceTypes ?? [], 'p.practiceType');

  return query<ClassificationComparisonRow>(
    `SELECT
      p.classification,
      COUNT(DISTINCT p.internalMemberId) as memberCount,
      COUNT(*) as sessionCount,
      COALESCE(SUM(p.points), 0) as totalPoints,
      ROUND(COALESCE(AVG(p.points), 0), 1) as avgPointsPerSession,
      ROUND(COALESCE(SUM(p.points) * 1.0 / COUNT(DISTINCT p.internalMemberId), 0), 1) as avgPointsPerMember
     FROM PracticeSession p
     JOIN Member m ON m.internalId = p.internalMemberId
     WHERE p.localDate >= ?
       AND p.localDate <= ?
       AND m.mergedIntoId IS NULL
       ${trialClause}
       ${typeClause.clause}
     GROUP BY p.classification
     ORDER BY avgPointsPerSession DESC`,
    [startDate, endDate, ...typeClause.params]
  );
}

// ===== Detailed Member Stats =====

export interface MemberPracticeStats {
  internalId: string;
  membershipId: string | null;
  firstName: string;
  lastName: string;
  totalPoints: number;
  sessionCount: number;
  avgPointsPerSession: number;
  bestSession: number;
  worstSession: number;
  recentTrend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
}

export function getMemberPracticeStats(
  internalMemberId: string,
  startDate: string,
  endDate: string,
  practiceTypes?: string[],
  classifications?: string[]
): MemberPracticeStats | null {
  const typeClause = buildInClause(practiceTypes ?? [], 'p.practiceType');
  const classificationClause = buildInClause(classifications ?? [], 'p.classification');

  const rows = query<{
    internalId: string;
    membershipId: string | null;
    firstName: string;
    lastName: string;
    totalPoints: number;
    sessionCount: number;
    avgPointsPerSession: number;
    bestSession: number;
    worstSession: number;
  }>(
    `SELECT
      m.internalId,
      m.membershipId,
      m.firstName,
      m.lastName,
      COALESCE(SUM(p.points), 0) as totalPoints,
      COUNT(*) as sessionCount,
      ROUND(COALESCE(AVG(p.points), 0), 1) as avgPointsPerSession,
      COALESCE(MAX(p.points), 0) as bestSession,
      COALESCE(MIN(p.points), 0) as worstSession
     FROM PracticeSession p
     JOIN Member m ON m.internalId = p.internalMemberId
     WHERE p.internalMemberId = ?
       AND p.localDate >= ?
       AND p.localDate <= ?
       AND m.mergedIntoId IS NULL
       ${typeClause.clause}
       ${classificationClause.clause}
     GROUP BY m.internalId`,
    [internalMemberId, startDate, endDate, ...typeClause.params, ...classificationClause.params]
  );

  if (rows.length === 0) return null;

  // Calculate trend by comparing first half vs second half of period
  const trend = calculateMemberTrend(internalMemberId, startDate, endDate, practiceTypes, classifications);

  return { ...rows[0], recentTrend: trend };
}

function calculateMemberTrend(
  internalMemberId: string,
  startDate: string,
  endDate: string,
  practiceTypes?: string[],
  classifications?: string[]
): 'improving' | 'declining' | 'stable' | 'insufficient_data' {
  const typeClause = buildInClause(practiceTypes ?? [], 'p.practiceType');
  const classificationClause = buildInClause(classifications ?? [], 'p.classification');

  // Get all sessions ordered by date
  const sessions = query<{ points: number; localDate: string }>(
    `SELECT p.points, p.localDate
     FROM PracticeSession p
     WHERE p.internalMemberId = ?
       AND p.localDate >= ?
       AND p.localDate <= ?
       ${typeClause.clause}
       ${classificationClause.clause}
     ORDER BY p.localDate`,
    [internalMemberId, startDate, endDate, ...typeClause.params, ...classificationClause.params]
  );

  if (sessions.length < 4) return 'insufficient_data';

  const midpoint = Math.floor(sessions.length / 2);
  const firstHalf = sessions.slice(0, midpoint);
  const secondHalf = sessions.slice(midpoint);

  const avgFirst = firstHalf.reduce((sum, s) => sum + s.points, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((sum, s) => sum + s.points, 0) / secondHalf.length;

  const diff = avgSecond - avgFirst;
  const threshold = avgFirst * 0.1; // 10% change threshold

  if (diff > threshold) return 'improving';
  if (diff < -threshold) return 'declining';
  return 'stable';
}
