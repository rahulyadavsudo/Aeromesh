import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, MapPin, Plane, Search } from 'lucide-react';
import { STATIONS } from '../data/stationsAndFlights';
import type { Station } from '../types/travel';

interface IndiaAirportListProps {
  fromCode: string;
  toCode: string;
  onSelectFrom: (code: string) => void;
  onSelectTo: (code: string) => void;
}

export const IndiaAirportList: React.FC<IndiaAirportListProps> = ({
  fromCode,
  toCode,
  onSelectFrom,
  onSelectTo,
}) => {
  const [filterText, setFilterText] = useState('');

  const indiaAirports: Station[] = useMemo(() => {
    const clean = filterText.trim().toLowerCase();
    return STATIONS.filter((s) => s.country === 'India').filter((s) => {
      if (!clean) return true;
      return (
        s.code.toLowerCase().includes(clean) ||
        s.city.toLowerCase().includes(clean) ||
        (s.state ? s.state.toLowerCase().includes(clean) : false) ||
        s.name.toLowerCase().includes(clean) ||
        s.transitLink.toLowerCase().includes(clean) ||
        Boolean(s.aliases?.some((a) => a.toLowerCase().includes(clean)))
      );
    });
  }, [filterText]);

  return (
    <section aria-labelledby="india-airports-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F4C81] dark:text-blue-400">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            <span>INDIA AVIATION &amp; METRO NETWORK</span>
          </div>
          <h2 id="india-airports-heading" className="mt-1 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            India Airport Directory ({indiaAirports.length} Hubs)
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Tap Set Origin or Set Destination on any Indian airport to load flights and INR fares immediately.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter city, state or code (e.g. Maharashtra, DEL)..."
            aria-label="Filter Indian airports"
            className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {indiaAirports.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          No Indian airports matched "{filterText}".
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {indiaAirports.map((airport, idx) => {
            const isOrigin = fromCode === airport.code;
            const isDest = toCode === airport.code;
            return (
              <motion.article
                key={airport.code}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.28, delay: (idx % 6) * 0.05, ease: [0.16, 1, 0.3, 1] }}
                className={`flex flex-col justify-between rounded-xl border p-4 transition-colors ${
                  isOrigin || isDest
                    ? 'border-[#0F4C81] bg-sky-50/40 shadow-sm dark:border-blue-500 dark:bg-blue-950/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {airport.city}
                        {airport.state && airport.state.toLowerCase() !== airport.city.toLowerCase() ? `, ${airport.state}` : ''}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                        {airport.name}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-[#0F4C81] dark:bg-slate-800 dark:text-blue-400 shrink-0">
                      <Plane className="h-3 w-3" aria-hidden="true" />
                      {airport.code}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Terminals: {airport.terminals.join(', ')}
                    </span>
                    <span> · {airport.transitLink}</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={isDest}
                    onClick={() => onSelectFrom(airport.code)}
                    className={`flex-1 min-h-[36px] inline-flex items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      isOrigin
                        ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <span>{isOrigin ? 'Selected Origin' : 'Set Origin'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isOrigin}
                    onClick={() => onSelectTo(airport.code)}
                    className={`flex-1 min-h-[36px] inline-flex items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      isDest
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <span>{isDest ? 'Selected Dest' : 'Set Dest'}</span>
                    {!isDest && <ArrowRight className="h-3 w-3" aria-hidden="true" />}
                  </button>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </section>
  );
};
