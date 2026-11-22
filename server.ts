import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';
import next from 'next';
import {
  CURRENCY_RATES,
  FLIGHTS_CATALOG,
  INITIAL_PASSENGERS,
  OFFLINE_MAP_PACKS,
  STATIONS,
} from './src/data/stationsAndFlights.ts';
import type {
  AnalyticsSummary,
  AuthUser,
  BookingRecord,
  CabinClass,
  CurrencyCode,
  FareBreakdown,
  FlightOption,
  KafkaEventRecord,
  LuggageConfig,
  NotificationEvent,
  PassengerProfile,
} from './src/types/travel';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QR_SECRET = process.env.QR_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface StoredUser {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  tier: 'Silver' | 'Gold' | 'Platinum';
  createdAt: string;
}

// In-memory authoritative server stores (backed by microservice boundaries)
const usersStore: StoredUser[] = [];
const passengersStore: PassengerProfile[] = [...INITIAL_PASSENGERS];
const idempotencyStore = new Map<string, { transactionId: string; status: 'Authorized' | 'Settled'; amountPaid: number; currency: CurrencyCode }>();
const kafkaEventLog: KafkaEventRecord[] = [];
let kafkaOffset = 1040;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function signSessionToken(user: AuthUser): string {
  const payloadObj = {
    sub: user.id,
    email: user.email,
    fullName: user.fullName,
    tier: user.tier,
    exp: Date.now() + 1000 * 60 * 60 * 24,
  };
  const encoded = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): AuthUser | null {
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed.sub || !parsed.exp || Date.now() > Number(parsed.exp)) return null;
    const found = usersStore.find((u) => u.id === parsed.sub);
    if (!found) return null;
    return {
      id: found.id,
      fullName: found.fullName,
      email: found.email,
      tier: found.tier,
      createdAt: found.createdAt,
    };
  } catch {
    return null;
  }
}

function extractBearerUser(req: express.Request): AuthUser | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return verifySessionToken(authHeader.slice(7).trim());
}

const notificationsStore: NotificationEvent[] = [
  {
    id: 'notif-01',
    topic: 'boarding.call',
    title: 'Priority Boarding Open · AM 502',
    message: 'London Heathrow (LHR) Gate A08 is now boarding Group 1 & Platinum flyers.',
    pnr: 'AM8F2K',
    flightNumber: 'AM 502',
    severity: 'info',
    timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    read: false,
  },
  {
    id: 'notif-02',
    topic: 'flight.delay.alert',
    title: 'Schedule Update · AM 612 (+25 min)',
    message: 'Dubai (DXB) to Mumbai (BOM) adjusted to 03:50 due to headwind routing. Gate remains B09.',
    pnr: 'AM4R9Q',
    flightNumber: 'AM 612',
    severity: 'warning',
    timestamp: new Date(Date.now() - 1000 * 60 * 52).toISOString(),
    read: false,
  },
];

// Helper: Pure fare calculation engine (fare-luggage-svc)
function calculateFare(
  basePriceUsd: number,
  cabin: CabinClass,
  luggage: LuggageConfig,
  currency: CurrencyCode,
  passengers: number,
  lowBandwidth: boolean
): FareBreakdown {
  const fx = CURRENCY_RATES[currency] || CURRENCY_RATES.USD;
  const cabinMultipliers: Record<CabinClass, number> = {
    economy: 1,
    premium: 1.48,
    business: 2.65,
    first: 4.1,
  };
  const multiplier = cabinMultipliers[cabin] ?? 1;
  const baseUsd = basePriceUsd;
  const cabinUpgradeUsd = Math.round((basePriceUsd * multiplier - basePriceUsd) * 100) / 100;
  const subtotalFlightUsd = baseUsd + cabinUpgradeUsd;
  const taxesUsd = Math.round((subtotalFlightUsd * 0.14 + 28) * 100) / 100;

  const carryOnFeeUsd = luggage.carryOnCount > 1 ? (luggage.carryOnCount - 1) * 24 : 0;
  const checkedBasePerBagUsd = cabin === 'business' || cabin === 'first' ? 0 : 42;
  const checkedLuggageFeeUsd = luggage.checkedBagsCount * checkedBasePerBagUsd;
  const weightSurchargeUsd =
    luggage.checkedBagsCount > 0 && luggage.bagWeightKg > 23
      ? luggage.checkedBagsCount * 35
      : luggage.checkedBagsCount > 0 && luggage.bagWeightKg <= 15
      ? -luggage.checkedBagsCount * 8
      : 0;
  const priorityUsd = (luggage.priorityHandling ? 18 : 0) + (luggage.sportsEquipment ? 55 : 0);

  const perPaxWithoutLuggageUsd = subtotalFlightUsd + taxesUsd;
  const perPaxWithLuggageUsd =
    perPaxWithoutLuggageUsd + carryOnFeeUsd + checkedLuggageFeeUsd + weightSurchargeUsd + priorityUsd;

  const round = (val: number) => (currency === 'JPY' ? Math.round(val * fx.rate) : Math.round(val * fx.rate * 100) / 100);

  const totalWithoutLuggage = round(perPaxWithoutLuggageUsd * passengers);
  const totalWithLuggage = round(perPaxWithLuggageUsd * passengers);

  return {
    currency,
    fxRate: fx.rate,
    baseFare: round(baseUsd * passengers),
    cabinUpgrade: round(cabinUpgradeUsd * passengers),
    taxesAndFees: round(taxesUsd * passengers),
    carryOnFee: round(carryOnFeeUsd * passengers),
    checkedLuggageFee: round(checkedLuggageFeeUsd * passengers),
    weightSurcharge: round(weightSurchargeUsd * passengers),
    priorityFee: round(priorityUsd * passengers),
    totalWithoutLuggage,
    totalWithLuggage,
    luggageDelta: Math.round((totalWithLuggage - totalWithoutLuggage) * 100) / 100,
    perPassengerTotal: round(perPaxWithLuggageUsd),
    passengers,
    payloadBytesSavedInLowBandwidth: lowBandwidth ? 1480 : 0,
  };
}

function signQrPayload(payload: string): string {
  return crypto.createHmac('sha256', QR_SECRET).update(payload).digest('hex').slice(0, 16).toUpperCase();
}

async function generateBookingQr(pnr: string, flightNumber: string, seat: string, gate: string, passengerName: string) {
  const payload = `AM1|${pnr}|${flightNumber.replace(/\s+/g, '')}|${seat}|${gate}|${passengerName.toUpperCase().slice(0, 18)}`;
  const signature = signQrPayload(payload);
  const fullToken = `${payload}|SIG:${signature}`;
  const qrDataUrl = await QRCode.toDataURL(fullToken, {
    width: 240,
    margin: 1,
    color: { dark: '#0B1220', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });
  return { qrPayload: fullToken, qrSignature: signature, qrDataUrl };
}

// Seed realistic initial bookings with ride history
const bookingsStore: BookingRecord[] = [];

async function seedBookings() {
  const f1 = FLIGHTS_CATALOG[0];
  const f2 = FLIGHTS_CATALOG[2];
  const f3 = FLIGHTS_CATALOG[5];

  const qr1 = await generateBookingQr('AM9X4L', f1.flightNumber, '14A', f1.gate, 'Rahul Yadav');
  const qr2 = await generateBookingQr('AM8F2K', f2.flightNumber, '04F', f2.gate, 'Rahul Yadav');
  const qr3 = await generateBookingQr('AM4R9Q', f3.flightNumber, '22C', f3.gate, 'Rahul Yadav');

  bookingsStore.push(
    {
      pnr: 'AM8F2K',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      flight: f2,
      travelDate: '2026-11-22',
      cabin: 'business',
      passenger: {
        fullName: 'Rahul Yadav',
        email: 'rahul.yadav@aeromesh.io',
        passportNumber: 'Z8492014',
        frequentFlyerId: 'AM-PLAT-88412',
        seat: '04F',
        boardingGroup: 'Group 1 · Priority',
      },
      luggage: { carryOnCount: 1, checkedBagsCount: 1, bagWeightKg: 23, priorityHandling: true, sportsEquipment: false },
      fare: calculateFare(f2.basePriceUsd, 'business', { carryOnCount: 1, checkedBagsCount: 1, bagWeightKg: 23, priorityHandling: true, sportsEquipment: false }, 'USD', 1, false),
      payment: { transactionId: 'TXN-992104', method: 'Visa Infinite ·••• 4242', currency: 'USD', amountPaid: 547.25, status: 'Settled' },
      ...qr2,
      rideTransfer: {
        provider: 'AeroMesh Rail & EV Pod',
        pickupPoint: 'LHR T2 Express Bay 3',
        etaMinutes: 8,
        vehicleCode: 'EV-409',
      },
    },
    {
      pnr: 'AM9X4L',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
      flight: { ...f1, status: 'Completed' },
      travelDate: '2026-11-08',
      cabin: 'economy',
      passenger: {
        fullName: 'Rahul Yadav',
        email: 'rahul.yadav@aeromesh.io',
        passportNumber: 'Z8492014',
        frequentFlyerId: 'AM-PLAT-88412',
        seat: '14A',
        boardingGroup: 'Group 2',
      },
      luggage: { carryOnCount: 1, checkedBagsCount: 0, bagWeightKg: 15, priorityHandling: false, sportsEquipment: false },
      fare: calculateFare(f1.basePriceUsd, 'economy', { carryOnCount: 1, checkedBagsCount: 0, bagWeightKg: 15, priorityHandling: false, sportsEquipment: false }, 'EUR', 1, false),
      payment: { transactionId: 'TXN-884019', method: 'Mastercard ·••• 5521', currency: 'EUR', amountPaid: 534.43, status: 'Settled' },
      ...qr1,
    },
    {
      pnr: 'AM4R9Q',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 32).toISOString(),
      flight: f3,
      travelDate: '2026-11-23',
      cabin: 'economy',
      passenger: {
        fullName: 'Rahul Yadav',
        email: 'rahul.yadav@aeromesh.io',
        passportNumber: 'Z8492014',
        frequentFlyerId: 'AM-PLAT-88412',
        seat: '22C',
        boardingGroup: 'Group 3',
      },
      luggage: { carryOnCount: 1, checkedBagsCount: 2, bagWeightKg: 23, priorityHandling: false, sportsEquipment: false },
      fare: calculateFare(f3.basePriceUsd, 'economy', { carryOnCount: 1, checkedBagsCount: 2, bagWeightKg: 23, priorityHandling: false, sportsEquipment: false }, 'INR', 1, false),
      payment: { transactionId: 'TXN-774511', method: 'UPI Instant FX', currency: 'INR', amountPaid: 30067, status: 'Settled' },
      ...qr3,
      rideTransfer: {
        provider: 'BOM Metro Shuttle',
        pickupPoint: 'DXB T3 Metro Link',
        etaMinutes: 5,
        vehicleCode: 'MTR-12',
      },
    }
  );
}

function luhnCheck(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

async function startServer() {
  await seedBookings();

  const dev = process.env.NODE_ENV !== 'production';
  const nextApp = next({ dev, dir: __dirname });
  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();
  const upgradeHandler = nextApp.getUpgradeHandler();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const reqPath = (request.url || '').split('?')[0];
    if (reqPath === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (dev) {
      void upgradeHandler(request, socket, head);
    }
  });
  const wsClients = new Set<WebSocket>();

  function broadcastWs(eventType: string, data: unknown) {
    const frame = JSON.stringify({ type: eventType, data, ts: new Date().toISOString() });
    for (const client of wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(frame);
      }
    }
  }

  function publishKafkaEvent(
    topic: string,
    producerService: string,
    consumerServices: string[],
    key: string,
    summary: string,
    payloadObj: unknown
  ) {
    kafkaOffset += 1;
    const record: KafkaEventRecord = {
      offset: kafkaOffset,
      topic,
      partition: kafkaOffset % 3,
      producerService,
      consumerServices,
      key,
      payloadSizeBytes: Buffer.byteLength(JSON.stringify(payloadObj || {}), 'utf8'),
      timestamp: new Date().toISOString(),
      summary,
    };
    kafkaEventLog.unshift(record);
    if (kafkaEventLog.length > 50) kafkaEventLog.pop();
    broadcastWs('kafka:event', record);
    return record;
  }

  // Seed initial Kafka broker log
  publishKafkaEvent('booking.created', 'booking-svc', ['qr-boarding-svc', 'notification-svc', 'travel-analytics-svc'], 'AM8F2K', 'Confirmed PNR AM8F2K (LHR -> ZRH)', { pnr: 'AM8F2K' });
  publishKafkaEvent('flight.delay.alert', 'notification-svc', ['api-gateway-bff', 'offline-map-svc'], 'AM612', 'AM 612 DXB -> BOM delayed +25m', { flight: 'AM 612' });

  wss.on('connection', (ws) => {
    wsClients.add(ws);
    ws.send(
      JSON.stringify({
        type: 'ws:init',
        data: {
          notifications: notificationsStore.slice(0, 10),
          kafkaEvents: kafkaEventLog.slice(0, 12),
        },
      })
    );
    ws.on('close', () => {
      wsClients.delete(ws);
    });
  });

  // 1. api-gateway-bff health
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', servicesOnline: 10, broker: 'kafka-inproc-v3', wsClients: wsClients.size });
  });

  // 2. station-search-svc: Autocomplete & Flight search
  app.get('/api/stations', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const countryFilter = String(req.query.country || '').trim().toLowerCase();
    const lowBw = req.headers['x-bandwidth-mode'] === 'low';
    const filtered = STATIONS.filter((s) => {
      if (countryFilter && s.country.toLowerCase() !== countryFilter) return false;
      if (!q) return true;
      return (
        s.code.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.country.toLowerCase().includes(q)
      );
    });

    const payload = lowBw
      ? filtered.slice(0, 12).map((s) => ({ code: s.code, city: s.city, name: s.name, country: s.country }))
      : filtered.slice(0, 15);

    res.json({ stations: payload, count: payload.length });
  });

  app.get('/api/flights/search', (req, res) => {
    const from = String(req.query.from || '').trim().toUpperCase();
    const to = String(req.query.to || '').trim().toUpperCase();
    const lowBw = req.headers['x-bandwidth-mode'] === 'low';

    let matches = FLIGHTS_CATALOG.filter((f) => (!from || f.from === from) && (!to || f.to === to));

    // Dynamically construct direct/express route if user chooses any valid station pair not pre-seeded
    if (matches.length === 0 && from && to && from !== to) {
      const origin = STATIONS.find((s) => s.code === from);
      const dest = STATIONS.find((s) => s.code === to);
      if (origin && dest) {
        const dLat = (dest.lat - origin.lat) * 111;
        const dLng = (dest.lng - origin.lng) * 85;
        const distKm = Math.max(320, Math.round(Math.hypot(dLat, dLng)));
        const durationMin = Math.max(70, Math.round((distKm / 820) * 60 + 35));
        const basePrice = Math.max(125, Math.round(95 + distKm * 0.082));

        matches = [
          {
            id: `AM-${from}${to}-1`,
            flightNumber: `AM ${110 + ((from.charCodeAt(0) + to.charCodeAt(0)) % 850)}`,
            airline: 'AeroMesh Global',
            airlineCode: 'AM',
            from,
            to,
            departureTime: '09:30',
            arrivalTime: durationMin > 480 ? '21:15+1' : '14:45',
            durationMinutes: durationMin,
            distanceKm: distKm,
            aircraft: distKm > 3500 ? 'Airbus A350-900' : 'Airbus A220-300',
            terminal: origin.terminals[0] || 'T1',
            gate: 'B14',
            status: 'On Time',
            basePriceUsd: basePrice,
            stops: 0,
            co2Kg: Math.round(distKm * 0.075),
            seatsRemaining: 12,
          },
          {
            id: `AM-${from}${to}-2`,
            flightNumber: `AM ${420 + ((from.charCodeAt(1) + to.charCodeAt(1)) % 500)}`,
            airline: 'AeroMesh Saver',
            airlineCode: 'AS',
            from,
            to,
            departureTime: '17:50',
            arrivalTime: '23:10',
            durationMinutes: durationMin + 25,
            distanceKm: distKm,
            aircraft: 'Boeing 787-9',
            terminal: origin.terminals[origin.terminals.length - 1] || 'T2',
            gate: 'C07',
            status: 'On Time',
            basePriceUsd: Math.round(basePrice * 0.87),
            stops: distKm > 6000 ? 1 : 0,
            co2Kg: Math.round(distKm * 0.071),
            seatsRemaining: 6,
          },
        ];
      }
    }

    publishKafkaEvent(
      'flight.search.queried',
      'station-search-svc',
      ['fare-luggage-svc', 'travel-analytics-svc'],
      `${from || 'ANY'}-${to || 'ANY'}`,
      `Queried ${matches.length} flights for ${from || 'ALL'} -> ${to || 'ALL'}`,
      { from, to, lowBw }
    );

    res.json({ flights: matches, optimizedForLowBandwidth: lowBw });
  });

  // 3. fare-luggage-svc: Dynamic fare with vs without luggage
  app.post('/api/fares/calculate', (req, res) => {
    const { basePriceUsd = 350, cabin = 'economy', luggage, currency = 'USD', passengers = 1 } = req.body || {};
    const lowBw = req.headers['x-bandwidth-mode'] === 'low';
    const safeLuggage: LuggageConfig = {
      carryOnCount: Number(luggage?.carryOnCount ?? 1),
      checkedBagsCount: Number(luggage?.checkedBagsCount ?? 0),
      bagWeightKg: Number(luggage?.bagWeightKg ?? 23),
      priorityHandling: Boolean(luggage?.priorityHandling ?? false),
      sportsEquipment: Boolean(luggage?.sportsEquipment ?? false),
    };
    const breakdown = calculateFare(
      Number(basePriceUsd),
      cabin as CabinClass,
      safeLuggage,
      currency as CurrencyCode,
      Math.max(1, Number(passengers)),
      lowBw
    );

    publishKafkaEvent(
      'fare.calculated',
      'fare-luggage-svc',
      ['booking-svc'],
      `${currency}-${cabin}`,
      `Calculated ${currency} ${breakdown.totalWithLuggage} (${safeLuggage.checkedBagsCount} checked bags)`,
      { currency, totalWithLuggage: breakdown.totalWithLuggage }
    );

    res.json(breakdown);
  });

  app.get('/api/currencies', (_req, res) => {
    res.json({ rates: CURRENCY_RATES });
  });

  // 0. Auth Service (signup, login, session verification)
  const requireAuth: express.RequestHandler = (req, res, next) => {
    const user = extractBearerUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required. Please sign in to book tickets.' });
    }
    (req as express.Request & { authUser?: AuthUser }).authUser = user;
    return next();
  };

  app.post('/api/auth/signup', (req, res) => {
    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (fullName.length < 2) {
      return res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (usersStore.some((u) => u.email === email)) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const newUser: StoredUser = {
      id: `usr-${crypto.randomBytes(4).toString('hex')}`,
      fullName,
      email,
      passwordHash: hashPassword(password),
      tier: 'Gold',
      createdAt: new Date().toISOString(),
    };
    usersStore.push(newUser);

    if (!passengersStore.some((p) => p.email.toLowerCase() === email)) {
      passengersStore.unshift({
        id: `pax-${newUser.id}`,
        fullName: newUser.fullName,
        email: newUser.email,
        phone: '+1 (555) 234-8910',
        passportNumber: `P${Math.floor(1000000 + Math.random() * 8999999)}`,
        nationality: 'International',
        dateOfBirth: '1993-05-12',
        frequentFlyerId: `AM-GLD-${Math.floor(10000 + Math.random() * 89999)}`,
        tier: 'Gold',
        seatPreference: 'Window',
        mealPreference: 'Standard',
        emergencyContact: 'On file',
        savedCards: [{ id: `card-${Date.now()}`, brand: 'Visa Signature', last4: '4242', expiry: '09/28' }],
      });
    }

    const publicUser: AuthUser = {
      id: newUser.id,
      fullName: newUser.fullName,
      email: newUser.email,
      tier: newUser.tier,
      createdAt: newUser.createdAt,
    };
    const token = signSessionToken(publicUser);

    publishKafkaEvent('auth.user.registered', 'passenger-profile-svc', ['notification-svc'], newUser.id, `Registered account ${email}`, { id: newUser.id });

    return res.status(201).json({ token, user: publicUser });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const found = usersStore.find((u) => u.email === email);
    if (!found || !verifyPassword(password, found.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const publicUser: AuthUser = {
      id: found.id,
      fullName: found.fullName,
      email: found.email,
      tier: found.tier,
      createdAt: found.createdAt,
    };
    const token = signSessionToken(publicUser);

    publishKafkaEvent('auth.user.login', 'passenger-profile-svc', ['travel-analytics-svc'], found.id, `Signed in ${email}`, { id: found.id });

    return res.json({ token, user: publicUser });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = (req as express.Request & { authUser?: AuthUser }).authUser;
    res.json({ user });
  });

  // Seat map inventory endpoint (combines flight seed + live booked seats)
  app.get('/api/flights/:flightId/seats', (req, res) => {
    const flightId = String(req.params.flightId || '').trim();
    const travelDate = String(req.query.date || '').trim();
    const seedHash = crypto.createHash('md5').update(flightId).digest();
    const baseOccupied = new Set<string>(['1A', '2D', '4A', '6B', '6E', '8C', '9D', '11B', '11E', '12F', '15A', '15C', '16D', '17E']);
    // Deterministic flight-specific occupied seats
    for (let i = 0; i < 6; i++) {
      const r = (seedHash[i] % 16) + 3;
      const col = ['A', 'B', 'C', 'D', 'E', 'F'][seedHash[i + 6] % 6];
      baseOccupied.add(`${r}${col}`);
    }
    // Merge live booked seats on this flight
    for (const b of bookingsStore) {
      if (b.flight.id === flightId && (!travelDate || b.travelDate === travelDate)) {
        baseOccupied.add(b.passenger.seat);
      }
    }
    res.json({ flightId, occupiedSeats: Array.from(baseOccupied) });
  });

  // 4. passenger-profile-svc: Auto-fill & Saved Profiles
  app.get('/api/passengers', (_req, res) => {
    res.json({ passengers: passengersStore });
  });

  app.post('/api/passengers', requireAuth, (req, res) => {
    const incoming = req.body as Partial<PassengerProfile>;
    if (!incoming.fullName || !incoming.email) {
      return res.status(400).json({ error: 'fullName and email are required' });
    }
    const existingIdx = passengersStore.findIndex((p) => p.id === incoming.id || p.email === incoming.email);
    const saved: PassengerProfile = {
      id: incoming.id || `pax-${Date.now()}`,
      fullName: incoming.fullName,
      email: incoming.email,
      phone: incoming.phone || '+1 (555) 019-2834',
      passportNumber: incoming.passportNumber || 'P0000000',
      nationality: incoming.nationality || 'International',
      dateOfBirth: incoming.dateOfBirth || '1992-01-01',
      frequentFlyerId: incoming.frequentFlyerId || `AM-SLV-${Math.floor(10000 + Math.random() * 89999)}`,
      tier: incoming.tier || 'Silver',
      seatPreference: incoming.seatPreference || 'Window',
      mealPreference: incoming.mealPreference || 'Standard',
      emergencyContact: incoming.emergencyContact || 'On file',
      savedCards: incoming.savedCards || [{ id: `card-${Date.now()}`, brand: 'Visa', last4: '4242', expiry: '12/28' }],
    };
    if (existingIdx >= 0) {
      passengersStore[existingIdx] = saved;
    } else {
      passengersStore.unshift(saved);
    }
    publishKafkaEvent('profile.updated', 'passenger-profile-svc', ['booking-svc'], saved.id, `Updated profile for ${saved.fullName}`, { id: saved.id });
    return res.json({ passenger: saved });
  });

  // 5. payment-gateway-svc: Multi-currency payment authorization (protected)
  app.post('/api/payments/authorize', requireAuth, (req, res) => {
    const { idempotencyKey, method, cardNumber, currency, amount } = req.body || {};
    if (!currency || !amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Valid currency and positive amount are required.' });
    }

    if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
      return res.json(idempotencyStore.get(idempotencyKey));
    }

    if (method === 'new-card') {
      const cleanDigits = String(cardNumber || '').replace(/\D/g, '');
      if (!luhnCheck(cleanDigits)) {
        return res.status(422).json({ error: 'Card validation failed (invalid card number checksum).' });
      }
    }

    const tx = {
      transactionId: `TXN-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      status: 'Authorized' as const,
      amountPaid: Number(amount),
      currency: currency as CurrencyCode,
    };

    if (idempotencyKey) {
      idempotencyStore.set(idempotencyKey, tx);
    }

    publishKafkaEvent(
      'payment.authorized',
      'payment-gateway-svc',
      ['booking-svc', 'notification-svc', 'travel-analytics-svc'],
      tx.transactionId,
      `Authorized ${currency} ${amount} via ${method || 'saved-card'}`,
      tx
    );

    return res.json(tx);
  });

  // 6. booking-svc + qr-boarding-svc: Create booking & emit signed QR pass
  app.get('/api/bookings', (_req, res) => {
    res.json({ bookings: bookingsStore });
  });

  app.post('/api/bookings', requireAuth, async (req, res) => {
    try {
      const { flight, travelDate, cabin, passenger, luggage, currency, passengersCount, payment } = req.body || {};
      if (!flight || !passenger?.fullName) {
        return res.status(400).json({ error: 'Flight and passenger details are required.' });
      }
      const pnr = `AM${crypto.randomBytes(2).toString('hex').toUpperCase()}${Math.floor(10 + Math.random() * 89)}`;
      const requestedSeat = String(passenger?.seat || '').trim().toUpperCase();
      const seatRow = Math.floor(4 + Math.random() * 26);
      const seatCol = passenger.seatPreference === 'Aisle' ? 'C' : 'A';
      const seat = /^[1-9]\d?[A-F]$/.test(requestedSeat) ? requestedSeat : `${seatRow}${seatCol}`;
      const boardingGroup = cabin === 'first' || cabin === 'business' || luggage?.priorityHandling ? 'Group 1 · Priority' : 'Group 2';

      const fare = calculateFare(
        Number(flight.basePriceUsd),
        (cabin || 'economy') as CabinClass,
        luggage,
        (currency || 'USD') as CurrencyCode,
        Number(passengersCount || 1),
        false
      );

      const qrData = await generateBookingQr(pnr, flight.flightNumber, seat, flight.gate || 'A12', passenger.fullName);

      const newBooking: BookingRecord = {
        pnr,
        createdAt: new Date().toISOString(),
        flight: flight as FlightOption,
        travelDate: travelDate || new Date().toISOString().slice(0, 10),
        cabin: (cabin || 'economy') as CabinClass,
        passenger: {
          fullName: passenger.fullName,
          email: passenger.email || 'traveler@aeromesh.io',
          passportNumber: passenger.passportNumber || 'PASS-9910',
          frequentFlyerId: passenger.frequentFlyerId,
          seat,
          boardingGroup,
        },
        luggage,
        fare,
        payment: {
          transactionId: payment?.transactionId || `TXN-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          method: payment?.method || 'Visa Infinite ·••• 4242',
          currency: fare.currency,
          amountPaid: fare.totalWithLuggage,
          status: 'Settled',
        },
        ...qrData,
        rideTransfer: {
          provider: 'AeroMesh Terminal Shuttle',
          pickupPoint: `${flight.to} Arrivals Bay 2`,
          etaMinutes: 6,
          vehicleCode: `EV-${Math.floor(100 + Math.random() * 899)}`,
        },
      };

      bookingsStore.unshift(newBooking);

      publishKafkaEvent(
        'booking.created',
        'booking-svc',
        ['qr-boarding-svc', 'notification-svc', 'travel-analytics-svc'],
        pnr,
        `Booking ${pnr} issued (${flight.from} -> ${flight.to})`,
        { pnr, amount: fare.totalWithLuggage, currency: fare.currency }
      );
      publishKafkaEvent(
        'ticket.qr.issued',
        'qr-boarding-svc',
        ['api-gateway-bff'],
        pnr,
        `HMAC-SHA256 QR pass generated for seat ${seat}`,
        { pnr, signature: qrData.qrSignature }
      );

      const notif: NotificationEvent = {
        id: `notif-${Date.now()}`,
        topic: 'booking.created',
        title: `Ticket Confirmed · ${pnr}`,
        message: `${flight.flightNumber} (${flight.from} → ${flight.to}) seat ${seat} is ready for offline QR boarding.`,
        pnr,
        flightNumber: flight.flightNumber,
        severity: 'success',
        timestamp: new Date().toISOString(),
        read: false,
      };
      notificationsStore.unshift(notif);
      broadcastWs('notification:new', notif);
      broadcastWs('booking:created', newBooking);

      return res.status(201).json({ booking: newBooking });
    } catch (err) {
      return res.status(500).json({ error: 'Booking orchestration failed.' });
    }
  });

  app.post('/api/tickets/verify', (req, res) => {
    const { qrPayload } = req.body || {};
    if (!qrPayload || typeof qrPayload !== 'string') {
      return res.status(400).json({ valid: false, reason: 'Missing QR token' });
    }
    const sigMarker = '|SIG:';
    const idx = qrPayload.indexOf(sigMarker);
    if (idx === -1) {
      return res.json({ valid: false, reason: 'Unsigned payload' });
    }
    const core = qrPayload.slice(0, idx);
    const providedSig = qrPayload.slice(idx + sigMarker.length);
    const expectedSig = signQrPayload(core);
    return res.json({
      valid: providedSig === expectedSig,
      expectedSig,
      providedSig,
      parts: core.split('|'),
    });
  });

  // 7. notification-svc: Live push & delay simulation
  app.get('/api/notifications', (_req, res) => {
    res.json({ notifications: notificationsStore });
  });

  app.post('/api/notifications/simulate', (req, res) => {
    const { kind = 'delay', pnr } = req.body || {};
    const targetBooking = bookingsStore.find((b) => b.pnr === pnr) || bookingsStore[0];
    const flightNo = targetBooking?.flight.flightNumber || 'AM 502';
    const targetPnr = targetBooking?.pnr || 'AM8F2K';

    let notif: NotificationEvent;
    if (kind === 'gate') {
      const newGate = ['C18', 'B27', 'A04', 'D11'][Math.floor(Math.random() * 4)];
      if (targetBooking) {
        targetBooking.flight = { ...targetBooking.flight, gate: newGate, status: 'Gate Changed' };
      }
      notif = {
        id: `notif-${Date.now()}`,
        topic: 'gate.changed',
        title: `Gate Change · ${flightNo}`,
        message: `Departure moved to Gate ${newGate}. Offline terminal map updated automatically.`,
        pnr: targetPnr,
        flightNumber: flightNo,
        severity: 'alert',
        timestamp: new Date().toISOString(),
        read: false,
      };
    } else if (kind === 'ride') {
      notif = {
        id: `notif-${Date.now()}`,
        topic: 'ride.transfer.update',
        title: `Airport EV Transfer Arriving · ${targetBooking?.rideTransfer?.vehicleCode || 'EV-409'}`,
        message: `Your transit shuttle is 2 minutes away at ${targetBooking?.rideTransfer?.pickupPoint || 'Arrivals Bay 2'}. Scan QR pass on entry.`,
        pnr: targetPnr,
        flightNumber: flightNo,
        severity: 'info',
        timestamp: new Date().toISOString(),
        read: false,
      };
    } else {
      if (targetBooking) {
        targetBooking.flight = { ...targetBooking.flight, status: 'Delayed' };
      }
      notif = {
        id: `notif-${Date.now()}`,
        topic: 'flight.delay.alert',
        title: `Flight Delay Alert · ${flightNo} (+20 min)`,
        message: `Air traffic spacing delay on ${targetBooking?.flight.from || 'LHR'} → ${targetBooking?.flight.to || 'ZRH'}. Connecting shuttle adjusted.`,
        pnr: targetPnr,
        flightNumber: flightNo,
        severity: 'warning',
        timestamp: new Date().toISOString(),
        read: false,
      };
    }

    notificationsStore.unshift(notif);
    publishKafkaEvent(
      notif.topic,
      'notification-svc',
      ['api-gateway-bff', 'offline-map-svc'],
      targetPnr,
      notif.title,
      notif
    );
    broadcastWs('notification:new', notif);
    if (targetBooking) {
      broadcastWs('booking:updated', targetBooking);
    }

    res.json({ notification: notif, booking: targetBooking });
  });

  // 8. travel-analytics-svc: Frequent traveler analytics
  app.get('/api/analytics', (_req, res) => {
    const totalTrips = bookingsStore.length + 11; // Includes historical archived trips
    const dynamicDistance = bookingsStore.reduce((acc, b) => acc + b.flight.distanceKm, 0);
    const totalDistanceKm = dynamicDistance + 38420;
    const totalFlightHours = Math.round(totalDistanceKm / 795);
    const delayedCount = bookingsStore.filter((b) => b.flight.status === 'Delayed').length + 1;
    const onTimeRatePercent = Math.round(((totalTrips - delayedCount) / totalTrips) * 1000) / 10;

    const totalSpendUsd = Math.round(
      bookingsStore.reduce((acc, b) => acc + b.fare.totalWithLuggage / (CURRENCY_RATES[b.fare.currency]?.rate || 1), 0) + 4620
    );
    const luggageSavingsUsd = bookingsStore.reduce((acc, b) => (b.luggage.checkedBagsCount === 0 ? acc + 42 : acc), 294);
    const co2MetricTons = Math.round(((bookingsStore.reduce((acc, b) => acc + b.flight.co2Kg, 0) + 3120) / 1000) * 100) / 100;

    const summary: AnalyticsSummary = {
      totalTrips,
      totalDistanceKm,
      totalFlightHours,
      onTimeRatePercent,
      delayedCount,
      totalSpendUsd,
      luggageSavingsUsd,
      co2MetricTons,
      monthlyActivity: [
        { month: 'Jun', trips: 2, spendUsd: 890, distanceKm: 6400 },
        { month: 'Jul', trips: 3, spendUsd: 1420, distanceKm: 11200 },
        { month: 'Aug', trips: 1, spendUsd: 480, distanceKm: 3100 },
        { month: 'Sep', trips: 3, spendUsd: 1640, distanceKm: 12900 },
        { month: 'Oct', trips: 2, spendUsd: 970, distanceKm: 7200 },
        { month: 'Nov', trips: bookingsStore.length, spendUsd: totalSpendUsd - 5400 > 300 ? totalSpendUsd - 5400 : 1240, distanceKm: dynamicDistance },
      ],
      cabinDistribution: [
        { cabin: 'Economy Light', count: 7, percent: 50 },
        { cabin: 'Economy Flex', count: 3, percent: 21 },
        { cabin: 'Business', count: 3, percent: 21 },
        { cabin: 'First', count: 1, percent: 8 },
      ],
      topRoutes: [
        { route: 'JFK → LHR', count: 4, avgFareUsd: 485 },
        { route: 'LHR → ZRH', count: 3, avgFareUsd: 215 },
        { route: 'DXB → BOM', count: 3, avgFareUsd: 245 },
        { route: 'SIN → HND', count: 2, avgFareUsd: 510 },
      ],
      currencySpend: [
        { currency: 'USD', amount: 3420, sharePercent: 58 },
        { currency: 'EUR', amount: 1480, sharePercent: 25 },
        { currency: 'INR', amount: 64200, sharePercent: 11 },
        { currency: 'GBP', amount: 310, sharePercent: 6 },
      ],
    };

    res.json(summary);
  });

  // 9. offline-map-svc: Regional offline map packs
  app.get('/api/maps/packs', (_req, res) => {
    res.json({ packs: OFFLINE_MAP_PACKS });
  });

  app.get('/api/maps/packs/:region', (req, res) => {
    const region = String(req.params.region || '').toUpperCase();
    const pack = OFFLINE_MAP_PACKS.find((p) => p.region === region);
    if (!pack) return res.status(404).json({ error: 'Region pack not found' });
    publishKafkaEvent('map.pack.synced', 'offline-map-svc', ['api-gateway-bff'], region, `Synced offline vector pack ${region} (${pack.sizeKb} KB)`, { region });
    return res.json({ pack });
  });

  // 10. Kafka Broker Inspector endpoint
  app.get('/api/events/kafka', (_req, res) => {
    res.json({ events: kafkaEventLog });
  });

  // Legacy Vite PWA service worker kill-switch so returning browsers unregister old Workbox cache
  app.get('/dev-sw.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.resolve(__dirname, 'public/dev-sw.js'));
  });

  // Next.js App Router Frontend handler (handles SSR, static assets, and client routes)
  app.all('*', (req, res) => {
    return handle(req, res);
  });

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`AeroMesh Next.js + Express + WebSocket Broker listening on http://0.0.0.0:${port}`);
  });
}

startServer();
