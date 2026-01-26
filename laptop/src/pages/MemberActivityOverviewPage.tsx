/**
 * Member activity overview page.
 * Provides attendance and practice insights.
 */

import { useMemo, useState } from 'react';
import {
  getAttendanceBreakdown,
  getAttendanceCountsByDay,
  getDailyAttendanceMembers,
  getPracticeClassificationOptions,
  getPracticeMembersForGroup,
  getPracticeSummaryByDisciplineAndClassification,
  getPracticeTypeOptions,
  getSeasonDateRange,
  type TrialFilter,
  type PracticeMemberRow
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

function getSelectedOptions(values: string[], options: string[]): string[] {
  return options.filter((option) => values.includes(option));
}

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
  const [practicePage, setPracticePage] = useState(1);
  const [selectedPracticeGroup, setSelectedPracticeGroup] = useState<{
    practiceType: string;
    classification: string;
  } | null>(null);

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

  const practiceSummary = useMemo(
    () => getPracticeSummaryByDisciplineAndClassification(startDate, endDate, {
      trialFilter,
      practiceTypes,
      classifications
    }),
    [startDate, endDate, trialFilter, practiceTypes, classifications]
  );

  const practiceMembers: PracticeMemberRow[] = useMemo(() => {
    if (!selectedPracticeGroup) return [];
    return getPracticeMembersForGroup(
      startDate,
      endDate,
      selectedPracticeGroup.practiceType,
      selectedPracticeGroup.classification,
      trialFilter
    );
  }, [endDate, selectedPracticeGroup, startDate, trialFilter]);

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
  const practiceTotalPages = Math.max(1, Math.ceil(practiceMembers.length / DEFAULT_PAGE_SIZE));
  const pagedPracticeMembers = useMemo(() => {
    const start = (practicePage - 1) * DEFAULT_PAGE_SIZE;
    return practiceMembers.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [practiceMembers, practicePage]);

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
  }

  function handlePracticeTypesChange(values: string[]) {
    const selected = getSelectedOptions(values, practiceTypeOptions);
    setPracticeTypes(selected);
  }

  function handleClassificationsChange(values: string[]) {
    const selected = getSelectedOptions(values, classificationOptions);
    setClassifications(selected);
  }

  function handlePracticeGroupSelect(practiceType: string, classification: string) {
    setSelectedPracticeGroup({ practiceType, classification });
    setPracticePage(1);
  }

  function clearPracticeSelection() {
    setSelectedPracticeGroup(null);
    setPracticePage(1);
  }

  function applyDateRange(day: string) {
    handleDateChange(day, day);
  }

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

        {activeTab === 'practice' && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Våbentype</label>
              <select
                multiple
                value={practiceTypes}
                onChange={(event) =>
                  handlePracticeTypesChange(
                    Array.from(event.target.selectedOptions, (option) => option.value)
                  )
                }
                className="w-full h-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {practiceTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Klassifikation</label>
              <select
                multiple
                value={classifications}
                onChange={(event) =>
                  handleClassificationsChange(
                    Array.from(event.target.selectedOptions, (option) => option.value)
                  )
                }
                className="w-full h-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {classificationOptions.map((classification) => (
                  <option key={classification} value={classification}>
                    {classification}
                  </option>
                ))}
              </select>
            </div>
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
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Træningspas efter våbentype</h2>
          </div>
          {practiceSummary.length === 0 ? (
            <div className="px-6 py-8 text-gray-500">Ingen træningspas i den valgte periode.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {practiceSummary.map((row) => (
                <button
                  key={`${row.practiceType}-${row.classification}`}
                  onClick={() => handlePracticeGroupSelect(row.practiceType, row.classification)}
                  className="w-full px-6 py-3 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{row.practiceType}</p>
                      <p className="text-xs text-gray-500">{row.classification}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{row.sessionCount} pas</p>
                      <p className="text-xs text-gray-500">{row.memberCount} medlemmer</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'practice' && selectedPracticeGroup && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Medlemmer i udvalgt gruppe</h3>
              <p className="text-sm text-gray-500">
                {selectedPracticeGroup.practiceType} - {selectedPracticeGroup.classification}
              </p>
            </div>
            <button
              onClick={clearPracticeSelection}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Ryd valg
            </button>
          </div>
          {practiceMembers.length === 0 ? (
            <div className="px-6 py-8 text-gray-500">Ingen aktivitet i den valgte periode.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pagedPracticeMembers.map((member) => (
                <div key={member.internalId} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {member.firstName} {member.lastName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {member.membershipId ?? 'Prøvemedlem'}
                    </p>
                  </div>
                  <span className="text-sm text-gray-600">{member.sessionCount} pas</span>
                </div>
              ))}
            </div>
          )}
          {practiceTotalPages > 1 && (
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
              <span>Side {practicePage} af {practiceTotalPages}</span>
              <div className="flex gap-2">
                <button
                  disabled={practicePage === 1}
                  onClick={() => setPracticePage((page) => Math.max(1, page - 1))}
                  className="px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
                >
                  Forrige
                </button>
                <button
                  disabled={practicePage === practiceTotalPages}
                  onClick={() => setPracticePage((page) => Math.min(practiceTotalPages, page + 1))}
                  className="px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
                >
                  Næste
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
