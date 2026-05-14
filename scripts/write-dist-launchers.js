const fs = require('fs');
const path = require('path');

const rootPath = path.resolve(__dirname, '..');
const distPath = path.join(rootPath, 'dist');
const distScriptsPath = path.join(distPath, 'scripts');

const defaultConfig = {
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
  },
  admin: {
    password: 'radiation'
  }
};

fs.mkdirSync(distPath, { recursive: true });
fs.mkdirSync(distScriptsPath, { recursive: true });

writeConfigTemplate();
copyRuntimeDirectory('node');
copyRuntimeDirectory('node_modules');
writeNodeCommandBridges();
removeOldClientLaunchers();
writeLauncherScripts();
writePlatformLaunchers();

function writeConfigTemplate() {
  const configPath = path.join(distPath, 'config.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`, 'utf8');
  }
}

function copyRuntimeDirectory(directoryName) {
  const source = path.join(rootPath, directoryName);
  const target = path.join(distPath, directoryName);

  if (!fs.existsSync(source)) {
    console.warn(`Runtime directory not found, skipped: ${source}`);
    return;
  }

  copyDirectory(source, target, (entryPath) => {
    const name = path.basename(entryPath);
    return name === '.cache' || name === '.vite' || name === '.bin';
  });
}

function writeLauncherScripts() {
  writeFile('scripts/launch-server.js', [
    "const childProcess = require('child_process');",
    "const fs = require('fs');",
    "const path = require('path');",
    '',
    'const distPath = path.resolve(__dirname, "..");',
    'const configPath = ensureConfig(distPath);',
    'const serverPath = path.join(distPath, "server", "server", "src", "index.js");',
    'const nodePath = process.execPath;',
    'console.log(process.version);',
    'const child = childProcess.spawn(nodePath, [serverPath], {',
    '  cwd: distPath,',
    '  stdio: "inherit",',
    '  env: Object.assign({}, process.env, { RADIATION_CONFIG: configPath })',
    '});',
    'child.on("exit", (code) => process.exit(typeof code === "number" ? code : 1));',
    '',
    ensureConfigFunctionSource()
  ].join('\n'));
}

function writePlatformLaunchers() {
  writeFile('start-win7.bat', [
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'set "NODE_EXE=%~dp0node\\win7\\node.exe"',
    'if not exist "%NODE_EXE%" if exist "%~dp0node\\win7\\bin\\node.exe" set "NODE_EXE=%~dp0node\\win7\\bin\\node.exe"',
    'if not exist "%NODE_EXE%" (',
    '  echo Bundled Node.js not found: %~dp0node\\win7\\node.exe',
    '  echo Install/copy the bundled runtime into the dist\\node\\win7 folder.',
    '  pause',
    '  exit /b 1',
    ')',
    'echo CS 1.8 Radiation server',
    '"%NODE_EXE%" "%~dp0scripts\\launch-server.js"',
    'pause'
  ].join('\r\n') + '\r\n');

  writeFile('start-astra.sh', [
    '#!/bin/sh',
    'DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
    'NODE_EXE="$DIR/node/astra/node"',
    'if [ ! -x "$NODE_EXE" ] && [ -x "$DIR/node/astra/bin/node" ]; then NODE_EXE="$DIR/node/astra/bin/node"; fi',
    'if [ ! -x "$NODE_EXE" ]; then',
    '  echo "Bundled Node.js not found: $DIR/node/astra/node" >&2',
    '  echo "Install/copy the bundled runtime into the dist/node/astra folder." >&2',
    '  exit 1',
    'fi',
    'cd "$DIR" || exit 1',
    'echo "CS 1.8 Radiation server"',
    '"$NODE_EXE" "$DIR/scripts/launch-server.js"'
  ].join('\n') + '\n', 0o755);
}

function removeOldClientLaunchers() {
  [
    'start-client-astra.sh',
    'start-client-win7.bat',
    'start-server-astra.sh',
    'start-server-win7.bat',
    path.join('scripts', 'launch-client.js')
  ].forEach((relativePath) => {
    const target = path.join(distPath, relativePath);
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
  });
}

function writeNodeCommandBridges() {
  const astraPath = path.join(distPath, 'node', 'astra');
  const astraBinPath = path.join(astraPath, 'bin');

  if (fs.existsSync(path.join(astraBinPath, 'node')) && !fs.existsSync(path.join(astraPath, 'node'))) {
    writeFile('node/astra/node', [
      '#!/bin/sh',
      'DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
      'exec "$DIR/bin/node" "$@"'
    ].join('\n') + '\n', 0o755);
  }

  if (fs.existsSync(path.join(astraBinPath, 'npm')) && !fs.existsSync(path.join(astraPath, 'npm'))) {
    writeFile('node/astra/npm', [
      '#!/bin/sh',
      'DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
      'exec "$DIR/bin/npm" "$@"'
    ].join('\n') + '\n', 0o755);
  }
}

function ensureConfigFunctionSource() {
  return [
    'function ensureConfig(distPath) {',
    '  const configPath = path.join(distPath, "config.json");',
    '  if (!fs.existsSync(configPath)) {',
    `    fs.writeFileSync(configPath, ${JSON.stringify(`${JSON.stringify(defaultConfig, null, 2)}\n`)}, "utf8");`,
    '  }',
    '  return configPath;',
    '}'
  ].join('\n');
}

function writeFile(relativePath, content, mode) {
  const target = path.join(distPath, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  if (mode) {
    fs.chmodSync(target, mode);
  }
}

function copyDirectory(source, target, shouldSkip) {
  if (shouldSkip && shouldSkip(source)) {
    return;
  }

  const stat = fs.lstatSync(source);

  if (stat.isSymbolicLink()) {
    const linkTarget = fs.readlinkSync(source);
    try {
      fs.symlinkSync(linkTarget, target);
    } catch (error) {
      // Windows without symlink permissions: skip npm helper links, real package
      // files are copied separately.
    }
    return;
  }

  if (!stat.isDirectory()) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    return;
  }

  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source).forEach((entry) => {
    copyDirectory(path.join(source, entry), path.join(target, entry), shouldSkip);
  });
}
