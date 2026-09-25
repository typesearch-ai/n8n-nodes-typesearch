/*
 * Lo que n8n y su verificación miran del paquete y de la descripción del nodo: nombres, íconos, codex,
 * herramienta para el AI Agent, sin dependencias en tiempo de ejecución, y que no se nombren medios reales.
 */
import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { Typesearch } from '../nodes/Typesearch/Typesearch.node.ts';
import { TypesearchApi } from '../credentials/TypesearchApi.credentials.ts';
import { VERSION } from '../nodes/Typesearch/version.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => fs.readFileSync(new URL(path, root), 'utf8');
const pkg = JSON.parse(read('package.json'));
const codex = JSON.parse(read('nodes/Typesearch/Typesearch.node.json'));
const { description } = new Typesearch();

/** Una ruta `file:` relativa al archivo que la declara, como la resuelve n8n. */
const iconExists = (from: string, icon: string) =>
	fs.existsSync(new URL(icon.replace(/^file:/, ''), new URL(from, root)));

describe('package.json', () => {
	test('community node conventions', () => {
		expect(pkg.name).toBe('n8n-nodes-typesearch');
		expect(pkg.keywords).toContain('n8n-community-node-package');
		expect(pkg.license).toBe('MIT');
		expect(pkg.version).toBe(VERSION);
		expect(pkg.n8n).toEqual({
			n8nNodesApiVersion: 1,
			strict: true,
			credentials: ['dist/credentials/TypesearchApi.credentials.js'],
			nodes: ['dist/nodes/Typesearch/Typesearch.node.js'],
		});
		for (const file of [...pkg.n8n.credentials, ...pkg.n8n.nodes]) {
			expect(
				fs.existsSync(new URL(file.replace(/^dist\//, '').replace(/\.js$/, '.ts'), root)),
			).toBe(true);
		}
	});

	test('no runtime dependencies; n8n-workflow only as a peer', () => {
		expect(pkg.dependencies ?? {}).toEqual({});
		expect(pkg.peerDependencies).toEqual({ 'n8n-workflow': '*' });
		expect(pkg.files).toEqual(['dist', 'CHANGELOG.md']);
	});

	test('published with provenance, never from an install script', () => {
		expect(pkg.publishConfig).toEqual({ access: 'public', provenance: true });
		for (const s of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish'])
			expect(pkg.scripts[s]).toBeUndefined();
	});
});

describe('node description', () => {
	test('name, version, credential and use as an AI Agent tool', () => {
		expect(description.name).toBe('typesearch');
		expect(description.version).toBe(1);
		expect(description.usableAsTool).toBe(true);
		expect(description.credentials).toEqual([{ name: new TypesearchApi().name, required: true }]);
	});

	test('light and dark icons exist, for the node and the credential', () => {
		const icon = description.icon as { light: string; dark: string };
		expect(iconExists('nodes/Typesearch/Typesearch.node.ts', icon.light)).toBe(true);
		expect(iconExists('nodes/Typesearch/Typesearch.node.ts', icon.dark)).toBe(true);
		const credIcon = new TypesearchApi().icon as { light: string; dark: string };
		expect(iconExists('credentials/TypesearchApi.credentials.ts', credIcon.light)).toBe(true);
		expect(iconExists('credentials/TypesearchApi.credentials.ts', credIcon.dark)).toBe(true);
	});

	test('every operation has an action (the tool description in n8n) and a description', () => {
		const operations = description.properties.filter((p) => p.name === 'operation');
		const options = operations.flatMap((p) => p.options as INodePropertyOptions[]);
		expect(options.map((o) => o.value).sort()).toEqual([
			'checkCoverage',
			'findSimilar',
			'getContents',
			'search',
		]);
		for (const o of options) {
			expect(o.action).toMatch(/^[A-Z][a-z]/);
			expect((o.description ?? '').length).toBeGreaterThan(40);
		}
	});

	test('mode defaults to fast and max results to 10, from 1 to 50', () => {
		const mode = description.properties.find((p) => p.name === 'mode') as INodeProperties;
		expect(mode.default).toBe('fast');
		expect((mode.options as INodePropertyOptions[]).map((o) => o.value)).toEqual([
			'ultra',
			'fast',
			'normal',
			'deep',
		]);
		const max = description.properties.find((p) => p.name === 'maxResults') as INodeProperties;
		expect(max).toMatchObject({ default: 10, typeOptions: { minValue: 1, maxValue: 50 } });
	});

	test('codex: node id, categories and documentation', () => {
		expect(codex.node).toBe(`${pkg.name}.${description.name}`);
		expect(codex.categories.length).toBeGreaterThan(0);
		expect(codex.resources.primaryDocumentation[0].url).toBe(
			'https://typesearch.ai/docs/integrations/n8n',
		);
	});

	test('the English copy names no real outlet and no price', () => {
		const copy = JSON.stringify(description) + read('README.md');
		expect(copy).not.toMatch(/\$\s?\d/);
		// Los dominios de ejemplo son siempre .example.
		const domains = [...copy.matchAll(/\b([a-z0-9-]+\.)+(com|net|org|ar|es|uk|io)\b/gi)].map((m) =>
			m[0].toLowerCase(),
		);
		const allowed = /(^|\.)(typesearch\.ai|n8n\.io|npmjs\.com|github\.com|example\.(com|org))$/;
		expect(domains.filter((d) => !allowed.test(d))).toEqual([]);
	});
});

describe('example workflow', () => {
	test('uses this node with parameters it has', () => {
		const workflow = JSON.parse(read('examples/search-news.json'));
		const nodes = workflow.nodes.filter((n: { type: string }) => n.type === codex.node);
		expect(nodes.length).toBeGreaterThan(0);
		const names = new Set(description.properties.map((p) => p.name));
		for (const n of nodes) {
			expect(n.typeVersion).toBe(description.version);
			for (const key of Object.keys(n.parameters)) expect(names).toContain(key);
			const options = description.properties.find(
				(p) =>
					p.name === 'options' &&
					p.displayOptions?.show?.operation?.includes(n.parameters.operation),
			);
			const optionNames = new Set((options?.options as INodeProperties[]).map((o) => o.name));
			for (const key of Object.keys(n.parameters.options ?? {})) expect(optionNames).toContain(key);
			expect(Object.keys(n.credentials)).toEqual([new TypesearchApi().name]);
		}
	});
});
