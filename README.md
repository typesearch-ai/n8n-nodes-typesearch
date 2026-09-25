# n8n-nodes-typesearch

An [n8n](https://n8n.io) community node for [typesearch](https://typesearch.ai): news search for AI agents
and workflows. Search recent news on any topic from outlets worldwide, each article with a calibrated
relevance score, by country and language. Also gets short excerpts of article URLs, finds other coverage of
a story, and checks the index coverage.

It works in regular workflows and as a tool of the **AI Agent** node.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Output](#output)
- [Use it as an AI Agent tool](#use-it-as-an-ai-agent-tool)
- [Example workflow](#example-workflow)
- [Errors](#errors)
- [Compatibility](#compatibility)
- [Development](#development)

## Installation

In n8n, go to **Settings → Community nodes → Install**, enter `n8n-nodes-typesearch` and confirm. Then
search for **typesearch** in the nodes panel.

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)
for other options, such as installing with npm on a self-hosted n8n.

## Credentials

1. Create an API key in the [typesearch dashboard](https://app.typesearch.ai). Keys start with `ts_live_`.
2. In n8n, create a **Typesearch API** credential and paste the key in **API Key**.
3. Leave **Base URL** as `https://api.typesearch.ai`.

The key is sent as `Authorization: Bearer <key>`. n8n checks the credential against `GET /v1/usage`, which is
free. Every other call is billed to the key like the REST API: see [pricing](https://typesearch.ai/pricing).
Failed requests and cached results are free.

## Operations

| Resource | Operation | Endpoint | What it does |
| --- | --- | --- | --- |
| Article | **Search** | `POST /v1/search` | Recent news on a topic, judged by a relevance model. |
| Article | **Get Contents** | `POST /v1/contents` | Title, standfirst, date, source and a short verbatim excerpt (up to 25 words) of up to 10 article URLs. Never the full text. |
| Article | **Find Similar** | `POST /v1/similar` | Other articles about the same story as an article URL. |
| Source | **Check Coverage** | `GET /v1/sources` | Whether a news domain is in the index, or how many sources and articles the index has by country and language. Free. |

### Search

| Parameter | | |
| --- | --- | --- |
| Query | required | What to look for, in any language: a topic, event, person, company or place (2 to 200 characters). |
| Mode | `fast` | `ultra`: headlines only · `fast`: headlines and standfirsts, the quickest and cheapest · `normal`: also reads the best matches · `deep`: reads more and finds the topic in other words (can take about a minute). |
| Max Results | `10` | 1 to 50. |
| Output | Simplified | See [Output](#output). |

**Options**: Countries (ISO 3166-1 alpha-2, such as `AR, US`), Days (the last N days, 1 to 365; the last 7 by
default), Dedupe (group the same story from several outlets), Exclude Domains, Highlights (short verbatim
excerpts from the articles that were read), Include Domains, Languages (ISO 639-1, such as `es, en`),
Published After, Published Before, Tone (positive, neutral or negative toward the query).

Lists take commas or new lines, or an array from an expression. A date without a time covers that whole day;
a time without a time zone is read as UTC.

### Get Contents

**URLs** (required): up to 10 article URLs, separated by commas or new lines. **Options → Query**: the excerpt is
then the one about the query, with a `relevance` score for how much the article covers it.

### Find Similar

**URL** (required), Mode, Max Results and Output, like Search. **Options**: Countries, Days (7 by default),
Exclude Domains (for example, the outlet of the original article), Include Domains, Languages.

### Check Coverage

**Domain** (optional): a news domain such as `example.com`. Empty: the coverage of the whole index by country
and language. It never lists the sources.

## Output

Search and Find Similar return **one item per article**; Get Contents, one item per URL. **Output** chooses
what each item carries:

- **Simplified** (default): the essentials, always with the same fields:

  ```json
  {
    "title": "El dólar cerró estable",
    "url": "https://diarioejemplo.example/economia/nota-1",
    "source": "Diario Ejemplo",
    "published_at": "2026-09-21T18:05:00.000Z",
    "country": "AR",
    "language": "es",
    "snippet": "La divisa se mantuvo sin cambios frente al cierre anterior.",
    "highlights": [],
    "score": 0.95
  }
  ```

  `score` is the calibrated probability that the article is about your query: `0.9` means relevant, and
  anything between `0.35` and `0.65` means the model is undecided. `tone` and `duplicates` are added when you
  turn on Tone or Dedupe.

- **Raw**: every field the API returns for each article (section, headline relevance, where it was found…).
- **Selected Fields**: only the fields you pick in **Fields**, always with the URL. Handy for AI agents.
- **Full Response**: a single item with the whole API response, including `usage.cost_usd`, `warnings`,
  `incomplete` and, when nothing matched, `near_misses`.

When a search finds nothing, Simplified and Raw return no items: turn on **Always Output Data** in the node
settings if the workflow must go on.

## Use it as an AI Agent tool

Connect a **typesearch** node to the **Tool** input of an AI Agent and pick the operation. Use one typesearch
tool per operation (for example, Search and Get Contents), and let the model fill the parameters it should
choose (**Let the model define this parameter**, or `$fromAI()`), at least **Query**, **URLs** or **URL**.

On self-hosted n8n, community nodes work as tools only with `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`
in n8n's environment (restart n8n after setting it).

n8n describes each tool to the model from its operation (for example, *Search recent news on a topic in
typesearch*). For better choices, set **Description → Set Manually** and use these:

- **Search**: Search recent news on any topic across a curated index of news outlets worldwide, judged by a
  relevance model. Returns the matching articles: title, link, source, date, country and language,
  standfirst, and short excerpts in the modes that read.
- **Get Contents**: Get the title, standfirst, date, source and a short verbatim excerpt (up to 25 words) of up
  to 10 news article URLs. With a query, the excerpt is the one about it and relevance says how much the
  article covers it. Never returns the full text.
- **Find Similar**: Find other news articles about the same story as a given article URL, across the index
  (the last 7 days by default).
- **Check Coverage**: Check whether a news domain is in the typesearch index, or get the index coverage: how
  many sources and articles, by country and by language. Free.

Keep **Output** on Simplified (or Selected Fields) for agents: it is compact and saves tokens.

## Example workflow

[`examples/search-news.json`](examples/search-news.json) searches the news of the last day and keeps the
articles with a score of 0.8 or more. In n8n, open a new workflow, copy the file's content and paste it on the
canvas (Ctrl+V / Cmd+V), then choose your typesearch credential.

## Errors

API errors stop the node with a message that carries the API's own detail and stable code, such as
`The API key is not valid. (invalid_api_key)`, and a description of what to do:

| Status | Codes | What to do |
| --- | --- | --- |
| 400 | `invalid_request` | The description lists each invalid field. |
| 401 | `missing_api_key`, `invalid_api_key`, `revoked_api_key` | Check the key in the credential. |
| 402 | `insufficient_credits`, `spend_limit_reached` | Add credit or raise the limit in the [dashboard](https://app.typesearch.ai). |
| 429 | `rate_limited`, `quota_exceeded` | Wait the `Retry-After` seconds; you can turn on **Retry On Fail** in the node settings. |
| 5xx | | Try again; failed requests are not billed. |

With **On Error → Continue** in the node settings, a failed item comes out as
`{ "error", "code", "status", "description", "request_id" }` and the other items go on.

## Compatibility

Developed and tested against n8n 2.40 (`n8n-workflow` 2.40). The node uses n8n's own HTTP helper and has no
runtime dependencies.

## Resources

- [typesearch documentation](https://typesearch.ai/docs) and the [n8n guide](https://typesearch.ai/docs/integrations/n8n)
- [API reference](https://typesearch.ai/docs/api-reference)
- [n8n community nodes](https://docs.n8n.io/integrations/#community-nodes)

## Development

```bash
npm ci
npm run lint        # n8n's linter, in strict mode (n8n Cloud rules)
npm run typecheck
npm test            # the node against a fake API that validates every request against the OpenAPI
npm run build       # dist/, what gets published
npm run check:dist  # loads dist/ as n8n does
npm run dev         # n8n on http://localhost:5678 with this node, hot reloaded
```

`npm run test:live` runs a few calls against the real API with `TYPESEARCH_API_KEY` (spends less than a cent).
`npm run schemas` refreshes the OpenAPI schemas the fake API validates with.

Releases are published to npm from GitHub Actions with a provenance statement when a GitHub release is
published: see [`.github/workflows/release.yml`](.github/workflows/release.yml).

## License

[MIT](LICENSE)
