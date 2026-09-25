/*
 * Las pruebas van en .mts a propósito: `n8n-node lint` (modo estricto, config de eslint sin tocar) revisa
 * todos los .ts con las reglas de n8n Cloud, que prohíben `process`, `setTimeout` y los módulos de Node en
 * el código del nodo. Las pruebas los necesitan (una API falsa por HTTP, la clave en vivo del entorno) y no
 * se publican: sólo `dist` va al paquete.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/**/*.test.mts'],
		testTimeout: 20_000,
	},
});
