import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, CreditCard, Lock, Sparkles, UserCheck, X } from 'lucide-react';
import { CURRENCY_RATES } from '../data/stationsAndFlights';
import type { TranslationSet } from '../data/i18n';
import type {
  AuthUser,
  BookingRecord,
  CabinClass,
  CurrencyCode,
  FareBreakdown,
  FlightOption,
  LuggageConfig,
  PassengerProfile,
  TripType,
} from '../types/travel';
import { formatMoney } from '../utils/formatters';

interface CheckoutDrawerProps {
  open: boolean;
  onClose: () => void;
  flight: FlightOption;
  returnFlight?: FlightOption | null;
  tripType: TripType;
  travelDate: string;
  returnDate?: string;
  cabin: CabinClass;
  luggage: LuggageConfig;
  selectedSeat: string;
  passengersCount: number;
  fare: FareBreakdown;
  fareLockId?: string;
  currency: CurrencyCode;
  onCurrencyChange: (next: CurrencyCode) => void;
  savedPassengers: PassengerProfile[];
  authUser: AuthUser | null;
  authToken: string | null;
  t: TranslationSet;
  onBookingComplete: (booking: BookingRecord) => void;
}

export const CheckoutDrawer: React.FC<CheckoutDrawerProps> = ({
  open,
  onClose,
  flight,
  returnFlight,
  tripType,
  travelDate,
  returnDate,
  cabin,
  luggage,
  selectedSeat,
  passengersCount,
  fare,
  fareLockId,
  currency,
  onCurrencyChange,
  savedPassengers,
  authUser,
  authToken,
  t,
  onBookingComplete,
}) => {
  const [fullName, setFullName] = useState(authUser?.fullName || '');
  const [email, setEmail] = useState(authUser?.email || '');
  const [passportNumber, setPassportNumber] = useState('');
  const [frequentFlyerId, setFrequentFlyerId] = useState('');
  const [seatPreference, setSeatPreference] = useState<'Window' | 'Aisle' | 'Extra Legroom'>('Window');
  const [mealPreference, setMealPreference] = useState('Standard');

  const [paymentMethod, setPaymentMethod] = useState<'saved-card' | 'new-card' | 'instant-fx'>('saved-card');
  const [selectedCardId, setSelectedCardId] = useState(savedPassengers[0]?.savedCards[0]?.id || 'card-1');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('09/28');
  const [cardCvv, setCardCvv] = useState('842');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authUser) {
      if (!fullName) setFullName(authUser.fullName);
      if (!email) setEmail(authUser.email);
    }
  }, [authUser, open]);

  if (!open) return null;

  const handleAutoFill = (profile: PassengerProfile) => {
    setFullName(profile.fullName);
    setEmail(profile.email);
    setPassportNumber(profile.passportNumber);
    setFrequentFlyerId(profile.frequentFlyerId);
    setSeatPreference(profile.seatPreference);
    setMealPreference(profile.mealPreference);
    if (profile.savedCards[0]) {
      setSelectedCardId(profile.savedCards[0].id);
    }
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) {
      setError('Please sign in before confirming payment.');
      return;
    }
    if (!fullName.trim() || !email.trim() || !passportNumber.trim()) {
      setError('Please complete passenger full name, email, and passport/ID number (or tap Auto-Fill).');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const idempotencyKey = `IDEM-${flight.id}-${travelDate}-${fullName.slice(0, 4)}-${fare.totalWithLuggage}`;
      const payResp = await fetch('/api/payments/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          idempotencyKey,
          method: paymentMethod,
          cardNumber: paymentMethod === 'new-card' ? cardNumber : undefined,
          currency,
          amount: fare.totalWithLuggage,
        }),
      });

      const payData = await payResp.json();
      if (!payResp.ok) {
        setError(payData.error || 'Payment authorization declined.');
        setSubmitting(false);
        return;
      }

      const methodLabel =
        paymentMethod === 'saved-card'
          ? 'Visa Infinite ·••• 4242'
          : paymentMethod === 'instant-fx'
          ? `Instant FX Wallet (${currency})`
          : `Card ·••• ${cardNumber.replace(/\D/g, '').slice(-4) || '0000'}`;

      const bookResp = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          flight,
          returnFlight: tripType === 'round-trip' ? returnFlight : undefined,
          tripType,
          travelDate,
          returnDate: tripType === 'round-trip' ? returnDate : undefined,
          cabin,
          luggage,
          currency,
          passengersCount,
          fareLockId,
          passenger: {
            fullName,
            email,
            passportNumber,
            frequentFlyerId,
            seat: selectedSeat,
            seatPreference,
            mealPreference,
          },
          payment: {
            transactionId: payData.transactionId,
            method: methodLabel,
          },
        }),
      });

      const bookData = await bookResp.json();
      if (!bookResp.ok) {
        setError(bookData.error || 'Unable to confirm booking.');
        setSubmitting(false);
        return;
      }

      onBookingComplete(bookData.booking as BookingRecord);
      onClose();
    } catch {
      setError('Network interruption during checkout. Please verify connection or retry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="checkout-modal-title">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
          <div>
            <h2 id="checkout-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
              {t.checkoutTitle}
            </h2>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {flight.flightNumber} · {flight.from} {tripType === 'round-trip' ? '⇄' : '→'} {flight.to} · {travelDate}
              {tripType === 'round-trip' && returnDate ? ` / ${returnDate}` : ''} · Seat {selectedSeat || 'Auto'} · {luggage.checkedBagsCount} bag(s)
              {fareLockId ? ` · Hold ${fareLockId}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Auto-Fill Bar */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                <UserCheck className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
                <span>{t.autoFillBtn}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {savedPassengers.map((pax) => (
                  <button
                    key={pax.id}
                    type="button"
                    onClick={() => handleAutoFill(pax)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-[#0F4C81] hover:text-[#0F4C81] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
                    <span>{pax.fullName} ({pax.tier})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Passenger Details */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Full Legal Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Rahul Yadav"
                className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Ticket Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="traveler@aeromesh.io"
                className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Passport / Gov ID</label>
              <input
                type="text"
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value)}
                placeholder="Z8492014"
                className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Frequent Flyer ID (Optional)</label>
              <input
                type="text"
                value={frequentFlyerId}
                onChange={(e) => setFrequentFlyerId(e.target.value)}
                placeholder="AM-PLAT-88412"
                className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Seat Preference</label>
              <select
                value={seatPreference}
                onChange={(e) => setSeatPreference(e.target.value as 'Window' | 'Aisle' | 'Extra Legroom')}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="Window">Window</option>
                <option value="Aisle">Aisle</option>
                <option value="Extra Legroom">Extra Legroom</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Meal Preference</label>
              <select
                value={mealPreference}
                onChange={(e) => setMealPreference(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="Standard">Standard</option>
                <option value="Vegetarian">Vegetarian</option>
                <option value="Vegan">Vegan</option>
                <option value="Halal">Halal</option>
                <option value="Gluten-Free">Gluten-Free</option>
              </select>
            </div>
          </div>

          {/* Multi-Currency Settlement */}
          <div className="border-t border-slate-200 pt-5 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Payment Currency &amp; Method</span>
              </div>
              <select
                aria-label="Settlement Currency"
                value={currency}
                onChange={(e) => onCurrencyChange(e.target.value as CurrencyCode)}
                className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {Object.entries(CURRENCY_RATES).map(([code, info]) => (
                  <option key={code} value={code}>
                    {code} ({info.symbol}) — {info.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { id: 'saved-card', label: 'Saved Vault Card' },
                { id: 'new-card', label: 'New Credit / Debit' },
                { id: 'instant-fx', label: 'Instant FX / Wallet' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id as 'saved-card' | 'new-card' | 'instant-fx')}
                  className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    paymentMethod === m.id
                      ? 'border-[#0F4C81] bg-[#0F4C81]/5 text-[#0F4C81] dark:border-blue-400 dark:text-blue-300'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {paymentMethod === 'saved-card' && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(savedPassengers[0]?.savedCards || []).map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setSelectedCardId(card.id)}
                    className={`flex items-center justify-between rounded-lg border p-3 text-left text-sm ${
                      selectedCardId === card.id
                        ? 'border-[#0F4C81] bg-[#0F4C81]/5 dark:border-blue-400'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <CreditCard className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{card.brand}</div>
                        <div className="font-mono text-xs text-slate-500">•••• {card.last4} · Exp {card.expiry}</div>
                      </div>
                    </div>
                    {selectedCardId === card.id && <CheckCircle2 className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" />}
                  </button>
                ))}
              </div>
            )}

            {paymentMethod === 'new-card' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Card Number (Luhn-checked)</label>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="4532 0151 1283 0366"
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Expiry</label>
                  <input
                    type="text"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">CVV</label>
                  <input
                    type="password"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value)}
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>
            )}

            {paymentMethod === 'instant-fx' && (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                Zero-markup instant currency settlement in <strong>{currency}</strong> via Apple Pay, Google Pay, SEPA Instant, or UPI FX.
              </p>
            )}
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Settlement</div>
              <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
                {formatMoney(fare.totalWithLuggage, currency)}
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[48px] rounded-lg bg-[#0F4C81] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0B3A63] disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Authorizing & Signing QR…' : t.payNow}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
