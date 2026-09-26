/*
 * El nodo contra la API falsa: cada operación, los parámetros opcionales, la cabecera de la clave, los
 * errores (401, 402, 429, 400, 5xx, sin red) como NodeApiError y el modo que sigue ante errores.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { NodeApiError, NodeOperationError, type IDataObject } from 'n8n-workflow';
import { Typesearch } from '../nodes/Typesearch/Typesearch.node.ts';
import { toDate, toList, toUrlList } from '../nodes/Typesearch/operations.ts';
import { VERSION } from '../nodes/Typesearch/version.ts';
import { FakeApi, KEY, article, problem, searchResponse } from './fake-api.mts';
import { runNode, type RunOptions } from './context.mts';

const api = new FakeApi();
const node = new Typesearch();

beforeAll(async () => {
	await api.start();
});
afterAll(async () => {
	await api.close();
});
beforeEach(() => api.reset());

const run = (params: RunOptions['params'], extra: Partial<RunOptions> = {}) =>
	runNode(node, { params, credentials: { apiKey: KEY, baseUrl: api.url }, ...extra });

/** El error que lanza el nodo, para mirarlo. */
async function failure(params: RunOptions['params'], extra: Partial<RunOptions> = {}) {
	try {
		await run(params, extra);
	} catch (e) {
		return e as NodeApiError & NodeOperationError;
	}
	throw new Error('El nodo no falló');
}

const SIMPLIFIED_KEYS = [
	'title',
	'url',
	'source',
	'published_at',
	'country',
	'language',
	'snippet',
	'highlights',
	'score',
];

describe('search', () => {
	test('sends the query with the defaults (fast, 10) and the key as a bearer token', async () => {
		const { output, calls } = await run({ query: 'el dólar' });

		expect(api.requests).toHaveLength(1);
		const req = api.last;
		expect(req.method).toBe('POST');
		expect(req.path).toBe('/v1/search');
		expect(req.body).toEqual({ query: 'el dólar', mode: 'fast', max_results: 10 });
		expect(req.headers.authorization).toBe(`Bearer ${KEY}`);
		expect(req.headers['user-agent']).toBe(`n8n-nodes-typesearch/${VERSION}`);
		expect(req.headers['content-type']).toMatch(/^application\/json/);

		// El nodo le pasa el pedido al helper de n8n sin la clave: la pone la credencial.
		expect(calls[0]).toMatchObject({
			method: 'POST',
			url: '/v1/search',
			baseURL: api.url,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			json: true,
		});
		expect(JSON.stringify(calls[0])).not.toContain(KEY);

		expect(output).toHaveLength(2);
		expect(Object.keys(output[0]!.json)).toEqual(SIMPLIFIED_KEYS);
		expect(output[0]!.json).toMatchObject({
			title: 'El dólar cerró estable por 1ª rueda',
			url: 'https://diarioejemplo.example/economia/nota-1',
			source: 'Diario Ejemplo',
			country: 'AR',
			language: 'es',
			highlights: [],
			score: 0.95,
		});
		expect(output[1]!.json.highlights).toEqual([
			'El dólar mayorista terminó la jornada sin variaciones',
		]);
		expect(output.map((o) => o.pairedItem)).toEqual([{ item: 0 }, { item: 0 }]);
	});

	test('maps every option to the API names, and the fake API accepts the body', async () => {
		await run({
			query: 'inflación',
			mode: 'deep',
			maxResults: 25,
			options: {
				countries: 'ar, us',
				languages: 'ES,en',
				includeDomains: 'diarioejemplo.example, reddiaria.example/economia',
				excludeDomains: 'otro.example',
				days: 3,
				publishedAfter: '2026-09-20T00:00:00',
				publishedBefore: '2026-09-24T15:30:00',
				highlights: true,
				dedupe: true,
				tone: false,
			},
		});
		expect(api.last.body).toEqual({
			query: 'inflación',
			mode: 'deep',
			max_results: 25,
			countries: ['AR', 'US'],
			languages: ['es', 'en'],
			include_domains: ['diarioejemplo.example', 'reddiaria.example/economia'],
			exclude_domains: ['otro.example'],
			days: 3,
			published_after: '2026-09-20',
			published_before: '2026-09-24T15:30:00Z',
			highlights: true,
			dedupe: true,
			tone: false,
		});
	});

	test('takes values an AI agent sends as text or lists', async () => {
		await run({
			query: '  el FMI  ',
			mode: ' Fast',
			maxResults: '5',
			options: { countries: ['ar', 'UY'], languages: 'es\npt' },
		});
		expect(api.last.body).toEqual({
			query: 'el FMI',
			mode: 'fast',
			max_results: 5,
			countries: ['AR', 'UY'],
			languages: ['es', 'pt'],
		});
	});

	test('raw output: one item per article with every field', async () => {
		const { output } = await run({ query: 'el dólar', output: 'raw' });
		expect(output).toHaveLength(2);
		expect(output[0]!.json).toMatchObject({
			headline_relevance: 0.91,
			section: 'economia',
			found_in: 'index',
		});
	});

	test('selected fields: only those, always with the URL', async () => {
		const { output } = await run({
			query: 'el dólar',
			output: 'selectedFields',
			fields: ['title', 'score', 'section'],
		});
		expect(output).toHaveLength(2);
		expect(output[0]!.json).toEqual({
			url: 'https://diarioejemplo.example/economia/nota-1',
			title: 'El dólar cerró estable por 1ª rueda',
			score: 0.95,
			section: 'economia',
		});
	});

	test('selected fields default to title, source, date and score', async () => {
		const { output } = await run({ query: 'el dólar', output: 'selectedFields' });
		expect(Object.keys(output[0]!.json)).toEqual([
			'url',
			'title',
			'source',
			'published_at',
			'score',
		]);
	});

	test('full response: a single item with usage and warnings', async () => {
		const { output } = await run({ query: 'el dólar', output: 'fullResponse' });
		expect(output).toHaveLength(1);
		expect(output[0]!.json).toMatchObject({
			object: 'search',
			mode: 'fast',
			total: 2,
			warnings: [],
		});
		expect((output[0]!.json.results as IDataObject[]).length).toBe(2);
		expect((output[0]!.json.usage as IDataObject).cost_usd).toBeTypeOf('number');
	});

	test('simplified output keeps tone and duplicates when present', async () => {
		const tone = {
			label: 'neutral',
			probabilities: { positive: 0.1, neutral: 0.8, negative: 0.1 },
			basis: 'headline',
		};
		const duplicates = [
			{
				url: 'https://reddiaria.example/economia/nota-9',
				title: 'El dólar, estable',
				source: 'Red Diaria',
			},
		];
		api.next({
			status: 200,
			body: searchResponse({ results: [article(1, { tone, duplicates })] }),
		});
		const { output } = await run({ query: 'el dólar', options: { tone: true, dedupe: true } });
		expect(output[0]!.json.tone).toEqual(tone);
		expect(output[0]!.json.duplicates).toEqual(duplicates);
	});

	test('one request per input item, each paired with its item', async () => {
		const { output } = await run([{ query: 'el dólar' }, { query: 'el FMI', maxResults: 1 }]);
		expect(api.requests.map((r) => r.body.query)).toEqual(['el dólar', 'el FMI']);
		expect(output.map((o) => o.pairedItem)).toEqual([
			{ item: 0 },
			{ item: 0 },
			{ item: 1 },
			{ item: 1 },
		]);
	});

	test('no articles: no items', async () => {
		api.next({ status: 200, body: searchResponse({ results: [], found: false, total: 0 }) });
		const { output } = await run({ query: 'nada que ver' });
		expect(output).toEqual([]);
	});

	test('an empty query fails before calling the API', async () => {
		const e = await failure({ query: '   ' });
		expect(e).toBeInstanceOf(NodeOperationError);
		expect(e.message).toBe("The 'Query' parameter is empty");
		expect(api.requests).toHaveLength(0);
	});

	test('a base URL with a trailing slash still works', async () => {
		const { output } = await runNode(node, {
			params: { query: 'el dólar' },
			credentials: { apiKey: KEY, baseUrl: `${api.url}/` },
		});
		expect(output).toHaveLength(2);
		expect(api.last.path).toBe('/v1/search');
	});
});

describe('get contents', () => {
	test('sends the URLs and the query; simplified pages', async () => {
		const { output } = await run({
			resource: 'article',
			operation: 'getContents',
			urls: 'https://reddiaria.example/economia/presupuesto,\nhttps://unreachable.example/nota https://diarioejemplo.example/a,b',
			options: { query: 'presupuesto' },
		});
		expect(api.last.path).toBe('/v1/contents');
		expect(api.last.body).toEqual({
			urls: [
				'https://reddiaria.example/economia/presupuesto',
				'https://unreachable.example/nota',
				'https://diarioejemplo.example/a,b',
			],
			query: 'presupuesto',
		});
		expect(output).toHaveLength(3);
		expect(output[0]!.json).toEqual({
			url: 'https://reddiaria.example/economia/presupuesto',
			status: 'ok',
			title: 'Presupuesto 2027: las claves del proyecto',
			description: 'El Gobierno envió el proyecto al Congreso.',
			published_at: '2026-09-16T01:12:00.000Z',
			source: 'Red Diaria',
			excerpt: 'El proyecto prevé un superávit primario',
			relevance: 0.9749,
		});
		expect(output[1]!.json).toMatchObject({
			status: 'error',
			error: { code: 'site_unreachable', message: 'The site did not answer.' },
		});
	});

	test('without a query: no query in the body and no relevance', async () => {
		const { output } = await run({
			resource: 'article',
			operation: 'getContents',
			urls: ['https://reddiaria.example/economia/presupuesto'],
		});
		expect(api.last.body).toEqual({ urls: ['https://reddiaria.example/economia/presupuesto'] });
		expect(output[0]!.json).not.toHaveProperty('relevance');
	});

	test('selected fields for pages', async () => {
		const { output } = await run({
			resource: 'article',
			operation: 'getContents',
			urls: 'https://reddiaria.example/a',
			output: 'selectedFields',
			options: { query: 'presupuesto' },
		});
		expect(output[0]!.json).toEqual({
			url: 'https://reddiaria.example/a',
			title: 'Presupuesto 2027: las claves del proyecto',
			excerpt: 'El proyecto prevé un superávit primario',
			relevance: 0.9749,
		});
	});

	test('full response', async () => {
		const { output } = await run({
			resource: 'article',
			operation: 'getContents',
			urls: 'https://reddiaria.example/a',
			output: 'fullResponse',
		});
		expect(output).toHaveLength(1);
		expect(output[0]!.json).toMatchObject({ object: 'contents', usage: { calls: 1 } });
	});

	test('no URLs, or more than 10, fail before calling the API', async () => {
		const none = await failure({ resource: 'article', operation: 'getContents', urls: ' , ' });
		expect(none).toBeInstanceOf(NodeOperationError);
		expect(none.message).toBe("The 'URLs' parameter has no URLs");
		const urls = Array.from(
			{ length: 11 },
			(_, i) => `https://diarioejemplo.example/nota-${i}`,
		).join('\n');
		const many = await failure({ resource: 'article', operation: 'getContents', urls });
		expect(many.message).toBe("The 'URLs' parameter has 11 URLs, and the most is 10");
		expect(api.requests).toHaveLength(0);
	});
});

describe('find similar', () => {
	test('sends the URL, mode, size and filters', async () => {
		const { output } = await run({
			resource: 'article',
			operation: 'findSimilar',
			url: 'https://diarioejemplo.example/economia/nota-1',
			options: {
				days: 2,
				excludeDomains: 'diarioejemplo.example',
				countries: 'ar',
				languages: 'es',
			},
		});
		expect(api.last.path).toBe('/v1/similar');
		expect(api.last.body).toEqual({
			url: 'https://diarioejemplo.example/economia/nota-1',
			mode: 'fast',
			max_results: 10,
			days: 2,
			exclude_domains: ['diarioejemplo.example'],
			countries: ['AR'],
			languages: ['es'],
		});
		expect(output).toHaveLength(2);
		expect(Object.keys(output[0]!.json)).toEqual(SIMPLIFIED_KEYS);
	});

	test('full response includes the reference article', async () => {
		const { output } = await run({
			resource: 'article',
			operation: 'findSimilar',
			url: 'https://diarioejemplo.example/economia/nota-1',
			mode: 'deep',
			maxResults: 3,
			output: 'fullResponse',
		});
		expect(api.last.body).toMatchObject({ mode: 'deep', max_results: 3 });
		expect(output[0]!.json).toMatchObject({
			object: 'similar',
			reference: { url: 'https://diarioejemplo.example/economia/nota-1' },
		});
	});

	test('an empty URL fails before calling the API', async () => {
		const e = await failure({ resource: 'article', operation: 'findSimilar', url: '' });
		expect(e).toBeInstanceOf(NodeOperationError);
		expect(api.requests).toHaveLength(0);
	});
});

describe('no coverage operation', () => {
	test('the index coverage is not part of the public API: a "source" resource is rejected, with no request', async () => {
		const e = await failure({ resource: 'source', operation: 'checkCoverage' });
		expect(e).toBeInstanceOf(NodeOperationError);
		expect(e.message).toBe('The operation "checkCoverage" is not supported for "source"');
		expect(api.requests).toHaveLength(0);
	});
});

describe('errors', () => {
	test('401: NodeApiError with the code and detail of the problem', async () => {
		const e = await failure(
			{ query: 'el dólar' },
			{ credentials: { apiKey: 'ts_live_wrong', baseUrl: api.url } },
		);
		expect(e).toBeInstanceOf(NodeApiError);
		expect(e.httpCode).toBe('401');
		expect(e.message).toBe('The API key is not valid. (invalid_api_key)');
		expect(e.description).toContain('Check the API key in the typesearch credential');
		expect(e.description).toContain('Request ID: req_fakeerr1');
		expect(e.context.code).toBe('invalid_api_key');
		expect(e.context.itemIndex).toBe(0);
		// La clave nunca aparece en el error.
		expect(JSON.stringify({ m: e.message, d: e.description, c: e.context })).not.toContain(
			'ts_live_wrong',
		);
	});

	test('402: out of credit', async () => {
		api.next({
			status: 402,
			body: problem(402, 'insufficient_credits', 'The organization has no credit left.'),
		});
		const e = await failure({ query: 'el dólar' });
		expect(e).toBeInstanceOf(NodeApiError);
		expect(e.httpCode).toBe('402');
		expect(e.message).toBe('The organization has no credit left. (insufficient_credits)');
		expect(e.description).toContain('Add credit at https://app.typesearch.ai.');
	});

	test('429: says when to retry (Retry-After)', async () => {
		api.next({
			status: 429,
			body: problem(429, 'rate_limited', 'Too many requests.'),
			headers: { 'Retry-After': '7' },
		});
		const e = await failure({ query: 'el dólar' });
		expect(e).toBeInstanceOf(NodeApiError);
		expect(e.httpCode).toBe('429');
		expect(e.message).toBe('Too many requests. (rate_limited)');
		expect(e.description).toContain('Retry after 7 s.');
		expect(e.context.retryAfter).toBe('7');
	});

	test('400 from the API validation: lists the fields', async () => {
		const e = await failure({ query: 'el dólar', maxResults: 0 });
		expect(e).toBeInstanceOf(NodeApiError);
		expect(e.httpCode).toBe('400');
		expect(e.context.code).toBe('invalid_request');
		expect(e.description).toMatch(/max_results: must be >= 1/);
	});

	test('5xx without JSON: a generic message and the request ID from the header', async () => {
		api.next({ status: 502, body: 'upstream down', headers: { 'Content-Type': 'text/plain' } });
		const e = await failure({ query: 'el dólar' });
		expect(e).toBeInstanceOf(NodeApiError);
		expect(e.httpCode).toBe('502');
		expect(e.context.code).toBe('http_502');
		expect(e.description).toContain('Request ID: req_faken8n01');
	});

	test('no connection: NodeApiError that says so', async () => {
		const closed = new FakeApi();
		await closed.start();
		const url = closed.url;
		await closed.close();
		const e = await failure({ query: 'el dólar' }, { credentials: { apiKey: KEY, baseUrl: url } });
		expect(e).toBeInstanceOf(NodeApiError);
		expect(e.message).toBe('Could not reach the typesearch API');
	});

	test('continue on fail: the failed item carries the error, the rest go on', async () => {
		api.next({
			status: 402,
			body: problem(402, 'spend_limit_reached', 'The monthly spend limit was reached.'),
		});
		const { output } = await run([{ query: 'el dólar' }, { query: 'el FMI' }], {
			continueOnFail: true,
		});
		expect(output).toHaveLength(3);
		expect(output[0]).toEqual({
			json: {
				error: 'The monthly spend limit was reached. (spend_limit_reached)',
				code: 'spend_limit_reached',
				status: 402,
				description:
					'Raise the spend limit of this key at https://app.typesearch.ai.\nRequest ID: req_fakeerr1',
				request_id: 'req_fakeerr1',
			},
			pairedItem: { item: 0 },
		});
		expect(output.slice(1).map((o) => o.pairedItem)).toEqual([{ item: 1 }, { item: 1 }]);
	});

	test('continue on fail also covers errors before the request', async () => {
		const { output } = await run({ query: '' }, { continueOnFail: true });
		expect(output).toEqual([
			{
				json: {
					error: "The 'Query' parameter is empty",
					description: 'Enter what to look for, such as "inflation in Argentina".',
				},
				pairedItem: { item: 0 },
			},
		]);
	});
});

describe('input helpers', () => {
	test('toList splits commas and lines, trims and drops empties', () => {
		expect(toList(' a, b ,,\nc ')).toEqual(['a', 'b', 'c']);
		expect(toList(['a, b', 'c', null])).toEqual(['a', 'b', 'c']);
		expect(toList(undefined)).toEqual([]);
	});

	test('toUrlList keeps commas inside URLs', () => {
		expect(toUrlList('https://a.example/x,y, https://b.example/z\nhttps://c.example')).toEqual([
			'https://a.example/x,y',
			'https://b.example/z',
			'https://c.example',
		]);
	});

	test('toDate: dates, midnight without a zone, UTC without a zone, offsets', () => {
		expect(toDate('2026-09-20')).toBe('2026-09-20');
		expect(toDate('2026-09-20T00:00:00')).toBe('2026-09-20');
		expect(toDate('2026-09-20T15:30')).toBe('2026-09-20T15:30:00Z');
		expect(toDate('2026-09-20T15:30:00-03:00')).toBe('2026-09-20T15:30:00-03:00');
		expect(toDate('2026-09-20T15:30:00+0200')).toBe('2026-09-20T15:30:00+02:00');
		expect(toDate(new Date('2026-09-20T12:00:00Z'))).toBe('2026-09-20T12:00:00.000Z');
		expect(toDate({ toISO: () => '2026-09-20T12:00:00.000-03:00' })).toBe(
			'2026-09-20T12:00:00.000-03:00',
		);
		expect(toDate('')).toBeUndefined();
		expect(toDate('yesterday')).toBe('yesterday');
	});
});
