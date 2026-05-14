import fs from 'fs';
import Module from 'module';

type JsLoader = (module: NodeModule, filename: string) => void;
type CompilableModule = NodeModule & {
  _compile(source: string, filename: string): void;
};

const COLYSEUS_NODE12_PATCHES: Array<[string, string]> = [
  [
    "this.transport.server?.on('error', (err) => reject(err));",
    "if (this.transport.server) { this.transport.server.on('error', (err) => reject(err)); }"
  ],
  [
    'if (options?.afterNextPatch) {',
    'if (options && options.afterNextPatch) {'
  ]
];

export function installNode12ColyseusCompat(): void {
  const major = Number(process.versions.node.split('.')[0]);

  if (major >= 14) {
    return;
  }

  const extensions = (Module as unknown as { _extensions: Record<string, JsLoader> })._extensions;
  const defaultLoader = extensions['.js'];

  extensions['.js'] = (module: NodeModule, filename: string): void => {
    const normalizedFilename = filename.replace(/\\/g, '/');

    if (!normalizedFilename.includes('/node_modules/@colyseus/')) {
      defaultLoader(module, filename);
      return;
    }

    let source = fs.readFileSync(filename, 'utf8');

    for (const [from, to] of COLYSEUS_NODE12_PATCHES) {
      source = source.split(from).join(to);
    }

    (module as CompilableModule)._compile(source, filename);
  };
}
