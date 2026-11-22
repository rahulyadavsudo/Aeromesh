import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Car, CheckCircle2, QrCode, ShieldCheck, Sun } from 'lucide-react';
import type { BookingRecord } from '../types/travel';
import { formatMoney } from '../utils/formatters';

interface QRBoardingPassProps {
  booking: BookingRecord;
  simulatedOffline: boolean;
}

export const QRBoardingPass: React.FC<QRBoardingPassProps> = ({ booking, simulatedOffline }) => {
  const [qrSrc, setQrSrc] = useState<string>(booking.qrDataUrl || '');
  const [brightnessBoost, setBrightnessBoost] = useState(false);
  const [verifyResult, setVerifyResult] = useState<'idle' | 'valid' | 'invalid'>('idle');

  useEffect(() => {
    if (booking.qrDataUrl) {
      setQrSrc(booking.qrDataUrl);
      return;
    }
    QRCode.toDataURL(booking.qrPayload, {
      width: 240,
      margin: 1,
      color: { dark: '#0B1220', light: '#FFFFFF' },
    })
      .then(setQrSrc)
      .catch(() => {});
  }, [booking.qrDataUrl, booking.qrPayload]);

  const handleVerifySignature = async () => {
    if (simulatedOffline || !navigator.onLine) {
      // Offline HMAC structure verification
      setVerifyResult(booking.qrPayload.includes(`|SIG:${booking.qrSignature}`) ? 'valid' : 'invalid');
      return;
    }
    try {
      const resp = await fetch('/api/tickets/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrPayload: booking.qrPayload }),
      });
      const data = await resp.json();
      setVerifyResult(data.valid ? 'valid' : 'invalid');
    } catch {
      setVerifyResult(booking.qrPayload.includes(`|SIG:${booking.qrSignature}`) ? 'valid' : 'invalid');
    }
  };

  const statusTone =
    booking.flight.status === 'Delayed' || booking.flight.status === 'Gate Changed'
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-emerald-700 dark:text-emerald-400';

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0F4C81] px-5 py-3.5 text-white">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-semibold tracking-wide">
            {booking.flight.airline} · {booking.flight.flightNumber}
          </span>
        </div>
        <span className="font-mono text-xs font-semibold">PNR {booking.pnr}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12">
        {/* Flight & Passenger Meta */}
        <div className="md:col-span-8 p-5 space-y-5 border-b md:border-b-0 md:border-r border-dashed border-slate-300 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-3xl font-bold text-slate-900 dark:text-white">{booking.flight.from}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Departs {booking.flight.departureTime}</div>
            </div>
            <div className="flex-1 px-4 text-center">
              <div className="text-xs font-mono text-slate-400">{booking.travelDate}</div>
              <div className="my-1.5 h-px w-full bg-slate-200 dark:bg-slate-700" />
              <div className={`text-xs font-semibold ${statusTone}`}>{booking.flight.status}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-3xl font-bold text-slate-900 dark:text-white">{booking.flight.to}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Arrives {booking.flight.arrivalTime}</div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Passenger</dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white truncate">{booking.passenger.fullName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Terminal / Gate</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-white">
                {booking.flight.terminal} / {booking.flight.gate}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Seat &amp; Group</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-white">
                {booking.passenger.seat} · {booking.passenger.boardingGroup.split('·')[0].trim()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Baggage &amp; Paid</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                {booking.luggage.checkedBagsCount} bag · {formatMoney(booking.payment.amountPaid, booking.payment.currency)}
              </dd>
            </div>
          </dl>

          {booking.rideTransfer && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs dark:bg-slate-950">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Car className="h-4 w-4 text-[#0F4C81] dark:text-blue-400 shrink-0" aria-hidden="true" />
                <span>
                  <strong>{booking.rideTransfer.provider}</strong> ({booking.rideTransfer.vehicleCode}) · {booking.rideTransfer.pickupPoint}
                </span>
              </div>
              <span className="font-mono font-semibold text-[#0F4C81] dark:text-blue-400">
                ETA {booking.rideTransfer.etaMinutes} min · QR Entry Valid
              </span>
            </div>
          )}
        </div>

        {/* QR Gate Entry Section */}
        <div
          className={`md:col-span-4 flex flex-col items-center justify-center p-5 transition-all ${
            brightnessBoost ? 'bg-white text-slate-950 brightness-110' : 'bg-slate-50 dark:bg-slate-950/60'
          }`}
        >
          <div className="rounded-xl bg-white p-2.5 border border-slate-200">
            {qrSrc ? (
              <img
                src={qrSrc}
                alt={`Boarding QR Code for ${booking.pnr}`}
                className="h-36 w-36 object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-36 w-36 items-center justify-center text-xs font-mono text-slate-500">
                QR Ready
              </div>
            )}
          </div>
          <div className="mt-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            SIG {booking.qrSignature}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setBrightnessBoost((v) => !v)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{brightnessBoost ? 'Normal Glow' : 'Scanner Boost'}</span>
            </button>
            <button
              type="button"
              onClick={handleVerifySignature}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {verifyResult === 'valid' ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
              )}
              <span>{verifyResult === 'valid' ? 'Verified' : 'Verify Gate Key'}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
