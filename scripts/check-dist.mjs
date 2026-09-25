/*
 * Después de `npm run build`: carga dist/ como lo hace n8n (las rutas de `n8n` en package.json), y
 * verifica que cada nodo y credencial se instancie, que sus íconos y el codex estén en dist, y que el
 * nodo no requiera nada fuera de n8n-workflow.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const problems = [];

function load(file) {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) return problems.push(`${file} does not exist: run npm run build`), null;
  const mod = require(abs);
  const Class = Object.values(mod).find((v) => typeof v === 'function');
  if (!Class) return problems.push(`${file} exports no class`), null;
  return { abs, instance: new Class() };
}

function icons(abs, icon, what) {
  const list = typeof icon === 'string' ? [icon] : [icon?.light, icon?.dark];
  for (const i of list) {
    if (!i?.startsWith('file:')) problems.push(`${what}: icon ${i} does not use file:`);
    else if (!fs.existsSync(path.resolve(path.dirname(abs), i.slice(5)))) problems.push(`${what}: icon ${i} is not in dist`);
  }
}

for (const file of pkg.n8n.credentials) {
  const c = load(file);
  if (!c) continue;
  icons(c.abs, c.instance.icon, file);
  if (!c.instance.test?.request?.url) problems.push(`${file}: no credential test`);
}

for (const file of pkg.n8n.nodes) {
  const n = load(file);
  if (!n) continue;
  icons(n.abs, n.instance.description.icon, file);
  const codex = n.abs.replace(/\.js$/, '.json');
  if (!fs.existsSync(codex)) problems.push(`${file}: codex ${path.basename(codex)} is not in dist`);
  const source = fs.readFileSync(n.abs, 'utf8');
  for (const [, mod] of source.matchAll(/require\("([^"]+)"\)/g)) {
    if (!mod.startsWith('.') && mod !== 'n8n-workflow') problems.push(`${file}: requires ${mod}`);
  }
}

// Los helpers del nodo tampoco pueden requerir otra cosa.
for (const f of fs.readdirSync(path.join(root, 'dist/nodes'), { recursive: true })) {
  if (!String(f).endsWith('.js')) continue;
  const source = fs.readFileSync(path.join(root, 'dist/nodes', String(f)), 'utf8');
  for (const [, mod] of source.matchAll(/require\("([^"]+)"\)/g)) {
    if (!mod.startsWith('.') && mod !== 'n8n-workflow') problems.push(`dist/nodes/${f}: requires ${mod}`);
  }
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log(`dist OK: ${pkg.n8n.nodes.length} node, ${pkg.n8n.credentials.length} credential`);
