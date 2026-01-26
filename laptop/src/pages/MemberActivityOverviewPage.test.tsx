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
  ]
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
    fireEvent.click(screen.getByRole('button', { name: /RIFLE/ }));

    expect(screen.getByText('Medlemmer i udvalgt gruppe')).toBeTruthy();
    expect(screen.getByText('Anne Hansen')).toBeTruthy();
  });
});
