/**
 * MinIdraet Search page - lookup foreninger, spillesteder, and udøvere.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { onlineApiService, type MinIdraetSearchResult, type MinIdraetSearchType } from '../database/onlineApiService';

const SEARCH_TYPES: Array<{ id: MinIdraetSearchType; label: string; description: string }> = [
  { id: 'forening', label: 'Forening', description: 'Klubber og foreninger' },
  { id: 'spillested', label: 'Spillested', description: 'Spillesteder og skoler' },
  { id: 'udover', label: 'Udøver/Skytte', description: 'Udøvere og skytter' },
];

const MIN_QUERY_LENGTH = 3;

export function MinIdraetSearchPage() {
  const [searchType, setSearchType] = useState<MinIdraetSearchType>('forening');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MinIdraetSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('https://minidraet.dgi.dk');
  const requestIdRef = useRef(0);

  const trimmedQuery = query.trim();
  const canSearch = trimmedQuery.length >= MIN_QUERY_LENGTH;

  const activeType = useMemo(
    () => SEARCH_TYPES.find((t) => t.id === searchType) || SEARCH_TYPES[0],
    [searchType]
  );

  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsSearching(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const response = await onlineApiService.searchMinIdraet({
          type: searchType,
          query: trimmedQuery,
          maxRows: 20,
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        setResults(response.results || []);
        if (response.base_url) {
          setBaseUrl(response.base_url);
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setResults([]);
        setError(err instanceof Error ? err.message : 'Søgning fejlede');
      } finally {
        if (requestId === requestIdRef.current) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [canSearch, searchType, trimmedQuery]);

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">DGI søgning</h1>
            <p className="text-gray-600 mt-1">
              Søg i Min Idræt efter {activeType.label.toLowerCase()}.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Kilde:</span>
            <a
              href={baseUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
            >
              minidraet.dgi.dk
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {SEARCH_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setSearchType(type.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                searchType === type.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex flex-col items-start">
                <span>{type.label}</span>
                <span className={`text-xs ${searchType === type.id ? 'text-blue-100' : 'text-gray-400'}`}>
                  {type.description}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 max-w-2xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={`Søg efter ${activeType.label.toLowerCase()}...`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Indtast mindst {MIN_QUERY_LENGTH} tegn for at søge.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isSearching ? (
          <div className="flex items-center gap-3 text-gray-500">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
            Søger i Min Idræt...
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        ) : !canSearch ? (
          <div className="text-gray-500">Indtast mindst {MIN_QUERY_LENGTH} tegn for at starte søgningen.</div>
        ) : results.length === 0 ? (
          <div className="text-gray-500">Ingen resultater fundet.</div>
        ) : (
          <div className="space-y-3">
            {results.map((result, index) => {
              const href = result.url ? `${baseUrl}${result.url}` : baseUrl;
              return (
                <div
                  key={`${result.text}-${result.url}-${index}`}
                  className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="text-gray-900 font-medium">{result.text}</p>
                    {result.idraet && (
                      <p className="text-sm text-gray-500">Idræt: {result.idraet}</p>
                    )}
                  </div>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                  >
                    Åbn
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
