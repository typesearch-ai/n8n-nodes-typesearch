# Changelog

All notable changes to `n8n-nodes-typesearch` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

First release.

- **typesearch** node with four operations: Search (`POST /v1/search`), Get Contents (`POST /v1/contents`),
  Find Similar (`POST /v1/similar`) and Check Coverage (`GET /v1/sources`).
- Search and Find Similar filters: days, published after and before, include and exclude domains, countries
  and languages; for Search, also highlights, dedupe and tone.
- Output per article (simplified, raw or selected fields) or the full API response.
- Usable as an AI Agent tool.
- API errors as `NodeApiError` with the API's code, detail, request ID and what to do; Continue On Fail
  supported.
- **Typesearch API** credential: API key as a bearer token, optional base URL, tested against `GET /v1/usage`.
- No runtime dependencies; published from GitHub Actions with npm provenance.
