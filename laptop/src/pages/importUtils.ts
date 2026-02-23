/**
 * CSV import helpers for member data.
 */

import type { Member, MemberStatus, Gender } from '../types';

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
  rowCount: number;
}

export interface ColumnMapping {
  csvColumn: string;
  memberField: keyof Member | '';
}

export function detectDelimiter(firstLine: string): string {
  // Count occurrences of common delimiters
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  // Use semicolon if it appears more often, otherwise comma
  return semicolons > commas ? ';' : ',';
}

export function parseCsv(text: string): CsvParseResult {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [], rowCount: 0 };
  }

  // Auto-detect delimiter from first line
  const delimiter = detectDelimiter(lines[0]);

  const headers = parseCSVLine(lines[0], delimiter);
  const rows = lines.slice(1).map(line => parseCSVLine(line, delimiter));

  return {
    headers,
    rows,
    rowCount: rows.length
  };
}

export function parseCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());

  return result;
}

// ===== Auto-detect column mapping =====

export function autoDetectMapping(headers: string[]): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];

  const headerMap: Record<string, keyof Member> = {
    'membership_id': 'membershipId',
    'membershipid': 'membershipId',
    'member_id': 'membershipId',
    'medlemsnummer': 'membershipId',
    'first_name': 'firstName',
    'firstname': 'firstName',
    'fornavn': 'firstName',
    'last_name': 'lastName',
    'lastname': 'lastName',
    'efternavn': 'lastName',
    'email': 'email',
    'phone': 'phone',
    'telefon': 'phone',
    'status': 'status',
    'birth_date': 'birthDate',
    'birthday': 'birthDate',
    'fødselsdato': 'birthDate',
    'address': 'address',
    'adresse': 'address',
    'zip_code': 'zipCode',
    'zipcode': 'zipCode',
    'postnummer': 'zipCode',
    'city': 'city',
    'by': 'city',
    'gender': 'gender',
    'køn': 'gender',
    'expires_on': 'expiresOn',
    'expireson': 'expiresOn',
    'udløbsdato': 'expiresOn',
  };

  for (const header of headers) {
    const normalizedHeader = header.toLowerCase().trim();
    const matchedField = headerMap[normalizedHeader] || '';
    mappings.push({
      csvColumn: header,
      memberField: matchedField
    });
  }

  return mappings;
}

// ===== Validation =====

export function validateMemberData(data: Partial<Member>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required field validation
  if (!data.membershipId?.trim()) {
    errors.push('Medlemsnummer mangler');
  }
  if (!data.firstName?.trim()) {
    errors.push('Fornavn mangler');
  }
  if (!data.lastName?.trim()) {
    errors.push('Efternavn mangler');
  }

  // Email format
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    warnings.push('Ugyldig email format');
  }

  // Phone format (Danish)
  if (data.phone && !/^(\+45)?[0-9\s-]{8,}$/.test(data.phone.replace(/\s/g, ''))) {
    warnings.push('Usædvanligt telefonnummer format');
  }

  // Birthday format
  if (data.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.birthDate)) {
    warnings.push('Fødselsdato skal være YYYY-MM-DD format');
  }

  // Status validation
  if (data.status && !['ACTIVE', 'INACTIVE'].includes(data.status)) {
    warnings.push(`Ukendt status '${data.status}', bruger ACTIVE`);
  }

  return { errors, warnings };
}

export function normalizeStatus(value: string): MemberStatus {
  const upper = value?.toUpperCase()?.trim();
  if (upper === 'INACTIVE' || upper === 'INAKTIV' || upper === '0' || upper === 'FALSE') {
    return 'INACTIVE';
  }
  return 'ACTIVE';
}

export function normalizeGender(value: string): Gender | null {
  const upper = value?.toUpperCase()?.trim();
  if (upper === 'MALE' || upper === 'M' || upper === 'MAND') return 'MALE';
  if (upper === 'FEMALE' || upper === 'F' || upper === 'KVINDE' || upper === 'K') return 'FEMALE';
  if (upper === 'OTHER' || upper === 'ANDET') return 'OTHER';
  return null;
}

export function normalizeDateString(value: string): string | null {
  if (!value?.trim()) return null;

  // Try parsing different date formats
  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  // Danish format: DD-MM-YYYY or DD/MM/YYYY
  const danishMatch = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (danishMatch) {
    const [, day, month, year] = danishMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // US format: MM/DD/YYYY
  const usMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return value; // Return as-is if can't parse
}
