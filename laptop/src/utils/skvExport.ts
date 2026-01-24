/**
 * SKV Excel export (laptop-only).
 */

import * as XLSX from 'xlsx';
import { query } from '../database';
import type { SkvRegistration, SkvWeapon, SkvStatus } from '../database/skvRepository';

interface MemberExportRow {
  internalId: string;
  membershipId: string | null;
  firstName: string;
  lastName: string;
  status: string;
  updatedAtUtc: string;
  lastCheckInDate: string | null;
  lastPracticeDate: string | null;
}

interface SkvWeaponWithMember extends SkvWeapon {
  memberId: string;
}

const DEFAULT_SKV_LEVEL = 6;
const DEFAULT_STATUS: SkvStatus = 'not_started';

function formatSkvStatus(status: SkvStatus): string {
  switch (status) {
    case 'approved':
      return 'Godkendt';
    case 'requested':
      return 'Anmodet';
    default:
      return 'Ikke startet';
  }
}

function getMemberIdValue(member: MemberExportRow): string {
  return member.membershipId || member.internalId;
}

function getFullName(member: MemberExportRow): string {
  return `${member.firstName} ${member.lastName}`.trim();
}

function getLastActivityDate(member: MemberExportRow): string | null {
  const dates = [
    member.lastCheckInDate,
    member.lastPracticeDate,
    member.updatedAtUtc ? member.updatedAtUtc.slice(0, 10) : null
  ].filter(Boolean) as string[];

  if (dates.length === 0) return null;
  return dates.sort().at(-1) ?? null;
}

function getIncludedMembers(): MemberExportRow[] {
  const members = query<MemberExportRow>(
    `SELECT m.internalId, m.membershipId, m.firstName, m.lastName, m.status, m.updatedAtUtc,
            MAX(c.localDate) as lastCheckInDate,
            MAX(p.localDate) as lastPracticeDate
     FROM Member m
     LEFT JOIN CheckIn c ON c.internalMemberId = m.internalId
     LEFT JOIN PracticeSession p ON p.internalMemberId = m.internalId
     GROUP BY m.internalId
     ORDER BY m.lastName, m.firstName`
  );

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  return members.filter((member) => {
    if (member.status !== 'INACTIVE') return true;
    const lastActivity = getLastActivityDate(member);
    return lastActivity ? lastActivity >= cutoffDate : false;
  });
}

function getRegistrationMap(): Map<string, SkvRegistration> {
  const registrations = query<SkvRegistration>('SELECT * FROM SKVRegistration');
  return new Map(registrations.map((reg) => [reg.memberId, reg]));
}

function getWeapons(): SkvWeaponWithMember[] {
  return query<SkvWeaponWithMember>(
    `SELECT w.*, r.memberId
     FROM SKVWeapon w
     JOIN SKVRegistration r ON r.id = w.skvRegistrationId`
  );
}

export function buildSkvExportWorkbook(): { workbook: XLSX.WorkBook; filename: string } {
  const members = getIncludedMembers();
  const registrations = getRegistrationMap();
  const weapons = getWeapons();
  const memberIdSet = new Set(members.map((member) => member.internalId));

  const registrationsData: Array<Array<string | number>> = [
    ['Medlemsnummer', 'Navn', 'SKV niveau', 'Status', 'Senest godkendt', 'Opdateret']
  ];

  for (const member of members) {
    const registration = registrations.get(member.internalId);
    const skvLevel = registration?.skvLevel ?? DEFAULT_SKV_LEVEL;
    const status = registration?.status ?? DEFAULT_STATUS;
    const lastApprovedDate = registration?.lastApprovedDate ?? '';
    const updatedAt = registration?.updatedAtUtc ?? member.updatedAtUtc;

    registrationsData.push([
      getMemberIdValue(member),
      getFullName(member),
      skvLevel,
      formatSkvStatus(status),
      lastApprovedDate,
      updatedAt
    ]);
  }

  const weaponsData: Array<Array<string | number>> = [
    ['Medlemsnummer', 'Navn', 'Model', 'Type', 'Kaliber', 'Serienummer', 'Beskrivelse', 'Sidst gennemgået', 'Opdateret']
  ];

  for (const weapon of weapons) {
    if (!memberIdSet.has(weapon.memberId)) continue;
    const member = members.find((m) => m.internalId === weapon.memberId);
    if (!member) continue;

    weaponsData.push([
      getMemberIdValue(member),
      getFullName(member),
      weapon.model,
      weapon.type,
      weapon.caliber ?? '',
      weapon.serial,
      weapon.description ?? '',
      weapon.lastReviewedDate ?? '',
      weapon.updatedAtUtc
    ]);
  }

  const workbook = XLSX.utils.book_new();
  const registrationSheet = XLSX.utils.aoa_to_sheet(registrationsData);
  const weaponsSheet = XLSX.utils.aoa_to_sheet(weaponsData);

  XLSX.utils.book_append_sheet(workbook, registrationSheet, 'SKV registrering');
  XLSX.utils.book_append_sheet(workbook, weaponsSheet, 'SKV våben');

  const filename = `SKV-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return { workbook, filename };
}
