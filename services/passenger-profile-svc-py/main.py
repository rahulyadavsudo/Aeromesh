from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import hashlib

app = FastAPI(title="passenger-profile-svc", version="1.0.0")


class PassengerProfileIn(BaseModel):
    fullName: str
    email: EmailStr
    passportNumber: str
    frequentFlyerId: Optional[str] = ""
    seatPreference: str = "Window"
    mealPreference: str = "Standard"


PROFILES: List[dict] = [
    {
        "id": "pax-1",
        "fullName": "Elena Rostova",
        "email": "elena.rostova@aeromesh.io",
        "tier": "Platinum",
        "passportNumber": "X89204412",
        "frequentFlyerId": "AM-PLT-90421",
        "seatPreference": "Window",
        "mealPreference": "Vegetarian",
    }
]


@app.get("/healthz")
def healthz():
    return {"status": "ok", "runtime": "python-3.12-fastapi"}


@app.get("/api/passengers")
def list_passengers():
    return {"passengers": PROFILES}


@app.post("/api/passengers", status_code=201)
def upsert_passenger(
    payload: PassengerProfileIn,
    authorization: Optional[str] = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")

    passport_digest = hashlib.sha256(payload.passportNumber.encode("utf-8")).hexdigest()[:12]
    record = {
        "id": f"pax-{len(PROFILES) + 1}",
        "fullName": payload.fullName,
        "email": str(payload.email),
        "passportNumber": payload.passportNumber,
        "passportAuditHash": passport_digest,
        "frequentFlyerId": payload.frequentFlyerId or f"AM-SLV-{10000 + len(PROFILES)}",
        "seatPreference": payload.seatPreference,
        "mealPreference": payload.mealPreference,
        "tier": "Silver",
    }
    PROFILES.insert(0, record)
    return {"passenger": record}
