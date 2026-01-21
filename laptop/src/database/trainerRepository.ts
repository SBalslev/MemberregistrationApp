/**
 * Repository for trainer management on the laptop admin application.
 * Provides CRUD operations for trainer info and discipline qualifications.
 *
 * @see [trainer-experience/prd.md] - Trainer Experience Feature
 */

import { execute, query } from './db';
import { v4 as uuidv4 } from 'uuid';

// ===== Type Definitions =====

export interface TrainerInfo {
  memberId: string;
  isTrainer: boolean;
  hasSkydelederCertificate: boolean;
  certifiedDate: string | null;
  createdAtUtc: string;
  modifiedAtUtc: string;
  deviceId: string | null;
  syncVersion: number;
  syncedAtUtc: string | null;
}

export interface TrainerDiscipline {
  id: string;
  memberId: string;
  discipline: PracticeType;
  level: TrainerLevel;
  certifiedDate: string | null;
  createdAtUtc: string;
  modifiedAtUtc: string;
  deviceId: string | null;
  syncVersion: number;
  syncedAtUtc: string | null;
}

export type PracticeType = 'Riffel' | 'Pistol' | 'LuftRiffel' | 'LuftPistol' | 'Andet';
export type TrainerLevel = 'FULL' | 'ASSISTANT';

export interface TrainerWithMember {
  memberId: string;
  membershipId: string | null;
  firstName: string;
  lastName: string;
  isTrainer: boolean;
  hasSkydelederCertificate: boolean;
  certifiedDate: string | null;
}

// ===== Trainer Info Functions =====

/**
 * Get trainer info for a specific member.
 */
export function getTrainerInfo(memberId: string): TrainerInfo | null {
  const results = query<TrainerInfo>(
    'SELECT * FROM TrainerInfo WHERE memberId = ?',
    [memberId]
  );
  if (results.length === 0) return null;
  return {
    ...results[0],
    isTrainer: Boolean(results[0].isTrainer),
    hasSkydelederCertificate: Boolean(results[0].hasSkydelederCertificate)
  };
}

/**
 * Get all trainers (members marked as trainers).
 * Joins with Member table to include member details.
 */
export function getAllTrainers(): TrainerWithMember[] {
  return query<TrainerWithMember>(
    `SELECT
      t.memberId, m.membershipId, m.firstName, m.lastName,
      t.isTrainer, t.hasSkydelederCertificate, t.certifiedDate
     FROM TrainerInfo t
     JOIN Member m ON t.memberId = m.internalId
     WHERE t.isTrainer = 1
     ORDER BY m.lastName, m.firstName`
  ).map(t => ({
    ...t,
    isTrainer: Boolean(t.isTrainer),
    hasSkydelederCertificate: Boolean(t.hasSkydelederCertificate)
  }));
}

/**
 * Check if a member is a trainer.
 */
export function isTrainer(memberId: string): boolean {
  const result = query<{ isTrainer: number }>(
    'SELECT isTrainer FROM TrainerInfo WHERE memberId = ?',
    [memberId]
  );
  return result.length > 0 && result[0].isTrainer === 1;
}

/**
 * Set or update trainer status for a member.
 * Creates TrainerInfo record if it doesn't exist.
 */
export function setTrainerStatus(memberId: string, isTrainer: boolean): void {
  const now = new Date().toISOString();
  const existing = getTrainerInfo(memberId);

  if (existing) {
    execute(
      `UPDATE TrainerInfo SET
        isTrainer = ?, modifiedAtUtc = ?, syncVersion = syncVersion + 1
       WHERE memberId = ?`,
      [isTrainer ? 1 : 0, now, memberId]
    );
  } else {
    execute(
      `INSERT INTO TrainerInfo (
        memberId, isTrainer, hasSkydelederCertificate, certifiedDate,
        createdAtUtc, modifiedAtUtc, deviceId, syncVersion
      ) VALUES (?, ?, 0, NULL, ?, ?, 'laptop-master', 1)`,
      [memberId, isTrainer ? 1 : 0, now, now]
    );
  }
}

/**
 * Set Skydeleder (Range Officer) certification for a member.
 */
export function setSkydelederCertification(
  memberId: string,
  hasCertificate: boolean,
  certifiedDate?: string
): void {
  const now = new Date().toISOString();
  const existing = getTrainerInfo(memberId);

  if (existing) {
    execute(
      `UPDATE TrainerInfo SET
        hasSkydelederCertificate = ?, certifiedDate = ?,
        modifiedAtUtc = ?, syncVersion = syncVersion + 1
       WHERE memberId = ?`,
      [
        hasCertificate ? 1 : 0,
        hasCertificate ? (certifiedDate ?? now) : null,
        now,
        memberId
      ]
    );
  } else {
    execute(
      `INSERT INTO TrainerInfo (
        memberId, isTrainer, hasSkydelederCertificate, certifiedDate,
        createdAtUtc, modifiedAtUtc, deviceId, syncVersion
      ) VALUES (?, 0, ?, ?, ?, ?, 'laptop-master', 1)`,
      [
        memberId,
        hasCertificate ? 1 : 0,
        hasCertificate ? (certifiedDate ?? now) : null,
        now,
        now
      ]
    );
  }
}

/**
 * Insert or update trainer info.
 */
export function upsertTrainerInfo(trainerInfo: Partial<TrainerInfo> & { memberId: string }): void {
  const now = new Date().toISOString();
  const existing = getTrainerInfo(trainerInfo.memberId);

  if (existing) {
    execute(
      `UPDATE TrainerInfo SET
        isTrainer = ?, hasSkydelederCertificate = ?, certifiedDate = ?,
        modifiedAtUtc = ?, syncVersion = syncVersion + 1
       WHERE memberId = ?`,
      [
        trainerInfo.isTrainer !== undefined ? (trainerInfo.isTrainer ? 1 : 0) : (existing.isTrainer ? 1 : 0),
        trainerInfo.hasSkydelederCertificate !== undefined ? (trainerInfo.hasSkydelederCertificate ? 1 : 0) : (existing.hasSkydelederCertificate ? 1 : 0),
        trainerInfo.certifiedDate !== undefined ? trainerInfo.certifiedDate : existing.certifiedDate,
        now,
        trainerInfo.memberId
      ]
    );
  } else {
    execute(
      `INSERT INTO TrainerInfo (
        memberId, isTrainer, hasSkydelederCertificate, certifiedDate,
        createdAtUtc, modifiedAtUtc, deviceId, syncVersion
      ) VALUES (?, ?, ?, ?, ?, ?, 'laptop-master', 1)`,
      [
        trainerInfo.memberId,
        trainerInfo.isTrainer ? 1 : 0,
        trainerInfo.hasSkydelederCertificate ? 1 : 0,
        trainerInfo.certifiedDate ?? null,
        now,
        now
      ]
    );
  }
}

// ===== Trainer Discipline Functions =====

/**
 * Get all discipline qualifications for a trainer.
 */
export function getDisciplinesForTrainer(memberId: string): TrainerDiscipline[] {
  return query<TrainerDiscipline>(
    'SELECT * FROM TrainerDiscipline WHERE memberId = ?',
    [memberId]
  );
}

/**
 * Get a specific discipline qualification by ID.
 */
export function getDiscipline(id: string): TrainerDiscipline | null {
  const results = query<TrainerDiscipline>(
    'SELECT * FROM TrainerDiscipline WHERE id = ?',
    [id]
  );
  return results.length > 0 ? results[0] : null;
}

/**
 * Get all trainers qualified for a specific discipline.
 */
export function getTrainersForDiscipline(discipline: PracticeType): TrainerDiscipline[] {
  return query<TrainerDiscipline>(
    'SELECT * FROM TrainerDiscipline WHERE discipline = ?',
    [discipline]
  );
}

/**
 * Add a discipline qualification for a trainer.
 */
export function addTrainerDiscipline(
  memberId: string,
  discipline: PracticeType,
  level: TrainerLevel,
  certifiedDate?: string
): string {
  const now = new Date().toISOString();
  const id = uuidv4();

  // Check if this discipline already exists for this trainer
  const existing = query<{ id: string }>(
    'SELECT id FROM TrainerDiscipline WHERE memberId = ? AND discipline = ?',
    [memberId, discipline]
  );

  if (existing.length > 0) {
    // Update existing discipline
    execute(
      `UPDATE TrainerDiscipline SET
        level = ?, certifiedDate = ?, modifiedAtUtc = ?, syncVersion = syncVersion + 1
       WHERE id = ?`,
      [level, certifiedDate ?? now, now, existing[0].id]
    );
    return existing[0].id;
  }

  // Insert new discipline
  execute(
    `INSERT INTO TrainerDiscipline (
      id, memberId, discipline, level, certifiedDate,
      createdAtUtc, modifiedAtUtc, deviceId, syncVersion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'laptop-master', 1)`,
    [id, memberId, discipline, level, certifiedDate ?? null, now, now]
  );

  return id;
}

/**
 * Remove a discipline qualification from a trainer.
 */
export function removeTrainerDiscipline(id: string): void {
  execute('DELETE FROM TrainerDiscipline WHERE id = ?', [id]);
}

/**
 * Remove a discipline qualification by member and discipline type.
 */
export function removeTrainerDisciplineByType(memberId: string, discipline: PracticeType): void {
  execute(
    'DELETE FROM TrainerDiscipline WHERE memberId = ? AND discipline = ?',
    [memberId, discipline]
  );
}

/**
 * Remove all discipline qualifications for a trainer.
 */
export function removeAllDisciplinesForTrainer(memberId: string): void {
  execute('DELETE FROM TrainerDiscipline WHERE memberId = ?', [memberId]);
}

/**
 * Update a discipline qualification.
 */
export function updateTrainerDiscipline(
  id: string,
  updates: { level?: TrainerLevel; certifiedDate?: string | null }
): void {
  const now = new Date().toISOString();
  const existing = getDiscipline(id);
  if (!existing) return;

  execute(
    `UPDATE TrainerDiscipline SET
      level = ?, certifiedDate = ?, modifiedAtUtc = ?, syncVersion = syncVersion + 1
     WHERE id = ?`,
    [
      updates.level ?? existing.level,
      updates.certifiedDate !== undefined ? updates.certifiedDate : existing.certifiedDate,
      now,
      id
    ]
  );
}

// ===== Search and Query Functions =====

/**
 * Search members who can be made trainers.
 * Returns members with their current trainer status.
 */
export function searchMembersForTrainerAssignment(searchQuery: string): TrainerWithMember[] {
  const results = query<{
    memberId: string;
    membershipId: string | null;
    firstName: string;
    lastName: string;
    isTrainer: number | null;
    hasSkydelederCertificate: number | null;
    certifiedDate: string | null;
  }>(
    `SELECT
      m.internalId as memberId, m.membershipId, m.firstName, m.lastName,
      t.isTrainer, t.hasSkydelederCertificate, t.certifiedDate
     FROM Member m
     LEFT JOIN TrainerInfo t ON m.internalId = t.memberId
     WHERE m.status = 'ACTIVE'
     AND (m.firstName LIKE '%' || ? || '%'
          OR m.lastName LIKE '%' || ? || '%'
          OR m.membershipId LIKE '%' || ? || '%')
     ORDER BY m.lastName, m.firstName
     LIMIT 20`,
    [searchQuery, searchQuery, searchQuery]
  );

  return results.map(r => ({
    memberId: r.memberId,
    membershipId: r.membershipId,
    firstName: r.firstName,
    lastName: r.lastName,
    isTrainer: Boolean(r.isTrainer),
    hasSkydelederCertificate: Boolean(r.hasSkydelederCertificate),
    certifiedDate: r.certifiedDate
  }));
}

/**
 * Get trainer details including all disciplines.
 */
export function getTrainerDetails(memberId: string): {
  trainerInfo: TrainerInfo | null;
  disciplines: TrainerDiscipline[];
  member: { firstName: string; lastName: string; membershipId: string | null } | null;
} {
  const trainerInfo = getTrainerInfo(memberId);
  const disciplines = getDisciplinesForTrainer(memberId);

  const memberResult = query<{ firstName: string; lastName: string; membershipId: string | null }>(
    'SELECT firstName, lastName, membershipId FROM Member WHERE internalId = ?',
    [memberId]
  );
  const member = memberResult.length > 0 ? memberResult[0] : null;

  return { trainerInfo, disciplines, member };
}
