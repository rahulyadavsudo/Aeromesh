'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Armchair, ArrowRight, Check, Info, RotateCcw, X } from 'lucide-react';
import type { AircraftSeat, CabinClass, CurrencyCode, FlightOption } from '../types/travel';
import { convertFromUsd, formatMoney } from '../utils/formatters';

interface SeatSelectionProps {
  flight: FlightOption;
  travelDate: string;
  cabin: CabinClass;
  currency: CurrencyCode;
  passengersCount?: number;
  selectedSeat: AircraftSeat | null;
  onSelectSeat: (seat: AircraftSeat | null) => void;
  simulatedOffline: boolean;
  onContinueToFareLab?: () => void;
}

const DEFAULT_OCCUPIED = new Set([
  '1A', '2D', '4A', '6B', '6E', '8C', '9D', '11B', '11E', '12F', '15A', '15C', '16D',
]);

type SeatFilter = 'all' | 'extra-legroom' | 'window' | 'aisle' | 'free';

export function computeSeatFeeUsd(row: number, cabin: CabinClass): number {
  if (row <= 3) {
    return cabin === 'business' || cabin === 'first' ? 0 : 45;
  }
  if (row <= 5) {
    return cabin === 'economy' ? 18 : 0;
  }
  if (row === 9) {
    return 28;
  }
  return 0;
}

export const SeatSelection: React.FC<SeatSelectionProps> = ({
  flight,
  travelDate,
  cabin,
  currency,
  passengersCount = 1,
  selectedSeat,
  onSelectSeat,
  simulatedOffline,
  onContinueToFareLab,
}) => {
  const [occupiedSet, setOccupiedSet] = useState<Set<string>>(DEFAULT_OCCUPIED);
  const [loading, setLoading] = useState(false);
  const [seatFilter, setSeatFilter] = useState<SeatFilter>('all');

  useEffect(() => {
    let active = true;
    const loadSeats = async () => {
      if (simulatedOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
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
    void loadSeats();
    return () => {
      active = false;
    };
  }, [flight.id, travelDate, simulatedOffline]);

  const rows = useMemo(() => {
    const result: {
      rowNumber: number;
      section: 'business' | 'economy';
      isExit: boolean;
      isPreferred: boolean;
      left: AircraftSeat[];
      right: AircraftSeat[];
    }[] = [];

    // Rows 1-3: First / Business 2-2 configuration (A, C | D, F)
    for (let r = 1; r <= 3; r++) {
      const fee = computeSeatFeeUsd(r, cabin);
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
          feeDeltaUsd: fee,
        };
      };
      result.push({
        rowNumber: r,
        section: 'business',
        isExit: false,
        isPreferred: false,
        left: [makeSeat('A', 'Window'), makeSeat('C', 'Aisle')],
        right: [makeSeat('D', 'Aisle'), makeSeat('F', 'Window')],
      });
    }

    // Rows 4-14: Premium Front (4-5), Wing Exit (9), Standard Economy (6-8, 10-14) in 3-3 grid
    for (let r = 4; r <= 14; r++) {
      const isExit = r === 9;
      const isPreferred = r <= 5;
      const rowCabin: CabinClass = isPreferred ? 'premium' : 'economy';
      const fee = computeSeatFeeUsd(r, cabin);
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
          feeDeltaUsd: fee,
        };
      };
      result.push({
        rowNumber: r,
        section: 'economy',
        isExit,
        isPreferred,
        left: [makeSeat('A', 'Window'), makeSeat('B', 'Middle'), makeSeat('C', 'Aisle')],
        right: [makeSeat('D', 'Aisle'), makeSeat('E', 'Middle'), makeSeat('F', 'Window')],
      });
    }
    return result;
  }, [occupiedSet, cabin]);

  const allSeats = useMemo(() => rows.flatMap((r) => [...r.left, ...r.right]), [rows]);
  const selectedSeatId = selectedSeat?.id || '';
  const currentSeatObj = allSeats.find((s) => s.id === selectedSeatId) || null;
  const availableCount = allSeats.filter((s) => s.status === 'available').length;

  // Keep selectedSeat fee synchronized automatically if cabin class or flight occupancy changes
  useEffect(() => {
    if (!selectedSeat) return;
    const updated = allSeats.find((s) => s.id === selectedSeat.id);
    if (!updated) return;
    if (updated.status === 'occupied') {
      onSelectSeat(null);
    } else if (updated.feeDeltaUsd !== selectedSeat.feeDeltaUsd) {
      onSelectSeat(updated);
    }
  }, [allSeats, selectedSeat, onSelectSeat]);

  const matchesFilter = (seat: AircraftSeat): boolean => {
    if (seatFilter === 'all') return true;
    if (seatFilter === 'extra-legroom') return seat.extraLegroom;
    if (seatFilter === 'window') return seat.position === 'Window';
    if (seatFilter === 'aisle') return seat.position === 'Aisle';
    if (seatFilter === 'free') return seat.feeDeltaUsd === 0;
    return true;
  };

  const matchingAvailableCount = allSeats.filter(
    (s) => s.status === 'available' && matchesFilter(s)
  ).length;

  const handleToggleSeat = (seat: AircraftSeat) => {
    if (seat.status === 'occupied') return;
    if (selectedSeatId === seat.id) {
      onSelectSeat(null);
    } else {
      onSelectSeat(seat);
    }
  };

  const seatFeeTotal = currentSeatObj
    ? convertFromUsd(currentSeatObj.feeDeltaUsd * passengersCount, currency)
    : 0;
  const perSeatFee = currentSeatObj
    ? convertFromUsd(currentSeatObj.feeDeltaUsd, currency)
    : 0;

  const formatCompactFee = (usd: number) => {
    if (usd <= 0) return null;
    const val = convertFromUsd(usd, currency);
    return `+${formatMoney(val, currency).replace(/\.00$/, '')}`;
  };

  const renderSeatButton = (seat: AircraftSeat) => {
    const isSelected = seat.id === selectedSeatId;
    const isOccupied = seat.status === 'occupied';
    const isMatch = matchesFilter(seat);
    const isHighlighted = seatFilter !== 'all' && !isOccupied && isMatch && !isSelected;
    const isDimmed = seatFilter !== 'all' && !isMatch && !isSelected;
    const compactFee = formatCompactFee(seat.feeDeltaUsd);

    return (
      <motion.button
        key={seat.id}
        type="button"
        disabled={isOccupied}
        whileHover={isOccupied ? undefined : { scale: 1.05 }}
        whileTap={isOccupied ? undefined : { scale: 0.94 }}
        transition={{ duration: 0.14 }}
        onClick={() => handleToggleSeat(seat)}
        title={
          isOccupied
            ? `Seat ${seat.id} occupied`
            : isSelected
            ? `Click to deselect seat ${seat.id}`
            : `Select seat ${seat.id} (${seat.position}${compactFee ? `, ${compactFee}` : ', Included'})`
        }
        aria-label={`Seat ${seat.id}, ${seat.position}, ${seat.extraLegroom ? 'Extra Legroom, ' : ''}${
          seat.feeDeltaUsd > 0 ? `${compactFee} fee, ` : 'Included, '
        }${isOccupied ? 'Occupied' : isSelected ? 'Selected — press to deselect' : 'Available'}`}
        aria-pressed={isSelected}
        className={`relative flex h-11 flex-col items-center justify-center rounded-md border pt-1 font-mono transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C81] ${
          isDimmed ? 'opacity-25' : 'opacity-100'
        } ${
          isSelected
            ? 'border-[#0F4C81] bg-[#0F4C81] text-white shadow-sm'
            : isOccupied
            ? 'cursor-not-allowed border-slate-200 bg-slate-200 text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-600'
            : isHighlighted
            ? 'border-sky-600 bg-sky-50 text-sky-950 ring-2 ring-sky-500/40 dark:border-sky-400 dark:bg-sky-950/60 dark:text-sky-100'
            : seat.feeDeltaUsd > 0
            ? 'border-amber-400 bg-amber-50/70 text-amber-950 hover:border-[#0F4C81] dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-200'
            : 'border-slate-300 bg-white text-slate-800 hover:border-[#0F4C81] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
        }`}
      >
        {/* Seat headrest visual bar */}
        <span
          aria-hidden="true"
          className={`absolute top-0.5 h-1 w-5 rounded-full ${
            isSelected
              ? 'bg-sky-300'
              : isOccupied
              ? 'bg-slate-300 dark:bg-slate-700'
              : seat.feeDeltaUsd > 0
              ? 'bg-amber-400 dark:bg-amber-500'
              : 'bg-slate-300 dark:bg-slate-600'
          }`}
        />
        {isOccupied ? (
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <>
            <span className="text-[11px] font-bold leading-none tabular-nums">
              {isSelected ? '✓ ' : ''}
              {seat.id}
            </span>
            <span
              className={`mt-0.5 text-[9px] leading-none tabular-nums ${
                isSelected
                  ? 'text-sky-100'
                  : seat.feeDeltaUsd > 0
                  ? 'font-semibold text-amber-800 dark:text-amber-300'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {compactFee || 'Free'}
            </span>
          </>
        )}
      </motion.button>
    );
  };

  const businessRows = rows.filter((r) => r.section === 'business');
  const economyRows = rows.filter((r) => r.section === 'economy');

  return (
    <section
      aria-labelledby="seat-map-heading"
      className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <h3 id="seat-map-heading" className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Armchair className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
            <span>Interactive Aircraft Cabin Seat Map</span>
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {flight.flightNumber} ({flight.from} → {flight.to}) · {flight.aircraft} · {availableCount} seats open
            {seatFilter !== 'all' ? ` · ${matchingAvailableCount} matching filter` : ''} · Click a seat to select or toggle off
          </p>
        </div>

        {/* Non-hue-only Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-4 w-4 rounded border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800" />
            Standard (Free)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded border border-amber-500/70 bg-amber-50 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              $
            </span>
            Paid Upgrade / Exit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-[#0F4C81] text-white">
              <Check className="h-2.5 w-2.5" />
            </span>
            Selected
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
              { id: 'free', label: 'Standard Free' },
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
            Showing {matchingAvailableCount} {seatFilter.replace('-', ' ')} seats
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Visual CSS Grid Fuselage Cabin Seating Chart */}
        <div className="lg:col-span-8 flex justify-center overflow-x-auto">
          <div className="w-full max-w-lg rounded-t-[84px] rounded-b-3xl border border-slate-300 bg-slate-50 px-5 pt-7 pb-6 dark:border-slate-700 dark:bg-slate-950/70">
            {/* Cockpit Nose Indicator */}
            <div className="mb-5 flex flex-col items-center">
              <div className="h-1.5 w-16 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="mt-2 font-mono text-[11px] font-semibold tracking-wider text-slate-500 dark:text-slate-400">
                FLIGHT DECK · {flight.flightNumber}
              </span>
            </div>

            {loading ? (
              <div className="py-16 text-center text-xs text-slate-500">Syncing live cabin seat grid…</div>
            ) : (
              <div className="space-y-4">
                {/* Section 1: 2-2 Business & First Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <span>First &amp; Business Cabin (2–2 Lie-Flat)</span>
                    <span className="font-mono tabular-nums">
                      {computeSeatFeeUsd(1, cabin) === 0
                        ? 'Included in Cabin'
                        : `+${formatMoney(convertFromUsd(computeSeatFeeUsd(1, cabin), currency), currency)}`}
                    </span>
                  </div>

                  {/* 2-2 CSS Grid Column Headers */}
                  <div className="grid grid-cols-[1.75rem_repeat(2,minmax(2.75rem,1fr))_2rem_repeat(2,minmax(2.75rem,1fr))] items-center gap-1.5 text-center font-mono text-[10px] font-semibold text-slate-400">
                    <span />
                    <span>A</span>
                    <span>C</span>
                    <span>AISLE</span>
                    <span>D</span>
                    <span>F</span>
                  </div>

                  {/* 2-2 CSS Grid Rows */}
                  <div className="space-y-1.5">
                    {businessRows.map((row) => (
                      <div
                        key={row.rowNumber}
                        className="grid grid-cols-[1.75rem_repeat(2,minmax(2.75rem,1fr))_2rem_repeat(2,minmax(2.75rem,1fr))] items-center gap-1.5"
                      >
                        <div className="font-mono text-[11px] font-semibold text-slate-400 text-right pr-1 tabular-nums">
                          {row.rowNumber}
                        </div>
                        {row.left.map(renderSeatButton)}
                        <div className="text-center font-mono text-[10px] text-slate-300 dark:text-slate-700" aria-hidden="true">
                          |
                        </div>
                        {row.right.map(renderSeatButton)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Galley & Lavatory Divider */}
                <div className="flex items-center gap-2 border-y border-dashed border-slate-300 py-2 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <span className="flex-1 text-center">Galley &amp; Lavatory Divider · Main Deck (3–3)</span>
                </div>

                {/* Section 2: 3-3 Premium Front & Main Economy Grid */}
                <div className="space-y-2">
                  {/* 3-3 CSS Grid Column Headers */}
                  <div className="grid grid-cols-[1.75rem_repeat(3,minmax(2.25rem,1fr))_2rem_repeat(3,minmax(2.25rem,1fr))] items-center gap-1.5 text-center font-mono text-[10px] font-semibold text-slate-400">
                    <span />
                    <span>A</span>
                    <span>B</span>
                    <span>C</span>
                    <span>AISLE</span>
                    <span>D</span>
                    <span>E</span>
                    <span>F</span>
                  </div>

                  <div className="space-y-1.5">
                    {economyRows.map((row) => (
                      <React.Fragment key={row.rowNumber}>
                        {row.isExit && (
                          <div className="my-2 flex items-center justify-between rounded-md border border-amber-300/70 bg-amber-50/70 px-2.5 py-1 font-mono text-[10px] font-semibold text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-300">
                            <span>← WING EXIT</span>
                            <span>EXTRA LEGROOM · {formatCompactFee(28)}</span>
                            <span>WING EXIT →</span>
                          </div>
                        )}
                        <div className="grid grid-cols-[1.75rem_repeat(3,minmax(2.25rem,1fr))_2rem_repeat(3,minmax(2.25rem,1fr))] items-center gap-1.5">
                          <div className="font-mono text-[11px] font-semibold text-slate-400 text-right pr-1 tabular-nums">
                            {row.rowNumber}
                          </div>
                          {row.left.map(renderSeatButton)}
                          <div className="text-center font-mono text-[10px] text-slate-300 dark:text-slate-700" aria-hidden="true">
                            |
                          </div>
                          {row.right.map(renderSeatButton)}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Selected Seat Summary Panel */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/60 overflow-hidden">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Booking Seat</span>
              {currentSeatObj && (
                <button
                  type="button"
                  onClick={() => onSelectSeat(null)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span>Deselect</span>
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              {currentSeatObj ? (
                <motion.div
                  key={`${currentSeatObj.id}-${currentSeatObj.feeDeltaUsd}`}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                  className="mt-2 space-y-3"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-3xl font-bold text-[#0F4C81] dark:text-blue-400 tabular-nums">
                      {currentSeatObj.id}
                    </span>
                    <span className="text-xs font-semibold capitalize text-slate-700 dark:text-slate-300">
                      {currentSeatObj.position} · {currentSeatObj.cabin}
                    </span>
                  </div>
                  <dl className="space-y-1.5 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Ticket Cabin</dt>
                      <dd className="font-medium capitalize text-slate-800 dark:text-slate-200">{cabin}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Legroom Pitch</dt>
                      <dd className="font-medium text-slate-800 dark:text-slate-200">
                        {currentSeatObj.extraLegroom ? '36 in (Extra)' : '31 in Standard'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Per-Seat Fee</dt>
                      <dd className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                        {currentSeatObj.feeDeltaUsd > 0 ? `+${formatMoney(perSeatFee, currency)}` : 'Included'}
                      </dd>
                    </div>
                    {passengersCount > 1 && currentSeatObj.feeDeltaUsd > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Seat Total ({passengersCount} pax)</dt>
                        <dd className="font-mono font-semibold text-[#0F4C81] dark:text-blue-400 tabular-nums">
                          +{formatMoney(seatFeeTotal, currency)}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 pt-1">
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    <span>Synced with selectedSeat state &amp; QR pass</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="no-seat"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className="mt-2 space-y-2"
                >
                  <div className="font-mono text-lg font-bold text-slate-700 dark:text-slate-300">
                    No Seat Assigned
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    Click any open seat in the cabin grid to reserve it, or continue with free auto-assignment at check-in ($0 fee).
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {onContinueToFareLab && (
              <button
                type="button"
                onClick={onContinueToFareLab}
                className="mt-4 flex w-full min-h-[42px] items-center justify-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B3A63] transition-colors"
              >
                <span>Configure Luggage &amp; Checkout</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-slate-200 p-3.5 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
            <Info className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" aria-hidden="true" />
            <span>
              Click a selected seat again to toggle it off. Front rows (4–5), Wing Exit row (9), and First/Business seats update your live fare automatically.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
