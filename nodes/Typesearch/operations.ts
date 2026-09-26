/*
 * Cada operación: lee los parámetros del ítem, arma el pedido con los nombres de la API (snake_case) sin
 * mandar lo vacío, llama a la API y devuelve los objetos de salida. Lo que la API valida (largos, códigos
 * de país, dominios) se lo deja a ella: su error 400 dice qué campo está mal.
 */
import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { isObject, typesearchRequest } from './transport';

export type Output = 'simplified' | 'raw' | 'selectedFields' | 'fullResponse';

const MAX_URLS = 10;

// --- Entradas ----------------------------------------------------------------------------------

/** Una lista desde un texto con comas o renglones, o desde un arreglo (una expresión o el modelo mandan cualquiera). */
export function toList(value: unknown): string[] {
	const parts = Array.isArray(value)
		? value.flatMap((v) =>
				typeof v === 'string' ? v.split(/[,\n]/) : v == null ? [] : [String(v)],
			)
		: typeof value === 'string'
			? value.split(/[,\n]/)
			: value == null
				? []
				: [String(value)];
	return parts.map((s) => s.trim()).filter(Boolean);
}

/** URLs separadas por renglones, espacios o comas (una coma dentro de una URL no la corta). */
export function toUrlList(value: unknown): string[] {
	const parts = Array.isArray(value)
		? value.map((v) => (v == null ? '' : String(v)))
		: [String(value ?? '')];
	return parts
		.flatMap((p) => p.split(/\s+|,(?=\s*https?:\/\/)/i))
		.map((s) => s.trim().replace(/,+$/, ''))
		.filter(Boolean);
}

/**
 * Una fecha para la API: `2026-09-25` o una fecha y hora con zona. El selector de fechas de n8n da
 * `2026-09-25T00:00:00`, sin zona: la medianoche sin zona queda como el día entero, y otra hora sin zona
 * se toma en UTC. Lo que no parece una fecha va tal cual y la API explica el error.
 */
export function toDate(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'object' && typeof (value as { toISO?: unknown }).toISO === 'function') {
		return (value as { toISO: () => string }).toISO();
	}
	const s = String(value).trim();
	const m =
		/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(:\d{2}(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(
			s,
		);
	if (!m) return s;
	const [, date, hm, seconds, zone] = m;
	if (!hm) return date;
	if (!zone && hm === '00:00' && (!seconds || /^:00(\.0+)?$/.test(seconds))) return date;
	const offset = !zone
		? 'Z'
		: zone.toUpperCase() === 'Z'
			? 'Z'
			: zone.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
	return `${date}T${hm}${seconds ?? ':00'}${offset}`;
}

/** Los filtros comunes de search y similar, con los nombres de la API. */
export function filters(o: IDataObject): IDataObject {
	const body: IDataObject = {};
	if (o.days !== undefined && o.days !== null && o.days !== '') body.days = Number(o.days);
	const after = toDate(o.publishedAfter);
	if (after) body.published_after = after;
	const before = toDate(o.publishedBefore);
	if (before) body.published_before = before;
	const include = toList(o.includeDomains);
	if (include.length) body.include_domains = include;
	const exclude = toList(o.excludeDomains);
	if (exclude.length) body.exclude_domains = exclude;
	const countries = toList(o.countries).map((c) => c.toUpperCase());
	if (countries.length) body.countries = countries;
	const languages = toList(o.languages).map((l) => l.toLowerCase());
	if (languages.length) body.languages = languages;
	for (const key of ['highlights', 'dedupe', 'tone']) {
		if (typeof o[key] === 'boolean') body[key] = o[key];
	}
	return body;
}

// --- Salidas -----------------------------------------------------------------------------------

/** Lo esencial de un artículo: siempre las mismas claves, más el tono o los duplicados si se pidieron. */
export function simplifyArticle(r: IDataObject): IDataObject {
	const article: IDataObject = {
		title: r.title ?? null,
		url: r.url ?? null,
		source: r.source ?? null,
		published_at: r.published_at ?? null,
		country: r.country ?? null,
		language: r.language ?? null,
		snippet: r.snippet ?? null,
		highlights: Array.isArray(r.highlights) ? r.highlights : [],
		score: r.score ?? null,
	};
	if (r.tone !== undefined && r.tone !== null) article.tone = r.tone;
	if (Array.isArray(r.duplicates) && r.duplicates.length) article.duplicates = r.duplicates;
	return article;
}

/** Lo esencial de una página de /v1/contents; la relevancia sólo con consulta y el error sólo si falló. */
export function simplifyPage(p: IDataObject): IDataObject {
	const page: IDataObject = {
		url: p.url ?? null,
		status: p.status ?? null,
		title: p.title ?? null,
		description: p.description ?? null,
		published_at: p.published_at ?? null,
		source: p.source ?? null,
		excerpt: p.excerpt ?? null,
	};
	const extra = Array.isArray(p.highlights) ? p.highlights.filter((h) => h !== p.excerpt) : [];
	if (extra.length) page.highlights = extra;
	if (p.relevance !== undefined && p.relevance !== null) page.relevance = p.relevance;
	if (p.error !== undefined && p.error !== null) page.error = p.error;
	return page;
}

/** Sólo los campos elegidos (siempre con la URL, que identifica el artículo). */
export function pick(x: IDataObject, fields: string[]): IDataObject {
	const out: IDataObject = { url: x.url ?? null };
	for (const f of fields) if (f !== 'url') out[f] = x[f] ?? null;
	return out;
}

function list(
	this: IExecuteFunctions,
	i: number,
	response: IDataObject,
	simplify: (x: IDataObject) => IDataObject,
): IDataObject[] {
	const output = this.getNodeParameter('output', i, 'simplified') as Output;
	if (output === 'fullResponse') return [response];
	const results = Array.isArray(response.results) ? response.results.filter(isObject) : [];
	if (output === 'raw') return results;
	if (output === 'selectedFields') {
		const fields = toList(this.getNodeParameter('fields', i, []));
		return results.map((r) => pick(r, fields));
	}
	return results.map(simplify);
}

// --- Operaciones -------------------------------------------------------------------------------

export async function search(this: IExecuteFunctions, i: number): Promise<IDataObject[]> {
	const query = String(this.getNodeParameter('query', i, '') ?? '').trim();
	if (!query) {
		throw new NodeOperationError(this.getNode(), "The 'Query' parameter is empty", {
			itemIndex: i,
			description: 'Enter what to look for, such as "inflation in Argentina".',
		});
	}
	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	const body: IDataObject = {
		query,
		mode: String(this.getNodeParameter('mode', i, 'fast'))
			.trim()
			.toLowerCase(),
		max_results: Number(this.getNodeParameter('maxResults', i, 10)),
		...filters(options),
	};
	const response = await typesearchRequest.call(this, {
		method: 'POST',
		path: '/v1/search',
		body,
		itemIndex: i,
	});
	return list.call(this, i, response, simplifyArticle);
}

export async function findSimilar(this: IExecuteFunctions, i: number): Promise<IDataObject[]> {
	const url = String(this.getNodeParameter('url', i, '') ?? '').trim();
	if (!url) {
		throw new NodeOperationError(this.getNode(), "The 'URL' parameter is empty", {
			itemIndex: i,
			description: 'Enter the URL of a news article.',
		});
	}
	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	const body: IDataObject = {
		url,
		mode: String(this.getNodeParameter('mode', i, 'fast'))
			.trim()
			.toLowerCase(),
		max_results: Number(this.getNodeParameter('maxResults', i, 10)),
		...filters(options),
	};
	const response = await typesearchRequest.call(this, {
		method: 'POST',
		path: '/v1/similar',
		body,
		itemIndex: i,
	});
	return list.call(this, i, response, simplifyArticle);
}

export async function getContents(this: IExecuteFunctions, i: number): Promise<IDataObject[]> {
	const urls = toUrlList(this.getNodeParameter('urls', i, ''));
	if (urls.length === 0 || urls.length > MAX_URLS) {
		throw new NodeOperationError(
			this.getNode(),
			urls.length === 0
				? "The 'URLs' parameter has no URLs"
				: `The 'URLs' parameter has ${urls.length} URLs, and the most is ${MAX_URLS}`,
			{
				itemIndex: i,
				description: `Get Contents takes 1 to ${MAX_URLS} URLs per item, separated by commas or new lines. Split longer lists across several items.`,
			},
		);
	}
	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	const body: IDataObject = { urls };
	const query = typeof options.query === 'string' ? options.query.trim() : '';
	if (query) body.query = query;
	const response = await typesearchRequest.call(this, {
		method: 'POST',
		path: '/v1/contents',
		body,
		itemIndex: i,
	});
	return list.call(this, i, response, simplifyPage);
}
