import http from 'http';
import express from 'express';
import path from 'path';
import { installNode12ColyseusCompat } from './node12Compat';

installNode12ColyseusCompat();

const { Server } = require('@colyseus/core') as typeof import('@colyseus/core');
const { WebSocketTransport } = require('@colyseus/ws-transport') as typeof import('@colyseus/ws-transport');
const { GameRoom } = require('./rooms/GameRoom') as typeof import('./rooms/GameRoom');

const app = express();
const PORT = 3000;
const clientDistPath = path.join(__dirname, '../../dist/client');
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
