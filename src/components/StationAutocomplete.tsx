import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Train, Plane } from 'lucide-react';
import { STATIONS } from '../data/stationsAndFlights';
import type { Station } from '../types/travel';

interface StationAutocompleteProps {
  label: string;
  value: string;
  onChange: (code: string) => void;
  lowBandwidth: boolean;
  simulatedOffline: boolean;
  excludeCode?: string;
}

export const StationAutocomplete: React.FC<StationAutocompleteProps> = ({
  label,
  value,
  onChange,
  lowBandwidth,
  simulatedOffline,
  excludeCode,
}) => {
  const selectedStation = STATIONS.find((s) => s.code === value);
  const [query, setQuery] = useState(selectedStation ? `${selectedStation.city} (${selectedStation.code})` : value);
  const [open, setOpen] = useState(false);
  const [hubFilter, setHubFilter] = useState<'all' | 'india'>('all');
  const [results, setResults] = useState<Station[]>(STATIONS.slice(0, 8));
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const st = STATIONS.find((s) => s.code === value);
    if (st) {
      setQuery(`${st.city} (${st.code})`);
    }
  }, [value]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const runSearch = async (term: string, filterOverride?: 'all' | 'india') => {
    const clean = term.trim().toLowerCase();
    const activeFilter = filterOverride ?? hubFilter;
    const localFilter = () =>
      STATIONS.filter(
        (s) =>
          s.code !== excludeCode &&
          (activeFilter !== 'india' || s.country === 'India') &&
          (!clean ||
            s.code.toLowerCase().includes(clean) ||
            s.city.toLowerCase().includes(clean) ||
            s.name.toLowerCase().includes(clean) ||
            s.country.toLowerCase().includes(clean))
      ).slice(0, 15);

    // Always render immediate local prefix matches for zero-latency low-bandwidth UX
    setResults(localFilter());
    setActiveIndex(0);

    if (simulatedOffline || !navigator.onLine) return;

    try {
      const countryParam = activeFilter === 'india' ? '&country=India' : '';
      const resp = await fetch(`/api/stations?q=${encodeURIComponent(clean)}${countryParam}`, {
        headers: lowBandwidth ? { 'x-bandwidth-mode': 'low' } : {},
      });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.stations)) {
          const merged = (data.stations as Station[])
            .filter((s) => s.code !== excludeCode && (activeFilter !== 'india' || s.country === 'India'))
            .map((s) => STATIONS.find((full) => full.code === s.code) || s);
          setResults(merged.slice(0, 15));
        }
      }
    } catch {
      // Fallback already populated locally
    }
  };

  const selectStation = (st: Station) => {
    onChange(st.code);
    setQuery(`${st.city} (${st.code})`);
    setOpen(false);
  };

  const indiaHubCount = STATIONS.filter((s) => s.country === 'India' && s.code !== excludeCode).length;

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="text"
          value={query}
          aria-label={label}
          aria-expanded={open}
          autoComplete="off"
          onFocus={() => {
            setOpen(true);
            runSearch('');
          }}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            setOpen(true);
            runSearch(val);
          }}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((prev) => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter' && results[activeIndex]) {
              e.preventDefault();
              selectStation(results[activeIndex]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder="City, airport or IATA code (e.g. DEL, BOM, JFK)"
          className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white pl-9 pr-12 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {selectedStation && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs font-semibold text-[#0F4C81] dark:text-blue-400">
            {selectedStation.code}
          </span>
        )}
      </div>

      {open && (
        <div className="absolute z-40 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Region</span>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800" role="group" aria-label="Filter airports by region">
              <button
                type="button"
                aria-pressed={hubFilter === 'all'}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setHubFilter('all');
                  runSearch('', 'all');
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  hubFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                All Hubs
              </button>
              <button
                type="button"
                aria-pressed={hubFilter === 'india'}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setHubFilter('india');
                  runSearch('', 'india');
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  hubFilter === 'india'
                    ? 'bg-white text-[#0F4C81] shadow-sm dark:bg-slate-950 dark:text-blue-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                India ({indiaHubCount})
              </button>
            </div>
          </div>

          {results.length === 0 ? (
            <div className="px-3.5 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
              No matching airports or stations found.
            </div>
          ) : (
            <ul role="listbox" className="max-h-64 overflow-auto py-1">
              {results.map((st, idx) => (
                <li key={st.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={idx === activeIndex}
                    onMouseDown={() => selectStation(st)}
                    className={`flex w-full min-h-[44px] items-center justify-between gap-3 px-3.5 py-2 text-left text-sm transition-colors ${
                      idx === activeIndex
                        ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {st.type === 'rail_hub' ? (
                        <Train className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      ) : (
                        <Plane className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {st.city}, {st.country}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {st.name} · {st.transitLink}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-[#0F4C81] dark:text-blue-400 shrink-0">
                      {st.code}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
