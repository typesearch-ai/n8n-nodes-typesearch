/*
 * Contra la API de verdad: corre sólo con `npm run test:live` y TYPESEARCH_API_KEY en el entorno (con
 * `npm test` se saltea aunque haya clave, para no gastar sin querer). Gasta muy poco: una búsqueda `fast`
 * de 3 resultados y el contenido de una URL; la prueba de la credencial no cobra.
 * TYPESEARCH_BASE_URL apunta a otra API (local o de prueba).
 */
import { describe, expect, test } from 'vitest';
import { Typesearch } from '../nodes/Typesearch/Typesearch.node.ts';
import { runNode, testCredential } from './context.mts';

const apiKey = process.env.TYPESEARCH_LIVE === '1' ? process.env.TYPESEARCH_API_KEY : undefined;
const credentials = {
	apiKey: apiKey ?? '',
	baseUrl: process.env.TYPESEARCH_BASE_URL || 'https://api.typesearch.ai',
};
const node = new Typesearch();

describe.skipIf(!apiKey)('live API', () => {
	let url: string | undefined;

	test('the credential test passes (free)', async () => {
		const res = await testCredential(credentials);
		expect(res.statusCode).toBe(200);
		expect(res.body.object).toBe('usage');
	});

	test('search, fast, 3 results', async () => {
		const { output } = await runNode(node, {
			params: { query: 'inflación', maxResults: 3, options: { days: 7 } },
			credentials,
		});
		expect(output.length).toBeLessThanOrEqual(3);
		for (const item of output) {
			expect(item.json.url).toMatch(/^https?:\/\//);
			expect(item.json.score).toBeGreaterThanOrEqual(0.5);
		}
		url = output[0]?.json.url as string | undefined;
	}, 60_000);

	test('contents of the first result', async () => {
		if (!url) return;
		const { output } = await runNode(node, {
			params: { resource: 'article', operation: 'getContents', urls: url },
			credentials,
		});
		expect(output[0]!.json.url).toBe(url);
	}, 60_000);
});
