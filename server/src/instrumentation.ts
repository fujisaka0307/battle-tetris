/**
 * OpenTelemetry SDK bootstrap.
 * Must be imported before any other module to enable auto-instrumentation patching.
 *
 * Skipped when OTEL_EXPORTER_OTLP_ENDPOINT is not set (safe for development).
 */

export {};

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  // Dynamic import to avoid loading OTel when not needed
  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { Resource } = await import('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import(
    '@opentelemetry/semantic-conventions'
  );
  const { OTLPTraceExporter } = await import(
    '@opentelemetry/exporter-trace-otlp-proto'
  );
  const { OTLPMetricExporter } = await import(
    '@opentelemetry/exporter-metrics-otlp-proto'
  );
  const { OTLPLogExporter } = await import(
    '@opentelemetry/exporter-logs-otlp-proto'
  );
  const { PeriodicExportingMetricReader } = await import(
    '@opentelemetry/sdk-metrics'
  );
  const { getNodeAutoInstrumentations } = await import(
    '@opentelemetry/auto-instrumentations-node'
  );
  const { BatchLogRecordProcessor } = await import('@opentelemetry/sdk-logs');

  // Parse OTEL_EXPORTER_OTLP_HEADERS (format: "key=value,key2=value2")
  // The value may contain '=' (e.g. Base64), so split only on the first '='
  const headersEnv = process.env.OTEL_EXPORTER_OTLP_HEADERS;
  const parsedHeaders: Record<string, string> = {};
  if (headersEnv) {
    for (const pair of headersEnv.split(',')) {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        parsedHeaders[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
      }
    }
  }

  const commonOpts = { headers: parsedHeaders };

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: 'battle-tetris-server',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.1.0',
    'deployment.environment':
      process.env.NODE_ENV === 'production' ? 'production' : 'development',
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
      ...commonOpts,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${endpoint}/v1/metrics`,
        ...commonOpts,
        temporalityPreference: 1, // DELTA — required by Grafana Cloud Mimir
      }),
      exportIntervalMillis: 30_000,
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(new OTLPLogExporter({
        url: `${endpoint}/v1/logs`,
        ...commonOpts,
      })),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => req.url === '/health',
        },
      }),
    ],
  });

  sdk.start();

  const shutdown = async () => {
    await sdk.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
