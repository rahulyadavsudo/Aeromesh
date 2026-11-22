package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

type TransferOption struct {
	ID         string  `json:"id"`
	Mode       string  `json:"mode"`
	Provider   string  `json:"provider"`
	EtaMinutes int     `json:"etaMinutes"`
	FareUsd    float64 `json:"fareUsd"`
}

func main() {
	stationTransfers := map[string][]TransferOption{
		"DEL": {
			{ID: "del-metro", Mode: "Metro Express", Provider: "Delhi Airport Metro Line", EtaMinutes: 18, FareUsd: 1.5},
			{ID: "del-ev", Mode: "EV Cab", Provider: "AeroMesh BluEV", EtaMinutes: 5, FareUsd: 9.0},
		},
		"BOM": {
			{ID: "bom-aqua", Mode: "Metro Line 3", Provider: "Mumbai Aqua Line", EtaMinutes: 22, FareUsd: 1.2},
			{ID: "bom-ev", Mode: "EV Shuttle", Provider: "AeroMesh Coastal EV", EtaMinutes: 6, FareUsd: 11.0},
		},
		"BLR": {
			{ID: "blr-vayu", Mode: "AC Bus", Provider: "BMTC Vayu Vajra KIA-9", EtaMinutes: 42, FareUsd: 3.5},
			{ID: "blr-ev", Mode: "EV Cab", Provider: "AeroMesh EV Sedan", EtaMinutes: 4, FareUsd: 14.0},
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /api/transfers/options", func(w http.ResponseWriter, r *http.Request) {
		station := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("station")))
		opts, ok := stationTransfers[station]
		if !ok {
			opts = []TransferOption{{ID: "std-ev", Mode: "EV Shuttle", Provider: "AeroMesh Ground Link", EtaMinutes: 7, FareUsd: 12.0}}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"station": station, "options": opts, "runtime": "go-1.23-dispatch"})
	})
	_ = http.ListenAndServe(":8091", mux)
}
