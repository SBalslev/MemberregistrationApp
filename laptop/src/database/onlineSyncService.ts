/**
 * Online Sync Service
 *
 * Orchestrates synchronization between the local SQLite database and the
 * online MySQL database via the PHP API.
 *
 * Features:
 * - Full sync (initial) and incremental sync (changes since last sync)
 * - Batch processing with configurable batch size
 * - Last-edit-wins conflict resolution
 * - Delete handling with local confirmation
 * - Photo sync with deduplication
 * - Resumable sync for unstable networks
 *
 * @see /docs/features/online-database-sync/prd.md
 * @see /docs/features/online-database-sync/php-api-design.md
 */

import { query, execute, transaction } from './db';
import {
  onlineApiService,
  memberToOnline,
  memberFromOnline,
  checkInToOnline,
  checkInFromOnline,
  practiceSessionToOnline,
  practiceSessionFromOnline,
  financialTransactionToOnline,
  financialTransactionFromOnline,
  fiscalYearToOnline,
  fiscalYearFromOnline,
  feeRateFromOnline,
  postingCategoryToOnline,
  postingCategoryFromOnline,
  transactionLineToOnline,
  transactionLineFromOnline,
  pendingFeePaymentToOnline,
  pendingFeePaymentFromOnline,
  equipmentItemToOnline,
  equipmentItemFromOnline,
  equipmentCheckoutToOnline,
  equipmentCheckoutFromOnline,
  trainerInfoToOnline,
  trainerInfoFromOnline,
  trainerDisciplineToOnline,
  trainerDisciplineFromOnline,
  scanEventToOnline,
  scanEventFromOnline,
  memberPreferenceToOnline,
  memberPreferenceFromOnline,
  newMemberRegistrationToOnline,
  newMemberRegistrationFromOnline,
  skvRegistrationToOnline,
  skvRegistrationFromOnline,
  skvWeaponToOnline,
  skvWeaponFromOnline,
  type SyncPushPayload,
  type SyncPullResult,
  type OnlineMember,
  type OnlineCheckIn,
  type OnlinePracticeSession,
  type OnlineFinancialTransaction,
  type OnlinePostingCategory,
  type OnlineFiscalYear,
  type OnlineFeeRate,
  type OnlineTransactionLine,
  type OnlinePendingFeePayment,
  type OnlineEquipmentItem,
  type OnlineEquipmentCheckout,
  type OnlineTrainerInfo,
  type OnlineTrainerDiscipline,
  type OnlineScanEvent,
  type OnlineMemberPreference,
  type OnlinePhotoMetadata,
  type OnlineNewMemberRegistration,
  type OnlineSkvRegistration,
  type OnlineSkvWeapon,
  type EntityCounts,
  SchemaVersionError,
  ConflictError,
} from './onlineApiService';
import { SYNC_SCHEMA_VERSION } from './syncService';
import type { Member, CheckIn, PracticeSession, EquipmentItem, EquipmentCheckout, ScanEvent, MemberPreference, NewMemberRegistration } from '../types/entities';
import type { TrainerInfo, TrainerDiscipline } from './trainerRepository';
import type { SkvRegistration, SkvWeapon } from './skvRepository';
import type {
  FinancialTransaction,
  FiscalYear,
  FeeRate,
  PostingCategory,
  TransactionLine,
  PendingFeePayment,
} from '../types/finance';
import type { SqlValue } from 'sql.js';

// Helper to convert undefined to null for SQL parameters
function toSqlValue(value: unknown): SqlValue {
  return value === undefined ? null : (value as SqlValue);
}

// ===== Configuration =====

const DEFAULT_BATCH_SIZE = 50;
const SYNC_STATE_KEY = 'onlineSyncState';

// ===== Types =====

export interface OnlineSyncState {
  lastSyncTime: string | null;
  lastPushTime: string | null;
  lastPullTime: string | null;
  lastBatchId: string | null;
  pendingDeletes: PendingDelete[];
  syncInProgress: boolean;
  error: string | null;
}

export interface PendingDelete {
  entityType: string;
  entityId: string;
  deletedAt: string;
  confirmedAt?: string;
}

export interface OnlineSyncProgress {
  phase: 'checking' | 'pushing' | 'pulling' | 'photos' | 'deletes' | 'complete' | 'error';
  message: string;
  current: number;
  total: number;
  details?: string;
}

export interface SyncVerificationResult {
  success: boolean;
  error?: string;
  localCounts: EntityCounts;
  remoteCounts: EntityCounts | null;
  discrepancies: SyncDiscrepancy[];
  allMatch: boolean;
}

export interface SyncDiscrepancy {
  table: keyof EntityCounts;
  localCount: number;
  remoteCount: number;
  difference: number;
}

export interface OnlineSyncResult {
  success: boolean;
  pushed: {
    members: number;
    checkIns: number;
    practiceSessions: number;
    equipmentItems: number;
    equipmentCheckouts: number;
    trainerInfos: number;
    trainerDisciplines: number;
    financialTransactions: number;
    transactionLines: number;
    photos: number;
    scanEvents?: number;
    memberPreferences?: number;
    newMemberRegistrations?: number;
    skvRegistrations?: number;
    skvWeapons?: number;
  };
  pulled: {
    members: number;
    checkIns: number;
    practiceSessions: number;
    equipmentItems: number;
    equipmentCheckouts: number;
    trainerInfos: number;
    trainerDisciplines: number;
    financialTransactions: number;
    transactionLines: number;
    photos: number;
    scanEvents?: number;
    memberPreferences?: number;
    newMemberRegistrations?: number;
    skvRegistrations?: number;
    skvWeapons?: number;
  };
  deleted: {
    members: number;
    checkIns: number;
    practiceSessions: number;
  };
  conflicts: number;
  pendingDeletes: number;
  duration: number;
  error?: string;
}

export type OnlineSyncProgressCallback = (progress: OnlineSyncProgress) => void;

// ===== State Management =====

function loadSyncState(): OnlineSyncState {
  try {
    const saved = localStorage.getItem(SYNC_STATE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Fall through to default
  }
  return {
    lastSyncTime: null,
    lastPushTime: null,
    lastPullTime: null,
    lastBatchId: null,
    pendingDeletes: [],
    syncInProgress: false,
    error: null,
  };
}

function saveSyncState(state: OnlineSyncState): void {
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
}

// ===== Sync Service Implementation =====

class OnlineSyncService {
  private state: OnlineSyncState;
  private abortController: AbortController | null = null;

  constructor() {
    this.state = loadSyncState();
    // Reset syncInProgress on load (in case of crash)
    if (this.state.syncInProgress) {
      this.state.syncInProgress = false;
      saveSyncState(this.state);
    }
  }

  /**
   * Get current sync state.
   */
  getState(): OnlineSyncState {
    return { ...this.state };
  }

  /**
   * Check if a sync is currently in progress.
   */
  isSyncing(): boolean {
    return this.state.syncInProgress;
  }

  /**
   * Cancel an in-progress sync.
   */
  cancelSync(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.state.syncInProgress = false;
    saveSyncState(this.state);
  }

  /**
   * Perform a full sync with the online database.
   */
  async sync(
    options: {
      fullSync?: boolean;
      batchSize?: number;
      onProgress?: OnlineSyncProgressCallback;
    } = {}
  ): Promise<OnlineSyncResult> {
    const { fullSync = false, batchSize = DEFAULT_BATCH_SIZE, onProgress } = options;
    const startTime = Date.now();

    // Initialize result
    const result: OnlineSyncResult = {
      success: false,
      pushed: {
        members: 0,
        checkIns: 0,
        practiceSessions: 0,
        equipmentItems: 0,
        equipmentCheckouts: 0,
        trainerInfos: 0,
        trainerDisciplines: 0,
        financialTransactions: 0,
        transactionLines: 0,
        photos: 0,
      },
      pulled: {
        members: 0,
        checkIns: 0,
        practiceSessions: 0,
        equipmentItems: 0,
        equipmentCheckouts: 0,
        trainerInfos: 0,
        trainerDisciplines: 0,
        financialTransactions: 0,
        transactionLines: 0,
        photos: 0,
      },
      deleted: {
        members: 0,
        checkIns: 0,
        practiceSessions: 0,
      },
      conflicts: 0,
      pendingDeletes: 0,
      duration: 0,
    };

    // Check if already syncing
    if (this.state.syncInProgress) {
      result.error = 'Sync already in progress';
      return result;
    }

    // Check authentication
    if (!onlineApiService.isAuthenticated()) {
      result.error = 'Not authenticated';
      return result;
    }

    // Setup abort controller
    this.abortController = new AbortController();
    this.state.syncInProgress = true;
    this.state.error = null;
    saveSyncState(this.state);

    try {
      // Phase 1: Check schema compatibility
      onProgress?.({
        phase: 'checking',
        message: 'Tjekker schema-kompatibilitet...',
        current: 0,
        total: 1,
      });

      const compatibility = await onlineApiService.checkSchemaCompatibility(SYNC_SCHEMA_VERSION);
      if (!compatibility.compatible) {
        throw new SchemaVersionError(SYNC_SCHEMA_VERSION, compatibility.serverVersion);
      }

      // Phase 2: Push local changes
      onProgress?.({
        phase: 'pushing',
        message: 'Sender lokale endringer...',
        current: 0,
        total: 1,
      });

      const pushResult = await this.pushChanges(batchSize, fullSync, onProgress);
      result.pushed = pushResult.pushed;
      result.conflicts = pushResult.conflicts;

      // Update last push time
      this.state.lastPushTime = new Date().toISOString();
      saveSyncState(this.state);

      // Phase 3: Pull remote changes
      onProgress?.({
        phase: 'pulling',
        message: 'Henter endringer fra server...',
        current: 0,
        total: 1,
      });

      const sinceTime = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPullTime || '1970-01-01T00:00:00Z';
      const pullResult = await this.pullChanges(sinceTime, onProgress);
      result.pulled = pullResult.pulled;
      result.deleted = pullResult.deleted;
      result.pendingDeletes = pullResult.pendingDeletes;

      // Update last pull time
      this.state.lastPullTime = new Date().toISOString();
      saveSyncState(this.state);

      // Phase 4: Complete
      onProgress?.({
        phase: 'complete',
        message: 'Synkronisering faerdig',
        current: 1,
        total: 1,
      });

      result.success = true;
      this.state.lastSyncTime = new Date().toISOString();
      this.state.error = null;
      saveSyncState(this.state);

    } catch (error) {
      console.error('[OnlineSyncService] Sync error:', error);

      onProgress?.({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Sync fejlede',
        current: 0,
        total: 1,
      });

      result.error = error instanceof Error ? error.message : 'Sync fejlede';
      this.state.error = result.error;
      saveSyncState(this.state);

      if (error instanceof SchemaVersionError) {
        result.error = `Schema version mismatch: local ${error.localVersion}, server ${error.serverVersion}`;
      } else if (error instanceof ConflictError) {
        result.conflicts = error.conflicts.length;
        result.error = `${error.conflicts.length} conflicts detected`;
      }
    } finally {
      this.state.syncInProgress = false;
      this.abortController = null;
      saveSyncState(this.state);
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Push local changes to the online database.
   */
  private async pushChanges(
    batchSize: number,
    fullSync: boolean,
    onProgress?: OnlineSyncProgressCallback
  ): Promise<{
    pushed: OnlineSyncResult['pushed'];
    conflicts: number;
  }> {
    const pushed: OnlineSyncResult['pushed'] = {
      members: 0,
      checkIns: 0,
      practiceSessions: 0,
      equipmentItems: 0,
      equipmentCheckouts: 0,
      trainerInfos: 0,
      trainerDisciplines: 0,
      financialTransactions: 0,
      transactionLines: 0,
      photos: 0,
    };
    let conflicts = 0;

    // Get device ID
    const deviceId = await this.getDeviceId();

    // Collect entities to push
    const members = this.getModifiedMembers(fullSync);
    const checkIns = this.getModifiedCheckIns(fullSync);
    const practiceSessions = this.getModifiedPracticeSessions(fullSync);
    const financialTransactions = this.getModifiedFinancialTransactions(fullSync);
    const fiscalYears = this.getModifiedFiscalYears(fullSync);
    const postingCategories = this.getModifiedPostingCategories(fullSync);
    const transactionLines = this.getModifiedTransactionLines(fullSync);
    const pendingFeePayments = this.getModifiedPendingFeePayments(fullSync);
    const equipmentItems = this.getModifiedEquipmentItems(fullSync);
    const equipmentCheckouts = this.getModifiedEquipmentCheckouts(fullSync);
    const trainerInfos = this.getModifiedTrainerInfos(fullSync);
    const trainerDisciplines = this.getModifiedTrainerDisciplines(fullSync);

    const totalEntities =
      members.length + checkIns.length + practiceSessions.length + financialTransactions.length +
      fiscalYears.length + postingCategories.length + transactionLines.length + pendingFeePayments.length +
      equipmentItems.length + equipmentCheckouts.length + trainerInfos.length + trainerDisciplines.length;

    if (totalEntities === 0) {
      return { pushed, conflicts };
    }

    // Push in batches
    let processedCount = 0;

    // Push members
    for (let i = 0; i < members.length; i += batchSize) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }

      const batch = members.slice(i, i + batchSize);
      const batchId = crypto.randomUUID();

      onProgress?.({
        phase: 'pushing',
        message: `Sender medlemmer (${i + 1}-${Math.min(i + batchSize, members.length)} af ${members.length})...`,
        current: processedCount,
        total: totalEntities,
        details: `Batch ${Math.floor(i / batchSize) + 1}`,
      });

      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          members: batch.map((m) => memberToOnline(m)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.members += result.processed?.members?.inserted || 0;
        pushed.members += result.processed?.members?.updated || 0;
        conflicts += result.conflicts?.length || 0;
      } catch (error) {
        if (error instanceof ConflictError) {
          conflicts += error.conflicts?.length || 0;
        } else {
          throw error;
        }
      }

      processedCount += batch.length;
    }

    // Push check-ins
    for (let i = 0; i < checkIns.length; i += batchSize) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }

      const batch = checkIns.slice(i, i + batchSize);
      const batchId = crypto.randomUUID();

      onProgress?.({
        phase: 'pushing',
        message: `Sender check-ins (${i + 1}-${Math.min(i + batchSize, checkIns.length)} af ${checkIns.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          checkIns: batch.map((c) => checkInToOnline(c, deviceId)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.checkIns += result.processed.check_ins?.inserted || 0;
        pushed.checkIns += result.processed.check_ins?.updated || 0;
      } catch (error) {
        if (error instanceof ConflictError) {
          conflicts += error.conflicts.length;
        } else {
          throw error;
        }
      }

      processedCount += batch.length;
    }

    // Push practice sessions
    for (let i = 0; i < practiceSessions.length; i += batchSize) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }

      const batch = practiceSessions.slice(i, i + batchSize);
      const batchId = crypto.randomUUID();

      onProgress?.({
        phase: 'pushing',
        message: `Sender traningssessioner (${i + 1}-${Math.min(i + batchSize, practiceSessions.length)} af ${practiceSessions.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          practiceSessions: batch.map((s) => practiceSessionToOnline(s, deviceId)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.practiceSessions += result.processed.practice_sessions?.inserted || 0;
        pushed.practiceSessions += result.processed.practice_sessions?.updated || 0;
      } catch (error) {
        if (error instanceof ConflictError) {
          conflicts += error.conflicts.length;
        } else {
          throw error;
        }
      }

      processedCount += batch.length;
    }

    // Push financial transactions
    for (let i = 0; i < financialTransactions.length; i += batchSize) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }

      const batch = financialTransactions.slice(i, i + batchSize);
      const batchId = crypto.randomUUID();

      onProgress?.({
        phase: 'pushing',
        message: `Sender transaktioner (${i + 1}-${Math.min(i + batchSize, financialTransactions.length)} af ${financialTransactions.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          financialTransactions: batch.map((t) => financialTransactionToOnline(t)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.financialTransactions += result.processed.financial_transactions?.inserted || 0;
        pushed.financialTransactions += result.processed.financial_transactions?.updated || 0;
      } catch (error) {
        if (error instanceof ConflictError) {
          conflicts += error.conflicts?.length || 0;
        } else {
          throw error;
        }
      }

      processedCount += batch.length;
    }

    // Push fiscal years (with fee rates embedded)
    if (fiscalYears.length > 0) {
      onProgress?.({
        phase: 'pushing',
        message: `Sender regnskabsår (${fiscalYears.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const batchId = crypto.randomUUID();
      const fiscalYearsWithRates = fiscalYears.map(fy => {
        const feeRates = this.getFeeRatesForYear(fy.year);
        return fiscalYearToOnline(fy, feeRates);
      });

      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          fiscalYears: fiscalYearsWithRates,
        },
      };

      try {
        await onlineApiService.push(payload);
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }

      processedCount += fiscalYears.length;
    }

    // Push posting categories
    if (postingCategories.length > 0) {
      onProgress?.({
        phase: 'pushing',
        message: `Sender posteringskategorier (${postingCategories.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const batchId = crypto.randomUUID();
      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          postingCategories: postingCategories.map(c => postingCategoryToOnline(c)),
        },
      };

      try {
        await onlineApiService.push(payload);
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }

      processedCount += postingCategories.length;
    }

    // Push transaction lines
    for (let i = 0; i < transactionLines.length; i += batchSize) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }

      const batch = transactionLines.slice(i, i + batchSize);
      const batchId = crypto.randomUUID();

      onProgress?.({
        phase: 'pushing',
        message: `Sender posteringslinjer (${i + 1}-${Math.min(i + batchSize, transactionLines.length)} af ${transactionLines.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          transactionLines: batch.map(l => transactionLineToOnline(l)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.transactionLines += result.processed.transaction_lines?.inserted || 0;
        pushed.transactionLines += result.processed.transaction_lines?.updated || 0;
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }

      processedCount += batch.length;
    }

    // Push pending fee payments
    if (pendingFeePayments.length > 0) {
      onProgress?.({
        phase: 'pushing',
        message: `Sender afventende betalinger (${pendingFeePayments.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const batchId = crypto.randomUUID();
      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          pendingFeePayments: pendingFeePayments.map(p => pendingFeePaymentToOnline(p)),
        },
      };

      try {
        await onlineApiService.push(payload);
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }

      processedCount += pendingFeePayments.length;
    }

    // Push equipment items
    for (let i = 0; i < equipmentItems.length; i += batchSize) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }

      const batch = equipmentItems.slice(i, i + batchSize);
      const batchId = crypto.randomUUID();

      onProgress?.({
        phase: 'pushing',
        message: `Sender udstyr (${i + 1}-${Math.min(i + batchSize, equipmentItems.length)} af ${equipmentItems.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          equipmentItems: batch.map(item => equipmentItemToOnline(item)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.equipmentItems += result.processed.equipment_items?.inserted || 0;
        pushed.equipmentItems += result.processed.equipment_items?.updated || 0;
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }

      processedCount += batch.length;
    }

    // Push equipment checkouts
    for (let i = 0; i < equipmentCheckouts.length; i += batchSize) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }

      const batch = equipmentCheckouts.slice(i, i + batchSize);
      const batchId = crypto.randomUUID();

      onProgress?.({
        phase: 'pushing',
        message: `Sender udstyrsudlån (${i + 1}-${Math.min(i + batchSize, equipmentCheckouts.length)} af ${equipmentCheckouts.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          equipmentCheckouts: batch.map(checkout => equipmentCheckoutToOnline(checkout)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.equipmentCheckouts += result.processed.equipment_checkouts?.inserted || 0;
        pushed.equipmentCheckouts += result.processed.equipment_checkouts?.updated || 0;
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }

      processedCount += batch.length;
    }

    // Push trainer infos
    if (trainerInfos.length > 0) {
      onProgress?.({
        phase: 'pushing',
        message: `Sender trænere (${trainerInfos.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const batchId = crypto.randomUUID();
      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          trainerInfos: trainerInfos.map(info => trainerInfoToOnline(info)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.trainerInfos += result.processed.trainer_infos?.inserted || 0;
        pushed.trainerInfos += result.processed.trainer_infos?.updated || 0;
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }

      processedCount += trainerInfos.length;
    }

    // Push trainer disciplines
    if (trainerDisciplines.length > 0) {
      onProgress?.({
        phase: 'pushing',
        message: `Sender trænerkvalifikationer (${trainerDisciplines.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const batchId = crypto.randomUUID();
      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          trainerDisciplines: trainerDisciplines.map(discipline => trainerDisciplineToOnline(discipline)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.trainerDisciplines += result.processed.trainer_disciplines?.inserted || 0;
        pushed.trainerDisciplines += result.processed.trainer_disciplines?.updated || 0;
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }

      processedCount += trainerDisciplines.length;
    }

    // Push scan events
    const scanEvents = this.getModifiedScanEvents(fullSync);
    if (scanEvents.length > 0) {
      onProgress?.({
        phase: 'pushing',
        message: `Sender scan events (${scanEvents.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const batchId = crypto.randomUUID();
      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          scanEvents: scanEvents.map(e => scanEventToOnline(e)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.scanEvents = (pushed.scanEvents || 0) + (result.processed.scan_events?.inserted || 0);
        pushed.scanEvents = (pushed.scanEvents || 0) + (result.processed.scan_events?.updated || 0);
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }

      processedCount += scanEvents.length;
    }

    // Push member preferences
    const memberPreferences = this.getModifiedMemberPreferences(fullSync);
    if (memberPreferences.length > 0) {
      onProgress?.({
        phase: 'pushing',
        message: `Sender præferencer (${memberPreferences.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const batchId = crypto.randomUUID();
      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          memberPreferences: memberPreferences.map(p => memberPreferenceToOnline(p)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.memberPreferences = (pushed.memberPreferences || 0) + (result.processed.member_preferences?.inserted || 0);
        pushed.memberPreferences = (pushed.memberPreferences || 0) + (result.processed.member_preferences?.updated || 0);
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }

      processedCount += memberPreferences.length;
    }

    // Push new member registrations
    const newMemberRegistrations = this.getModifiedNewMemberRegistrations(fullSync);
    if (newMemberRegistrations.length > 0) {
      onProgress?.({
        phase: 'pushing',
        message: `Sender nye registreringer (${newMemberRegistrations.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const batchId = crypto.randomUUID();
      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          newMemberRegistrations: newMemberRegistrations.map(r => newMemberRegistrationToOnline(r)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.newMemberRegistrations = (pushed.newMemberRegistrations || 0) + (result.processed.new_member_registrations?.inserted || 0);
        pushed.newMemberRegistrations = (pushed.newMemberRegistrations || 0) + (result.processed.new_member_registrations?.updated || 0);
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }

      processedCount += newMemberRegistrations.length;
    }

    // Push SKV registrations
    const skvRegistrations = this.getModifiedSkvRegistrations(fullSync);
    if (skvRegistrations.length > 0) {
      onProgress?.({
        phase: 'pushing',
        message: `Sender SKV-registreringer (${skvRegistrations.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const batchId = crypto.randomUUID();
      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          skvRegistrations: skvRegistrations.map(r => skvRegistrationToOnline(r)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.skvRegistrations = (pushed.skvRegistrations || 0) + (result.processed.skv_registrations?.inserted || 0);
        pushed.skvRegistrations = (pushed.skvRegistrations || 0) + (result.processed.skv_registrations?.updated || 0);
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }

      processedCount += skvRegistrations.length;
    }

    // Push SKV weapons
    const skvWeapons = this.getModifiedSkvWeapons(fullSync);
    if (skvWeapons.length > 0) {
      onProgress?.({
        phase: 'pushing',
        message: `Sender SKV-våben (${skvWeapons.length})...`,
        current: processedCount,
        total: totalEntities,
      });

      const batchId = crypto.randomUUID();
      const payload: SyncPushPayload = {
        deviceId,
        batchId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          skvWeapons: skvWeapons.map(w => skvWeaponToOnline(w)),
        },
      };

      try {
        const result = await onlineApiService.push(payload);
        pushed.skvWeapons = (pushed.skvWeapons || 0) + (result.processed.skv_weapons?.inserted || 0);
        pushed.skvWeapons = (pushed.skvWeapons || 0) + (result.processed.skv_weapons?.updated || 0);
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }

      processedCount += skvWeapons.length;
    }

    // Push photos
    const membersWithPhotos = this.getMembersWithPhotos(fullSync);
    if (membersWithPhotos.length > 0) {
      onProgress?.({
        phase: 'photos',
        message: `Sender fotos (${membersWithPhotos.length})...`,
        current: 0,
        total: membersWithPhotos.length,
      });

      const electronAPI = (window as unknown as { electronAPI?: { readPhoto?: (id: string) => Promise<{ success: boolean; base64Data?: string; contentHash?: string; sizeBytes?: number; error?: string }> } }).electronAPI;

      if (electronAPI?.readPhoto) {
        for (let i = 0; i < membersWithPhotos.length; i++) {
          if (this.abortController?.signal.aborted) {
            throw new Error('Sync cancelled');
          }

          const member = membersWithPhotos[i];

          onProgress?.({
            phase: 'photos',
            message: `Sender foto ${i + 1} af ${membersWithPhotos.length}...`,
            current: i,
            total: membersWithPhotos.length,
          });

          try {
            let base64Data: string | null = null;
            let contentHash: string | null = null;

            // Helper to extract base64 from data URL and generate SHA256 hash
            const extractDataUrl = async (dataUrl: string): Promise<{ base64: string; hash: string }> => {
              const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
              const binaryStr = atob(base64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let k = 0; k < binaryStr.length; k++) {
                bytes[k] = binaryStr.charCodeAt(k);
              }
              // Use Web Crypto API for SHA256 hash (matches server-side)
              const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
              return { base64, hash };
            };

            // Check if photoPath is a data URL (stored directly in DB) or a file path
            if (member.photoPath?.startsWith('data:image')) {
              const extracted = await extractDataUrl(member.photoPath);
              base64Data = extracted.base64;
              contentHash = extracted.hash;
            } else if (member.photoPath) {
              // Try to read photo file from disk
              const photoResult = await electronAPI.readPhoto(member.internalId);
              if (photoResult.success && photoResult.base64Data && photoResult.contentHash) {
                base64Data = photoResult.base64Data;
                contentHash = photoResult.contentHash;
              }
            }

            // Fallback to data URL in photoThumbnail (may be full photo stored as data URL)
            if (!base64Data && member.photoThumbnail?.startsWith('data:image')) {
              const extracted = await extractDataUrl(member.photoThumbnail);
              base64Data = extracted.base64;
              contentHash = extracted.hash;
            }

            // Fallback to legacy registrationPhotoPath data URL
            if (!base64Data && (member as unknown as { registrationPhotoPath?: string }).registrationPhotoPath?.startsWith('data:image')) {
              const extracted = await extractDataUrl((member as unknown as { registrationPhotoPath: string }).registrationPhotoPath);
              base64Data = extracted.base64;
              contentHash = extracted.hash;
            }

            if (base64Data && contentHash) {
              // Convert base64 to Blob
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let j = 0; j < binaryString.length; j++) {
                bytes[j] = binaryString.charCodeAt(j);
              }
              const blob = new Blob([bytes], { type: 'image/jpeg' });

              console.log(`[OnlineSyncService] Uploading photo for ${member.internalId}, hash: ${contentHash}, size: ${bytes.length}`);

              // Upload to server
              const uploadResult = await onlineApiService.uploadPhoto(
                member.internalId,
                blob,
                contentHash
              );

              if ((uploadResult as { duplicate?: boolean }).duplicate) {
                console.log(`[OnlineSyncService] Photo already exists (duplicate detected by server)`);
              }
              pushed.photos++;
            } else {
              // No photo data found
              console.warn(`[OnlineSyncService] No photo data found for ${member.internalId}`);
              console.warn(`[OnlineSyncService] photoPath: ${member.photoPath}, photoThumbnail: ${member.photoThumbnail ? 'present' : 'null'}`);
            }
          } catch (error) {
            // Log but don't fail entire sync for photo errors
            console.error(`[OnlineSyncService] Photo sync error for ${member.internalId}:`, error);
          }
        }
      } else {
        console.warn('[OnlineSyncService] Photo read API not available - skipping photo sync');
      }
    }

    return { pushed, conflicts };
  }

  /**
   * Pull changes from the online database.
   */
  private async pullChanges(
    since: string,
    onProgress?: OnlineSyncProgressCallback
  ): Promise<{
    pulled: OnlineSyncResult['pulled'];
    deleted: OnlineSyncResult['deleted'];
    pendingDeletes: number;
  }> {
    const pulled: OnlineSyncResult['pulled'] = {
      members: 0,
      checkIns: 0,
      practiceSessions: 0,
      equipmentItems: 0,
      equipmentCheckouts: 0,
      trainerInfos: 0,
      trainerDisciplines: 0,
      financialTransactions: 0,
      transactionLines: 0,
      photos: 0,
    };
    const deleted: OnlineSyncResult['deleted'] = {
      members: 0,
      checkIns: 0,
      practiceSessions: 0,
    };

    let cursor = since;
    let totalPulled = 0;

    // Pull all changes with pagination
    while (true) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }

      onProgress?.({
        phase: 'pulling',
        message: `Henter endringer... (${totalPulled} hentet)`,
        current: totalPulled,
        total: totalPulled + 1, // Unknown total
      });

      const result: SyncPullResult = await onlineApiService.pull(cursor);

      // Process pulled entities
      // Note: PHP returns snake_case keys, access them with type assertion
      const entities = result.entities as unknown as Record<string, unknown[]>;

      transaction(() => {
        // Process members
        const members = entities['members'] as OnlineMember[] | undefined;
        if (members) {
          for (const member of members) {
            this.upsertMemberFromOnline(member);
            pulled.members++;
          }
        }

        // Process check-ins (PHP returns 'check_ins')
        const checkIns = entities['check_ins'] as OnlineCheckIn[] | undefined;
        if (checkIns) {
          for (const checkIn of checkIns) {
            this.upsertCheckInFromOnline(checkIn);
            pulled.checkIns++;
          }
        }

        // Process practice sessions (PHP returns 'practice_sessions')
        const practiceSessions = entities['practice_sessions'] as OnlinePracticeSession[] | undefined;
        if (practiceSessions) {
          for (const session of practiceSessions) {
            this.upsertPracticeSessionFromOnline(session);
            pulled.practiceSessions++;
          }
        }

        // Process financial transactions (PHP returns 'financial_transactions')
        const financialTransactions = entities['financial_transactions'] as OnlineFinancialTransaction[] | undefined;
        if (financialTransactions) {
          for (const txn of financialTransactions) {
            this.upsertFinancialTransactionFromOnline(txn);
            pulled.financialTransactions++;
          }
        }

        // Process equipment items (PHP returns 'equipment_items')
        const equipmentItems = entities['equipment_items'] as OnlineEquipmentItem[] | undefined;
        if (equipmentItems) {
          for (const item of equipmentItems) {
            this.upsertEquipmentItemFromOnline(item);
            pulled.equipmentItems++;
          }
        }

        // Process equipment checkouts (PHP returns 'equipment_checkouts')
        const equipmentCheckouts = entities['equipment_checkouts'] as OnlineEquipmentCheckout[] | undefined;
        if (equipmentCheckouts) {
          for (const checkout of equipmentCheckouts) {
            this.upsertEquipmentCheckoutFromOnline(checkout);
            pulled.equipmentCheckouts++;
          }
        }

        // Process trainer infos (PHP returns 'trainer_infos')
        const trainerInfos = entities['trainer_infos'] as OnlineTrainerInfo[] | undefined;
        if (trainerInfos) {
          for (const info of trainerInfos) {
            this.upsertTrainerInfoFromOnline(info);
            pulled.trainerInfos++;
          }
        }

        // Process trainer disciplines (PHP returns 'trainer_disciplines')
        const trainerDisciplines = entities['trainer_disciplines'] as OnlineTrainerDiscipline[] | undefined;
        if (trainerDisciplines) {
          for (const discipline of trainerDisciplines) {
            this.upsertTrainerDisciplineFromOnline(discipline);
            pulled.trainerDisciplines++;
          }
        }

        // Process posting categories (PHP returns 'posting_categories')
        const postingCategories = entities['posting_categories'] as OnlinePostingCategory[] | undefined;
        if (postingCategories) {
          for (const category of postingCategories) {
            this.upsertPostingCategoryFromOnline(category);
          }
        }

        // Process fiscal years (PHP returns 'fiscal_years')
        const fiscalYears = entities['fiscal_years'] as OnlineFiscalYear[] | undefined;
        if (fiscalYears) {
          for (const fiscalYear of fiscalYears) {
            this.upsertFiscalYearFromOnline(fiscalYear);
          }
        }

        // Process fee rates (PHP returns 'fee_rates')
        const feeRates = entities['fee_rates'] as OnlineFeeRate[] | undefined;
        if (feeRates) {
          for (const feeRate of feeRates) {
            this.upsertFeeRateFromOnline(feeRate);
          }
        }

        // Process transaction lines (PHP returns 'transaction_lines')
        const transactionLines = entities['transaction_lines'] as OnlineTransactionLine[] | undefined;
        if (transactionLines) {
          for (const line of transactionLines) {
            this.upsertTransactionLineFromOnline(line);
            pulled.transactionLines++;
          }
        }

        // Process pending fee payments (PHP returns 'pending_fee_payments')
        const pendingFeePayments = entities['pending_fee_payments'] as OnlinePendingFeePayment[] | undefined;
        if (pendingFeePayments) {
          for (const payment of pendingFeePayments) {
            this.upsertPendingFeePaymentFromOnline(payment);
          }
        }

        // Process scan events (PHP returns 'scan_events')
        const scanEvents = entities['scan_events'] as OnlineScanEvent[] | undefined;
        if (scanEvents) {
          for (const event of scanEvents) {
            this.upsertScanEventFromOnline(event);
            pulled.scanEvents = (pulled.scanEvents || 0) + 1;
          }
        }

        // Process member preferences (PHP returns 'member_preferences')
        const memberPreferences = entities['member_preferences'] as OnlineMemberPreference[] | undefined;
        if (memberPreferences) {
          for (const pref of memberPreferences) {
            this.upsertMemberPreferenceFromOnline(pref);
            pulled.memberPreferences = (pulled.memberPreferences || 0) + 1;
          }
        }

        // Process new member registrations (PHP returns 'new_member_registrations')
        const newMemberRegistrations = entities['new_member_registrations'] as OnlineNewMemberRegistration[] | undefined;
        if (newMemberRegistrations) {
          for (const reg of newMemberRegistrations) {
            this.upsertNewMemberRegistrationFromOnline(reg);
            pulled.newMemberRegistrations = (pulled.newMemberRegistrations || 0) + 1;
          }
        }

        // Process SKV registrations (PHP returns 'skv_registrations')
        const skvRegistrations = entities['skv_registrations'] as OnlineSkvRegistration[] | undefined;
        if (skvRegistrations) {
          for (const reg of skvRegistrations) {
            this.upsertSkvRegistrationFromOnline(reg);
            pulled.skvRegistrations = (pulled.skvRegistrations || 0) + 1;
          }
        }

        // Process SKV weapons (PHP returns 'skv_weapons')
        const skvWeapons = entities['skv_weapons'] as OnlineSkvWeapon[] | undefined;
        if (skvWeapons) {
          for (const weapon of skvWeapons) {
            this.upsertSkvWeaponFromOnline(weapon);
            pulled.skvWeapons = (pulled.skvWeapons || 0) + 1;
          }
        }

        // Process photos (PHP returns 'photos')
        // Note: This only processes metadata; actual photo files are not downloaded here.
        // Photos uploaded from this device will already exist locally.
        // Photo download from server can be implemented later for disaster recovery.
        const photos = entities['photos'] as OnlinePhotoMetadata[] | undefined;
        if (photos) {
          for (const _photo of photos) {
            // TODO: If photo doesn't exist locally, download it from server
            // For now, just count photos received from server
            pulled.photos++;
          }
        }
      });

      // Handle deletes - add to pending list for user confirmation
      // Note: PHP returns snake_case keys
      const deletedEntities = result.deleted as Record<string, string[]>;

      if (deletedEntities['members']) {
        for (const id of deletedEntities['members']) {
          this.addPendingDelete('member', id);
        }
      }
      if (deletedEntities['check_ins']) {
        for (const id of deletedEntities['check_ins']) {
          // Check-ins can be auto-deleted without confirmation
          this.deleteCheckIn(id);
          deleted.checkIns++;
        }
      }
      if (deletedEntities['practice_sessions']) {
        for (const id of deletedEntities['practice_sessions']) {
          // Practice sessions can be auto-deleted without confirmation
          this.deletePracticeSession(id);
          deleted.practiceSessions++;
        }
      }

      totalPulled += Object.values(result.entities).reduce(
        (sum, arr) => sum + (arr?.length || 0),
        0
      );

      if (!result.hasMore || !result.nextCursor) {
        break;
      }

      cursor = result.nextCursor;
    }

    return {
      pulled,
      deleted,
      pendingDeletes: this.state.pendingDeletes.filter((d) => !d.confirmedAt).length,
    };
  }

  // ===== Entity Queries =====

  private getModifiedMembers(fullSync: boolean): Member[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<Member>(
      `SELECT * FROM Member
       WHERE updatedAtUtc > ? OR syncedAtUtc IS NULL
       ORDER BY updatedAtUtc ASC`,
      [since]
    );
  }

  private getModifiedCheckIns(fullSync: boolean): CheckIn[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<CheckIn>(
      `SELECT * FROM CheckIn
       WHERE internalMemberId IS NOT NULL
         AND (createdAtUtc > ? OR syncedAtUtc IS NULL)
       ORDER BY createdAtUtc ASC`,
      [since]
    );
  }

  private getModifiedPracticeSessions(fullSync: boolean): PracticeSession[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<PracticeSession>(
      `SELECT * FROM PracticeSession
       WHERE internalMemberId IS NOT NULL
         AND (createdAtUtc > ? OR syncedAtUtc IS NULL)
       ORDER BY createdAtUtc ASC`,
      [since]
    );
  }

  private getModifiedFinancialTransactions(fullSync: boolean): FinancialTransaction[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<FinancialTransaction>(
      `SELECT * FROM FinancialTransaction
       WHERE updatedAtUtc > ?
       ORDER BY updatedAtUtc ASC`,
      [since]
    );
  }

  private getModifiedFiscalYears(fullSync: boolean): FiscalYear[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<FiscalYear>(
      `SELECT * FROM FiscalYear
       WHERE updatedAtUtc > ?
       ORDER BY year ASC`,
      [since]
    );
  }

  private getFeeRatesForYear(year: number): FeeRate[] {
    return query<FeeRate>(
      `SELECT * FROM FeeRate WHERE fiscalYear = ?`,
      [year]
    );
  }

  private getModifiedPostingCategories(fullSync: boolean): PostingCategory[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<PostingCategory>(
      `SELECT * FROM PostingCategory
       WHERE updatedAtUtc > ?
       ORDER BY sortOrder ASC`,
      [since]
    );
  }

  private getModifiedTransactionLines(fullSync: boolean): TransactionLine[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    // Get lines for transactions modified since the given time
    // Translate memberId (which might be membershipId) to internalId for online sync
    return query<TransactionLine>(
      `SELECT
         tl.id,
         tl.transactionId,
         tl.categoryId,
         tl.amount,
         tl.isIncome,
         tl.source,
         COALESCE(m.internalId, tl.memberId) as memberId,
         tl.lineDescription
       FROM TransactionLine tl
       JOIN FinancialTransaction ft ON tl.transactionId = ft.id
       LEFT JOIN Member m ON tl.memberId = m.membershipId OR tl.memberId = m.internalId
       WHERE ft.updatedAtUtc > ?
       ORDER BY ft.sequenceNumber ASC`,
      [since]
    );
  }

  private getModifiedPendingFeePayments(fullSync: boolean): PendingFeePayment[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    // Translate memberId (which might be membershipId) to internalId for online sync
    return query<PendingFeePayment>(
      `SELECT
         p.id,
         p.fiscalYear,
         COALESCE(m.internalId, p.memberId) as memberId,
         p.amount,
         p.paymentDate,
         p.paymentMethod,
         p.notes,
         p.isConsolidated,
         p.consolidatedTransactionId,
         p.createdAtUtc,
         p.updatedAtUtc
       FROM PendingFeePayment p
       LEFT JOIN Member m ON p.memberId = m.membershipId OR p.memberId = m.internalId
       WHERE p.updatedAtUtc > ?
       ORDER BY p.paymentDate ASC`,
      [since]
    );
  }

  private getModifiedEquipmentItems(fullSync: boolean): EquipmentItem[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<EquipmentItem>(
      `SELECT * FROM EquipmentItem
       WHERE modifiedAtUtc > ? OR syncedAtUtc IS NULL
       ORDER BY modifiedAtUtc ASC`,
      [since]
    );
  }

  private getModifiedEquipmentCheckouts(fullSync: boolean): EquipmentCheckout[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<EquipmentCheckout>(
      `SELECT * FROM EquipmentCheckout
       WHERE internalMemberId IS NOT NULL
         AND (modifiedAtUtc > ? OR syncedAtUtc IS NULL)
       ORDER BY checkedOutAtUtc ASC`,
      [since]
    );
  }

  private getModifiedTrainerInfos(fullSync: boolean): TrainerInfo[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<TrainerInfo>(
      `SELECT * FROM TrainerInfo
       WHERE memberId IS NOT NULL
         AND (modifiedAtUtc > ? OR syncedAtUtc IS NULL)
       ORDER BY modifiedAtUtc ASC`,
      [since]
    );
  }

  private getModifiedTrainerDisciplines(fullSync: boolean): TrainerDiscipline[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<TrainerDiscipline>(
      `SELECT * FROM TrainerDiscipline
       WHERE memberId IS NOT NULL
         AND (modifiedAtUtc > ? OR syncedAtUtc IS NULL)
       ORDER BY createdAtUtc ASC`,
      [since]
    );
  }

  private getMembersWithPhotos(fullSync: boolean): Member[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    // Get members that have a photo (either file path or data URL) and have been modified since last sync
    // Photos can be in: photoPath (file), photoThumbnail (data URL), or registrationPhotoPath (legacy data URL)
    return query<Member>(
      `SELECT * FROM Member
       WHERE (photoPath IS NOT NULL
              OR photoThumbnail LIKE 'data:image%'
              OR registrationPhotoPath LIKE 'data:image%')
         AND (updatedAtUtc > ? OR syncedAtUtc IS NULL)
       ORDER BY lastName, firstName`,
      [since]
    );
  }

  private getModifiedScanEvents(fullSync: boolean): ScanEvent[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<ScanEvent>(
      `SELECT * FROM ScanEvent
       WHERE internalMemberId IS NOT NULL
         AND (createdAtUtc > ? OR syncedAtUtc IS NULL)
       ORDER BY createdAtUtc ASC`,
      [since]
    );
  }

  private getModifiedMemberPreferences(fullSync: boolean): MemberPreference[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<MemberPreference>(
      `SELECT memberId, lastPracticeType, lastClassification, updatedAtUtc as modifiedAtUtc
       FROM MemberPreference
       WHERE updatedAtUtc > ?
       ORDER BY updatedAtUtc ASC`,
      [since]
    );
  }

  private getModifiedNewMemberRegistrations(fullSync: boolean): NewMemberRegistration[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<NewMemberRegistration>(
      `SELECT id, firstName, lastName, birthday, gender, email, phone, address, zipCode, city, notes,
              photoPath, guardianName, guardianPhone, guardianEmail,
              sourceDeviceId, sourceDeviceName, approvalStatus, approvedAtUtc, rejectedAtUtc,
              rejectionReason, createdMemberId, createdAtUtc, syncedAtUtc, syncVersion
       FROM NewMemberRegistration
       WHERE (syncedAtUtc IS NULL OR syncedAtUtc > ?)
       ORDER BY createdAtUtc ASC`,
      [since]
    );
  }

  private getModifiedSkvRegistrations(fullSync: boolean): SkvRegistration[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<SkvRegistration>(
      `SELECT id, memberId, skvLevel, status, lastApprovedDate, createdAtUtc, updatedAtUtc
       FROM SKVRegistration
       WHERE updatedAtUtc > ?
       ORDER BY updatedAtUtc ASC`,
      [since]
    );
  }

  private getModifiedSkvWeapons(fullSync: boolean): SkvWeapon[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<SkvWeapon>(
      `SELECT id, skvRegistrationId, model, description, serial, type, caliber,
              lastReviewedDate, createdAtUtc, updatedAtUtc
       FROM SKVWeapon
       WHERE updatedAtUtc > ?
       ORDER BY updatedAtUtc ASC`,
      [since]
    );
  }

  // ===== Entity Upserts =====

  private upsertMemberFromOnline(online: OnlineMember): void {
    const local = memberFromOnline(online);
    const now = new Date().toISOString();

    // Check if member exists
    const existing = query<{ internalId: string; updatedAtUtc: string }>(
      'SELECT internalId, updatedAtUtc FROM Member WHERE internalId = ?',
      [toSqlValue(local.internalId)]
    );

    if (existing.length > 0) {
      // Last-edit-wins: compare timestamps
      const localTime = new Date(existing[0].updatedAtUtc).getTime();
      const remoteTime = new Date(online.modified_at_utc).getTime();

      if (remoteTime <= localTime) {
        // Local is newer or same, skip
        return;
      }

      // Update existing member
      execute(
        `UPDATE Member SET
          membershipId = ?, memberLifecycleStage = ?, status = ?,
          firstName = ?, lastName = ?, birthDate = ?, gender = ?,
          email = ?, phone = ?, address = ?, zipCode = ?, city = ?,
          guardianName = ?, guardianPhone = ?, guardianEmail = ?,
          expiresOn = ?, memberType = ?, mergedIntoId = ?,
          updatedAtUtc = ?, syncedAtUtc = ?, syncVersion = ?
        WHERE internalId = ?`,
        [
          toSqlValue(local.membershipId),
          toSqlValue(local.memberLifecycleStage),
          toSqlValue(local.status),
          toSqlValue(local.firstName),
          toSqlValue(local.lastName),
          toSqlValue(local.birthDate),
          toSqlValue(local.gender),
          toSqlValue(local.email),
          toSqlValue(local.phone),
          toSqlValue(local.address),
          toSqlValue(local.zipCode),
          toSqlValue(local.city),
          toSqlValue(local.guardianName),
          toSqlValue(local.guardianPhone),
          toSqlValue(local.guardianEmail),
          toSqlValue(local.expiresOn),
          toSqlValue(local.memberType),
          toSqlValue(local.mergedIntoId),
          toSqlValue(local.updatedAtUtc),
          now,
          toSqlValue(local.syncVersion),
          toSqlValue(local.internalId),
        ]
      );
    } else {
      // Insert new member
      execute(
        `INSERT INTO Member (
          internalId, membershipId, memberLifecycleStage, status,
          firstName, lastName, birthDate, gender, email, phone,
          address, zipCode, city, guardianName, guardianPhone, guardianEmail,
          expiresOn, memberType, mergedIntoId,
          createdAtUtc, updatedAtUtc, syncedAtUtc, syncVersion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.internalId),
          toSqlValue(local.membershipId),
          toSqlValue(local.memberLifecycleStage),
          toSqlValue(local.status),
          toSqlValue(local.firstName),
          toSqlValue(local.lastName),
          toSqlValue(local.birthDate),
          toSqlValue(local.gender),
          toSqlValue(local.email),
          toSqlValue(local.phone),
          toSqlValue(local.address),
          toSqlValue(local.zipCode),
          toSqlValue(local.city),
          toSqlValue(local.guardianName),
          toSqlValue(local.guardianPhone),
          toSqlValue(local.guardianEmail),
          toSqlValue(local.expiresOn),
          toSqlValue(local.memberType),
          toSqlValue(local.mergedIntoId),
          toSqlValue(local.createdAtUtc),
          toSqlValue(local.updatedAtUtc),
          now,
          toSqlValue(local.syncVersion),
        ]
      );
    }
  }

  private upsertCheckInFromOnline(online: OnlineCheckIn): void {
    const local = checkInFromOnline(online);
    const now = new Date().toISOString();

    // Check-ins are insert-only, check if exists
    const existing = query<{ id: string }>(
      'SELECT id FROM CheckIn WHERE id = ?',
      [toSqlValue(local.id)]
    );

    if (existing.length === 0) {
      execute(
        `INSERT INTO CheckIn (
          id, internalMemberId, membershipId, localDate, createdAtUtc, syncedAtUtc, syncVersion
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.internalMemberId),
          toSqlValue(local.membershipId),
          toSqlValue(local.localDate),
          toSqlValue(local.createdAtUtc),
          now,
          toSqlValue(local.syncVersion),
        ]
      );
    }
  }

  private upsertPracticeSessionFromOnline(online: OnlinePracticeSession): void {
    const local = practiceSessionFromOnline(online);
    const now = new Date().toISOString();

    // Practice sessions are insert-only, check if exists
    const existing = query<{ id: string }>(
      'SELECT id FROM PracticeSession WHERE id = ?',
      [toSqlValue(local.id)]
    );

    if (existing.length === 0) {
      execute(
        `INSERT INTO PracticeSession (
          id, internalMemberId, membershipId, localDate, practiceType, classification,
          points, krydser, notes, createdAtUtc, syncedAtUtc, syncVersion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.internalMemberId),
          toSqlValue(local.membershipId),
          toSqlValue(local.localDate),
          toSqlValue(local.practiceType),
          toSqlValue(local.classification),
          toSqlValue(local.points),
          toSqlValue(local.krydser),
          toSqlValue(local.notes),
          toSqlValue(local.createdAtUtc),
          now,
          toSqlValue(local.syncVersion),
        ]
      );
    }
  }

  private upsertFinancialTransactionFromOnline(online: OnlineFinancialTransaction): void {
    const local = financialTransactionFromOnline(online);

    // Check if transaction exists
    const existing = query<{ id: string; updatedAtUtc: string }>(
      'SELECT id, updatedAtUtc FROM FinancialTransaction WHERE id = ?',
      [toSqlValue(local.id)]
    );

    if (existing.length > 0) {
      // Last-edit-wins: compare timestamps
      const localTime = new Date(existing[0].updatedAtUtc).getTime();
      const remoteTime = new Date(online.modified_at_utc).getTime();

      if (remoteTime <= localTime) {
        // Local is newer or same, skip
        return;
      }

      // Update existing transaction
      execute(
        `UPDATE FinancialTransaction SET
          fiscalYear = ?, sequenceNumber = ?, date = ?, description = ?,
          cashIn = ?, cashOut = ?, bankIn = ?, bankOut = ?,
          notes = ?, isDeleted = ?, updatedAtUtc = ?
        WHERE id = ?`,
        [
          toSqlValue(local.fiscalYear),
          toSqlValue(local.sequenceNumber),
          toSqlValue(local.date),
          toSqlValue(local.description),
          toSqlValue(local.cashIn),
          toSqlValue(local.cashOut),
          toSqlValue(local.bankIn),
          toSqlValue(local.bankOut),
          toSqlValue(local.notes),
          local.isDeleted ? 1 : 0,
          toSqlValue(local.updatedAtUtc),
          toSqlValue(local.id),
        ]
      );
    } else {
      // Insert new transaction
      execute(
        `INSERT INTO FinancialTransaction (
          id, fiscalYear, sequenceNumber, date, description,
          cashIn, cashOut, bankIn, bankOut, notes, isDeleted,
          createdAtUtc, updatedAtUtc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.fiscalYear),
          toSqlValue(local.sequenceNumber),
          toSqlValue(local.date),
          toSqlValue(local.description),
          toSqlValue(local.cashIn),
          toSqlValue(local.cashOut),
          toSqlValue(local.bankIn),
          toSqlValue(local.bankOut),
          toSqlValue(local.notes),
          local.isDeleted ? 1 : 0,
          toSqlValue(local.createdAtUtc),
          toSqlValue(local.updatedAtUtc),
        ]
      );
    }
  }

  private upsertEquipmentItemFromOnline(online: OnlineEquipmentItem): void {
    const local = equipmentItemFromOnline(online);
    const now = new Date().toISOString();

    // Check if equipment item exists
    const existing = query<{ id: string; modifiedAtUtc: string }>(
      'SELECT id, modifiedAtUtc FROM EquipmentItem WHERE id = ?',
      [toSqlValue(local.id)]
    );

    if (existing.length > 0) {
      // Last-edit-wins: compare timestamps
      const localTime = new Date(existing[0].modifiedAtUtc).getTime();
      const remoteTime = new Date(online.modified_at_utc).getTime();

      if (remoteTime <= localTime) {
        // Local is newer or same, skip
        return;
      }

      // Update existing equipment item
      execute(
        `UPDATE EquipmentItem SET
          serialNumber = ?, name = ?, description = ?, equipmentType = ?,
          status = ?, notes = ?, createdByDeviceId = ?,
          modifiedAtUtc = ?, syncedAtUtc = ?, syncVersion = ?
        WHERE id = ?`,
        [
          toSqlValue(local.serialNumber),
          toSqlValue(local.name),
          toSqlValue(local.description),
          toSqlValue(local.equipmentType),
          toSqlValue(local.status),
          toSqlValue(local.notes),
          toSqlValue(local.createdByDeviceId),
          toSqlValue(local.modifiedAtUtc),
          now,
          toSqlValue(local.syncVersion),
          toSqlValue(local.id),
        ]
      );
    } else {
      // Insert new equipment item
      execute(
        `INSERT INTO EquipmentItem (
          id, serialNumber, name, description, equipmentType, status, notes,
          createdByDeviceId, createdAtUtc, modifiedAtUtc, syncedAtUtc, syncVersion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.serialNumber),
          toSqlValue(local.name),
          toSqlValue(local.description),
          toSqlValue(local.equipmentType),
          toSqlValue(local.status),
          toSqlValue(local.notes),
          toSqlValue(local.createdByDeviceId),
          toSqlValue(local.createdAtUtc),
          toSqlValue(local.modifiedAtUtc),
          now,
          toSqlValue(local.syncVersion),
        ]
      );
    }
  }

  private upsertEquipmentCheckoutFromOnline(online: OnlineEquipmentCheckout): void {
    const local = equipmentCheckoutFromOnline(online);
    const now = new Date().toISOString();

    // Check if equipment checkout exists
    const existing = query<{ id: string; modifiedAtUtc: string }>(
      'SELECT id, modifiedAtUtc FROM EquipmentCheckout WHERE id = ?',
      [toSqlValue(local.id)]
    );

    if (existing.length > 0) {
      // Last-edit-wins: compare timestamps
      const localTime = new Date(existing[0].modifiedAtUtc).getTime();
      const remoteTime = new Date(online.modified_at_utc).getTime();

      if (remoteTime <= localTime) {
        // Local is newer or same, skip
        return;
      }

      // Update existing checkout (mostly for check-in updates)
      execute(
        `UPDATE EquipmentCheckout SET
          checkedInAtUtc = ?, checkedInByDeviceId = ?, checkinNotes = ?,
          conflictStatus = ?, modifiedAtUtc = ?, syncedAtUtc = ?, syncVersion = ?
        WHERE id = ?`,
        [
          toSqlValue(local.checkedInAtUtc),
          toSqlValue(local.checkedInByDeviceId),
          toSqlValue(local.checkinNotes),
          toSqlValue(local.conflictStatus),
          toSqlValue(local.modifiedAtUtc),
          now,
          toSqlValue(local.syncVersion),
          toSqlValue(local.id),
        ]
      );
    } else {
      // Insert new equipment checkout
      execute(
        `INSERT INTO EquipmentCheckout (
          id, equipmentId, internalMemberId, membershipId, checkedOutAtUtc, checkedInAtUtc,
          checkedOutByDeviceId, checkedInByDeviceId, checkoutNotes, checkinNotes,
          conflictStatus, deviceId, createdAtUtc, modifiedAtUtc, syncedAtUtc, syncVersion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.equipmentId),
          toSqlValue(local.internalMemberId),
          toSqlValue(local.membershipId),
          toSqlValue(local.checkedOutAtUtc),
          toSqlValue(local.checkedInAtUtc),
          toSqlValue(local.checkedOutByDeviceId),
          toSqlValue(local.checkedInByDeviceId),
          toSqlValue(local.checkoutNotes),
          toSqlValue(local.checkinNotes),
          toSqlValue(local.conflictStatus),
          toSqlValue(local.deviceId),
          toSqlValue(local.createdAtUtc),
          toSqlValue(local.modifiedAtUtc),
          now,
          toSqlValue(local.syncVersion),
        ]
      );
    }
  }

  private upsertTrainerInfoFromOnline(online: OnlineTrainerInfo): void {
    const local = trainerInfoFromOnline(online);
    const now = new Date().toISOString();

    // Check if trainer info exists
    const existing = query<{ memberId: string; modifiedAtUtc: string }>(
      'SELECT memberId, modifiedAtUtc FROM TrainerInfo WHERE memberId = ?',
      [toSqlValue(local.memberId)]
    );

    if (existing.length > 0) {
      // Last-edit-wins: compare timestamps
      const localTime = new Date(existing[0].modifiedAtUtc).getTime();
      const remoteTime = new Date(online.modified_at_utc).getTime();

      if (remoteTime <= localTime) {
        // Local is newer or same, skip
        return;
      }

      // Update existing trainer info
      execute(
        `UPDATE TrainerInfo SET
          isTrainer = ?, hasSkydelederCertificate = ?, certifiedDate = ?,
          deviceId = ?, modifiedAtUtc = ?, syncedAtUtc = ?, syncVersion = ?
        WHERE memberId = ?`,
        [
          local.isTrainer ? 1 : 0,
          local.hasSkydelederCertificate ? 1 : 0,
          toSqlValue(local.certifiedDate),
          toSqlValue(local.deviceId),
          toSqlValue(local.modifiedAtUtc),
          now,
          toSqlValue(local.syncVersion),
          toSqlValue(local.memberId),
        ]
      );
    } else {
      // Insert new trainer info
      execute(
        `INSERT INTO TrainerInfo (
          memberId, isTrainer, hasSkydelederCertificate, certifiedDate,
          createdAtUtc, modifiedAtUtc, deviceId, syncVersion, syncedAtUtc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.memberId),
          local.isTrainer ? 1 : 0,
          local.hasSkydelederCertificate ? 1 : 0,
          toSqlValue(local.certifiedDate),
          toSqlValue(local.createdAtUtc),
          toSqlValue(local.modifiedAtUtc),
          toSqlValue(local.deviceId),
          toSqlValue(local.syncVersion),
          now,
        ]
      );
    }
  }

  private upsertTrainerDisciplineFromOnline(online: OnlineTrainerDiscipline): void {
    const local = trainerDisciplineFromOnline(online);
    const now = new Date().toISOString();

    // Check if trainer discipline exists
    const existing = query<{ id: string; modifiedAtUtc: string }>(
      'SELECT id, modifiedAtUtc FROM TrainerDiscipline WHERE id = ?',
      [toSqlValue(local.id)]
    );

    if (existing.length > 0) {
      // Last-edit-wins: compare timestamps (use created_at_utc as fallback since online table has no modified_at_utc)
      const localTime = new Date(existing[0].modifiedAtUtc).getTime();
      const remoteTime = new Date(online.modified_at_utc || online.created_at_utc).getTime();

      if (remoteTime <= localTime) {
        // Local is newer or same, skip
        return;
      }

      // Update existing trainer discipline
      execute(
        `UPDATE TrainerDiscipline SET
          discipline = ?, level = ?, certifiedDate = ?,
          deviceId = ?, modifiedAtUtc = ?, syncedAtUtc = ?, syncVersion = ?
        WHERE id = ?`,
        [
          toSqlValue(local.discipline),
          toSqlValue(local.level),
          toSqlValue(local.certifiedDate),
          toSqlValue(local.deviceId),
          toSqlValue(local.modifiedAtUtc),
          now,
          toSqlValue(local.syncVersion),
          toSqlValue(local.id),
        ]
      );
    } else {
      // Insert new trainer discipline
      execute(
        `INSERT INTO TrainerDiscipline (
          id, memberId, discipline, level, certifiedDate,
          createdAtUtc, modifiedAtUtc, deviceId, syncVersion, syncedAtUtc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.memberId),
          toSqlValue(local.discipline),
          toSqlValue(local.level),
          toSqlValue(local.certifiedDate),
          toSqlValue(local.createdAtUtc),
          toSqlValue(local.modifiedAtUtc),
          toSqlValue(local.deviceId),
          toSqlValue(local.syncVersion),
          now,
        ]
      );
    }
  }

  private upsertPostingCategoryFromOnline(online: OnlinePostingCategory): void {
    const local = postingCategoryFromOnline(online);

    // Check if category exists
    const existing = query<{ id: string; updatedAtUtc: string }>(
      'SELECT id, updatedAtUtc FROM PostingCategory WHERE id = ?',
      [toSqlValue(local.id)]
    );

    if (existing.length > 0) {
      // Last-edit-wins: compare timestamps
      const localTime = new Date(existing[0].updatedAtUtc).getTime();
      const remoteTime = new Date(online.modified_at_utc).getTime();

      if (remoteTime <= localTime) {
        return; // Local is newer or same, skip
      }

      // Update existing
      execute(
        `UPDATE PostingCategory SET
          name = ?, description = ?, sortOrder = ?, isActive = ?, updatedAtUtc = ?
        WHERE id = ?`,
        [
          toSqlValue(local.name),
          toSqlValue(local.description),
          toSqlValue(local.sortOrder),
          toSqlValue(local.isActive),
          toSqlValue(local.updatedAtUtc),
          toSqlValue(local.id),
        ]
      );
    } else {
      // Insert new
      execute(
        `INSERT INTO PostingCategory (
          id, name, description, sortOrder, isActive, createdAtUtc, updatedAtUtc
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.name),
          toSqlValue(local.description),
          toSqlValue(local.sortOrder),
          toSqlValue(local.isActive),
          toSqlValue(local.createdAtUtc),
          toSqlValue(local.updatedAtUtc),
        ]
      );
    }
  }

  private upsertFiscalYearFromOnline(online: OnlineFiscalYear): void {
    const local = fiscalYearFromOnline(online);

    // Check if fiscal year exists
    const existing = query<{ year: number; updatedAtUtc: string }>(
      'SELECT year, updatedAtUtc FROM FiscalYear WHERE year = ?',
      [toSqlValue(local.year)]
    );

    if (existing.length > 0) {
      // Last-edit-wins: compare timestamps
      const localTime = new Date(existing[0].updatedAtUtc).getTime();
      const remoteTime = new Date(online.modified_at_utc).getTime();

      if (remoteTime <= localTime) {
        return; // Local is newer or same, skip
      }

      // Update existing
      execute(
        `UPDATE FiscalYear SET
          openingCashBalance = ?, openingBankBalance = ?, isClosed = ?, updatedAtUtc = ?
        WHERE year = ?`,
        [
          toSqlValue(local.openingCashBalance),
          toSqlValue(local.openingBankBalance),
          toSqlValue(local.isClosed),
          toSqlValue(local.updatedAtUtc),
          toSqlValue(local.year),
        ]
      );
    } else {
      // Insert new
      execute(
        `INSERT INTO FiscalYear (
          year, openingCashBalance, openingBankBalance, isClosed, createdAtUtc, updatedAtUtc
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.year),
          toSqlValue(local.openingCashBalance),
          toSqlValue(local.openingBankBalance),
          toSqlValue(local.isClosed),
          toSqlValue(local.createdAtUtc),
          toSqlValue(local.updatedAtUtc),
        ]
      );
    }
  }

  private upsertFeeRateFromOnline(online: OnlineFeeRate): void {
    const local = feeRateFromOnline(online);

    // Fee rates use composite primary key (fiscalYear, memberType)
    const existing = query<{ fiscalYear: number }>(
      'SELECT fiscalYear FROM FeeRate WHERE fiscalYear = ? AND memberType = ?',
      [toSqlValue(local.fiscalYear), toSqlValue(local.memberType)]
    );

    if (existing.length > 0) {
      // Update existing
      execute(
        `UPDATE FeeRate SET feeAmount = ? WHERE fiscalYear = ? AND memberType = ?`,
        [
          toSqlValue(local.feeAmount),
          toSqlValue(local.fiscalYear),
          toSqlValue(local.memberType),
        ]
      );
    } else {
      // Insert new
      execute(
        `INSERT INTO FeeRate (fiscalYear, memberType, feeAmount) VALUES (?, ?, ?)`,
        [
          toSqlValue(local.fiscalYear),
          toSqlValue(local.memberType),
          toSqlValue(local.feeAmount),
        ]
      );
    }
  }

  private upsertTransactionLineFromOnline(online: OnlineTransactionLine): void {
    const local = transactionLineFromOnline(online);

    // Check if transaction line exists
    const existing = query<{ id: string }>(
      'SELECT id FROM TransactionLine WHERE id = ?',
      [toSqlValue(local.id)]
    );

    if (existing.length > 0) {
      // Update existing
      execute(
        `UPDATE TransactionLine SET
          transactionId = ?, categoryId = ?, amount = ?, isIncome = ?, source = ?,
          memberId = ?, lineDescription = ?
        WHERE id = ?`,
        [
          toSqlValue(local.transactionId),
          toSqlValue(local.categoryId),
          toSqlValue(local.amount),
          toSqlValue(local.isIncome),
          toSqlValue(local.source),
          toSqlValue(local.memberId),
          toSqlValue(local.lineDescription),
          toSqlValue(local.id),
        ]
      );
    } else {
      // Insert new
      execute(
        `INSERT INTO TransactionLine (
          id, transactionId, categoryId, amount, isIncome, source, memberId, lineDescription
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.transactionId),
          toSqlValue(local.categoryId),
          toSqlValue(local.amount),
          toSqlValue(local.isIncome),
          toSqlValue(local.source),
          toSqlValue(local.memberId),
          toSqlValue(local.lineDescription),
        ]
      );
    }
  }

  private upsertPendingFeePaymentFromOnline(online: OnlinePendingFeePayment): void {
    const local = pendingFeePaymentFromOnline(online);

    // Check if pending fee payment exists
    const existing = query<{ id: string; updatedAtUtc: string }>(
      'SELECT id, updatedAtUtc FROM PendingFeePayment WHERE id = ?',
      [toSqlValue(local.id)]
    );

    if (existing.length > 0) {
      // Last-edit-wins: compare timestamps
      const localTime = new Date(existing[0].updatedAtUtc).getTime();
      const remoteTime = new Date(online.modified_at_utc).getTime();

      if (remoteTime <= localTime) {
        return; // Local is newer or same, skip
      }

      // Update existing
      execute(
        `UPDATE PendingFeePayment SET
          fiscalYear = ?, memberId = ?, amount = ?, paymentDate = ?,
          paymentMethod = ?, notes = ?, isConsolidated = ?, consolidatedTransactionId = ?,
          updatedAtUtc = ?
        WHERE id = ?`,
        [
          toSqlValue(local.fiscalYear),
          toSqlValue(local.memberId),
          toSqlValue(local.amount),
          toSqlValue(local.paymentDate),
          toSqlValue(local.paymentMethod),
          toSqlValue(local.notes),
          toSqlValue(local.isConsolidated),
          toSqlValue(local.consolidatedTransactionId),
          toSqlValue(local.updatedAtUtc),
          toSqlValue(local.id),
        ]
      );
    } else {
      // Insert new
      execute(
        `INSERT INTO PendingFeePayment (
          id, fiscalYear, memberId, amount, paymentDate, paymentMethod,
          notes, isConsolidated, consolidatedTransactionId, createdAtUtc, updatedAtUtc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.fiscalYear),
          toSqlValue(local.memberId),
          toSqlValue(local.amount),
          toSqlValue(local.paymentDate),
          toSqlValue(local.paymentMethod),
          toSqlValue(local.notes),
          toSqlValue(local.isConsolidated),
          toSqlValue(local.consolidatedTransactionId),
          toSqlValue(local.createdAtUtc),
          toSqlValue(local.updatedAtUtc),
        ]
      );
    }
  }

  private upsertScanEventFromOnline(online: OnlineScanEvent): void {
    const local = scanEventFromOnline(online);
    const now = new Date().toISOString();

    // Check if scan event exists
    const existing = query<{ id: string }>(
      'SELECT id FROM ScanEvent WHERE id = ?',
      [toSqlValue(local.id)]
    );

    if (existing.length > 0) {
      // Update existing
      execute(
        `UPDATE ScanEvent SET
          internalMemberId = ?, scanType = ?, linkedCheckInId = ?,
          linkedSessionId = ?, canceledFlag = ?, syncedAtUtc = ?, syncVersion = ?
        WHERE id = ?`,
        [
          toSqlValue(local.internalMemberId),
          toSqlValue(local.scanType),
          toSqlValue(local.linkedCheckInId),
          toSqlValue(local.linkedSessionId),
          local.canceledFlag ? 1 : 0,
          now,
          toSqlValue(local.syncVersion),
          toSqlValue(local.id),
        ]
      );
    } else {
      // Insert new
      execute(
        `INSERT INTO ScanEvent (
          id, internalMemberId, scanType, linkedCheckInId, linkedSessionId,
          canceledFlag, createdAtUtc, syncedAtUtc, syncVersion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.internalMemberId),
          toSqlValue(local.scanType),
          toSqlValue(local.linkedCheckInId),
          toSqlValue(local.linkedSessionId),
          local.canceledFlag ? 1 : 0,
          toSqlValue(local.createdAtUtc),
          now,
          toSqlValue(local.syncVersion),
        ]
      );
    }
  }

  private upsertMemberPreferenceFromOnline(online: OnlineMemberPreference): void {
    const local = memberPreferenceFromOnline(online);
    const now = new Date().toISOString();

    // Check if member preference exists
    const existing = query<{ memberId: string; updatedAtUtc: string }>(
      'SELECT memberId, updatedAtUtc FROM MemberPreference WHERE memberId = ?',
      [toSqlValue(local.memberId)]
    );

    if (existing.length > 0) {
      // Last-edit-wins: compare timestamps
      const localTime = new Date(existing[0].updatedAtUtc).getTime();
      const remoteTime = new Date(online.modified_at_utc).getTime();

      if (remoteTime <= localTime) {
        return; // Local is newer or same, skip
      }

      // Update existing
      execute(
        `UPDATE MemberPreference SET
          lastPracticeType = ?, lastClassification = ?, updatedAtUtc = ?
        WHERE memberId = ?`,
        [
          toSqlValue(local.lastPracticeType),
          toSqlValue(local.lastClassification),
          now,
          toSqlValue(local.memberId),
        ]
      );
    } else {
      // Insert new
      execute(
        `INSERT INTO MemberPreference (
          memberId, lastPracticeType, lastClassification, updatedAtUtc
        ) VALUES (?, ?, ?, ?)`,
        [
          toSqlValue(local.memberId),
          toSqlValue(local.lastPracticeType),
          toSqlValue(local.lastClassification),
          now,
        ]
      );
    }
  }

  private upsertNewMemberRegistrationFromOnline(online: OnlineNewMemberRegistration): void {
    const local = newMemberRegistrationFromOnline(online);
    const now = new Date().toISOString();

    // Check if registration exists
    const existing = query<{ id: string; createdAtUtc: string }>(
      'SELECT id, createdAtUtc FROM NewMemberRegistration WHERE id = ?',
      [toSqlValue(local.id)]
    );

    if (existing.length > 0) {
      // Last-edit-wins: compare timestamps
      const localTime = new Date(existing[0].createdAtUtc).getTime();
      const remoteTime = new Date(online.created_at_utc).getTime();

      if (remoteTime <= localTime) {
        return; // Local is newer or same, skip
      }

      // Update existing
      execute(
        `UPDATE NewMemberRegistration SET
          firstName = ?, lastName = ?, birthday = ?, gender = ?,
          email = ?, phone = ?, address = ?, zipCode = ?, city = ?, notes = ?,
          photoPath = ?, guardianName = ?, guardianPhone = ?, guardianEmail = ?,
          sourceDeviceId = ?, sourceDeviceName = ?,
          approvalStatus = ?, approvedAtUtc = ?, rejectedAtUtc = ?,
          rejectionReason = ?, createdMemberId = ?, syncedAtUtc = ?
        WHERE id = ?`,
        [
          toSqlValue(local.firstName),
          toSqlValue(local.lastName),
          toSqlValue(local.birthday),
          toSqlValue(local.gender),
          toSqlValue(local.email),
          toSqlValue(local.phone),
          toSqlValue(local.address),
          toSqlValue(local.zipCode),
          toSqlValue(local.city),
          toSqlValue(local.notes),
          toSqlValue(local.photoPath),
          toSqlValue(local.guardianName),
          toSqlValue(local.guardianPhone),
          toSqlValue(local.guardianEmail),
          toSqlValue(local.sourceDeviceId),
          toSqlValue(local.sourceDeviceName),
          toSqlValue(local.approvalStatus),
          toSqlValue(local.approvedAtUtc),
          toSqlValue(local.rejectedAtUtc),
          toSqlValue(local.rejectionReason),
          toSqlValue(local.createdMemberId),
          now,
          toSqlValue(local.id),
        ]
      );
    } else {
      // Insert new
      execute(
        `INSERT INTO NewMemberRegistration (
          id, firstName, lastName, birthday, gender,
          email, phone, address, zipCode, city, notes,
          photoPath, guardianName, guardianPhone, guardianEmail,
          sourceDeviceId, sourceDeviceName,
          approvalStatus, approvedAtUtc, rejectedAtUtc,
          rejectionReason, createdMemberId, createdAtUtc, syncedAtUtc, syncVersion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.firstName),
          toSqlValue(local.lastName),
          toSqlValue(local.birthday),
          toSqlValue(local.gender),
          toSqlValue(local.email),
          toSqlValue(local.phone),
          toSqlValue(local.address),
          toSqlValue(local.zipCode),
          toSqlValue(local.city),
          toSqlValue(local.notes),
          toSqlValue(local.photoPath),
          toSqlValue(local.guardianName),
          toSqlValue(local.guardianPhone),
          toSqlValue(local.guardianEmail),
          toSqlValue(local.sourceDeviceId),
          toSqlValue(local.sourceDeviceName),
          toSqlValue(local.approvalStatus),
          toSqlValue(local.approvedAtUtc),
          toSqlValue(local.rejectedAtUtc),
          toSqlValue(local.rejectionReason),
          toSqlValue(local.createdMemberId),
          toSqlValue(local.createdAtUtc),
          now,
          toSqlValue(local.syncVersion),
        ]
      );
    }
  }

  private upsertSkvRegistrationFromOnline(online: OnlineSkvRegistration): void {
    const local = skvRegistrationFromOnline(online);
    const now = new Date().toISOString();

    // Check if registration exists
    const existing = query<{ id: string; updatedAtUtc: string }>(
      'SELECT id, updatedAtUtc FROM SKVRegistration WHERE id = ?',
      [toSqlValue(local.id)]
    );

    if (existing.length > 0) {
      // Last-edit-wins: compare timestamps
      const localTime = new Date(existing[0].updatedAtUtc).getTime();
      const remoteTime = new Date(online.updated_at_utc).getTime();

      if (remoteTime <= localTime) {
        return; // Local is newer or same, skip
      }

      // Update existing
      execute(
        `UPDATE SKVRegistration SET
          memberId = ?, skvLevel = ?, status = ?, lastApprovedDate = ?, updatedAtUtc = ?
        WHERE id = ?`,
        [
          toSqlValue(local.memberId),
          toSqlValue(local.skvLevel),
          toSqlValue(local.status),
          toSqlValue(local.lastApprovedDate),
          now,
          toSqlValue(local.id),
        ]
      );
    } else {
      // Insert new
      execute(
        `INSERT INTO SKVRegistration (
          id, memberId, skvLevel, status, lastApprovedDate, createdAtUtc, updatedAtUtc
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.memberId),
          toSqlValue(local.skvLevel),
          toSqlValue(local.status),
          toSqlValue(local.lastApprovedDate),
          toSqlValue(local.createdAtUtc),
          now,
        ]
      );
    }
  }

  private upsertSkvWeaponFromOnline(online: OnlineSkvWeapon): void {
    const local = skvWeaponFromOnline(online);
    const now = new Date().toISOString();

    // Check if weapon exists
    const existing = query<{ id: string; updatedAtUtc: string }>(
      'SELECT id, updatedAtUtc FROM SKVWeapon WHERE id = ?',
      [toSqlValue(local.id)]
    );

    if (existing.length > 0) {
      // Last-edit-wins: compare timestamps
      const localTime = new Date(existing[0].updatedAtUtc).getTime();
      const remoteTime = new Date(online.updated_at_utc).getTime();

      if (remoteTime <= localTime) {
        return; // Local is newer or same, skip
      }

      // Update existing
      execute(
        `UPDATE SKVWeapon SET
          skvRegistrationId = ?, model = ?, description = ?, serial = ?,
          type = ?, caliber = ?, lastReviewedDate = ?, updatedAtUtc = ?
        WHERE id = ?`,
        [
          toSqlValue(local.skvRegistrationId),
          toSqlValue(local.model),
          toSqlValue(local.description),
          toSqlValue(local.serial),
          toSqlValue(local.type),
          toSqlValue(local.caliber),
          toSqlValue(local.lastReviewedDate),
          now,
          toSqlValue(local.id),
        ]
      );
    } else {
      // Insert new
      execute(
        `INSERT INTO SKVWeapon (
          id, skvRegistrationId, model, description, serial, type, caliber,
          lastReviewedDate, createdAtUtc, updatedAtUtc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.skvRegistrationId),
          toSqlValue(local.model),
          toSqlValue(local.description),
          toSqlValue(local.serial),
          toSqlValue(local.type),
          toSqlValue(local.caliber),
          toSqlValue(local.lastReviewedDate),
          toSqlValue(local.createdAtUtc),
          now,
        ]
      );
    }
  }

  // ===== Delete Handling =====

  private addPendingDelete(entityType: string, entityId: string): void {
    // Check if already pending
    const exists = this.state.pendingDeletes.some(
      (d) => d.entityType === entityType && d.entityId === entityId
    );

    if (!exists) {
      this.state.pendingDeletes.push({
        entityType,
        entityId,
        deletedAt: new Date().toISOString(),
      });
      saveSyncState(this.state);
    }
  }

  private deleteCheckIn(id: string): void {
    execute('DELETE FROM CheckIn WHERE id = ?', [id]);
  }

  private deletePracticeSession(id: string): void {
    execute('DELETE FROM PracticeSession WHERE id = ?', [id]);
  }

  /**
   * Get pending deletes that need user confirmation.
   */
  getPendingDeletes(): PendingDelete[] {
    return this.state.pendingDeletes.filter((d) => !d.confirmedAt);
  }

  /**
   * Confirm a pending delete (user approved).
   */
  confirmDelete(entityType: string, entityId: string): void {
    // Find and mark as confirmed
    const index = this.state.pendingDeletes.findIndex(
      (d) => d.entityType === entityType && d.entityId === entityId && !d.confirmedAt
    );

    if (index >= 0) {
      this.state.pendingDeletes[index].confirmedAt = new Date().toISOString();

      // Actually delete the entity
      switch (entityType) {
        case 'member':
          execute('DELETE FROM Member WHERE internalId = ?', [entityId]);
          break;
        case 'check_in':
          this.deleteCheckIn(entityId);
          break;
        case 'practice_session':
          this.deletePracticeSession(entityId);
          break;
      }

      saveSyncState(this.state);
    }
  }

  /**
   * Reject a pending delete (user wants to keep local).
   */
  rejectDelete(entityType: string, entityId: string): void {
    // Remove from pending list
    this.state.pendingDeletes = this.state.pendingDeletes.filter(
      (d) => !(d.entityType === entityType && d.entityId === entityId)
    );
    saveSyncState(this.state);
  }

  // ===== Utilities =====

  private async getDeviceId(): Promise<string> {
    // Try to get device ID from Electron
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
      try {
        const deviceInfo = await (window as { electronAPI?: { getDeviceInfo?: () => Promise<{ deviceId: string }> } }).electronAPI?.getDeviceInfo?.();
        if (deviceInfo?.deviceId) {
          return deviceInfo.deviceId;
        }
      } catch {
        // Fall through
      }
    }

    // Generate a stable device ID based on localStorage
    let deviceId = localStorage.getItem('onlineSync_deviceId');
    if (!deviceId) {
      deviceId = 'laptop-' + crypto.randomUUID().substring(0, 8);
      localStorage.setItem('onlineSync_deviceId', deviceId);
    }
    return deviceId;
  }

  /**
   * Clear sync state (for testing or reset).
   */
  clearState(): void {
    this.state = {
      lastSyncTime: null,
      lastPushTime: null,
      lastPullTime: null,
      lastBatchId: null,
      pendingDeletes: [],
      syncInProgress: false,
      error: null,
    };
    saveSyncState(this.state);
  }

  /**
   * Verify that all data is synchronized between local and remote databases.
   * Returns a report showing counts for each table and any discrepancies.
   */
  async verifySyncData(): Promise<SyncVerificationResult> {
    console.log('[OnlineSyncService] Starting sync verification...');

    // Get local counts from SQLite
    const localCounts = await this.getLocalEntityCounts();

    // Get remote counts from API
    let remoteCounts: EntityCounts;
    try {
      const syncStatus = await onlineApiService.getSyncStatus();
      remoteCounts = syncStatus.entityCounts;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get remote counts',
        localCounts,
        remoteCounts: null,
        discrepancies: [],
        allMatch: false,
      };
    }

    // Compare counts and find discrepancies
    const discrepancies: SyncDiscrepancy[] = [];
    const tableNames = Object.keys(localCounts) as (keyof EntityCounts)[];

    for (const table of tableNames) {
      const local = localCounts[table];
      const remote = remoteCounts[table];
      if (local !== remote) {
        discrepancies.push({
          table,
          localCount: local,
          remoteCount: remote,
          difference: local - remote,
        });
      }
    }

    const allMatch = discrepancies.length === 0;

    console.log(`[OnlineSyncService] Verification complete: ${allMatch ? 'All data matches!' : `${discrepancies.length} discrepancies found`}`);

    return {
      success: true,
      localCounts,
      remoteCounts,
      discrepancies,
      allMatch,
    };
  }

  /**
   * Get entity counts from local SQLite database.
   * Note: Local SQLite uses PascalCase table names, while online MySQL uses snake_case.
   */
  private async getLocalEntityCounts(): Promise<EntityCounts> {
    const getCount = async (sql: string): Promise<number> => {
      const rows = await query<{ cnt: number }>(sql);
      return rows[0]?.cnt ?? 0;
    };

    return {
      // Core member data (Local: Member, MemberPreference)
      // Photos are stored as columns in Member, not separate table
      members: await getCount('SELECT COUNT(*) as cnt FROM Member'),
      member_photos: await getCount('SELECT COUNT(*) as cnt FROM Member WHERE photoPath IS NOT NULL OR photoThumbnail IS NOT NULL'),
      member_preferences: await getCount('SELECT COUNT(*) as cnt FROM MemberPreference'),
      // Activity data (Local: CheckIn, PracticeSession, ScanEvent)
      check_ins: await getCount('SELECT COUNT(*) as cnt FROM CheckIn'),
      practice_sessions: await getCount('SELECT COUNT(*) as cnt FROM PracticeSession'),
      scan_events: await getCount('SELECT COUNT(*) as cnt FROM ScanEvent'),
      // Equipment data (Local: EquipmentItem, EquipmentCheckout)
      equipment_items: await getCount('SELECT COUNT(*) as cnt FROM EquipmentItem'),
      equipment_checkouts: await getCount('SELECT COUNT(*) as cnt FROM EquipmentCheckout'),
      // Trainer data (Local: TrainerInfo, TrainerDiscipline)
      trainer_info: await getCount('SELECT COUNT(*) as cnt FROM TrainerInfo'),
      trainer_disciplines: await getCount('SELECT COUNT(*) as cnt FROM TrainerDiscipline'),
      // Finance data (Local: PostingCategory, FiscalYear, FeeRate, FinancialTransaction, TransactionLine, PendingFeePayment)
      posting_categories: await getCount('SELECT COUNT(*) as cnt FROM PostingCategory'),
      fiscal_years: await getCount('SELECT COUNT(*) as cnt FROM FiscalYear'),
      fee_rates: await getCount('SELECT COUNT(*) as cnt FROM FeeRate'),
      financial_transactions: await getCount('SELECT COUNT(*) as cnt FROM FinancialTransaction'),
      transaction_lines: await getCount('SELECT COUNT(*) as cnt FROM TransactionLine'),
      pending_fee_payments: await getCount('SELECT COUNT(*) as cnt FROM PendingFeePayment'),
    };
  }

  /**
   * Push a pending fee payment delete to the online database.
   * Call this after deleting a pending fee payment locally.
   */
  async pushPendingFeePaymentDelete(paymentId: string): Promise<boolean> {
    try {
      const deviceId = await this.getDeviceId();
      if (!deviceId) {
        return false; // Online sync not enabled
      }

      const payload: SyncPushPayload = {
        deviceId,
        batchId: `delete-${paymentId}-${Date.now()}`,
        schemaVersion: SYNC_SCHEMA_VERSION,
        entities: {
          pendingFeePayments: [{
            id: paymentId,
            _action: 'delete',
          } as OnlinePendingFeePayment],
        },
      };

      await onlineApiService.push(payload);
      console.log(`[OnlineSync] Deleted pending fee payment ${paymentId} from online database`);
      return true;
    } catch (error) {
      console.error(`[OnlineSync] Failed to delete pending fee payment ${paymentId}:`, error);
      return false;
    }
  }
}

// ===== Singleton Export =====

export const onlineSyncService = new OnlineSyncService();
export default onlineSyncService;
