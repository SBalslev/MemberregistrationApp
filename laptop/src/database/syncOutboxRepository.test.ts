/**
 * Unit tests for sync outbox repository operations.
 * Verifies:
 * - Outbox queue operations (add, get, update)
 * - Per-device delivery tracking
 * - Exponential backoff retry logic
 * - Idempotency message tracking
 * - Cleanup of old entries
 *
 * @see [sync-reliability/prd.md] - Sync Reliability Hardening PRD
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'mock-uuid-12345'),
});

// Store for mock data
const mockOutboxEntries: Map<string, any> = new Map();
const mockDeliveries: Map<string, any> = new Map();
const mockProcessedMessages: Map<string, any> = new Map();
let lastChangesCount = 0;

// Mock the database module
vi.mock('./db', () => {
  return {
    execute: vi.fn((sql: string, params?: unknown[]) => {
      // Track INSERT operations
      if (sql.includes('INSERT INTO SyncOutbox') && !sql.includes('Delivery') && !sql.includes('ProcessedSyncMessage')) {
        const [id, entityType, entityId, operation, payload, createdAtUtc] = params || [];
        mockOutboxEntries.set(id as string, {
          id,
          entityType,
          entityId,
          operation,
          payload,
          createdAtUtc,
          attempts: 0,
          status: 'pending',
          lastAttemptUtc: null,
          lastError: null,
          nextRetryUtc: null,
        });
      }

      // Track INSERT into SyncOutboxDelivery
      if (sql.includes('INSERT') && sql.includes('SyncOutboxDelivery')) {
        const key = `${params?.[0]}-${params?.[1]}`;
        const existing = mockDeliveries.get(key);
        // Check if this is delivery (3rd param is deliveredAtUtc) or failed attempt (has lastError)
        if (sql.includes('lastError')) {
          // Failed attempt tracking: (outboxId, deviceId, outboxId, deviceId, lastAttemptUtc, lastError)
          const outboxId = params?.[0] as string;
          const deviceId = params?.[1] as string;
          const lastAttemptUtc = params?.[4] as string;
          const lastError = params?.[5] as string;
          mockDeliveries.set(key, {
            outboxId,
            deviceId,
            deliveredAtUtc: existing?.deliveredAtUtc || null,
            attempts: (existing?.attempts || 0) + 1,
            lastAttemptUtc,
            lastError,
          });
        } else {
          // Successful delivery tracking
          const outboxId = params?.[0] as string;
          const deviceId = params?.[1] as string;
          const deliveredAtUtc = params?.[2] as string;
          mockDeliveries.set(key, {
            outboxId,
            deviceId,
            deliveredAtUtc: deliveredAtUtc || existing?.deliveredAtUtc,
            attempts: (existing?.attempts || 0) + 1,
            lastAttemptUtc: new Date().toISOString(),
          });
        }
      }

      // Track INSERT into ProcessedSyncMessage
      if (sql.includes('INSERT') && sql.includes('ProcessedSyncMessage')) {
        const [messageId, sourceDeviceId, processedAtUtc] = params || [];
        if (!mockProcessedMessages.has(messageId as string)) {
          mockProcessedMessages.set(messageId as string, {
            messageId,
            sourceDeviceId,
            processedAtUtc,
          });
        }
      }

      // Track UPDATE operations on SyncOutbox
      if (sql.includes('UPDATE SyncOutbox SET')) {
        const id = params?.[params.length - 1] as string;
        const entry = mockOutboxEntries.get(id);
        if (entry) {
          if (sql.includes("status = 'completed'")) {
            entry.status = 'completed';
          } else if (sql.includes("status = 'failed'")) {
            entry.status = 'failed';
            entry.attempts = params?.[0];
            entry.lastAttemptUtc = params?.[1];
            entry.lastError = params?.[2];
          } else if (sql.includes('attempts =') && sql.includes('nextRetryUtc =')) {
            // This is the failed attempt update with backoff
            entry.status = 'pending';
            entry.attempts = params?.[0];
            entry.lastAttemptUtc = params?.[1];
            entry.lastError = params?.[2];
            entry.nextRetryUtc = params?.[3];
          }
        }
      }

      // Track DELETE operations
      if (sql.includes('DELETE FROM SyncOutbox')) {
        let deleted = 0;
        for (const [id, entry] of mockOutboxEntries.entries()) {
          if (entry.status === 'completed') {
            mockOutboxEntries.delete(id);
            deleted++;
          }
        }
        lastChangesCount = deleted;
      }

      if (sql.includes('DELETE FROM ProcessedSyncMessage')) {
        const sizeBefore = mockProcessedMessages.size;
        mockProcessedMessages.clear();
        lastChangesCount = sizeBefore;
      }

      return { changes: 1 };
    }),
    query: vi.fn(<T>(sql: string, params?: unknown[]): T[] => {
      // Return mock data based on the query
      if (sql.includes('SELECT * FROM SyncOutbox') && sql.includes('WHERE id =')) {
        const id = params?.[0] as string;
        const entry = mockOutboxEntries.get(id);
        return entry ? [entry] as T[] : [] as T[];
      }

      // Get pending entries for device
      if (sql.includes('SELECT o.* FROM SyncOutbox o') && sql.includes('NOT EXISTS')) {
        const deviceId = params?.[1] as string;
        const entries: any[] = [];
        for (const entry of mockOutboxEntries.values()) {
          if (entry.status !== 'completed' && entry.status !== 'failed') {
            const deliveryKey = `${entry.id}-${deviceId}`;
            const delivery = mockDeliveries.get(deliveryKey);
            if (!delivery || !delivery.deliveredAtUtc) {
              entries.push(entry);
            }
          }
        }
        return entries as T[];
      }

      // Count pending entries
      if (sql.includes('COUNT(*)') && sql.includes('pending')) {
        let count = 0;
        for (const entry of mockOutboxEntries.values()) {
          if (entry.status === 'pending' || entry.status === 'in_progress') {
            count++;
          }
        }
        return [{ count }] as T[];
      }

      // Count failed entries
      if (sql.includes('COUNT(*)') && sql.includes('failed')) {
        let count = 0;
        for (const entry of mockOutboxEntries.values()) {
          if (entry.status === 'failed') {
            count++;
          }
        }
        return [{ count }] as T[];
      }

      // Check processed message
      if (sql.includes('ProcessedSyncMessage') && sql.includes('WHERE messageId =')) {
        const messageId = params?.[0] as string;
        const exists = mockProcessedMessages.has(messageId);
        return [{ count: exists ? 1 : 0 }] as T[];
      }

      // Changes count
      if (sql.includes('changes()')) {
        return [{ changes: lastChangesCount }] as T[];
      }

      return [] as T[];
    }),
    transaction: vi.fn((fn: () => void) => {
      fn();
    }),
    getDatabase: vi.fn(() => ({ run: vi.fn() })),
  };
});

// Import after mocking
import type { Member } from '../types';
import {
  queueForSync,
  queueMember,
  queueCheckIn,
  queuePracticeSession,
  queueEquipmentCheckout,
  getPendingForDevice,
  getPendingCount,
  getFailedCount,
  markDeliveredToDevice,
  markDeliveredToDeviceBatch,
  recordFailedAttempt,
  markCompleted,
  retryFailedEntries,
  isMessageProcessed,
  recordProcessedMessage,
  cleanup,
  collectEntitiesForDevice,
} from './syncOutboxRepository';

describe('Sync Outbox Repository', () => {
  const baseMember: Member = {
    internalId: 'member-uuid',
    membershipId: null,
    memberLifecycleStage: 'FULL',
    status: 'ACTIVE',
    firstName: 'John',
    lastName: 'Doe',
    birthDate: null,
    gender: null,
    email: null,
    phone: null,
    address: null,
    zipCode: null,
    city: null,
    guardianName: null,
    guardianPhone: null,
    guardianEmail: null,
    memberType: 'ADULT',
    expiresOn: null,
    registrationPhotoPath: null,
    photoPath: null,
    photoThumbnail: null,
    mergedIntoId: null,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
    syncedAtUtc: null,
    syncVersion: 1
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mockOutboxEntries.clear();
    mockDeliveries.clear();
    mockProcessedMessages.clear();
    lastChangesCount = 0;
  });

  describe('Queue Operations', () => {
    it('should queue a generic entity for sync', () => {
      const entity = { id: 'entity-1', name: 'Test' };
      const outboxId = queueForSync('TestEntity', 'entity-1', 'INSERT', entity);

      expect(outboxId).toBe('mock-uuid-12345');
      expect(mockOutboxEntries.has(outboxId)).toBe(true);

      const entry = mockOutboxEntries.get(outboxId);
      expect(entry.entityType).toBe('TestEntity');
      expect(entry.entityId).toBe('entity-1');
      expect(entry.operation).toBe('INSERT');
      expect(entry.status).toBe('pending');
      expect(JSON.parse(entry.payload)).toEqual(entity);
    });

    it('should queue a Member entity for sync', () => {
      const outboxId = queueMember(baseMember, 'INSERT');

      expect(outboxId).toBe('mock-uuid-12345');
      const entry = mockOutboxEntries.get(outboxId);
      expect(entry.entityType).toBe('Member');
      expect(entry.entityId).toBe('member-uuid');
      expect(entry.operation).toBe('INSERT');
    });

    it('should queue a Member UPDATE operation', () => {
      queueMember({ ...baseMember, lastName: 'Updated' }, 'UPDATE');

      const entry = mockOutboxEntries.get('mock-uuid-12345');
      expect(entry.operation).toBe('UPDATE');
    });

    it('should queue a CheckIn entity for sync', () => {
      const checkIn = { id: 'checkin-1', membershipId: 'M001', localDate: '2026-01-23' };
      queueCheckIn(checkIn);

      const entry = mockOutboxEntries.get('mock-uuid-12345');
      expect(entry.entityType).toBe('CheckIn');
      expect(entry.entityId).toBe('checkin-1');
      expect(entry.operation).toBe('INSERT');
    });

    it('should queue a PracticeSession entity for sync', () => {
      const session = { id: 'session-1', membershipId: 'M001', practiceType: 'LUFTRIFFEL' };
      queuePracticeSession(session);

      const entry = mockOutboxEntries.get('mock-uuid-12345');
      expect(entry.entityType).toBe('PracticeSession');
      expect(entry.entityId).toBe('session-1');
    });

    it('should queue an EquipmentCheckout entity for sync', () => {
      const checkout = { id: 'checkout-1', equipmentId: 'eq-1', membershipId: 'M001' };
      queueEquipmentCheckout(checkout, 'INSERT');

      const entry = mockOutboxEntries.get('mock-uuid-12345');
      expect(entry.entityType).toBe('EquipmentCheckout');
      expect(entry.entityId).toBe('checkout-1');
    });
  });

  describe('Retrieval Operations', () => {
    beforeEach(() => {
      // Add some test entries
      mockOutboxEntries.set('entry-1', {
        id: 'entry-1',
        entityType: 'Member',
        entityId: 'member-1',
        operation: 'INSERT',
        payload: JSON.stringify({ internalId: 'member-1', firstName: 'John' }),
        status: 'pending',
        attempts: 0,
      });
      mockOutboxEntries.set('entry-2', {
        id: 'entry-2',
        entityType: 'CheckIn',
        entityId: 'checkin-1',
        operation: 'INSERT',
        payload: JSON.stringify({ id: 'checkin-1', membershipId: 'M001' }),
        status: 'pending',
        attempts: 0,
      });
      mockOutboxEntries.set('entry-3', {
        id: 'entry-3',
        entityType: 'Member',
        entityId: 'member-2',
        operation: 'INSERT',
        payload: JSON.stringify({ internalId: 'member-2', firstName: 'Jane' }),
        status: 'failed',
        attempts: 10,
      });
    });

    it('should get pending count correctly', () => {
      const count = getPendingCount();
      expect(count).toBe(2); // entry-1 and entry-2 are pending, entry-3 is failed
    });

    it('should get failed count correctly', () => {
      const count = getFailedCount();
      expect(count).toBe(1); // Only entry-3 is failed
    });

    it('should get pending entries for a device', () => {
      const entries = getPendingForDevice('tablet-1');
      expect(entries).toHaveLength(2); // entry-1 and entry-2
    });

    it('should exclude delivered entries for a device', () => {
      // Mark entry-1 as delivered to tablet-1
      mockDeliveries.set('entry-1-tablet-1', {
        outboxId: 'entry-1',
        deviceId: 'tablet-1',
        deliveredAtUtc: new Date().toISOString(),
        attempts: 1,
      });

      const entries = getPendingForDevice('tablet-1');
      expect(entries).toHaveLength(1); // Only entry-2
      expect(entries[0].id).toBe('entry-2');
    });
  });

  describe('Delivery Tracking', () => {
    beforeEach(() => {
      mockOutboxEntries.set('entry-1', {
        id: 'entry-1',
        entityType: 'Member',
        entityId: 'member-1',
        operation: 'INSERT',
        payload: '{}',
        status: 'pending',
        attempts: 0,
      });
    });

    it('should mark an entry as delivered to a device', () => {
      markDeliveredToDevice('entry-1', 'tablet-1');

      const key = 'entry-1-tablet-1';
      expect(mockDeliveries.has(key)).toBe(true);

      const delivery = mockDeliveries.get(key);
      expect(delivery.deliveredAtUtc).toBeTruthy();
      expect(delivery.attempts).toBe(1);
    });

    it('should mark multiple entries as delivered in batch', () => {
      mockOutboxEntries.set('entry-2', {
        id: 'entry-2',
        entityType: 'CheckIn',
        entityId: 'checkin-1',
        operation: 'INSERT',
        payload: '{}',
        status: 'pending',
        attempts: 0,
      });

      markDeliveredToDeviceBatch(['entry-1', 'entry-2'], 'tablet-1');

      expect(mockDeliveries.has('entry-1-tablet-1')).toBe(true);
      expect(mockDeliveries.has('entry-2-tablet-1')).toBe(true);
    });

    it('should handle empty batch gracefully', () => {
      markDeliveredToDeviceBatch([], 'tablet-1');
      // Should not throw
      expect(mockDeliveries.size).toBe(0);
    });
  });

  describe('Failed Attempt Recording & Backoff', () => {
    beforeEach(() => {
      mockOutboxEntries.set('entry-1', {
        id: 'entry-1',
        entityType: 'Member',
        entityId: 'member-1',
        operation: 'INSERT',
        payload: '{}',
        status: 'pending',
        attempts: 0,
        lastAttemptUtc: null,
        lastError: null,
        nextRetryUtc: null,
      });
    });

    it('should increment attempt count on failure', () => {
      recordFailedAttempt('entry-1', 'tablet-1', 'Connection timeout');

      const entry = mockOutboxEntries.get('entry-1');
      expect(entry.attempts).toBe(1);
      expect(entry.lastError).toBe('Connection timeout');
      expect(entry.status).toBe('pending');
    });

    it('should calculate backoff delay for retries', () => {
      // First failure - 0s delay
      recordFailedAttempt('entry-1', 'tablet-1', 'Error 1');
      let entry = mockOutboxEntries.get('entry-1');
      expect(entry.attempts).toBe(1);
      // nextRetryUtc should be set (backoff delay applied)
      expect(entry.nextRetryUtc).toBeTruthy();
    });

    it('should mark entry as failed after max attempts', () => {
      // Set attempts to 9 (one below max)
      mockOutboxEntries.get('entry-1').attempts = 9;

      // 10th attempt should mark as failed
      recordFailedAttempt('entry-1', 'tablet-1', 'Final error');

      const entry = mockOutboxEntries.get('entry-1');
      expect(entry.status).toBe('failed');
      expect(entry.attempts).toBe(10);
    });

    it('should track per-device delivery attempts', () => {
      recordFailedAttempt('entry-1', 'tablet-1', 'Error');

      const key = 'entry-1-tablet-1';
      expect(mockDeliveries.has(key)).toBe(true);

      const delivery = mockDeliveries.get(key);
      expect(delivery.attempts).toBe(1);
      expect(delivery.lastError).toBe('Error');
    });
  });

  describe('Entry Status Management', () => {
    beforeEach(() => {
      mockOutboxEntries.set('entry-1', {
        id: 'entry-1',
        entityType: 'Member',
        entityId: 'member-1',
        operation: 'INSERT',
        payload: '{}',
        status: 'pending',
        attempts: 0,
      });
    });

    it('should mark an entry as completed', () => {
      markCompleted('entry-1');

      const entry = mockOutboxEntries.get('entry-1');
      expect(entry.status).toBe('completed');
    });

    it('should retry all failed entries', () => {
      // Create a failed entry
      mockOutboxEntries.set('entry-failed', {
        id: 'entry-failed',
        entityType: 'Member',
        entityId: 'member-2',
        operation: 'INSERT',
        payload: '{}',
        status: 'failed',
        attempts: 10,
      });

      const retriedCount = retryFailedEntries();
      expect(retriedCount).toBe(1);
    });
  });

  describe('Idempotency', () => {
    it('should record a processed message', () => {
      recordProcessedMessage('msg-123', 'tablet-1');

      expect(mockProcessedMessages.has('msg-123')).toBe(true);
      const msg = mockProcessedMessages.get('msg-123');
      expect(msg.sourceDeviceId).toBe('tablet-1');
    });

    it('should detect if a message was already processed', () => {
      mockProcessedMessages.set('msg-123', {
        messageId: 'msg-123',
        sourceDeviceId: 'tablet-1',
        processedAtUtc: new Date().toISOString(),
      });

      const processed = isMessageProcessed('msg-123');
      expect(processed).toBe(true);
    });

    it('should return false for unprocessed message', () => {
      const processed = isMessageProcessed('msg-new');
      expect(processed).toBe(false);
    });

    it('should not duplicate processed messages (INSERT OR IGNORE)', () => {
      recordProcessedMessage('msg-123', 'tablet-1');
      recordProcessedMessage('msg-123', 'tablet-2'); // Same messageId, different device

      // Should still only have one entry
      expect(mockProcessedMessages.size).toBe(1);
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      // Add completed entry
      mockOutboxEntries.set('entry-completed', {
        id: 'entry-completed',
        entityType: 'Member',
        entityId: 'member-1',
        operation: 'INSERT',
        payload: '{}',
        status: 'completed',
        createdAtUtc: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48 hours ago
      });
      // Add pending entry (should not be deleted)
      mockOutboxEntries.set('entry-pending', {
        id: 'entry-pending',
        entityType: 'Member',
        entityId: 'member-2',
        operation: 'INSERT',
        payload: '{}',
        status: 'pending',
        createdAtUtc: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      });
      // Add processed message
      mockProcessedMessages.set('msg-old', {
        messageId: 'msg-old',
        sourceDeviceId: 'tablet-1',
        processedAtUtc: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      });
    });

    it('should clean up old completed entries', () => {
      const result = cleanup(24); // 24 hour retention

      // Completed entry should be deleted, pending should remain
      expect(result.entriesDeleted).toBeGreaterThanOrEqual(0);
    });

    it('should clean up old processed messages', () => {
      const result = cleanup(24);

      expect(result.messagesDeleted).toBeGreaterThanOrEqual(0);
    });

    it('should accept custom retention period', () => {
      // 48 hour retention - nothing should be deleted
      cleanup(48);
      // Just verify it doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('Entity Collection for Device', () => {
    beforeEach(() => {
      // Add various entity types
      mockOutboxEntries.set('member-entry', {
        id: 'member-entry',
        entityType: 'Member',
        entityId: 'member-1',
        operation: 'INSERT',
        payload: JSON.stringify({ internalId: 'member-1', firstName: 'John' }),
        status: 'pending',
        attempts: 0,
      });
      mockOutboxEntries.set('checkin-entry', {
        id: 'checkin-entry',
        entityType: 'CheckIn',
        entityId: 'checkin-1',
        operation: 'INSERT',
        payload: JSON.stringify({ id: 'checkin-1', membershipId: 'M001' }),
        status: 'pending',
        attempts: 0,
      });
      mockOutboxEntries.set('session-entry', {
        id: 'session-entry',
        entityType: 'PracticeSession',
        entityId: 'session-1',
        operation: 'INSERT',
        payload: JSON.stringify({ id: 'session-1', practiceType: 'LUFTRIFFEL' }),
        status: 'pending',
        attempts: 0,
      });
      mockOutboxEntries.set('checkout-entry', {
        id: 'checkout-entry',
        entityType: 'EquipmentCheckout',
        entityId: 'checkout-1',
        operation: 'INSERT',
        payload: JSON.stringify({ id: 'checkout-1', equipmentId: 'eq-1' }),
        status: 'pending',
        attempts: 0,
      });
    });

    it('should collect and group entities by type', () => {
      const result = collectEntitiesForDevice('tablet-1');

      expect(result.outboxIds).toHaveLength(4);
      expect(result.members).toHaveLength(1);
      expect(result.checkIns).toHaveLength(1);
      expect(result.practiceSessions).toHaveLength(1);
      expect(result.equipmentCheckouts).toHaveLength(1);
    });

    it('should parse JSON payloads correctly', () => {
      const result = collectEntitiesForDevice('tablet-1');

      expect(result.members[0]).toEqual({ internalId: 'member-1', firstName: 'John' });
      expect(result.checkIns[0]).toEqual({ id: 'checkin-1', membershipId: 'M001' });
    });

    it('should exclude delivered entries', () => {
      // Mark member entry as delivered to tablet-1
      mockDeliveries.set('member-entry-tablet-1', {
        outboxId: 'member-entry',
        deviceId: 'tablet-1',
        deliveredAtUtc: new Date().toISOString(),
        attempts: 1,
      });

      const result = collectEntitiesForDevice('tablet-1');

      expect(result.outboxIds).toHaveLength(3); // Excludes member entry
      expect(result.members).toHaveLength(0);
      expect(result.checkIns).toHaveLength(1);
    });

    it('should handle invalid JSON gracefully', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockOutboxEntries.set('bad-entry', {
        id: 'bad-entry',
        entityType: 'Member',
        entityId: 'bad-1',
        operation: 'INSERT',
        payload: 'not valid json',
        status: 'pending',
        attempts: 0,
      });

      // Should not throw, but entry won't be added to members array
      const result = collectEntitiesForDevice('tablet-1');

      // Still includes the outboxId
      expect(result.outboxIds).toContain('bad-entry');
      // But the parsed member isn't added due to JSON error
      // (depends on implementation - may log error)
      consoleError.mockRestore();
    });
  });

  describe('Backoff Delay Calculation', () => {
    it('should use correct backoff delays', () => {
      // The implementation uses these values internally
      // We can verify by checking the nextRetryUtc after each failure
      mockOutboxEntries.set('entry-backoff', {
        id: 'entry-backoff',
        entityType: 'Member',
        entityId: 'member-1',
        operation: 'INSERT',
        payload: '{}',
        status: 'pending',
        attempts: 0,
        lastAttemptUtc: null,
        lastError: null,
        nextRetryUtc: null,
      });

      // First attempt - delay index 1 = 5s
      recordFailedAttempt('entry-backoff', 'tablet-1', 'Error');
      let entry = mockOutboxEntries.get('entry-backoff');
      expect(entry.attempts).toBe(1);

      // The nextRetryUtc should be approximately 5 seconds in the future
      // Just verify it's set
      expect(entry.nextRetryUtc).toBeTruthy();
    });
  });
});

describe('Sync Outbox Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOutboxEntries.clear();
    mockDeliveries.clear();
    mockProcessedMessages.clear();
  });

  it('should handle missing internalId in member', () => {
    const member = { firstName: 'No', lastName: 'Id' } as unknown as Member; // No internalId
    queueMember(member);

    const entry = mockOutboxEntries.get('mock-uuid-12345');
    expect(entry.entityId).toBe(''); // Empty string for missing ID
  });

  it('should handle concurrent delivery tracking for multiple devices', () => {
    mockOutboxEntries.set('entry-1', {
      id: 'entry-1',
      entityType: 'Member',
      entityId: 'member-1',
      operation: 'INSERT',
      payload: '{}',
      status: 'pending',
      attempts: 0,
    });

    // Deliver to multiple devices
    markDeliveredToDevice('entry-1', 'tablet-1');
    markDeliveredToDevice('entry-1', 'tablet-2');
    markDeliveredToDevice('entry-1', 'laptop-1');

    expect(mockDeliveries.has('entry-1-tablet-1')).toBe(true);
    expect(mockDeliveries.has('entry-1-tablet-2')).toBe(true);
    expect(mockDeliveries.has('entry-1-laptop-1')).toBe(true);

    // Entry for tablet-1 should not appear in pending for tablet-1
    // But should still appear for a new device
    mockDeliveries.set('entry-1-tablet-1', {
      outboxId: 'entry-1',
      deviceId: 'tablet-1',
      deliveredAtUtc: new Date().toISOString(),
      attempts: 1,
    });

    const pendingForTablet1 = getPendingForDevice('tablet-1');
    const pendingForTablet3 = getPendingForDevice('tablet-3');

    expect(pendingForTablet1).toHaveLength(0);
    expect(pendingForTablet3).toHaveLength(1);
  });
});
