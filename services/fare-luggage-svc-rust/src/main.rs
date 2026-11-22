use axum::{
    extract::Json,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, time::Duration};
use tower_http::timeout::TimeoutLayer;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FareRequest {
    base_price_usd: f64,
    cabin: String,
    checked_bags_count: u32,
    bag_weight_kg: u32,
    priority_handling: bool,
    sports_equipment: bool,
    passengers_count: u32,
    fx_rate: f64,
    currency: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FareQuote {
    currency: String,
    total_no_luggage: f64,
    total_with_luggage: f64,
    luggage_delta: f64,
    service_runtime: &'static str,
}

async fn healthz() -> (StatusCode, &'static str) {
    (StatusCode::OK, "ok")
}

async fn calculate_fare(headers: HeaderMap, Json(req): Json<FareRequest>) -> Json<FareQuote> {
    let _traceparent = headers.get("traceparent");
    let cabin_mult = match req.cabin.as_str() {
        "premium" => 1.48,
        "business" => 2.65,
        "first" => 4.10,
        _ => 1.0,
    };

    let pax = req.passengers_count.max(1) as f64;
    let base_usd = req.base_price_usd * cabin_mult;
    let taxes_usd = base_usd * 0.14 + 28.0;

    let free_allowance = matches!(req.cabin.as_str(), "business" | "first");
    let bag_fee_usd = if free_allowance && req.checked_bags_count <= 2 {
        0.0
    } else {
        let billable = if free_allowance {
            req.checked_bags_count.saturating_sub(2)
        } else {
            req.checked_bags_count
        };
        billable as f64 * 42.0
    };

    let overweight_usd = if req.checked_bags_count > 0 && req.bag_weight_kg > 23 {
        req.checked_bags_count as f64 * 35.0
    } else {
        0.0
    };

    let priority_usd = if req.priority_handling { 18.0 } else { 0.0 };
    let sports_usd = if req.sports_equipment { 55.0 } else { 0.0 };

    let total_light = ((base_usd + taxes_usd) * pax * req.fx_rate * 100.0).round() / 100.0;
    let extra_usd = (bag_fee_usd + overweight_usd + priority_usd + sports_usd) * pax;
    let total_with_luggage = (((base_usd + taxes_usd) * pax + extra_usd) * req.fx_rate * 100.0).round() / 100.0;

    Json(FareQuote {
        currency: req.currency,
        total_no_luggage: total_light,
        total_with_luggage,
        luggage_delta: ((total_with_luggage - total_light) * 100.0).round() / 100.0,
        service_runtime: "rust-1.82-axum",
    })
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().json().init();
    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/api/fares/calculate", post(calculate_fare))
        .layer(TimeoutLayer::new(Duration::from_secs(3)));

    let addr = SocketAddr::from(([0, 0, 0, 0], 8083));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
