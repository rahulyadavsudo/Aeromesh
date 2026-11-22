use axum::{extract::Json, http::StatusCode, routing::{get, post}, Router};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::net::SocketAddr;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignRequest {
    pnr: String,
    flight_number: String,
    seat: String,
    travel_date: String,
}

#[derive(Serialize)]
struct SignedPass {
    payload: String,
    signature: String,
}

#[derive(Deserialize)]
struct VerifyRequest {
    payload: String,
    signature: String,
}

fn secret_key() -> String {
    std::env::var("QR_SIGNING_SECRET").expect("QR_SIGNING_SECRET must be injected by vault/KMS")
}

async fn healthz() -> (StatusCode, &'static str) {
    (StatusCode::OK, "ok")
}

async fn sign_pass(Json(req): Json<SignRequest>) -> Json<SignedPass> {
    let payload = format!("AM1|{}|{}|{}|{}", req.pnr, req.flight_number, req.seat, req.travel_date);
    let mut mac = HmacSha256::new_from_slice(secret_key().as_bytes()).unwrap();
    mac.update(payload.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes())[..16].to_string();
    Json(SignedPass { payload, signature: sig })
}

async fn verify_pass(Json(req): Json<VerifyRequest>) -> StatusCode {
    let mut mac = HmacSha256::new_from_slice(secret_key().as_bytes()).unwrap();
    mac.update(req.payload.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes())[..16].to_string();
    if expected.as_bytes().ct_eq(req.signature.as_bytes()).into() {
        StatusCode::OK
    } else {
        StatusCode::UNAUTHORIZED
    }
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/api/tickets/qr", post(sign_pass))
        .route("/api/tickets/verify", post(verify_pass));

    let addr = SocketAddr::from(([0, 0, 0, 0], 8086));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
