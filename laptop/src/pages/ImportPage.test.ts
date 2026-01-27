/**
 * Unit tests for CSV import helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  detectDelimiter,
  parseCSVLine,
  parseCsv,
  autoDetectMapping,
  validateMemberData,
  normalizeStatus,
  normalizeGender,
  normalizeDateString
} from './ImportPage';

describe('CSV import helpers', () => {
  it('detects semicolon delimiter when it is dominant', () => {
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('a,b,c')).toBe(',');
  });

  it('parses CSV line with quoted delimiters and escaped quotes', () => {
    const line = '"Doe, John",john@example.com,"He said ""hi"""';
    const parsed = parseCSVLine(line, ',');
    expect(parsed).toEqual(['Doe, John', 'john@example.com', 'He said "hi"']);
  });

  it('parses CSV content into headers and rows', () => {
    const csv = 'membership_id,first_name,last_name\nM1,Jane,Doe\nM2,John,Smith';
    const result = parseCsv(csv);
    expect(result.headers).toEqual(['membership_id', 'first_name', 'last_name']);
    expect(result.rowCount).toBe(2);
    expect(result.rows[0]).toEqual(['M1', 'Jane', 'Doe']);
  });

  it('auto-detects common member columns', () => {
    const mappings = autoDetectMapping(['membership_id', 'first_name', 'last_name', 'email']);
    const mapped = mappings.map((m) => m.memberField);
    expect(mapped).toEqual(['membershipId', 'firstName', 'lastName', 'email']);
  });

  it('validates required fields and warns on invalid formats', () => {
    const result = validateMemberData({
      membershipId: '',
      firstName: '',
      lastName: 'Doe',
      email: 'invalid-email',
      phone: '123',
      birthDate: '01-01-2000',
      status: 'UNKNOWN' as unknown as import('../types').MemberStatus
    });
    expect(result.errors).toContain('Medlemsnummer mangler');
    expect(result.errors).toContain('Fornavn mangler');
    expect(result.warnings).toContain('Ugyldig email format');
    expect(result.warnings).toContain('Usædvanligt telefonnummer format');
    expect(result.warnings).toContain('Fødselsdato skal være YYYY-MM-DD format');
    expect(result.warnings.some((w) => w.startsWith('Ukendt status'))).toBe(true);
  });

  it('normalizes status values', () => {
    expect(normalizeStatus('inactive')).toBe('INACTIVE');
    expect(normalizeStatus('INAKTIV')).toBe('INACTIVE');
    expect(normalizeStatus('0')).toBe('INACTIVE');
    expect(normalizeStatus('true')).toBe('ACTIVE');
  });

  it('normalizes gender values', () => {
    expect(normalizeGender('M')).toBe('MALE');
    expect(normalizeGender('Kvinde')).toBe('FEMALE');
    expect(normalizeGender('andet')).toBe('OTHER');
    expect(normalizeGender('')).toBeNull();
  });

  it('normalizes date strings to ISO format', () => {
    expect(normalizeDateString('2026-01-22')).toBe('2026-01-22');
    expect(normalizeDateString('22-01-2026')).toBe('2026-01-22');
    expect(normalizeDateString('1/2/2026')).toBe('2026-02-01');
  });
});
