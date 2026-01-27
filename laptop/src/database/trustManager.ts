/**
 * Trust Manager for laptop sync security.
 * Manages device authentication tokens and pairing codes.
 * 
 * @see [security-tasks.md] - SEC-1, SEC-2, SEC-3, SEC-4
 */

import { query, execute } from './db';
import type { DeviceInfo } from '../types/entities';
import { v4 as uuidv4 } from 'uuid';

// Token lifetime: 30 days
const TOKEN_LIFETIME_DAYS = 30;
// Auto-renew when 7 days or less remaining
const RENEW_THRESHOLD_DAYS = 7;
// Pairing code validity: 2 minutes
const PAIRING_CODE_VALIDITY_MS = 2 * 60 * 1000;
// Rate limit: 3 attempts per device
const MAX_PAIRING_ATTEMPTS = 3;
// Block duration after failed attempts: 5 minutes
const BLOCK_DURATION_MS = 5 * 60 * 1000;

/** Active pairing session */
interface PairingSession {
  code: string;
  createdAt: number;
  deviceType: string | null;
  deviceName: string | null;
}

/** Rate limit tracking */
interface RateLimitEntry {
  attempts: number;
  blockedUntil: number | null;
}

// In-memory state
let activePairingSession: PairingSession | null = null;
const rateLimits = new Map<string, RateLimitEntry>();

/**
 * Extended device info with auth token fields.
 */
export interface TrustedDeviceWithToken extends DeviceInfo {
  authToken: string | null;
  tokenExpiresAt: string | null;
}

/**
 * Generate a cryptographically random auth token.
 */
export function generateAuthToken(): string {
  // UUID v4 provides 122 bits of randomness
  return `tok_${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`;
}

/**
 * Generate a 6-digit pairing code.
 */
export function generatePairingCode(): string {
  // Generate 6 random digits
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Calculate token expiration date (30 days from now).
 */
export function calculateTokenExpiry(): string {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + TOKEN_LIFETIME_DAYS);
  return expiresAt.toISOString();
}

/**
 * Check if a token should be renewed (within 7 days of expiry).
 */
export function shouldRenewToken(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  
  const expiry = new Date(expiresAt);
  const renewThreshold = new Date();
  renewThreshold.setDate(renewThreshold.getDate() + RENEW_THRESHOLD_DAYS);
  
  return expiry <= renewThreshold;
}

/**
 * Check if a token has expired.
 */
export function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt) <= new Date();
}

/**
 * Start a new pairing session with a 6-digit code.
 * Returns the code to display to the user.
 */
export function startPairingSession(deviceType?: string, deviceName?: string): { code: string; expiresAt: Date } {
  const code = generatePairingCode();
  const createdAt = Date.now();
  
  activePairingSession = {
    code,
    createdAt,
    deviceType: deviceType || null,
    deviceName: deviceName || null
  };
  
  const expiresAt = new Date(createdAt + PAIRING_CODE_VALIDITY_MS);
  console.log(`[TrustManager] Started pairing session with code ${code}, expires at ${expiresAt.toISOString()}`);
  
  return { code, expiresAt };
}

/**
 * Cancel the current pairing session.
 */
export function cancelPairingSession(): void {
  activePairingSession = null;
  console.log('[TrustManager] Pairing session cancelled');
}

/**
 * Get current pairing session info (for UI display).
 */
export function getPairingSession(): { code: string; expiresAt: Date; isExpired: boolean } | null {
  if (!activePairingSession) return null;
  
  const expiresAt = new Date(activePairingSession.createdAt + PAIRING_CODE_VALIDITY_MS);
  const isExpired = Date.now() > activePairingSession.createdAt + PAIRING_CODE_VALIDITY_MS;
  
  return { code: activePairingSession.code, expiresAt, isExpired };
}

/**
 * Check if a device is rate-limited.
 */
function isRateLimited(deviceId: string): boolean {
  const entry = rateLimits.get(deviceId);
  if (!entry) return false;
  
  if (entry.blockedUntil && Date.now() < entry.blockedUntil) {
    return true;
  }
  
  // Block expired, reset
  if (entry.blockedUntil && Date.now() >= entry.blockedUntil) {
    rateLimits.delete(deviceId);
    return false;
  }
  
  return false;
}

/**
 * Record a failed pairing attempt and check rate limit.
 */
function recordFailedAttempt(deviceId: string): { blocked: boolean; blockedUntil: Date | null } {
  let entry = rateLimits.get(deviceId);
  
  if (!entry) {
    entry = { attempts: 0, blockedUntil: null };
  }
  
  entry.attempts++;
  
  if (entry.attempts >= MAX_PAIRING_ATTEMPTS) {
    entry.blockedUntil = Date.now() + BLOCK_DURATION_MS;
    rateLimits.set(deviceId, entry);
    console.log(`[TrustManager] Device ${deviceId} blocked until ${new Date(entry.blockedUntil).toISOString()}`);
    return { blocked: true, blockedUntil: new Date(entry.blockedUntil) };
  }
  
  rateLimits.set(deviceId, entry);
  return { blocked: false, blockedUntil: null };
}

/**
 * Validate a pairing code and complete the pairing ceremony.
 * 
 * @param code The 6-digit code entered by the tablet
 * @param deviceId The tablet's device ID
 * @param deviceType The tablet's device type
 * @param deviceName The tablet's device name
 * @returns Token and device info on success, error on failure
 */
export function validatePairingCode(
  code: string,
  deviceId: string,
  deviceType: string,
  deviceName: string
): { success: true; token: string; expiresAt: string } | { success: false; error: string; blockedUntil?: Date } {
  // Check rate limit
  if (isRateLimited(deviceId)) {
    const entry = rateLimits.get(deviceId);
    return { 
      success: false, 
      error: 'Too many failed attempts. Please wait.', 
      blockedUntil: entry?.blockedUntil ? new Date(entry.blockedUntil) : undefined 
    };
  }
  
  // Check if session exists and is valid
  if (!activePairingSession) {
    recordFailedAttempt(deviceId);
    return { success: false, error: 'No active pairing session' };
  }
  
  // Check if session expired
  if (Date.now() > activePairingSession.createdAt + PAIRING_CODE_VALIDITY_MS) {
    activePairingSession = null;
    recordFailedAttempt(deviceId);
    return { success: false, error: 'Pairing code expired' };
  }
  
  // Validate code
  if (code !== activePairingSession.code) {
    const result = recordFailedAttempt(deviceId);
    if (result.blocked) {
      return { success: false, error: 'Invalid code. Device blocked.', blockedUntil: result.blockedUntil || undefined };
    }
    return { success: false, error: 'Invalid pairing code' };
  }
  
  // Code is valid! Generate token and save device
  const token = generateAuthToken();
  const expiresAt = calculateTokenExpiry();
  
  // Save trusted device to database
  try {
    saveTrustedDevice({
      id: deviceId,
      name: deviceName,
      type: deviceType as DeviceInfo['type'],
      lastSeenUtc: new Date().toISOString(),
      pairingDateUtc: new Date().toISOString(),
      ipAddress: null,
      port: 8085,
      isTrusted: true,
      isOnline: true
    }, token, expiresAt);
  } catch (error) {
    console.error('[TrustManager] Failed to save trusted device:', error);
    return { success: false, error: 'Failed to save device' };
  }
  
  // Clear the pairing session and rate limit
  activePairingSession = null;
  rateLimits.delete(deviceId);
  
  console.log(`[TrustManager] Device ${deviceName} (${deviceId}) successfully paired`);
  
  return { success: true, token, expiresAt };
}

/**
 * Save or update a trusted device with its auth token.
 */
export function saveTrustedDevice(
  device: DeviceInfo,
  authToken: string,
  tokenExpiresAt: string
): void {
  const existingDevices = query<TrustedDeviceWithToken>(
    'SELECT id FROM TrustedDevice WHERE id = ?',
    [device.id]
  );
  
  if (existingDevices.length > 0) {
    // Update existing
    execute(
      `UPDATE TrustedDevice SET
        name = ?, type = ?, lastSeenUtc = ?, ipAddress = ?, port = ?,
        isTrusted = ?, authToken = ?, tokenExpiresAt = ?
      WHERE id = ?`,
      [
        device.name, device.type, device.lastSeenUtc, device.ipAddress, device.port,
        device.isTrusted ? 1 : 0, authToken, tokenExpiresAt, device.id
      ]
    );
  } else {
    // Insert new
    execute(
      `INSERT INTO TrustedDevice 
        (id, name, type, lastSeenUtc, pairingDateUtc, ipAddress, port, isTrusted, authToken, tokenExpiresAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        device.id, device.name, device.type, device.lastSeenUtc, device.pairingDateUtc,
        device.ipAddress, device.port, device.isTrusted ? 1 : 0, authToken, tokenExpiresAt
      ]
    );
  }
}

/**
 * Validate an auth token from a request.
 * Returns the device info if valid, null if invalid.
 */
export function validateAuthToken(token: string): TrustedDeviceWithToken | null {
  if (!token) return null;
  
  try {
    const devices = query<TrustedDeviceWithToken>(
      `SELECT id, name, type, lastSeenUtc, pairingDateUtc, ipAddress, port, 
              isTrusted, authToken, tokenExpiresAt, 0 as isOnline
       FROM TrustedDevice 
       WHERE authToken = ? AND isTrusted = 1`,
      [token]
    );
    
    if (devices.length === 0) {
      console.log('[TrustManager] Token not found in database');
      return null;
    }
    
    const device = devices[0];
    
    // Check if token expired
    if (isTokenExpired(device.tokenExpiresAt)) {
      console.log(`[TrustManager] Token expired for device ${device.name}`);
      return null;
    }
    
    // Update last seen
    execute(
      'UPDATE TrustedDevice SET lastSeenUtc = ? WHERE id = ?',
      [new Date().toISOString(), device.id]
    );
    
    // Check if we should renew the token
    if (shouldRenewToken(device.tokenExpiresAt)) {
      const newExpiry = calculateTokenExpiry();
      execute(
        'UPDATE TrustedDevice SET tokenExpiresAt = ? WHERE id = ?',
        [newExpiry, device.id]
      );
      device.tokenExpiresAt = newExpiry;
      console.log(`[TrustManager] Auto-renewed token for device ${device.name}, new expiry: ${newExpiry}`);
    }
    
    return device;
  } catch (error) {
    console.error('[TrustManager] Token validation error:', error);
    return null;
  }
}

/**
 * Get all trusted devices.
 */
export function getTrustedDevices(): TrustedDeviceWithToken[] {
  return query<TrustedDeviceWithToken>(
    `SELECT id, name, type, lastSeenUtc, pairingDateUtc, ipAddress, port, 
            isTrusted, authToken, tokenExpiresAt, 0 as isOnline
     FROM TrustedDevice 
     WHERE isTrusted = 1
     ORDER BY lastSeenUtc DESC`
  );
}

/**
 * Get a trusted device by ID.
 */
export function getTrustedDevice(deviceId: string): TrustedDeviceWithToken | null {
  const devices = query<TrustedDeviceWithToken>(
    `SELECT id, name, type, lastSeenUtc, pairingDateUtc, ipAddress, port, 
            isTrusted, authToken, tokenExpiresAt, 0 as isOnline
     FROM TrustedDevice 
     WHERE id = ? AND isTrusted = 1`,
    [deviceId]
  );
  return devices.length > 0 ? devices[0] : null;
}

/**
 * Revoke trust for a device.
 */
export function revokeTrust(deviceId: string): boolean {
  try {
    execute(
      'UPDATE TrustedDevice SET isTrusted = 0, authToken = NULL WHERE id = ?',
      [deviceId]
    );
    console.log(`[TrustManager] Trust revoked for device ${deviceId}`);
    return true;
  } catch (error) {
    console.error('[TrustManager] Failed to revoke trust:', error);
    return false;
  }
}

/**
 * Delete a device from the trusted list.
 */
export function deleteTrustedDevice(deviceId: string): boolean {
  try {
    execute('DELETE FROM TrustedDevice WHERE id = ?', [deviceId]);
    console.log(`[TrustManager] Device ${deviceId} removed from trusted list`);
    return true;
  } catch (error) {
    console.error('[TrustManager] Failed to delete device:', error);
    return false;
  }
}

/**
 * Log a failed authentication attempt for audit purposes.
 */
export function logAuthFailure(token: string | null, ipAddress: string | null, reason: string): void {
  // For now, just console log. Could be stored in database for audit.
  console.warn(`[TrustManager] AUTH FAILURE - IP: ${ipAddress}, Reason: ${reason}, Token: ${token ? token.substring(0, 10) + '...' : 'none'}`);
}
