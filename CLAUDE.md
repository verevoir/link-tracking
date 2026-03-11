# @verevoir/link-tracking — URL Shortener & Click Tracking

The bitly pattern without the premium or someone else tracking your links. Shorten URLs, resolve short codes, record clicks with metadata, compute stats.

## What It Does

- **Shorten** — takes a URL, generates a unique short code, stores via your adapter
- **Custom aliases** — `shorten(url, { alias: 'my-link' })` for vanity short codes; uniqueness validated
- **Link expiry** — `shorten(url, { expiresAt: date })` makes links expire; `resolve()` returns null after expiry
- **Resolve** — given a short code, returns the target URL (or null if expired)
- **Track** — records each click with referrer, user agent, IP, and arbitrary metadata
- **Batch track** — `recordClicks([...])` for bulk ingestion (e.g. CDN access log processing); groups by code for efficient count increments
- **Stats** — aggregates clicks by day, lists unique referrers, totals

## Design Principles

- **Consumer owns the store** — `TrackerStore` is a structural interface compatible with `@verevoir/storage` StorageAdapter. No import dependency.
- **Consumer owns the metadata** — cookies, headers, geo-lookup are the consumer's problem. The tracker just stores what you give it.
- **Zero runtime dependencies** — pure TypeScript.
- **Extensible metadata** — `ClickMetadata` accepts arbitrary extra fields via index signature.

## Setup

```bash
npm install
```

## Commands

- `make build` — compile TypeScript (ESM + CJS + .d.ts)
- `make test` — run vitest
- `make lint` — eslint + prettier check

## Architecture

- `src/types.ts` — TrackerStore, TrackedLink, LinkClick, LinkStats, Tracker, ShortenOptions interfaces
- `src/tracker.ts` — `createTracker()` factory — the core API
- `src/codes.ts` — cryptographically secure short code generation (base62)
- `src/stats.ts` — click aggregation (by day, unique referrers)

## Dependencies

Zero runtime dependencies. `TrackerStore` is structurally typed — pass a `@verevoir/storage` StorageAdapter or any object that implements `create`, `list`, `update`.
