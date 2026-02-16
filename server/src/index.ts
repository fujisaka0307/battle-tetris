import './instrumentation.js';
import { createServer } from 'http';
import app from './app.js';
import { LocalSignalRAdapter } from './hubs/LocalSignalRAdapter.js';
import { logger } from './lib/logger.js';
import { getDb, closeDb } from './db/database.js';

const PORT = Number(process.env.PORT ?? 4000);

// Azure AD 環境変数の起動時チェック
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID) {
  logger.warn(
    'AZURE_TENANT_ID and/or AZURE_CLIENT_ID not set. JWT authentication will reject all tokens.',
  );
}

// Initialize SQLite database
try {
  getDb();
} catch (err) {
  logger.error({ err }, 'Failed to initialize SQLite database — ranking/history features disabled');
}

// Create HTTP server from Express app
const server = createServer(app);

// Set up the local SignalR adapter (WebSocket-based)
const adapter = new LocalSignalRAdapter();
adapter.setup(app, server);

server.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server listening');
  logger.info({ url: `http://localhost:${PORT}/health` }, 'Health endpoint');
  logger.info({ url: `ws://localhost:${PORT}/hub` }, 'SignalR Hub endpoint');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  closeDb();
  server.close();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down...');
  closeDb();
  server.close();
});
