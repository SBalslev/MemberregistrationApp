/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
  execute: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn((fn: () => void) => fn()),
}));

vi.mock('../utils/photoStorage', () => ({
  processPhoto: vi.fn(),
}));

import { execute, query } from './db';
import { onlineApiService } from './onlineApiService';
import { onlineSyncService } from './onlineSyncService';
import { processPhoto } from '../utils/photoStorage';
import type { Member } from '../types/entities';
import type { OnlinePhotoMetadata } from './onlineApiService';

interface MemberSelectionAccess {
  getModifiedMembers(fullSync: boolean, requiredMemberIds?: ReadonlySet<string>): Member[];
  downloadMissingPhoto(photo: OnlinePhotoMetadata): Promise<void>;
}

describe('OnlineSyncService parent dependency selection', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
    vi.mocked(execute).mockReset();
    vi.mocked(processPhoto).mockReset();
    vi.restoreAllMocks();
  });

  it('includes required members regardless of incremental sync timestamps', () => {
    vi.mocked(query).mockReturnValue([]);
    const service = onlineSyncService as unknown as MemberSelectionAccess;

    service.getModifiedMembers(false, new Set(['member-required-by-check-in']));

    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toContain('OR internalId IN (?)');
    expect(params).toEqual(['1970-01-01T00:00:00Z', 'member-required-by-check-in']);
  });

  it('downloads and stores a remote profile photo when the member has no local photo', async () => {
    vi.mocked(query).mockReturnValue([{
      photoPath: null,
      photoThumbnail: null,
      idPhotoPath: null,
      idPhotoThumbnail: null,
    }]);
    vi.spyOn(onlineApiService, 'downloadPhoto').mockResolvedValue(
      {
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      } as Blob
    );
    vi.mocked(processPhoto).mockResolvedValue({
      photoPath: 'C:\\photos\\member-1.jpg',
      photoThumbnail: 'data:image/jpeg;base64,thumbnail',
    });
    const service = onlineSyncService as unknown as MemberSelectionAccess;

    await service.downloadMissingPhoto({
      id: 'photo-1',
      internal_member_id: 'member-1',
      photo_type: 'profile',
      content_hash: 'hash',
      mime_type: 'image/jpeg',
      file_size: 3,
      width: null,
      height: null,
      device_id: 'laptop-2',
      sync_version: 1,
      created_at_utc: '2026-10-03T08:00:00Z',
    });

    expect(onlineApiService.downloadPhoto).toHaveBeenCalledWith('photo-1');
    expect(processPhoto).toHaveBeenCalledWith('member-1', 'AQID');
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('SET photoPath = ?, photoThumbnail = ?'),
      [
        'C:\\photos\\member-1.jpg',
        'data:image/jpeg;base64,thumbnail',
        'member-1',
      ]
    );
  });
});