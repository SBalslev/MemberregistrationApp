import type { PendingDelete } from '../../database/onlineSyncService';

export interface PendingDeleteMemberInfo {
  firstName: string;
  lastName: string;
  membershipId?: string | null;
  internalId?: string | null;
}

export interface PendingDeleteSummary {
  title: string;
  subtitle: string;
}

export function buildPendingDeleteSummary(
  pending: PendingDelete,
  member?: PendingDeleteMemberInfo | null
): PendingDeleteSummary {
  if (pending.entityType === 'member') {
    const name = member ? `${member.firstName} ${member.lastName}` : 'Ukendt medlem';
    const membershipLabel = member?.membershipId ? `Medlemsnr: ${member.membershipId}` : 'Prøvemedlem';
    return {
      title: `Medlem: ${name}`,
      subtitle: `${membershipLabel} · ID: ${pending.entityId}`,
    };
  }

  return {
    title: `Sletning: ${pending.entityType}`,
    subtitle: `ID: ${pending.entityId}`,
  };
}
