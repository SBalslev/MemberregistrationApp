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
  type EntityCounts,
  SchemaVersionError,
  ConflictError,
} from './onlineApiService';
import { SYNC_SCHEMA_VERSION } from './syncService';
import type { Member, CheckIn, PracticeSession, EquipmentItem, EquipmentCheckout } from '../types/entities';
import type { TrainerInfo, TrainerDiscipline } from './trainerRepository';
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
       WHERE createdAtUtc > ? OR syncedAtUtc IS NULL
       ORDER BY createdAtUtc ASC`,
      [since]
    );
  }

  private getModifiedPracticeSessions(fullSync: boolean): PracticeSession[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<PracticeSession>(
      `SELECT * FROM PracticeSession
       WHERE createdAtUtc > ? OR syncedAtUtc IS NULL
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
    return query<TransactionLine>(
      `SELECT tl.* FROM TransactionLine tl
       JOIN FinancialTransaction ft ON tl.transactionId = ft.id
       WHERE ft.updatedAtUtc > ?
       ORDER BY ft.sequenceNumber ASC`,
      [since]
    );
  }

  private getModifiedPendingFeePayments(fullSync: boolean): PendingFeePayment[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<PendingFeePayment>(
      `SELECT * FROM PendingFeePayment
       WHERE updatedAtUtc > ?
       ORDER BY paymentDate ASC`,
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
       WHERE modifiedAtUtc > ? OR syncedAtUtc IS NULL
       ORDER BY checkedOutAtUtc ASC`,
      [since]
    );
  }

  private getModifiedTrainerInfos(fullSync: boolean): TrainerInfo[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<TrainerInfo>(
      `SELECT * FROM TrainerInfo
       WHERE modifiedAtUtc > ? OR syncedAtUtc IS NULL
       ORDER BY modifiedAtUtc ASC`,
      [since]
    );
  }

  private getModifiedTrainerDisciplines(fullSync: boolean): TrainerDiscipline[] {
    const since = fullSync ? '1970-01-01T00:00:00Z' : this.state.lastPushTime || '1970-01-01T00:00:00Z';
    return query<TrainerDiscipline>(
      `SELECT * FROM TrainerDiscipline
       WHERE modifiedAtUtc > ? OR syncedAtUtc IS NULL
       ORDER BY createdAtUtc ASC`,
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
      // Last-edit-wins: compare timestamps
      const localTime = new Date(existing[0].modifiedAtUtc).getTime();
      const remoteTime = new Date(online.modified_at_utc).getTime();

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
          transactionId = ?, categoryId = ?, amount = ?, isIncome = ?,
          memberId = ?, lineDescription = ?
        WHERE id = ?`,
        [
          toSqlValue(local.transactionId),
          toSqlValue(local.categoryId),
          toSqlValue(local.amount),
          toSqlValue(local.isIncome),
          toSqlValue(local.memberId),
          toSqlValue(local.lineDescription),
          toSqlValue(local.id),
        ]
      );
    } else {
      // Insert new
      execute(
        `INSERT INTO TransactionLine (
          id, transactionId, categoryId, amount, isIncome, memberId, lineDescription
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          toSqlValue(local.id),
          toSqlValue(local.transactionId),
          toSqlValue(local.categoryId),
          toSqlValue(local.amount),
          toSqlValue(local.isIncome),
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
}

// ===== Singleton Export =====

export const onlineSyncService = new OnlineSyncService();
export default onlineSyncService;
