import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/*
 * La clave de la API de typesearch. Va como `Authorization: Bearer <clave>` en cada pedido; la prueba de
 * la credencial llama a GET /v1/usage, que exige una clave válida y no cobra.
 */
export class TypesearchApi implements ICredentialType {
	name = 'typesearchApi';

	displayName = 'Typesearch API';

	icon: Icon = { light: 'file:../icons/typesearch.svg', dark: 'file:../icons/typesearch.dark.svg' };

	documentationUrl = 'https://typesearch.ai/docs/integrations/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'ts_live_...',
			description: 'Your typesearch API key. Create one at https://app.typesearch.ai.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.typesearch.ai',
			description: 'Leave as is unless typesearch support gave you another address',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl || "https://api.typesearch.ai"}}',
			url: '/v1/usage',
			method: 'GET',
		},
	};
}
