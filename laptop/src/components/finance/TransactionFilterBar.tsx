/**
 * Transaction filter bar component.
 * Provides filtering by date range, category, and search.
 */

import { useState, useCallback } from 'react';
import { Search, Calendar, Tag, X, Filter } from 'lucide-react';
import type { PostingCategory } from '../../types';
import { type TransactionFilters, DEFAULT_FILTERS } from './transactionFilterUtils';

interface TransactionFilterBarProps {
  categories: PostingCategory[];
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  /** Total number of items before filtering */
  totalCount?: number;
  /** Number of items after filtering */
  filteredCount?: number;
}

export function TransactionFilterBar({
  categories,
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
}: TransactionFilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasActiveFilters =
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.categoryId !== null ||
    filters.searchQuery.trim() !== '';

  const handleClearFilters = useCallback(() => {
    onFiltersChange(DEFAULT_FILTERS);
  }, [onFiltersChange]);

  const updateFilter = <K extends keyof TransactionFilters>(
    key: K,
    value: TransactionFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 mb-4">
      {/* Collapsed Search Bar */}
      <div className="p-3 flex items-center gap-3">
        {/* Search Input */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Søg i beskrivelse..."
            value={filters.searchQuery}
            onChange={(e) => updateFilter('searchQuery', e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Filter Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isExpanded || hasActiveFilters
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filter
          {hasActiveFilters && (
            <span className="w-2 h-2 bg-blue-600 rounded-full" />
          )}
        </button>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
            Ryd
          </button>
        )}

        {/* Result Count */}
        {totalCount !== undefined && filteredCount !== undefined && (
          <span className="text-sm text-gray-500 whitespace-nowrap">
            {hasActiveFilters ? (
              <>
                <span className="font-medium text-gray-700">{filteredCount}</span>
                {' af '}
                {totalCount}
              </>
            ) : (
              <>{totalCount} transaktioner</>
            )}
          </span>
        )}
      </div>

      {/* Active Filter Chips (shown when collapsed) */}
      {!isExpanded && hasActiveFilters && (
        <div className="px-3 pb-3 flex flex-wrap gap-2">
          {filters.dateFrom && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs">
              <Calendar className="w-3 h-3" />
              Fra: {filters.dateFrom}
              <button
                onClick={() => updateFilter('dateFrom', null)}
                className="ml-1 hover:text-blue-900"
                aria-label="Fjern fra-dato filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.dateTo && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs">
              <Calendar className="w-3 h-3" />
              Til: {filters.dateTo}
              <button
                onClick={() => updateFilter('dateTo', null)}
                className="ml-1 hover:text-blue-900"
                aria-label="Fjern til-dato filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.categoryId && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs">
              <Tag className="w-3 h-3" />
              {categories.find(c => c.id === filters.categoryId)?.name || 'Kategori'}
              <button
                onClick={() => updateFilter('categoryId', null)}
                className="ml-1 hover:text-blue-900"
                aria-label="Fjern kategori filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Date From */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Calendar className="inline w-3 h-3 mr-1" />
                Fra dato
              </label>
              <input
                type="date"
                value={filters.dateFrom || ''}
                onChange={(e) => updateFilter('dateFrom', e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Calendar className="inline w-3 h-3 mr-1" />
                Til dato
              </label>
              <input
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) => updateFilter('dateTo', e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Tag className="inline w-3 h-3 mr-1" />
                Kategori
              </label>
              <select
                value={filters.categoryId || ''}
                onChange={(e) => updateFilter('categoryId', e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Alle kategorier</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
