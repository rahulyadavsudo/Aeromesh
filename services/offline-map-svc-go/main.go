package main

import (
	"encoding/json"
	"net/http"
)

type RegionPack struct {
	Region    string   `json:"region"`
	Title     string   `json:"title"`
	SizeKB    int      `json:"sizeKb"`
	Hubs      []string `json:"hubs"`
	Corridors int      `json:"corridors"`
}

func main() {
	packs := map[string]RegionPack{
		"APAC": {Region: "APAC", Title: "India & Asia-Pacific Mega-Hubs", SizeKB: 184, Hubs: []string{"DEL", "BOM", "BLR", "HYD", "SIN", "HND"}, Corridors: 7},
		"EU":   {Region: "EU", Title: "Western Europe Rail-Air Mesh", SizeKB: 142, Hubs: []string{"LHR", "CDG", "FRA", "ZRH"}, Corridors: 4},
		"NA":   {Region: "NA", Title: "North America Transcontinental", SizeKB: 136, Hubs: []string{"JFK", "SFO", "YYZ", "ORD"}, Corridors: 4},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /api/maps/packs/{region}", func(w http.ResponseWriter, r *http.Request) {
		pack, ok := packs[r.PathValue("region")]
		if !ok {
			http.Error(w, "pack not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		_ = json.NewEncoder(w).Encode(map[string]any{"pack": pack, "runtime": "go-1.23-geojson"})
	})
	_ = http.ListenAndServe(":8090", mux)
}
