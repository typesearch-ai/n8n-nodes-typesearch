/*
 * El nodo de typesearch, en estilo programático (execute) y no declarativo (routing), porque:
 * - los errores de la API (problem+json) tienen que llegar como NodeApiError con su `code`, su `detail`
 *   y qué hacer; con routing, n8n arma un error genérico por estado;
 * - la salida es configurable (un ítem por artículo, esencial o crudo, o la respuesta entera) y los
 *   parámetros de lista y de fecha se normalizan antes de mandarlos;
 * - se prueba con un IExecuteFunctions simulado contra una API falsa por HTTP, sin el motor de n8n.
 * Sin dependencias en tiempo de ejecución: HTTP con `httpRequestWithAuthentication`.
 */
import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { nodeProperties } from './descriptions';
import { checkCoverage, findSimilar, getContents, search } from './operations';

type Operation = (this: IExecuteFunctions, itemIndex: number) => Promise<IDataObject[]>;

const OPERATIONS: Record<string, Record<string, Operation>> = {
	article: { search, getContents, findSimilar },
	source: { checkCoverage },
};

/** Lo que queda en el ítem cuando el nodo sigue ante errores. */
function errorJson(error: unknown): IDataObject {
	const json: IDataObject = { error: error instanceof Error ? error.message : String(error) };
	if (error instanceof NodeApiError) {
		if (error.context.code) json.code = error.context.code;
		if (error.httpCode) json.status = Number(error.httpCode) || error.httpCode;
		if (error.description) json.description = error.description;
		if (error.context.requestId) json.request_id = error.context.requestId;
	} else if (error instanceof NodeOperationError && error.description) {
		json.description = error.description;
	}
	return json;
}

export class Typesearch implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'typesearch',
		name: 'typesearch',
		icon: {
			light: 'file:../../icons/typesearch.svg',
			dark: 'file:../../icons/typesearch.dark.svg',
		},
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Search recent news worldwide, with a relevance score on every article; get article excerpts, other coverage of a story and the index coverage',
		defaults: {
			name: 'typesearch',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'typesearchApi',
				required: true,
			},
		],
		properties: nodeProperties,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const run = OPERATIONS[resource]?.[operation];
				if (!run) {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for "${resource}"`,
						{ itemIndex: i },
					);
				}
				const results = await run.call(this, i);
				for (const json of results) {
					returnData.push({ json, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: errorJson(error), pairedItem: { item: i } });
					continue;
				}
				// Los errores ya vienen como NodeApiError o NodeOperationError (los constructores devuelven el
				// mismo error); cualquier otro se envuelve con el índice del ítem.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
