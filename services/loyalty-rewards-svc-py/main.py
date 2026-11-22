from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="loyalty-rewards-svc", version="1.0.0")


class LoyaltyCalcRequest(BaseModel):
    distanceKm: float
    cabin: str = "economy"
    tier: str = "Silver"


CABIN_BONUS = {"economy": 1.0, "premium": 1.35, "business": 2.0, "first": 3.0}
TIER_BONUS = {"Silver": 1.0, "Gold": 1.25, "Platinum": 1.5}


@app.get("/healthz")
def healthz():
    return {"status": "ok", "runtime": "python-3.12-fastapi"}


@app.post("/api/loyalty/calculate")
def calculate_miles(req: LoyaltyCalcRequest):
    cabin_mult = CABIN_BONUS.get(req.cabin.lower(), 1.0)
    tier_mult = TIER_BONUS.get(req.tier, 1.0)
    earned_miles = round(req.distanceKm * 0.621371 * cabin_mult * tier_mult)
    tier_points = round(earned_miles * 0.15)
    return {
        "earnedMiles": earned_miles,
        "tierPoints": tier_points,
        "nextTier": "Platinum" if req.tier != "Platinum" else "Concierge",
        "runtime": "python-3.12-loyalty",
    }
