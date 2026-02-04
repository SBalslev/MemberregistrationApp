// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { MemberActivityOverviewPage } from './MemberActivityOverviewPage';

vi.mock('../database', () => ({
  getSeasonDateRange: () => ({ startDate: '2026-01-01', endDate: '2026-01-31' }),
  getDailyAttendanceMembers: () => [],
  getAttendanceCountsByDay: () => [{ localDate: '2026-01-02', memberCount: 3 }],
  getAttendanceBreakdown: () => [],
  getPracticeTypeOptions: () => ['RIFLE'],
  getPracticeClassificationOptions: () => ['A'],
  getPracticeSummaryByDisciplineAndClassification: () => [
    { practiceType: 'RIFLE', classification: 'A', sessionCount: 4, memberCount: 2 }
  ],
  getPracticeMembersForGroup: () => [
    {
      internalId: 'member-1',
      membershipId: 'M001',
      firstName: 'Anne',
      lastName: 'Hansen',
      memberLifecycleStage: 'FULL',
      sessionCount: 2
    }
  ],
  getPracticeCountsByDay: () => [
    { localDate: '2026-01-02', sessionCount: 4, memberCount: 2, totalPoints: 8 }
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
      bestSession: 15
    }
  ],
  getClassificationComparison: () => [
    { classification: 'A', memberCount: 2, sessionCount: 10, totalPoints: 100, avgPointsPerSession: 10, avgPointsPerMember: 50 },
    { classification: 'B', memberCount: 3, sessionCount: 15, totalPoints: 90, avgPointsPerSession: 6, avgPointsPerMember: 30 }
  ],
  getMemberPracticeStats: () => null
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
    expect(screen.getByText('2026-01-02')).toBeTruthy();
    expect(screen.getByText('3 medlemmer')).toBeTruthy();
  });

  it('opens practice drill-down member list', () => {
    render(<MemberActivityOverviewPage />);

    fireEvent.click(screen.getByText('Træning'));
    // Click the drill-down button in "Fordelt på våbentype" section, not the filter chip
    const drillDownButton = screen.getByRole('button', { name: /RIFLE.*4 pas.*2 medlemmer/s });
    fireEvent.click(drillDownButton);

    expect(screen.getByText('Medlemmer i udvalgt gruppe')).toBeTruthy();
    // Anne Hansen appears multiple times (in leaderboard and member list), so check for at least one
    expect(screen.getAllByText('Anne Hansen').length).toBeGreaterThanOrEqual(1);
  });
});
