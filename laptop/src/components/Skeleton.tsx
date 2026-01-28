/**
 * Skeleton loading components.
 * Display placeholder content while data is loading.
 */

interface SkeletonProps {
  className?: string;
}

/**
 * Basic skeleton block with pulse animation.
 */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
    />
  );
}

/**
 * Skeleton for a text line.
 */
export function SkeletonText({ className = '', width = 'w-full' }: SkeletonProps & { width?: string }) {
  return <Skeleton className={`h-4 ${width} ${className}`} />;
}

/**
 * Skeleton for a circular avatar.
 */
export function SkeletonAvatar({ size = 'w-10 h-10' }: { size?: string }) {
  return <Skeleton className={`${size} rounded-full`} />;
}

/**
 * Skeleton for a member list row.
 */
export function SkeletonMemberRow() {
  return (
    <div className="flex items-center gap-4 p-4 border-b border-gray-100">
      <SkeletonAvatar size="w-10 h-10" />
      <div className="flex-1 space-y-2">
        <SkeletonText width="w-32" />
        <SkeletonText width="w-24" className="h-3" />
      </div>
      <Skeleton className="w-16 h-6 rounded-full" />
    </div>
  );
}

/**
 * Skeleton for a table row.
 */
export function SkeletonTableRow({ columns = 4 }: { columns?: number }) {
  return (
    <tr className="border-b border-gray-100">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <SkeletonText width={i === 0 ? 'w-32' : 'w-20'} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Skeleton for a stat card.
 */
export function SkeletonStatCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-4">
        <Skeleton className="w-12 h-12 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="w-16 h-7" />
          <SkeletonText width="w-24" className="h-3" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for a detail panel.
 */
export function SkeletonDetailPanel() {
  return (
    <div className="p-6 space-y-6">
      {/* Avatar and name */}
      <div className="text-center">
        <SkeletonAvatar size="w-20 h-20 mx-auto mb-4" />
        <SkeletonText width="w-32 mx-auto" className="h-5 mb-2" />
        <SkeletonText width="w-24 mx-auto" className="h-3" />
      </div>

      {/* Details */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <SkeletonText width="w-20" className="h-3 mb-1" />
            <SkeletonText width="w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for equipment list item.
 */
export function SkeletonEquipmentRow() {
  return (
    <div className="flex items-center gap-3 p-4 border-b border-gray-100">
      <Skeleton className="w-10 h-10 rounded-lg" />
      <div className="flex-1 space-y-2">
        <SkeletonText width="w-40" />
        <SkeletonText width="w-24" className="h-3" />
      </div>
      <Skeleton className="w-20 h-6 rounded-full" />
    </div>
  );
}
