import http from 'http';
import express from 'express';
import path from 'path';
import { installNode12ColyseusCompat } from './node12Compat';

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
const PORT = 3000;
const clientDistPath = path.join(__dirname, '../../../../dist/client');
const server = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server })
});

gameServer.define('game_room', GameRoom);

// Serve static files from dist/client
app.use(express.static(clientDistPath));

// Handle SPA routing - return index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Colyseus room registered: game_room');
});
