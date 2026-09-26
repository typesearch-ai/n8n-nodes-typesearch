/*
 * Un pedido a la API de typesearch con el helper de n8n (`httpRequestWithAuthentication`, que pone la
 * clave de la credencial) y sin dependencias. Los errores de la API llegan como problem+json (RFC 9457,
 * con `code`, `detail`, `request_id` y `errors[]`) y se convierten en un NodeApiError legible: el mensaje
 * dice qué pasó y el código estable; la descripción, qué hacer.
 */
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INode,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { VERSION } from './version';

export const CREDENTIAL = 'typesearchApi';
export const DEFAULT_BASE_URL = 'https://api.typesearch.ai';
export const DASHBOARD_URL = 'https://app.typesearch.ai';

// Una búsqueda `deep` puede tardar cerca de un minuto: margen de sobra antes de cortar.
const TIMEOUT_MS = 120_000;

interface FullResponse {
	body: unknown;
	headers: IDataObject;
	statusCode: number;
}

export interface TypesearchRequest {
	method: IHttpRequestMethods;
	path: string;
	body?: IDataObject;
	itemIndex: number;
}

export async function typesearchRequest(
	this: IExecuteFunctions,
	{ method, path, body, itemIndex }: TypesearchRequest,
): Promise<IDataObject> {
	const credentials = await this.getCredentials<{ baseUrl?: string }>(CREDENTIAL, itemIndex);
	const baseURL = (credentials.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');

	const options: IHttpRequestOptions = {
		method,
		baseURL,
		url: path,
		headers: { Accept: 'application/json', 'User-Agent': `n8n-nodes-typesearch/${VERSION}` },
		json: true,
		timeout: TIMEOUT_MS,
		// El estado se mira acá, para armar el error con el problem+json de la API.
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (body) options.body = body;

	let response: FullResponse;
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL,
			options,
		)) as FullResponse;
	} catch (error) {
		// Sin respuesta: red, DNS, tiempo agotado. Si n8n ya lo envolvió en un NodeApiError, queda igual.
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			itemIndex,
			message: 'Could not reach the typesearch API',
			description: `${(error as Error)?.message ?? String(error)}. Check the network and the Base URL of the typesearch credential, then try again.`,
		});
	}

	const data = parseBody(response.body);
	if (response.statusCode >= 200 && response.statusCode < 300 && isObject(data)) return data;
	throw apiError(this.getNode(), response.statusCode, data, response.headers ?? {}, itemIndex);
}

function parseBody(body: unknown): unknown {
	if (typeof body !== 'string') return body;
	try {
		return JSON.parse(body) as unknown;
	} catch {
		return body;
	}
}

export function isObject(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

function header(headers: IDataObject, name: string): string | undefined {
	const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
	const value = key === undefined ? undefined : headers[key];
	return text(Array.isArray(value) ? value[0] : value);
}

/** Qué hacer ante cada estado, para la descripción del error. */
function hint(status: number, code: string, retryAfter: string | undefined): string | undefined {
	if (status === 401) {
		return `Check the API key in the typesearch credential. You can create a new key at ${DASHBOARD_URL}.`;
	}
	if (status === 402) {
		if (code === 'insufficient_credits') return `Add credit at ${DASHBOARD_URL}.`;
		if (code === 'spend_limit_reached')
			return `Raise the spend limit of this key at ${DASHBOARD_URL}.`;
		return `Check the credit and limits of this key at ${DASHBOARD_URL}.`;
	}
	if (status === 429) {
		const wait = retryAfter ? `Retry after ${retryAfter} s.` : 'Retry in a moment.';
		return code === 'quota_exceeded'
			? `The daily quota of this key is used up. ${wait}`
			: `${wait} You can turn on Retry On Fail in the node settings.`;
	}
	if (status >= 500) {
		return 'typesearch could not complete the request. Try again; failed requests are not billed.';
	}
	return undefined;
}

/** El NodeApiError de una respuesta con error de la API. */
export function apiError(
	node: INode,
	status: number,
	data: unknown,
	headers: IDataObject,
	itemIndex: number,
): NodeApiError {
	const problem = isObject(data) ? data : {};
	const code = text(problem.code) ?? `http_${status}`;
	const detail =
		text(problem.detail) ??
		text(problem.title) ??
		(typeof data === 'string' && data.trim() ? data.trim().slice(0, 300) : undefined) ??
		`The typesearch API answered with HTTP ${status}.`;
	const requestId = text(problem.request_id) ?? header(headers, 'x-request-id');
	const retryAfter = header(headers, 'retry-after');

	const lines: string[] = [];
	if (Array.isArray(problem.errors)) {
		for (const e of problem.errors) {
			if (isObject(e) && text(e.message))
				lines.push(`${text(e.path) ?? 'request'}: ${text(e.message)}`);
		}
	}
	const todo = hint(status, code, retryAfter);
	if (todo) lines.push(todo);
	if (requestId) lines.push(`Request ID: ${requestId}`);

	const error = new NodeApiError(node, problem as JsonObject, {
		message: `${detail} (${code})`,
		description: lines.join('\n') || undefined,
		httpCode: String(status),
		itemIndex,
	});
	// Para quien sigue ante errores (continueOnFail) y para las pruebas.
	error.context.code = code;
	if (requestId) error.context.requestId = requestId;
	if (retryAfter) error.context.retryAfter = retryAfter;
	return error;
}
