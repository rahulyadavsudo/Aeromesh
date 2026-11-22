'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle2, Cpu, FileCode2, Gauge, GitCommitHorizontal, Radio, RefreshCw, Server, ShieldAlert, ShieldCheck } from 'lucide-react';
import { MICROSERVICES_SPECS, type ServiceLanguage } from '../data/microservicesBlueprint';
import type { KafkaEventRecord } from '../types/travel';
import type { TranslationSet } from '../data/i18n';
import { formatShortTime } from '../utils/formatters';

interface MicroservicesConsoleProps {
  kafkaEvents: KafkaEventRecord[];
  wsConnected: boolean;
  onSimulateAlert: (kind: 'delay' | 'gate' | 'ride') => Promise<void>;
  t: TranslationSet;
}

const LANGUAGE_FILTERS: ('All' | ServiceLanguage)[] = ['All', 'Go', 'Rust', 'Java', 'Python', 'Next.js'];

const ARCHITECTURE_PRACTICES = [
  'Saga + Transactional Outbox',
  'Idempotency-Key Payments',
  'Constant-Time HMAC-SHA256',
  'OpenTelemetry traceparent',
  'Circuit Breakers & Timeouts',
  '/healthz Probes & Kafka DLQ',
];

interface GatewayStatusPayload {
  gatewayService: string;
  algorithm: string;
  policies: { name: string; routes: string; limit: number; windowSeconds: number }[];
  metrics: { totalRouted: number; totalThrottled: number; activeBuckets: number; avgLatencyMs: number };
  recentTraces: {
    requestId: string;
    method: string;
    path: string;
    upstream: string;
    policy: string;
    status: number;
    remaining: number;
    latencyMs: number;
    timestamp: string;
  }[];
}

export const MicroservicesConsole: React.FC<MicroservicesConsoleProps> = ({
  kafkaEvents,
  wsConnected,
  onSimulateAlert,
  t,
}) => {
  const [langFilter, setLangFilter] = useState<'All' | ServiceLanguage>('All');
  const [selectedServiceId, setSelectedServiceId] = useState(MICROSERVICES_SPECS[2].id);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatusPayload | null>(null);
  const [rateTestResult, setRateTestResult] = useState<{ status: number; message: string } | null>(null);
  const [testingRateLimit, setTestingRateLimit] = useState(false);

  const loadGatewayStatus = async () => {
    try {
      const res = await fetch('/api/gateway/status');
      if (res.ok) {
        const data = (await res.json()) as GatewayStatusPayload;
        setGatewayStatus(data);
      }
    } catch {
      // Ignore offline errors
    }
  };

  useEffect(() => {
    void loadGatewayStatus();
  }, [kafkaEvents.length]);

  const handleRateLimitBurst = async (reset = false) => {
    setTestingRateLimit(true);
    try {
      const res = await fetch('/api/gateway/rate-limit-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reset ? { reset: true } : {}),
      });
      const data = await res.json();
      setRateTestResult({
        status: res.status,
        message: reset ? 'Sandbox bucket reset (4/4 tokens ready).' : String(data.message || `HTTP ${res.status}`),
      });
      await loadGatewayStatus();
    } catch {
      setRateTestResult({ status: 0, message: 'Offline mode — gateway probe paused.' });
    } finally {
      setTestingRateLimit(false);
    }
  };

  const filteredSpecs = useMemo(
    () =>
      langFilter === 'All'
        ? MICROSERVICES_SPECS
        : MICROSERVICES_SPECS.filter((s) => s.language === langFilter),
    [langFilter]
  );

  const selectedSpec =
    filteredSpecs.find((s) => s.id === selectedServiceId) ||
    filteredSpecs[0] ||
    MICROSERVICES_SPECS[0];

  const triggerEvent = async (kind: 'delay' | 'gate' | 'ride') => {
    setTriggering(kind);
    try {
      await onSimulateAlert(kind);
    } finally {
      setTriggering(null);
    }
  };

  return (
    <section aria-labelledby="microservices-heading" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <h2 id="microservices-heading" className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Polyglot Microservices &amp; Kafka Event Mesh
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Next.js 16 frontend orchestrated with {MICROSERVICES_SPECS.length} Go, Rust, Java (Spring Boot), and Python (FastAPI) services over Apache Kafka.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={triggering !== null}
            onClick={() => triggerEvent('delay')}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{triggering === 'delay' ? 'Publishing…' : t.simulateDelayBtn}</span>
          </button>
          <button
            type="button"
            disabled={triggering !== null}
            onClick={() => triggerEvent('gate')}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <span>Test Gate Change</span>
          </button>
          <button
            type="button"
            disabled={triggering !== null}
            onClick={() => triggerEvent('ride')}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <span>Test EV Ride Alert</span>
          </button>
        </div>
      </div>

      {/* Polyglot Language Filter + Best-Practice Bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Filter microservices by language" className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {LANGUAGE_FILTERS.map((lang) => {
            const count =
              lang === 'All'
                ? MICROSERVICES_SPECS.length
                : MICROSERVICES_SPECS.filter((s) => s.language === lang).length;
            const active = langFilter === lang;
            return (
              <button
                key={lang}
                type="button"
                aria-pressed={active}
                onClick={() => setLangFilter(lang)}
                className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white text-[#0F4C81] shadow-sm dark:bg-slate-900 dark:text-blue-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {lang} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-600 dark:text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          <span>{ARCHITECTURE_PRACTICES.join(' · ')}</span>
        </div>
      </div>

      {/* Polyglot Service Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {filteredSpecs.map((svc) => {
          const active = svc.id === selectedSpec.id;
          return (
            <button
              key={svc.id}
              type="button"
              onClick={() => setSelectedServiceId(svc.id)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                active
                  ? 'border-[#0F4C81] bg-[#0F4C81]/5 dark:border-blue-400 dark:bg-blue-950/30'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-[#0F4C81] dark:text-blue-400 truncate">
                  {svc.name}
                </span>
                <Server className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              </div>
              <div className="mt-1.5 text-xs font-semibold text-slate-900 dark:text-white line-clamp-1">
                {svc.domain}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700 dark:text-slate-300">{svc.language}</span>
                <span className="tabular-nums">SLO &lt;{svc.sloTargetMs}ms</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Service Spec + Live Kafka Topic Log */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-xs font-semibold text-[#0F4C81] dark:text-blue-400">
                {selectedSpec.language} · {selectedSpec.runtime} · {selectedSpec.protocol}
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedSpec.name}</h3>
            </div>
            <Cpu className="h-5 w-5 text-slate-400" aria-hidden="true" />
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300">{selectedSpec.description}</p>

          <dl className="grid grid-cols-2 gap-3 text-xs border-t border-slate-100 pt-4 dark:border-slate-800">
            <div>
              <dt className="text-slate-500">Primary Datastore</dt>
              <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{selectedSpec.datastore}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Gateway Route</dt>
              <dd className="mt-0.5 font-mono text-slate-900 dark:text-white">{selectedSpec.endpointPrefix}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Produces Kafka Topics</dt>
              <dd className="mt-0.5 font-mono text-emerald-700 dark:text-emerald-400">
                {selectedSpec.produces.join(', ')}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Consumes Kafka Topics</dt>
              <dd className="mt-0.5 font-mono text-slate-700 dark:text-slate-300">
                {selectedSpec.consumes.join(', ')}
              </dd>
            </div>
          </dl>

          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Service Best Practices Applied
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-xs text-slate-600 dark:text-slate-300">
              {selectedSpec.bestPractices.map((bp) => (
                <div key={bp} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                  <span>{bp}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              <span>{selectedSpec.language} Implementation</span>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-normal text-slate-500">
                <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                {selectedSpec.repoPath}
              </span>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-[#0B1220] p-4 font-mono text-xs leading-relaxed text-slate-200">
              <code>{selectedSpec.codeSnippet}</code>
            </pre>
          </div>
        </div>

        {/* Live WebSocket Kafka Topic Broker Stream */}
        <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <GitCommitHorizontal className="h-4 w-4 text-[#0F4C81] dark:text-blue-400" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Live Kafka Event Stream (WebSocket Broker)
              </h3>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-xs text-slate-600 dark:text-slate-300">
              <Radio className={`h-3.5 w-3.5 ${wsConnected ? 'text-emerald-600' : 'text-amber-600'}`} aria-hidden="true" />
              <span>{wsConnected ? 'Stream Connected' : 'Reconnecting'}</span>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[460px] overflow-y-auto">
            {kafkaEvents.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Search a flight, calculate luggage fares, or simulate a delay alert to observe live Kafka topic events.
              </div>
            ) : (
              kafkaEvents.map((ev) => (
                <div key={`${ev.offset}-${ev.topic}`} className="px-5 py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-[#0F4C81] dark:text-blue-400">
                      #{ev.offset} · {ev.topic}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {formatShortTime(ev.timestamp)} · p{ev.partition} · {ev.payloadSizeBytes}B
                    </span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-200">{ev.summary}</div>
                  <div className="font-mono text-[11px] text-slate-500">
                    {ev.producerService} → [{ev.consumerServices.join(', ')}]
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Live API Gateway & Sliding-Window Rate Limiter Panel */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0F4C81] dark:text-blue-400">
              <Gauge className="h-4 w-4" aria-hidden="true" />
              <span>EDGE API GATEWAY &amp; SLIDING-WINDOW RATE LIMITER</span>
            </div>
            <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              {gatewayStatus?.gatewayService || 'edge-rate-limiter-svc (Go 1.23 + Express Middleware)'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Enforces tiered per-route sliding-window rate limits, W3C traceparent headers, and X-RateLimit-* quotas across all 14 services.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={testingRateLimit}
              onClick={() => handleRateLimitBurst(false)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#0F4C81] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0B3A63] disabled:opacity-60"
            >
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Test Rate Limit (4/20s)</span>
            </button>
            <button
              type="button"
              disabled={testingRateLimit}
              onClick={() => handleRateLimitBurst(true)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset Bucket</span>
            </button>
          </div>
        </div>

        {rateTestResult && (
          <div
            role="status"
            className={`rounded-lg border px-4 py-2.5 font-mono text-xs ${
              rateTestResult.status === 429
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
            }`}
          >
            {rateTestResult.message}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
            <div className="text-[11px] text-slate-500">Requests Routed</div>
            <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-white">
              {gatewayStatus?.metrics.totalRouted ?? 0}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
            <div className="text-[11px] text-slate-500">HTTP 429 Throttled</div>
            <div className="mt-1 font-mono text-lg font-bold text-amber-700 tabular-nums dark:text-amber-400">
              {gatewayStatus?.metrics.totalThrottled ?? 0}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
            <div className="text-[11px] text-slate-500">Avg Gateway Overhead</div>
            <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-white">
              {gatewayStatus?.metrics.avgLatencyMs ?? 1.4} ms
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
            <div className="text-[11px] text-slate-500">Active Token Buckets</div>
            <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-white">
              {gatewayStatus?.metrics.activeBuckets ?? 0}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5 space-y-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Active Rate-Limit Policies</div>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-xs dark:divide-slate-800 dark:border-slate-800">
              {(gatewayStatus?.policies || []).map((p) => (
                <div key={p.name} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-slate-900 dark:text-white">{p.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{p.routes}</div>
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-[#0F4C81] dark:text-blue-400 shrink-0 tabular-nums">
                    {p.limit} req / {p.windowSeconds}s
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 space-y-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Recent Gateway Upstream Traces</div>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 text-xs dark:divide-slate-800 dark:border-slate-800">
              {(gatewayStatus?.recentTraces || []).length === 0 ? (
                <div className="p-4 text-center text-slate-500">API traces populate automatically as endpoints are called.</div>
              ) : (
                (gatewayStatus?.recentTraces || []).slice(0, 6).map((tr) => (
                  <div key={`${tr.requestId}-${tr.timestamp}`} className="flex items-center justify-between gap-3 px-3.5 py-2 font-mono text-[11px]">
                    <div className="min-w-0 truncate">
                      <span className="font-semibold text-slate-900 dark:text-white">{tr.method} {tr.path}</span>
                      <span className="ml-2 text-slate-500">→ {tr.upstream}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 tabular-nums">
                      <span className={tr.status === 429 ? 'font-bold text-amber-600' : 'text-emerald-700 dark:text-emerald-400'}>
                        {tr.status}
                      </span>
                      <span className="text-slate-400">rem:{tr.remaining}</span>
                      <span className="text-slate-400">{tr.latencyMs}ms</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
