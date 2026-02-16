import { createServer } from 'http';
import app from './app.js';
import { LocalSignalRAdapter } from './hubs/LocalSignalRAdapter.js';

const PORT = Number(process.env.PORT ?? 4000);

// Azure AD 環境変数の起動時チェック
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID) {
  console.warn(
    'WARNING: AZURE_TENANT_ID and/or AZURE_CLIENT_ID not set. JWT authentication will reject all tokens.',
  );
}

// Create HTTP server from Express app
const server = createServer(app);

// Set up the local SignalR adapter (WebSocket-based)
const adapter = new LocalSignalRAdapter();
adapter.setup(app, server);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  SignalR Hub: ws://localhost:${PORT}/hub`);
});
