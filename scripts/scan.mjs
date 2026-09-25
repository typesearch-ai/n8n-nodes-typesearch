/*
 * El análisis estático de @n8n/scan-community-package, antes de publicar. El scanner oficial sólo
 * escanea paquetes ya publicados (verifica la provenance en npm, baja el código del commit atestiguado y
 * el tarball); acá se corre su misma función de análisis, con su misma configuración de ESLint, sobre este
 * código fuente y sobre el tarball de `npm pack`. Necesita `npm run build` antes.
 *
 * Instala la versión más nueva del scanner en una carpeta temporal, sin scripts de instalación (un
 * plugin suyo trae un `preinstall` que sólo acepta pnpm) y con un TypeScript que su parser acepta (la
 * 0.37.0 pide typescript 7, que @typescript-eslint todavía no soporta). Si n8n cambia sus funciones
 * internas, avisa y no falla: el scanner de verdad se corre igual después de publicar (ver PUBLICAR.md).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const spec = process.env.N8N_SCANNER ?? '@n8n/scan-community-package@latest';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-scan-'));

async function main() {
  const install = ['install', '--prefix', tmp, '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', '--loglevel=error'];
  execFileSync('npm', [...install, spec, 'typescript@>=5.9 <6.1', 'n8n-workflow'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const scannerDir = path.join(tmp, 'node_modules/@n8n/scan-community-package');
  const version = JSON.parse(fs.readFileSync(path.join(scannerDir, 'package.json'), 'utf8')).version;
  const scanner = await import(pathToFileURL(path.join(scannerDir, 'scanner/scanner.mjs')).href);

  if (typeof scanner.analyzePackage !== 'function' || !Array.isArray(scanner.SOURCE_FILE_PATTERNS)) {
    console.warn(`⚠ @n8n/scan-community-package ${version} changed its internals: skipped. Run it on the published package (PUBLICAR.md).`);
    return 0;
  }

  // El tarball, como lo baja el scanner: npm pack y descomprimido.
  const tarball = execFileSync('npm', ['pack', '--silent', '--pack-destination', tmp], { cwd: root, encoding: 'utf8' }).trim().split('\n').pop();
  const unpacked = path.join(tmp, 'package');
  fs.mkdirSync(unpacked);
  execFileSync('tar', ['-xzf', path.join(tmp, tarball), '-C', unpacked, '--strip-components=1']);

  const source = await scanner.analyzePackage(root, scanner.SOURCE_FILE_PATTERNS);
  const dist = await scanner.analyzePackage(unpacked, ['**/*.js', 'package.json']);

  console.log(`@n8n/scan-community-package ${version}`);
  console.log(`  source (package.json, nodes/, credentials/): ${source.passed ? 'passed' : `FAILED: ${source.message}`}`);
  console.log(`  tarball (dist/**/*.js, package.json):       ${dist.passed ? 'passed' : `FAILED: ${dist.message}`}`);
  for (const r of [source, dist]) if (r.details) console.log(r.details);
  return source.passed && dist.passed ? 0 : 1;
}

let code = 1;
try {
  code = await main();
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(code);
