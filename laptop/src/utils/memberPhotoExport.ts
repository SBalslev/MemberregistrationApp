import type { Member } from '../types';

export function hasProfilePhoto(member: Pick<Member, 'photoThumbnail' | 'photoPath' | 'registrationPhotoPath'>): boolean {
  return [member.photoThumbnail, member.photoPath, member.registrationPhotoPath]
    .some((value) => !!value?.trim());
}

export function buildMissingPhotoCsv(members: Member[]): string {
  const escapeValue = (value: string | null): string => {
    // Keep contact information literal when the CSV is opened in a spreadsheet.
    const text = /^[\s]*[=+\-@]/.test(value ?? '') ? `'${value}` : (value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [
    ['Medlemsnummer', 'Fornavn', 'Efternavn', 'Medlemstype', 'Status', 'E-mail', 'Telefon', 'Internt ID'],
    ...members.filter((member) => !hasProfilePhoto(member)).map((member) => [
      member.membershipId,
      member.firstName,
      member.lastName,
      member.memberLifecycleStage === 'FULL' ? 'Fuldt medlem' : 'Prøvemedlem',
      member.status === 'ACTIVE' ? 'Aktiv' : 'Inaktiv',
      member.email,
      member.phone,
      member.internalId
    ])
  ];
  return '\uFEFF' + rows.map((row) => row.map(escapeValue).join(';')).join('\r\n');
}
