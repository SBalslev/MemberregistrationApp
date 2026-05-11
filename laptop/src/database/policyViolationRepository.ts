/**
 * Policy violation repository (trainer policy logs).
 */

import { execute, query } from './db';

export type PolicyViolationType =
  | 'TRIAL_REG_WEAPON_REQUIRES_LOG'
  | 'TRIAL_LIMIT_EXCEEDED';

export interface PolicyViolation {
  id: string;
  violationType: PolicyViolationType;
  internalMemberId: string;
  membershipId: string | null;
  practiceType: string | null;
  sessionId: string | null;
  occurredAtUtc: string;
  deviceId: string | null;
  notes: string | null;
}

export interface PolicyViolationExportRow {
  id: string;
  violationType: PolicyViolationType;
  internalMemberId: string;
  membershipId: string | null;
  practiceType: string | null;
  sessionId: string | null;
  occurredAtUtc: string;
  deviceId: string | null;
  notes: string | null;
  memberFirstName: string | null;
  memberLastName: string | null;
  memberNumber: string | null;
}

export function upsertPolicyViolation(violation: PolicyViolation): void {
  execute(
    `INSERT OR IGNORE INTO PolicyViolation (
      id, violationType, internalMemberId, membershipId, practiceType,
      sessionId, occurredAtUtc, deviceId, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      violation.id,
      violation.violationType,
      violation.internalMemberId,
      violation.membershipId,
      violation.practiceType,
      violation.sessionId,
      violation.occurredAtUtc,
      violation.deviceId,
      violation.notes
    ]
  );
}

export function getPolicyViolationsForExport(): PolicyViolationExportRow[] {
  return query<PolicyViolationExportRow>(
    `SELECT v.id, v.violationType, v.internalMemberId, v.membershipId,
            v.practiceType, v.sessionId, v.occurredAtUtc, v.deviceId, v.notes,
            m.firstName as memberFirstName, m.lastName as memberLastName,
            m.membershipId as memberNumber
     FROM PolicyViolation v
     LEFT JOIN Member m ON m.internalId = v.internalMemberId
     ORDER BY v.occurredAtUtc DESC`
  );
}
