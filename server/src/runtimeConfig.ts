import fs from 'fs';
import path from 'path';

export type RuntimeConfig = {
  server: {
    host: string;
    port: number;
  };
  client: {
    protocol: 'http' | 'https';
    host: string;
    port: number;
  };
  websocket: {
    protocol: 'ws' | 'wss';
    host: string;
    port: number;
    path: string;
  };
};

const DEFAULT_CONFIG: RuntimeConfig = {
  server: {
    host: '0.0.0.0',
    port: 3000
  },
  client: {
    protocol: 'http',
    host: 'localhost',
    port: 3000
  },
  websocket: {
    protocol: 'ws',
    host: 'auto',
    port: 3000,
    path: ''
  }
};

export function loadRuntimeConfig(): RuntimeConfig {
  const configPath = findConfigPath();
  const parsed = readJson(configPath);

  return normalizeConfig(parsed);
}

export function getRuntimeConfigPath(): string {
  return findConfigPath();
}

function findConfigPath(): string {
  if (process.env.RADIATION_CONFIG) {
    return path.resolve(process.env.RADIATION_CONFIG);
  }

  const candidates = [
    path.resolve(process.cwd(), 'config.json'),
    path.resolve(__dirname, '../../../config.json'),
    path.resolve(__dirname, '../../../../config.json')
  ];

  for (let i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) {
      return candidates[i];
    }
  }

  return candidates[0];
}

function readJson(configPath: string): unknown {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.warn(`Cannot read runtime config ${configPath}. Falling back to defaults.`);
    return {};
  }
}

function normalizeConfig(value: unknown): RuntimeConfig {
  const source = isRecord(value) ? value : {};
  const server = isRecord(source.server) ? source.server : {};
  const client = isRecord(source.client) ? source.client : {};
  const websocket = isRecord(source.websocket) ? source.websocket : {};

  const serverPort = toPort(server.port, DEFAULT_CONFIG.server.port);

  return {
    server: {
      host: toStringValue(server.host, DEFAULT_CONFIG.server.host),
      port: serverPort
    },
    client: {
      protocol: toHttpProtocol(client.protocol, DEFAULT_CONFIG.client.protocol),
      host: toStringValue(client.host, DEFAULT_CONFIG.client.host),
      port: toPort(client.port, serverPort)
    },
    websocket: {
      protocol: toWsProtocol(websocket.protocol, DEFAULT_CONFIG.websocket.protocol),
      host: toStringValue(websocket.host, DEFAULT_CONFIG.websocket.host),
      port: toPort(websocket.port, serverPort),
      path: toStringValue(websocket.path, DEFAULT_CONFIG.websocket.path)
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toStringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function toPort(value: unknown, fallback: number): number {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 && port <= 65535 ? Math.floor(port) : fallback;
}

function toHttpProtocol(value: unknown, fallback: 'http' | 'https'): 'http' | 'https' {
  return value === 'https' || value === 'http' ? value : fallback;
}

function toWsProtocol(value: unknown, fallback: 'ws' | 'wss'): 'ws' | 'wss' {
  return value === 'wss' || value === 'ws' ? value : fallback;
}
