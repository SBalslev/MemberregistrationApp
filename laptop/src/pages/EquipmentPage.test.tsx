// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { EquipmentItem } from '../types/entities';
import { EquipmentPage } from './EquipmentPage';

const database = vi.hoisted(() => ({
	equipment: [] as EquipmentItem[],
	checkouts: [] as Array<Record<string, unknown>>,
	execute: vi.fn(),
	query: vi.fn()
}));
const queueEquipmentItem = vi.hoisted(() => vi.fn());
const triggerSync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../database', () => ({
	execute: database.execute,
	query: database.query
}));

vi.mock('../database/syncOutboxRepository', () => ({ queueEquipmentItem }));

vi.mock('../store/appStore', () => ({
	useAppStore: { getState: () => ({ triggerSync }) }
}));

function equipmentItem(overrides: Partial<EquipmentItem>): EquipmentItem {
	return {
		id: 'equipment-1',
		serialNumber: '100',
		name: 'Standard pistol',
		description: null,
		type: 'PISTOL',
		equipmentType: 'PISTOL',
		status: 'AVAILABLE',
		createdByDeviceId: 'laptop-master',
		syncVersion: 1,
		createdAtUtc: '2026-01-01T10:00:00Z',
		modifiedAtUtc: '2026-01-01T10:00:00Z',
		syncedAtUtc: '2026-01-01T10:00:00Z',
		...overrides
	};
}

describe('EquipmentPage', () => {
	beforeEach(() => {
		database.equipment = [
			equipmentItem({ id: 'available', name: 'Klubpistol', serialNumber: '20', description: 'Til begyndere' }),
			equipmentItem({ id: 'maintenance', name: 'Luftriffel', serialNumber: '3', equipmentType: 'AIR_RIFLE', type: 'AIR_RIFLE', status: 'MAINTENANCE' }),
			equipmentItem({ id: 'checked-out', name: 'Matchpistol', serialNumber: '11', status: 'CHECKED_OUT' })
		];
		database.checkouts = [{
			equipmentId: 'checked-out',
			memberName: 'Anna Jensen',
			checkedOutAtUtc: '2026-02-03T17:30:00Z'
		}];
		database.query.mockImplementation((sql: string, parameters?: unknown[]) => {
			if (sql.includes('FROM EquipmentCheckout')) return database.checkouts;
			if (sql.includes('WHERE id = ?')) return database.equipment.filter(item => item.id === parameters?.[0]);
			if (sql.includes('FROM EquipmentItem')) return database.equipment;
			return [];
		});
		database.execute.mockImplementation((_sql: string, parameters: unknown[]) => {
			const [id, serialNumber, name, description, equipmentType, createdAtUtc, modifiedAtUtc] = parameters;
			database.equipment.push(equipmentItem({
				id: String(id),
				serialNumber: String(serialNumber),
				name: String(name),
				description: description == null ? null : String(description),
				type: equipmentType as EquipmentItem['type'],
				equipmentType: equipmentType as EquipmentItem['type'],
				createdAtUtc: String(createdAtUtc),
				modifiedAtUtc: String(modifiedAtUtc),
				syncedAtUtc: null
			}));
		});
		queueEquipmentItem.mockClear();
		triggerSync.mockClear();
	});

	it('searches descriptions and active borrowers', async () => {
		render(<EquipmentPage />);
		await screen.findByText('Klubpistol');

		fireEvent.change(screen.getByRole('searchbox', { name: 'Søg i udstyr' }), { target: { value: 'begyndere' } });
		await waitFor(() => expect(screen.queryByText('Matchpistol')).toBeNull());
		expect(screen.getByText('Klubpistol')).toBeTruthy();

		fireEvent.change(screen.getByRole('searchbox', { name: 'Søg i udstyr' }), { target: { value: 'Anna Jensen' } });
		await waitFor(() => expect(screen.getByText('Matchpistol')).toBeTruthy());
		expect(screen.queryByText('Klubpistol')).toBeNull();
	});

	it('combines category and status filters and sorts items requiring action first', async () => {
		render(<EquipmentPage />);
		await screen.findByText('Klubpistol');

		fireEvent.change(screen.getByRole('combobox', { name: 'Filtrer efter kategori' }), { target: { value: 'PISTOL' } });
		fireEvent.change(screen.getByRole('combobox', { name: 'Filtrer efter status' }), { target: { value: 'CHECKED_OUT' } });
		expect(screen.getByText('Matchpistol')).toBeTruthy();
		expect(screen.queryByText('Klubpistol')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Ryd filtre' }));
		fireEvent.change(screen.getByRole('combobox', { name: 'Sortér udstyr' }), { target: { value: 'status' } });
		const maintenance = screen.getByRole('button', { name: /Luftriffel/ });
		const checkedOut = screen.getByRole('button', { name: /Matchpistol/ });
		expect(maintenance.compareDocumentPosition(checkedOut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('prevents duplicate serial numbers', async () => {
		render(<EquipmentPage />);
		await screen.findByText('Klubpistol');
		fireEvent.click(screen.getByRole('button', { name: 'Tilføj udstyr' }));

		fireEvent.change(screen.getByLabelText('Navn'), { target: { value: 'Ny salonriffel' } });
		fireEvent.change(screen.getByLabelText('Serienummer'), { target: { value: '20' } });
		expect(screen.getByText('Serienummeret bruges allerede.')).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Tilføj' }) as HTMLButtonElement).disabled).toBe(true);
		expect(database.execute).not.toHaveBeenCalled();
	});

	it('queues newly created equipment for synchronization', async () => {
		render(<EquipmentPage />);
		await screen.findByText('Klubpistol');
		fireEvent.click(screen.getByRole('button', { name: 'Tilføj udstyr' }));

		const nameInput = screen.getByLabelText('Navn');
		const serialNumberInput = screen.getByLabelText('Serienummer');
		const categorySelect = screen.getByLabelText('Kategori');
		const descriptionInput = screen.getByLabelText(/^Beskrivelse/);
		const addButton = screen.getByRole('button', { name: 'Tilføj' });
		fireEvent.change(nameInput, { target: { value: 'Ny salonriffel' } });
		fireEvent.change(categorySelect, { target: { value: 'RIFLE' } });
		fireEvent.change(descriptionInput, { target: { value: 'Salonriffel til træning' } });
		fireEvent.change(serialNumberInput, { target: { value: 'SR-42' } });
		fireEvent.click(addButton);

		await waitFor(() => expect(queueEquipmentItem).toHaveBeenCalledWith(
			expect.objectContaining({ serialNumber: 'SR-42', type: 'RIFLE', syncedAtUtc: null }),
			'INSERT'
		));
		expect(database.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO EquipmentItem'), expect.any(Array));
		expect(triggerSync).toHaveBeenCalled();
	});
});