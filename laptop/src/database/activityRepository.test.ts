import { describe, expect, it, vi } from 'vitest';
import { query } from './db';
import {
  getAttendanceCountsByDay,
  getMemberActivityTimeline,
  getPracticeMembersForGroup,
  type ActivityType
} from './activityRepository';

vi.mock('./db', () => ({
  query: vi.fn()
}));

describe('activityRepository', () => {
  it('filters attendance counts by trial members when requested', () => {
    vi.mocked(query).mockReturnValueOnce([
      { localDate: '2026-01-01', memberCount: 2 }
    ]);

    const result = getAttendanceCountsByDay('2026-01-01', '2026-01-31', 'only-trial');

    expect(result).toEqual([{ localDate: '2026-01-01', memberCount: 2 }]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("memberLifecycleStage = 'TRIAL'"),
      ['2026-01-01', '2026-01-31']
    );
  });

  it('returns practice group members with correct parameters', () => {
    vi.mocked(query).mockReturnValueOnce([
      {
        internalId: 'member-1',
        membershipId: 'M001',
        firstName: 'Anne',
        lastName: 'Hansen',
        memberLifecycleStage: 'FULL',
        sessionCount: 3
      }
    ]);

    const result = getPracticeMembersForGroup(
      '2026-01-01',
      '2026-01-31',
      'RIFLE',
      'A',
      'without-trial'
    );

    expect(result).toHaveLength(1);
    expect(result[0].sessionCount).toBe(3);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("memberLifecycleStage = 'FULL'"),
      ['2026-01-01', '2026-01-31', 'RIFLE', 'A']
    );
  });

  it('builds equipment checkout timeline entries within date range', () => {
    vi.mocked(query).mockReturnValueOnce([
      {
        id: 'checkout-1',
        checkedOutAtUtc: '2026-01-25T10:00:00Z',
        checkedInAtUtc: null,
        equipmentId: 'equip-1',
        equipmentName: 'Test våben'
      }
    ]);

    const activityTypes: ActivityType[] = ['EQUIPMENT_CHECKOUT'];
    const result = getMemberActivityTimeline('member-1', {
      startDate: '2026-01-25',
      endDate: '2026-01-25',
      activityTypes
    });

    expect(result).toHaveLength(1);
    expect(result[0].activityType).toBe('EQUIPMENT_CHECKOUT');
  });
});
