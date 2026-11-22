export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'INR' | 'SGD' | 'AED';

export type LanguageCode = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'hi';

export type CabinClass = 'economy' | 'premium' | 'business' | 'first';

export type FlightStatus = 'On Time' | 'Boarding' | 'Delayed' | 'Gate Changed' | 'Completed';

export interface Station {
  code: string;
  name: string;
  city: string;
  country: string;
  region: 'NA' | 'EU' | 'APAC' | 'MEA';
  type: 'airport' | 'rail_hub';
  terminals: string[];
  transitLink: string;
  lat: number;
  lng: number;
  mapX: number;
  mapY: number;
  timezone: string;
}

export interface FlightOption {
  id: string;
  flightNumber: string;
  airline: string;
  airlineCode: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  distanceKm: number;
  aircraft: string;
  terminal: string;
  gate: string;
  status: FlightStatus;
  basePriceUsd: number;
  stops: number;
  co2Kg: number;
  seatsRemaining: number;
}

export interface LuggageConfig {
  carryOnCount: number;
  checkedBagsCount: number;
  bagWeightKg: number; // 15, 23, or 32
  priorityHandling: boolean;
  sportsEquipment: boolean;
}

export interface FareBreakdown {
  currency: CurrencyCode;
  fxRate: number;
  baseFare: number;
  cabinUpgrade: number;
  taxesAndFees: number;
  carryOnFee: number;
  checkedLuggageFee: number;
  weightSurcharge: number;
  priorityFee: number;
  totalWithoutLuggage: number;
  totalWithLuggage: number;
  luggageDelta: number;
  perPassengerTotal: number;
  passengers: number;
  payloadBytesSavedInLowBandwidth?: number;
}

export interface PassengerProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  passportNumber: string;
  nationality: string;
  dateOfBirth: string;
  frequentFlyerId: string;
  tier: 'Silver' | 'Gold' | 'Platinum';
  seatPreference: 'Window' | 'Aisle' | 'Extra Legroom';
  mealPreference: 'Standard' | 'Vegetarian' | 'Vegan' | 'Halal' | 'Gluten-Free';
  emergencyContact: string;
  savedCards: {
    id: string;
    brand: string;
    last4: string;
    expiry: string;
  }[];
}

export interface BookingRecord {
  pnr: string;
  createdAt: string;
  flight: FlightOption;
  travelDate: string;
  cabin: CabinClass;
  passenger: {
    fullName: string;
    email: string;
    passportNumber: string;
    frequentFlyerId?: string;
    seat: string;
    boardingGroup: string;
  };
  luggage: LuggageConfig;
  fare: FareBreakdown;
  payment: {
    transactionId: string;
    method: string;
    currency: CurrencyCode;
    amountPaid: number;
    status: 'Authorized' | 'Settled';
  };
  qrPayload: string;
  qrSignature: string;
  qrDataUrl?: string;
  rideTransfer?: {
    provider: string;
    pickupPoint: string;
    etaMinutes: number;
    vehicleCode: string;
  };
}

export interface NotificationEvent {
  id: string;
  topic: 'flight.delay.alert' | 'gate.changed' | 'boarding.call' | 'booking.created' | 'payment.authorized' | 'ride.transfer.update';
  title: string;
  message: string;
  pnr?: string;
  flightNumber?: string;
  severity: 'info' | 'warning' | 'success' | 'alert';
  timestamp: string;
  read: boolean;
}

export interface KafkaEventRecord {
  offset: number;
  topic: string;
  partition: number;
  producerService: string;
  consumerServices: string[];
  key: string;
  payloadSizeBytes: number;
  timestamp: string;
  summary: string;
}

export interface OfflineMapPack {
  region: 'NA' | 'EU' | 'APAC' | 'MEA';
  name: string;
  hubsCount: number;
  corridorsCount: number;
  sizeKb: number;
  version: string;
  stations: Station[];
  routes: { from: string; to: string; distanceKm: number; flightTimeMin: number }[];
  terminalMaps: {
    code: string;
    gates: { id: string; concourse: string; walkMin: number; status: 'Open' | 'Boarding' | 'Delayed' }[];
    transitStops: { name: string; mode: string; frequencyMin: number }[];
  }[];
}

export interface AnalyticsSummary {
  totalTrips: number;
  totalDistanceKm: number;
  totalFlightHours: number;
  onTimeRatePercent: number;
  delayedCount: number;
  totalSpendUsd: number;
  luggageSavingsUsd: number;
  co2MetricTons: number;
  monthlyActivity: { month: string; trips: number; spendUsd: number; distanceKm: number }[];
  cabinDistribution: { cabin: string; count: number; percent: number }[];
  topRoutes: { route: string; count: number; avgFareUsd: number }[];
  currencySpend: { currency: CurrencyCode; amount: number; sharePercent: number }[];
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  tier: 'Silver' | 'Gold' | 'Platinum';
  createdAt: string;
}

export interface AircraftSeat {
  id: string;
  row: number;
  letter: string;
  cabin: CabinClass;
  position: 'Window' | 'Middle' | 'Aisle';
  status: 'available' | 'occupied';
  extraLegroom: boolean;
  feeDeltaUsd: number;
}
