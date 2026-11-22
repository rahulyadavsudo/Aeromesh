import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Briefcase,
  Calculator,
  Calendar,
  Globe,
  LogIn,
  Moon,
  Plane,
  QrCode,
  Search,
  Sun,
  User,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { LANGUAGES, TRANSLATIONS } from './data/i18n';
import { CURRENCY_RATES, FLIGHTS_CATALOG, INITIAL_PASSENGERS, STATIONS } from './data/stationsAndFlights';
import type {
  AircraftSeat,
  AuthUser,
  BookingRecord,
  CabinClass,
  CurrencyCode,
  FareBreakdown,
  FlightOption,
  KafkaEventRecord,
  LanguageCode,
  LuggageConfig,
  NotificationEvent,
  PassengerProfile,
} from './types/travel';
import { convertFromUsd, formatDuration, formatMoney, formatShortTime, loadOfflineItem, saveOfflineItem } from './utils/formatters';
import { StationAutocomplete } from './components/StationAutocomplete';
import { FareLuggageCalculator } from './components/FareLuggageCalculator';
import { CheckoutDrawer } from './components/CheckoutDrawer';
import { QRBoardingPass } from './components/QRBoardingPass';
import { OfflineVectorMap } from './components/OfflineVectorMap';
import { TravelerAnalytics } from './components/TravelerAnalytics';
import { ProfileAndTrips } from './components/ProfileAndTrips';
import { MicroservicesConsole } from './components/MicroservicesConsole';
import { AuthView } from './components/AuthView';
import { IndiaAirportList } from './components/IndiaAirportList';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';

type ActiveTab = 'book' | 'fare-lab' | 'passes' | 'analytics' | 'architecture' | 'profile' | 'auth';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('book');
  const [language, setLanguage] = useState<LanguageCode>(() => loadOfflineItem<LanguageCode>('lang', 'en'));
  const [currency, setCurrency] = useState<CurrencyCode>(() => loadOfflineItem<CurrencyCode>('currency', 'USD'));
  const [lowBandwidth, setLowBandwidth] = useState<boolean>(() => loadOfflineItem<boolean>('lowBandwidth', false));
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => loadOfflineItem<boolean>('darkMode', false));

  // In-memory authentication session (never stored in localStorage/sessionStorage)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authRedirectNotice, setAuthRedirectNotice] = useState<string>('');
  const [pendingCheckoutFare, setPendingCheckoutFare] = useState<FareBreakdown | null>(null);

  // Search state
  const [fromCode, setFromCode] = useState('JFK');
  const [toCode, setToCode] = useState('LHR');
  const [travelDate, setTravelDate] = useState('2026-11-24');
  const [cabin, setCabin] = useState<CabinClass>('economy');
  const [passengersCount, setPassengersCount] = useState(1);
  const [flights, setFlights] = useState<FlightOption[]>(FLIGHTS_CATALOG.filter((f) => f.from === 'JFK' && f.to === 'LHR'));
  const [searching, setSearching] = useState(false);
  const [swapCount, setSwapCount] = useState(0);

  // Selected flight, luggage & aircraft seat configuration
  const [selectedFlight, setSelectedFlight] = useState<FlightOption>(FLIGHTS_CATALOG[0]);
  const [selectedSeat, setSelectedSeat] = useState<AircraftSeat | null>({
    id: '7A',
    row: 7,
    letter: 'A',
    cabin: 'economy',
    position: 'Window',
    status: 'available',
    extraLegroom: false,
    feeDeltaUsd: 0,
  });
  const [luggage, setLuggage] = useState<LuggageConfig>({
    carryOnCount: 1,
    checkedBagsCount: 1,
    bagWeightKg: 23,
    priorityHandling: false,
    sportsEquipment: false,
  });

  // Checkout modal state
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutFare, setCheckoutFare] = useState<FareBreakdown | null>(null);

  // Data stores synced with backend + offline localStorage cache
  const [bookings, setBookings] = useState<BookingRecord[]>(() => loadOfflineItem<BookingRecord[]>('bookings', []));
  const [activePassPnr, setActivePassPnr] = useState<string | null>(null);
  const [passengers, setPassengers] = useState<PassengerProfile[]>(INITIAL_PASSENGERS);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [toastNotif, setToastNotif] = useState<NotificationEvent | null>(null);
  const [kafkaEvents, setKafkaEvents] = useState<KafkaEventRecord[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const t = TRANSLATIONS[language] || TRANSLATIONS.en;

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    saveOfflineItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    saveOfflineItem('lang', language);
  }, [language]);

  useEffect(() => {
    saveOfflineItem('currency', currency);
  }, [currency]);

  useEffect(() => {
    saveOfflineItem('lowBandwidth', lowBandwidth);
  }, [lowBandwidth]);

  // Load initial backend data
  useEffect(() => {
    if (simulatedOffline || !navigator.onLine) return;

    Promise.all([
      fetch('/api/bookings').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/passengers').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/notifications').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/events/kafka').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([bData, pData, nData, kData]) => {
        if (bData?.bookings) {
          setBookings(bData.bookings);
          saveOfflineItem('bookings', bData.bookings);
          if (!activePassPnr && bData.bookings[0]) {
            setActivePassPnr(bData.bookings[0].pnr);
          }
        }
        if (pData?.passengers) setPassengers(pData.passengers);
        if (nData?.notifications) setNotifications(nData.notifications);
        if (kData?.events) setKafkaEvents(kData.events);
      })
      .catch(() => {});
  }, [simulatedOffline]);

  // Real-time WebSocket connection to notification-svc & Kafka broker
  useEffect(() => {
    if (simulatedOffline) {
      wsRef.current?.close();
      setWsConnected(false);
      return;
    }

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByEffect = false;

    const connectWs = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        if (!closedByEffect && !simulatedOffline) {
          reconnectTimer = setTimeout(connectWs, 3500);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ws:init') {
            if (Array.isArray(msg.data?.notifications)) setNotifications(msg.data.notifications);
            if (Array.isArray(msg.data?.kafkaEvents)) setKafkaEvents(msg.data.kafkaEvents);
          } else if (msg.type === 'notification:new') {
            const incoming = msg.data as NotificationEvent;
            setNotifications((prev) => (prev.some((n) => n.id === incoming.id) ? prev : [incoming, ...prev]));
            setToastNotif(incoming);
            setTimeout(() => setToastNotif((curr) => (curr?.id === incoming.id ? null : curr)), 6000);
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              try {
                new Notification(incoming.title, { body: incoming.message, icon: '/pwa-192x192.png' });
              } catch {
                // Ignore if notification API blocked in iframe
              }
            }
          } else if (msg.type === 'kafka:event') {
            const ev = msg.data as KafkaEventRecord;
            setKafkaEvents((prev) => [ev, ...prev].slice(0, 40));
          } else if (msg.type === 'booking:created') {
            const created = msg.data as BookingRecord;
            setBookings((prev) => {
              const next = prev.some((b) => b.pnr === created.pnr) ? prev : [created, ...prev];
              saveOfflineItem('bookings', next);
              return next;
            });
          } else if (msg.type === 'booking:updated') {
            const updated = msg.data as BookingRecord;
            setBookings((prev) => {
              const next = prev.map((b) => (b.pnr === updated.pnr ? updated : b));
              saveOfflineItem('bookings', next);
              return next;
            });
          }
        } catch {
          // Ignore malformed WS frame
        }
      };
    };

    connectWs();

    return () => {
      closedByEffect = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [simulatedOffline]);

  const runFlightSearch = async (origin: string, destination: string) => {
    setSearching(true);
    try {
      if (!simulatedOffline && navigator.onLine) {
        const res = await fetch(
          `/api/flights/search?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(destination)}`,
          { headers: lowBandwidth ? { 'x-bandwidth-mode': 'low' } : {} }
        );
        if (res.ok) {
          const data = await res.json();
          setFlights(data.flights || []);
          return;
        }
      }
      setFlights(FLIGHTS_CATALOG.filter((f) => f.from === origin && f.to === destination));
    } finally {
      setSearching(false);
    }
  };

  const handleSearchFlights = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await runFlightSearch(fromCode, toCode);
  };

  const handleQuickCorridor = (origin: string, destination: string, preferCurrency?: CurrencyCode) => {
    setFromCode(origin);
    setToCode(destination);
    if (preferCurrency) {
      setCurrency(preferCurrency);
    }
    void runFlightSearch(origin, destination);
  };

  const handleSwapStations = () => {
    const prevFrom = fromCode;
    setFromCode(toCode);
    setToCode(prevFrom);
    setSwapCount((c) => c + 1);
  };

  const maybeSwitchInrForIndiaRoute = (origin: string, destination: string) => {
    const origIndia = STATIONS.find((s) => s.code === origin)?.country === 'India';
    const destIndia = STATIONS.find((s) => s.code === destination)?.country === 'India';
    if (origIndia && destIndia) {
      setCurrency('INR');
    }
  };

  const handleSelectIndiaOrigin = (code: string) => {
    const nextDest = toCode === code ? (code === 'BOM' ? 'DEL' : 'BOM') : toCode;
    setFromCode(code);
    setToCode(nextDest);
    maybeSwitchInrForIndiaRoute(code, nextDest);
    void runFlightSearch(code, nextDest);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectIndiaDestination = (code: string) => {
    const nextOrigin = fromCode === code ? (code === 'DEL' ? 'BOM' : 'DEL') : fromCode;
    setFromCode(nextOrigin);
    setToCode(code);
    maybeSwitchInrForIndiaRoute(nextOrigin, code);
    void runFlightSearch(nextOrigin, code);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenFareLabForFlight = (flight: FlightOption) => {
    setSelectedFlight(flight);
    setActiveTab('fare-lab');
  };

  const handleOpenCheckout = (fare: FareBreakdown) => {
    const seatExtra =
      selectedSeat && selectedSeat.feeDeltaUsd > 0
        ? convertFromUsd(selectedSeat.feeDeltaUsd * passengersCount, fare.currency)
        : 0;
    const adjustedFare: FareBreakdown = {
      ...fare,
      totalWithLuggage: Math.round((fare.totalWithLuggage + seatExtra) * 100) / 100,
    };

    if (!authUser || !authToken) {
      setPendingCheckoutFare(adjustedFare);
      setAuthRedirectNotice('Please sign in or create an account to confirm your seat and book your ticket.');
      setActiveTab('auth');
      return;
    }

    setCheckoutFare(adjustedFare);
    setCheckoutOpen(true);
  };

  const handleAuthSuccess = (user: AuthUser, token: string) => {
    setAuthUser(user);
    setAuthToken(token);
    setAuthRedirectNotice('');

    // Refresh passenger roster so newly registered user appears in Auto-Fill
    fetch('/api/passengers')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.passengers) setPassengers(d.passengers);
      })
      .catch(() => {});

    if (pendingCheckoutFare) {
      setCheckoutFare(pendingCheckoutFare);
      setPendingCheckoutFare(null);
      setActiveTab('fare-lab');
      setCheckoutOpen(true);
    } else {
      setActiveTab('book');
    }
  };

  const handleSignOut = () => {
    setAuthUser(null);
    setAuthToken(null);
    setCheckoutOpen(false);
  };

  const handleBookingComplete = (newBooking: BookingRecord) => {
    setBookings((prev) => {
      const next = prev.some((b) => b.pnr === newBooking.pnr) ? prev : [newBooking, ...prev];
      saveOfflineItem('bookings', next);
      return next;
    });
    setActivePassPnr(newBooking.pnr);
    setActiveTab('passes');
  };

  const handleSavePassenger = async (profile: Partial<PassengerProfile>) => {
    if (!authToken) {
      setAuthRedirectNotice('Please sign in to save traveler profiles.');
      setActiveTab('auth');
      return;
    }
    const res = await fetch('/api/passengers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(profile),
    });
    if (res.ok) {
      const data = await res.json();
      setPassengers((prev) => [data.passenger, ...prev.filter((p) => p.id !== data.passenger.id)]);
    }
  };

  const handleSimulateAlert = async (kind: 'delay' | 'gate' | 'ride') => {
    await fetch('/api/notifications/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, pnr: bookings[0]?.pnr }),
    });
  };

  const requestPushPermission = async () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // Ignore in restricted iframe
      }
    }
    setNotifDrawerOpen((v) => !v);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const activePass = bookings.find((b) => b.pnr === activePassPnr) || bookings[0];

  const computeQuickTotals = (flight: FlightOption) => {
    const mult: Record<CabinClass, number> = { economy: 1, premium: 1.48, business: 2.65, first: 4.1 };
    const subtotal = flight.basePriceUsd * mult[cabin];
    const taxes = subtotal * 0.14 + 28;
    const bagFee = cabin === 'business' || cabin === 'first' ? 0 : 42;
    return {
      light: convertFromUsd((subtotal + taxes) * passengersCount, currency),
      withBag: convertFromUsd((subtotal + taxes + bagFee) * passengersCount, currency),
    };
  };

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 pb-20 md:pb-8">
      {/* Top Bar Contract: 3 Zones (Brand wordmark — 5 nav links — 1 primary CTA) */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('book')}
            className="font-display text-lg font-extrabold tracking-tight text-[#0F4C81] dark:text-white whitespace-nowrap shrink-0"
          >
            AeroMesh
          </button>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6 text-sm font-medium">
            {(
              [
                { id: 'book', label: t.navBook },
                { id: 'fare-lab', label: t.navFareLab },
                { id: 'passes', label: t.navPasses },
                { id: 'analytics', label: t.navAnalytics },
                { id: 'architecture', label: t.navArchitecture },
              ] as { id: ActiveTab; label: string }[]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors ${
                  activeTab === item.id
                    ? 'text-[#0F4C81] font-semibold dark:text-blue-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {item.label}
                {activeTab === item.id && (
                  <motion.span
                    layoutId="nav-active-underline"
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0F4C81] dark:bg-blue-400"
                  />
                )}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            {authUser ? (
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B3A63] transition-colors whitespace-nowrap shrink-0"
              >
                <User className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="max-w-[120px] truncate">{authUser.fullName.split(' ')[0]} · Trips</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthRedirectNotice('');
                  setActiveTab('auth');
                }}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B3A63] transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Workspace Preferences & Network Controls Toolbar */}
      <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Multi-Language Selector */}
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <Globe className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <select
                aria-label="Language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                className="min-h-[36px] rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.native} · {l.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Multi-Currency Selector */}
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="min-h-[36px] rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {Object.entries(CURRENCY_RATES).map(([code, info]) => (
                <option key={code} value={code}>
                  {code} ({info.symbol})
                </option>
              ))}
            </select>

            {/* Low-Bandwidth Data Saver Toggle */}
            <button
              type="button"
              onClick={() => setLowBandwidth((v) => !v)}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                lowBandwidth
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.lowBandwidthLabel}: {lowBandwidth ? 'ON' : 'OFF'}</span>
            </button>

            {/* Offline Simulation Toggle */}
            <button
              type="button"
              onClick={() => setSimulatedOffline((v) => !v)}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                simulatedOffline
                  ? 'border-amber-600 bg-amber-50 text-amber-800 dark:border-amber-500 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {simulatedOffline ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
              <span>{simulatedOffline ? 'Offline Test: ON' : 'Network: Live'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <PWAInstallButton />

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={requestPushPermission}
                aria-label="Open travel notifications"
                className="relative inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{t.pushAlertsLabel}</span>
                {unreadCount > 0 && (
                  <span className="font-mono text-[11px] font-bold text-[#0F4C81] dark:text-blue-400">
                    ({unreadCount})
                  </span>
                )}
              </button>

              {notifDrawerOpen && (
                <div className="absolute right-0 z-40 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Real-Time Travel Alerts ({wsConnected ? 'WebSocket Live' : 'Cached'})
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSimulateAlert('delay')}
                        className="text-[11px] font-semibold text-[#0F4C81] hover:underline dark:text-blue-400"
                      >
                        {t.simulateDelayBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotifDrawerOpen(false)}
                        aria-label="Close notifications"
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">No active flight alerts.</div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className="p-3.5 text-xs space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">{n.title}</span>
                            <span className="font-mono text-[10px] text-slate-400">{formatShortTime(n.timestamp)}</span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-400">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Dark/Light Toggle */}
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label="Toggle color theme"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Live Incoming Push Toast */}
      <AnimatePresence>
        {toastNotif && (
          <motion.div
            key={toastNotif.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            role="status"
            className="fixed right-4 top-28 z-50 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-[#0F4C81] dark:text-blue-400">{toastNotif.title}</div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{toastNotif.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setToastNotif(null)}
                aria-label="Dismiss alert"
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 space-y-10">
        <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-10"
        >
        {activeTab === 'book' && (
          <>
            {/* Hero + Flight Search Split */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    10-Service Polyglot Flight &amp; Rail Engine · Offline PWA Ready
                  </div>
                  <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl [text-wrap:balance]">
                    {t.heroTitle}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {t.heroSubtitle}
                  </p>
                </div>

                {/* Flight & Station Autocomplete Search Form */}
                <form onSubmit={handleSearchFlights} className="mt-6 space-y-4 border-t border-slate-100 pt-6 dark:border-slate-800">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-11 items-end">
                    <div className="sm:col-span-5">
                      <StationAutocomplete
                        label={t.fromLabel}
                        value={fromCode}
                        onChange={setFromCode}
                        lowBandwidth={lowBandwidth}
                        simulatedOffline={simulatedOffline}
                        excludeCode={toCode}
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-center">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={handleSwapStations}
                        aria-label="Swap origin and destination"
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <motion.span
                          animate={{ rotate: swapCount * 180 }}
                          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                          className="inline-flex"
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                        </motion.span>
                      </motion.button>
                    </div>
                    <div className="sm:col-span-5">
                      <StationAutocomplete
                        label={t.toLabel}
                        value={toCode}
                        onChange={setToCode}
                        lowBandwidth={lowBandwidth}
                        simulatedOffline={simulatedOffline}
                        excludeCode={fromCode}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 items-end">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                        {t.dateLabel}
                      </label>
                      <div className="relative">
                        <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input
                          type="date"
                          value={travelDate}
                          onChange={(e) => setTravelDate(e.target.value)}
                          className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                        {t.cabinLabel}
                      </label>
                      <select
                        value={cabin}
                        onChange={(e) => setCabin(e.target.value as CabinClass)}
                        className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium capitalize dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="economy">Economy</option>
                        <option value="premium">Premium Economy</option>
                        <option value="business">Business</option>
                        <option value="first">First Class</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={searching}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0B3A63] disabled:opacity-60 transition-colors"
                    >
                      <Search className="h-4 w-4" aria-hidden="true" />
                      <span>{searching ? 'Searching…' : t.searchFlights}</span>
                    </button>
                  </div>

                  {/* Quick India & Global Corridors */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      India &amp; Global Corridors:
                    </span>
                    {[
                      { from: 'DEL', to: 'BOM', label: 'DEL → BOM · ₹', cur: 'INR' as CurrencyCode },
                      { from: 'BOM', to: 'BLR', label: 'BOM → BLR · ₹', cur: 'INR' as CurrencyCode },
                      { from: 'DEL', to: 'BLR', label: 'DEL → BLR · ₹', cur: 'INR' as CurrencyCode },
                      { from: 'BLR', to: 'SIN', label: 'BLR → SIN' },
                      { from: 'HYD', to: 'DXB', label: 'HYD → DXB' },
                      { from: 'JFK', to: 'LHR', label: 'JFK → LHR' },
                    ].map((corridor) => {
                      const active = fromCode === corridor.from && toCode === corridor.to;
                      return (
                        <button
                          key={`${corridor.from}-${corridor.to}`}
                          type="button"
                          onClick={() => handleQuickCorridor(corridor.from, corridor.to, corridor.cur)}
                          className={`rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors whitespace-nowrap ${
                            active
                              ? 'border-[#0F4C81] bg-[#0F4C81]/10 text-[#0F4C81] dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-300'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300'
                          }`}
                        >
                          {corridor.label}
                        </button>
                      );
                    })}
                  </div>
                </form>
              </motion.div>

              {/* Right Column: Editorial Terminal Photo OR Zero-Byte Low-Bandwidth Schematic */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 dark:border-slate-800"
              >
                {lowBandwidth ? (
                  <div className="flex h-full min-h-[260px] flex-col justify-between p-6 text-slate-100">
                    <div>
                      <div className="font-mono text-xs text-emerald-400">LOW-BANDWIDTH DATA SAVER ACTIVE</div>
                      <h2 className="mt-2 text-xl font-bold">Text &amp; Vector Only Transport</h2>
                      <p className="mt-2 text-xs leading-relaxed text-slate-300">
                        Hero images suppressed to save ~420 KB per view. Station index, fare calculator, and QR boarding passes run on compact JSON + local cache.
                      </p>
                    </div>
                    <div className="my-4 space-y-2">
                      <div className="relative flex items-center justify-between px-2">
                        <span className="font-mono text-xs font-bold text-sky-300">{fromCode}</span>
                        <div className="relative mx-3 flex-1 h-0.5 bg-slate-700 overflow-hidden rounded-full">
                          <motion.div
                            animate={{ left: ['0%', '92%'], opacity: [0.3, 1, 1, 0.3] }}
                            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute top-1/2 -translate-y-1/2 text-sky-400"
                          >
                            <Plane className="h-3.5 w-3.5" aria-hidden="true" />
                          </motion.div>
                        </div>
                        <span className="font-mono text-xs font-bold text-emerald-400">{toCode}</span>
                      </div>
                    </div>
                    <div className="font-mono text-xs text-slate-400">
                      Payload header: x-bandwidth-mode: low
                    </div>
                  </div>
                ) : (
                  <div className="relative h-full min-h-[280px] overflow-hidden">
                    <motion.img
                      initial={{ scale: 1.06 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                      src="/src/assets/images/aviation_terminal_hero_1795322418590.jpg"
                      alt="Modern sunlit international airport terminal concourse"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-6 text-white space-y-3">
                      <div className="flex items-center gap-3 rounded-lg bg-slate-950/65 px-3 py-2 backdrop-blur-sm border border-white/10">
                        <span className="font-mono text-xs font-bold text-sky-300">{fromCode}</span>
                        <div className="relative flex-1 h-px bg-white/30">
                          <motion.div
                            animate={{ left: ['0%', '92%'], opacity: [0.2, 1, 1, 0.2] }}
                            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute top-1/2 -translate-y-1/2 text-sky-300"
                          >
                            <Plane className="h-3.5 w-3.5" aria-hidden="true" />
                          </motion.div>
                        </div>
                        <span className="font-mono text-xs font-bold text-emerald-300">{toCode}</span>
                        <span className="font-mono text-[11px] text-slate-300 hidden sm:inline">· {travelDate}</span>
                      </div>

                      <div>
                        <div className="text-base font-bold">
                          Direct Air &amp; Terminal Rail Synchronization
                        </div>
                        <div className="mt-1 text-xs text-slate-200">
                          Includes offline QR vehicle boarding pass &amp; terminal vector map
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </section>

            {/* Available Flights List with Light (No Luggage) vs Standard (+Luggage) comparison */}
            <section aria-labelledby="flights-list-heading" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="flights-list-heading" className="text-lg font-bold text-slate-900 dark:text-white">
                  {t.availableFlights} ({flights.length})
                </h2>
                <span className="font-mono text-xs text-slate-500">
                  Showing {currency} · {cabin} cabin · {passengersCount} traveler
                </span>
              </div>

              {flights.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    No departures matched {fromCode} → {toCode}. Try another hub pair or tap Search Flights.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {flights.map((flight, index) => {
                    const totals = computeQuickTotals(flight);
                    return (
                      <motion.div
                        key={flight.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ y: -2 }}
                        transition={{ duration: 0.3, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
                        className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md lg:flex-row lg:items-center lg:justify-between dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="flex flex-wrap items-center gap-6">
                          <div className="min-w-[140px]">
                            <div className="text-sm font-bold text-slate-900 dark:text-white">{flight.airline}</div>
                            <div className="font-mono text-xs text-slate-500">
                              {flight.flightNumber} · {flight.aircraft}
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div>
                              <div className="font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
                                {flight.departureTime}
                              </div>
                              <div className="font-mono text-xs text-slate-500">{flight.from} · {flight.terminal}</div>
                            </div>

                            <div className="text-center px-2">
                              <div className="font-mono text-[11px] text-slate-500">{formatDuration(flight.durationMinutes)}</div>
                              <div className="relative my-2 h-px w-24 bg-slate-300 dark:bg-slate-700">
                                <motion.span
                                  animate={{ left: ['0%', '84%'], opacity: [0.3, 1, 1, 0.3] }}
                                  transition={{ duration: 3.2, delay: index * 0.4, repeat: Infinity, ease: 'easeInOut' }}
                                  className="absolute top-1/2 -translate-y-1/2 text-[#0F4C81] dark:text-blue-400"
                                >
                                  <Plane className="h-3 w-3" aria-hidden="true" />
                                </motion.span>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop`} · {flight.co2Kg} kg CO₂
                              </div>
                            </div>

                            <div>
                              <div className="font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
                                {flight.arrivalTime}
                              </div>
                              <div className="font-mono text-xs text-slate-500">{flight.to} · Gate {flight.gate}</div>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4 lg:border-t-0 lg:pt-0 dark:border-slate-800">
                          <div className="flex items-center gap-5">
                            <div>
                              <div className="text-[11px] text-slate-500">{t.noLuggagePrice}</div>
                              <div className="font-mono text-base font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                                {formatMoney(totals.light, currency)}
                              </div>
                            </div>
                            <div className="h-8 w-px bg-slate-200 dark:bg-slate-800" />
                            <div>
                              <div className="text-[11px] text-slate-500">{t.withLuggagePrice}</div>
                              <div className="font-mono text-base font-bold text-slate-900 tabular-nums dark:text-white">
                                {formatMoney(totals.withBag, currency)}
                              </div>
                            </div>
                          </div>

                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.96 }}
                            onClick={() => handleOpenFareLabForFlight(flight)}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B3A63] transition-colors whitespace-nowrap"
                          >
                            <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{t.selectFlight}</span>
                          </motion.button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Visible Interactive India Airport Directory */}
            <IndiaAirportList
              fromCode={fromCode}
              toCode={toCode}
              onSelectFrom={handleSelectIndiaOrigin}
              onSelectTo={handleSelectIndiaDestination}
            />
          </>
        )}

        {activeTab === 'fare-lab' && (
          <FareLuggageCalculator
            selectedFlight={selectedFlight}
            travelDate={travelDate}
            currency={currency}
            cabin={cabin}
            onCabinChange={setCabin}
            luggage={luggage}
            onLuggageChange={setLuggage}
            selectedSeat={selectedSeat}
            onSelectSeat={setSelectedSeat}
            passengersCount={passengersCount}
            onPassengersChange={setPassengersCount}
            lowBandwidth={lowBandwidth}
            simulatedOffline={simulatedOffline}
            isAuthenticated={Boolean(authUser && authToken)}
            t={t}
            onProceedToCheckout={handleOpenCheckout}
          />
        )}

        {activeTab === 'passes' && (
          <div className="space-y-10">
            <section aria-labelledby="passes-heading" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                <div>
                  <h2 id="passes-heading" className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {t.qrBoardingPassTitle}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Cached locally for offline gate scanning and linked airport transfer vehicle boarding.
                  </p>
                </div>

                {bookings.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                    {bookings.map((b) => (
                      <button
                        key={b.pnr}
                        type="button"
                        onClick={() => setActivePassPnr(b.pnr)}
                        className={`min-h-[36px] rounded-md px-3 py-1 font-mono text-xs font-semibold transition-colors ${
                          activePass?.pnr === b.pnr
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                        }`}
                      >
                        {b.pnr} ({b.flight.from}→{b.flight.to})
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {activePass ? (
                <QRBoardingPass booking={activePass} simulatedOffline={simulatedOffline} />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  No boarding passes booked yet. Search a flight and complete checkout to issue a QR boarding pass.
                </div>
              )}
            </section>

            <OfflineVectorMap
              selectedFrom={activePass?.flight.from || fromCode}
              selectedTo={activePass?.flight.to || toCode}
              t={t}
              simulatedOffline={simulatedOffline}
            />
          </div>
        )}

        {activeTab === 'analytics' && (
          <TravelerAnalytics
            currency={currency}
            t={t}
            simulatedOffline={simulatedOffline}
            bookingsCount={bookings.length}
          />
        )}

        {activeTab === 'architecture' && (
          <MicroservicesConsole
            kafkaEvents={kafkaEvents}
            wsConnected={wsConnected}
            onSimulateAlert={handleSimulateAlert}
            t={t}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileAndTrips
            authUser={authUser}
            onOpenAuth={() => {
              setAuthRedirectNotice('');
              setActiveTab('auth');
            }}
            onSignOut={handleSignOut}
            passengers={passengers}
            onSavePassenger={handleSavePassenger}
            bookings={bookings}
            onOpenBoardingPass={(pnr) => {
              setActivePassPnr(pnr);
              setActiveTab('passes');
            }}
            t={t}
          />
        )}

        {activeTab === 'auth' && (
          <AuthView
            redirectNotice={authRedirectNotice}
            onAuthSuccess={handleAuthSuccess}
            onCancel={() => {
              setPendingCheckoutFare(null);
              setAuthRedirectNotice('');
              setActiveTab('book');
            }}
          />
        )}
        </motion.div>
        </AnimatePresence>
      </main>

      {/* Checkout Modal */}
      {checkoutFare && (
        <CheckoutDrawer
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          flight={selectedFlight}
          travelDate={travelDate}
          cabin={cabin}
          luggage={luggage}
          selectedSeat={selectedSeat?.id || '7A'}
          passengersCount={passengersCount}
          fare={checkoutFare}
          currency={currency}
          onCurrencyChange={setCurrency}
          savedPassengers={passengers}
          authUser={authUser}
          authToken={authToken}
          t={t}
          onBookingComplete={handleBookingComplete}
        />
      )}

      {/* Mobile Fixed Bottom Navigation (<=15% combined sticky height, >=44px hitboxes) */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden dark:border-slate-800 dark:bg-slate-950/95"
      >
        {(
          [
            { id: 'book', label: t.navBook, icon: Plane },
            { id: 'fare-lab', label: t.navFareLab, icon: Calculator },
            { id: 'passes', label: 'QR & Map', icon: QrCode },
            { id: 'analytics', label: t.navAnalytics, icon: BarChart3 },
            { id: authUser ? 'profile' : 'auth', label: authUser ? 'Profile' : 'Sign In', icon: authUser ? User : LogIn },
          ] as { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[]
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors ${
                active ? 'text-[#0F4C81] dark:text-blue-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="truncate max-w-full">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <OfflineIndicator simulatedOffline={simulatedOffline} />
    </div>
    </MotionConfig>
  );
}
