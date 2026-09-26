/*
 * Los parámetros del nodo, en inglés (lo que ve el usuario y, cuando el nodo es una herramienta del AI
 * Agent, lo que lee el modelo). Los textos siguen a los del MCP de typesearch.
 */
import type { INodeProperties } from 'n8n-workflow';

const SEARCH = { resource: ['article'], operation: ['search'] };
const SIMILAR = { resource: ['article'], operation: ['findSimilar'] };
const CONTENTS = { resource: ['article'], operation: ['getContents'] };
const SEARCH_OR_SIMILAR = { resource: ['article'], operation: ['search', 'findSimilar'] };

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [{ name: 'Article', value: 'article' }],
	default: 'article',
};

export const operationProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['article'] } },
		options: [
			{
				name: 'Find Similar',
				value: 'findSimilar',
				description:
					'Find other news articles about the same story as a given article URL, across the index (the last 7 days by default)',
				action: 'Find other coverage of a news story',
			},
			{
				name: 'Get Contents',
				value: 'getContents',
				description:
					'Get the title, standfirst, date, source and a short verbatim excerpt (up to 25 words) of up to 10 news article URLs. Never returns the full text.',
				action: 'Get excerpts of news articles',
			},
			{
				name: 'Search',
				value: 'search',
				description:
					'Search recent news on any topic across a curated index of news outlets worldwide, judged by a relevance model',
				action: 'Search recent news on a topic',
			},
		],
		default: 'search',
	},
];

// --- Campos compartidos ------------------------------------------------------------------------

const modeProperty: INodeProperties = {
	displayName: 'Mode',
	name: 'mode',
	type: 'options',
	displayOptions: { show: SEARCH_OR_SIMILAR },
	options: [
		{ name: 'Ultra', value: 'ultra', description: 'Judges headlines only. The cheapest.' },
		{
			name: 'Fast',
			value: 'fast',
			description: 'Judges headlines and standfirsts, just as quick',
		},
		{
			name: 'Normal',
			value: 'normal',
			description: 'Also reads the best matches and adds short excerpts from them',
		},
		{
			name: 'Deep',
			value: 'deep',
			description:
				'Reads more and also finds the topic in other words, such as synonyms and acronyms. Can take about a minute.',
		},
	],
	default: 'fast',
	description: 'How thoroughly to search. Prices per mode are at https://typesearch.ai/pricing.',
};

const maxResultsProperty: INodeProperties = {
	displayName: 'Max Results',
	name: 'maxResults',
	type: 'number',
	typeOptions: { minValue: 1, maxValue: 50 },
	displayOptions: { show: SEARCH_OR_SIMILAR },
	default: 10,
	description: 'The most articles to return, from 1 to 50',
};

const articlesOutputProperty: INodeProperties = {
	displayName: 'Output',
	name: 'output',
	type: 'options',
	displayOptions: { show: SEARCH_OR_SIMILAR },
	options: [
		{
			name: 'Simplified',
			value: 'simplified',
			description:
				'One item per article with its essentials: title, URL, source, date, country, language, standfirst, excerpts and relevance score',
		},
		{
			name: 'Raw',
			value: 'raw',
			description: 'One item per article with every field the API returns',
		},
		{
			name: 'Selected Fields',
			value: 'selectedFields',
			description: 'One item per article with the fields you pick, always with the URL',
		},
		{
			name: 'Full Response',
			value: 'fullResponse',
			description:
				'A single item with the whole API response, including usage, warnings and near misses',
		},
	],
	default: 'simplified',
};

const articleFieldsProperty: INodeProperties = {
	displayName: 'Fields',
	name: 'fields',
	type: 'multiOptions',
	displayOptions: { show: { ...SEARCH_OR_SIMILAR, output: ['selectedFields'] } },
	options: [
		{ name: 'Country', value: 'country' },
		{ name: 'Duplicates', value: 'duplicates' },
		{ name: 'Found In', value: 'found_in' },
		{ name: 'Headline Relevance', value: 'headline_relevance' },
		{ name: 'Highlights', value: 'highlights' },
		{ name: 'Language', value: 'language' },
		{ name: 'Published At', value: 'published_at' },
		{ name: 'Score', value: 'score' },
		{ name: 'Section', value: 'section' },
		{ name: 'Snippet', value: 'snippet' },
		{ name: 'Source', value: 'source' },
		{ name: 'Title', value: 'title' },
		{ name: 'Tone', value: 'tone' },
	],
	default: ['title', 'source', 'published_at', 'score'],
	description: 'The fields to return for each article. The URL is always included.',
};

const countriesOption: INodeProperties = {
	displayName: 'Countries',
	name: 'countries',
	type: 'string',
	default: '',
	placeholder: 'e.g. AR, US',
	description: 'Only sources from these countries: ISO 3166-1 alpha-2 codes, separated by commas',
};

const daysOption: INodeProperties = {
	displayName: 'Days',
	name: 'days',
	type: 'number',
	typeOptions: { minValue: 1, maxValue: 365 },
	default: 7,
	description:
		'Only articles from the last N days, from 1 to 365. Without it, the last 7 days unless a published date is set.',
};

const excludeDomainsOption: INodeProperties = {
	displayName: 'Exclude Domains',
	name: 'excludeDomains',
	type: 'string',
	default: '',
	placeholder: 'e.g. example.com, example.org/sports',
	description: 'Never these domains or paths, separated by commas (20 at most)',
};

const includeDomainsOption: INodeProperties = {
	displayName: 'Include Domains',
	name: 'includeDomains',
	type: 'string',
	default: '',
	placeholder: 'e.g. example.com, example.org/sports',
	description:
		'Only these domains or paths, separated by commas (20 at most). A domain includes its subdomains.',
};

const languagesOption: INodeProperties = {
	displayName: 'Languages',
	name: 'languages',
	type: 'string',
	default: '',
	placeholder: 'e.g. es, en',
	description: 'Only sources that publish in these languages: ISO 639-1 codes, separated by commas',
};

// --- Search ---------------------------------------------------------------------------------------

const queryProperty: INodeProperties = {
	displayName: 'Query',
	name: 'query',
	type: 'string',
	required: true,
	displayOptions: { show: SEARCH },
	default: '',
	placeholder: 'e.g. inflation in Argentina',
	description:
		'What to look for, in any language: a topic, event, person, company or place (2 to 200 characters)',
};

const searchOptionsProperty: INodeProperties = {
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add option',
	displayOptions: { show: SEARCH },
	default: {},
	options: [
		countriesOption,
		daysOption,
		{
			displayName: 'Dedupe',
			name: 'dedupe',
			type: 'boolean',
			default: true,
			description: 'Whether to group the same story reported by several outlets',
		},
		excludeDomainsOption,
		{
			displayName: 'Highlights',
			name: 'highlights',
			type: 'boolean',
			default: true,
			description:
				'Whether to add very short verbatim excerpts from the articles that were read (normal and deep modes). On by default in deep mode.',
		},
		includeDomainsOption,
		languagesOption,
		{
			displayName: 'Published After',
			name: 'publishedAfter',
			type: 'dateTime',
			default: '',
			description:
				'Only articles published on or after this date. A time without a time zone is read as UTC.',
		},
		{
			displayName: 'Published Before',
			name: 'publishedBefore',
			type: 'dateTime',
			default: '',
			description:
				'Only articles published on or before this date; a date without a time includes that whole day',
		},
		{
			displayName: 'Tone',
			name: 'tone',
			type: 'boolean',
			default: true,
			description:
				'Whether to add the tone of each article toward the query: positive, neutral or negative',
		},
	],
};

// --- Get Contents -------------------------------------------------------------------------------

const urlsProperty: INodeProperties = {
	displayName: 'URLs',
	name: 'urls',
	type: 'string',
	required: true,
	displayOptions: { show: CONTENTS },
	default: '',
	placeholder: 'e.g. https://example.com/news/article',
	description: 'Up to 10 news article URLs, separated by commas or new lines',
};

const contentsOutputProperty: INodeProperties = {
	displayName: 'Output',
	name: 'output',
	type: 'options',
	displayOptions: { show: CONTENTS },
	options: [
		{
			name: 'Simplified',
			value: 'simplified',
			description:
				'One item per URL with its title, standfirst, date, source and excerpt; with a query, also its relevance',
		},
		{
			name: 'Raw',
			value: 'raw',
			description: 'One item per URL with every field the API returns',
		},
		{
			name: 'Selected Fields',
			value: 'selectedFields',
			description: 'One item per URL with the fields you pick, always with the URL',
		},
		{
			name: 'Full Response',
			value: 'fullResponse',
			description: 'A single item with the whole API response, including usage',
		},
	],
	default: 'simplified',
};

const contentFieldsProperty: INodeProperties = {
	displayName: 'Fields',
	name: 'fields',
	type: 'multiOptions',
	displayOptions: { show: { ...CONTENTS, output: ['selectedFields'] } },
	options: [
		{ name: 'Description', value: 'description' },
		{ name: 'Error', value: 'error' },
		{ name: 'Excerpt', value: 'excerpt' },
		{ name: 'Highlights', value: 'highlights' },
		{ name: 'Published At', value: 'published_at' },
		{ name: 'Relevance', value: 'relevance' },
		{ name: 'Source', value: 'source' },
		{ name: 'Status', value: 'status' },
		{ name: 'Title', value: 'title' },
	],
	default: ['title', 'excerpt', 'relevance'],
	description: 'The fields to return for each URL. The URL is always included.',
};

const contentsOptionsProperty: INodeProperties = {
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add option',
	displayOptions: { show: CONTENTS },
	default: {},
	options: [
		{
			displayName: 'Query',
			name: 'query',
			type: 'string',
			default: '',
			placeholder: 'e.g. inflation',
			description:
				'The excerpt is then the one about this query, and relevance says how much each article covers it',
		},
	],
};

// --- Find Similar ---------------------------------------------------------------------------------

const urlProperty: INodeProperties = {
	displayName: 'URL',
	name: 'url',
	type: 'string',
	required: true,
	displayOptions: { show: SIMILAR },
	default: '',
	placeholder: 'e.g. https://example.com/news/article',
	description: 'The article URL whose story to find in other outlets',
};

const similarOptionsProperty: INodeProperties = {
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add option',
	displayOptions: { show: SIMILAR },
	default: {},
	options: [
		countriesOption,
		daysOption,
		excludeDomainsOption,
		includeDomainsOption,
		languagesOption,
	],
};

// El orden es el de la pantalla: primero lo que se busca, después cómo y qué devuelve.
export const nodeProperties: INodeProperties[] = [
	resourceProperty,
	...operationProperties,
	queryProperty,
	urlProperty,
	urlsProperty,
	modeProperty,
	maxResultsProperty,
	articlesOutputProperty,
	articleFieldsProperty,
	contentsOutputProperty,
	contentFieldsProperty,
	searchOptionsProperty,
	similarOptionsProperty,
	contentsOptionsProperty,
];
