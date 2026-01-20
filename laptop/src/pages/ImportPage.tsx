/**
 * CSV Import page for member data.
 * Allows importing existing member data from CSV files.
 * 
 * @see FR-23: Initial Data Migration Strategy
 */

import { useState, useCallback, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  AlertTriangle,
  Users,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { bulkInsertMembers, getMemberById } from '../database';
import type { Member, MemberStatus, Gender } from '../types';

// ===== Types =====

interface CsvParseResult {
  headers: string[];
  rows: string[][];
  rowCount: number;
}

interface ParsedMember {
  rowIndex: number;
  data: Partial<Member>;
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
}

interface ImportPreviewState {
  validMembers: ParsedMember[];
  invalidMembers: ParsedMember[];
  duplicates: ParsedMember[];
  totalRows: number;
}

interface ColumnMapping {
  csvColumn: string;
  memberField: keyof Member | '';
}

// Member fields that can be mapped
const MEMBER_FIELDS: { key: keyof Member; label: string; required: boolean }[] = [
  { key: 'membershipId', label: 'Medlemsnummer', required: true },
  { key: 'firstName', label: 'Fornavn', required: true },
  { key: 'lastName', label: 'Efternavn', required: true },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Telefon', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'birthday', label: 'Fødselsdato', required: false },
  { key: 'address', label: 'Adresse', required: false },
  { key: 'zipCode', label: 'Postnummer', required: false },
  { key: 'city', label: 'By', required: false },
  { key: 'gender', label: 'Køn', required: false },
  { key: 'guardianName', label: 'Værge navn', required: false },
  { key: 'guardianPhone', label: 'Værge telefon', required: false },
  { key: 'guardianEmail', label: 'Værge email', required: false },
];

// ===== CSV Parsing =====

function parseCsv(text: string): CsvParseResult {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [], rowCount: 0 };
  }

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(line => parseCSVLine(line));

  return {
    headers,
    rows,
    rowCount: rows.length
  };
}

function parseCSVLine(line: string): string[] {
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
      } else if (char === ',') {
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

function autoDetectMapping(headers: string[]): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];
  
  const headerMap: Record<string, keyof Member> = {
    'membership_id': 'membershipId',
    'membershipid': 'membershipId',
    'member_id': 'membershipId',
    'id': 'membershipId',
    'first_name': 'firstName',
    'firstname': 'firstName',
    'fornavn': 'firstName',
    'last_name': 'lastName',
    'lastname': 'lastName',
    'efternavn': 'lastName',
    'email': 'email',
    'e-mail': 'email',
    'mail': 'email',
    'phone': 'phone',
    'telefon': 'phone',
    'mobil': 'phone',
    'status': 'status',
    'birth_date': 'birthday',
    'birthdate': 'birthday',
    'birthday': 'birthday',
    'fødselsdato': 'birthday',
    'address': 'address',
    'adresse': 'address',
    'zip_code': 'zipCode',
    'zipcode': 'zipCode',
    'postnummer': 'zipCode',
    'city': 'city',
    'by': 'city',
    'gender': 'gender',
    'køn': 'gender',
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

function validateMemberData(data: Partial<Member>): { errors: string[]; warnings: string[] } {
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
  if (data.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(data.birthday)) {
    warnings.push('Fødselsdato skal være YYYY-MM-DD format');
  }

  // Status validation
  if (data.status && !['ACTIVE', 'INACTIVE'].includes(data.status)) {
    warnings.push(`Ukendt status '${data.status}', bruger ACTIVE`);
  }

  return { errors, warnings };
}

function normalizeStatus(value: string): MemberStatus {
  const upper = value?.toUpperCase()?.trim();
  if (upper === 'INACTIVE' || upper === 'INAKTIV' || upper === '0' || upper === 'FALSE') {
    return 'INACTIVE';
  }
  return 'ACTIVE';
}

function normalizeGender(value: string): Gender | null {
  const upper = value?.toUpperCase()?.trim();
  if (upper === 'MALE' || upper === 'M' || upper === 'MAND') return 'MALE';
  if (upper === 'FEMALE' || upper === 'F' || upper === 'KVINDE' || upper === 'K') return 'FEMALE';
  if (upper === 'OTHER' || upper === 'ANDET') return 'OTHER';
  return null;
}

function normalizeDateString(value: string): string | null {
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

// ===== Component =====

export function ImportPage() {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'complete'>('upload');
  const [csvData, setCsvData] = useState<CsvParseResult | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [previewState, setPreviewState] = useState<ImportPreviewState | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      alert('Vælg venligst en CSV fil');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text);
      
      if (parsed.rowCount === 0) {
        alert('CSV filen er tom eller har et ugyldigt format');
        return;
      }

      setCsvData(parsed);
      setColumnMappings(autoDetectMapping(parsed.headers));
      setStep('mapping');
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  // Update column mapping
  const updateMapping = (index: number, field: keyof Member | '') => {
    const newMappings = [...columnMappings];
    newMappings[index] = { ...newMappings[index], memberField: field };
    setColumnMappings(newMappings);
  };

  // Process mappings and generate preview
  const processMapping = () => {
    if (!csvData) return;

    const validMembers: ParsedMember[] = [];
    const invalidMembers: ParsedMember[] = [];
    const duplicates: ParsedMember[] = [];

    const now = new Date().toISOString();

    for (let i = 0; i < csvData.rows.length; i++) {
      const row = csvData.rows[i];
      const memberData: Partial<Member> = {
        createdAtUtc: now,
        updatedAtUtc: now,
        syncVersion: 0,
        status: 'ACTIVE'
      };

      // Map CSV columns to member fields
      for (let j = 0; j < columnMappings.length; j++) {
        const mapping = columnMappings[j];
        const value = row[j]?.trim() || '';

        if (mapping.memberField && value) {
          switch (mapping.memberField) {
            case 'status':
              memberData.status = normalizeStatus(value);
              break;
            case 'gender':
              memberData.gender = normalizeGender(value);
              break;
            case 'birthday':
              memberData.birthday = normalizeDateString(value);
              break;
            default:
              (memberData as Record<string, unknown>)[mapping.memberField] = value;
          }
        }
      }

      const { errors, warnings } = validateMemberData(memberData);
      
      // Check for duplicates in database
      const isDuplicate = memberData.membershipId ? 
        getMemberById(memberData.membershipId) !== null : false;

      const parsed: ParsedMember = {
        rowIndex: i + 2, // +2 for 1-indexed and header row
        data: memberData,
        errors,
        warnings,
        isDuplicate
      };

      if (errors.length > 0) {
        invalidMembers.push(parsed);
      } else if (isDuplicate) {
        duplicates.push(parsed);
      } else {
        validMembers.push(parsed);
      }
    }

    setPreviewState({
      validMembers,
      invalidMembers,
      duplicates,
      totalRows: csvData.rows.length
    });
    setStep('preview');
  };

  // Perform import
  const performImport = async (includeDuplicates: boolean) => {
    if (!previewState) return;

    setStep('importing');
    setImportProgress(0);

    const membersToImport = includeDuplicates 
      ? [...previewState.validMembers, ...previewState.duplicates]
      : previewState.validMembers;

    const totalCount = membersToImport.length;
    let imported = 0;
    let errors = 0;

    // Convert to full Member objects and import in batches
    const BATCH_SIZE = 50;
    const members: Member[] = [];

    for (const parsed of membersToImport) {
      // Generate internalId from membershipId for imported members
      const membershipId = parsed.data.membershipId || '';
      const internalId = crypto.randomUUID();
      
      const member: Member = {
        internalId,
        membershipId: membershipId || null,
        memberLifecycleStage: membershipId ? 'FULL' : 'TRIAL',
        firstName: parsed.data.firstName || '',
        lastName: parsed.data.lastName || '',
        birthday: parsed.data.birthday || null,
        gender: parsed.data.gender || null,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
        zipCode: parsed.data.zipCode || null,
        city: parsed.data.city || null,
        guardianName: parsed.data.guardianName || null,
        guardianPhone: parsed.data.guardianPhone || null,
        guardianEmail: parsed.data.guardianEmail || null,
        feeCategory: 'ADULT',
        status: parsed.data.status || 'ACTIVE',
        expiresOn: null,
        photoUri: null,
        registrationPhotoPath: null,
        mergedIntoId: null,
        deviceId: null,
        createdAtUtc: parsed.data.createdAtUtc || new Date().toISOString(),
        updatedAtUtc: parsed.data.updatedAtUtc || new Date().toISOString(),
        syncedAtUtc: null,
        syncVersion: 0
      };
      members.push(member);
    }

    // Import in batches with progress updates
    try {
      for (let i = 0; i < members.length; i += BATCH_SIZE) {
        const batch = members.slice(i, i + BATCH_SIZE);
        bulkInsertMembers(batch);
        imported += batch.length;
        setImportProgress(Math.round((imported / totalCount) * 100));
        
        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } catch (err) {
      console.error('Import error:', err);
      errors++;
    }

    setImportResult({
      imported,
      skipped: previewState.invalidMembers.length + (includeDuplicates ? 0 : previewState.duplicates.length),
      errors
    });
    setStep('complete');
  };

  // Reset and start over
  const reset = () => {
    setStep('upload');
    setCsvData(null);
    setColumnMappings([]);
    setPreviewState(null);
    setImportProgress(0);
    setImportResult(null);
  };

  // Render based on current step
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Upload className="w-7 h-7" />
          Importer Medlemmer
        </h1>
        <p className="text-gray-600 mt-1">
          Importer eksisterende medlemsdata fra CSV fil
        </p>
      </div>

      {/* Progress steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-lg">
          {['upload', 'mapping', 'preview', 'complete'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${step === s ? 'bg-blue-600 text-white' : 
                  ['upload', 'mapping', 'preview', 'complete'].indexOf(step) > i 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-200 text-gray-600'}
              `}>
                {['upload', 'mapping', 'preview', 'complete'].indexOf(step) > i ? '✓' : i + 1}
              </div>
              {i < 3 && (
                <div className={`w-12 h-1 mx-2 ${
                  ['upload', 'mapping', 'preview', 'complete'].indexOf(step) > i 
                    ? 'bg-green-500' 
                    : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between max-w-lg text-xs text-gray-500 mt-2">
          <span>Vælg fil</span>
          <span>Kortlæg</span>
          <span>Forhåndsvis</span>
          <span>Færdig</span>
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          className={`
            border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
            ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          `}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            Træk og slip CSV fil her
          </p>
          <p className="text-gray-500 mb-4">
            eller klik for at vælge fil
          </p>
          <p className="text-sm text-gray-400">
            Forventet format: membership_id, first_name, last_name, email, ...
          </p>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === 'mapping' && csvData && (
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Kortlæg CSV kolonner</h2>
          <p className="text-gray-600 mb-6">
            Fundet {csvData.rowCount} rækker. Vælg hvilket felt hver kolonne svarer til.
          </p>

          <div className="space-y-3 mb-6">
            {columnMappings.map((mapping, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="w-48 text-sm font-medium text-gray-700 truncate" title={mapping.csvColumn}>
                  {mapping.csvColumn}
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400" />
                <select
                  value={mapping.memberField}
                  onChange={(e) => updateMapping(index, e.target.value as keyof Member | '')}
                  className="flex-1 border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">(Spring over)</option>
                  {MEMBER_FIELDS.map(field => (
                    <option key={field.key} value={field.key}>
                      {field.label} {field.required ? '*' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <button
              onClick={reset}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Annuller
            </button>
            <button
              onClick={processMapping}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Fortsæt til forhåndsvisning
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && previewState && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 mb-1">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Klar til import</span>
              </div>
              <div className="text-2xl font-bold text-green-800">
                {previewState.validMembers.length}
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-yellow-700 mb-1">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-medium">Duplikater</span>
              </div>
              <div className="text-2xl font-bold text-yellow-800">
                {previewState.duplicates.length}
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700 mb-1">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Fejl</span>
              </div>
              <div className="text-2xl font-bold text-red-800">
                {previewState.invalidMembers.length}
              </div>
            </div>
          </div>

          {/* Valid members preview */}
          {previewState.validMembers.length > 0 && (
            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b">
                <h3 className="font-medium text-green-700">
                  Medlemmer klar til import ({previewState.validMembers.length})
                </h3>
              </div>
              <div className="max-h-48 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Række</th>
                      <th className="px-4 py-2 text-left">Medlemsnr</th>
                      <th className="px-4 py-2 text-left">Navn</th>
                      <th className="px-4 py-2 text-left">Email</th>
                      <th className="px-4 py-2 text-left">Advarsler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewState.validMembers.slice(0, 10).map((m) => (
                      <tr key={m.rowIndex} className="border-t">
                        <td className="px-4 py-2">{m.rowIndex}</td>
                        <td className="px-4 py-2 font-mono">{m.data.membershipId}</td>
                        <td className="px-4 py-2">{m.data.firstName} {m.data.lastName}</td>
                        <td className="px-4 py-2 text-gray-500">{m.data.email || '-'}</td>
                        <td className="px-4 py-2">
                          {m.warnings.length > 0 && (
                            <span className="text-yellow-600 text-xs">
                              {m.warnings.join(', ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewState.validMembers.length > 10 && (
                  <div className="p-2 text-center text-sm text-gray-500">
                    ...og {previewState.validMembers.length - 10} flere
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Duplicates */}
          {previewState.duplicates.length > 0 && (
            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b">
                <h3 className="font-medium text-yellow-700">
                  Duplikater - findes allerede ({previewState.duplicates.length})
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Disse medlemmer findes allerede i databasen og vil blive opdateret hvis importeret.
                </p>
              </div>
              <div className="max-h-32 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Række</th>
                      <th className="px-4 py-2 text-left">Medlemsnr</th>
                      <th className="px-4 py-2 text-left">Navn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewState.duplicates.slice(0, 5).map((m) => (
                      <tr key={m.rowIndex} className="border-t">
                        <td className="px-4 py-2">{m.rowIndex}</td>
                        <td className="px-4 py-2 font-mono">{m.data.membershipId}</td>
                        <td className="px-4 py-2">{m.data.firstName} {m.data.lastName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Invalid records */}
          {previewState.invalidMembers.length > 0 && (
            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b">
                <h3 className="font-medium text-red-700">
                  Ugyldige rækker - vil blive sprunget over ({previewState.invalidMembers.length})
                </h3>
              </div>
              <div className="max-h-32 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Række</th>
                      <th className="px-4 py-2 text-left">Data</th>
                      <th className="px-4 py-2 text-left">Fejl</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewState.invalidMembers.slice(0, 5).map((m) => (
                      <tr key={m.rowIndex} className="border-t">
                        <td className="px-4 py-2">{m.rowIndex}</td>
                        <td className="px-4 py-2">{m.data.firstName} {m.data.lastName}</td>
                        <td className="px-4 py-2 text-red-600">{m.errors.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center pt-4">
            <button
              onClick={() => setStep('mapping')}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Tilbage til kortlægning
            </button>
            <div className="flex gap-3">
              {previewState.duplicates.length > 0 && (
                <button
                  onClick={() => performImport(true)}
                  className="px-6 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600"
                >
                  Importer med duplikater ({previewState.validMembers.length + previewState.duplicates.length})
                </button>
              )}
              <button
                onClick={() => performImport(false)}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                disabled={previewState.validMembers.length === 0}
              >
                Importer {previewState.validMembers.length} medlemmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {step === 'importing' && (
        <div className="bg-white rounded-lg border p-12 text-center">
          <Loader2 className="w-12 h-12 mx-auto text-blue-600 animate-spin mb-4" />
          <h2 className="text-lg font-semibold mb-2">Importerer medlemmer...</h2>
          <div className="w-full max-w-md mx-auto bg-gray-200 rounded-full h-4 mb-2">
            <div 
              className="bg-blue-600 h-4 rounded-full transition-all duration-300"
              style={{ width: `${importProgress}%` }}
            />
          </div>
          <p className="text-gray-600">{importProgress}% færdig</p>
        </div>
      )}

      {/* Step 5: Complete */}
      {step === 'complete' && importResult && (
        <div className="bg-white rounded-lg border p-8 text-center">
          <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Import fuldført!</h2>
          
          <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto mb-8">
            <div>
              <div className="text-3xl font-bold text-green-600">{importResult.imported}</div>
              <div className="text-sm text-gray-500">Importeret</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-yellow-600">{importResult.skipped}</div>
              <div className="text-sm text-gray-500">Sprunget over</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-red-600">{importResult.errors}</div>
              <div className="text-sm text-gray-500">Fejl</div>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={reset}
              className="px-6 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Importer flere
            </button>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.location.hash = '#members';
                window.location.reload();
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              Se medlemmer
            </a>
          </div>
        </div>
      )}

      {/* Help section */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium text-gray-700 mb-2">CSV Format</h3>
        <p className="text-sm text-gray-600 mb-2">
          CSV filen skal have en overskriftsrække. Understøttede kolonner:
        </p>
        <code className="text-xs bg-gray-200 p-2 rounded block overflow-x-auto">
          membership_id, first_name, last_name, email, phone, status, birth_date, address, zip_code, city
        </code>
        <p className="text-sm text-gray-500 mt-2">
          Kolonnenavne genkendes automatisk på dansk og engelsk.
        </p>
      </div>
    </div>
  );
}
