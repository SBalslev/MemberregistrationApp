/**
 * Unit tests for SKV export.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as XLSX from 'xlsx';

const queryMock = vi.fn();

vi.mock('../database', () => ({
  query: (sql: string, params?: unknown[]) => queryMock(sql, params)
}));

import { buildSkvExportWorkbook } from './skvExport';

beforeEach(() => {
  queryMock.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-24T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SKV export', () => {
  it('builds an Excel workbook with registrations and weapons tabs', () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('FROM Member m')) {
        return [
          {
            internalId: 'm-1',
            membershipId: 'M001',
            firstName: 'Anna',
            lastName: 'Jensen',
            status: 'ACTIVE',
            updatedAtUtc: '2026-01-10T10:00:00Z',
            lastCheckInDate: '2026-01-05',
            lastPracticeDate: null
          },
          {
            internalId: 'm-2',
            membershipId: null,
            firstName: 'Peter',
            lastName: 'Nielsen',
            status: 'INACTIVE',
            updatedAtUtc: '2025-08-01T10:00:00Z',
            lastCheckInDate: '2025-08-01',
            lastPracticeDate: null
          },
          {
            internalId: 'm-3',
            membershipId: 'M003',
            firstName: 'Lise',
            lastName: 'Olsen',
            status: 'INACTIVE',
            updatedAtUtc: '2024-01-01T10:00:00Z',
            lastCheckInDate: '2024-01-01',
            lastPracticeDate: null
          }
        ];
      }
      if (sql.includes('FROM SKVRegistration')) {
        return [
          {
            id: 'skv-1',
            memberId: 'm-1',
            skvLevel: 4,
            status: 'approved',
            lastApprovedDate: '2026-01-15',
            createdAtUtc: '2026-01-01T00:00:00Z',
            updatedAtUtc: '2026-01-20T00:00:00Z'
          }
        ];
      }
      if (sql.includes('FROM SKVWeapon')) {
        return [
          {
            id: 'w-1',
            skvRegistrationId: 'skv-1',
            model: 'CZ Shadow',
            description: '9mm',
            serial: 'ABC123',
            type: 'Pistol',
            caliber: '9x19 mm',
            lastReviewedDate: '2025-12-01',
            createdAtUtc: '2025-01-01T00:00:00Z',
            updatedAtUtc: '2026-01-10T00:00:00Z',
            memberId: 'm-1'
          },
          {
            id: 'w-2',
            skvRegistrationId: 'skv-2',
            model: 'Old Rifle',
            description: null,
            serial: 'ZZZ999',
            type: 'Riffel',
            caliber: '6.5x55 mm',
            lastReviewedDate: null,
            createdAtUtc: '2024-01-01T00:00:00Z',
            updatedAtUtc: '2024-01-01T00:00:00Z',
            memberId: 'm-3'
          }
        ];
      }
      return [];
    });

    const { workbook, filename } = buildSkvExportWorkbook();

    expect(filename).toBe('SKV-export-2026-01-24.xlsx');
    expect(workbook.SheetNames).toEqual(['SKV registrering', 'SKV våben']);

    const registrationSheet = workbook.Sheets['SKV registrering'];
    const registrations = XLSX.utils.sheet_to_json<string[]>(registrationSheet, { header: 1 });

    expect(registrations[0]).toEqual([
      'Medlemsnummer',
      'Navn',
      'SKV niveau',
      'Status',
      'Senest godkendt',
      'Opdateret'
    ]);

    expect(registrations).toHaveLength(3);
    expect(registrations[1]).toEqual([
      'M001',
      'Anna Jensen',
      4,
      'Godkendt',
      '2026-01-15',
      '2026-01-20T00:00:00Z'
    ]);
    expect(registrations[2][0]).toBe('m-2');
    expect(registrations[2][3]).toBe('Ikke startet');

    const weaponsSheet = workbook.Sheets['SKV våben'];
    const weapons = XLSX.utils.sheet_to_json<string[]>(weaponsSheet, { header: 1 });

    expect(weapons[0]).toEqual([
      'Medlemsnummer',
      'Navn',
      'Model',
      'Type',
      'Kaliber',
      'Serienummer',
      'Beskrivelse',
      'Sidst gennemgået',
      'Opdateret'
    ]);

    expect(weapons).toHaveLength(2);
    expect(weapons[1]).toEqual([
      'M001',
      'Anna Jensen',
      'CZ Shadow',
      'Pistol',
      '9x19 mm',
      'ABC123',
      '9mm',
      '2025-12-01',
      '2026-01-10T00:00:00Z'
    ]);
  });
});
