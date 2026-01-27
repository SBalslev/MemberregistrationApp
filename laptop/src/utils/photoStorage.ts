/**
 * Photo storage utilities for managing member photos.
 *
 * Photos are processed in the Electron main process via IPC:
 * - Full resolution: {userData}/photos/members/{internalId}.jpg
 * - Thumbnails: 150x150 data URLs stored in database
 *
 * This module provides a clean interface for the renderer process.
 */

import type { ElectronAPI } from '../types/electron';

// Access the electron API from window
const getElectronAPI = (): ElectronAPI | undefined =>
  (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

/**
 * Process a photo: save full resolution to disk and generate thumbnail.
 *
 * @param internalId - Member's internal UUID
 * @param base64Data - Base64 encoded photo data (without data URL prefix)
 * @returns Object with photoPath (file path) and photoThumbnail (data URL)
 * @throws Error if processing fails or API not available
 */
export async function processPhoto(
  internalId: string,
  base64Data: string
): Promise<{ photoPath: string; photoThumbnail: string }> {
  const api = getElectronAPI();

  if (!api?.processPhoto) {
    throw new Error('Photo processing API not available');
  }

  // Strip data URL prefix if present
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

  const result = await api.processPhoto(internalId, cleanBase64);

  if (!result.success || !result.photoPath || !result.photoThumbnail) {
    throw new Error(result.error || 'Photo processing failed');
  }

  return {
    photoPath: result.photoPath,
    photoThumbnail: result.photoThumbnail,
  };
}

/**
 * Delete a member's photo file from disk.
 *
 * @param internalId - Member's internal UUID
 * @returns True if file was deleted, false if it didn't exist
 */
export async function deletePhotoFile(internalId: string): Promise<boolean> {
  const api = getElectronAPI();

  if (!api?.deletePhoto) {
    console.warn('[PhotoStorage] Delete API not available');
    return false;
  }

  const result = await api.deletePhoto(internalId);

  if (!result.success) {
    console.error('[PhotoStorage] Delete failed:', result.error);
    return false;
  }

  return result.deleted ?? false;
}

/**
 * Check if a member has a photo file on disk.
 *
 * @param internalId - Member's internal UUID
 * @returns Object with photoPath and exists flag
 */
export async function getPhotoPathFromDisk(
  internalId: string
): Promise<{ photoPath: string | null; exists: boolean }> {
  const api = getElectronAPI();

  if (!api?.getPhotoPath) {
    return { photoPath: null, exists: false };
  }

  return await api.getPhotoPath(internalId);
}

/**
 * Get the file:// URL for displaying a photo in the UI.
 *
 * @param photoPath - File path from database
 * @returns file:// URL for use in img src
 */
export function getPhotoFileUrl(photoPath: string): string {
  // Use forward slashes for file:// URLs even on Windows
  return `file://${photoPath.replace(/\\/g, '/')}`;
}

/**
 * Check if a string is a data URL (thumbnail).
 */
export function isDataUrl(value: string | null | undefined): boolean {
  return value?.startsWith('data:') ?? false;
}

/**
 * Check if a string is a file path (full photo).
 */
export function isFilePath(value: string | null | undefined): boolean {
  if (!value) return false;
  return !value.startsWith('data:') && !value.startsWith('http');
}

/**
 * Get the appropriate src for an img element.
 * Handles data URLs, file paths, and http URLs.
 *
 * @param photoSource - Photo path, data URL, or http URL
 * @returns URL suitable for img src
 */
export function getPhotoSrc(photoSource: string | null | undefined): string | null {
  if (!photoSource) return null;

  if (photoSource.startsWith('data:') || photoSource.startsWith('http')) {
    return photoSource;
  }

  // File path - convert to file:// URL
  return getPhotoFileUrl(photoSource);
}
