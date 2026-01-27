/**
 * Online API Service for syncing with the remote MySQL database via PHP API.
 *
 * This service acts as the bridge between the laptop app and the online database.
 * It handles authentication, token management, and all sync operations.
 *
 * @see /docs/features/online-database-sync/php-api-design.md
 */

import type { Member, CheckIn, PracticeSession, EquipmentItem, EquipmentCheckout } from '../types/entities';
import type {
  FinancialTransaction,
  FiscalYear,
  FeeRate,
  PostingCategory,
  TransactionLine,
  PendingFeePayment,
} from '../types/finance';
import type { TrainerInfo, TrainerDiscipline } from './trainerRepository';

// ===== Configuration =====

const API_BASE_URL = 'https://iss-skydning.dk/api/v1';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// Expected API version - update this when deploying new API versions
const EXPECTED_API_VERSION = '1.2.0';

// ===== Types =====

export interface OnlineConnectionStatus {
  connected: boolean;
  authenticated: boolean;
  schemaVersion: string | null;
  lastSyncTime: string | null;
  serverTime: string | null;
  error: string | null;
}

export interface ApiDiagnosticResult {
  ok: boolean;
  deploymentOk: boolean;
  apiVersion: string | null;
  expectedVersion: string;
  versionMatch: boolean;
  schemaVersion: string | null;
  dbConnected: boolean;
  missingFiles: string[];
  fileVersions: Record<string, string>;
  expectedFileVersions: Record<string, string>;
  versionMismatches: Record<string, { actual: string; expected: string }>;
  allVersionsOk: boolean;
  phpVersion: string | null;
  phpVersionOk: boolean;
  configExists: boolean;
  serverTime: string | null;
  error?: string;
  raw?: unknown;
}

export interface OnlineSchemaVersion {
  major: number;
  minor: number;
  patch: number;
  description: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
}

export interface SyncPushPayload {
  deviceId: string;
  batchId: string;
  schemaVersion: string;
  entities: {
    members?: OnlineMember[];
    checkIns?: OnlineCheckIn[];
    practiceSessions?: OnlinePracticeSession[];
    equipmentItems?: OnlineEquipmentItem[];
    equipmentCheckouts?: OnlineEquipmentCheckout[];
    trainerInfos?: OnlineTrainerInfo[];
    trainerDisciplines?: OnlineTrainerDiscipline[];
    postingCategories?: OnlinePostingCategory[];
    fiscalYears?: OnlineFiscalYear[];
    feeRates?: OnlineFeeRate[];
    financialTransactions?: OnlineFinancialTransaction[];
    transactionLines?: OnlineTransactionLine[];
    pendingFeePayments?: OnlinePendingFeePayment[];
  };
}

export interface SyncPushResult {
  success: boolean;
  processed: {
    [entityType: string]: {
      inserted: number;
      updated: number;
      deleted: number;
    };
  };
  conflicts: SyncConflict[];
  serverTime: string;
  error?: string;
}

export interface SyncPullResult {
  hasMore: boolean;
  nextCursor: string | null;
  serverTime: string;
  entities: {
    members?: OnlineMember[];
    checkIns?: OnlineCheckIn[];
    practiceSessions?: OnlinePracticeSession[];
    equipmentItems?: OnlineEquipmentItem[];
    equipmentCheckouts?: OnlineEquipmentCheckout[];
    trainerInfos?: OnlineTrainerInfo[];
    trainerDisciplines?: OnlineTrainerDiscipline[];
    postingCategories?: OnlinePostingCategory[];
    fiscalYears?: OnlineFiscalYear[];
    feeRates?: OnlineFeeRate[];
    financialTransactions?: OnlineFinancialTransaction[];
    transactionLines?: OnlineTransactionLine[];
    pendingFeePayments?: OnlinePendingFeePayment[];
  };
  deleted: {
    [entityType: string]: string[];
  };
}

export interface SyncConflict {
  entity: string;
  internalId: string;
  localVersion: number;
  serverVersion: number;
  serverModifiedAt: string;
}

export interface SyncStatus {
  connected: boolean;
  schemaVersion: string;
  lastSync: {
    deviceId: string;
    timestamp: string;
    entitiesPushed: number;
    entitiesPulled: number;
  } | null;
  pendingDeletes: number;
  serverTime: string;
  entityCounts: EntityCounts;
}

export interface EntityCounts {
  // Core member data
  members: number;
  member_photos: number;
  member_preferences: number;
  // Activity data
  check_ins: number;
  practice_sessions: number;
  scan_events: number;
  // Equipment data
  equipment_items: number;
  equipment_checkouts: number;
  // Trainer data
  trainer_info: number;
  trainer_disciplines: number;
  // Finance data
  posting_categories: number;
  fiscal_years: number;
  fee_rates: number;
  financial_transactions: number;
  transaction_lines: number;
  pending_fee_payments: number;
}

export interface PhotoUploadResult {
  success: boolean;
  photoId: string;
  sizeBytes: number;
  message?: string;
}

// Online entity types with snake_case for API compatibility
export interface OnlineMember {
  internal_id: string;
  membership_id: string | null;
  member_lifecycle_stage: 'TRIAL' | 'FULL';
  status: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  zip_code: string | null;
  city: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
  expires_on: string | null;
  member_type: string | null;
  merged_into_id: string | null;
  photo_hash: string | null;
  created_at_utc: string;
  modified_at_utc: string;
  sync_version: number;
  _action?: 'upsert' | 'delete';
  _deleted?: boolean;
}

export interface OnlineCheckIn {
  id: string;
  internal_member_id: string;
  membership_id: string | null;
  local_date: string;
  device_id: string;
  created_at_utc: string;
  sync_version: number;
  _action?: 'upsert' | 'delete';
  _deleted?: boolean;
}

export interface OnlinePracticeSession {
  id: string;
  internal_member_id: string;
  membership_id: string | null;
  local_date: string;
  practice_type: string;
  classification: string;
  points: number;
  krydser: number | null;
  notes: string | null;
  device_id: string;
  created_at_utc: string;
  sync_version: number;
  _action?: 'upsert' | 'delete';
  _deleted?: boolean;
}

export interface OnlineEquipmentItem {
  id: string;
  serial_number: string;
  name: string;
  description: string | null;
  equipment_type: string;
  status: string;
  discipline: string | null;
  device_id: string;
  created_at_utc: string;
  modified_at_utc: string;
  sync_version: number;
  _action?: 'upsert' | 'delete';
  _deleted?: boolean;
}

export interface OnlineEquipmentCheckout {
  id: string;
  equipment_id: string;
  internal_member_id: string;
  membership_id: string | null;
  checked_out_at_utc: string;
  checked_in_at_utc: string | null;
  checked_out_by_device_id: string;
  checked_in_by_device_id: string | null;
  checkout_notes: string | null;
  checkin_notes: string | null;
  conflict_status: string | null;
  device_id: string;
  created_at_utc: string;
  modified_at_utc: string;
  sync_version: number;
  _action?: 'upsert' | 'delete';
  _deleted?: boolean;
}

export interface OnlineTrainerInfo {
  member_id: string;
  is_trainer: boolean;
  has_skydeleder_certificate: boolean;
  certified_date: string | null;
  device_id: string;
  created_at_utc: string;
  modified_at_utc: string;
  sync_version: number;
  _action?: 'upsert' | 'delete';
  _deleted?: boolean;
}

export interface OnlineTrainerDiscipline {
  id: string;
  member_id: string;
  discipline: string;
  level: string;
  certified_date: string | null;
  device_id: string;
  created_at_utc: string;
  modified_at_utc: string;
  sync_version: number;
  _action?: 'upsert' | 'delete';
  _deleted?: boolean;
}

export interface OnlinePostingCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at_utc: string;
  modified_at_utc: string;
  sync_version: number;
  _action?: 'upsert' | 'delete';
  _deleted?: boolean;
}

export interface OnlineFiscalYear {
  year: number;
  opening_cash_balance: number;
  opening_bank_balance: number;
  is_closed: boolean;
  created_at_utc: string;
  modified_at_utc: string;
  sync_version: number;
  _action?: 'upsert' | 'delete';
  _deleted?: boolean;
}

export interface OnlineFeeRate {
  fiscal_year: number;
  member_type: string;
  fee_amount: number;
  sync_version: number;
  _action?: 'upsert' | 'delete';
  _deleted?: boolean;
}

export interface OnlineFinancialTransaction {
  id: string;
  fiscal_year: number;
  sequence_number: number;
  date: string;
  description: string;
  cash_in: number | null;
  cash_out: number | null;
  bank_in: number | null;
  bank_out: number | null;
  notes: string | null;
  is_deleted: boolean;
  created_at_utc: string;
  modified_at_utc: string;
  sync_version: number;
  _action?: 'upsert' | 'delete';
  _deleted?: boolean;
}

export interface OnlineTransactionLine {
  id: string;
  transaction_id: string;
  category_id: string;
  amount: number;
  is_income: boolean;
  member_id: string | null;
  line_description: string | null;
  sync_version: number;
  _action?: 'upsert' | 'delete';
  _deleted?: boolean;
}

export interface OnlinePendingFeePayment {
  id: string;
  fiscal_year: number;
  member_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes: string | null;
  is_consolidated: boolean;
  consolidated_transaction_id: string | null;
  created_at_utc: string;
  modified_at_utc: string;
  sync_version: number;
  _action?: 'upsert' | 'delete';
  _deleted?: boolean;
}

// ===== Error Classes =====

export class OnlineApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    statusCode: number,
    code?: string,
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'OnlineApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class AuthenticationError extends OnlineApiError {
  attemptsRemaining?: number;

  constructor(message: string, attemptsRemaining?: number, retryAfterSeconds?: number) {
    super(message, 401, 'AUTH_FAILED', retryAfterSeconds);
    this.name = 'AuthenticationError';
    this.attemptsRemaining = attemptsRemaining;
  }
}

export class RateLimitError extends OnlineApiError {
  constructor(retryAfterSeconds: number) {
    super('Too many requests. Please wait.', 429, 'RATE_LIMITED', retryAfterSeconds);
    this.name = 'RateLimitError';
  }
}

export class ConflictError extends OnlineApiError {
  readonly conflicts: SyncConflict[];

  constructor(conflicts: SyncConflict[]) {
    super('Sync conflict detected', 409, 'CONFLICT');
    this.name = 'ConflictError';
    this.conflicts = conflicts;
  }
}

export class SchemaVersionError extends OnlineApiError {
  readonly localVersion: string;
  readonly serverVersion: string;

  constructor(localVersion: string, serverVersion: string) {
    super(`Schema version mismatch: local ${localVersion}, server ${serverVersion}`, 400, 'SCHEMA_MISMATCH');
    this.name = 'SchemaVersionError';
    this.localVersion = localVersion;
    this.serverVersion = serverVersion;
  }
}

// ===== Service Implementation =====

class OnlineApiService {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;
  private deviceId: string | null = null;
  private lastSyncTime: string | null = null;

  // ===== Authentication =====

  /**
   * Authenticate with the online API using a password.
   * Stores the JWT token for subsequent requests.
   */
  async authenticate(password: string, deviceId: string): Promise<AuthResult> {
    this.deviceId = deviceId;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password,
          device_id: deviceId,
        }),
      });

      // Check content type to avoid JSON parse errors on HTML error pages
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('[OnlineApiService] Non-JSON response:', response.status, text.substring(0, 200));
        return {
          success: false,
          error: response.status === 404
            ? 'API ikke fundet - er den deployet til serveren?'
            : `Server fejl (${response.status}): ${text.substring(0, 100)}`,
        };
      }

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          return {
            success: false,
            error: data.error || 'Too many login attempts',
            retryAfterSeconds: data.retry_after_seconds,
          };
        }

        return {
          success: false,
          error: data.error || 'Authentication failed',
          attemptsRemaining: data.attempts_remaining,
        };
      }

      this.token = data.token;
      this.tokenExpiry = new Date(data.expires_at);

      console.log('[OnlineApiService] Authenticated successfully, token expires:', this.tokenExpiry);

      return { success: true };
    } catch (error) {
      console.error('[OnlineApiService] Authentication error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Check if currently authenticated with a valid token.
   */
  isAuthenticated(): boolean {
    if (!this.token || !this.tokenExpiry) {
      return false;
    }
    return new Date() < this.tokenExpiry;
  }

  /**
   * Clear authentication state.
   */
  logout(): void {
    this.token = null;
    this.tokenExpiry = null;
    console.log('[OnlineApiService] Logged out');
  }

  /**
   * Get token expiry time.
   */
  getTokenExpiry(): Date | null {
    return this.tokenExpiry;
  }

  /**
   * Check if token needs refresh (within buffer period).
   */
  needsTokenRefresh(): boolean {
    if (!this.tokenExpiry) return true;
    const refreshTime = new Date(this.tokenExpiry.getTime() - TOKEN_REFRESH_BUFFER_MS);
    return new Date() >= refreshTime;
  }

  // ===== Schema Version =====

  /**
   * Get the online database schema version.
   */
  async getSchemaVersion(): Promise<OnlineSchemaVersion> {
    const response = await this.request<{
      major: number;
      minor: number;
      patch: number;
      description: string;
    }>('GET', '/schema/version');

    return response;
  }

  /**
   * Check if schema versions are compatible.
   * Same major version = compatible.
   */
  async checkSchemaCompatibility(localVersion: string): Promise<{
    compatible: boolean;
    serverVersion: string;
    warning?: string;
  }> {
    const serverSchema = await this.getSchemaVersion();
    const serverVersion = `${serverSchema.major}.${serverSchema.minor}.${serverSchema.patch}`;

    const localParts = localVersion.split('.').map(Number);
    const localMajor = localParts[0] || 0;
    const localMinor = localParts[1] || 0;

    if (localMajor !== serverSchema.major) {
      return {
        compatible: false,
        serverVersion,
      };
    }

    let warning: string | undefined;
    if (localMinor < serverSchema.minor) {
      warning = `Server has newer schema (${serverVersion}). Some features may not sync correctly.`;
    } else if (localMinor > serverSchema.minor) {
      warning = `Local app has newer schema (${localVersion}). Server may not accept all data.`;
    }

    return {
      compatible: true,
      serverVersion,
      warning,
    };
  }

  // ===== Sync Operations =====

  /**
   * Push local changes to the online database.
   */
  async push(payload: SyncPushPayload): Promise<SyncPushResult> {
    const apiPayload = {
      device_id: payload.deviceId,
      batch_id: payload.batchId,
      schema_version: payload.schemaVersion,
      entities: payload.entities,
    };

    try {
      const response = await this.request<{
        success: boolean;
        processed: {
          [key: string]: { inserted: number; updated: number; deleted: number };
        };
        conflicts: Array<{
          entity: string;
          internal_id: string;
          local_version: number;
          server_version: number;
          server_modified_at: string;
        }>;
        server_time: string;
        error?: string;
      }>('POST', '/sync/push', apiPayload);

      // Defensive: handle potentially missing or malformed response fields
      const conflicts = Array.isArray(response.conflicts) ? response.conflicts : [];

      return {
        success: response.success ?? false,
        processed: response.processed || {},
        conflicts: conflicts.map(c => ({
          entity: c?.entity ?? '',
          internalId: c?.internal_id ?? '',
          localVersion: c?.local_version ?? 0,
          serverVersion: c?.server_version ?? 0,
          serverModifiedAt: c?.server_modified_at ?? '',
        })),
        serverTime: response.server_time ?? new Date().toISOString(),
        error: response.error,
      };
    } catch (error) {
      if (error instanceof OnlineApiError && error.statusCode === 409) {
        // Conflict response - parse conflicts from error
        throw error;
      }
      throw error;
    }
  }

  /**
   * Pull changes from the online database.
   */
  async pull(
    since: string,
    entities: string[] = ['members', 'check_ins', 'practice_sessions', 'equipment_items', 'equipment_checkouts', 'trainer_infos', 'trainer_disciplines', 'posting_categories', 'fiscal_years', 'fee_rates', 'financial_transactions', 'transaction_lines', 'pending_fee_payments'],
    limit: number = 100
  ): Promise<SyncPullResult> {
    const params = new URLSearchParams({
      since,
      entities: entities.join(','),
      limit: String(limit),
    });

    const response = await this.request<{
      has_more: boolean;
      next_cursor: string | null;
      server_time: string;
      entities: {
        [key: string]: unknown[];
      };
      deleted: {
        [key: string]: string[];
      };
    }>('GET', `/sync/pull?${params}`);

    this.lastSyncTime = response.server_time;

    return {
      hasMore: response.has_more,
      nextCursor: response.next_cursor,
      serverTime: response.server_time,
      entities: response.entities as SyncPullResult['entities'],
      deleted: response.deleted,
    };
  }

  /**
   * Pull all changes since a timestamp, handling pagination automatically.
   */
  async pullAll(
    since: string,
    entities?: string[],
    onProgress?: (pulled: number, hasMore: boolean) => void
  ): Promise<SyncPullResult> {
    let cursor = since;
    let totalPulled = 0;
    const allEntities: SyncPullResult['entities'] = {};
    const allDeleted: { [key: string]: string[] } = {};

    while (true) {
      const result = await this.pull(cursor, entities);
      totalPulled += Object.values(result.entities).reduce((sum, arr) => sum + (arr?.length || 0), 0);

      // Merge entities
      for (const [entityType, records] of Object.entries(result.entities)) {
        if (!allEntities[entityType as keyof SyncPullResult['entities']]) {
          (allEntities as Record<string, unknown[]>)[entityType] = [];
        }
        (allEntities as Record<string, unknown[]>)[entityType].push(...(records || []));
      }

      // Merge deleted
      for (const [entityType, ids] of Object.entries(result.deleted)) {
        if (!allDeleted[entityType]) {
          allDeleted[entityType] = [];
        }
        allDeleted[entityType].push(...ids);
      }

      onProgress?.(totalPulled, result.hasMore);

      if (!result.hasMore || !result.nextCursor) {
        return {
          hasMore: false,
          nextCursor: null,
          serverTime: result.serverTime,
          entities: allEntities,
          deleted: allDeleted,
        };
      }

      cursor = result.nextCursor;
    }
  }

  /**
   * Get sync status from the server.
   */
  async getSyncStatus(): Promise<SyncStatus> {
    const response = await this.request<{
      connected: boolean;
      schema_version: string;
      last_sync: {
        device_id: string;
        timestamp: string;
        entities_pushed: number;
        entities_pulled: number;
      } | null;
      pending_deletes: number;
      server_time: string;
      entity_counts: EntityCounts;
    }>('GET', '/sync/status');

    return {
      connected: response.connected,
      schemaVersion: response.schema_version,
      lastSync: response.last_sync ? {
        deviceId: response.last_sync.device_id,
        timestamp: response.last_sync.timestamp,
        entitiesPushed: response.last_sync.entities_pushed,
        entitiesPulled: response.last_sync.entities_pulled,
      } : null,
      pendingDeletes: response.pending_deletes,
      serverTime: response.server_time,
      entityCounts: response.entity_counts,
    };
  }

  // ===== Photo Operations =====

  /**
   * Upload a member photo.
   */
  async uploadPhoto(
    memberId: string,
    photoData: Blob | ArrayBuffer,
    contentHash: string
  ): Promise<PhotoUploadResult> {
    if (!this.isAuthenticated()) {
      throw new AuthenticationError('Not authenticated');
    }

    const formData = new FormData();
    const blob = photoData instanceof ArrayBuffer
      ? new Blob([photoData], { type: 'image/jpeg' })
      : photoData;
    formData.append('photo', blob, 'photo.jpg');
    formData.append('content_hash', contentHash);

    const response = await fetch(`${API_BASE_URL}/photos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'X-Member-Id': memberId,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new OnlineApiError(
        error.error || 'Photo upload failed',
        response.status,
        error.code
      );
    }

    const data = await response.json();
    return {
      success: true,
      photoId: data.photo_id,
      sizeBytes: data.size_bytes,
      message: data.message,
    };
  }

  /**
   * Download a member photo.
   */
  async downloadPhoto(photoId: string): Promise<Blob> {
    if (!this.isAuthenticated()) {
      throw new AuthenticationError('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/photos/${photoId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new OnlineApiError('Photo not found', 404, 'NOT_FOUND');
      }
      throw new OnlineApiError('Photo download failed', response.status);
    }

    return response.blob();
  }

  // ===== Connection Status =====

  /**
   * Get the current connection status.
   */
  async getConnectionStatus(): Promise<OnlineConnectionStatus> {
    const status: OnlineConnectionStatus = {
      connected: false,
      authenticated: this.isAuthenticated(),
      schemaVersion: null,
      lastSyncTime: this.lastSyncTime,
      serverTime: null,
      error: null,
    };

    if (!this.isAuthenticated()) {
      return status;
    }

    try {
      const syncStatus = await this.getSyncStatus();
      status.connected = syncStatus.connected;
      status.schemaVersion = syncStatus.schemaVersion;
      status.serverTime = syncStatus.serverTime;
      status.lastSyncTime = syncStatus.lastSync?.timestamp || this.lastSyncTime;
    } catch (error) {
      status.error = error instanceof Error ? error.message : 'Connection failed';
    }

    return status;
  }

  /**
   * Run API diagnostics to verify deployment.
   * Checks version, files, database connection, etc.
   */
  async runDiagnostics(): Promise<ApiDiagnosticResult> {
    try {
      const response = await fetch(`${API_BASE_URL}/diagnostic`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        return {
          ok: false,
          deploymentOk: false,
          apiVersion: null,
          expectedVersion: EXPECTED_API_VERSION,
          versionMatch: false,
          schemaVersion: null,
          dbConnected: false,
          missingFiles: [],
          fileVersions: {},
          expectedFileVersions: {},
          versionMismatches: {},
          allVersionsOk: false,
          phpVersion: null,
          phpVersionOk: false,
          configExists: false,
          serverTime: null,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        return {
          ok: false,
          deploymentOk: false,
          apiVersion: null,
          expectedVersion: EXPECTED_API_VERSION,
          versionMatch: false,
          schemaVersion: null,
          dbConnected: false,
          missingFiles: [],
          fileVersions: {},
          expectedFileVersions: {},
          versionMismatches: {},
          allVersionsOk: false,
          phpVersion: null,
          phpVersionOk: false,
          configExists: false,
          serverTime: null,
          error: `Non-JSON response: ${text.substring(0, 100)}`,
        };
      }

      const data = await response.json();

      const apiVersion = data.api?.version || null;
      const versionMatch = apiVersion === EXPECTED_API_VERSION;
      const allVersionsOk = data.files?.all_versions_ok ?? false;
      const deploymentOk = data.deployment_ok ?? false;

      return {
        ok: versionMatch && data.database?.status === 'connected' && data.files?.missing?.length === 0 && allVersionsOk,
        deploymentOk,
        apiVersion,
        expectedVersion: EXPECTED_API_VERSION,
        versionMatch,
        schemaVersion: data.database?.schema_version || null,
        dbConnected: data.database?.status === 'connected',
        missingFiles: data.files?.missing || [],
        fileVersions: data.files?.versions || {},
        expectedFileVersions: data.files?.expected_versions || {},
        versionMismatches: data.files?.version_mismatches || {},
        allVersionsOk,
        phpVersion: data.php?.version || null,
        phpVersionOk: data.php?.version_ok || false,
        configExists: data.config?.exists || false,
        serverTime: data.server_time || null,
        raw: data,
      };
    } catch (error) {
      return {
        ok: false,
        deploymentOk: false,
        apiVersion: null,
        expectedVersion: EXPECTED_API_VERSION,
        versionMatch: false,
        schemaVersion: null,
        dbConnected: false,
        missingFiles: [],
        fileVersions: {},
        expectedFileVersions: {},
        versionMismatches: {},
        allVersionsOk: false,
        phpVersion: null,
        phpVersionOk: false,
        configExists: false,
        serverTime: null,
        error: error instanceof Error ? error.message : 'Diagnostic failed',
      };
    }
  }

  /**
   * Test connectivity to the API (health check).
   */
  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();

    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errorMsg = response.status === 404
          ? 'API ikke fundet (404) - deployer api/ mappen til serveren'
          : `HTTP ${response.status}`;
        return { ok: false, latencyMs, error: errorMsg };
      }

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return { ok: false, latencyMs, error: 'Server returnerer ikke JSON - er API deployet?' };
      }

      return { ok: true, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      return {
        ok: false,
        latencyMs,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  // ===== Internal Request Helper =====

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retryCount = 0
  ): Promise<T> {
    if (!this.isAuthenticated()) {
      throw new AuthenticationError('Not authenticated');
    }

    const url = `${API_BASE_URL}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
    };

    if (this.deviceId) {
      headers['X-Device-Id'] = this.deviceId;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Handle specific error responses
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));

        switch (response.status) {
          case 401:
            // Token expired or invalid
            this.token = null;
            this.tokenExpiry = null;
            throw new AuthenticationError(errorData.error || 'Authentication required');

          case 429:
            // Rate limited
            const retryAfter = errorData.retry_after_seconds || 60;
            throw new RateLimitError(retryAfter);

          case 409:
            // Conflict
            throw new ConflictError(errorData.conflicts || []);

          default:
            throw new OnlineApiError(
              errorData.error || `Request failed: ${response.status}`,
              response.status,
              errorData.code
            );
        }
      }

      return await response.json() as T;

    } catch (error) {
      // Handle network errors with retry
      if (error instanceof TypeError && error.message.includes('fetch')) {
        if (retryCount < MAX_RETRY_ATTEMPTS) {
          console.log(`[OnlineApiService] Network error, retrying (${retryCount + 1}/${MAX_RETRY_ATTEMPTS})...`);
          await this.delay(RETRY_DELAY_MS * Math.pow(2, retryCount));
          return this.request(method, path, body, retryCount + 1);
        }
        throw new OnlineApiError('Network error: Unable to reach server', 0, 'NETWORK_ERROR');
      }

      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===== Conversion Helpers =====

/**
 * Convert a local Member to OnlineMember format.
 */
export function memberToOnline(member: Member, action: 'upsert' | 'delete' = 'upsert'): OnlineMember {
  return {
    internal_id: member.internalId,
    membership_id: member.membershipId,
    member_lifecycle_stage: member.memberLifecycleStage,
    status: member.status,
    first_name: member.firstName,
    last_name: member.lastName,
    birth_date: member.birthDate,
    gender: member.gender,
    email: member.email,
    phone: member.phone,
    address: member.address,
    zip_code: member.zipCode,
    city: member.city,
    guardian_name: member.guardianName,
    guardian_phone: member.guardianPhone,
    guardian_email: member.guardianEmail,
    expires_on: member.expiresOn,
    member_type: member.memberType,
    merged_into_id: member.mergedIntoId,
    photo_hash: null, // Photo handled separately
    created_at_utc: member.createdAtUtc,
    modified_at_utc: member.updatedAtUtc,
    sync_version: member.syncVersion,
    _action: action,
  };
}

/**
 * Convert an OnlineMember to local Member format.
 */
export function memberFromOnline(online: OnlineMember): Partial<Member> {
  return {
    internalId: online.internal_id,
    membershipId: online.membership_id,
    memberLifecycleStage: online.member_lifecycle_stage,
    status: online.status as 'ACTIVE' | 'INACTIVE',
    firstName: online.first_name,
    lastName: online.last_name,
    birthDate: online.birth_date,
    gender: online.gender as 'MALE' | 'FEMALE' | 'OTHER' | null,
    email: online.email,
    phone: online.phone,
    address: online.address,
    zipCode: online.zip_code,
    city: online.city,
    guardianName: online.guardian_name,
    guardianPhone: online.guardian_phone,
    guardianEmail: online.guardian_email,
    expiresOn: online.expires_on,
    memberType: online.member_type as 'ADULT' | 'CHILD' | 'CHILD_PLUS',
    mergedIntoId: online.merged_into_id,
    createdAtUtc: online.created_at_utc,
    updatedAtUtc: online.modified_at_utc,
    syncVersion: online.sync_version,
  };
}

/**
 * Convert a local CheckIn to OnlineCheckIn format.
 */
export function checkInToOnline(checkIn: CheckIn, deviceId: string, action: 'upsert' | 'delete' = 'upsert'): OnlineCheckIn {
  return {
    id: checkIn.id,
    internal_member_id: checkIn.internalMemberId,
    membership_id: checkIn.membershipId,
    local_date: checkIn.localDate,
    device_id: deviceId,
    created_at_utc: checkIn.createdAtUtc,
    sync_version: checkIn.syncVersion,
    _action: action,
  };
}

/**
 * Convert an OnlineCheckIn to local CheckIn format.
 */
export function checkInFromOnline(online: OnlineCheckIn): Partial<CheckIn> {
  return {
    id: online.id,
    internalMemberId: online.internal_member_id,
    membershipId: online.membership_id,
    localDate: online.local_date,
    createdAtUtc: online.created_at_utc,
    syncVersion: online.sync_version,
  };
}

/**
 * Convert a local PracticeSession to OnlinePracticeSession format.
 */
export function practiceSessionToOnline(
  session: PracticeSession,
  deviceId: string,
  action: 'upsert' | 'delete' = 'upsert'
): OnlinePracticeSession {
  return {
    id: session.id,
    internal_member_id: session.internalMemberId,
    membership_id: session.membershipId,
    local_date: session.localDate,
    practice_type: session.practiceType,
    classification: session.classification,
    points: session.points,
    krydser: session.krydser,
    notes: session.notes,
    device_id: deviceId,
    created_at_utc: session.createdAtUtc,
    sync_version: session.syncVersion,
    _action: action,
  };
}

/**
 * Convert an OnlinePracticeSession to local PracticeSession format.
 */
export function practiceSessionFromOnline(online: OnlinePracticeSession): Partial<PracticeSession> {
  return {
    id: online.id,
    internalMemberId: online.internal_member_id,
    membershipId: online.membership_id,
    localDate: online.local_date,
    practiceType: online.practice_type as 'RIFLE' | 'PISTOL',
    classification: online.classification,
    points: online.points,
    krydser: online.krydser,
    notes: online.notes,
    createdAtUtc: online.created_at_utc,
    syncVersion: online.sync_version,
  };
}

/**
 * Convert a local FinancialTransaction to online format.
 */
export function financialTransactionToOnline(
  transaction: FinancialTransaction,
  action: 'upsert' | 'delete' = 'upsert'
): OnlineFinancialTransaction {
  return {
    id: transaction.id,
    fiscal_year: transaction.fiscalYear,
    sequence_number: transaction.sequenceNumber,
    date: transaction.date,
    description: transaction.description,
    cash_in: transaction.cashIn,
    cash_out: transaction.cashOut,
    bank_in: transaction.bankIn,
    bank_out: transaction.bankOut,
    notes: transaction.notes,
    is_deleted: transaction.isDeleted,
    created_at_utc: transaction.createdAtUtc,
    modified_at_utc: transaction.updatedAtUtc,
    sync_version: 0, // TODO: Add sync_version to local type
    _action: action,
  };
}

/**
 * Convert an OnlineFinancialTransaction to local format.
 */
export function financialTransactionFromOnline(online: OnlineFinancialTransaction): Partial<FinancialTransaction> {
  return {
    id: online.id,
    fiscalYear: online.fiscal_year,
    sequenceNumber: online.sequence_number,
    date: online.date,
    description: online.description,
    cashIn: online.cash_in,
    cashOut: online.cash_out,
    bankIn: online.bank_in,
    bankOut: online.bank_out,
    notes: online.notes,
    isDeleted: online.is_deleted,
    createdAtUtc: online.created_at_utc,
    updatedAtUtc: online.modified_at_utc,
  };
}

// ===== Fiscal Year Conversion =====

export function fiscalYearToOnline(
  fiscalYear: FiscalYear,
  feeRates: FeeRate[] = [],
  action: 'upsert' | 'delete' = 'upsert'
): OnlineFiscalYear & { fee_rates?: OnlineFeeRate[] } {
  return {
    year: fiscalYear.year,
    opening_cash_balance: fiscalYear.openingCashBalance,
    opening_bank_balance: fiscalYear.openingBankBalance,
    is_closed: fiscalYear.isClosed,
    created_at_utc: fiscalYear.createdAtUtc,
    modified_at_utc: fiscalYear.updatedAtUtc,
    sync_version: 1,
    fee_rates: feeRates
      .filter(r => r.fiscalYear === fiscalYear.year)
      .map(r => feeRateToOnline(r)),
    _action: action,
  };
}

export function fiscalYearFromOnline(online: OnlineFiscalYear): Partial<FiscalYear> {
  return {
    year: online.year,
    openingCashBalance: online.opening_cash_balance,
    openingBankBalance: online.opening_bank_balance,
    isClosed: online.is_closed,
    createdAtUtc: online.created_at_utc,
    updatedAtUtc: online.modified_at_utc,
  };
}

// ===== Fee Rate Conversion =====

export function feeRateToOnline(feeRate: FeeRate, action: 'upsert' | 'delete' = 'upsert'): OnlineFeeRate {
  return {
    fiscal_year: feeRate.fiscalYear,
    member_type: feeRate.memberType,
    fee_amount: feeRate.feeAmount,
    sync_version: 1,
    _action: action,
  };
}

export function feeRateFromOnline(online: OnlineFeeRate): FeeRate {
  return {
    fiscalYear: online.fiscal_year,
    memberType: online.member_type as 'ADULT' | 'CHILD' | 'CHILD_PLUS',
    feeAmount: online.fee_amount,
  };
}

// ===== Posting Category Conversion =====

export function postingCategoryToOnline(
  category: PostingCategory,
  action: 'upsert' | 'delete' = 'upsert'
): OnlinePostingCategory {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    sort_order: category.sortOrder,
    is_active: category.isActive,
    created_at_utc: category.createdAtUtc,
    modified_at_utc: category.updatedAtUtc,
    sync_version: 1,
    _action: action,
  };
}

export function postingCategoryFromOnline(online: OnlinePostingCategory): Partial<PostingCategory> {
  return {
    id: online.id,
    name: online.name,
    description: online.description,
    sortOrder: online.sort_order,
    isActive: online.is_active,
    createdAtUtc: online.created_at_utc,
    updatedAtUtc: online.modified_at_utc,
  };
}

// ===== Transaction Line Conversion =====

export function transactionLineToOnline(
  line: TransactionLine,
  action: 'upsert' | 'delete' = 'upsert'
): OnlineTransactionLine {
  return {
    id: line.id,
    transaction_id: line.transactionId,
    category_id: line.categoryId,
    amount: line.amount,
    is_income: line.isIncome,
    member_id: line.memberId,
    line_description: line.lineDescription,
    sync_version: 1,
    _action: action,
  };
}

export function transactionLineFromOnline(online: OnlineTransactionLine): TransactionLine {
  return {
    id: online.id,
    transactionId: online.transaction_id,
    categoryId: online.category_id,
    amount: online.amount,
    isIncome: online.is_income,
    memberId: online.member_id,
    lineDescription: online.line_description,
  };
}

// ===== Pending Fee Payment Conversion =====

export function pendingFeePaymentToOnline(
  payment: PendingFeePayment,
  action: 'upsert' | 'delete' = 'upsert'
): OnlinePendingFeePayment {
  return {
    id: payment.id,
    fiscal_year: payment.fiscalYear,
    member_id: payment.memberId,
    amount: payment.amount,
    payment_date: payment.paymentDate,
    payment_method: payment.paymentMethod,
    notes: payment.notes,
    is_consolidated: payment.isConsolidated,
    consolidated_transaction_id: payment.consolidatedTransactionId,
    created_at_utc: payment.createdAtUtc,
    modified_at_utc: payment.updatedAtUtc,
    sync_version: 1,
    _action: action,
  };
}

export function pendingFeePaymentFromOnline(online: OnlinePendingFeePayment): Partial<PendingFeePayment> {
  return {
    id: online.id,
    fiscalYear: online.fiscal_year,
    memberId: online.member_id,
    amount: online.amount,
    paymentDate: online.payment_date,
    paymentMethod: online.payment_method as 'CASH' | 'BANK',
    notes: online.notes,
    isConsolidated: online.is_consolidated,
    consolidatedTransactionId: online.consolidated_transaction_id,
    createdAtUtc: online.created_at_utc,
    updatedAtUtc: online.modified_at_utc,
  };
}

// ===== Equipment Conversion Functions =====

export function equipmentItemToOnline(
  item: EquipmentItem,
  action: 'upsert' | 'delete' = 'upsert'
): OnlineEquipmentItem {
  return {
    id: item.id,
    serial_number: item.serialNumber,
    name: item.name,
    description: item.description,
    equipment_type: item.type || item.equipmentType || 'TRAINING_MATERIAL',
    status: item.status,
    discipline: item.notes || null, // Using notes field for discipline
    device_id: item.deviceId || item.createdByDeviceId || 'laptop-master',
    created_at_utc: item.createdAtUtc,
    modified_at_utc: item.modifiedAtUtc,
    sync_version: item.syncVersion,
    _action: action,
    _deleted: action === 'delete',
  };
}

export function equipmentItemFromOnline(online: OnlineEquipmentItem): Partial<EquipmentItem> {
  return {
    id: online.id,
    serialNumber: online.serial_number,
    name: online.name,
    description: online.description,
    type: (online.equipment_type as EquipmentItem['type']) || 'TRAINING_MATERIAL',
    equipmentType: (online.equipment_type as EquipmentItem['type']) || 'TRAINING_MATERIAL',
    status: online.status as EquipmentItem['status'],
    notes: online.discipline,
    deviceId: online.device_id,
    createdByDeviceId: online.device_id,
    createdAtUtc: online.created_at_utc,
    modifiedAtUtc: online.modified_at_utc,
    syncVersion: online.sync_version,
  };
}

export function equipmentCheckoutToOnline(
  checkout: EquipmentCheckout,
  action: 'upsert' | 'delete' = 'upsert'
): OnlineEquipmentCheckout {
  return {
    id: checkout.id,
    equipment_id: checkout.equipmentId,
    internal_member_id: checkout.internalMemberId,
    membership_id: checkout.membershipId,
    checked_out_at_utc: checkout.checkedOutAtUtc,
    checked_in_at_utc: checkout.checkedInAtUtc,
    checked_out_by_device_id: checkout.checkedOutByDeviceId,
    checked_in_by_device_id: checkout.checkedInByDeviceId,
    checkout_notes: checkout.checkoutNotes,
    checkin_notes: checkout.checkinNotes,
    conflict_status: checkout.conflictStatus,
    device_id: checkout.deviceId,
    created_at_utc: checkout.createdAtUtc,
    modified_at_utc: checkout.modifiedAtUtc,
    sync_version: checkout.syncVersion,
    _action: action,
    _deleted: action === 'delete',
  };
}

export function equipmentCheckoutFromOnline(online: OnlineEquipmentCheckout): Partial<EquipmentCheckout> {
  return {
    id: online.id,
    equipmentId: online.equipment_id,
    internalMemberId: online.internal_member_id,
    membershipId: online.membership_id,
    checkedOutAtUtc: online.checked_out_at_utc,
    checkedInAtUtc: online.checked_in_at_utc,
    checkedOutByDeviceId: online.checked_out_by_device_id,
    checkedInByDeviceId: online.checked_in_by_device_id,
    checkoutNotes: online.checkout_notes,
    checkinNotes: online.checkin_notes,
    conflictStatus: online.conflict_status as EquipmentCheckout['conflictStatus'],
    deviceId: online.device_id,
    createdAtUtc: online.created_at_utc,
    modifiedAtUtc: online.modified_at_utc,
    syncVersion: online.sync_version,
  };
}

// ===== Trainer Conversion Functions =====

export function trainerInfoToOnline(
  info: TrainerInfo,
  action: 'upsert' | 'delete' = 'upsert'
): OnlineTrainerInfo {
  return {
    member_id: info.memberId,
    is_trainer: info.isTrainer,
    has_skydeleder_certificate: info.hasSkydelederCertificate,
    certified_date: info.certifiedDate,
    device_id: info.deviceId || 'laptop-master',
    created_at_utc: info.createdAtUtc,
    modified_at_utc: info.modifiedAtUtc,
    sync_version: info.syncVersion,
    _action: action,
    _deleted: action === 'delete',
  };
}

export function trainerInfoFromOnline(online: OnlineTrainerInfo): Partial<TrainerInfo> {
  return {
    memberId: online.member_id,
    isTrainer: online.is_trainer,
    hasSkydelederCertificate: online.has_skydeleder_certificate,
    certifiedDate: online.certified_date,
    deviceId: online.device_id,
    createdAtUtc: online.created_at_utc,
    modifiedAtUtc: online.modified_at_utc,
    syncVersion: online.sync_version,
  };
}

export function trainerDisciplineToOnline(
  discipline: TrainerDiscipline,
  action: 'upsert' | 'delete' = 'upsert'
): OnlineTrainerDiscipline {
  return {
    id: discipline.id,
    member_id: discipline.memberId,
    discipline: discipline.discipline,
    level: discipline.level,
    certified_date: discipline.certifiedDate,
    device_id: discipline.deviceId || 'laptop-master',
    created_at_utc: discipline.createdAtUtc,
    modified_at_utc: discipline.modifiedAtUtc,
    sync_version: discipline.syncVersion,
    _action: action,
    _deleted: action === 'delete',
  };
}

export function trainerDisciplineFromOnline(online: OnlineTrainerDiscipline): Partial<TrainerDiscipline> {
  return {
    id: online.id,
    memberId: online.member_id,
    discipline: online.discipline as TrainerDiscipline['discipline'],
    level: online.level as TrainerDiscipline['level'],
    certifiedDate: online.certified_date,
    deviceId: online.device_id,
    createdAtUtc: online.created_at_utc,
    modifiedAtUtc: online.modified_at_utc,
    syncVersion: online.sync_version,
  };
}

// ===== Singleton Export =====

export const onlineApiService = new OnlineApiService();
export default onlineApiService;
