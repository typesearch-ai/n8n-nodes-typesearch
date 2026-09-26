/*
 * Una API falsa de typesearch, por HTTP de verdad, que cumple el contrato del OpenAPI: valida cada pedido
 * contra el esquema de su ruta (como la API, rechaza campos desconocidos con 400 invalid_request) y cada
 * respuesta de ejemplo contra el esquema de la respuesta. Así las pruebas fallan si el nodo manda algo que
 * la API no acepta o si un ejemplo se aleja del contrato. Los esquemas salen de
 * test/fixtures/openapi-schemas.json (`npm run schemas` los actualiza desde el OpenAPI vivo).
 *
 * `api.next(...)` encola respuestas armadas a mano (errores, 429) que se usan antes que las normales.
 * Los medios son ficticios (.example).
 */
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

const fixture = JSON.parse(
	fs.readFileSync(new URL('./fixtures/openapi-schemas.json', import.meta.url), 'utf8'),
) as { components: { schemas: Record<string, unknown> } };
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'https://fake.typesearch.test/openapi', components: fixture.components });

export function schema(name: string): ValidateFunction {
	const v = ajv.getSchema(`https://fake.typesearch.test/openapi#/components/schemas/${name}`);
	if (!v) throw new Error(`Sin esquema ${name}`);
	return v;
}

/** Valida un ejemplo contra su esquema y lo devuelve; si no cumple, la prueba falla con el detalle. */
export function conforms<T>(name: string, value: T): T {
	const v = schema(name);
	if (!v(value)) throw new Error(`El ejemplo no cumple ${name}: ${ajv.errorsText(v.errors)}`);
	return value;
}

export const KEY = 'ts_test_n8n_0123456789';

export interface Recorded {
	method: string;
	path: string;
	query: URLSearchParams;
	headers: http.IncomingHttpHeaders;
	body: any;
}

export interface Scripted {
	status: number;
	body?: unknown;
	headers?: Record<string, string>;
}

// --- Ejemplos que cumplen el contrato ---------------------------------------------------------

export function article(n: number, extra: Record<string, unknown> = {}) {
	return {
		url: `https://diarioejemplo.example/economia/nota-${n}`,
		title: `El dólar cerró estable por ${n}ª rueda`,
		source: 'Diario Ejemplo',
		country: 'AR',
		language: 'es',
		published_at: '2026-09-21T18:05:00.000Z',
		section: 'economia',
		snippet: 'La divisa se mantuvo sin cambios frente al cierre anterior.',
		score: 0.96 - n / 100,
		headline_relevance: 0.91,
		read: null,
		highlights: [],
		tone: null,
		answers: null,
		duplicates: [],
		date_match: null,
		referenced_date: null,
		found_in: 'index',
		...extra,
	};
}

export function searchResponse(extra: Record<string, unknown> = {}) {
	return conforms('SearchResponse', {
		id: 'req_faken8n01',
		object: 'search',
		mode: 'fast',
		queries: ['el dólar'],
		found: true,
		total: 2,
		results: [
			article(1),
			article(2, {
				url: 'https://reddiaria.example/economia/nota-2',
				source: 'Red Diaria',
				highlights: ['El dólar mayorista terminó la jornada sin variaciones'],
			}),
		],
		groups: null,
		near_misses: [],
		rejected: [],
		diffusion: null,
		tone: null,
		essential: null,
		reference: null,
		temporal: null,
		site: null,
		index: null,
		usage: {
			tokens: 1840,
			calls: 2,
			cost_usd: 0.00111,
			headlines: 160,
			from_memory: 12,
			pages_direct: 0,
			pages_browser: 0,
			duration_ms: 910,
		},
		budget: null,
		discovery: null,
		incomplete: false,
		cached_at: null,
		warnings: [],
		...extra,
	});
}

const EMPTY_PAGE = {
	title: null,
	description: null,
	published_at: null,
	source: null,
	excerpt: null,
	highlights: [],
	relevance: null,
};

function contentsResponse(urls: string[], query: string | undefined) {
	return conforms('ContentsResponse', {
		id: 'req_fakecont1',
		object: 'contents',
		results: urls.map((url) =>
			url.includes('unreachable')
				? {
						url,
						status: 'error',
						error: { code: 'site_unreachable', message: 'The site did not answer.' },
						...EMPTY_PAGE,
					}
				: {
						url,
						status: 'ok',
						error: null,
						title: 'Presupuesto 2027: las claves del proyecto',
						description: 'El Gobierno envió el proyecto al Congreso.',
						published_at: '2026-09-16T01:12:00.000Z',
						source: 'Red Diaria',
						excerpt: 'El proyecto prevé un superávit primario',
						highlights: query ? ['El proyecto prevé un superávit primario'] : [],
						relevance: query ? 0.9749 : null,
					},
		),
		usage: { tokens: 1320, calls: 1, cost_usd: 0.00022, duration_ms: 1840 },
	});
}

export const USAGE = {
	object: 'usage',
	key: { id: 'key_fake01', name: 'n8n' },
	limits: { tokens_per_day: 1_000_000, requests_per_minute: 60, requests_per_second: 10 },
	today: { requests: 3, tokens: 5120, cost_usd: 0.0033, remaining_tokens: 994_880 },
	last_30_days: { requests: 41, tokens: 70_000, cost_usd: 0.05 },
	credit: { balance_usd: 4.95, plan: 'payg', spent_this_month_usd: 0.05, monthly_limit_usd: null },
	// Precios inventados: la API falsa no dice los de verdad.
	pricing: {
		currency: 'USD',
		per_1000_requests: {
			ultra: 1.11,
			fast: 1.11,
			normal: 2.22,
			deep: 5.55,
			similar: 2.22,
			similar_deep: 4.44,
			site_search: 2.33,
		},
		per_1000_pages: { contents: 0.11, contents_with_query: 0.22 },
	},
};

export function problem(
	status: number,
	code: string,
	detail: string,
	extra: Record<string, unknown> = {},
) {
	return conforms('Problem', {
		type: `urn:typesearch:error:${code}`,
		title: code,
		status,
		detail,
		code,
		request_id: 'req_fakeerr1',
		...extra,
	});
}

// --- El servidor --------------------------------------------------------------------------------

const ROUTES: Record<string, string> = {
	'POST /v1/search': 'SearchRequest',
	'POST /v1/similar': 'SimilarRequest',
	'POST /v1/contents': 'ContentsRequest',
};

export class FakeApi {
	readonly requests: Recorded[] = [];
	#queue: Scripted[] = [];
	#server = http.createServer((req, res) => {
		// Si un ejemplo no cumple el contrato, la prueba falla enseguida con un 500 que lo dice.
		this.#handle(req, res).catch((e: Error) => {
			res.writeHead(500, { 'Content-Type': 'application/problem+json' });
			res.end(
				JSON.stringify({
					type: 'urn:fake:error',
					title: 'fake_api_error',
					status: 500,
					detail: e.message,
					code: 'fake_api_error',
					request_id: 'req_fake500',
				}),
			);
		});
	});
	url = '';

	async start(): Promise<this> {
		await new Promise<void>((resolve) => this.#server.listen(0, '127.0.0.1', resolve));
		this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
		return this;
	}

	async close(): Promise<void> {
		this.#server.closeAllConnections?.();
		await new Promise<void>((resolve) => this.#server.close(() => resolve()));
	}

	next(...scripted: Scripted[]): this {
		this.#queue.push(...scripted);
		return this;
	}

	reset(): void {
		this.requests.length = 0;
		this.#queue.length = 0;
	}

	get last(): Recorded {
		const r = this.requests[this.requests.length - 1];
		if (!r) throw new Error('Sin pedidos');
		return r;
	}

	async #handle(req: http.IncomingMessage, res: http.ServerResponse) {
		const url = new URL(req.url ?? '/', 'http://x');
		let text = '';
		for await (const chunk of req) text += chunk;
		const send = (status: number, data: unknown, headers: Record<string, string> = {}) => {
			res.writeHead(status, {
				'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json',
				'X-Request-Id': 'req_faken8n01',
				...headers,
			});
			res.end(JSON.stringify(data));
		};

		let body: any;
		try {
			body = text ? JSON.parse(text) : undefined;
		} catch {
			return send(400, problem(400, 'invalid_json', 'The request body is not valid JSON.'));
		}
		this.requests.push({
			method: req.method ?? 'GET',
			path: url.pathname,
			query: url.searchParams,
			headers: req.headers,
			body,
		});

		const scripted = this.#queue.shift();
		if (scripted) return send(scripted.status, scripted.body, scripted.headers);

		const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
		if (!bearer)
			return send(
				401,
				problem(
					401,
					'missing_api_key',
					'Missing API key: Authorization: Bearer <key> or x-api-key: <key>.',
				),
			);
		if (bearer !== KEY)
			return send(401, problem(401, 'invalid_api_key', 'The API key is not valid.'));

		const route = `${req.method} ${url.pathname}`;
		const requestSchema = ROUTES[route];
		if (requestSchema) {
			const validate = schema(requestSchema);
			if (!validate(body)) {
				const errors = (validate.errors ?? []).map((e) => ({
					path: e.instancePath.replace(/^\//, '').replace(/\//g, '.') || 'body',
					message: e.message ?? 'invalid',
				}));
				return send(400, problem(400, 'invalid_request', 'The request is not valid.', { errors }));
			}
		}

		if (route === 'POST /v1/search')
			return send(200, searchResponse({ mode: body.mode ?? 'normal', queries: [body.query] }));
		if (route === 'POST /v1/similar') {
			return send(
				200,
				searchResponse({
					object: 'similar',
					mode: body.mode ?? 'normal',
					queries: [],
					reference: { url: body.url, title: 'Inflación: qué esperan los analistas' },
				}),
			);
		}
		if (route === 'POST /v1/contents') return send(200, contentsResponse(body.urls, body.query));
		if (route === 'GET /v1/usage') return send(200, conforms('Usage', USAGE));
		return send(404, problem(404, 'not_found', 'Not found.'));
	}
}
