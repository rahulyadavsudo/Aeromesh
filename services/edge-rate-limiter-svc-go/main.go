package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

type RatePolicy struct {
	Name          string `json:"name"`
	Limit         int    `json:"limit"`
	WindowSeconds int    `json:"windowSeconds"`
}

type windowBucket struct {
	timestamps []time.Time
}

type SlidingWindowLimiter struct {
	mu      sync.Mutex
	buckets map[string]*windowBucket
}

func NewSlidingWindowLimiter() *SlidingWindowLimiter {
	return &SlidingWindowLimiter{buckets: make(map[string]*windowBucket)}
}

func (l *SlidingWindowLimiter) Allow(key string, policy RatePolicy) (allowed bool, remaining int, resetUnix int64) {
	now := time.Now()
	window := time.Duration(policy.WindowSeconds) * time.Second
	cutoff := now.Add(-window)

	l.mu.Lock()
	defer l.mu.Unlock()

	b, ok := l.buckets[key]
	if !ok {
		b = &windowBucket{}
		l.buckets[key] = b
	}

	valid := b.timestamps[:0]
	for _, ts := range b.timestamps {
		if ts.After(cutoff) {
			valid = append(valid, ts)
		}
	}
	b.timestamps = valid

	resetUnix = now.Add(window).Unix()
	if len(b.timestamps) > 0 {
		resetUnix = b.timestamps[0].Add(window).Unix()
	}

	if len(b.timestamps) >= policy.Limit {
		return false, 0, resetUnix
	}

	b.timestamps = append(b.timestamps, now)
	return true, policy.Limit - len(b.timestamps), resetUnix
}

func newRequestID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return "req-" + hex.EncodeToString(b)
}

func selectPolicy(path string) (RatePolicy, string) {
	switch {
	case strings.HasPrefix(path, "/api/auth"):
		return RatePolicy{Name: "auth", Limit: 20, WindowSeconds: 60}, "passenger-profile-svc"
	case strings.HasPrefix(path, "/api/payments"), strings.HasPrefix(path, "/api/bookings"):
		return RatePolicy{Name: "payments", Limit: 30, WindowSeconds: 60}, "payment-gateway-svc"
	case strings.HasPrefix(path, "/api/fares"):
		return RatePolicy{Name: "standard", Limit: 120, WindowSeconds: 60}, "fare-luggage-svc"
	case strings.HasPrefix(path, "/api/stations"), strings.HasPrefix(path, "/api/flights"):
		return RatePolicy{Name: "standard", Limit: 120, WindowSeconds: 60}, "station-search-svc"
	default:
		return RatePolicy{Name: "standard", Limit: 120, WindowSeconds: 60}, "api-gateway-bff"
	}
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	upstreamURL := os.Getenv("BFF_UPSTREAM_URL")
	if upstreamURL == "" {
		upstreamURL = "http://api-gateway-bff:3000"
	}
	target, err := url.Parse(upstreamURL)
	if err != nil {
		logger.Error("invalid upstream url", "err", err)
		os.Exit(1)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	limiter := NewSlidingWindowLimiter()
	var totalRouted atomic.Int64
	var totalThrottled atomic.Int64

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":    "ok",
			"service":   "edge-rate-limiter-svc",
			"runtime":   "go-1.23",
			"algorithm": "sliding-window",
		})
	})

	mux.HandleFunc("GET /gateway/metrics", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"service":        "edge-rate-limiter-svc",
			"totalRouted":    totalRouted.Load(),
			"totalThrottled": totalThrottled.Load(),
			"policies":       []string{"auth:20/60s", "payments:30/60s", "standard:120/60s"},
		})
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		reqID := r.Header.Get("X-Request-Id")
		if reqID == "" {
			reqID = newRequestID()
		}
		clientIP := strings.Split(r.RemoteAddr, ":")[0]
		if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
			clientIP = strings.TrimSpace(strings.Split(fwd, ",")[0])
		}

		policy, upstreamSvc := selectPolicy(r.URL.Path)
		allowed, remaining, resetUnix := limiter.Allow(fmt.Sprintf("%s:%s", policy.Name, clientIP), policy)

		w.Header().Set("X-Request-Id", reqID)
		w.Header().Set("X-Gateway-Upstream", upstreamSvc)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", policy.Limit))
		w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
		w.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", resetUnix))
		w.Header().Set("X-RateLimit-Policy", fmt.Sprintf("%d;w=%d;policy=%s", policy.Limit, policy.WindowSeconds, policy.Name))

		if !allowed {
			totalThrottled.Add(1)
			w.Header().Set("Retry-After", fmt.Sprintf("%d", policy.WindowSeconds))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":     "Rate limit exceeded. Please retry shortly.",
				"policy":    policy.Name,
				"requestId": reqID,
			})
			return
		}

		totalRouted.Add(1)
		r.Header.Set("X-Request-Id", reqID)
		proxy.ServeHTTP(w, r)
	})

	srv := &http.Server{
		Addr:              ":8080",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("edge-rate-limiter-svc listening", "addr", srv.Addr, "upstream", upstreamURL)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
