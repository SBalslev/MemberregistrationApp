import type { MemberType } from '../types';
import type { Member } from '../types/entities';

export function calculateAge(birthday: string, asOfDate: Date = new Date()): number {
  const birthDate = new Date(birthday);
  let age = asOfDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = asOfDate.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOfDate.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export function getFeeCategoryFromBirthDate(
  birthDate: string | null,
  existingType?: MemberType,
  asOfDate?: Date
): MemberType {
  if (!birthDate) return existingType ?? 'ADULT';
  const age = calculateAge(birthDate, asOfDate ?? new Date());
  if (age < 18) {
    if (existingType === 'CHILD_PLUS' || existingType === 'CHILD') {
      return existingType;
    }
    return 'CHILD';
  }
  return 'ADULT';
}

export function getEffectiveMemberType(member: Member, asOfDate?: Date): MemberType {
  return getFeeCategoryFromBirthDate(member.birthDate ?? null, member.memberType, asOfDate);
}
