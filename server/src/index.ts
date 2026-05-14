import http from 'http';
import express from 'express';
import os from 'os';
import path from 'path';
import { installNode12ColyseusCompat } from './node12Compat';
import { getRuntimeConfigPath, loadRuntimeConfig } from './runtimeConfig';

installNode12ColyseusCompat();

const Module = require('module') as {
  _resolveFilename: (request: string, parent: unknown, isMain: boolean, options?: unknown) => string;
};
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveSharedAlias(request: string, parent: unknown, isMain: boolean, options?: unknown): string {
  if (request.indexOf('@shared/') === 0) {
    return resolveFilename.call(this, path.join(__dirname, '../../shared/src', request.slice('@shared/'.length)), parent, isMain, options);
  }

  return resolveFilename.call(this, request, parent, isMain, options);
};

const { Server } = require('@colyseus/core') as typeof import('@colyseus/core');
const { WebSocketTransport } = require('@colyseus/ws-transport') as typeof import('@colyseus/ws-transport');
const { GameRoom } = require('./rooms/GameRoom') as typeof import('./rooms/GameRoom');

const app = express();
const runtimeConfig = loadRuntimeConfig();
const PORT = Number(process.env.PORT) || runtimeConfig.server.port;
const HOST = process.env.HOST || runtimeConfig.server.host;
const clientDistPath = path.resolve(__dirname, '../../../../dist/client');
const server = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server })
});

gameServer.define('game_room', GameRoom);

app.get('/runtime-config.json', (req, res) => {
  const websocketHost = runtimeConfig.websocket.host === 'auto'
    ? req.hostname
    : runtimeConfig.websocket.host;

  res.json({
    websocket: {
      protocol: runtimeConfig.websocket.protocol,
      host: websocketHost,
      port: runtimeConfig.websocket.port,
      path: runtimeConfig.websocket.path
    }
  });
});

// Serve static files from dist/client
app.use(express.static(clientDistPath));

// Handle SPA routing - return index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

server.listen(PORT, HOST, () => {
  const lanAddress = getLanAddress();

  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Bind address: ${HOST}:${PORT}`);
  console.log(`Runtime config: ${getRuntimeConfigPath()}`);
  console.log(`LAN URL: http://${lanAddress}:${PORT}`);
  console.log('Colyseus room registered: game_room');
});

function getLanAddress(): string {
  const interfaces = os.networkInterfaces();
  const names = Object.keys(interfaces);

  for (let i = 0; i < names.length; i++) {
    const entries = interfaces[names[i]];
    if (!entries) {
      continue;
    }

    for (let j = 0; j < entries.length; j++) {
      const entry = entries[j];
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }

  return 'localhost';
}
