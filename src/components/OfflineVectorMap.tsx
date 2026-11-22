import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Download, Map as MapIcon, Navigation, ZoomIn, ZoomOut } from 'lucide-react';
import { OFFLINE_MAP_PACKS, STATIONS } from '../data/stationsAndFlights';
import type { TranslationSet } from '../data/i18n';
import type { OfflineMapPack } from '../types/travel';
import { loadOfflineItem, saveOfflineItem } from '../utils/formatters';

interface OfflineVectorMapProps {
  selectedFrom: string;
  selectedTo: string;
  t: TranslationSet;
  simulatedOffline: boolean;
}

export const OfflineVectorMap: React.FC<OfflineVectorMapProps> = ({
  selectedFrom,
  selectedTo,
  t,
  simulatedOffline,
}) => {
  const [zoom, setZoom] = useState(1);
  const [activeStationCode, setActiveStationCode] = useState(selectedFrom || 'LHR');
  const [cachedRegions, setCachedRegions] = useState<string[]>(() =>
    loadOfflineItem<string[]>('cachedMapRegions', ['EU', 'NA'])
  );
  const [cachedPacks, setCachedPacks] = useState<Record<string, OfflineMapPack>>(() =>
    loadOfflineItem<Record<string, OfflineMapPack>>('cachedMapPacks', {})
  );
  const [syncingRegion, setSyncingRegion] = useState<string | null>(null);

  const fromStation = STATIONS.find((s) => s.code === selectedFrom) || STATIONS[0];
  const toStation = STATIONS.find((s) => s.code === selectedTo) || STATIONS[4];
  const activeStation = STATIONS.find((s) => s.code === activeStationCode) || fromStation;

  const activeRegionPack =
    cachedPacks[activeStation.region] ||
    OFFLINE_MAP_PACKS.find((p) => p.region === activeStation.region) ||
    OFFLINE_MAP_PACKS[0];

  const activeTerminalMap =
    activeRegionPack.terminalMaps.find((tm) => tm.code === activeStation.code) ||
    activeRegionPack.terminalMaps[0];

  const handleDownloadPack = async (region: 'NA' | 'EU' | 'APAC' | 'MEA') => {
    setSyncingRegion(region);
    try {
      let pack: OfflineMapPack | undefined;
      if (!simulatedOffline && navigator.onLine) {
        const res = await fetch(`/api/maps/packs/${region}`);
        if (res.ok) {
          const data = await res.json();
          pack = data.pack as OfflineMapPack;
        }
      }
      if (!pack) {
        pack = OFFLINE_MAP_PACKS.find((p) => p.region === region);
      }
      if (pack) {
        const nextRegions = Array.from(new Set([...cachedRegions, region]));
        const nextPacks = { ...cachedPacks, [region]: pack };
        setCachedRegions(nextRegions);
        setCachedPacks(nextPacks);
        saveOfflineItem('cachedMapRegions', nextRegions);
        saveOfflineItem('cachedMapPacks', nextPacks);
      }
    } finally {
      setSyncingRegion(null);
    }
  };

  // Quadratic curve control point for great-circle flight arc
  const midX = (fromStation.mapX + toStation.mapX) / 2;
  const midY = Math.min(fromStation.mapY, toStation.mapY) - Math.abs(fromStation.mapX - toStation.mapX) * 0.16;

  return (
    <section aria-labelledby="offline-map-heading" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="offline-map-heading" className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MapIcon className="h-5 w-5 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
            <span>{t.offlineMapTitle}</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Zero-tile lightweight SVG vector cartography · Works 100% offline with cached terminal gates &amp; rail links
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Zoom out map"
            onClick={() => setZoom((z) => Math.max(0.85, Math.round((z - 0.15) * 100) / 100))}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="font-mono text-xs text-slate-500 w-12 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in map"
            onClick={() => setZoom((z) => Math.min(1.6, Math.round((z + 0.15) * 100) / 100))}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Vector Map Canvas */}
        <div className="lg:col-span-8 overflow-hidden rounded-xl border border-slate-200 bg-[#0B1220] p-3 dark:border-slate-800">
          <div className="overflow-auto">
            <svg
              viewBox="0 0 1000 460"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              className="w-full h-auto min-h-[260px] transition-transform duration-200"
              role="img"
              aria-label="Interactive offline route and airport hub vector map"
            >
              {/* Latitude / Longitude grid */}
              <g stroke="#1E293B" strokeWidth="1">
                {[80, 160, 240, 320, 400].map((y) => (
                  <line key={y} x1="0" y1={y} x2="1000" y2={y} strokeDasharray="4 4" />
                ))}
                {[150, 300, 450, 600, 750, 900].map((x) => (
                  <line key={x} x1={x} y1="0" x2={x} y2="460" strokeDasharray="4 4" />
                ))}
              </g>

              {/* Stylized Minimalist Continent Silhouettes (Offline SVG Vector) */}
              <g fill="#162238" stroke="#253655" strokeWidth="1.2">
                {/* North America */}
                <path d="M90,110 L290,95 L320,175 L250,245 L175,235 L110,180 Z" />
                {/* South America */}
                <path d="M260,260 L345,275 L330,400 L275,425 L245,330 Z" />
                {/* Europe */}
                <path d="M445,85 L560,80 L575,155 L460,170 L440,130 Z" />
                {/* Africa & Middle East */}
                <path d="M455,180 L655,180 L670,255 L575,275 L540,395 L470,340 L445,235 Z" />
                {/* Asia */}
                <path d="M580,85 L895,90 L905,215 L795,310 L675,260 L655,175 Z" />
                {/* Australia */}
                <path d="M815,345 L930,340 L940,420 L830,425 Z" />
              </g>

              {/* Active Corridor Arc */}
              <path
                d={`M ${fromStation.mapX} ${fromStation.mapY} Q ${midX} ${midY} ${toStation.mapX} ${toStation.mapY}`}
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.5"
                strokeDasharray="6 4"
              />
              <motion.circle
                r="4"
                fill="#FFFFFF"
                stroke="#38BDF8"
                strokeWidth="2"
                initial={{ cx: fromStation.mapX, cy: fromStation.mapY, opacity: 0.9 }}
                animate={{
                  cx: [fromStation.mapX, midX, toStation.mapX],
                  cy: [fromStation.mapY, midY, toStation.mapY],
                  opacity: [0.3, 1, 0.3],
                }}
                transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Hub Nodes */}
              {STATIONS.map((st) => {
                const isSelected = st.code === fromStation.code || st.code === toStation.code;
                const isFocused = st.code === activeStation.code;
                const isCached = cachedRegions.includes(st.region);
                return (
                  <g
                    key={st.code}
                    className="cursor-pointer"
                    onClick={() => setActiveStationCode(st.code)}
                  >
                    {isFocused && (
                      <circle cx={st.mapX} cy={st.mapY} r="13" fill="none" stroke="#38BDF8" strokeWidth="1.5" />
                    )}
                    <circle
                      cx={st.mapX}
                      cy={st.mapY}
                      r={isSelected ? 6 : 4.5}
                      fill={isSelected ? '#38BDF8' : isCached ? '#10B981' : '#94A3B8'}
                      stroke="#0B1220"
                      strokeWidth="1.5"
                    />
                    <text
                      x={st.mapX}
                      y={st.mapY - 10}
                      textAnchor="middle"
                      fill={isSelected || isFocused ? '#F8FAFC' : '#94A3B8'}
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight={isSelected ? '700' : '500'}
                    >
                      {st.code}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-2 text-xs text-slate-400">
            <span className="font-mono">
              Active Route: {fromStation.code} → {toStation.code}
            </span>
            <span>Green nodes = Region offline map pack cached</span>
          </div>
        </div>

        {/* Terminal Gate Inspector & Offline Region Packs */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-xs font-semibold text-[#0F4C81] dark:text-blue-400">
                  {activeStation.code} · {activeStation.region}
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{activeStation.city} Terminal &amp; Transit</h4>
              </div>
              <Navigation className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{activeStation.transitLink}</p>

            {activeTerminalMap && (
              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Cached Gate Walk Times</div>
                {activeTerminalMap.gates.map((g) => (
                  <div key={g.id} className="flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      Gate {g.id} · {g.concourse}
                    </span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {g.walkMin} min walk · {g.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2.5">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">Offline Map Packs</div>
            {OFFLINE_MAP_PACKS.map((pack) => {
              const isCached = cachedRegions.includes(pack.region);
              return (
                <div
                  key={pack.region}
                  className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-none last:pb-0 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{pack.name}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {pack.hubsCount} hubs · {pack.sizeKb} KB
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadPack(pack.region)}
                    disabled={syncingRegion === pack.region}
                    className={`inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      isCached
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                        : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900'
                    }`}
                  >
                    {isCached ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                    <span>{syncingRegion === pack.region ? 'Sync…' : isCached ? 'Cached' : t.downloadMapPack}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
