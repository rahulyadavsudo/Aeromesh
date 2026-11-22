'use client';

import React, { useState } from 'react';
import { Car, Check, LogIn, LogOut, Plus, QrCode, User } from 'lucide-react';
import type { AuthUser, BookingRecord, PassengerProfile } from '../types/travel';
import type { TranslationSet } from '../data/i18n';
import { formatMoney } from '../utils/formatters';

interface ProfileAndTripsProps {
  authUser: AuthUser | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
  passengers: PassengerProfile[];
  onSavePassenger: (profile: Partial<PassengerProfile>) => Promise<void>;
  bookings: BookingRecord[];
  onOpenBoardingPass: (pnr: string) => void;
  t: TranslationSet;
}

export const ProfileAndTrips: React.FC<ProfileAndTripsProps> = ({
  authUser,
  onOpenAuth,
  onSignOut,
  passengers,
  onSavePassenger,
  bookings,
  onOpenBoardingPass,
  t,
}) => {
  const primary = passengers[0];
  const [showAddForm, setShowAddForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [seatPreference, setSeatPreference] = useState<'Window' | 'Aisle' | 'Extra Legroom'>('Window');
  const [savedNotice, setSavedNotice] = useState(false);

  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) {
      onOpenAuth();
      return;
    }
    if (!fullName.trim() || !email.trim()) return;
    await onSavePassenger({
      fullName,
      email,
      passportNumber: passportNumber || 'P9012441',
      seatPreference,
    });
    setFullName('');
    setEmail('');
    setPassportNumber('');
    setShowAddForm(false);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <section aria-labelledby="profile-heading" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <h2 id="profile-heading" className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t.profileTitle}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {authUser
              ? `Signed in as ${authUser.fullName} (${authUser.email}) · ${authUser.tier} Member`
              : 'Sign in to manage saved traveler records and reserve seats.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {authUser ? (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B3A63]"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>Sign In / Sign Up</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!authUser) onOpenAuth();
              else setShowAddForm((v) => !v);
            }}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add Auto-Fill Traveler</span>
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
          <Check className="h-4 w-4" />
          <span>Traveler profile synced to passenger-profile-svc for instant checkout auto-fill.</span>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAddProfile} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">New Saved Traveler Record</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input
              type="text"
              required
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <input
              type="email"
              required
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <input
              type="text"
              placeholder="Passport Number"
              value={passportNumber}
              onChange={(e) => setPassportNumber(e.target.value)}
              className="min-h-[42px] rounded-lg border border-slate-300 px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <select
              value={seatPreference}
              onChange={(e) => setSeatPreference(e.target.value as 'Window' | 'Aisle' | 'Extra Legroom')}
              className="min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="Window">Window Seat</option>
              <option value="Aisle">Aisle Seat</option>
              <option value="Extra Legroom">Extra Legroom</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="min-h-[40px] rounded-lg px-4 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[40px] rounded-lg bg-[#0F4C81] px-4 text-xs font-semibold text-white hover:bg-[#0B3A63]"
            >
              Save Traveler
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Primary Traveler Card + Saved Profiles */}
        <div className="lg:col-span-4 space-y-4">
          {primary && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3.5">
                <img
                  src="/images/traveler_avatar_profile_1795322418248.jpg"
                  alt={primary.fullName}
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                />
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{primary.fullName}</h3>
                  <div className="font-mono text-xs text-[#0F4C81] dark:text-blue-400">
                    {primary.tier} · {primary.frequentFlyerId}
                  </div>
                </div>
              </div>

              <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs dark:border-slate-800">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Passport</dt>
                  <dd className="font-mono font-semibold text-slate-900 dark:text-white">{primary.passportNumber}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Preferences</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-200">
                    {primary.seatPreference} · {primary.mealPreference}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Primary Card</dt>
                  <dd className="font-mono text-slate-800 dark:text-slate-200">
                    {primary.savedCards[0]?.brand} •••• {primary.savedCards[0]?.last4}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white mb-3">
              Auto-Fill Companion Roster ({passengers.length})
            </h4>
            <div className="space-y-2.5">
              {passengers.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs border-b border-slate-100 pb-2 last:border-none last:pb-0 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{p.fullName}</div>
                      <div className="font-mono text-[11px] text-slate-500 truncate">{p.passportNumber} · {p.seatPreference}</div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-[#0F4C81] dark:text-blue-400 shrink-0">{p.tier}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Ride & Flight History Tracking */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Flight &amp; Terminal Ride History ({bookings.length})
            </h3>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {bookings.map((b) => (
              <div key={b.pnr} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-[#0F4C81] dark:text-blue-400">{b.pnr}</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {b.flight.from} → {b.flight.to}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono text-slate-500">{b.travelDate}</span>
                    <span className="text-slate-400">·</span>
                    <span
                      className={`font-semibold ${
                        b.flight.status === 'Delayed' || b.flight.status === 'Gate Changed'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {b.flight.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {b.flight.airline} {b.flight.flightNumber} · Seat {b.passenger.seat} · {b.luggage.checkedBagsCount} checked bag(s) · Paid{' '}
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {formatMoney(b.payment.amountPaid, b.payment.currency)}
                    </span>
                  </div>
                  {b.rideTransfer && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Car className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        Linked Transfer: {b.rideTransfer.provider} ({b.rideTransfer.vehicleCode}) at {b.rideTransfer.pickupPoint}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onOpenBoardingPass(b.pnr)}
                  className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Open QR Pass</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
