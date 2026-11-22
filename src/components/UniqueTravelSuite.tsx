'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  CalendarDays,
  Check,
  Clock,
  Copy,
  Leaf,
  Lock,
  Minus,
  Navigation,
  Plus,
  ShieldCheck,
  Split,
  Train,
  Trash2,
  Users,
} from 'lucide-react';
import { STATIONS } from '../data/stationsAndFlights';
import type {
  CabinClass,
  CurrencyCode,
  DoorToDoorTransferMode,
  FareLockRecord,
  FareSplitMode,
  FareSplitRecord,
  FlightOption,
  LuggageConfig,
  RoutingPreference,
  TripType,
} from '../types/travel';
import { convertFromUsd, formatDuration, formatMoney } from '../utils/formatters';

interface UniqueTravelSuiteProps {
  fromCode: string;
  toCode: string;
  travelDate: string;
  onSelectTravelDate: (nextDate: string) => void;
  tripType: TripType;
  routingType: RoutingPreference;
  onSelectRoutingType: (next: RoutingPreference) => void;
  cabin: CabinClass;
  currency: CurrencyCode;
  passengersCount: number;
  onPassengersChange: (count: number) => void;
  flights: FlightOption[];
  selectedFlight: FlightOption;
  selectedReturnFlight?: FlightOption | null;
  onSelectFlight: (flight: FlightOption) => void;
  luggage: LuggageConfig;
  selectedSeatId: string;
  seatFeeUsd: number;
  transferMode: DoorToDoorTransferMode;
  onTransferModeChange: (next: DoorToDoorTransferMode) => void;
  connectionShield: boolean;
  onConnectionShieldChange: (next: boolean) => void;
  activeFareLock: FareLockRecord | null;
  onFareLockChange: (lock: FareLockRecord | null) => void;
  simulatedOffline: boolean;
}

type SuiteMode = 'dates-lock' | 'door-to-door' | 'group-split';

const DAY_OFFSETS = [-3, -2, -1, 0, 1, 2, 3];
const DATE_FACTORS: Record<number, number> = {
  '-3': 1.07,
  '-2': 0.94,
  '-1': 1.02,
  '0': 1.0,
  '1': 0.89,
  '2': 0.96,
  '3': 1.11,
};

function addDaysIso(baseIso: string, deltaDays: number): { iso: string; dayLabel: string; weekday: string } {
  const parsed = new Date(`${baseIso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { iso: baseIso, dayLabel: baseIso, weekday: '' };
  }
  parsed.setUTCDate(parsed.getUTCDate() + deltaDays);
  const iso = parsed.toISOString().slice(0, 10);
  const weekday = parsed.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const dayLabel = parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return { iso, dayLabel, weekday };
}

export const UniqueTravelSuite: React.FC<UniqueTravelSuiteProps> = ({
  fromCode,
  toCode,
  travelDate,
  onSelectTravelDate,
  tripType,
  routingType,
  onSelectRoutingType,
  cabin,
  currency,
  passengersCount,
  onPassengersChange,
  flights,
  selectedFlight,
  selectedReturnFlight,
  onSelectFlight,
  luggage,
  selectedSeatId,
  seatFeeUsd,
  transferMode,
  onTransferModeChange,
  connectionShield,
  onConnectionShieldChange,
  activeFareLock,
  onFareLockChange,
  simulatedOffline,
}) => {
  const [suiteMode, setSuiteMode] = useState<SuiteMode>('dates-lock');
  const [locking, setLocking] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [anchorDate, setAnchorDate] = useState(travelDate);

  // Group Split-Pay state
  const [splitMode, setSplitMode] = useState<FareSplitMode>('equal');
  const [splitLoading, setSplitLoading] = useState(false);
  const [splitRecord, setSplitRecord] = useState<FareSplitRecord | null>(null);
  const [copiedCode, setCopiedCode] = useState<string>('');

  useEffect(() => {
    const diff = Math.abs(
      (new Date(`${travelDate}T12:00:00Z`).getTime() - new Date(`${anchorDate}T12:00:00Z`).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (Number.isNaN(diff) || diff > 3) {
      setAnchorDate(travelDate);
    }
  }, [travelDate, anchorDate]);

  const originStation = useMemo(() => STATIONS.find((s) => s.code === fromCode), [fromCode]);
  const destStation = useMemo(() => STATIONS.find((s) => s.code === toCode), [toCode]);

  const directOption = useMemo(
    () => flights.find((f) => f.stops === 0) || (selectedFlight.stops === 0 ? selectedFlight : undefined),
    [flights, selectedFlight]
  );

  const viaOption = useMemo(
    () => flights.find((f) => f.stops > 0) || (selectedFlight.stops > 0 ? selectedFlight : undefined),
    [flights, selectedFlight]
  );

  const cabinMult: Record<CabinClass, number> = { economy: 1, premium: 1.48, business: 2.65, first: 4.1 };
  const mult = cabinMult[cabin];
  const tripFactor = tripType === 'round-trip' ? 1.88 : 1;

  const baseForCalendarUsd = useMemo(() => {
    const refFlight =
      routingType === 'via' && viaOption
        ? viaOption
        : routingType === 'direct' && directOption
        ? directOption
        : selectedFlight;
    return refFlight.basePriceUsd * mult * tripFactor * passengersCount;
  }, [routingType, viaOption, directOption, selectedFlight, mult, tripFactor, passengersCount]);

  const calendarDays = useMemo(() => {
    const items = DAY_OFFSETS.map((offset) => {
      const { iso, dayLabel, weekday } = addDaysIso(anchorDate, offset);
      const factor = DATE_FACTORS[offset] ?? 1;
      const usdEstimate = Math.round(baseForCalendarUsd * factor);
      return {
        offset,
        iso,
        dayLabel,
        weekday,
        converted: convertFromUsd(usdEstimate, currency),
        usdEstimate,
      };
    });
    const minUsd = Math.min(...items.map((d) => d.usdEstimate));
    return items.map((d) => ({ ...d, isCheapest: d.usdEstimate === minUsd }));
  }, [anchorDate, baseForCalendarUsd, currency]);

  const transferFeeUsd = transferMode === 'city-cab' ? 28 : transferMode === 'express-rail' ? 6 : 0;
  const transferExtraMinutes = transferMode === 'city-cab' ? 35 : transferMode === 'express-rail' ? 22 : 0;
  const shieldFeeUsd = connectionShield ? 14 * passengersCount : 0;

  const currentTripAllInUsd = useMemo(() => {
    const isRoundTrip = tripType === 'round-trip';
    const retUsd = isRoundTrip
      ? (selectedReturnFlight?.basePriceUsd ?? Math.round(selectedFlight.basePriceUsd * 0.96)) * 0.92
      : 0;
    const subtotalFlightUsd = (selectedFlight.basePriceUsd + retUsd) * mult;
    const taxesUsd = subtotalFlightUsd * 0.14 + (isRoundTrip ? 46 : 28);
    const bagMult = isRoundTrip ? 1.85 : 1;
    const bagUsd =
      (cabin === 'business' || cabin === 'first' ? 0 : luggage.checkedBagsCount * 42) * bagMult +
      (luggage.priorityHandling ? 18 : 0) * bagMult;
    const seatTotalUsd = seatFeeUsd * passengersCount;
    const groundTransferUsd =
      transferMode === 'city-cab' ? 28 : transferMode === 'express-rail' ? 6 * passengersCount : 0;
    return (subtotalFlightUsd + taxesUsd + bagUsd) * passengersCount + seatTotalUsd + groundTransferUsd + shieldFeeUsd;
  }, [
    tripType,
    selectedFlight,
    selectedReturnFlight,
    mult,
    cabin,
    luggage,
    passengersCount,
    seatFeeUsd,
    transferMode,
    shieldFeeUsd,
  ]);

  const quotedHoldTotal = convertFromUsd(currentTripAllInUsd, currency);
  const depositPrice = convertFromUsd(9, currency);

  // Compute live client preview for Group Split before/after saving to backend
  const previewShares = useMemo(() => {
    const pax = Math.max(1, passengersCount);
    const total = quotedHoldTotal;
    const isJpy = currency === 'JPY';
    const roundCur = (v: number) => (isJpy ? Math.round(v) : Math.round(v * 100) / 100);
    const rowMatch = String(selectedSeatId || '7A').match(/^(\d+)([A-F])$/i);
    const baseRow = rowMatch ? Number(rowMatch[1]) : 7;
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const baseLetterIdx = rowMatch ? Math.max(0, letters.indexOf(rowMatch[2].toUpperCase())) : 0;

    const weights: number[] = [];
    for (let i = 0; i < pax; i++) {
      if (splitMode === 'equal') weights.push(1);
      else if (splitMode === 'seat-weighted') weights.push(i === 0 ? 1.12 : 0.95);
      else weights.push(i === 0 ? Math.max(1.5, pax * 0.72) : 0.52);
    }
    const sumW = weights.reduce((a, b) => a + b, 0) || 1;
    let running = 0;
    return weights.map((w, idx) => {
      const last = idx === pax - 1;
      const amount = last ? roundCur(Math.max(0, total - running)) : roundCur((total * w) / sumW);
      if (!last) running = roundCur(running + amount);
      const seatLabel = `${baseRow + Math.floor((baseLetterIdx + idx) / letters.length)}${
        letters[(baseLetterIdx + idx) % letters.length]
      }`;
      return {
        travelerIndex: idx + 1,
        label: idx === 0 ? 'Organizer (You)' : `Co-Traveler ${idx + 1}`,
        seatLabel,
        amount,
        shareCode: splitRecord?.shares[idx]?.shareCode || `PREVIEW-P${idx + 1}`,
      };
    });
  }, [passengersCount, quotedHoldTotal, currency, selectedSeatId, splitMode, splitRecord]);

  const handleFreezeFare = async () => {
    setLocking(true);
    setLockMessage('');
    const routeLabel = `${fromCode} ${tripType === 'round-trip' ? '⇄' : '→'} ${toCode}`;
    try {
      if (!simulatedOffline && typeof navigator !== 'undefined' && navigator.onLine !== false) {
        const res = await fetch('/api/fares/lock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            route: routeLabel,
            tripType,
            cabin,
            currency,
            lockedAmount: quotedHoldTotal,
            flightNumber: selectedFlight.flightNumber,
            returnFlightNumber: tripType === 'round-trip' ? selectedReturnFlight?.flightNumber : undefined,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          onFareLockChange(data.lock as FareLockRecord);
          setLockMessage(`48-hour rate freeze confirmed (${(data.lock as FareLockRecord).lockId}).`);
          return;
        }
      }
      const localLock: FareLockRecord = {
        lockId: `LCK-${Math.floor(100000 + Math.random() * 899999)}`,
        route: routeLabel,
        tripType,
        cabin,
        currency,
        lockedAmount: quotedHoldTotal,
        depositAmount: depositPrice,
        flightNumber: selectedFlight.flightNumber,
        returnFlightNumber: tripType === 'round-trip' ? selectedReturnFlight?.flightNumber : undefined,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        status: 'Active',
      };
      onFareLockChange(localLock);
      setLockMessage(`Offline hold cached (${localLock.lockId}).`);
    } finally {
      setLocking(false);
    }
  };

  const handleReleaseLock = async () => {
    if (!activeFareLock) return;
    if (!simulatedOffline && typeof navigator !== 'undefined' && navigator.onLine !== false) {
      await fetch(`/api/fares/lock/${encodeURIComponent(activeFareLock.lockId)}`, { method: 'DELETE' }).catch(() => {});
    }
    onFareLockChange(null);
    setLockMessage('');
  };

  const handleCreateSplitPlan = async () => {
    setSplitLoading(true);
    const routeLabel = `${fromCode} ${tripType === 'round-trip' ? '⇄' : '→'} ${toCode}`;
    try {
      if (!simulatedOffline && typeof navigator !== 'undefined' && navigator.onLine !== false) {
        const res = await fetch('/api/fares/split', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            route: routeLabel,
            currency,
            totalAmount: quotedHoldTotal,
            passengers: passengersCount,
            mode: splitMode,
            baseSeatId: selectedSeatId,
            extraPerTraveler: convertFromUsd(seatFeeUsd, currency),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setSplitRecord(data.split as FareSplitRecord);
          return;
        }
      }
      const fallbackId = `SPL-${Math.floor(100000 + Math.random() * 899999)}`;
      setSplitRecord({
        splitId: fallbackId,
        route: routeLabel,
        currency,
        totalAmount: quotedHoldTotal,
        passengers: passengersCount,
        mode: splitMode,
        shares: previewShares.map((s, idx) => ({ ...s, shareCode: `${fallbackId}-P${idx + 1}` })),
        shareUrlPath: `/?split=${fallbackId}`,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setSplitLoading(false);
    }
  };

  const handleCopyShareCode = (code: string, shareLabel: string, amount: number) => {
    const shareText = `AeroMesh Trip Split (${fromCode} → ${toCode}) · ${shareLabel}: ${formatMoney(
      amount,
      currency
    )} · Ref ${code}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(shareText).catch(() => {});
    }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode((curr) => (curr === code ? '' : curr)), 2200);
  };

  const directFareConverted = directOption
    ? convertFromUsd(directOption.basePriceUsd * mult * tripFactor * passengersCount, currency)
    : null;
  const viaFareConverted = viaOption
    ? convertFromUsd(viaOption.basePriceUsd * mult * tripFactor * passengersCount, currency)
    : null;
  const savingsDelta =
    directFareConverted !== null && viaFareConverted !== null
      ? Math.max(0, Math.round((directFareConverted - viaFareConverted) * 100) / 100)
      : 0;

  const layoverMinutes = selectedFlight.layoverMinutes || 75;
  const minTransferMinutes = 25;
  const layoverBuffer = layoverMinutes - minTransferMinutes;

  return (
    <section aria-labelledby="unique-travel-suite-heading" className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h2 id="unique-travel-suite-heading" className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Smart Travel Tools · Door-to-Door, Fare Lock &amp; Group Split
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Tools built to simplify booking: compare dates and stops, calculate true city-center arrival cost, freeze fares for 48h, or split totals with co-travelers.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Smart Travel Tools"
          className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
        >
          {(
            [
              { id: 'dates-lock', label: 'Dates & 48h Fare Lock' },
              { id: 'door-to-door', label: 'Door-to-Door & Shield' },
              { id: 'group-split', label: `Group Split-Pay (${passengersCount}x)` },
            ] as { id: SuiteMode; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={suiteMode === tab.id}
              type="button"
              onClick={() => setSuiteMode(tab.id)}
              className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                suiteMode === tab.id
                  ? 'bg-white text-[#0F4C81] shadow-sm dark:bg-slate-900 dark:text-blue-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {suiteMode === 'dates-lock' && (
        <div className="space-y-6">
          {/* 1. Flexible +/- 3 Day Date Price Strip */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <CalendarDays className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
                <span>Flexible Departure Date Matrix (±3 Days)</span>
              </div>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                Tap a day to update departure · Lowest day marked
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {calendarDays.map((day) => {
                const selected = day.iso === travelDate;
                return (
                  <button
                    key={day.iso}
                    type="button"
                    onClick={() => onSelectTravelDate(day.iso)}
                    className={`flex flex-col items-start justify-between rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                        : day.isCheapest
                        ? 'border-emerald-300 bg-emerald-50/70 text-slate-900 hover:border-emerald-500 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-white'
                        : 'border-slate-200 bg-slate-50/60 text-slate-900 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between text-[11px] font-medium">
                      <span className={selected ? 'text-sky-100' : 'text-slate-500 dark:text-slate-400'}>{day.weekday}</span>
                      {day.isCheapest && (
                        <span
                          className={`font-mono text-[10px] font-bold ${
                            selected ? 'text-emerald-200' : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          LOWEST
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs font-semibold truncate">{day.dayLabel}</div>
                    <div
                      className={`mt-2 font-mono text-sm font-bold tabular-nums ${
                        selected ? 'text-white' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {formatMoney(day.converted, currency)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Direct vs Via Tradeoff Matrix + 48h Fare Freeze */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <Split className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
                  <span>Direct vs. Via Connecting Fare Tradeoff</span>
                </div>
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                  {(['all', 'direct', 'via'] as RoutingPreference[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onSelectRoutingType(mode)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        routingType === mode
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      {mode === 'all' ? 'Compare All' : mode === 'direct' ? 'Direct Only' : 'Via Only'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="py-2 pr-3 font-medium">Routing Strategy</th>
                      <th className="py-2 px-3 font-medium">Stop / Connection</th>
                      <th className="py-2 px-3 font-medium text-right">Duration</th>
                      <th className="py-2 px-3 font-medium text-right">Est. Fare</th>
                      <th className="py-2 pl-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {directOption && (
                      <tr className={selectedFlight.id === directOption.id ? 'bg-sky-50/60 dark:bg-blue-950/20' : ''}>
                        <td className="py-3 pr-3 font-semibold text-slate-900 dark:text-white">
                          Direct Nonstop
                          <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                            {directOption.flightNumber} · {directOption.co2Kg} kg CO₂
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-700 dark:text-slate-300">Nonstop Express</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatDuration(directOption.durationMinutes)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                          {directFareConverted !== null ? formatMoney(directFareConverted, currency) : '—'}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectRoutingType('direct');
                              onSelectFlight(directOption);
                            }}
                            className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:border-[#0F4C81] hover:text-[#0F4C81] dark:border-slate-700 dark:text-slate-200 whitespace-nowrap"
                          >
                            {selectedFlight.id === directOption.id ? 'Selected' : 'Pick Direct'}
                          </button>
                        </td>
                      </tr>
                    )}

                    {viaOption && (
                      <tr className={selectedFlight.id === viaOption.id ? 'bg-sky-50/60 dark:bg-blue-950/20' : ''}>
                        <td className="py-3 pr-3 font-semibold text-slate-900 dark:text-white">
                          Via Hub Saver
                          <div className="text-[11px] font-normal text-emerald-700 dark:text-emerald-400">
                            {savingsDelta > 0 ? `Saves ${formatMoney(savingsDelta, currency)}` : 'Lower connecting fare'} · {viaOption.co2Kg} kg CO₂
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-700 dark:text-slate-300">
                          1 stop via {viaOption.viaCity || viaOption.viaAirport} ({viaOption.viaAirport}) · {viaOption.layoverMinutes || 75}m layover
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatDuration(viaOption.durationMinutes)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {viaFareConverted !== null ? formatMoney(viaFareConverted, currency) : '—'}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectRoutingType('via');
                              onSelectFlight(viaOption);
                            }}
                            className="rounded-md border border-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-950/40 whitespace-nowrap"
                          >
                            {selectedFlight.id === viaOption.id ? 'Selected' : 'Pick Via'}
                          </button>
                        </td>
                      </tr>
                    )}

                    <tr>
                      <td className="py-3 pr-3 font-semibold text-slate-900 dark:text-white">
                        Air + Express Rail Hybrid
                        <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Leaf className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                          <span>-18% door-to-door CO₂ footprint</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          <Train className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          {destStation?.transitLink || 'Express City Rail Pass'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatDuration((directOption?.durationMinutes || selectedFlight.durationMinutes) + 22)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(
                          (directFareConverted ?? quotedHoldTotal) + convertFromUsd(6 * passengersCount, currency),
                          currency
                        )}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            onTransferModeChange('express-rail');
                            setSuiteMode('door-to-door');
                          }}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:border-[#0F4C81] hover:text-[#0F4C81] dark:border-slate-700 dark:text-slate-200 whitespace-nowrap"
                        >
                          Include Rail
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: 48-Hour Fare Freeze & Drop-Shield Guarantee */}
            <motion.div
              layout
              className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <Lock className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
                    <span>48-Hour Fare Freeze &amp; Drop Shield</span>
                  </div>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    Hold fee: {formatMoney(depositPrice, currency)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Lock {selectedFlight.flightNumber} ({selectedFlight.stops === 0 ? 'Direct' : `Via ${selectedFlight.viaAirport}`}) now for 48 hours. If the fare rises, your locked rate holds; if it drops, the lower rate applies automatically.
                </p>
              </div>

              {activeFareLock && activeFareLock.status === 'Active' ? (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      <span>Active Hold · {activeFareLock.lockId}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      48h protected
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-700 dark:text-slate-300">
                      {activeFareLock.route} · {activeFareLock.flightNumber}
                    </span>
                    <span className="font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatMoney(activeFareLock.lockedAmount, activeFareLock.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Automatically applied to checkout
                    </span>
                    <button
                      type="button"
                      onClick={handleReleaseLock}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                      Release
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/60 space-y-3">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Protected All-In Quote</div>
                      <div className="font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(quotedHoldTotal, currency)}
                      </div>
                    </div>
                    <ShieldCheck className="h-5 w-5 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
                  </div>

                  <button
                    type="button"
                    disabled={locking}
                    onClick={handleFreezeFare}
                    className="flex w-full min-h-[42px] items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 whitespace-nowrap"
                  >
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{locking ? 'Freezing Fare…' : `Freeze This Fare for 48 Hours (${formatMoney(depositPrice, currency)})`}</span>
                  </button>
                </div>
              )}

              {lockMessage && (
                <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{lockMessage}</div>
              )}
            </motion.div>
          </div>
        </div>
      )}

      {suiteMode === 'door-to-door' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
          {/* Door-to-Door True Arrival Total Estimator */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Navigation className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
                <span>Door-to-Door True Arrival Estimator ({fromCode} → {toCode} City Center)</span>
              </div>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                No hidden bag, seat, or airport-cab surprises
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="group" aria-label="Arrival transit option">
              {(
                [
                  {
                    id: 'airport-only',
                    title: 'Terminal Only',
                    sub: 'Exit at arrival gate',
                    addUsd: 0,
                    addMin: 0,
                  },
                  {
                    id: 'express-rail',
                    title: 'Express Rail / Metro',
                    sub: destStation?.transitLink || 'City Metro Link',
                    addUsd: 6 * passengersCount,
                    addMin: 22,
                  },
                  {
                    id: 'city-cab',
                    title: 'Private City Transfer',
                    sub: 'Curbside pickup to address',
                    addUsd: 28,
                    addMin: 35,
                  },
                ] as { id: DoorToDoorTransferMode; title: string; sub: string; addUsd: number; addMin: number }[]
              ).map((opt) => {
                const active = transferMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onTransferModeChange(opt.id)}
                    className={`flex flex-col justify-between rounded-lg border p-3.5 text-left transition-colors ${
                      active
                        ? 'border-[#0F4C81] bg-[#0F4C81]/5 dark:border-blue-400 dark:bg-blue-950/30'
                        : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/50'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{opt.title}</div>
                      <div className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{opt.sub}</div>
                    </div>
                    <div className="mt-3 flex items-center justify-between font-mono text-xs font-semibold tabular-nums">
                      <span className="text-[#0F4C81] dark:text-blue-400">
                        {opt.addUsd === 0 ? 'Included' : `+${formatMoney(convertFromUsd(opt.addUsd, currency), currency)}`}
                      </span>
                      <span className="text-slate-500">+{opt.addMin}m</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4 dark:border-slate-800">
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Origin Rail Link</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {originStation?.transitLink || `${fromCode} Express`}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Doorstep Duration</div>
                <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatDuration(selectedFlight.durationMinutes + transferExtraMinutes)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Transfer &amp; Seat</div>
                <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatMoney(convertFromUsd(transferFeeUsd + seatFeeUsd * passengersCount, currency), currency)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">True Door-to-Door Total</div>
                <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-[#0F4C81] dark:text-blue-400">
                  {formatMoney(quotedHoldTotal, currency)}
                </div>
              </div>
            </div>
          </div>

          {/* Connection Buffer & Disruption Auto-Rebook Shield */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <ShieldCheck className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
                  <span>Connection Safety &amp; Auto-Rebook Shield</span>
                </div>
                <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                  {selectedFlight.stops === 0 ? 'Direct Nonstop' : `${layoverMinutes}m layover`}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {selectedFlight.stops > 0
                  ? `Transferring at ${selectedFlight.viaCity || selectedFlight.viaAirport} (${selectedFlight.viaAirport}) gives a ${layoverMinutes}m window (${minTransferMinutes}m gate-to-gate minimum · +${Math.max(0, layoverBuffer)}m safety buffer).`
                  : `${selectedFlight.flightNumber} flies nonstop from ${fromCode} ${selectedFlight.terminal} to ${toCode} Gate ${selectedFlight.gate}, avoiding hub transfer delays completely.`}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Disruption Auto-Rebook Shield
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Instant next-flight rebooking + lounge voucher if inbound delays
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onConnectionShieldChange(!connectionShield)}
                  className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    connectionShield
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'border border-slate-300 bg-white text-slate-800 hover:border-[#0F4C81] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                >
                  {connectionShield
                    ? 'Protected (Added)'
                    : `Add Shield (+${formatMoney(convertFromUsd(14 * passengersCount, currency), currency)})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {suiteMode === 'group-split' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Users className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
              <span>Group Fare Split-Pay &amp; Co-Traveler Settlement</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Quick Traveler Count Sync */}
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1 dark:border-slate-700">
                <span className="text-xs text-slate-600 dark:text-slate-300">Travelers</span>
                <button
                  type="button"
                  aria-label="Decrease group travelers"
                  onClick={() => onPassengersChange(Math.max(1, passengersCount - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-5 text-center font-mono text-xs font-bold tabular-nums">{passengersCount}</span>
                <button
                  type="button"
                  aria-label="Increase group travelers"
                  onClick={() => onPassengersChange(Math.min(6, passengersCount + 1))}
                  className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              <div role="group" aria-label="Split calculation rule" className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                {(
                  [
                    { id: 'equal', label: 'Equal Split' },
                    { id: 'seat-weighted', label: 'Seat-Weighted' },
                    { id: 'organizer-base', label: 'Organizer Base' },
                  ] as { id: FareSplitMode; label: string }[]
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      setSplitMode(mode.id);
                      setSplitRecord(null);
                    }}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      splitMode === mode.id
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
            <div className="lg:col-span-8 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 pr-3 font-medium">Traveler</th>
                    <th className="py-2 px-3 font-medium">Seat</th>
                    <th className="py-2 px-3 font-medium text-right">Share Amount</th>
                    <th className="py-2 pl-3 font-medium text-right">Split Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {previewShares.map((share) => {
                    const copied = copiedCode === share.shareCode;
                    return (
                      <tr key={share.travelerIndex}>
                        <td className="py-2.5 pr-3 font-semibold text-slate-900 dark:text-white">
                          {share.label}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                          {share.seatLabel}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                          {formatMoney(share.amount, currency)}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleCopyShareCode(share.shareCode, share.label, share.amount)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#0F4C81] hover:text-[#0F4C81] dark:border-slate-700 dark:text-slate-300 whitespace-nowrap"
                          >
                            {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                            <span>{copied ? 'Copied' : 'Copy Share'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="lg:col-span-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">Group Total ({passengersCount} pax)</span>
                <span className="font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatMoney(quotedHoldTotal, currency)}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                Generate individual payment links so co-travelers settle their seat &amp; baggage share directly instead of paying everything on one card.
              </p>
              <button
                type="button"
                disabled={splitLoading}
                onClick={handleCreateSplitPlan}
                className="flex w-full min-h-[40px] items-center justify-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B3A63] disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{splitLoading ? 'Generating Links…' : 'Generate Shareable Split Links'}</span>
              </button>
              {splitRecord && (
                <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400 font-mono">
                  Split Plan Active · {splitRecord.splitId}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
