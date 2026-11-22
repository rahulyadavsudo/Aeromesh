export type ServiceLanguage = 'Next.js' | 'Go' | 'Rust' | 'Java' | 'Python';

export interface MicroserviceSpec {
  id: string;
  name: string;
  domain: string;
  language: ServiceLanguage;
  runtime: string;
  protocol: string;
  datastore: string;
  produces: string[];
  consumes: string[];
  endpointPrefix: string;
  repoPath: string;
  sloTargetMs: number;
  bestPractices: string[];
  description: string;
  codeSnippet: string;
}

export const MICROSERVICES_SPECS: MicroserviceSpec[] = [
  {
    id: 'svc-01',
    name: 'api-gateway-bff',
    domain: 'Edge SSR & Low-Bandwidth BFF',
    language: 'Next.js',
    runtime: 'Next.js 16 (App Router) + Node 22',
    protocol: 'HTTP/3 + WebSocket',
    datastore: 'Redis Edge Cache',
    produces: ['gateway.request.logged'],
    consumes: ['flight.delay.alert', 'boarding.call'],
    endpointPrefix: '/api/* & /*',
    repoPath: 'src/app/layout.tsx + server.ts',
    sloTargetMs: 35,
    bestPractices: ['SSR + Hydration Safety', 'Brotli / Compact JSON', 'OpenTelemetry traceparent', 'PWA Service Worker'],
    description: 'Serves the Next.js App Router frontend, strips heavy payloads in low-bandwidth mode, enforces Bearer auth, and fans out Kafka WebSocket streams.',
    codeSnippet: `// Next.js 16 + Express BFF Edge Gateway (server.ts)
const nextApp = next({ dev, dir: __dirname });
await nextApp.prepare();
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', servicesOnline: 14, runtimes: ['Next.js 16', 'Go', 'Rust', 'Java', 'Python'] })
);`,
  },
  {
    id: 'svc-02',
    name: 'station-search-svc',
    domain: 'Airport Autocomplete & Routing',
    language: 'Go',
    runtime: 'Go 1.23 (net/http + slog)',
    protocol: 'gRPC + REST',
    datastore: 'In-Memory Radix Trie + Redis',
    produces: ['flight.search.queried'],
    consumes: ['schedule.updated'],
    endpointPrefix: '/api/stations & /api/flights/search',
    repoPath: 'services/station-search-svc-go/main.go',
    sloTargetMs: 5,
    bestPractices: ['Zero-Dep Stdlib HTTP', 'Graceful SIGTERM Shutdown', 'JSON Structured Logging (slog)', '/healthz Readiness Probe'],
    description: 'Sub-5ms prefix matching across global & 12 Indian airport hubs with metro links and low-bandwidth field projection.',
    codeSnippet: `// Go 1.23 Graceful Shutdown + Structured JSON Logs
srv := &http.Server{Addr: ":8082", Handler: mux, ReadHeaderTimeout: 3 * time.Second}
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
_ = srv.Shutdown(ctx)`,
  },
  {
    id: 'svc-03',
    name: 'fare-luggage-svc',
    domain: 'Dynamic Fare & Baggage Engine',
    language: 'Rust',
    runtime: 'Rust 1.82 (Axum + Tokio)',
    protocol: 'gRPC + REST',
    datastore: 'PostgreSQL + Pricing Rules',
    produces: ['fare.calculated'],
    consumes: ['fx.rates.updated'],
    endpointPrefix: '/api/fares/calculate',
    repoPath: 'services/fare-luggage-svc-rust/src/main.rs',
    sloTargetMs: 3,
    bestPractices: ['Zero-Allocation Math', 'Tower Request Timeout Layer', 'Traceparent Propagation', 'Memory-Safe Checked Arithmetic'],
    description: 'Computes Light (no luggage) vs. Standard (+bag weight tiers, priority, sports gear) quotes across 7 currencies with deterministic rounding.',
    codeSnippet: `// Rust Axum Timeout + Zero-Allocation Baggage Quote
let total_light = ((base_usd + taxes_usd) * pax * req.fx_rate * 100.0).round() / 100.0;
let app = Router::new()
    .route("/api/fares/calculate", post(calculate_fare))
    .layer(TimeoutLayer::new(Duration::from_secs(3)));`,
  },
  {
    id: 'svc-04',
    name: 'booking-svc',
    domain: 'PNR Orchestrator & Seat Inventory',
    language: 'Java',
    runtime: 'Java 21 (Spring Boot 3.4)',
    protocol: 'REST + Kafka Saga',
    datastore: 'PostgreSQL 17',
    produces: ['booking.created', 'ride.transfer.update'],
    consumes: ['payment.authorized'],
    endpointPrefix: '/api/bookings',
    repoPath: 'services/booking-svc-java/src/main/java/com/aeromesh/booking/BookingSagaController.java',
    sloTargetMs: 45,
    bestPractices: ['Saga Pattern + Outbox', 'Idempotency-Key Header', '@Transactional Consistency', 'Spring Actuator /health'],
    description: 'Reserves aircraft seat inventory atomically using distributed Saga orchestration and publishes confirmed PNRs to Kafka.',
    codeSnippet: `@PostMapping
@Transactional
public ResponseEntity<Map<String, Object>> confirmBooking(
    @RequestHeader(value = "Idempotency-Key", required = false) String key,
    @RequestBody Map<String, Object> cmd) {
  String pnr = generatePnr();
  kafkaTemplate.send("booking.created", pnr, cmd);
  return ResponseEntity.status(201).body(Map.of("pnr", pnr, "status", "Confirmed"));
}`,
  },
  {
    id: 'svc-05',
    name: 'payment-gateway-svc',
    domain: 'Multi-Currency Settlement & FX',
    language: 'Java',
    runtime: 'Java 21 (Spring Boot 3.4)',
    protocol: 'REST (Idempotent Ledger)',
    datastore: 'PostgreSQL Ledger',
    produces: ['payment.authorized'],
    consumes: ['booking.pending'],
    endpointPrefix: '/api/payments/authorize',
    repoPath: 'services/payment-gateway-svc-java/src/main/java/com/aeromesh/payment/PaymentLedgerController.java',
    sloTargetMs: 60,
    bestPractices: ['Strict Idempotency Ledger', 'BigDecimal Precision FX', 'Luhn Card Check', 'Kafka Dead-Letter Queue'],
    description: 'Executes multi-currency settlement in USD, EUR, GBP, JPY, INR, SGD, and AED with replay-safe idempotency keys.',
    codeSnippet: `if (idempotentLedger.containsKey(idempotencyKey)) {
  return ResponseEntity.ok(idempotentLedger.get(idempotencyKey));
}
BigDecimal amount = new BigDecimal(String.valueOf(req.get("amount")));
kafkaTemplate.send("payment.authorized", txId, receipt);`,
  },
  {
    id: 'svc-06',
    name: 'qr-boarding-svc',
    domain: 'Cryptographic Boarding & Entry QR',
    language: 'Rust',
    runtime: 'Rust 1.82 (Axum + subtle)',
    protocol: 'REST + Offline Verify',
    datastore: 'HSM / KMS Key Vault',
    produces: ['ticket.qr.issued'],
    consumes: ['booking.created'],
    endpointPrefix: '/api/tickets/qr & /api/tickets/verify',
    repoPath: 'services/qr-boarding-svc-rust/src/main.rs',
    sloTargetMs: 4,
    bestPractices: ['Constant-Time Signature Verify', 'HMAC-SHA256 Signing', 'Secret Injection via Env/Vault', 'Offline E-Gate Payload'],
    description: 'Issues tamper-proof HMAC-SHA256 QR payloads verified in constant time for airport e-gates and transfer shuttle boarding.',
    codeSnippet: `// Rust constant-time HMAC-SHA256 verification (prevents timing attacks)
if expected.as_bytes().ct_eq(req.signature.as_bytes()).into() {
    StatusCode::OK
} else {
    StatusCode::UNAUTHORIZED
}`,
  },
  {
    id: 'svc-07',
    name: 'notification-svc',
    domain: 'Real-Time Push & Kafka Fanout',
    language: 'Go',
    runtime: 'Go 1.23 (Goroutine Hub)',
    protocol: 'WebSocket + Web Push API',
    datastore: 'Redis Pub/Sub',
    produces: ['flight.delay.alert', 'gate.changed', 'boarding.call'],
    consumes: ['booking.created', 'payment.authorized', 'flight.delay.alert'],
    endpointPrefix: '/ws & /api/notifications',
    repoPath: 'services/notification-svc-go/main.go',
    sloTargetMs: 12,
    bestPractices: ['Lock-Safe RWMutex Fanout', 'Non-Blocking Broadcast', 'WebSocket Heartbeat', 'At-Least-Once Kafka Consumer'],
    description: 'Fans out delay warnings, gate changes, and EV airport ride updates to mobile PWA push & WebSocket clients.',
    codeSnippet: `// Go RWMutex concurrent alert history + broadcast hub
hub.mu.Lock()
hub.history = append([]AlertEvent{ev}, hub.history...)
hub.mu.Unlock()
_ = json.NewEncoder(w).Encode(map[string]any{"event": ev})`,
  },
  {
    id: 'svc-08',
    name: 'passenger-profile-svc',
    domain: 'Traveler Identity & Auto-Fill Vault',
    language: 'Python',
    runtime: 'Python 3.12 (FastAPI + Pydantic v2)',
    protocol: 'REST + Bearer Auth',
    datastore: 'PostgreSQL',
    produces: ['profile.updated'],
    consumes: ['booking.created'],
    endpointPrefix: '/api/passengers',
    repoPath: 'services/passenger-profile-svc-py/main.py',
    sloTargetMs: 25,
    bestPractices: ['Pydantic v2 Schema Validation', 'Bearer Auth Guard', 'SHA-256 PII Audit Digest', 'OpenAPI Auto-Docs'],
    description: 'Validates traveler profiles, passport details, and frequent-flyer tiers for 1-tap checkout auto-fill.',
    codeSnippet: `@app.post("/api/passengers", status_code=201)
def upsert_passenger(payload: PassengerProfileIn, authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    digest = hashlib.sha256(payload.passportNumber.encode()).hexdigest()[:12]`,
  },
  {
    id: 'svc-09',
    name: 'travel-analytics-svc',
    domain: 'Frequent Flyer Telemetry & CO₂',
    language: 'Python',
    runtime: 'Python 3.12 (FastAPI OLAP)',
    protocol: 'REST + Kafka Stream',
    datastore: 'ClickHouse OLAP',
    produces: ['analytics.aggregated'],
    consumes: ['booking.created', 'payment.authorized', 'flight.delay.alert'],
    endpointPrefix: '/api/analytics',
    repoPath: 'services/travel-analytics-svc-py/main.py',
    sloTargetMs: 40,
    bestPractices: ['Typed Pydantic Telemetry', 'Zero-Division Safe Rollups', 'Idempotent Stream Aggregation', 'CO₂ & Luggage ROI Metrics'],
    description: 'Aggregates distance flown, flight hours, on-time reliability, CO₂ footprint, and light-fare luggage savings.',
    codeSnippet: `@app.post("/api/analytics/rollup")
def compute_traveler_rollup(trips: List[TripTelemetry]):
    total_km = round(sum(t.distanceKm for t in trips), 1)
    co2_tons = round(sum(t.co2Kg for t in trips) / 1000.0, 3)
    return {"totalDistanceKm": total_km, "co2MetricTons": co2_tons}`,
  },
  {
    id: 'svc-10',
    name: 'offline-map-svc',
    domain: 'Vector Tile & Terminal Sync',
    language: 'Go',
    runtime: 'Go 1.23 (GeoJSON CDN)',
    protocol: 'REST + Service Worker Cache',
    datastore: 'Object Storage CDN',
    produces: ['map.pack.synced'],
    consumes: ['gate.changed'],
    endpointPrefix: '/api/maps/packs',
    repoPath: 'services/offline-map-svc-go/main.go',
    sloTargetMs: 10,
    bestPractices: ['Immutable ETag / Cache-Control', 'Sub-200KB Vector Payloads', 'Go 1.22+ Method Routing', 'Offline-First Pack Versioning'],
    description: 'Packages ultra-lightweight regional airport & metro vector packs (<200 KB) including India & APAC mega-hubs.',
    codeSnippet: `mux.HandleFunc("GET /api/maps/packs/{region}", func(w http.ResponseWriter, r *http.Request) {
    pack, ok := packs[r.PathValue("region")]
    w.Header().Set("Cache-Control", "public, max-age=86400")
    _ = json.NewEncoder(w).Encode(map[string]any{"pack": pack})
})`,
  },
  {
    id: 'svc-11',
    name: 'airport-transfer-svc',
    domain: 'Last-Mile Metro & EV Shuttle Dispatch',
    language: 'Go',
    runtime: 'Go 1.23 (net/http)',
    protocol: 'REST + Kafka Consumer',
    datastore: 'Redis Geo + PostgreSQL',
    produces: ['ride.transfer.dispatched'],
    consumes: ['booking.created', 'flight.delay.alert'],
    endpointPrefix: '/api/transfers/options',
    repoPath: 'services/airport-transfer-svc-go/main.go',
    sloTargetMs: 14,
    bestPractices: ['Delay-Aware Pickup Resync', 'Zero-Dep HTTP Router', 'Geo-Station Fare Lookup', '/healthz Readiness Probe'],
    description: 'Matches airport arrivals (DEL Metro Express, BOM Aqua Line, BLR Vayu Vajra, BluEV) and auto-reschedules EV pickups on flight delays.',
    codeSnippet: `// Go 1.23 Last-Mile Metro & EV Shuttle Dispatch
mux.HandleFunc("GET /api/transfers/options", func(w http.ResponseWriter, r *http.Request) {
    station := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("station")))
    _ = json.NewEncoder(w).Encode(map[string]any{"station": station, "options": stationTransfers[station]})
})`,
  },
  {
    id: 'svc-12',
    name: 'loyalty-rewards-svc',
    domain: 'SkyMiles & Frequent Flyer Tier Engine',
    language: 'Python',
    runtime: 'Python 3.12 (FastAPI + Pydantic v2)',
    protocol: 'REST + Kafka Consumer',
    datastore: 'PostgreSQL Ledger',
    produces: ['loyalty.miles.credited'],
    consumes: ['booking.created', 'payment.authorized'],
    endpointPrefix: '/api/loyalty/calculate',
    repoPath: 'services/loyalty-rewards-svc-py/main.py',
    sloTargetMs: 18,
    bestPractices: ['Deterministic Cabin Multipliers', 'Pydantic v2 Validation', 'Idempotent Miles Accrual', 'OpenAPI Spec'],
    description: 'Computes distance-based SkyMiles and Silver/Gold/Platinum tier progress across Economy, Premium, Business, and First cabins.',
    codeSnippet: `@app.post("/api/loyalty/calculate")
def calculate_miles(req: LoyaltyCalcRequest):
    earned_miles = round(req.distanceKm * 0.621371 * CABIN_BONUS.get(req.cabin, 1.0) * TIER_BONUS.get(req.tier, 1.0))
    return {"earnedMiles": earned_miles, "tierPoints": round(earned_miles * 0.15)}`,
  },
  {
    id: 'svc-13',
    name: 'flight-ops-telemetry-svc',
    domain: 'ATC Congestion & Weather Disruption Predictor',
    language: 'Rust',
    runtime: 'Rust 1.82 (Axum + Tokio)',
    protocol: 'REST + Kafka Stream',
    datastore: 'TimescaleDB + METAR Feed',
    produces: ['ops.weather.advisory', 'flight.delay.alert'],
    consumes: ['flight.search.queried'],
    endpointPrefix: '/api/ops/status',
    repoPath: 'services/flight-ops-telemetry-svc-rust/src/main.rs',
    sloTargetMs: 6,
    bestPractices: ['Low-Latency Async Tokio', 'Typed Query Extraction', 'Proactive Fog/Monsoon Advisories', '/healthz Probe'],
    description: 'Scores runway visibility, coastal crosswinds, and ATC slot probability across global and Indian hubs (DEL fog, BOM monsoon).',
    codeSnippet: `async fn ops_status(Query(q): Query<RouteQuery>) -> Json<OpsStatus> {
    let from = q.from.unwrap_or_else(|| "DEL".into()).to_uppercase();
    Json(OpsStatus { from, to, on_time_probability: 94, advisory, runtime: "rust-1.82-ops-telemetry" })
}`,
  },
  {
    id: 'svc-14',
    name: 'edge-rate-limiter-svc',
    domain: 'API Gateway & Sliding-Window Rate Limiter',
    language: 'Go',
    runtime: 'Go 1.23 (httputil ReverseProxy)',
    protocol: 'HTTP/1.1 & HTTP/2 Ingress',
    datastore: 'Redis Sliding-Window Buckets',
    produces: ['gateway.ratelimit.triggered'],
    consumes: ['auth.user.registered'],
    endpointPrefix: '/api/* & /api/gateway/status',
    repoPath: 'services/edge-rate-limiter-svc-go/main.go',
    sloTargetMs: 2,
    bestPractices: ['Tiered Sliding-Window Limits', 'X-RateLimit-* + Retry-After', 'W3C traceparent + X-Request-Id', 'Auth/Payment Brute-Force Shield'],
    description: 'Ingress reverse-proxy gateway enforcing per-route sliding-window rate limits (auth 20/m, payments 30/m, standard 120/m) and trace propagation.',
    codeSnippet: `// Go 1.23 Sliding-Window Rate Limiter & Reverse Proxy
allowed, remaining, resetUnix := limiter.Allow(policy.Name+":"+clientIP, policy)
w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
if !allowed {
    w.Header().Set("Retry-After", "60")
    w.WriteHeader(http.StatusTooManyRequests)
}`,
  },
];
