/**
 * Unit tests for finance repository operations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./db', () => ({
  execute: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn((fn: () => void) => fn()),
}));

import { execute, query } from './db';
import { getFeeRate, getFeeRatesForYear, getMemberFeeStatus, setFeeRate, markPaymentsAsConsolidated, markPaymentAsPaidExternally, getExternallyPaidFeePayments } from './financeRepository';

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

  it('sets fee rate for HONORARY members (0 kr)', () => {
    setFeeRate(2026, 'HONORARY', 0);

    expect(vi.mocked(execute)).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(execute).mock.calls[0];
    expect(sql).toContain('INSERT OR REPLACE INTO FeeRate');
    expect(params).toEqual([2026, 'HONORARY', 0]);
  });

  it('returns 0 fee rate for HONORARY members', () => {
    vi.mocked(query).mockImplementation((sql: string) => {
      if (sql.includes('SELECT feeAmount FROM FeeRate')) {
        return [{ feeAmount: 0 }];
      }
      return [];
    });

    expect(getFeeRate(2026, 'HONORARY')).toBe(0);
  });

  it('calculates HONORARY member as fully paid with 0 expected', () => {
    vi.mocked(query).mockImplementation((sql: string) => {
      if (sql.includes('FROM Member m')) {
        return [
          {
            memberId: 'H1',
            firstName: 'Erik',
            lastName: 'Hansen',
            memberType: 'HONORARY',
            paidAmount: 0,
            paymentDates: null,
          },
        ];
      }
      if (sql.includes('FROM FeeRate')) {
        return [
          { fiscalYear: 2026, memberType: 'ADULT', feeAmount: 600 },
          { fiscalYear: 2026, memberType: 'CHILD', feeAmount: 300 },
          { fiscalYear: 2026, memberType: 'CHILD_PLUS', feeAmount: 600 },
          { fiscalYear: 2026, memberType: 'HONORARY', feeAmount: 0 },
        ];
      }
      return [];
    });

    const status = getMemberFeeStatus(2026);

    expect(status).toHaveLength(1);
    expect(status[0]).toEqual({
      memberId: 'H1',
      memberName: 'Erik Hansen',
      memberType: 'HONORARY',
      expectedFee: 0,
      paidAmount: 0,
      outstanding: 0,
      paymentDates: [],
    });
  });
});

describe('Pending payments consolidation', () => {
  it('marks multiple payments as consolidated with transaction ID', () => {
    const paymentIds = ['pay-1', 'pay-2', 'pay-3'];
    const transactionId = 'txn-abc';

    markPaymentsAsConsolidated(paymentIds, transactionId);

    expect(vi.mocked(execute)).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(execute).mock.calls[0];
    expect(sql).toContain('UPDATE PendingFeePayment');
    expect(sql).toContain('SET isConsolidated = 1');
    expect(sql).toContain('consolidatedTransactionId = ?');
    expect(sql).toContain('WHERE id IN (?,?,?)');
    expect(params?.[0]).toBe(transactionId);
    expect(params?.slice(2)).toEqual(paymentIds);
  });

  it('does nothing when payment IDs array is empty', () => {
    markPaymentsAsConsolidated([], 'txn-abc');

    expect(vi.mocked(execute)).not.toHaveBeenCalled();
  });

  it('marks a single payment as consolidated', () => {
    const paymentIds = ['pay-single'];
    const transactionId = 'txn-single';

    markPaymentsAsConsolidated(paymentIds, transactionId);

    expect(vi.mocked(execute)).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(execute).mock.calls[0];
    expect(sql).toContain('WHERE id IN (?)');
    expect(params?.[0]).toBe(transactionId);
    expect(params?.[2]).toBe('pay-single');
  });

  it('includes updatedAtUtc in the update', () => {
    markPaymentsAsConsolidated(['pay-1'], 'txn-1');

    const [sql, params] = vi.mocked(execute).mock.calls[0];
    expect(sql).toContain('updatedAtUtc = ?');
    // Second parameter should be a timestamp string
    expect(typeof params?.[1]).toBe('string');
    expect(params?.[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('only updates unconsolidated payments', () => {
    markPaymentsAsConsolidated(['pay-1'], 'txn-1');

    const [sql] = vi.mocked(execute).mock.calls[0];
    expect(sql).toContain('AND isConsolidated = 0');
  });
});

describe('Mark payment as paid externally', () => {
  it('marks a payment as consolidated with year in notes', () => {
    markPaymentAsPaidExternally('pay-123', 2025);

    expect(vi.mocked(execute)).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(execute).mock.calls[0];
    expect(sql).toContain('UPDATE PendingFeePayment');
    expect(sql).toContain('SET isConsolidated = 1');
    expect(sql).toContain('consolidatedTransactionId = NULL');
    expect(sql).toContain('notes = ?');
    expect(params?.[0]).toBe('Betalt i 2025');
    expect(params?.[2]).toBe('pay-123');
  });

  it('appends year to existing notes', () => {
    markPaymentAsPaidExternally('pay-456', 2024, 'Eksisterende note');

    const [, params] = vi.mocked(execute).mock.calls[0];
    expect(params?.[0]).toBe('Eksisterende note - Betalt i 2024');
  });

  it('includes updatedAtUtc timestamp', () => {
    markPaymentAsPaidExternally('pay-789', 2025);

    const [sql, params] = vi.mocked(execute).mock.calls[0];
    expect(sql).toContain('updatedAtUtc = ?');
    expect(typeof params?.[1]).toBe('string');
    expect(params?.[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('only updates unconsolidated payments', () => {
    markPaymentAsPaidExternally('pay-1', 2025);

    const [sql] = vi.mocked(execute).mock.calls[0];
    expect(sql).toContain('AND isConsolidated = 0');
  });
});

describe('Get externally paid fee payments', () => {
  it('returns payments that are consolidated but have no transaction ID', () => {
    vi.mocked(query).mockReturnValueOnce([
      {
        id: 'pay-ext-1',
        fiscalYear: 2026,
        memberId: 'M1',
        amount: 600,
        paymentDate: '2026-01-15',
        paymentMethod: 'CASH',
        notes: 'Betalt i 2025',
        isConsolidated: 1,
        consolidatedTransactionId: null,
        createdAtUtc: '2026-01-15T10:00:00Z',
        updatedAtUtc: '2026-01-16T10:00:00Z',
        memberName: 'Anders Andersen',
        memberType: 'ADULT',
      },
    ]);

    const result = getExternallyPaidFeePayments(2026);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'pay-ext-1',
      memberId: 'M1',
      amount: 600,
      memberName: 'Anders Andersen',
      isConsolidated: true,
      consolidatedTransactionId: null,
    }));
  });

  it('queries for consolidated payments without transaction ID', () => {
    vi.mocked(query).mockReturnValueOnce([]);

    getExternallyPaidFeePayments(2026);

    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toContain('isConsolidated = 1');
    expect(sql).toContain('consolidatedTransactionId IS NULL');
    expect(params).toEqual([2026]);
  });

  it('returns empty array when no externally paid payments exist', () => {
    vi.mocked(query).mockReturnValueOnce([]);

    const result = getExternallyPaidFeePayments(2026);

    expect(result).toEqual([]);
  });
});
