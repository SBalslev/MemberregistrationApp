// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MembersPage } from './MembersPage';
import { getAllMembers, searchMembers } from '../database';
import { showError, showSuccess } from '../store/toastStore';
import type { Member } from '../types';

vi.mock('../database', () => ({
  getAllMembers: vi.fn(),
  searchMembers: vi.fn(),
  getMemberFeeStatus: () => [],
  getMembersWithDuplicates: () => [],
  query: () => []
}));
vi.mock('../store', () => ({
  useAppStore: () => ({ selectedMember: null, setSelectedMember: vi.fn() })
}));
vi.mock('../store/toastStore', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('../services/idPhotoLifecycleService', () => ({}));
vi.mock('../components', () => ({ ConfirmDialog: () => null }));
vi.mock('../components/finance', () => ({ QuickFeePaymentDialog: () => null }));

describe('MembersPage photo extraction', () => {
  let downloaded: string | null;
  const click = vi.fn(function (this: HTMLAnchorElement) { downloaded = this.download; });
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:member-export');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    downloaded = null;
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
    const members: (Pick<Member, 'internalId' | 'firstName' | 'lastName'> & Partial<Member>)[] = [
      {
        internalId: 'missing-full', firstName: 'Anne', lastName: 'Hansen',
        membershipId: '123', memberLifecycleStage: 'FULL', status: 'ACTIVE',
        photoPath: null, photoThumbnail: null, registrationPhotoPath: null,
        idPhotoPath: 'id.jpg', idPhotoThumbnail: 'id-thumbnail'
      },
      {
        internalId: 'missing-trial', firstName: 'Bent', lastName: 'Jensen',
        memberLifecycleStage: 'TRIAL', status: 'INACTIVE',
        photoPath: null, photoThumbnail: null, registrationPhotoPath: null
      },
      {
        internalId: 'has-photo', firstName: 'Clara', lastName: 'Larsen',
        memberLifecycleStage: 'FULL', status: 'ACTIVE', photoThumbnail: 'data:image/jpeg;base64,photo'
      }
    ];
    vi.mocked(getAllMembers).mockReturnValue(members.map((member): Member => ({
      memberLifecycleStage: 'FULL', status: 'ACTIVE',
      birthDate: null, gender: null, email: null, phone: null, address: null,
      zipCode: null, city: null, guardianName: null, guardianPhone: null, guardianEmail: null,
      memberType: 'ADULT', expiresOn: null, mergedIntoId: null,
      cardStatus: 'none', cardFileReference: null, cardPrintedAtUtc: null,
      cardRequestedAtUtc: null, cardRequestedByDeviceId: null,
      createdAtUtc: '2026-01-01T10:00:00Z', updatedAtUtc: '2026-01-01T10:00:00Z',
      syncedAtUtc: null, syncVersion: 1, membershipId: null,
      registrationPhotoPath: null, photoPath: null, photoThumbnail: null,
      idPhotoPath: null, idPhotoThumbnail: null,
      ...member
    })));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('filters missing profile photos independently of ID photos and respects status', async () => {
    render(<MembersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Filtre' }));
    fireEvent.change(screen.getByLabelText('Filtrer efter profilbillede'), { target: { value: 'missing' } });
    expect(screen.getByText('Anne Hansen')).toBeTruthy();
    expect(screen.getByText('Bent Jensen')).toBeTruthy();
    expect(screen.queryByText('Clara Larsen')).toBeNull();
    fireEvent.change(screen.getByLabelText('Filtrer efter status'), { target: { value: 'ACTIVE' } });
    expect(screen.queryByText('Bent Jensen')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filtre (2)' }));
    fireEvent.click(screen.getByText('Eksportér'));
    fireEvent.click(screen.getByRole('button', { name: 'Eksportér uden billede (1)' }));
    expect(downloaded).toMatch(/^medlemmer-uden-profilbillede-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:member-export');
    expect(showSuccess).toHaveBeenCalledWith('1 medlemmer uden profilbillede eksporteret');
    expect(screen.getByText('Eksportér').closest('details')?.open).toBe(false);
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(createObjectURL.mock.calls[0][0]);
    });
    expect(csv).toContain('"123";"Anne";"Hansen";"Fuldt medlem";"Aktiv"');
    expect(csv).not.toContain('Bent');
    expect(csv).not.toContain('Clara');
  });

  it('exports missing photos without requiring the filter and honors search', () => {
    render(<MembersPage />);
    fireEvent.click(screen.getByText('Eksportér'));
    expect(screen.getByRole('button', { name: 'Eksportér uden billede (2)' })).toBeTruthy();
    vi.mocked(searchMembers).mockReturnValue([vi.mocked(getAllMembers)()[1]]);
    fireEvent.change(screen.getByLabelText('Søg efter medlemmer'), { target: { value: 'Bent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Eksportér uden billede (1)' }));
    expect(showSuccess).toHaveBeenCalledWith('1 medlemmer uden profilbillede eksporteret');
  });

  it('disables export for an empty result', () => {
    vi.mocked(getAllMembers).mockReturnValue([]);
    render(<MembersPage />);
    fireEvent.click(screen.getByText('Eksportér'));
    const button = screen.getByRole('button', { name: 'Eksportér uden billede (0)' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('reports download failures instead of showing success', () => {
    createObjectURL.mockImplementationOnce(() => { throw new Error('Download unavailable'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MembersPage />);
    fireEvent.click(screen.getByText('Eksportér'));
    fireEvent.click(screen.getByRole('button', { name: 'Eksportér uden billede (2)' }));
    expect(showError).toHaveBeenCalledWith('Kunne ikke eksportere medlemmer uden profilbillede');
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('starts compact with all seven labelled filters in one expandable panel', () => {
    render(<MembersPage />);
    const toggle = screen.getByRole('button', { name: 'Filtre' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Eksportér').closest('details')?.open).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('3 medlemmer');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('region', { name: 'Medlemsfiltre' }).id).toBe(toggle.getAttribute('aria-controls'));
    expect(screen.getAllByRole('combobox')).toHaveLength(7);
    expect(screen.getByLabelText('Søg efter medlemmer')).toBeTruthy();
  });

  it.each([
    ['Filtrer efter medlemstype', 'TRIAL', 'Prøvemedlemmer'],
    ['Filtrer efter status', 'ACTIVE', 'Aktive'],
    ['Filtrer efter profilbillede', 'missing', 'Mangler profilbillede'],
    ['Filtrer efter ID-billede status', 'needs_id', 'Mangler ID-billede'],
    ['Filtrer efter kontingenttype', 'CHILD', 'Kontingent: Barn'],
    ['Filtrer efter medlemskort status', 'requested', 'Kort anmodet'],
    ['Filtrer efter aktivitet', 'inactive_unpaid', 'Ubetalt + intet fremmøde i 30 dage']
  ])('keeps %s visible as a removable chip when the panel is closed', (label, value, chip) => {
    render(<MembersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Filtre' }));
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const toggle = screen.getByRole('button', { name: 'Filtre (1)' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `Fjern filter: ${chip}` }));
    expect(screen.getByRole('button', { name: 'Filtre' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nulstil filtre' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('3 medlemmer');
  });

  it('resets every filter without clearing the search', () => {
    render(<MembersPage />);
    vi.mocked(searchMembers).mockReturnValue([vi.mocked(getAllMembers)()[0]]);
    fireEvent.change(screen.getByLabelText('Søg efter medlemmer'), { target: { value: 'Anne' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filtre' }));
    for (const [label, value] of [
      ['Filtrer efter medlemstype', 'FULL'],
      ['Filtrer efter status', 'ACTIVE'],
      ['Filtrer efter profilbillede', 'missing'],
      ['Filtrer efter ID-billede status', 'not_required'],
      ['Filtrer efter kontingenttype', 'ADULT'],
      ['Filtrer efter medlemskort status', 'missing'],
      ['Filtrer efter aktivitet', 'inactive_unpaid']
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    expect(screen.getByRole('button', { name: 'Filtre (7)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nulstil filtre' }));
    expect(screen.getByRole('button', { name: 'Filtre' })).toBeTruthy();
    for (const select of screen.getAllByRole('combobox')) {
      expect(select).toHaveProperty('value', 'all');
    }
    expect(screen.getByLabelText('Søg efter medlemmer')).toHaveProperty('value', 'Anne');
    expect(screen.getByRole('status').textContent).toBe('1 medlemmer');
    expect(screen.getByText('Anne Hansen')).toBeTruthy();
    expect(screen.queryByText('Clara Larsen')).toBeNull();
  });

  it('closes the export menu on Escape and returns focus to its toggle', () => {
    render(<MembersPage />);
    const toggle = screen.getByText('Eksportér');
    fireEvent.click(toggle);
    const option = screen.getByRole('button', { name: 'Eksportér uden billede (2)' });
    fireEvent.keyDown(option, { key: 'Escape' });
    expect(toggle.closest('details')?.open).toBe(false);
    expect(document.activeElement).toBe(toggle);
  });

  it('closes the export menu when clicking outside or moving focus away', () => {
    render(<MembersPage />);
    const toggle = screen.getByText('Eksportér');
    fireEvent.click(toggle);
    expect(toggle.closest('details')?.open).toBe(true);
    const search = screen.getByLabelText('Søg efter medlemmer');
    fireEvent.pointerDown(search);
    expect(toggle.closest('details')?.open).toBe(false);
    fireEvent.click(toggle);
    fireEvent.blur(toggle, { relatedTarget: search });
    expect(toggle.closest('details')?.open).toBe(false);
  });

  it('removes one filter without clearing another or losing it when switching views', () => {
    render(<MembersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Filtre' }));
    fireEvent.change(screen.getByLabelText('Filtrer efter profilbillede'), { target: { value: 'missing' } });
    fireEvent.change(screen.getByLabelText('Filtrer efter status'), { target: { value: 'ACTIVE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filtre (2)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fjern filter: Mangler profilbillede' }));
    expect(screen.getByText('Clara Larsen')).toBeTruthy();
    expect(screen.queryByText('Bent Jensen')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Dubletter/ }));
    expect(screen.queryByRole('button', { name: /Filtre/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Alle medlemmer' }));
    expect(screen.getByRole('button', { name: 'Filtre (1)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fjern filter: Aktive' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('2 medlemmer');
  });
});
