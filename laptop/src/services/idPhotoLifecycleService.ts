/**
 * ID Photo Lifecycle Service
 *
 * Manages the lifecycle of ID photos for adult trial members.
 * ID photos should be automatically deleted when:
 * 1. Member has been assigned a membershipId (FULL member)
 * 2. Member has paid their membership fee for the current fiscal year
 *
 * This ensures compliance with data minimization principles - ID photos
 * are only retained while necessary for verification of new adult members.
 *
 * @see /docs/features/enhanced-trial-registration/tasks.md Phase 8
 */

import { execute, query } from '../database/db';
import { getMemberByInternalId } from '../database/memberRepository';
import { queueMember } from '../database/syncOutboxRepository';
import { getFeeRatesForYear, getPendingFeeTotal } from '../database/financeRepository';

// ===== Types =====

export interface IdPhotoDeletionResult {
  success: boolean;
  memberId: string;
  memberName: string;
  reason: string;
  error?: string;
}

export interface IdPhotoEligibilityCheck {
  isEligible: boolean;
  hasMembershipId: boolean;
  hasFeePaid: boolean;
  hasIdPhoto: boolean;
  reason: string;
}

export type MemberFeePaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

// ===== Configuration =====

/**
 * Get the current fiscal year for fee checking.
 * Fiscal year typically aligns with calendar year.
 */
function getCurrentFiscalYear(): number {
  return new Date().getFullYear();
}

// ===== Eligibility Checks =====

/**
 * Check if a member has paid their membership fee for the current fiscal year.
 * Checks both:
 * - Consolidated transaction lines with category 'FEES'
 * - Payments marked as paid externally (count toward current year)
 */
export function hasMemberPaidFee(internalId: string): boolean {
  return getMemberFeePaymentStatus(internalId) === 'PAID';
}

/**
 * Get the current fee payment status for a member.
 */
export function getMemberFeePaymentStatus(internalId: string): MemberFeePaymentStatus {
  const year = getCurrentFiscalYear();
  const member = getMemberByInternalId(internalId);

  if (!member) return 'UNPAID';

  // Get expected fee for member type
  const feeRates = getFeeRatesForYear(year);
  const memberType = member.memberType || 'ADULT';
  const expectedFee = feeRates.find((r) => r.memberType === memberType)?.feeAmount ?? 0;

  // Honorary members have 0 fee, so they are always "paid"
  if (expectedFee === 0) return 'PAID';

  // Get consolidated payments from transaction lines
  const consolidatedResult = query<{ total: number | null }>(
    `SELECT SUM(tl.amount) as total
     FROM TransactionLine tl
     JOIN FinancialTransaction ft ON tl.transactionId = ft.id
     WHERE tl.memberId = ?
       AND tl.categoryId = 'cat-kontingent'
       AND tl.isIncome = 1
       AND ft.fiscalYear = ?
       AND ft.isDeleted = 0`,
    [internalId, year]
  );
  const consolidatedTotal = consolidatedResult[0]?.total ?? 0;

  const externalResult = query<{ total: number | null }>(
    `SELECT SUM(p.amount) as total
     FROM PendingFeePayment p
     WHERE p.memberId = ?
       AND p.fiscalYear = ?
       AND p.isConsolidated = 1
       AND p.consolidatedTransactionId IS NULL`,
    [internalId, year]
  );
  const externallyPaidTotal = externalResult[0]?.total ?? 0;

  // Get pending (unconsolidated) payments
  const pendingTotal = getPendingFeeTotal(internalId, year);

  const totalPaid = consolidatedTotal + externallyPaidTotal;

  if (pendingTotal > 0) return 'PARTIAL';
  if (totalPaid === expectedFee) return 'PAID';
  if (totalPaid > 0) return 'PARTIAL';

  return 'UNPAID';
}

/**
 * Check if a member is eligible for ID photo deletion.
 * Both conditions must be met:
 * 1. Has membershipId assigned (FULL member)
 * 2. Has paid membership fee for current fiscal year
 * 3. Actually has an ID photo to delete
 */
export function checkIdPhotoEligibility(internalId: string): IdPhotoEligibilityCheck {
  const member = getMemberByInternalId(internalId);

  if (!member) {
    return {
      isEligible: false,
      hasMembershipId: false,
      hasFeePaid: false,
      hasIdPhoto: false,
      reason: 'Member not found',
    };
  }

  const hasIdPhoto = !!member.idPhotoPath;
  const hasMembershipId = !!member.membershipId && member.memberLifecycleStage === 'FULL';
  const hasFeePaid = hasMemberPaidFee(internalId);

  const isEligible = hasIdPhoto && hasMembershipId && hasFeePaid;

  let reason: string;
  if (!hasIdPhoto) {
    reason = 'No ID photo to delete';
  } else if (!hasMembershipId) {
    reason = 'Member has not been assigned a membership ID';
  } else if (!hasFeePaid) {
    reason = 'Membership fee not yet paid for current fiscal year';
  } else {
    reason = 'All conditions met - ID photo can be deleted';
  }

  return {
    isEligible,
    hasMembershipId,
    hasFeePaid,
    hasIdPhoto,
    reason,
  };
}

// ===== ID Photo Deletion =====

/**
 * Delete the ID photo for a member (database update only).
 * Sets idPhotoPath and idPhotoThumbnail to null and increments syncVersion.
 *
 * Note: File deletion is handled separately by the Electron main process
 * when the sync propagates to devices.
 */
export function clearIdPhotoFromMember(internalId: string): void {
  const now = new Date().toISOString();

  execute(
    `UPDATE Member
     SET idPhotoPath = NULL,
         idPhotoThumbnail = NULL,
         updatedAtUtc = ?,
         syncVersion = syncVersion + 1
     WHERE internalId = ?`,
    [now, internalId]
  );

  // Queue to outbox for sync propagation
  const updatedMember = getMemberByInternalId(internalId);
  if (updatedMember) {
    queueMember(updatedMember, 'UPDATE');
  }
}

/**
 * Delete ID photo for a member if eligible.
 * Returns the result of the operation.
 */
export function deleteIdPhotoIfEligible(internalId: string): IdPhotoDeletionResult {
  const member = getMemberByInternalId(internalId);

  if (!member) {
    return {
      success: false,
      memberId: internalId,
      memberName: 'Unknown',
      reason: 'Member not found',
      error: 'Member not found',
    };
  }

  const memberName = `${member.firstName} ${member.lastName}`;
  const eligibility = checkIdPhotoEligibility(internalId);

  if (!eligibility.isEligible) {
    return {
      success: false,
      memberId: internalId,
      memberName,
      reason: eligibility.reason,
    };
  }

  try {
    // Clear ID photo from database
    clearIdPhotoFromMember(internalId);

    // Log the deletion
    logIdPhotoDeletion(internalId, memberName, 'Automatic deletion - membership assigned and fee paid');

    console.log(`[IdPhotoLifecycle] Deleted ID photo for ${memberName} (${member.membershipId})`);

    return {
      success: true,
      memberId: internalId,
      memberName,
      reason: 'ID photo deleted successfully',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[IdPhotoLifecycle] Failed to delete ID photo for ${memberName}:`, error);

    return {
      success: false,
      memberId: internalId,
      memberName,
      reason: 'Deletion failed',
      error: errorMessage,
    };
  }
}

// ===== Batch Processing =====

/**
 * Find all members who are eligible for ID photo deletion.
 * Returns list of internal IDs.
 */
export function findMembersEligibleForIdPhotoDeletion(): string[] {
  // Find all FULL members with ID photos
  const candidates = query<{ internalId: string }>(
    `SELECT internalId FROM Member
     WHERE memberLifecycleStage = 'FULL'
       AND membershipId IS NOT NULL
       AND idPhotoPath IS NOT NULL`
  );

  // Filter to those who have also paid their fee
  return candidates
    .filter((c) => {
      const eligibility = checkIdPhotoEligibility(c.internalId);
      return eligibility.isEligible;
    })
    .map((c) => c.internalId);
}

/**
 * Process ID photo deletions for all eligible members.
 * Use this for startup checks or scheduled jobs.
 */
export function processAllEligibleIdPhotoDeletions(): IdPhotoDeletionResult[] {
  const eligibleIds = findMembersEligibleForIdPhotoDeletion();

  console.log(`[IdPhotoLifecycle] Found ${eligibleIds.length} members eligible for ID photo deletion`);

  const results: IdPhotoDeletionResult[] = [];

  for (const internalId of eligibleIds) {
    const result = deleteIdPhotoIfEligible(internalId);
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(`[IdPhotoLifecycle] Processed ${results.length} members, ${successCount} deletions successful`);

  return results;
}

// ===== Audit Logging =====

/**
 * Log an ID photo deletion to the audit log.
 */
function logIdPhotoDeletion(memberId: string, memberName: string, reason: string): void {
  const now = new Date().toISOString();

  try {
    execute(
      `INSERT INTO AuditLog (id, entityType, entityId, action, details, createdAtUtc)
       VALUES (?, 'Member', ?, 'ID_PHOTO_DELETED', ?, ?)`,
      [crypto.randomUUID(), memberId, JSON.stringify({ memberName, reason }), now]
    );
  } catch (error) {
    // Don't fail the deletion if audit logging fails
    console.warn('[IdPhotoLifecycle] Failed to write audit log:', error);
  }
}

/**
 * Get ID photo deletion history from audit log.
 */
export function getIdPhotoDeletionHistory(limit = 100): Array<{
  memberId: string;
  memberName: string;
  reason: string;
  deletedAt: string;
}> {
  try {
    const results = query<{ entityId: string; details: string; createdAtUtc: string }>(
      `SELECT entityId, details, createdAtUtc
       FROM AuditLog
       WHERE entityType = 'Member' AND action = 'ID_PHOTO_DELETED'
       ORDER BY createdAtUtc DESC
       LIMIT ?`,
      [limit]
    );

    return results.map((row) => {
      const details = JSON.parse(row.details) as { memberName: string; reason: string };
      return {
        memberId: row.entityId,
        memberName: details.memberName,
        reason: details.reason,
        deletedAt: row.createdAtUtc,
      };
    });
  } catch {
    // AuditLog table may not exist yet
    return [];
  }
}

// ===== Hook Functions =====

/**
 * Called when a membershipId is assigned.
 * Checks if the member is now eligible for ID photo deletion.
 */
export function onMembershipIdAssigned(internalId: string): void {
  // Use setTimeout to allow the current transaction to complete
  setTimeout(() => {
    const result = deleteIdPhotoIfEligible(internalId);
    if (result.success) {
      console.log(`[IdPhotoLifecycle] ID photo deleted after membership assignment for ${result.memberName}`);
    }
  }, 100);
}

/**
 * Called when a fee payment is recorded.
 * Checks if the member is now eligible for ID photo deletion.
 */
export function onFeePaymentRecorded(internalId: string): void {
  // Use setTimeout to allow the current transaction to complete
  setTimeout(() => {
    const result = deleteIdPhotoIfEligible(internalId);
    if (result.success) {
      console.log(`[IdPhotoLifecycle] ID photo deleted after fee payment for ${result.memberName}`);
    }
  }, 100);
}
