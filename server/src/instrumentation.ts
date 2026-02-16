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

  const headers = process.env.OTEL_EXPORTER_OTLP_HEADERS;
  const parsedHeaders: Record<string, string> = {};
  if (headers) {
    for (const pair of headers.split(',')) {
      const [key, ...rest] = pair.split('=');
      if (key && rest.length > 0) {
        parsedHeaders[key.trim()] = rest.join('=').trim();
      }
    }
  }

  const exporterOptions = {
    url: `${endpoint}/v1/traces`,
    headers: parsedHeaders,
  };
  const metricExporterOptions = {
    url: `${endpoint}/v1/metrics`,
    headers: parsedHeaders,
  };
  const logExporterOptions = {
    url: `${endpoint}/v1/logs`,
    headers: parsedHeaders,
  };

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: 'battle-tetris-server',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.1.0',
    'deployment.environment':
      process.env.NODE_ENV === 'production' ? 'production' : 'development',
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter(exporterOptions),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(metricExporterOptions),
      exportIntervalMillis: 30_000,
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(new OTLPLogExporter(logExporterOptions)),
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
