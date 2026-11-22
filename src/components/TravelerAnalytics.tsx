import React, { useEffect, useState } from 'react';
import { BarChart3, Clock, Compass, Leaf, Wallet } from 'lucide-react';
import type { AnalyticsSummary, CurrencyCode } from '../types/travel';
import type { TranslationSet } from '../data/i18n';
import { convertFromUsd, formatMoney } from '../utils/formatters';

interface TravelerAnalyticsProps {
  currency: CurrencyCode;
  t: TranslationSet;
  simulatedOffline: boolean;
  bookingsCount: number;
}

export const TravelerAnalytics: React.FC<TravelerAnalyticsProps> = ({
  currency,
  t,
  simulatedOffline,
  bookingsCount,
}) => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    if (simulatedOffline || !navigator.onLine) return;
    fetch('/api/analytics')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d as AnalyticsSummary);
      })
      .catch(() => {});
  }, [simulatedOffline, bookingsCount]);

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        Loading frequent traveler telemetry…
      </div>
    );
  }

  const maxSpend = Math.max(...data.monthlyActivity.map((m) => m.spendUsd), 1);

  return (
    <section aria-labelledby="analytics-heading" className="space-y-6">
      <div className="flex flex-col gap-1 border-b border-slate-200 pb-5 dark:border-slate-800">
        <h2 id="analytics-heading" className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t.analyticsTitle}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Real-time rollup from travel-analytics-svc across completed flights, airport transit rides, and baggage selections.
        </p>
      </div>

      {/* 4 KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Trips &amp; Distance</span>
            <Compass className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
            {data.totalTrips} trips
          </div>
          <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
            {data.totalDistanceKm.toLocaleString('en-US')} km · {data.totalFlightHours} hrs
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>On-Time Reliability</span>
            <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
            {data.onTimeRatePercent}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {data.delayedCount} delayed segment(s) tracked
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Annual Travel Spend</span>
            <Wallet className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
            {formatMoney(convertFromUsd(data.totalSpendUsd, currency), currency)}
          </div>
          <div className="mt-1 font-mono text-xs text-emerald-700 tabular-nums dark:text-emerald-400">
            Saved {formatMoney(convertFromUsd(data.luggageSavingsUsd, currency), currency)} via Light fares
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Carbon Footprint</span>
            <Leaf className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
            {data.co2MetricTons} t CO₂
          </div>
          <div className="mt-1 text-xs text-slate-500">
            100% EV terminal transfers active
          </div>
        </div>
      </div>

      {/* Monthly Spend & Cabin Mix */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
              <span>6-Month Spend &amp; Distance Trend</span>
            </h3>
            <span className="font-mono text-xs text-slate-500">{currency} equivalent</span>
          </div>

          <div className="grid grid-cols-6 gap-3 items-end h-48 pt-4">
            {data.monthlyActivity.map((m) => {
              const heightPct = Math.max(12, Math.round((m.spendUsd / maxSpend) * 100));
              return (
                <div key={m.month} className="flex flex-col items-center justify-end h-full gap-2">
                  <span className="font-mono text-[11px] font-medium text-slate-600 tabular-nums dark:text-slate-400">
                    {formatMoney(convertFromUsd(m.spendUsd, currency), currency).replace(/\.\d+$/, '')}
                  </span>
                  <div className="w-full max-w-[44px] flex-1 flex items-end">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full rounded-t-md bg-[#0F4C81] dark:bg-blue-500 transition-all"
                      title={`${m.month}: ${m.trips} trips · ${m.distanceKm} km`}
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{m.month}</div>
                    <div className="font-mono text-[10px] text-slate-400">{m.trips}x</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Cabin &amp; Baggage Tier Mix</h3>
            <div className="space-y-3">
              {data.cabinDistribution.map((c) => (
                <div key={c.cabin} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{c.cabin}</span>
                    <span className="font-mono text-slate-500 tabular-nums">{c.count} trips ({c.percent}%)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div style={{ width: `${c.percent}%` }} className="h-full rounded-full bg-[#0F4C81] dark:bg-blue-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2.5">Top Corridors</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2 font-medium">Route</th>
                  <th className="pb-2 font-medium text-right">Trips</th>
                  <th className="pb-2 font-medium text-right">Avg Fare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.topRoutes.map((r) => (
                  <tr key={r.route} className="h-9">
                    <td className="font-mono font-semibold text-slate-800 dark:text-slate-200">{r.route}</td>
                    <td className="font-mono text-right text-slate-600 tabular-nums dark:text-slate-400">{r.count}</td>
                    <td className="font-mono text-right font-medium text-slate-900 tabular-nums dark:text-white">
                      {formatMoney(convertFromUsd(r.avgFareUsd, currency), currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};
