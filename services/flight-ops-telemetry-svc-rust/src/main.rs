use axum::{extract::Query, http::StatusCode, routing::get, Json, Router};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

#[derive(Deserialize)]
struct RouteQuery {
    from: Option<String>,
    to: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpsStatus {
    from: String,
    to: String,
    on_time_probability: u8,
    advisory: String,
    runtime: &'static str,
}

async fn healthz() -> (StatusCode, &'static str) {
    (StatusCode::OK, "ok")
}

async fn ops_status(Query(q): Query<RouteQuery>) -> Json<OpsStatus> {
    let from = q.from.unwrap_or_else(|| "DEL".into()).to_uppercase();
    let to = q.to.unwrap_or_else(|| "BOM".into()).to_uppercase();
    let (prob, advisory) = match (from.as_str(), to.as_str()) {
        ("DEL", _) => (94, "CAT-IIIB visibility normal · Runway 29R/11L nominal".to_string()),
        ("BOM", _) => (91, "Coastal crosswind 8 kt · Rapid turnarounds on RWY 27".to_string()),
        _ => (96, "Airspace flow nominal · No ATC ground delay program".to_string()),
    };

    Json(OpsStatus {
        from,
        to,
        on_time_probability: prob,
        advisory,
        runtime: "rust-1.82-ops-telemetry",
    })
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/api/ops/status", get(ops_status));

    let addr = SocketAddr::from(([0, 0, 0, 0], 8093));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
