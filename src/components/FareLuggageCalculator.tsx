import React, { useEffect, useState } from 'react';
import { Briefcase, Luggage, Minus, Plus, ShieldCheck, ArrowRight } from 'lucide-react';
import type {
  AircraftSeat,
  CabinClass,
  CurrencyCode,
  FareBreakdown,
  FareLockRecord,
  FlightOption,
  LuggageConfig,
  TripType,
} from '../types/travel';
import type { TranslationSet } from '../data/i18n';
import { convertFromUsd, formatMoney } from '../utils/formatters';
import { SeatSelection } from './SeatSelection';

interface FareLuggageCalculatorProps {
  selectedFlight: FlightOption;
  returnFlight?: FlightOption | null;
  tripType: TripType;
  onTripTypeChange: (next: TripType) => void;
  travelDate: string;
  returnDate?: string;
  currency: CurrencyCode;
  cabin: CabinClass;
  onCabinChange: (cabin: CabinClass) => void;
  luggage: LuggageConfig;
  onLuggageChange: (next: LuggageConfig) => void;
  selectedSeat: AircraftSeat | null;
  onSelectSeat: (seat: AircraftSeat | null) => void;
  passengersCount: number;
  onPassengersChange: (count: number) => void;
  lowBandwidth: boolean;
  simulatedOffline: boolean;
  isAuthenticated: boolean;
  activeFareLock?: FareLockRecord | null;
  t: TranslationSet;
  onProceedToCheckout: (fare: FareBreakdown) => void;
}

export const FareLuggageCalculator: React.FC<FareLuggageCalculatorProps> = ({
  selectedFlight,
  returnFlight,
  tripType,
  onTripTypeChange,
  travelDate,
  returnDate,
  currency,
  cabin,
  onCabinChange,
  luggage,
  onLuggageChange,
  selectedSeat,
  onSelectSeat,
  passengersCount,
  onPassengersChange,
  lowBandwidth,
  simulatedOffline,
  isAuthenticated,
  activeFareLock,
  t,
  onProceedToCheckout,
}) => {
  const [fare, setFare] = useState<FareBreakdown | null>(null);
  const [loading, setLoading] = useState(false);

  const returnBaseUsd = returnFlight?.basePriceUsd ?? Math.round(selectedFlight.basePriceUsd * 0.96);

  const computeLocalFallback = (): FareBreakdown => {
    const mult: Record<CabinClass, number> = { economy: 1, premium: 1.48, business: 2.65, first: 4.1 };
    const isRoundTrip = tripType === 'round-trip';
    const base = selectedFlight.basePriceUsd;
    const retRaw = isRoundTrip ? returnBaseUsd : 0;
    const rtDiscount = isRoundTrip ? Math.round(retRaw * 0.08 * 100) / 100 : 0;
    const combinedBase = base + retRaw - rtDiscount;
    const upgrade = combinedBase * mult[cabin] - combinedBase;
    const taxes = (combinedBase + upgrade) * 0.14 + (isRoundTrip ? 46 : 28);
    const legBagMult = isRoundTrip ? 1.85 : 1;
    const carryOnFee = (luggage.carryOnCount > 1 ? (luggage.carryOnCount - 1) * 24 : 0) * legBagMult;
    const checkedFee = luggage.checkedBagsCount * (cabin === 'business' || cabin === 'first' ? 0 : 42) * legBagMult;
    const weightFee =
      (luggage.checkedBagsCount > 0 && luggage.bagWeightKg > 23
        ? luggage.checkedBagsCount * 35
        : luggage.checkedBagsCount > 0 && luggage.bagWeightKg <= 15
        ? -luggage.checkedBagsCount * 8
        : 0) * legBagMult;
    const prio = ((luggage.priorityHandling ? 18 : 0) + (luggage.sportsEquipment ? 55 : 0)) * legBagMult;

    const noLuggage = convertFromUsd((combinedBase + upgrade + taxes) * passengersCount, currency);
    const withLuggage = convertFromUsd(
      (combinedBase + upgrade + taxes + carryOnFee + checkedFee + weightFee + prio) * passengersCount,
      currency
    );

    return {
      currency,
      fxRate: 1,
      tripType,
      baseFare: convertFromUsd(base * passengersCount, currency),
      returnBaseFare: isRoundTrip ? convertFromUsd(retRaw * passengersCount, currency) : 0,
      roundTripDiscount: isRoundTrip ? convertFromUsd(rtDiscount * passengersCount, currency) : 0,
      cabinUpgrade: convertFromUsd(upgrade * passengersCount, currency),
      taxesAndFees: convertFromUsd(taxes * passengersCount, currency),
      carryOnFee: convertFromUsd(carryOnFee * passengersCount, currency),
      checkedLuggageFee: convertFromUsd(checkedFee * passengersCount, currency),
      weightSurcharge: convertFromUsd(weightFee * passengersCount, currency),
      priorityFee: convertFromUsd(prio * passengersCount, currency),
      totalWithoutLuggage: noLuggage,
      totalWithLuggage: withLuggage,
      luggageDelta: Math.round((withLuggage - noLuggage) * 100) / 100,
      perPassengerTotal: convertFromUsd(combinedBase + upgrade + taxes + carryOnFee + checkedFee + weightFee + prio, currency),
      passengers: passengersCount,
      payloadBytesSavedInLowBandwidth: lowBandwidth ? 1480 : 0,
    };
  };

  useEffect(() => {
    let active = true;
    const calc = async () => {
      if (simulatedOffline || !navigator.onLine) {
        setFare(computeLocalFallback());
        return;
      }
      setLoading(true);
      try {
        const res = await fetch('/api/fares/calculate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(lowBandwidth ? { 'x-bandwidth-mode': 'low' } : {}),
          },
          body: JSON.stringify({
            basePriceUsd: selectedFlight.basePriceUsd,
            returnBasePriceUsd: returnBaseUsd,
            tripType,
            cabin,
            luggage,
            currency,
            passengers: passengersCount,
          }),
        });
        if (res.ok && active) {
          const data = (await res.json()) as FareBreakdown;
          setFare(data);
        } else if (active) {
          setFare(computeLocalFallback());
        }
      } catch {
        if (active) setFare(computeLocalFallback());
      } finally {
        if (active) setLoading(false);
      }
    };
    calc();
    return () => {
      active = false;
    };
  }, [
    selectedFlight.id,
    selectedFlight.basePriceUsd,
    returnBaseUsd,
    tripType,
    cabin,
    luggage,
    currency,
    passengersCount,
    lowBandwidth,
    simulatedOffline,
  ]);

  const activeFare = fare || computeLocalFallback();

  return (
    <section aria-labelledby="fare-lab-heading" className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <h2 id="fare-lab-heading" className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t.fareLabTitle}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {t.fareLabSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="group" aria-label="Trip Type in Fare Lab">
            <button
              type="button"
              onClick={() => onTripTypeChange('one-way')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                tripType === 'one-way'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              One-Way
            </button>
            <button
              type="button"
              onClick={() => onTripTypeChange('round-trip')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                tripType === 'round-trip'
                  ? 'bg-white text-[#0F4C81] shadow-sm dark:bg-slate-900 dark:text-blue-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              Round-Trip (-8%)
            </button>
          </div>
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {selectedFlight.flightNumber} · {selectedFlight.from} {tripType === 'round-trip' ? '⇄' : '→'} {selectedFlight.to}
            {selectedFlight.stops > 0 ? ` (via ${selectedFlight.viaAirport})` : ' (Direct)'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Configuration Controls */}
        <div className="lg:col-span-7 space-y-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          {/* Cabin & Passengers */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                {t.cabinLabel}
              </span>
              <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                {(['economy', 'premium', 'business', 'first'] as CabinClass[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onCabinChange(c)}
                    className={`min-h-[40px] rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                      cabin === c
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Passengers
              </span>
              <div className="flex min-h-[44px] items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Travelers
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Decrease passengers"
                    onClick={() => onPassengersChange(Math.max(1, passengersCount - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center font-mono text-sm font-semibold tabular-nums">
                    {passengersCount}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase passengers"
                    onClick={() => onPassengersChange(Math.min(6, passengersCount + 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-4">
            {/* Carry-On & Checked Baggage Steppers */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <Briefcase className="h-5 w-5 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{t.carryOnBags}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">1st cabin bag included</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Decrease carry-on"
                    onClick={() => onLuggageChange({ ...luggage, carryOnCount: Math.max(0, luggage.carryOnCount - 1) })}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center font-mono text-sm font-semibold tabular-nums">{luggage.carryOnCount}</span>
                  <button
                    type="button"
                    aria-label="Increase carry-on"
                    onClick={() => onLuggageChange({ ...luggage, carryOnCount: Math.min(2, luggage.carryOnCount + 1) })}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <Luggage className="h-5 w-5 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{t.checkedBags}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {luggage.checkedBagsCount === 0 ? 'Light fare (0 bags)' : `${luggage.bagWeightKg} kg per bag`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Decrease checked bags"
                    onClick={() => onLuggageChange({ ...luggage, checkedBagsCount: Math.max(0, luggage.checkedBagsCount - 1) })}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center font-mono text-sm font-semibold tabular-nums">{luggage.checkedBagsCount}</span>
                  <button
                    type="button"
                    aria-label="Increase checked bags"
                    onClick={() => onLuggageChange({ ...luggage, checkedBagsCount: Math.min(4, luggage.checkedBagsCount + 1) })}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Weight Tier Selector */}
            <div>
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                {t.bagWeight}
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { kg: 15, label: '15 kg Light (-$8)' },
                  { kg: 23, label: '23 kg Standard' },
                  { kg: 32, label: '32 kg Heavy (+$35)' },
                ].map((tier) => (
                  <button
                    key={tier.kg}
                    type="button"
                    disabled={luggage.checkedBagsCount === 0}
                    onClick={() => onLuggageChange({ ...luggage, bagWeightKg: tier.kg })}
                    className={`min-h-[42px] rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-45 ${
                      luggage.bagWeightKg === tier.kg
                        ? 'border-[#0F4C81] bg-[#0F4C81]/5 text-[#0F4C81] dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Add-ons */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
              <label className="flex min-h-[44px] cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm dark:border-slate-800">
                <span className="font-medium text-slate-800 dark:text-slate-200">{t.priorityHandling}</span>
                <input
                  type="checkbox"
                  checked={luggage.priorityHandling}
                  onChange={(e) => onLuggageChange({ ...luggage, priorityHandling: e.target.checked })}
                  className="h-4 w-4 accent-[#0F4C81]"
                />
              </label>

              <label className="flex min-h-[44px] cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm dark:border-slate-800">
                <span className="font-medium text-slate-800 dark:text-slate-200">Sports / Oversize Gear</span>
                <input
                  type="checkbox"
                  checked={luggage.sportsEquipment}
                  onChange={(e) => onLuggageChange({ ...luggage, sportsEquipment: e.target.checked })}
                  className="h-4 w-4 accent-[#0F4C81]"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Right Side-by-Side Comparison: Without Luggage vs With Luggage */}
        <div className="lg:col-span-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onLuggageChange({ ...luggage, checkedBagsCount: 0, priorityHandling: false, sportsEquipment: false })}
              className={`rounded-xl border p-4 text-left transition-colors ${
                luggage.checkedBagsCount === 0 && !luggage.priorityHandling && !luggage.sportsEquipment
                  ? 'border-[#0F4C81] bg-[#0F4C81]/5 dark:border-blue-400 dark:bg-blue-950/30'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.withoutLuggage}</div>
              <div className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
                {formatMoney(activeFare.totalWithoutLuggage, activeFare.currency)}
              </div>
              <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">Carry-on only · Zero bag fees</div>
            </button>

            <button
              type="button"
              onClick={() =>
                onLuggageChange({
                  ...luggage,
                  checkedBagsCount: Math.max(1, luggage.checkedBagsCount),
                })
              }
              className={`rounded-xl border p-4 text-left transition-colors ${
                luggage.checkedBagsCount > 0 || luggage.priorityHandling || luggage.sportsEquipment
                  ? 'border-[#0F4C81] bg-[#0F4C81]/5 dark:border-blue-400 dark:bg-blue-950/30'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.withLuggage}</div>
              <div className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
                {formatMoney(activeFare.totalWithLuggage, activeFare.currency)}
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                +{formatMoney(activeFare.luggageDelta, activeFare.currency)} baggage delta
              </div>
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Itemized Quote Breakdown</h3>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {loading ? 'Updating…' : activeFare.currency}
              </span>
            </div>

            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600 dark:text-slate-400">
                  Outbound ({selectedFlight.stops === 0 ? 'Direct' : `Via ${selectedFlight.viaAirport}`} · {passengersCount}x)
                </dt>
                <dd className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                  {formatMoney(activeFare.baseFare, activeFare.currency)}
                </dd>
              </div>
              {tripType === 'round-trip' && (activeFare.returnBaseFare ?? 0) > 0 && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-slate-600 dark:text-slate-400">
                      Return ({returnFlight ? returnFlight.flightNumber : `${selectedFlight.to} → ${selectedFlight.from}`} · {returnDate || 'Return'})
                    </dt>
                    <dd className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {formatMoney(activeFare.returnBaseFare || 0, activeFare.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-emerald-700 dark:text-emerald-400">Round-Trip Bundle Savings (-8%)</dt>
                    <dd className="font-mono font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                      -{formatMoney(activeFare.roundTripDiscount || 0, activeFare.currency)}
                    </dd>
                  </div>
                </>
              )}
              {activeFare.cabinUpgrade > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-600 dark:text-slate-400 capitalize">{cabin} Cabin Upgrade</dt>
                  <dd className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                    {formatMoney(activeFare.cabinUpgrade, activeFare.currency)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-600 dark:text-slate-400">Airport Taxes &amp; Transit Levy</dt>
                <dd className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                  {formatMoney(activeFare.taxesAndFees, activeFare.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600 dark:text-slate-400">
                  Checked Baggage ({luggage.checkedBagsCount} × {luggage.bagWeightKg} kg{tripType === 'round-trip' ? ' · RT bundle' : ''})
                </dt>
                <dd className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                  {formatMoney(activeFare.checkedLuggageFee + activeFare.weightSurcharge, activeFare.currency)}
                </dd>
              </div>
              {(activeFare.carryOnFee > 0 || activeFare.priorityFee > 0) && (
                <div className="flex justify-between">
                  <dt className="text-slate-600 dark:text-slate-400">Extra Carry-On &amp; Priority</dt>
                  <dd className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                    {formatMoney(activeFare.carryOnFee + activeFare.priorityFee, activeFare.currency)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-600 dark:text-slate-400">
                  Cabin Seat ({selectedSeat ? `${selectedSeat.id} · ${selectedSeat.position}` : 'Auto-assigned'})
                </dt>
                <dd className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                  {selectedSeat && selectedSeat.feeDeltaUsd > 0
                    ? formatMoney(convertFromUsd(selectedSeat.feeDeltaUsd * passengersCount, activeFare.currency), activeFare.currency)
                    : 'Included'}
                </dd>
              </div>
              {activeFareLock && activeFareLock.status === 'Active' && (
                <div className="flex justify-between text-xs">
                  <dt className="text-emerald-700 dark:text-emerald-400">48h Fare Lock Protected</dt>
                  <dd className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                    {activeFareLock.lockId}
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold dark:border-slate-800">
                <dt className="text-slate-900 dark:text-white">Total Payable</dt>
                <dd className="font-mono text-[#0F4C81] tabular-nums dark:text-blue-400">
                  {formatMoney(
                    activeFare.totalWithLuggage +
                      (selectedSeat && selectedSeat.feeDeltaUsd > 0
                        ? convertFromUsd(selectedSeat.feeDeltaUsd * passengersCount, activeFare.currency)
                        : 0),
                    activeFare.currency
                  )}
                </dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => onProceedToCheckout(activeFare)}
              className="mt-5 flex w-full min-h-[48px] items-center justify-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0B3A63] transition-colors"
            >
              <span>{isAuthenticated ? 'Proceed to Multi-Currency Checkout' : 'Sign In & Proceed to Checkout'}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>
                {isAuthenticated
                  ? 'Price locked for 15 min · Instant QR boarding pass on confirmation'
                  : 'Account login required to confirm booking and issue signed QR ticket'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Aircraft Seat Selection */}
      <SeatSelection
        flight={selectedFlight}
        travelDate={travelDate}
        cabin={cabin}
        currency={currency}
        passengersCount={passengersCount}
        selectedSeat={selectedSeat}
        onSelectSeat={onSelectSeat}
        simulatedOffline={simulatedOffline}
      />
    </section>
  );
};
