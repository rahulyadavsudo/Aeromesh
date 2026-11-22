export interface MicroserviceSpec {
  id: string;
  name: string;
  domain: string;
  runtime: string;
  protocol: string;
  datastore: string;
  produces: string[];
  consumes: string[];
  endpointPrefix: string;
  description: string;
  goSnippet: string;
}

export const MICROSERVICES_SPECS: MicroserviceSpec[] = [
  {
    id: 'svc-01',
    name: 'api-gateway-bff',
    domain: 'Edge Routing & Compression',
    runtime: 'Next.js 15 / Go Fiber',
    protocol: 'HTTP/3 + WebSocket',
    datastore: 'Redis Edge Cache',
    produces: ['gateway.request.logged'],
    consumes: ['flight.delay.alert', 'boarding.call'],
    endpointPrefix: '/api/*',
    description: 'Handles TLS termination, low-bandwidth Brotli payload stripping, i18n locale headers, and WebSocket fanout.',
    goSnippet: `// Go Fiber Low-Bandwidth Middleware
func BandwidthSaver(c *fiber.Ctx) error {
  if c.Get("X-Bandwidth-Mode") == "low" {
    c.Set("X-Payload-Optimized", "compact-json")
  }
  return c.Next()
}`,
  },
  {
    id: 'svc-02',
    name: 'station-search-svc',
    domain: 'Station Autocomplete & Routing',
    runtime: 'Go 1.23 (Radix Trie)',
    protocol: 'gRPC + REST',
    datastore: 'In-Memory Trie + Redis',
    produces: ['flight.search.queried'],
    consumes: ['schedule.updated'],
    endpointPrefix: '/api/stations & /api/flights/search',
    description: 'Sub-2ms prefix/fuzzy matching for IATA airports, rail hubs, terminals, and transit links.',
    goSnippet: `func (s *SearchServer) Autocomplete(ctx context.Context, req *pb.Query) (*pb.Stations, error) {
  matches := s.radixTrie.PrefixScan(strings.ToUpper(req.Q), 8)
  s.kafka.Emit("flight.search.queried", req.Q)
  return &pb.Stations{Items: matches}, nil
}`,
  },
  {
    id: 'svc-03',
    name: 'fare-luggage-svc',
    domain: 'Dynamic Fare & Baggage Engine',
    runtime: 'Go 1.23',
    protocol: 'gRPC + REST',
    datastore: 'PostgreSQL + Pricing Rules',
    produces: ['fare.calculated'],
    consumes: ['fx.rates.updated'],
    endpointPrefix: '/api/fares/calculate',
    description: 'Computes real-time Light (no luggage) vs. Standard (+checked bag weight tiers) quotes across 7 currencies.',
    goSnippet: `func ComputeFare(baseUSD float64, bags int, weightKg int, rate float64) FareQuote {
  bagFee := float64(bags) * 42.0
  if weightKg > 23 && bags > 0 { bagFee += float64(bags) * 35.0 }
  return FareQuote{Light: baseUSD * rate, WithLuggage: (baseUSD + bagFee) * rate}
}`,
  },
  {
    id: 'svc-04',
    name: 'booking-svc',
    domain: 'PNR Orchestrator & Seat Inventory',
    runtime: 'Go 1.23 (Saga Pattern)',
    protocol: 'REST + Kafka',
    datastore: 'PostgreSQL 17',
    produces: ['booking.created', 'ride.transfer.update'],
    consumes: ['payment.authorized'],
    endpointPrefix: '/api/bookings',
    description: 'Reserves inventory atomically using distributed Saga orchestration and dispatches airport transit rides.',
    goSnippet: `func (b *BookingSaga) Confirm(ctx context.Context, cmd CreateBookingCmd) (Booking, error) {
  pnr := generatePNR()
  b.repo.SaveTx(ctx, pnr, cmd)
  b.kafka.Publish("booking.created", pnr, cmd)
  return Booking{PNR: pnr}, nil
}`,
  },
  {
    id: 'svc-05',
    name: 'payment-gateway-svc',
    domain: 'Multi-Currency Settlement & FX',
    runtime: 'Go 1.23',
    protocol: 'REST (Idempotent)',
    datastore: 'PostgreSQL Ledger',
    produces: ['payment.authorized'],
    consumes: ['booking.pending'],
    endpointPrefix: '/api/payments/authorize',
    description: 'Processes multi-currency cards/wallets with Luhn checks, idempotency keys, and 3DS verification.',
    goSnippet: `func Authorize(idempotencyKey string, currency string, amount float64) (TxReceipt, error) {
  if cached, ok := ledger.CheckKey(idempotencyKey); ok { return cached, nil }
  return ledger.CommitFX(currency, amount)
}`,
  },
  {
    id: 'svc-06',
    name: 'qr-boarding-svc',
    domain: 'Cryptographic Boarding & Entry QR',
    runtime: 'Go 1.23 (HMAC-SHA256)',
    protocol: 'REST + Offline Verify',
    datastore: 'HSM Key Vault',
    produces: ['ticket.qr.issued'],
    consumes: ['booking.created'],
    endpointPrefix: '/api/tickets/qr & /api/tickets/verify',
    description: 'Signs compact offline-verifiable boarding payloads for airport e-gates and airport transfer vehicles.',
    goSnippet: `func SignBoardingPass(pnr, flight, seat string, secret []byte) string {
  mac := hmac.New(sha256.New, secret)
  mac.Write([]byte(pnr + "|" + flight + "|" + seat))
  return hex.EncodeToString(mac.Sum(nil))[:16]
}`,
  },
  {
    id: 'svc-07',
    name: 'notification-svc',
    domain: 'Real-Time Push & Kafka Consumer',
    runtime: 'Go 1.23 + WebPush',
    protocol: 'WebSocket + Web Push API',
    datastore: 'Redis Pub/Sub',
    produces: ['flight.delay.alert', 'gate.changed', 'boarding.call'],
    consumes: ['booking.created', 'payment.authorized', 'flight.delay.alert'],
    endpointPrefix: '/ws & /api/notifications',
    description: 'Streams real-time gate updates, delay alerts, and ride arrival notifications over WebSockets & PWA Push.',
    goSnippet: `func (n *Hub) ConsumeKafkaTopic(msg kafka.Message) {
  event := decodeAlert(msg.Value)
  n.wsBroadcast <- event
  n.webPush.Dispatch(event.PassengerID, event.Title)
}`,
  },
  {
    id: 'svc-08',
    name: 'passenger-profile-svc',
    domain: 'Traveler Identity & Auto-Fill Vault',
    runtime: 'Go 1.23',
    protocol: 'REST + JWT',
    datastore: 'PostgreSQL',
    produces: ['profile.updated'],
    consumes: ['booking.created'],
    endpointPrefix: '/api/passengers',
    description: 'Stores frequent flyer tiers, passport info, preferences, and saved cards for 1-tap checkout auto-fill.',
    goSnippet: `func GetAutofillProfile(userID string) PassengerProfile {
  return vault.DecryptProfile(userID)
}`,
  },
  {
    id: 'svc-09',
    name: 'travel-analytics-svc',
    domain: 'Frequent Flyer Telemetry & Spend',
    runtime: 'Go 1.23 + Aggregator',
    protocol: 'REST + Kafka Stream',
    datastore: 'ClickHouse OLAP',
    produces: ['analytics.aggregated'],
    consumes: ['booking.created', 'payment.authorized', 'flight.delay.alert'],
    endpointPrefix: '/api/analytics',
    description: 'Aggregates distance flown, CO2 footprint, on-time reliability, luggage savings, and currency spend.',
    goSnippet: `func AggregateTravelerStats(paxID string) AnalyticsSummary {
  return clickhouse.QueryRollup("SELECT sum(km), avg(on_time) FROM trips WHERE pax=?", paxID)
}`,
  },
  {
    id: 'svc-10',
    name: 'offline-map-svc',
    domain: 'Vector Tile & Terminal Sync',
    runtime: 'Go 1.23 (GeoJSON)',
    protocol: 'REST + Service Worker Cache',
    datastore: 'Object Storage CDN',
    produces: ['map.pack.synced'],
    consumes: ['gate.changed'],
    endpointPrefix: '/api/maps/packs',
    description: 'Packages ultra-lightweight regional airport & transit vector packs (<200 KB) for offline mobile navigation.',
    goSnippet: `func ServeRegionPack(region string) ([]byte, error) {
  return gzipPack(vectorTiles[region])
}`,
  },
];
