const fs = require('fs');
const path = require('path');

const distPath = path.resolve(__dirname, '..', 'dist');

function writeLauncher(fileName, lines) {
  fs.writeFileSync(path.join(distPath, fileName), lines.join('\r\n') + '\r\n', 'utf8');
}

const detectIpLines = [
  'set "LAN_IP="',
  'for /f "tokens=2 delims=:" %%I in (\'ipconfig ^| findstr /R /C:"IPv4"\') do if not defined LAN_IP set "LAN_IP=%%I"',
  'set "LAN_IP=%LAN_IP: =%"',
  'if "%LAN_IP%"=="" set "LAN_IP=localhost"'
];

fs.mkdirSync(distPath, { recursive: true });

writeLauncher('start-server.bat', [
  '@echo off',
  'setlocal',
  'cd /d "%~dp0"',
  'set "NODE_EXE=%~dp0node\\node.exe"',
  'if not exist "%NODE_EXE%" set "NODE_EXE=node"',
  ...detectIpLines,
  'echo.',
  'echo CS 1.8 Radiation server',
  'echo LAN URL: http://%LAN_IP%:3000',
  'echo.',
  '"%NODE_EXE%" "%~dp0server\\server\\src\\index.js"',
  'pause'
]);

writeLauncher('start-client.bat', [
  '@echo off',
  'setlocal',
  'cd /d "%~dp0"',
  ...detectIpLines,
  'echo Opening http://%LAN_IP%:3000',
  'start "" "http://%LAN_IP%:3000"'
]);
