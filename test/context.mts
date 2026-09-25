/*
 * Un IExecuteFunctions simulado, lo justo para ejecutar el nodo como lo hace n8n:
 * - `getNodeParameter` con los valores por defecto de la descripción del nodo (los que se ven según el
 *   recurso y la operación), como `NodeHelpers.getNodeParameters` en n8n;
 * - `helpers.httpRequestWithAuthentication` como en n8n-core: aplica el `authenticate` de la credencial
 *   (resolviendo sus expresiones), une baseURL y url como axios, manda JSON, lee JSON y respeta
 *   `returnFullResponse` e `ignoreHttpStatusErrors`. Hace el pedido HTTP de verdad (a la API falsa).
 */
import type {
	ICredentialType,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INode,
	INodeExecutionData,
	INodeProperties,
	INodeType,
} from 'n8n-workflow';
import { TypesearchApi } from '../credentials/TypesearchApi.credentials.ts';

export interface Credentials {
	apiKey: string;
	baseUrl?: string;
}

export interface RunOptions {
	/** Los parámetros del nodo; con un arreglo, uno por ítem de entrada. */
	params: IDataObject | IDataObject[];
	/** Cuántos ítems de entrada (por defecto, uno por juego de parámetros). */
	items?: number;
	credentials: Credentials;
	continueOnFail?: boolean;
}

export interface RunResult {
	output: INodeExecutionData[];
	/** Los pedidos que el nodo le pasó al helper, tal cual. */
	calls: IHttpRequestOptions[];
}

// --- Expresiones de credenciales ----------------------------------------------------------------

/** Resuelve `={{ ... }}` con `$credentials` a mano: alcanza para las expresiones de la credencial. */
export function resolveExpression(value: unknown, credentials: IDataObject): unknown {
	if (typeof value !== 'string' || !value.startsWith('=')) return value;
	const template = value.slice(1);
	const only = /^\{\{([\s\S]+)\}\}$/.exec(template.trim());
	const evaluate = (expr: string) =>
		new Function('$credentials', `return (${expr});`)(credentials) as unknown;
	if (only) return evaluate(only[1]!);
	return template.replace(/\{\{([\s\S]+?)\}\}/g, (_, expr: string) => String(evaluate(expr)));
}

/** Lo que agrega el `authenticate` genérico de una credencial al pedido. */
export function authenticate(
	credential: ICredentialType,
	credentials: IDataObject,
	options: IHttpRequestOptions,
): IHttpRequestOptions {
	const auth = credential.authenticate;
	if (!auth || typeof auth === 'function' || auth.type !== 'generic')
		throw new Error('Se esperaba un authenticate genérico');
	const headers: IDataObject = { ...(options.headers ?? {}) };
	for (const [name, value] of Object.entries(auth.properties.headers ?? {}))
		headers[name] = resolveExpression(value, credentials) as string;
	const qs: IDataObject = { ...(options.qs ?? {}) };
	for (const [name, value] of Object.entries(auth.properties.qs ?? {}))
		qs[name] = resolveExpression(value, credentials) as string;
	return { ...options, headers, qs };
}

// --- HTTP como n8n-core -------------------------------------------------------------------------

/** Une baseURL y url como axios (combineURLs) y agrega la query. */
function fullUrl(options: IHttpRequestOptions): string {
	const base = options.baseURL ? options.baseURL.replace(/\/+$/, '') : '';
	const url =
		base && !/^https?:\/\//.test(options.url)
			? `${base}/${options.url.replace(/^\/+/, '')}`
			: options.url;
	const u = new URL(url);
	for (const [k, v] of Object.entries(options.qs ?? {}))
		if (v !== undefined && v !== null) u.searchParams.append(k, String(v));
	return u.toString();
}

export async function httpRequest(options: IHttpRequestOptions) {
	const headers: Record<string, string> = {};
	for (const [k, v] of Object.entries(options.headers ?? {}))
		if (v !== undefined && v !== null) headers[k] = String(v);
	let body: string | undefined;
	if (options.body !== undefined && options.method !== 'GET') {
		body = JSON.stringify(options.body);
		headers['Content-Type'] ??= 'application/json';
	}
	const res = await fetch(fullUrl(options), {
		method: options.method ?? 'GET',
		headers,
		body,
		signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
	});
	const text = await res.text();
	let data: unknown = text;
	try {
		data = text ? JSON.parse(text) : '';
	} catch {
		// Como axios: si no es JSON, queda el texto.
	}
	if (res.status >= 400 && !options.ignoreHttpStatusErrors) {
		throw Object.assign(new Error(`Request failed with status code ${res.status}`), {
			response: { status: res.status, data },
		});
	}
	if (options.returnFullResponse) {
		return {
			body: data,
			headers: Object.fromEntries([...(res.headers as unknown as Iterable<[string, string]>)]),
			statusCode: res.status,
			statusMessage: res.statusText,
		};
	}
	return data;
}

// --- El contexto --------------------------------------------------------------------------------

function shown(property: INodeProperties, params: IDataObject): boolean {
	const show = property.displayOptions?.show;
	if (!show) return true;
	return Object.entries(show).every(([name, values]) =>
		(values as unknown[]).includes(params[name]),
	);
}

/** Los parámetros del ítem con los valores por defecto de lo que la pantalla muestra. */
export function withDefaults(nodeType: INodeType, params: IDataObject): IDataObject {
	const out: IDataObject = { ...params };
	// Primero recurso y operación (de ellos depende qué se muestra), después el resto.
	for (let pass = 0; pass < 2; pass++) {
		for (const p of nodeType.description.properties) {
			if (out[p.name] === undefined && shown(p, out))
				out[p.name] = p.default as IDataObject[string];
		}
	}
	return out;
}

export async function runNode(
	nodeType: INodeType,
	{ params, items, credentials, continueOnFail = false }: RunOptions,
): Promise<RunResult> {
	const perItem = Array.isArray(params) ? params : Array.from({ length: items ?? 1 }, () => params);
	const inputs: INodeExecutionData[] = perItem.map((_, i) => ({ json: { i } }));
	const calls: IHttpRequestOptions[] = [];
	const node: INode = {
		id: 'node-1',
		name: 'typesearch',
		type: 'n8n-nodes-typesearch.typesearch',
		typeVersion: 1,
		position: [0, 0],
		parameters: (perItem[0] ?? {}) as INode['parameters'],
	};
	const credential = new TypesearchApi();

	const context = {
		getInputData: () => inputs,
		getNode: () => node,
		continueOnFail: () => continueOnFail,
		getNodeParameter(name: string, itemIndex: number, fallback?: unknown) {
			const values = withDefaults(nodeType, perItem[itemIndex] ?? {});
			const value = values[name];
			if (value !== undefined) return value;
			if (fallback !== undefined) return fallback;
			throw new Error(`Could not get parameter "${name}"`);
		},
		async getCredentials(type: string) {
			if (type !== credential.name) throw new Error(`Credential type ${type} is not the node's`);
			return { ...credentials };
		},
		helpers: {
			async httpRequestWithAuthentication(type: string, options: IHttpRequestOptions) {
				if (type !== credential.name) throw new Error(`Credential type ${type} is not the node's`);
				calls.push(options);
				return httpRequest(
					authenticate(credential, credentials as unknown as IDataObject, options),
				);
			},
		},
	} as unknown as IExecuteFunctions;

	const result = (await nodeType.execute!.call(context)) as INodeExecutionData[][];
	return { output: result[0] ?? [], calls };
}

/** La prueba de la credencial como la hace n8n: su `test.request`, con el `authenticate` aplicado. */
export async function testCredential(credentials: Credentials) {
	const credential = new TypesearchApi();
	const request = credential.test!.request;
	const options: IHttpRequestOptions = {
		method: request.method ?? 'GET',
		baseURL: resolveExpression(request.baseURL, credentials as unknown as IDataObject) as string,
		url: request.url ?? '',
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	return (await httpRequest(
		authenticate(credential, credentials as unknown as IDataObject, options),
	)) as { statusCode: number; body: IDataObject };
}
