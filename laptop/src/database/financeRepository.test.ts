/**
 * Unit tests for finance repository fee rate operations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./db', () => ({
  execute: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn((fn: () => void) => fn()),
}));

import { execute, query } from './db';
import { getFeeRate, getFeeRatesForYear, getMemberFeeStatus, setFeeRate } from './financeRepository';

beforeEach(() => {
  vi.mocked(execute).mockClear();
  vi.mocked(query).mockClear();
});

describe('Fee rate management', () => {
  it('sets fee rate for a year and member type', () => {
    setFeeRate(2026, 'CHILD', 250);

    expect(vi.mocked(execute)).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(execute).mock.calls[0];
    expect(sql).toContain('INSERT OR REPLACE INTO FeeRate');
    expect(params).toEqual([2026, 'CHILD', 250]);
  });

  it('returns fee rate for a year and member type', () => {
    vi.mocked(query).mockImplementation((sql: string) => {
      if (sql.includes('SELECT feeAmount FROM FeeRate')) {
        return [{ feeAmount: 450 }];
      }
      return [];
    });

    expect(getFeeRate(2026, 'ADULT')).toBe(450);
  });

  it('returns 0 when fee rate is missing', () => {
    vi.mocked(query).mockReturnValueOnce([]);
    expect(getFeeRate(2026, 'CHILD_PLUS')).toBe(0);
  });

  it('calculates member fee status using year rates', () => {
    vi.mocked(query).mockImplementation((sql: string) => {
      if (sql.includes('FROM Member m')) {
        return [
          {
            memberId: 'M1',
            firstName: 'Anna',
            lastName: 'Jensen',
            memberType: 'CHILD',
            paidAmount: 100,
            paymentDates: '2026-01-10',
          },
        ];
      }
      if (sql.includes('FROM FeeRate')) {
        return [
          { fiscalYear: 2026, memberType: 'ADULT', feeAmount: 600 },
          { fiscalYear: 2026, memberType: 'CHILD', feeAmount: 300 },
          { fiscalYear: 2026, memberType: 'CHILD_PLUS', feeAmount: 600 },
        ];
      }
      return [];
    });

    const status = getMemberFeeStatus(2026);

    expect(status).toHaveLength(1);
    expect(status[0]).toEqual({
      memberId: 'M1',
      memberName: 'Anna Jensen',
      memberType: 'CHILD',
      expectedFee: 300,
      paidAmount: 100,
      outstanding: 200,
      paymentDates: ['2026-01-10'],
    });
  });

  it('returns all fee rates for a year', () => {
    vi.mocked(query).mockReturnValueOnce([
      { fiscalYear: 2026, memberType: 'ADULT', feeAmount: 600 },
      { fiscalYear: 2026, memberType: 'CHILD', feeAmount: 300 },
    ]);

    expect(getFeeRatesForYear(2026)).toEqual([
      { fiscalYear: 2026, memberType: 'ADULT', feeAmount: 600 },
      { fiscalYear: 2026, memberType: 'CHILD', feeAmount: 300 },
    ]);
  });
});
