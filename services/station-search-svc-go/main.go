package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

type Station struct {
	Code        string   `json:"code"`
	Name        string   `json:"name"`
	City        string   `json:"city"`
	Country     string   `json:"country"`
	Terminals   []string `json:"terminals,omitempty"`
	TransitLink string   `json:"transitLink,omitempty"`
}

var stations = []Station{
	{Code: "DEL", Name: "Indira Gandhi International", City: "New Delhi", Country: "India", Terminals: []string{"T1", "T2", "T3"}, TransitLink: "Delhi Airport Metro Express"},
	{Code: "BOM", Name: "Chhatrapati Shivaji Maharaj Intl", City: "Mumbai", Country: "India", Terminals: []string{"T1", "T2"}, TransitLink: "Mumbai Metro Aqua Line"},
	{Code: "BLR", Name: "Kempegowda International", City: "Bengaluru", Country: "India", Terminals: []string{"T1", "T2"}, TransitLink: "BMTC Vayu Vajra"},
	{Code: "HYD", Name: "Rajiv Gandhi International", City: "Hyderabad", Country: "India", Terminals: []string{"Main"}, TransitLink: "Pushpak Airport Liner"},
	{Code: "JFK", Name: "John F. Kennedy International", City: "New York", Country: "United States", Terminals: []string{"T1", "T4", "T5", "T8"}, TransitLink: "AirTrain JFK"},
	{Code: "LHR", Name: "London Heathrow", City: "London", Country: "United Kingdom", Terminals: []string{"T2", "T3", "T4", "T5"}, TransitLink: "Elizabeth Line"},
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	mux.HandleFunc("GET /api/stations", func(w http.ResponseWriter, r *http.Request) {
		q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
		country := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("country")))
		lowBw := r.Header.Get("X-Bandwidth-Mode") == "low"

		matches := make([]Station, 0, 12)
		for _, s := range stations {
			if country != "" && strings.ToLower(s.Country) != country {
				continue
			}
			if q == "" || strings.Contains(strings.ToLower(s.Code), q) || strings.Contains(strings.ToLower(s.City), q) || strings.Contains(strings.ToLower(s.Country), q) {
				if lowBw {
					matches = append(matches, Station{Code: s.Code, Name: s.Name, City: s.City, Country: s.Country})
				} else {
					matches = append(matches, s)
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"stations": matches, "count": len(matches), "runtime": "go-1.23"})
	})

	srv := &http.Server{Addr: ":8082", Handler: mux, ReadHeaderTimeout: 3 * time.Second}
	go func() {
		logger.Info("station-search-svc listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "err", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
