import { describe, expect, it } from 'vitest';
import type { EquipmentItem } from '../types/entities';
import { equipmentItemToOnline } from './onlineApiService';

function equipmentItem(overrides: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: 'equipment-1',
    serialNumber: 'SN-1',
    name: 'Training target',
    description: null,
    type: 'TRAINING_MATERIAL',
    equipmentType: 'TRAINING_MATERIAL',
    status: 'AVAILABLE',
    syncVersion: 1,
    createdAtUtc: '2026-10-12T17:00:00Z',
    modifiedAtUtc: '2026-10-12T17:00:00Z',
    syncedAtUtc: null,
    ...overrides,
  };
}

describe('equipmentItemToOnline', () => {
  it('normalizes legacy equipment values', () => {
    const legacyItem = equipmentItem();
    Object.assign(legacyItem, {
      type: 'TrainingMaterial',
      equipmentType: 'TrainingMaterial',
      status: 'CheckedOut',
    });

    expect(equipmentItemToOnline(legacyItem)).toMatchObject({
      equipment_type: 'TRAINING_MATERIAL',
      status: 'CHECKED_OUT',
    });
  });

  it('rejects unknown equipment types before sending them', () => {
    const invalidItem = equipmentItem();
    Object.assign(invalidItem, { type: 'UNKNOWN' });

    expect(() => equipmentItemToOnline(invalidItem)).toThrow('Unsupported equipment type: UNKNOWN');
  });
});
