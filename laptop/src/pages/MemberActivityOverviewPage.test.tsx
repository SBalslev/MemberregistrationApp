// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { MemberActivityOverviewPage } from './MemberActivityOverviewPage';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ width, height, children }: { width?: number | string; height?: number | string; children: ReactNode | ((args: { width: number; height: number }) => ReactNode) }) => (
      <div style={{ width: width ?? 800, height: height ?? 400 }}>
        {typeof children === 'function' ? children({ width: 800, height: 400 }) : children}
      </div>
    )
  };
});

vi.mock('../database', () => ({
  getSeasonDateRange: () => ({ startDate: '2026-01-01', endDate: '2026-01-31' }),
  getDailyAttendanceMembers: () => [],
  getAttendanceCountsByDay: () => [{ localDate: '2026-01-02', memberCount: 3 }],
  getAttendanceBreakdown: () => [],
  getPracticeTypeOptions: () => ['RIFLE'],
  getPracticeClassificationOptions: () => ['A'],
  getPracticeCountsByDayAndType: () => [
    { localDate: '2026-01-02', practiceType: 'RIFLE', sessionCount: 3 },
    { localDate: '2026-01-02', practiceType: 'PISTOL', sessionCount: 1 }
  ],
  getDailyPracticeSessions: () => [],
  getPracticeTotals: () => ({ totalSessions: 4, totalMembers: 2, totalPoints: 8 }),
  getPracticeLeaderboard: () => [
    {
      rank: 1,
      internalId: 'member-1',
      membershipId: 'M001',
      firstName: 'Anne',
      lastName: 'Hansen',
      memberLifecycleStage: 'FULL',
      totalPoints: 100,
      sessionCount: 10,
      avgPointsPerSession: 10,
      avgKrydserPerSession: 1,
      bestSession: 15
    }
  ],
  getMemberPracticeStats: () => null,
  getMemberPracticeSeries: () => [
    { localDate: '2026-01-02', points: 180, krydser: 2, createdAtUtc: '2026-01-02T18:30:00Z' }
  ],
}));

describe('MemberActivityOverviewPage', () => {
  it('renders Danish tabs and filter labels', () => {
    render(<MemberActivityOverviewPage />);

    expect(screen.getByText('Fremmøde')).toBeTruthy();
    expect(screen.getByText('Træning')).toBeTruthy();
    expect(screen.getByText('Periode')).toBeTruthy();
    expect(screen.getByText('Prøveforløb')).toBeTruthy();
    expect(screen.getByText('Aktivitetstyper')).toBeTruthy();
  });

  it('shows multi-day attendance view by default', () => {
    render(<MemberActivityOverviewPage />);

    expect(screen.getByText('Fremmøde over flere dage')).toBeTruthy();
    expect(screen.getAllByText('2026-01-02').length).toBeGreaterThan(0);
    expect(screen.getByText('3 medlemmer')).toBeTruthy();
  });

  it('shows stacked practice chart and drilldown hint', () => {
    render(<MemberActivityOverviewPage />);

    fireEvent.click(screen.getByText('Træning'));

    expect(screen.getByText('Træningspas over tid')).toBeTruthy();
    expect(screen.getByText('Klik på en dag i diagrammet for at se detaljer.')).toBeTruthy();
  });
});
