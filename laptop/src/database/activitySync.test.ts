import initSqlJs from 'sql.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
  execute: vi.fn(),
  query: vi.fn(() => []),
  getDatabase: vi.fn(),
}));
vi.mock('../utils/photoStorage', () => ({ processPhoto: vi.fn() }));

import { execute } from './db';
import { processSyncPayload } from './syncService';

describe('Activity lifecycle sync ordering', () => {
  it('preserves completion against stale updates and allows an explicit newer restart', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(`CREATE TABLE Activity (
      id TEXT PRIMARY KEY, title TEXT, type TEXT, startsAtUtc TEXT, endsAtUtc TEXT,
      status TEXT, displayEnabled INTEGER, createdAtUtc TEXT, updatedAtUtc TEXT,
      deviceId TEXT, syncVersion INTEGER, syncedAtUtc TEXT
    )`);
    vi.mocked(execute).mockImplementation((sql, params) => { db.run(sql, params); });
    const base = {
      id: 'activity', title: 'Klubskydning', type: 'COMPETITION',
      startsAtUtc: '2026-11-23T17:00:00Z', createdAtUtc: '2026-11-23T17:00:00Z',
      displayEnabled: true, deviceId: 'trainer', status: 'COMPLETED',
      endsAtUtc: '2026-11-23T18:00:00Z', modifiedAtUtc: '2026-11-23T18:00:00Z',
      syncVersion: 2,
    };
    async function apply(activity: typeof base) {
      const result = await processSyncPayload({
        deviceId: 'trainer', deviceType: 'TRAINER_TABLET', schemaVersion: '1.12.0',
        timestamp: activity.modifiedAtUtc, entities: { activities: [activity] },
      });
      expect(result.errors).toEqual([]);
    }
    function status() {
      return db.exec('SELECT status FROM Activity')[0].values[0][0];
    }
    try {
      await apply(base);
      await apply({ ...base, status: 'ACTIVE', modifiedAtUtc: '2026-11-23T17:59:00Z', syncVersion: 99 });
      expect(status()).toBe('COMPLETED');
      await apply({ ...base, status: 'ACTIVE', syncVersion: 99 });
      expect(status()).toBe('COMPLETED');
      await apply({ ...base, status: 'ACTIVE', modifiedAtUtc: '2026-11-23T19:00:00Z' });
      expect(status()).toBe('ACTIVE');
      await apply({ ...base, modifiedAtUtc: '2026-11-23T20:00:00Z', syncVersion: 1 });
      expect(status()).toBe('COMPLETED');
      const invalid = await processSyncPayload({
        deviceId: 'trainer', deviceType: 'TRAINER_TABLET', schemaVersion: '1.12.0',
        timestamp: base.modifiedAtUtc,
        entities: { activities: [{ ...base, modifiedAtUtc: 'not-a-timestamp' }] },
      });
      expect(invalid.activitiesProcessed).toBe(0);
      expect(invalid.errors).toEqual(['Activity activity: Invalid activity modification timestamp']);
      expect(status()).toBe('COMPLETED');
      await apply({ ...base, status: 'ACTIVE', modifiedAtUtc: '2026-11-23T20:00:00+00:00', syncVersion: 99 });
      expect(status()).toBe('COMPLETED');
      db.run("UPDATE Activity SET status='ACTIVE'");
      await apply({ ...base, modifiedAtUtc: '2026-11-23T20:00:00Z', syncVersion: 1 });
      expect(status()).toBe('COMPLETED');
    } finally {
      db.close();
      vi.mocked(execute).mockReset();
    }
  });
});
