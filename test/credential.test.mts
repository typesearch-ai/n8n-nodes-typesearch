/*
 * La credencial: la clave va como Bearer, es un campo de contraseña, y la prueba de n8n llama a
 * GET /v1/usage (exige una clave válida y no cobra).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { IDataObject } from 'n8n-workflow';
import { TypesearchApi } from '../credentials/TypesearchApi.credentials.ts';
import { authenticate, resolveExpression, testCredential } from './context.mts';
import { FakeApi, KEY } from './fake-api.mts';

const credential = new TypesearchApi();
const api = new FakeApi();

beforeAll(async () => {
	await api.start();
});
afterAll(async () => {
	await api.close();
});
beforeEach(() => api.reset());

describe('credential', () => {
	test('name, display name and documentation', () => {
		expect(credential.name).toBe('typesearchApi');
		expect(credential.displayName).toBe('Typesearch API');
		expect(credential.documentationUrl).toBe('https://typesearch.ai/docs/integrations/n8n');
	});

	test('the API key is a required password field; the base URL defaults to the API', () => {
		const key = credential.properties.find((p) => p.name === 'apiKey');
		expect(key).toMatchObject({ type: 'string', required: true, default: '' });
		expect(key?.typeOptions?.password).toBe(true);
		const base = credential.properties.find((p) => p.name === 'baseUrl');
		expect(base).toMatchObject({ type: 'string', default: 'https://api.typesearch.ai' });
	});

	test('sends the key as Authorization: Bearer', () => {
		const options = authenticate(
			credential,
			{ apiKey: 'ts_live_abc' },
			{ url: '/v1/search', headers: { Accept: 'application/json' } },
		);
		expect(options.headers).toEqual({
			Accept: 'application/json',
			Authorization: 'Bearer ts_live_abc',
		});
	});

	test('the test request is GET /v1/usage on the base URL', () => {
		const request = credential.test.request;
		expect(request.method).toBe('GET');
		expect(request.url).toBe('/v1/usage');
		expect(
			resolveExpression(request.baseURL, { baseUrl: 'https://api.example.test' } as IDataObject),
		).toBe('https://api.example.test');
		expect(resolveExpression(request.baseURL, { baseUrl: '' } as IDataObject)).toBe(
			'https://api.typesearch.ai',
		);
	});

	test('a valid key passes the test against the API', async () => {
		const res = await testCredential({ apiKey: KEY, baseUrl: api.url });
		expect(res.statusCode).toBe(200);
		expect(res.body.object).toBe('usage');
		expect(api.requests).toHaveLength(1);
		expect(api.last).toMatchObject({ method: 'GET', path: '/v1/usage' });
		expect(api.last.headers.authorization).toBe(`Bearer ${KEY}`);
	});

	test('a wrong key fails the test with 401', async () => {
		const res = await testCredential({ apiKey: 'ts_live_wrong', baseUrl: api.url });
		expect(res.statusCode).toBe(401);
		expect(res.body.code).toBe('invalid_api_key');
	});
});
