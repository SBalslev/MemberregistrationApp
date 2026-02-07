/**
 * Member activity overview page.
 * Provides attendance and practice insights.
 */

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  getAttendanceBreakdown,
  getAttendanceCountsByDay,
  getDailyAttendanceMembers,
  getDailyPracticeSessions,
  getMemberPracticeSeries,
  getMemberPracticeStats,
  getPracticeClassificationOptions,
  getPracticeCountsByDayAndType,
  getPracticeLeaderboard,
  getPracticeTotals,
  getPracticeTypeOptions,
  getSeasonDateRange,
  type TrialFilter,
  type PracticeCountByTypeRow,
  type DailyPracticeSessionRow,
  type LeaderboardRow,
  type MemberPracticeStats,
  type MemberPracticeSeriesRow
} from '../database';

const DEFAULT_PAGE_SIZE = 50;

type ActivityTab = 'attendance' | 'practice';
type ActivityTypeFilter = 'all' | 'check-in' | 'practice-session';

type TrialFilterOption = {
  value: TrialFilter;
  label: string;
};

const trialFilterOptions: TrialFilterOption[] = [
  { value: 'all', label: 'Alle' },
  { value: 'without-trial', label: 'Uden prøvemedlemskab' },
  { value: 'only-trial', label: 'Kun prøvemedlemskab' }
];

export function MemberActivityOverviewPage() {
  const season = getSeasonDateRange();
  const [activeTab, setActiveTab] = useState<ActivityTab>('attendance');
  const [startDate, setStartDate] = useState(season.startDate);
  const [endDate, setEndDate] = useState(season.endDate);
  const [trialFilter, setTrialFilter] = useState<TrialFilter>('all');
  const [activityTypeFilter, setActivityTypeFilter] = useState<ActivityTypeFilter>('all');
  const [practiceTypes, setPracticeTypes] = useState<string[]>([]);
  const [classifications, setClassifications] = useState<string[]>([]);
  const [attendancePage, setAttendancePage] = useState(1);
  const [countsPage, setCountsPage] = useState(1);
  const [dailyPracticePage, setDailyPracticePage] = useState(1);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [practiceDrilldownRange, setPracticeDrilldownRange] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);
  const [printTarget, setPrintTarget] = useState<'leaderboard' | 'member' | null>(null);

  const isSingleDay = startDate === endDate;

  const attendanceRows = useMemo(() => {
    if (!isSingleDay) return [];
    return getDailyAttendanceMembers(startDate, trialFilter);
  }, [isSingleDay, startDate, trialFilter]);

  const attendanceCounts = useMemo(() => {
    if (isSingleDay) return [];
    return getAttendanceCountsByDay(startDate, endDate, trialFilter);
  }, [isSingleDay, startDate, endDate, trialFilter]);

  const attendanceBreakdown = useMemo(() => {
    if (isSingleDay) return [];
    return getAttendanceBreakdown(startDate, endDate);
  }, [isSingleDay, startDate, endDate]);

  const practiceTypeOptions = useMemo(
    () => getPracticeTypeOptions(startDate, endDate, trialFilter),
    [startDate, endDate, trialFilter]
  );

  const classificationOptions = useMemo(
    () => getPracticeClassificationOptions(startDate, endDate, trialFilter, practiceTypes),
    [startDate, endDate, trialFilter, practiceTypes]
  );

  const practiceCountsByType: PracticeCountByTypeRow[] = useMemo(() => {
    if (isSingleDay) return [];
    return getPracticeCountsByDayAndType(startDate, endDate, trialFilter, practiceTypes, classifications);
  }, [isSingleDay, startDate, endDate, trialFilter, practiceTypes, classifications]);

  const stackedPracticeCounts = useMemo(() => {
    if (practiceCountsByType.length === 0) return [] as Array<Record<string, number | string>>;
    const grouped = new Map<string, Record<string, number | string>>();
    for (const row of practiceCountsByType) {
      const existing = grouped.get(row.localDate) ?? { localDate: row.localDate };
      existing[row.practiceType] = row.sessionCount;
      grouped.set(row.localDate, existing);
    }
    return Array.from(grouped.values());
  }, [practiceCountsByType]);

  const practiceTypeColorMap = useMemo(() => {
    const palette = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6'];
    const map: Record<string, string> = {};
    practiceTypeOptions.forEach((type, index) => {
      map[type] = palette[index % palette.length];
    });
    return map;
  }, [practiceTypeOptions]);

  const dailyPracticeSessions: DailyPracticeSessionRow[] = useMemo(() => {
    if (!isSingleDay) return [];
    return getDailyPracticeSessions(startDate, trialFilter, practiceTypes, classifications);
  }, [isSingleDay, startDate, trialFilter, practiceTypes, classifications]);

  const practiceTotals = useMemo(() => {
    return getPracticeTotals(startDate, endDate, trialFilter, practiceTypes, classifications);
  }, [startDate, endDate, trialFilter, practiceTypes, classifications]);

  const leaderboard: LeaderboardRow[] = useMemo(() => {
    return getPracticeLeaderboard(startDate, endDate, trialFilter, practiceTypes, classifications, 20);
  }, [startDate, endDate, trialFilter, practiceTypes, classifications]);

  const selectedMemberStats: MemberPracticeStats | null = useMemo(() => {
    if (!selectedMemberId) return null;
    return getMemberPracticeStats(selectedMemberId, startDate, endDate, practiceTypes, classifications);
  }, [selectedMemberId, startDate, endDate, practiceTypes, classifications]);

  const selectedMemberSeries: MemberPracticeSeriesRow[] = useMemo(() => {
    if (!selectedMemberId) return [];
    return getMemberPracticeSeries(selectedMemberId, startDate, endDate, practiceTypes, classifications);
  }, [selectedMemberId, startDate, endDate, practiceTypes, classifications]);

  const selectedMemberSeriesChart = useMemo(() => {
    return selectedMemberSeries.map((row) => ({
      ...row,
      sessionLabel: `${row.localDate} ${row.createdAtUtc.substring(11, 16)}`
    }));
  }, [selectedMemberSeries]);

  const pagedAttendanceRows = useMemo(() => {
    const start = (attendancePage - 1) * DEFAULT_PAGE_SIZE;
    return attendanceRows.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [attendancePage, attendanceRows]);

  const pagedAttendanceCounts = useMemo(() => {
    const start = (countsPage - 1) * DEFAULT_PAGE_SIZE;
    return attendanceCounts.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [attendanceCounts, countsPage]);

  const attendanceTotalPages = Math.max(1, Math.ceil(attendanceRows.length / DEFAULT_PAGE_SIZE));
  const countsTotalPages = Math.max(1, Math.ceil(attendanceCounts.length / DEFAULT_PAGE_SIZE));
  const dailyPracticeTotalPages = Math.max(1, Math.ceil(dailyPracticeSessions.length / DEFAULT_PAGE_SIZE));
  const pagedDailyPracticeSessions = useMemo(() => {
    const start = (dailyPracticePage - 1) * DEFAULT_PAGE_SIZE;
    return dailyPracticeSessions.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [dailyPracticeSessions, dailyPracticePage]);

  function handleTabChange(tab: ActivityTab) {
    setActiveTab(tab);
    setActivityTypeFilter('all');
  }

  function handleActivityTypeChange(value: ActivityTypeFilter) {
    setActivityTypeFilter(value);
    if (value === 'check-in') setActiveTab('attendance');
    if (value === 'practice-session') setActiveTab('practice');
  }

  function handleDateChange(nextStart: string, nextEnd: string) {
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setAttendancePage(1);
    setCountsPage(1);
    setDailyPracticePage(1);
    setPracticeDrilldownRange(null);
  }

  function togglePracticeType(type: string) {
    setPracticeTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
    setDailyPracticePage(1);
  }

  function toggleClassification(classification: string) {
    setClassifications((prev) =>
      prev.includes(classification)
        ? prev.filter((c) => c !== classification)
        : [...prev, classification]
    );
    setDailyPracticePage(1);
  }

  function applyDateRange(day: string) {
    handleDateChange(day, day);
  }

  function applyPracticeDrilldown(day: string) {
    setPracticeDrilldownRange({ startDate, endDate });
    setStartDate(day);
    setEndDate(day);
    setAttendancePage(1);
    setCountsPage(1);
    setDailyPracticePage(1);
  }

  function restorePracticeDrilldown() {
    if (!practiceDrilldownRange) return;
    setStartDate(practiceDrilldownRange.startDate);
    setEndDate(practiceDrilldownRange.endDate);
    setPracticeDrilldownRange(null);
    setDailyPracticePage(1);
  }

  function handleMemberSelect(internalId: string) {
    setSelectedMemberId(internalId);
  }

  function clearMemberSelection() {
    setSelectedMemberId(null);
  }

  function handlePrintLeaderboard() {
    setPrintTarget('leaderboard');
  }

  function handlePrintMember() {
    setPrintTarget('member');
  }

  function getTrendIcon(trend: MemberPracticeStats['recentTrend']) {
    switch (trend) {
      case 'improving': return '↗️';
      case 'declining': return '↘️';
      case 'stable': return '→';
      default: return '—';
    }
  }

  function getTrendLabel(trend: MemberPracticeStats['recentTrend']) {
    switch (trend) {
      case 'improving': return 'Forbedring';
      case 'declining': return 'Tilbagegang';
      case 'stable': return 'Stabil';
      default: return 'Utilstrækkelig data';
    }
  }

  function formatScore(points: number, krydser?: number | null) {
    const pointValue = Math.floor(points);
    const krydserValue = Math.floor(krydser ?? 0);
    if (!krydserValue) return `${pointValue}`;
    return `${pointValue}/${krydserValue}`;
  }

  useEffect(() => {
    if (!printTarget) return;
    const cleanup = () => setPrintTarget(null);
    window.addEventListener('afterprint', cleanup);
    return () => {
      window.removeEventListener('afterprint', cleanup);
    };
  }, [printTarget]);


  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Medlemsaktivitet</h1>
        <p className="text-gray-600 mt-1">Overblik over fremmøde og træning</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleTabChange('attendance')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeTab === 'attendance'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Fremmøde
          </button>
          <button
            onClick={() => handleTabChange('practice')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeTab === 'practice'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Træning
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Periode</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(event) => handleDateChange(event.target.value, endDate)}
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="text-gray-400">–</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => handleDateChange(startDate, event.target.value)}
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Prøveforløb</label>
            <select
              value={trialFilter}
              onChange={(event) => setTrialFilter(event.target.value as TrialFilter)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {trialFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Aktivitetstyper</label>
            <select
              value={activityTypeFilter}
              onChange={(event) => handleActivityTypeChange(event.target.value as ActivityTypeFilter)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Alle</option>
              <option value="check-in">Check-in</option>
              <option value="practice-session">Træningspas</option>
            </select>
          </div>
        </div>

        {activeTab === 'practice' && practiceTypeOptions.length > 0 && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Våbentype</label>
              <div className="flex flex-wrap gap-2">
                {practiceTypeOptions.map((type) => (
                  <button
                    key={type}
                    onClick={() => togglePracticeType(type)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      practiceTypes.length === 0 || practiceTypes.includes(type)
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    {type}
                  </button>
                ))}
                {practiceTypes.length > 0 && (
                  <button
                    onClick={() => setPracticeTypes([])}
                    className="px-3 py-1.5 rounded-full text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  >
                    Vis alle
                  </button>
                )}
              </div>
            </div>

            {classificationOptions.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Klassifikation</label>
                <div className="flex flex-wrap gap-2">
                  {classificationOptions.map((classification) => (
                    <button
                      key={classification}
                      onClick={() => toggleClassification(classification)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        classifications.length === 0 || classifications.includes(classification)
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {classification}
                    </button>
                  ))}
                  {classifications.length > 0 && (
                    <button
                      onClick={() => setClassifications([])}
                      className="px-3 py-1.5 rounded-full text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                    >
                      Vis alle
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {activeTab === 'attendance' && (
        <div className="space-y-6">
          {isSingleDay ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Fremmøde pr. dag</h2>
              </div>
              {attendanceRows.length === 0 ? (
                <div className="px-6 py-8 text-gray-500">Ingen check-ins i den valgte periode.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {pagedAttendanceRows.map((row) => (
                    <div key={row.internalId} className="px-6 py-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {row.firstName} {row.lastName}
                        </p>
                        <p className="text-sm text-gray-500">
                          {row.membershipId ?? 'Prøvemedlem'}
                        </p>
                      </div>
                      <p className="text-sm text-gray-500">{row.firstCheckInAtUtc.substring(11, 16)}</p>
                    </div>
                  ))}
                </div>
              )}
              {attendanceTotalPages > 1 && (
                <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                  <span>Side {attendancePage} af {attendanceTotalPages}</span>
                  <div className="flex gap-2">
                    <button
                      disabled={attendancePage === 1}
                      onClick={() => setAttendancePage((page) => Math.max(1, page - 1))}
                      className="px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
                    >
                      Forrige
                    </button>
                    <button
                      disabled={attendancePage === attendanceTotalPages}
                      onClick={() => setAttendancePage((page) => Math.min(attendanceTotalPages, page + 1))}
                      className="px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
                    >
                      Næste
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Fremmøde over flere dage</h2>
              </div>
              {attendanceCounts.length === 0 ? (
                <div className="px-6 py-8 text-gray-500">Ingen aktivitet i den valgte periode.</div>
              ) : (
                <>
                  <div className="px-6 py-4">
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={attendanceCounts} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="localDate" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="memberCount" fill="#2563eb" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {pagedAttendanceCounts.map((row) => (
                      <button
                        key={row.localDate}
                        onClick={() => applyDateRange(row.localDate)}
                        className="w-full px-6 py-3 flex items-center justify-between text-left hover:bg-gray-50"
                      >
                        <span className="text-sm text-gray-600">{row.localDate}</span>
                        <span className="text-sm font-medium text-gray-900">{row.memberCount} medlemmer</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {countsTotalPages > 1 && (
                <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                  <span>Side {countsPage} af {countsTotalPages}</span>
                  <div className="flex gap-2">
                    <button
                      disabled={countsPage === 1}
                      onClick={() => setCountsPage((page) => Math.max(1, page - 1))}
                      className="px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
                    >
                      Forrige
                    </button>
                    <button
                      disabled={countsPage === countsTotalPages}
                      onClick={() => setCountsPage((page) => Math.min(countsTotalPages, page + 1))}
                      className="px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
                    >
                      Næste
                    </button>
                  </div>
                </div>
              )}
              {attendanceBreakdown.length > 0 && (
                <div className="px-6 py-4 border-t border-gray-100 text-sm text-gray-600">
                  <div className="flex flex-wrap gap-4">
                    {attendanceBreakdown.map((row) => (
                      <span key={row.memberLifecycleStage}>
                        {row.memberLifecycleStage === 'TRIAL' ? 'Prøvemedlemmer' : 'Fulde medlemmer'}: {row.memberCount}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'practice' && (
        <div className="space-y-6">
          {/* Summary statistics */}
          {practiceTotals.totalSessions > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Træningspas</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{practiceTotals.totalSessions}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Medlemmer</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{practiceTotals.totalMembers}</p>
              </div>
            </div>
          )}

          {isSingleDay ? (
            /* Single-day view: show individual practice sessions */
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Træningspas for {startDate}</h2>
                {practiceDrilldownRange && (
                  <button
                    onClick={restorePracticeDrilldown}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Tilbage til overblik
                  </button>
                )}
              </div>
              {dailyPracticeSessions.length === 0 ? (
                <div className="px-6 py-8 text-gray-500">Ingen træningspas denne dag.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {pagedDailyPracticeSessions.map((session) => (
                    <div key={session.id} className="px-6 py-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {session.firstName} {session.lastName}
                        </p>
                        <p className="text-sm text-gray-500">
                          {session.membershipId ?? 'Prøvemedlem'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {session.practiceType} - {session.classification}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatScore(session.points, session.krydser)} point • {session.createdAtUtc.substring(11, 16)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {dailyPracticeTotalPages > 1 && (
                <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                  <span>Side {dailyPracticePage} af {dailyPracticeTotalPages}</span>
                  <div className="flex gap-2">
                    <button
                      disabled={dailyPracticePage === 1}
                      onClick={() => setDailyPracticePage((page) => Math.max(1, page - 1))}
                      className="px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
                    >
                      Forrige
                    </button>
                    <button
                      disabled={dailyPracticePage === dailyPracticeTotalPages}
                      onClick={() => setDailyPracticePage((page) => Math.min(dailyPracticeTotalPages, page + 1))}
                      className="px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
                    >
                      Næste
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Multi-day view: chart + daily counts */
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Træningspas over tid</h2>
              </div>
              {stackedPracticeCounts.length === 0 ? (
                <div className="px-6 py-8 text-gray-500">Ingen træningspas i den valgte periode.</div>
              ) : (
                <div className="px-6 py-4">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={stackedPracticeCounts}
                        margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                        onClick={(data) => {
                          const label = data?.activeLabel;
                          if (typeof label === 'string') {
                            applyPracticeDrilldown(label);
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="localDate" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value, name) => [value, String(name)]}
                          labelFormatter={(label) => `Dato: ${label}`}
                        />
                        {practiceTypeOptions.map((type) => (
                          <Bar
                            key={type}
                            dataKey={type}
                            stackId="practice"
                            fill={practiceTypeColorMap[type]}
                            name={type}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">Klik på en dag i diagrammet for at se detaljer.</p>
                </div>
              )}
            </div>
          )}

          {/* Leaderboard */}
          {!isSingleDay && leaderboard.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">🏆 Rangliste</h2>
                    <p className="text-xs text-gray-500 mt-1">Top 20 efter gennemsnit pr. pas og krydser</p>
                  </div>
                  <button
                    onClick={handlePrintLeaderboard}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Udskriv
                  </button>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {leaderboard.map((row) => (
                  <button
                    key={row.internalId}
                    onClick={() => handleMemberSelect(row.internalId)}
                    className="w-full px-6 py-3 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        row.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                        row.rank === 2 ? 'bg-gray-200 text-gray-700' :
                        row.rank === 3 ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {row.rank}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {row.firstName} {row.lastName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {row.membershipId ?? 'Prøvemedlem'} • {row.sessionCount} pas
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {formatScore(row.avgPointsPerSession, row.avgKrydserPerSession)}
                        </p>
                        <p className="text-xs text-gray-500">
                          Bedst: {row.bestSession}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Member detail stats panel */}
      {activeTab === 'practice' && selectedMemberStats && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedMemberStats.firstName} {selectedMemberStats.lastName}
              </h3>
              <p className="text-sm text-gray-500">
                {selectedMemberStats.membershipId ?? 'Prøvemedlem'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrintMember}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Udskriv
              </button>
              <button
                onClick={clearMemberSelection}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Luk
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{selectedMemberStats.sessionCount}</p>
                <p className="text-xs text-gray-500 mt-1">Træningspas</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{selectedMemberStats.avgPointsPerSession}</p>
                <p className="text-xs text-gray-500 mt-1">Gns. pr. pas</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {formatScore(selectedMemberStats.bestSession, selectedMemberStats.bestKrydser)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Bedste pas</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
              <div>
                <p className="text-sm text-gray-600">Udvikling</p>
                <p className="text-xs text-gray-500">Baseret på første vs. sidste halvdel</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl">{getTrendIcon(selectedMemberStats.recentTrend)}</span>
                <span className={`text-sm font-medium ${
                  selectedMemberStats.recentTrend === 'improving' ? 'text-green-600' :
                  selectedMemberStats.recentTrend === 'declining' ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {getTrendLabel(selectedMemberStats.recentTrend)}
                </span>
              </div>
            </div>
            <div className="mt-4 text-xs text-gray-500">
              Dårligste pas: {formatScore(selectedMemberStats.worstSession, selectedMemberStats.worstKrydser)} point
            </div>
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-gray-900">Udvikling over tid</h4>
              {selectedMemberSeries.length === 0 ? (
                <p className="mt-2 text-xs text-gray-500">Ingen træningspas i den valgte periode.</p>
              ) : (
                <div className="mt-3 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selectedMemberSeriesChart} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="sessionLabel" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value, name) => [value, name === 'points' ? 'Point' : 'Krydser']}
                        labelFormatter={(label) => `Tidspunkt: ${label}`}
                      />
                      <Line type="monotone" dataKey="points" stroke="#2563eb" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="krydser" stroke="#10b981" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {printTarget === 'leaderboard' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-auto p-6">
          <div className="w-full max-w-4xl bg-white rounded-xl shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between no-print">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Udskriv rangliste</h2>
                <p className="text-xs text-gray-500">Forhåndsvisning af de valgte filtre</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Udskriv
                </button>
                <button
                  onClick={() => setPrintTarget(null)}
                  className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                >
                  Annuller
                </button>
              </div>
            </div>
            <div className="activity-print-view p-6">
              <style>{`
                @media print {
                  body * {
                    visibility: hidden;
                  }
                  .activity-print-view, .activity-print-view * {
                    visibility: visible;
                  }
                  .activity-print-view {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    padding: 24px;
                  }
                  table {
                    page-break-inside: auto;
                  }
                  tr {
                    page-break-inside: avoid;
                    page-break-after: auto;
                  }
                  thead {
                    display: table-header-group;
                  }
                }
              `}</style>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Rangliste</h1>
                <p className="text-sm text-gray-600">Periode: {startDate} - {endDate}</p>
                <p className="text-sm text-gray-600">Prøveforløb: {trialFilterOptions.find((o) => o.value === trialFilter)?.label}</p>
                {practiceTypes.length > 0 && (
                  <p className="text-sm text-gray-600">Våbentype: {practiceTypes.join(', ')}</p>
                )}
                {classifications.length > 0 && (
                  <p className="text-sm text-gray-600">Klassifikation: {classifications.join(', ')}</p>
                )}
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-2 text-left w-12">#</th>
                    <th className="border border-gray-300 px-2 py-2 text-left">Navn</th>
                    <th className="border border-gray-300 px-2 py-2 text-left w-24">Medlemsnr.</th>
                    <th className="border border-gray-300 px-2 py-2 text-right w-24">Gns.</th>
                    <th className="border border-gray-300 px-2 py-2 text-right w-24">Bedst</th>
                    <th className="border border-gray-300 px-2 py-2 text-right w-20">Pas</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row) => (
                    <tr key={row.internalId}>
                      <td className="border border-gray-300 px-2 py-2">{row.rank}</td>
                      <td className="border border-gray-300 px-2 py-2">{row.firstName} {row.lastName}</td>
                      <td className="border border-gray-300 px-2 py-2">{row.membershipId ?? 'Prøvemedlem'}</td>
                      <td className="border border-gray-300 px-2 py-2 text-right">
                        {formatScore(row.avgPointsPerSession, row.avgKrydserPerSession)}
                      </td>
                      <td className="border border-gray-300 px-2 py-2 text-right">{row.bestSession}</td>
                      <td className="border border-gray-300 px-2 py-2 text-right">{row.sessionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {printTarget === 'member' && selectedMemberStats && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-auto p-6">
          <div className="w-full max-w-4xl bg-white rounded-xl shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between no-print">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Udskriv medlemsoverblik</h2>
                <p className="text-xs text-gray-500">Forhåndsvisning af den valgte periode</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Udskriv
                </button>
                <button
                  onClick={() => setPrintTarget(null)}
                  className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                >
                  Annuller
                </button>
              </div>
            </div>
            <div className="activity-print-view p-6">
              <style>{`
                @media print {
                  body * {
                    visibility: hidden;
                  }
                  .activity-print-view, .activity-print-view * {
                    visibility: visible;
                  }
                  .activity-print-view {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    padding: 24px;
                  }
                  table {
                    page-break-inside: auto;
                  }
                  tr {
                    page-break-inside: avoid;
                    page-break-after: auto;
                  }
                  thead {
                    display: table-header-group;
                  }
                }
              `}</style>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">
                  {selectedMemberStats.firstName} {selectedMemberStats.lastName}
                </h1>
                <p className="text-sm text-gray-600">{selectedMemberStats.membershipId ?? 'Prøvemedlem'}</p>
                <p className="text-sm text-gray-600">Periode: {startDate} - {endDate}</p>
                {practiceTypes.length > 0 && (
                  <p className="text-sm text-gray-600">Våbentype: {practiceTypes.join(', ')}</p>
                )}
                {classifications.length > 0 && (
                  <p className="text-sm text-gray-600">Klassifikation: {classifications.join(', ')}</p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Træningspas</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedMemberStats.sessionCount}</p>
                </div>
                <div className="border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Gns. pr. pas</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatScore(selectedMemberStats.avgPointsPerSession, selectedMemberStats.avgKrydserPerSession)}
                  </p>
                </div>
                <div className="border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Bedste pas</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatScore(selectedMemberStats.bestSession, selectedMemberStats.bestKrydser)}
                  </p>
                </div>
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-2 text-left w-32">Dato</th>
                    <th className="border border-gray-300 px-2 py-2 text-left w-16">Tid</th>
                    <th className="border border-gray-300 px-2 py-2 text-right w-24">Point</th>
                    <th className="border border-gray-300 px-2 py-2 text-right w-20">Krydser</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedMemberSeries.map((row, index) => (
                    <tr key={`${row.localDate}-${row.createdAtUtc}-${index}`}>
                      <td className="border border-gray-300 px-2 py-2">{row.localDate}</td>
                      <td className="border border-gray-300 px-2 py-2">{row.createdAtUtc.substring(11, 16)}</td>
                      <td className="border border-gray-300 px-2 py-2 text-right">{row.points}</td>
                      <td className="border border-gray-300 px-2 py-2 text-right">{row.krydser ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
