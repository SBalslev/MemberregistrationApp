/**
 * Unit tests for SKV repository.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDefaultSkvRegistration, upsertSkvRegistration } from './skvRepository';

const executeMock = vi.fn();
const queryMock = vi.fn();

vi.mock('./db', () => ({
  execute: (sql: string, params?: unknown[]) => executeMock(sql, params),
  query: <T>(sql: string, params?: unknown[]): T[] => queryMock(sql, params)
}));

beforeEach(() => {
  executeMock.mockClear();
  queryMock.mockClear();
});

describe('SKV repository', () => {
  it('returns default SKV registration for missing data', () => {
    const registration = getDefaultSkvRegistration('member-1');
    expect(registration.memberId).toBe('member-1');
    expect(registration.skvLevel).toBe(6);
    expect(registration.status).toBe('not_started');
  });

  it('inserts SKV registration when missing', () => {
    queryMock.mockReturnValueOnce([]);

    const result = upsertSkvRegistration({
      memberId: 'member-1',
      skvLevel: 6,
      status: 'requested',
      lastApprovedDate: null
    });

    expect(result.memberId).toBe('member-1');
    expect(result.status).toBe('requested');
    expect(executeMock).toHaveBeenCalled();
  });

  it('updates SKV registration when it exists', () => {
    queryMock.mockReturnValueOnce([
      {
        id: 'skv-1',
        memberId: 'member-1',
        skvLevel: 6,
        status: 'not_started',
        lastApprovedDate: null,
        createdAtUtc: '2026-01-01T00:00:00Z',
        updatedAtUtc: '2026-01-01T00:00:00Z'
      }
    ]);

    const result = upsertSkvRegistration({
      memberId: 'member-1',
      skvLevel: 3,
      status: 'approved',
      lastApprovedDate: '2026-01-10'
    });

    expect(result.skvLevel).toBe(3);
    expect(result.status).toBe('approved');
    expect(executeMock).toHaveBeenCalled();
  });
});
