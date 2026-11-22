import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Armchair, Check, Info, X } from 'lucide-react';
import type { AircraftSeat, CabinClass, CurrencyCode, FlightOption } from '../types/travel';
import { convertFromUsd, formatMoney } from '../utils/formatters';

interface SeatSelectionProps {
  flight: FlightOption;
  travelDate: string;
  cabin: CabinClass;
  currency: CurrencyCode;
  selectedSeat: string;
  onSelectSeat: (seat: AircraftSeat) => void;
  simulatedOffline: boolean;
}

const DEFAULT_OCCUPIED = new Set([
  '1A', '2D', '4A', '6B', '6E', '8C', '9D', '11B', '11E', '12F', '15A', '15C', '16D',
]);

type SeatFilter = 'all' | 'extra-legroom' | 'window' | 'aisle';

export const SeatSelection: React.FC<SeatSelectionProps> = ({
  flight,
  travelDate,
  cabin,
  currency,
  selectedSeat,
  onSelectSeat,
  simulatedOffline,
}) => {
  const [occupiedSet, setOccupiedSet] = useState<Set<string>>(DEFAULT_OCCUPIED);
  const [loading, setLoading] = useState(false);
  const [seatFilter, setSeatFilter] = useState<SeatFilter>('all');

  useEffect(() => {
    let active = true;
    const loadSeats = async () => {
      if (simulatedOffline || !navigator.onLine) {
        setOccupiedSet(DEFAULT_OCCUPIED);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `/api/flights/${encodeURIComponent(flight.id)}/seats?date=${encodeURIComponent(travelDate)}`
        );
        if (res.ok && active) {
          const data = await res.json();
          if (Array.isArray(data.occupiedSeats)) {
            setOccupiedSet(new Set(data.occupiedSeats as string[]));
          }
        }
      } catch {
        if (active) setOccupiedSet(DEFAULT_OCCUPIED);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadSeats();
    return () => {
      active = false;
    };
  }, [flight.id, travelDate, simulatedOffline]);

  const rows = useMemo(() => {
    const result: { rowNumber: number; section: 'business' | 'economy'; isExit: boolean; left: AircraftSeat[]; right: AircraftSeat[] }[] = [];

    // Rows 1-3: First / Business 2-2 configuration (A, C | D, F)
    for (let r = 1; r <= 3; r++) {
      const makeSeat = (letter: string, pos: 'Window' | 'Aisle'): AircraftSeat => {
        const id = `${r}${letter}`;
        return {
          id,
          row: r,
          letter,
          cabin: r === 1 ? 'first' : 'business',
          position: pos,
          status: occupiedSet.has(id) ? 'occupied' : 'available',
          extraLegroom: true,
          feeDeltaUsd: 0,
        };
      };
      result.push({
        rowNumber: r,
        section: 'business',
        isExit: false,
        left: [makeSeat('A', 'Window'), makeSeat('C', 'Aisle')],
        right: [makeSeat('D', 'Aisle'), makeSeat('F', 'Window')],
      });
    }

    // Rows 4-14: Premium & Economy 3-3 configuration (A, B, C | D, E, F)
    for (let r = 4; r <= 14; r++) {
      const isExit = r === 9;
      const rowCabin: CabinClass = r <= 5 ? 'premium' : 'economy';
      const makeSeat = (letter: string, pos: 'Window' | 'Middle' | 'Aisle'): AircraftSeat => {
        const id = `${r}${letter}`;
        return {
          id,
          row: r,
          letter,
          cabin: rowCabin,
          position: pos,
          status: occupiedSet.has(id) ? 'occupied' : 'available',
          extraLegroom: isExit || r === 4,
          feeDeltaUsd: isExit ? 28 : 0,
        };
      };
      result.push({
        rowNumber: r,
        section: 'economy',
        isExit,
        left: [makeSeat('A', 'Window'), makeSeat('B', 'Middle'), makeSeat('C', 'Aisle')],
        right: [makeSeat('D', 'Aisle'), makeSeat('E', 'Middle'), makeSeat('F', 'Window')],
      });
    }
    return result;
  }, [occupiedSet]);

  const allSeats = useMemo(() => rows.flatMap((r) => [...r.left, ...r.right]), [rows]);
  const currentSeatObj = allSeats.find((s) => s.id === selectedSeat) || null;
  const availableCount = allSeats.filter((s) => s.status === 'available').length;

  const matchesFilter = (seat: AircraftSeat): boolean => {
    if (seatFilter === 'all') return true;
    if (seatFilter === 'extra-legroom') return seat.extraLegroom;
    if (seatFilter === 'window') return seat.position === 'Window';
    if (seatFilter === 'aisle') return seat.position === 'Aisle';
    return true;
  };

  const matchingAvailableCount = allSeats.filter(
    (s) => s.status === 'available' && matchesFilter(s)
  ).length;

  return (
    <section aria-labelledby="seat-map-heading" className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <h3 id="seat-map-heading" className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Armchair className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
            <span>Interactive Cabin Seat Map</span>
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {flight.aircraft} · {availableCount} seats open
            {seatFilter !== 'all' ? ` · ${matchingAvailableCount} matching filter` : ''} · Pick your exact seat to sync with your QR boarding pass
          </p>
        </div>

        {/* Non-hue-only Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-4 w-4 rounded border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800" />
            Available
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-[#0F4C81] text-white">
              <Check className="h-2.5 w-2.5" />
            </span>
            Selected
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded border border-amber-500/70 bg-amber-50 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              +
            </span>
            Exit Legroom
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500">
              <X className="h-2.5 w-2.5" />
            </span>
            Occupied
          </span>
        </div>
      </div>

      {/* Seat Preference Filter Toggle */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter cabin seats" className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(
            [
              { id: 'all', label: 'All Seats' },
              { id: 'extra-legroom', label: 'Extra Legroom' },
              { id: 'window', label: 'Window' },
              { id: 'aisle', label: 'Aisle' },
            ] as { id: SeatFilter; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={seatFilter === opt.id}
              onClick={() => setSeatFilter(opt.id)}
              className={`relative min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                seatFilter === opt.id
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {seatFilter === opt.id && (
                <motion.span
                  layoutId="seat-filter-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-md bg-white shadow-sm dark:bg-slate-900"
                />
              )}
              <span className="relative z-10">{opt.label}</span>
            </button>
          ))}
        </div>

        {seatFilter !== 'all' && (
          <span className="font-mono text-xs font-medium text-[#0F4C81] dark:text-blue-400 tabular-nums">
            Highlighting {matchingAvailableCount} {seatFilter.replace('-', ' ')} seats
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Visual Fuselage Cabin Layout */}
        <div className="lg:col-span-8 flex justify-center overflow-x-auto">
          <div className="w-full max-w-md rounded-t-[72px] rounded-b-3xl border border-slate-300 bg-slate-50 px-5 pt-6 pb-6 dark:border-slate-700 dark:bg-slate-950/70">
            {/* Cockpit Nose Indicator */}
            <div className="mb-5 flex flex-col items-center">
              <div className="h-1.5 w-16 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="mt-2 font-mono text-[11px] font-semibold tracking-wider text-slate-500 dark:text-slate-400">
                FLIGHT DECK · {flight.flightNumber}
              </span>
            </div>

            {loading ? (
              <div className="py-16 text-center text-xs text-slate-500">Syncing live cabin seat map…</div>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <React.Fragment key={row.rowNumber}>
                    {row.rowNumber === 4 && (
                      <div className="my-3 flex items-center gap-2 border-y border-dashed border-slate-300 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        <span className="flex-1 text-center">Galley &amp; Lavatory Divider · Main Cabin</span>
                      </div>
                    )}
                    {row.isExit && (
                      <div className="my-2 flex items-center justify-between text-[10px] font-mono font-semibold text-amber-700 dark:text-amber-400">
                        <span>← EXIT WING</span>
                        <span>EXTRA LEGROOM</span>
                        <span>EXIT WING →</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      {/* Left Seat Bank */}
                      <div className={`grid gap-1.5 ${row.section === 'business' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {row.left.map((seat) => {
                          const isSelected = seat.id === selectedSeat;
                          const isOccupied = seat.status === 'occupied';
                          const isMatch = matchesFilter(seat);
                          const isHighlighted = seatFilter !== 'all' && !isOccupied && isMatch && !isSelected;
                          const isDimmed = seatFilter !== 'all' && !isMatch && !isSelected;
                          return (
                            <motion.button
                              key={seat.id}
                              type="button"
                              disabled={isOccupied}
                              whileHover={isOccupied ? undefined : { scale: 1.06 }}
                              whileTap={isOccupied ? undefined : { scale: 0.94 }}
                              transition={{ duration: 0.14 }}
                              onClick={() => onSelectSeat(seat)}
                              aria-label={`Seat ${seat.id}, ${seat.position}, ${seat.extraLegroom ? 'Extra Legroom, ' : ''}${isOccupied ? 'Occupied' : 'Available'}`}
                              aria-pressed={isSelected}
                              className={`flex h-10 ${
                                row.section === 'business' ? 'w-12' : 'w-9 sm:w-10'
                              } items-center justify-center rounded-md border font-mono text-xs font-semibold transition-all ${
                                isDimmed ? 'opacity-25' : 'opacity-100'
                              } ${
                                isSelected
                                  ? 'border-[#0F4C81] bg-[#0F4C81] text-white shadow-sm'
                                  : isOccupied
                                  ? 'cursor-not-allowed border-slate-200 bg-slate-200 text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-600'
                                  : isHighlighted
                                  ? 'border-sky-600 bg-sky-50 text-sky-950 ring-2 ring-sky-500/40 dark:border-sky-400 dark:bg-sky-950/60 dark:text-sky-100'
                                  : seat.feeDeltaUsd > 0
                                  ? 'border-amber-400 bg-amber-50/70 text-amber-900 hover:border-[#0F4C81] dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-200'
                                  : 'border-slate-300 bg-white text-slate-800 hover:border-[#0F4C81] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                              }`}
                            >
                              {isOccupied ? <X className="h-3.5 w-3.5" /> : seat.id}
                            </motion.button>
                          );
                        })}
                      </div>

                      {/* Aisle Walkway */}
                      <div className="w-6 text-center font-mono text-[11px] font-medium text-slate-400 tabular-nums">
                        {row.rowNumber}
                      </div>

                      {/* Right Seat Bank */}
                      <div className={`grid gap-1.5 ${row.section === 'business' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {row.right.map((seat) => {
                          const isSelected = seat.id === selectedSeat;
                          const isOccupied = seat.status === 'occupied';
                          const isMatch = matchesFilter(seat);
                          const isHighlighted = seatFilter !== 'all' && !isOccupied && isMatch && !isSelected;
                          const isDimmed = seatFilter !== 'all' && !isMatch && !isSelected;
                          return (
                            <motion.button
                              key={seat.id}
                              type="button"
                              disabled={isOccupied}
                              whileHover={isOccupied ? undefined : { scale: 1.06 }}
                              whileTap={isOccupied ? undefined : { scale: 0.94 }}
                              transition={{ duration: 0.14 }}
                              onClick={() => onSelectSeat(seat)}
                              aria-label={`Seat ${seat.id}, ${seat.position}, ${seat.extraLegroom ? 'Extra Legroom, ' : ''}${isOccupied ? 'Occupied' : 'Available'}`}
                              aria-pressed={isSelected}
                              className={`flex h-10 ${
                                row.section === 'business' ? 'w-12' : 'w-9 sm:w-10'
                              } items-center justify-center rounded-md border font-mono text-xs font-semibold transition-all ${
                                isDimmed ? 'opacity-25' : 'opacity-100'
                              } ${
                                isSelected
                                  ? 'border-[#0F4C81] bg-[#0F4C81] text-white shadow-sm'
                                  : isOccupied
                                  ? 'cursor-not-allowed border-slate-200 bg-slate-200 text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-600'
                                  : isHighlighted
                                  ? 'border-sky-600 bg-sky-50 text-sky-950 ring-2 ring-sky-500/40 dark:border-sky-400 dark:bg-sky-950/60 dark:text-sky-100'
                                  : seat.feeDeltaUsd > 0
                                  ? 'border-amber-400 bg-amber-50/70 text-amber-900 hover:border-[#0F4C81] dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-200'
                                  : 'border-slate-300 bg-white text-slate-800 hover:border-[#0F4C81] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                              }`}
                            >
                              {isOccupied ? <X className="h-3.5 w-3.5" /> : seat.id}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Selected Seat Summary Panel */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/60 overflow-hidden">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Booking Seat</div>
            <AnimatePresence mode="wait">
              {currentSeatObj ? (
                <motion.div
                  key={currentSeatObj.id}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                  className="mt-2 space-y-3"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-3xl font-bold text-[#0F4C81] dark:text-blue-400">
                      {currentSeatObj.id}
                    </span>
                    <span className="text-xs font-semibold capitalize text-slate-700 dark:text-slate-300">
                      {currentSeatObj.position} · {currentSeatObj.cabin}
                    </span>
                  </div>
                  <dl className="space-y-1.5 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Cabin Zone</dt>
                      <dd className="font-medium capitalize text-slate-800 dark:text-slate-200">{cabin}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Legroom Pitch</dt>
                      <dd className="font-medium text-slate-800 dark:text-slate-200">
                        {currentSeatObj.extraLegroom ? '36 in (Extra)' : '31 in Standard'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Seat Fee</dt>
                      <dd className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                        {currentSeatObj.feeDeltaUsd > 0
                          ? formatMoney(convertFromUsd(currentSeatObj.feeDeltaUsd, currency), currency)
                          : 'Included'}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 pt-1">
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    <span>Synced with booking state &amp; QR pass</span>
                  </div>
                </motion.div>
              ) : (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Select any open seat on the aircraft fuselage map to assign it to your ticket.
                </p>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-slate-200 p-3.5 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
            <Info className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" aria-hidden="true" />
            <span>
              Seats marked with an amber outline are Wing Exit rows offering extra legroom. Occupied seats reflect live confirmed PNRs.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
