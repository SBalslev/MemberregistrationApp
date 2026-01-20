/**
 * Photo Migration - converts existing data URL photos to file system storage.
 *
 * This migration:
 * 1. Finds members with registrationPhotoPath containing data URLs
 * 2. Saves full photo to file system
 * 3. Generates 150x150 thumbnail
 * 4. Updates photoPath and photoThumbnail columns
 *
 * Run once on app startup to migrate existing data.
 */

import { query, execute } from './db';
import { processPhoto } from '../utils/photoStorage';

interface MemberWithDataUrl {
  internalId: string;
  registrationPhotoPath: string;
}

/**
 * Check if a string is a base64 data URL.
 */
function isDataUrl(value: string | null | undefined): boolean {
  return value?.startsWith('data:image') ?? false;
}

/**
 * Extract base64 data from a data URL.
 */
function extractBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '');
}

/**
 * Run photo migration for existing members.
 * Converts registrationPhotoPath data URLs to file + thumbnail.
 *
 * @returns Migration result with counts
 */
export async function runPhotoMigration(): Promise<{
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
}> {
  console.log('[PhotoMigration] Starting migration...');

  // Find members with data URL photos that haven't been migrated
  const membersToMigrate = query<MemberWithDataUrl>(`
    SELECT internalId, registrationPhotoPath
    FROM Member
    WHERE registrationPhotoPath LIKE 'data:image%'
      AND (photoPath IS NULL OR photoPath = '')
  `);

  const result = {
    total: membersToMigrate.length,
    migrated: 0,
    skipped: 0,
    errors: 0,
  };

  if (membersToMigrate.length === 0) {
    console.log('[PhotoMigration] No members to migrate.');
    return result;
  }

  console.log(`[PhotoMigration] Found ${membersToMigrate.length} members to migrate.`);

  for (const member of membersToMigrate) {
    try {
      // Skip if not a valid data URL
      if (!isDataUrl(member.registrationPhotoPath)) {
        result.skipped++;
        continue;
      }

      // Extract base64 data
      const base64Data = extractBase64(member.registrationPhotoPath);

      // Process photo (save to disk, generate thumbnail)
      const { photoPath, photoThumbnail } = await processPhoto(
        member.internalId,
        base64Data
      );

      // Update database
      execute(
        `UPDATE Member
         SET photoPath = ?, photoThumbnail = ?
         WHERE internalId = ?`,
        [photoPath, photoThumbnail, member.internalId]
      );

      result.migrated++;
      console.log(`[PhotoMigration] Migrated: ${member.internalId}`);
    } catch (error) {
      result.errors++;
      console.error(
        `[PhotoMigration] Error migrating ${member.internalId}:`,
        error
      );
    }
  }

  console.log(
    `[PhotoMigration] Complete. Migrated: ${result.migrated}, Skipped: ${result.skipped}, Errors: ${result.errors}`
  );

  return result;
}

/**
 * Check if migration is needed.
 * Returns true if there are members with data URL photos that haven't been migrated.
 */
export function isMigrationNeeded(): boolean {
  const count = query<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM Member
    WHERE registrationPhotoPath LIKE 'data:image%'
      AND (photoPath IS NULL OR photoPath = '')
  `)[0]?.count ?? 0;

  return count > 0;
}
