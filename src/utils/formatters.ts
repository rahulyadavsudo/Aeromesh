import { CURRENCY_RATES } from '../data/stationsAndFlights';
import type { CurrencyCode } from '../types/travel';

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const info = CURRENCY_RATES[currency] || CURRENCY_RATES.USD;
  if (currency === 'JPY') {
    return `${info.symbol}${Math.round(amount).toLocaleString('en-US')}`;
  }
  return `${info.symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function convertFromUsd(amountUsd: number, currency: CurrencyCode): number {
  const rate = CURRENCY_RATES[currency]?.rate ?? 1;
  if (currency === 'JPY') {
    return Math.round(amountUsd * rate);
  }
  return Math.round(amountUsd * rate * 100) / 100;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function saveOfflineItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`aeromesh:${key}`, JSON.stringify(value));
  } catch {
    // Ignore quota errors in restricted storage modes
  }
}

export function loadOfflineItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`aeromesh:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
