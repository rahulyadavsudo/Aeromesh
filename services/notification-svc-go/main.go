package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"
)

type AlertEvent struct {
	ID        string `json:"id"`
	Topic     string `json:"topic"`
	Title     string `json:"title"`
	Message   string `json:"message"`
	Severity  string `json:"severity"`
	Timestamp string `json:"timestamp"`
}

type BrokerHub struct {
	mu      sync.RWMutex
	history []AlertEvent
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	hub := &BrokerHub{}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	mux.HandleFunc("POST /api/notifications/simulate", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Kind string `json:"kind"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		ev := AlertEvent{
			ID:        "notif-" + time.Now().Format("150405"),
			Topic:     "flight.delay.alert",
			Title:     "Gate & Delay Telemetry Alert",
			Message:   "Kafka stream fanout delivered over WebSocket & PWA Push.",
			Severity:  "warning",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		}
		hub.mu.Lock()
		hub.history = append([]AlertEvent{ev}, hub.history...)
		hub.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"event": ev, "runtime": "go-1.23-ws-hub"})
	})

	logger.Info("notification-svc listening", "addr", ":8087")
	_ = http.ListenAndServe(":8087", mux)
}
