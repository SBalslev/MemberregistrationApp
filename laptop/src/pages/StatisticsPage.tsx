/**
 * Statistics page - member statistics with print functionality.
 * Shows detailed breakdown of members by age, gender, and status.
 */

import { useMemo } from 'react';
import { Printer, Users, Baby, UserCheck } from 'lucide-react';
import { getAllMembers } from '../database';
import { calculateAge } from '../utils/feeCategory';
import { hasMemberPaidFee } from '../services/idPhotoLifecycleService';
import type { Member } from '../types';

interface DetailedDemographics {
  // By age as of today
  adultsToday: { male: number; female: number; other: number; unspecified: number; total: number };
  childrenToday: { male: number; female: number; other: number; unspecified: number; total: number };
  // By age as of Jan 1
  adultsJan1: { male: number; female: number; other: number; unspecified: number; total: number };
  childrenJan1: { male: number; female: number; other: number; unspecified: number; total: number };
  // Totals
  totalByGender: { male: number; female: number; other: number; unspecified: number };
  grandTotal: number;
}

interface AgeFeeBucket {
  label: string;
  total: number;
  paid: number;
  unpaid: number;
}

interface AgeFeeBuckets {
  today: AgeFeeBucket[];
  jan1: AgeFeeBucket[];
}

function calculateAgeFeeBuckets(members: Member[]): AgeFeeBuckets {
  const today = new Date();
  const jan1 = new Date(today.getFullYear(), 0, 1);
  const activeMembers = members.filter(m => m.status === 'ACTIVE');

  const bucketDefinitions = [
    { label: '0-12 år', min: 0, max: 12 },
    { label: '13-18 år', min: 13, max: 18 },
    { label: '19-24 år', min: 19, max: 24 },
    { label: '25-59 år', min: 25, max: 59 },
    { label: '60+ år', min: 60, max: Number.POSITIVE_INFINITY },
  ];

  const todayBuckets = bucketDefinitions.map(bucket => ({
    label: bucket.label,
    total: 0,
    paid: 0,
    unpaid: 0,
  }));
  const jan1Buckets = bucketDefinitions.map(bucket => ({
    label: bucket.label,
    total: 0,
    paid: 0,
    unpaid: 0,
  }));

  const unknownToday: AgeFeeBucket = { label: 'Ukendt', total: 0, paid: 0, unpaid: 0 };
  const unknownJan1: AgeFeeBucket = { label: 'Ukendt', total: 0, paid: 0, unpaid: 0 };

  const addToBucket = (buckets: AgeFeeBucket[], age: number, hasPaidFee: boolean) => {
    const index = bucketDefinitions.findIndex((bucket) => age >= bucket.min && age <= bucket.max);
    if (index < 0) return;
    buckets[index].total += 1;
    if (hasPaidFee) buckets[index].paid += 1;
    else buckets[index].unpaid += 1;
  };

  for (const member of activeMembers) {
    const hasPaidFee = hasMemberPaidFee(member.internalId);
    if (member.birthDate) {
      const ageToday = calculateAge(member.birthDate, today);
      const ageJan1 = calculateAge(member.birthDate, jan1);
      addToBucket(todayBuckets, ageToday, hasPaidFee);
      addToBucket(jan1Buckets, ageJan1, hasPaidFee);
    } else {
      unknownToday.total += 1;
      unknownJan1.total += 1;
      if (hasPaidFee) {
        unknownToday.paid += 1;
        unknownJan1.paid += 1;
      } else {
        unknownToday.unpaid += 1;
        unknownJan1.unpaid += 1;
      }
    }
  }

  const todayRows = unknownToday.total > 0 ? [...todayBuckets, unknownToday] : todayBuckets;
  const jan1Rows = unknownJan1.total > 0 ? [...jan1Buckets, unknownJan1] : jan1Buckets;

  return { today: todayRows, jan1: jan1Rows };
}

function calculateDetailedDemographics(members: Member[]): DetailedDemographics {
  const today = new Date();
  const jan1 = new Date(today.getFullYear(), 0, 1);

  // Only count active members
  const activeMembers = members.filter(m => m.status === 'ACTIVE');

  const result: DetailedDemographics = {
    adultsToday: { male: 0, female: 0, other: 0, unspecified: 0, total: 0 },
    childrenToday: { male: 0, female: 0, other: 0, unspecified: 0, total: 0 },
    adultsJan1: { male: 0, female: 0, other: 0, unspecified: 0, total: 0 },
    childrenJan1: { male: 0, female: 0, other: 0, unspecified: 0, total: 0 },
    totalByGender: { male: 0, female: 0, other: 0, unspecified: 0 },
    grandTotal: activeMembers.length,
  };

  for (const member of activeMembers) {
    const genderKey = member.gender === 'MALE' ? 'male'
      : member.gender === 'FEMALE' ? 'female'
      : member.gender === 'OTHER' ? 'other'
      : 'unspecified';

    // Track total by gender
    result.totalByGender[genderKey]++;

    // Age calculations
    if (member.birthDate) {
      const ageToday = calculateAge(member.birthDate, today);
      const ageJan1 = calculateAge(member.birthDate, jan1);

      // Today's age
      if (ageToday >= 18) {
        result.adultsToday[genderKey]++;
        result.adultsToday.total++;
      } else {
        result.childrenToday[genderKey]++;
        result.childrenToday.total++;
      }

      // Jan 1 age
      if (ageJan1 >= 18) {
        result.adultsJan1[genderKey]++;
        result.adultsJan1.total++;
      } else {
        result.childrenJan1[genderKey]++;
        result.childrenJan1.total++;
      }
    } else {
      // No birthdate - count as adult
      result.adultsToday[genderKey]++;
      result.adultsToday.total++;
      result.adultsJan1[genderKey]++;
      result.adultsJan1.total++;
    }
  }

  return result;
}

interface AgeFeeRowProps {
  row: AgeFeeBucket;
  highlight?: boolean;
}

function AgeFeeRow({ row, highlight }: AgeFeeRowProps) {
  return (
    <tr className={highlight ? 'bg-gray-50 font-semibold' : ''}>
      <td className="px-4 py-3 text-gray-900">{row.label}</td>
      <td className="px-4 py-3 text-center text-gray-700">{row.paid}</td>
      <td className="px-4 py-3 text-center text-gray-700">{row.unpaid}</td>
      <td className="px-4 py-3 text-center font-semibold text-gray-900">{row.total}</td>
    </tr>
  );
}

export function StatisticsPage() {
  const allMembers = useMemo(() => getAllMembers(), []);
  const demographics = useMemo(() => calculateDetailedDemographics(allMembers), [allMembers]);
  const ageFeeBuckets = useMemo(() => calculateAgeFeeBuckets(allMembers), [allMembers]);
  const membersMissingBirthDate = useMemo(() => {
    return allMembers
      .filter((member) => member.status === 'ACTIVE' && !member.birthDate)
      .sort((a, b) => {
        const lastNameCompare = (a.lastName || '').localeCompare(b.lastName || '', 'da');
        if (lastNameCompare !== 0) return lastNameCompare;
        return (a.firstName || '').localeCompare(b.firstName || '', 'da');
      });
  }, [allMembers]);

  const todayTotals = ageFeeBuckets.today.reduce(
    (acc, row) => ({
      paid: acc.paid + row.paid,
      unpaid: acc.unpaid + row.unpaid,
      total: acc.total + row.total,
    }),
    { paid: 0, unpaid: 0, total: 0 }
  );

  const jan1Totals = ageFeeBuckets.jan1.reduce(
    (acc, row) => ({
      paid: acc.paid + row.paid,
      unpaid: acc.unpaid + row.unpaid,
      total: acc.total + row.total,
    }),
    { paid: 0, unpaid: 0, total: 0 }
  );

  const hasOther = demographics.totalByGender.other > 0;
  const hasUnspecified = demographics.totalByGender.unspecified > 0;

  function handlePrint() {
    window.print();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8 no-print">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Medlemsstatistik</h1>
          <p className="text-gray-600 mt-1">
            Oversigt over {demographics.grandTotal} aktive medlemmer
          </p>
        </div>
        <button
          onClick={handlePrint}
          aria-label="Udskriv statistik"
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <Printer className="w-5 h-5" aria-hidden="true" />
          Udskriv
        </button>
      </div>

      {/* Print header - only shown when printing */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Medlemsstatistik</h1>
        <p className="text-gray-600">
          Udskrevet: {new Date().toLocaleDateString('da-DK', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <p className="text-gray-600">{demographics.grandTotal} aktive medlemmer</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's age statistics */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-blue-600" aria-hidden="true" />
              Aldersfordeling i dag
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Baseret på faktisk alder pr. dags dato - inkl. betalt kontingent
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" aria-label="Aldersfordeling i dag">
              <thead className="bg-gray-100">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-600">Kategori</th>
                  <th scope="col" className="px-4 py-3 text-center text-sm font-medium text-gray-600">Betalt</th>
                  <th scope="col" className="px-4 py-3 text-center text-sm font-medium text-gray-600">Ikke betalt</th>
                  <th scope="col" className="px-4 py-3 text-center text-sm font-medium text-gray-900">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ageFeeBuckets.today.map((row) => (
                  <AgeFeeRow key={row.label} row={row} />
                ))}
                <AgeFeeRow
                  row={{ label: 'I alt', ...todayTotals }}
                  highlight
                />
              </tbody>
            </table>
          </div>
        </div>

        {/* Jan 1 age statistics */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Baby className="w-5 h-5 text-green-600" aria-hidden="true" />
              Aldersfordeling pr. 1. januar {new Date().getFullYear()}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Bruges til sæsonbestemmelse (idrætsaktiviteter) - inkl. betalt kontingent
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" aria-label="Aldersfordeling pr. 1. januar">
              <thead className="bg-gray-100">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-600">Kategori</th>
                  <th scope="col" className="px-4 py-3 text-center text-sm font-medium text-gray-600">Betalt</th>
                  <th scope="col" className="px-4 py-3 text-center text-sm font-medium text-gray-600">Ikke betalt</th>
                  <th scope="col" className="px-4 py-3 text-center text-sm font-medium text-gray-900">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ageFeeBuckets.jan1.map((row) => (
                  <AgeFeeRow key={row.label} row={row} />
                ))}
                <AgeFeeRow
                  row={{ label: 'I alt', ...jan1Totals }}
                  highlight
                />
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-purple-600" aria-hidden="true" />
            Kønsfordeling samlet
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-600 font-medium">Mænd</p>
              <p className="text-2xl font-bold text-blue-900">{demographics.totalByGender.male}</p>
              <p className="text-xs text-blue-600">
                {demographics.grandTotal > 0 ? Math.round((demographics.totalByGender.male / demographics.grandTotal) * 100) : 0}%
              </p>
            </div>
            <div className="bg-pink-50 rounded-lg p-4">
              <p className="text-sm text-pink-600 font-medium">Kvinder</p>
              <p className="text-2xl font-bold text-pink-900">{demographics.totalByGender.female}</p>
              <p className="text-xs text-pink-600">
                {demographics.grandTotal > 0 ? Math.round((demographics.totalByGender.female / demographics.grandTotal) * 100) : 0}%
              </p>
            </div>
            {hasOther && (
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-sm text-purple-600 font-medium">Andet</p>
                <p className="text-2xl font-bold text-purple-900">{demographics.totalByGender.other}</p>
                <p className="text-xs text-purple-600">
                  {demographics.grandTotal > 0 ? Math.round((demographics.totalByGender.other / demographics.grandTotal) * 100) : 0}%
                </p>
              </div>
            )}
            {hasUnspecified && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 font-medium">Ikke angivet</p>
                <p className="text-2xl font-bold text-gray-700">{demographics.totalByGender.unspecified}</p>
                <p className="text-xs text-gray-500">
                  {demographics.grandTotal > 0 ? Math.round((demographics.totalByGender.unspecified / demographics.grandTotal) * 100) : 0}%
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Missing birthdate list */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden lg:col-span-2">
          <div className="p-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Medlemmer uden fødselsdato</h2>
            <p className="text-sm text-gray-600 mt-1">
              {membersMissingBirthDate.length} aktive medlemmer mangler fødselsdato
            </p>
          </div>
          <div className="p-4">
            {membersMissingBirthDate.length === 0 ? (
              <p className="text-sm text-gray-600">Alle aktive medlemmer har fødselsdato registreret.</p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm text-gray-700">
                {membersMissingBirthDate.map((member) => {
                  const firstName = member.firstName?.trim() || '';
                  const lastName = member.lastName?.trim() || '';
                  const name = [lastName, firstName].filter(Boolean).join(', ') || 'Ukendt navn';
                  return (
                    <li key={member.internalId} className="bg-gray-50 rounded-md px-3 py-2">
                      {name}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
