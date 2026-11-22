from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI(title="travel-analytics-svc", version="1.0.0")


class TripTelemetry(BaseModel):
    distanceKm: float
    co2Kg: float
    spendUsd: float
    checkedBagsCount: int
    delayed: bool = False


@app.get("/healthz")
def healthz():
    return {"status": "ok", "runtime": "python-3.12-fastapi"}


@app.post("/api/analytics/rollup")
def compute_traveler_rollup(trips: List[TripTelemetry]):
    total_trips = len(trips)
    total_km = round(sum(t.distanceKm for t in trips), 1)
    co2_tons = round(sum(t.co2Kg for t in trips) / 1000.0, 3)
    delayed_count = sum(1 for t in trips if t.delayed)
    on_time_rate = round(((total_trips - delayed_count) / max(1, total_trips)) * 100.0, 1)
    luggage_savings = sum(42 for t in trips if t.checkedBagsCount == 0)

    return {
        "totalTrips": total_trips,
        "totalDistanceKm": total_km,
        "totalFlightHours": round(total_km / 795.0),
        "onTimeRatePercent": on_time_rate,
        "co2MetricTons": co2_tons,
        "luggageSavingsUsd": luggage_savings,
        "runtime": "python-3.12-olap-aggregator",
    }
