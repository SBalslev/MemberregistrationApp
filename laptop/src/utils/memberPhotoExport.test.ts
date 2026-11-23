import { describe, expect, it } from 'vitest';
import type { Member } from '../types';
import { buildMissingPhotoCsv, hasProfilePhoto } from './memberPhotoExport';

function makePhotoTestMember(overrides: Partial<Member> = {}): Member {
  return {
    internalId: 'member-1', membershipId: '00123', memberLifecycleStage: 'FULL', status: 'ACTIVE',
    firstName: 'Anne', lastName: 'Hansen', birthDate: null, gender: null, email: null,
    phone: null, address: null, zipCode: null, city: null, guardianName: null,
    guardianPhone: null, guardianEmail: null, memberType: 'ADULT', expiresOn: null,
    registrationPhotoPath: null, photoPath: null, photoThumbnail: null,
    idPhotoPath: null, idPhotoThumbnail: null, mergedIntoId: null,
    cardStatus: 'none', cardFileReference: null, cardPrintedAtUtc: null,
    cardRequestedAtUtc: null, cardRequestedByDeviceId: null,
    createdAtUtc: '2026-01-01T10:00:00Z', updatedAtUtc: '2026-01-01T10:00:00Z',
    syncedAtUtc: null, syncVersion: 1, ...overrides
  };
}

describe('missing profile photo export', () => {
  it.each([
    { photoThumbnail: 'data:image/jpeg;base64,photo' },
    { photoPath: 'C:\\photos\\member.jpg' },
    { registrationPhotoPath: 'legacy-photo.jpg' }
  ])('recognizes each supported profile photo source: %o', (photo) => {
    expect(hasProfilePhoto(makePhotoTestMember(photo))).toBe(true);
    expect(buildMissingPhotoCsv([makePhotoTestMember(photo)])).not.toContain('Anne');
  });

  it('does not count ID photos as profile photos and treats blank paths as missing', () => {
    const member = makePhotoTestMember({
      photoPath: '  ', photoThumbnail: '', registrationPhotoPath: null,
      idPhotoPath: 'C:\\photos\\id.jpg', idPhotoThumbnail: 'id-thumbnail'
    });
    expect(hasProfilePhoto(member)).toBe(false);
    expect(buildMissingPhotoCsv([member])).toContain('"Anne"');
  });

  it('exports Danish headers, UTF-8 BOM, contact fields and stable IDs without photo data', () => {
    const csv = buildMissingPhotoCsv([makePhotoTestMember({
      firstName: 'Søren', email: 'member@example.dk', phone: '12345678'
    })]);
    expect(csv.startsWith('\uFEFF"Medlemsnummer"')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('"00123";"Søren";"Hansen";"Fuldt medlem";"Aktiv";"member@example.dk";"12345678";"member-1"');
    expect(csv).not.toContain('photoPath');
  });

  it('quotes delimiters, newlines and quotes, and prevents spreadsheet formula execution', () => {
    const csv = buildMissingPhotoCsv([makePhotoTestMember({
      firstName: 'Anne;"A"\nB', email: '=1+1', phone: '+4512345678',
      memberLifecycleStage: 'TRIAL', status: 'INACTIVE', membershipId: null
    })]);
    expect(csv).toContain('"Anne;""A""\nB"');
    expect(csv).toContain(`"'=1+1";"'+4512345678"`);
    expect(csv).toContain('"Prøvemedlem";"Inaktiv"');
    expect(csv).not.toContain('null');
  });

  it('includes all matching members rather than truncating an exported list', () => {
    const members = Array.from({ length: 120 }, (_, index) =>
      makePhotoTestMember({ internalId: `member-${index}` }));
    expect(buildMissingPhotoCsv(members).split('\r\n')).toHaveLength(121);
    expect(buildMissingPhotoCsv([]).split('\r\n')).toHaveLength(1);
  });
});
