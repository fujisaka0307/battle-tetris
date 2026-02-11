import { createServer } from 'http';
import app from './app.js';
import { LocalSignalRAdapter } from './hubs/LocalSignalRAdapter.js';

const PORT = Number(process.env.PORT ?? 4000);

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
