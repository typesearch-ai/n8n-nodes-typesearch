/*
 * Copia del OpenAPI de typesearch los esquemas que usa la API falsa de las pruebas (los pedidos y las
 * respuestas de las rutas que llama el nodo) a test/fixtures/openapi-schemas.json.
 *
 *   npm run schemas                         el OpenAPI vivo (https://api.typesearch.ai/v1/openapi.json)
 *   npm run schemas -- ruta/a/openapi.json  un archivo local
 */
import fs from 'node:fs';

const LIVE = 'https://api.typesearch.ai/v1/openapi.json';
const NAMES = ['SearchRequest', 'SimilarRequest', 'ContentsRequest', 'SearchResponse', 'ContentsResponse', 'Sources', 'Source', 'Usage', 'Problem'];

const source = process.argv[2] ?? LIVE;
const openapi = /^https?:\/\//.test(source)
  ? await (await fetch(source, { headers: { Accept: 'application/json' } })).json()
  : JSON.parse(fs.readFileSync(source, 'utf8'));

const all = openapi.components?.schemas ?? {};
const schemas = {};
function visit(name) {
  if (schemas[name]) return;
  if (!all[name]) throw new Error(`The OpenAPI has no schema ${name}`);
  schemas[name] = all[name];
  for (const m of JSON.stringify(all[name]).matchAll(/#\/components\/schemas\/([\w-]+)/g)) visit(m[1]);
}
NAMES.forEach(visit);

const out = new URL('../test/fixtures/openapi-schemas.json', import.meta.url);
const fixture = { openapi: openapi.openapi, version: openapi.info?.version, components: { schemas } };
fs.writeFileSync(out, `${JSON.stringify(fixture)}\n`);
console.log(`${Object.keys(schemas).length} schemas, ${fs.statSync(out).size} bytes → test/fixtures/openapi-schemas.json`);
