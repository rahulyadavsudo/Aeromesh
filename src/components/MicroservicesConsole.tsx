import React, { useState } from 'react';
import { BellRing, Cpu, GitCommitHorizontal, Radio, Server } from 'lucide-react';
import { MICROSERVICES_SPECS } from '../data/microservicesBlueprint';
import type { KafkaEventRecord } from '../types/travel';
import type { TranslationSet } from '../data/i18n';
import { formatShortTime } from '../utils/formatters';

interface MicroservicesConsoleProps {
  kafkaEvents: KafkaEventRecord[];
  wsConnected: boolean;
  onSimulateAlert: (kind: 'delay' | 'gate' | 'ride') => Promise<void>;
  t: TranslationSet;
}

export const MicroservicesConsole: React.FC<MicroservicesConsoleProps> = ({
  kafkaEvents,
  wsConnected,
  onSimulateAlert,
  t,
}) => {
  const [selectedServiceId, setSelectedServiceId] = useState(MICROSERVICES_SPECS[2].id);
  const [triggering, setTriggering] = useState<string | null>(null);

  const selectedSpec = MICROSERVICES_SPECS.find((s) => s.id === selectedServiceId) || MICROSERVICES_SPECS[0];

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
            10 domain-isolated services communicating over Apache Kafka topics and real-time WebSocket push streams.
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

      {/* 10 Service Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {MICROSERVICES_SPECS.map((svc) => {
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
              <div className="mt-1 font-mono text-[11px] text-slate-500 truncate">{svc.runtime}</div>
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
                {selectedSpec.runtime} · {selectedSpec.protocol}
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

          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Go Service Domain Handler Blueprint
            </div>
            <pre className="overflow-x-auto rounded-lg bg-[#0B1220] p-4 font-mono text-xs leading-relaxed text-slate-200">
              <code>{selectedSpec.goSnippet}</code>
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

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[380px] overflow-y-auto">
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
    </section>
  );
};
