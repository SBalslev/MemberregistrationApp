import { describe, it, expect } from 'vitest';
import { buildPendingDeleteSummary } from './pendingDeleteUtils';

const basePending = {
  entityType: 'member',
  entityId: 'uuid-123',
  deletedAt: '2026-02-03T10:00:00Z',
};

describe('buildPendingDeleteSummary', () => {
  it('formats member summary with membership id', () => {
    const summary = buildPendingDeleteSummary(basePending, {
      firstName: 'Anna',
      lastName: 'Jensen',
      membershipId: 'M-42',
      internalId: 'uuid-123',
    });

    expect(summary.title).toBe('Medlem: Anna Jensen');
    expect(summary.subtitle).toBe('Medlemsnr: M-42 · ID: uuid-123');
  });

  it('formats trial member summary when membership id is missing', () => {
    const summary = buildPendingDeleteSummary(basePending, {
      firstName: 'Bo',
      lastName: 'Hansen',
      membershipId: null,
      internalId: 'uuid-123',
    });

    expect(summary.title).toBe('Medlem: Bo Hansen');
    expect(summary.subtitle).toBe('Prøvemedlem · ID: uuid-123');
  });

  it('formats non-member entity summary', () => {
    const summary = buildPendingDeleteSummary(
      { ...basePending, entityType: 'check_in', entityId: 'check-1' },
      null
    );

    expect(summary.title).toBe('Sletning: check_in');
    expect(summary.subtitle).toBe('ID: check-1');
  });

  it('handles missing member info', () => {
    const summary = buildPendingDeleteSummary(basePending, undefined);

    expect(summary.title).toBe('Medlem: Ukendt medlem');
    expect(summary.subtitle).toBe('Prøvemedlem · ID: uuid-123');
  });
});
