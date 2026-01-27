/**
 * Transaction filter utilities.
 * Separated from component file for React Fast Refresh compatibility.
 */

export interface TransactionFilters {
  dateFrom: string | null;
  dateTo: string | null;
  categoryId: string | null;
  searchQuery: string;
}

export const DEFAULT_FILTERS: TransactionFilters = {
  dateFrom: null,
  dateTo: null,
  categoryId: null,
  searchQuery: '',
};

/**
 * Apply filters to a list of transactions.
 */
export function applyTransactionFilters<T extends {
  date: string;
  description: string;
  lines: Array<{ categoryId: string }>;
}>(
  transactions: T[],
  filters: TransactionFilters
): T[] {
  return transactions.filter((txn) => {
    // Date from filter
    if (filters.dateFrom && txn.date < filters.dateFrom) {
      return false;
    }

    // Date to filter
    if (filters.dateTo && txn.date > filters.dateTo) {
      return false;
    }

    // Category filter
    if (filters.categoryId) {
      const hasCategory = txn.lines.some(
        (line) => line.categoryId === filters.categoryId
      );
      if (!hasCategory) {
        return false;
      }
    }

    // Search query
    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      if (!txn.description.toLowerCase().includes(query)) {
        return false;
      }
    }

    return true;
  });
}
