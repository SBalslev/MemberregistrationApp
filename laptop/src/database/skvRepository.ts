/**
 * SKV registration repository - laptop-only storage.
 */

import { execute, query } from './db';
import { v4 as uuidv4 } from 'uuid';

export type SkvStatus = 'approved' | 'requested' | 'not_started';

export interface SkvRegistration {
  id: string;
  memberId: string;
  skvLevel: number;
  status: SkvStatus;
  lastApprovedDate: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface SkvWeapon {
  id: string;
  skvRegistrationId: string;
  model: string;
  description: string | null;
  serial: string;
  type: string;
  caliber: string | null;
  lastReviewedDate: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export const SKV_WEAPON_TYPES = [
  'Riffel',
  'Pistol',
  'Vekselsæt',
  'Luftpistol',
  'Luftriffel',
  'Revolver',
  'Karabin',
  'Haglgevær',
  'Salonriffel',
  'Grovkaliber riffel',
  'Sortkrudt pistol',
  'Sortkrudt riffel'
];

export const SKV_CALIBERS = [
  '.177 / 4.5 mm',
  '.22 LR',
  '.22 WMR',
  '.22 Hornet',
  '.223 Rem',
  '5.56x45 mm',
  '6.5x55 mm',
  '7.62x39 mm',
  '.308 Win',
  '7.62x51 mm',
  '.30-06',
  '9x19 mm',
  '9x21 mm',
  '.357 Magnum',
  '.38 Special',
  '.40 S&W',
  '10 mm Auto',
  '.45 ACP',
  '12 gauge',
  '20 gauge'
];

const DEFAULT_SKV_LEVEL = 6;
const DEFAULT_STATUS: SkvStatus = 'not_started';

export function getSkvRegistration(memberId: string): SkvRegistration | null {
  const results = query<SkvRegistration>(
    'SELECT * FROM SKVRegistration WHERE memberId = ?',
    [memberId]
  );
  return results[0] || null;
}

export function getDefaultSkvRegistration(memberId: string): SkvRegistration {
  const now = new Date().toISOString();
  return {
    id: '',
    memberId,
    skvLevel: DEFAULT_SKV_LEVEL,
    status: DEFAULT_STATUS,
    lastApprovedDate: null,
    createdAtUtc: now,
    updatedAtUtc: now
  };
}

export function ensureSkvRegistration(memberId: string): SkvRegistration {
  const existing = getSkvRegistration(memberId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const id = uuidv4();
  execute(
    `INSERT INTO SKVRegistration (
      id, memberId, skvLevel, status, lastApprovedDate, createdAtUtc, updatedAtUtc
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      id,
      memberId,
      DEFAULT_SKV_LEVEL,
      DEFAULT_STATUS,
      null,
      now,
      now
    ]
  );

  return {
    id,
    memberId,
    skvLevel: DEFAULT_SKV_LEVEL,
    status: DEFAULT_STATUS,
    lastApprovedDate: null,
    createdAtUtc: now,
    updatedAtUtc: now
  };
}

export function upsertSkvRegistration(input: {
  memberId: string;
  skvLevel: number;
  status: SkvStatus;
  lastApprovedDate: string | null;
}): SkvRegistration {
  const existing = getSkvRegistration(input.memberId);
  const now = new Date().toISOString();

  if (existing) {
    execute(
      `UPDATE SKVRegistration
       SET skvLevel = ?, status = ?, lastApprovedDate = ?, updatedAtUtc = ?
       WHERE memberId = ?`,
      [
        input.skvLevel,
        input.status,
        input.lastApprovedDate,
        now,
        input.memberId
      ]
    );

    return {
      ...existing,
      skvLevel: input.skvLevel,
      status: input.status,
      lastApprovedDate: input.lastApprovedDate,
      updatedAtUtc: now
    };
  }

  const id = uuidv4();
  execute(
    `INSERT INTO SKVRegistration (
      id, memberId, skvLevel, status, lastApprovedDate, createdAtUtc, updatedAtUtc
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      id,
      input.memberId,
      input.skvLevel,
      input.status,
      input.lastApprovedDate,
      now,
      now
    ]
  );

  return {
    id,
    memberId: input.memberId,
    skvLevel: input.skvLevel,
    status: input.status,
    lastApprovedDate: input.lastApprovedDate,
    createdAtUtc: now,
    updatedAtUtc: now
  };
}

export function getSkvWeaponsByRegistrationId(skvRegistrationId: string): SkvWeapon[] {
  return query<SkvWeapon>(
    `SELECT * FROM SKVWeapon
     WHERE skvRegistrationId = ?
     ORDER BY model, serial`,
    [skvRegistrationId]
  );
}

export function addSkvWeapon(input: Omit<SkvWeapon, 'id' | 'createdAtUtc' | 'updatedAtUtc'>): SkvWeapon {
  const now = new Date().toISOString();
  const id = uuidv4();
  execute(
    `INSERT INTO SKVWeapon (
      id, skvRegistrationId, model, description, serial, type, caliber, lastReviewedDate, createdAtUtc, updatedAtUtc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.skvRegistrationId,
      input.model,
      input.description,
      input.serial,
      input.type,
      input.caliber,
      input.lastReviewedDate,
      now,
      now
    ]
  );

  return {
    ...input,
    id,
    createdAtUtc: now,
    updatedAtUtc: now
  };
}

export function updateSkvWeapon(input: SkvWeapon): SkvWeapon {
  const now = new Date().toISOString();
  execute(
    `UPDATE SKVWeapon
     SET model = ?, description = ?, serial = ?, type = ?, caliber = ?, lastReviewedDate = ?, updatedAtUtc = ?
     WHERE id = ?`,
    [
      input.model,
      input.description,
      input.serial,
      input.type,
      input.caliber,
      input.lastReviewedDate,
      now,
      input.id
    ]
  );

  return {
    ...input,
    updatedAtUtc: now
  };
}

export function deleteSkvWeapon(id: string): void {
  execute('DELETE FROM SKVWeapon WHERE id = ?', [id]);
}
