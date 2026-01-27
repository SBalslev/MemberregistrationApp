/**
 * Repository for sync outbox operations.
 * Provides persistent queue for reliable at-least-once delivery.
 *
 * @see [sync-reliability/prd.md] - Sync Reliability Hardening PRD
 */

import { execute, query, transaction } from './db';
import type { Member } from '../types';
import type { SyncableMemberData } from '../types/electron';

// ===== Backoff Configuration =====
// Delays in seconds: 0s, 5s, 15s, 60s, 5min, 15min
const BACKOFF_DELAYS = [0, 5, 15, 60, 300, 900];
const MAX_ATTEMPTS = 10;
const LAPTOP_DEVICE_ID = 'laptop-master';

function toSyncableMember(member: Member): SyncableMemberData {
  const now = new Date().toISOString();
  const lifecycle = member.memberLifecycleStage === 'TRIAL' ? 'TRIAL' : 'FULL';
  const internalId = member.internalId || '';

  return {
    internalId,
    membershipId: member.membershipId,
    memberType: lifecycle,
    memberLifecycleStage: lifecycle,
    status: member.status || 'ACTIVE',
    firstName: member.firstName || '',
    lastName: member.lastName || '',
    birthDate: member.birthDate,
    gender: member.gender,
    email: member.email,
    phone: member.phone,
    address: member.address,
    zipCode: member.zipCode,
    city: member.city,
    guardianName: member.guardianName,
    guardianPhone: member.guardianPhone,
    guardianEmail: member.guardianEmail,
    expiresOn: member.expiresOn,
    registrationPhotoPath: member.registrationPhotoPath,
    mergedIntoId: member.mergedIntoId,
    deviceId: LAPTOP_DEVICE_ID,
    syncVersion: member.syncVersion || 1,
    createdAtUtc: member.createdAtUtc || now,
    modifiedAtUtc: member.updatedAtUtc || member.createdAtUtc || now
  };
}

function isSyncableMember(candidate: unknown): candidate is SyncableMemberData {
  if (!candidate || typeof candidate !== 'object') return false;
  const record = candidate as Record<string, unknown>;
  return typeof record.modifiedAtUtc === 'string' && typeof record.deviceId === 'string';
}

// ===== Types =====

export interface SyncOutboxEntry {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: string; // JSON serialized entity
  createdAtUtc: string;
  attempts: number;
  lastAttemptUtc: string | null;
  lastError: string | null;
  nextRetryUtc: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface SyncOutboxDelivery {
  outboxId: string;
  deviceId: string;
  deliveredAtUtc: string | null;
  attempts: number;
  lastAttemptUtc: string | null;
  lastError: string | null;
}

export interface ProcessedSyncMessage {
  messageId: string;
  sourceDeviceId: string;
  processedAtUtc: string;
}

// ===== Queue Operations =====

/**
 * Queues an entity for sync to all devices.
 */
export function queueForSync<T>(
  entityType: string,
  entityId: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  entity: T
): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const payload = JSON.stringify(entity);

  execute(
    `INSERT INTO SyncOutbox (id, entityType, entityId, operation, payload, createdAtUtc, attempts, status)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')`,
    [id, entityType, entityId, operation, payload, now]
  );

  return id;
}

/**
 * Queues a Member entity for sync.
 */
export function queueMember(member: Member, operation: 'INSERT' | 'UPDATE' = 'INSERT'): string {
  const payload = toSyncableMember(member);
  return queueForSync('Member', payload.internalId, operation, payload);
}

/**
 * Queues a CheckIn entity for sync.
 */
export function queueCheckIn(checkIn: object): string {
  const id = (checkIn as { id?: string }).id || '';
  return queueForSync('CheckIn', id, 'INSERT', checkIn);
}

/**
 * Queues a PracticeSession entity for sync.
 */
export function queuePracticeSession(session: object): string {
  const id = (session as { id?: string }).id || '';
  return queueForSync('PracticeSession', id, 'INSERT', session);
}

/**
 * Queues an EquipmentCheckout entity for sync.
 */
export function queueEquipmentCheckout(checkout: object, operation: 'INSERT' | 'UPDATE' = 'INSERT'): string {
  const id = (checkout as { id?: string }).id || '';
  return queueForSync('EquipmentCheckout', id, operation, checkout);
}

// ===== Retrieval Operations =====

/**
 * Gets all pending outbox entries.
 */
export function getPendingEntries(): SyncOutboxEntry[] {
  const now = new Date().toISOString();
  return query<SyncOutboxEntry>(
    `SELECT * FROM SyncOutbox
     WHERE status IN ('pending', 'in_progress')
       AND (nextRetryUtc IS NULL OR nextRetryUtc <= ?)
     ORDER BY createdAtUtc ASC`,
    [now]
  );
}

/**
 * Gets pending outbox entries for a specific device.
 * Returns entries that haven't been delivered to this device yet.
 */
export function getPendingForDevice(deviceId: string): SyncOutboxEntry[] {
  const now = new Date().toISOString();
  return query<SyncOutboxEntry>(
    `SELECT o.* FROM SyncOutbox o
     WHERE o.status NOT IN ('completed', 'failed')
       AND (o.nextRetryUtc IS NULL OR o.nextRetryUtc <= ?)
       AND NOT EXISTS (
         SELECT 1 FROM SyncOutboxDelivery d
         WHERE d.outboxId = o.id
           AND d.deviceId = ?
           AND d.deliveredAtUtc IS NOT NULL
       )
     ORDER BY o.createdAtUtc ASC`,
    [now, deviceId]
  );
}

/**
 * Gets the count of pending outbox entries.
 */
export function getPendingCount(): number {
  const result = query<{ count: number }>(
    `SELECT COUNT(*) as count FROM SyncOutbox WHERE status IN ('pending', 'in_progress')`
  );
  return result[0]?.count || 0;
}

/**
 * Gets the count of failed outbox entries.
 */
export function getFailedCount(): number {
  const result = query<{ count: number }>(
    `SELECT COUNT(*) as count FROM SyncOutbox WHERE status = 'failed'`
  );
  return result[0]?.count || 0;
}

// ===== Delivery Tracking =====

/**
 * Marks an outbox entry as delivered to a specific device.
 */
export function markDeliveredToDevice(outboxId: string, deviceId: string): void {
  const now = new Date().toISOString();
  execute(
    `INSERT OR REPLACE INTO SyncOutboxDelivery (outboxId, deviceId, deliveredAtUtc, attempts, lastAttemptUtc)
     VALUES (?, ?, ?, COALESCE((SELECT attempts FROM SyncOutboxDelivery WHERE outboxId = ? AND deviceId = ?), 0) + 1, ?)`,
    [outboxId, deviceId, now, outboxId, deviceId, now]
  );
}

/**
 * Marks multiple outbox entries as delivered to a specific device.
 */
export function markDeliveredToDeviceBatch(outboxIds: string[], deviceId: string): void {
  if (outboxIds.length === 0) return;

  transaction(() => {
    for (const outboxId of outboxIds) {
      markDeliveredToDevice(outboxId, deviceId);
    }
  });
}

/**
 * Records a failed delivery attempt with exponential backoff.
 */
export function recordFailedAttempt(outboxId: string, deviceId: string, error: string): void {
  const now = new Date().toISOString();

  // Get current attempt count
  const entry = query<SyncOutboxEntry>(
    `SELECT * FROM SyncOutbox WHERE id = ?`,
    [outboxId]
  )[0];

  if (!entry) return;

  const newAttempts = entry.attempts + 1;

  if (newAttempts >= MAX_ATTEMPTS) {
    // Mark as failed after max retries
    execute(
      `UPDATE SyncOutbox SET status = 'failed', attempts = ?, lastAttemptUtc = ?, lastError = ?
       WHERE id = ?`,
      [newAttempts, now, error, outboxId]
    );
  } else {
    // Calculate backoff delay
    const delayIndex = Math.min(newAttempts, BACKOFF_DELAYS.length - 1);
    const delaySeconds = BACKOFF_DELAYS[delayIndex];
    const nextRetry = new Date(Date.now() + delaySeconds * 1000).toISOString();

    execute(
      `UPDATE SyncOutbox SET attempts = ?, lastAttemptUtc = ?, lastError = ?, nextRetryUtc = ?, status = 'pending'
       WHERE id = ?`,
      [newAttempts, now, error, nextRetry, outboxId]
    );
  }

  // Also track per-device delivery attempt
  execute(
    `INSERT OR REPLACE INTO SyncOutboxDelivery (outboxId, deviceId, attempts, lastAttemptUtc, lastError)
     VALUES (?, ?, COALESCE((SELECT attempts FROM SyncOutboxDelivery WHERE outboxId = ? AND deviceId = ?), 0) + 1, ?, ?)`,
    [outboxId, deviceId, outboxId, deviceId, now, error]
  );
}

/**
 * Marks an outbox entry as completed.
 */
export function markCompleted(outboxId: string): void {
  execute(
    `UPDATE SyncOutbox SET status = 'completed' WHERE id = ?`,
    [outboxId]
  );
}

/**
 * Retries all failed entries by resetting their status.
 */
export function retryFailedEntries(): number {
  const now = new Date().toISOString();

  // Get count of failed entries
  const failedCount = getFailedCount();

  // Reset failed entries to pending with next retry now
  execute(
    `UPDATE SyncOutbox SET status = 'pending', attempts = 0, nextRetryUtc = ?
     WHERE status = 'failed'`,
    [now]
  );

  return failedCount;
}

// ===== Idempotency =====

/**
 * Checks if a message has already been processed.
 */
export function isMessageProcessed(messageId: string): boolean {
  const result = query<{ count: number }>(
    `SELECT COUNT(*) as count FROM ProcessedSyncMessage WHERE messageId = ?`,
    [messageId]
  );
  return (result[0]?.count || 0) > 0;
}

/**
 * Records a message as processed for idempotency.
 */
export function recordProcessedMessage(messageId: string, sourceDeviceId: string): void {
  const now = new Date().toISOString();
  execute(
    `INSERT OR IGNORE INTO ProcessedSyncMessage (messageId, sourceDeviceId, processedAtUtc)
     VALUES (?, ?, ?)`,
    [messageId, sourceDeviceId, now]
  );
}

// ===== Cleanup =====

/**
 * Cleans up old completed entries and processed messages.
 * Default retention is 24 hours.
 */
export function cleanup(retentionHours: number = 24): { entriesDeleted: number; messagesDeleted: number } {
  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString();

  // Delete old completed entries
  execute(
    `DELETE FROM SyncOutbox WHERE status = 'completed' AND createdAtUtc < ?`,
    [cutoff]
  );
  const entriesResult = query<{ changes: number }>(`SELECT changes() as changes`);
  const entriesDeleted = entriesResult[0]?.changes || 0;

  // Delete old processed messages
  execute(
    `DELETE FROM ProcessedSyncMessage WHERE processedAtUtc < ?`,
    [cutoff]
  );
  const messagesResult = query<{ changes: number }>(`SELECT changes() as changes`);
  const messagesDeleted = messagesResult[0]?.changes || 0;

  return { entriesDeleted, messagesDeleted };
}

// ===== Collect Entities =====

/**
 * Collects entities from the outbox for a specific device.
 * Groups by entity type for the sync payload.
 */
export function collectEntitiesForDevice(deviceId: string): {
  outboxIds: string[];
  members: object[];
  checkIns: object[];
  practiceSessions: object[];
  equipmentCheckouts: object[];
} {
  const entries = getPendingForDevice(deviceId);

  const result = {
    outboxIds: [] as string[],
    members: [] as object[],
    checkIns: [] as object[],
    practiceSessions: [] as object[],
    equipmentCheckouts: [] as object[],
  };

  for (const entry of entries) {
    result.outboxIds.push(entry.id);

    try {
      const entity = JSON.parse(entry.payload);

      switch (entry.entityType) {
        case 'Member':
          if (isSyncableMember(entity)) {
            result.members.push(entity);
          } else {
            result.members.push(toSyncableMember(entity as Member));
          }
          break;
        case 'CheckIn':
          result.checkIns.push(entity);
          break;
        case 'PracticeSession':
          result.practiceSessions.push(entity);
          break;
        case 'EquipmentCheckout':
          result.equipmentCheckouts.push(entity);
          break;
      }
    } catch (e) {
      console.error(`Failed to parse outbox entry ${entry.id}:`, e);
    }
  }

  return result;
}
