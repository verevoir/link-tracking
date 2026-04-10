# @verevoir/link-tracking

URL shortener and click tracking — shorten URLs, resolve short codes, record clicks with metadata, compute analytics. Zero runtime dependencies. Standalone.

## What It Does

- **Shorten** — generate a unique short code for any URL, with optional custom aliases and expiry
- **Resolve** — look up the target URL for a short code (returns null for expired links)
- **Track** — record each click with referrer, user agent, IP, and arbitrary metadata
- **Batch Track** — `recordClicks()` for bulk ingestion from CDN access logs
- **Stats** — aggregate clicks by day, list unique referrers, compute totals

## Install

```bash
npm install @verevoir/link-tracking
```

## Quick Example

```typescript
import { createTracker } from '@verevoir/link-tracking';
import type { TrackerStore } from '@verevoir/link-tracking';

// Provide a store — any object with create/list/update methods.
// Compatible with @verevoir/storage StorageAdapter.
const tracker = createTracker({
  store: myStore,
  baseUrl: 'https://example.short',
});

// Shorten a URL
const link = await tracker.shorten('https://example.com/very-long-page');
console.log(link.shortCode); // e.g. "a1b2c3"

// Resolve a short code
const target = await tracker.resolve('a1b2c3');
// "https://example.com/very-long-page"

// Record a click
await tracker.recordClick('a1b2c3', {
  referrer: 'https://twitter.com',
  userAgent: 'Mozilla/5.0...',
  ip: '203.0.113.1',
});

// Get analytics
const stats = await tracker.getStats('a1b2c3');
console.log(stats.totalClicks); // 1
console.log(stats.clicksByDay); // { '2026-03-11': 1 }
console.log(stats.uniqueReferrers); // ['https://twitter.com']
```

### Custom Aliases and Expiry

```typescript
// Vanity short code
const link = await tracker.shorten('https://example.com/pricing', {
  alias: 'pricing',
});
// link.shortCode === 'pricing'

// Link with expiry
const promo = await tracker.shorten('https://example.com/sale', {
  expiresAt: new Date('2026-12-31'),
});
// tracker.resolve() returns null after expiry
```

### Batch Click Recording

```typescript
// Bulk ingestion from CDN access logs
await tracker.recordClicks([
  {
    code: 'a1b2c3',
    metadata: { referrer: 'https://google.com', ip: '1.2.3.4' },
  },
  {
    code: 'a1b2c3',
    metadata: { referrer: 'https://twitter.com', ip: '5.6.7.8' },
  },
  { code: 'x9y8z7', metadata: { referrer: null, ip: '9.10.11.12' } },
]);
// Groups by code for efficient count increments
```

## API

### Tracker

| Export                                           | Description               |
| ------------------------------------------------ | ------------------------- |
| `createTracker({ store, baseUrl, codeLength? })` | Create a tracker instance |

### Tracker Methods

| Method                         | Description                                           |
| ------------------------------ | ----------------------------------------------------- |
| `shorten(url, options?)`       | Create a tracked link with a unique short code        |
| `resolve(code)`                | Return the target URL, or null if not found / expired |
| `recordClick(code, metadata?)` | Record a single click event                           |
| `recordClicks(clicks)`         | Record multiple click events in batch                 |
| `getLink(code)`                | Get full link details                                 |
| `getClicks(code, options?)`    | Get raw click records (with limit/offset)             |
| `getStats(code)`               | Get aggregated analytics                              |

### Stats

| Export                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `computeStats(clicks)` | Compute LinkStats from an array of LinkClick records |

## Architecture

| File             | Responsibility                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `src/types.ts`   | Core interfaces: TrackerStore, TrackedLink, LinkClick, LinkStats, Tracker, ShortenOptions |
| `src/tracker.ts` | `createTracker()` factory — the core API                                                  |
| `src/codes.ts`   | Cryptographically secure short code generation (base62, collision detection)              |
| `src/stats.ts`   | Click aggregation — by day, unique referrers, totals                                      |

## Design Decisions

- **Structural storage typing.** `TrackerStore` defines only `create`, `list`, `update` — the minimum interface needed. It is structurally compatible with `@verevoir/storage` StorageAdapter without importing it.
- **Consumer owns the metadata.** The tracker does not decide what to collect. Cookies, headers, geo-lookup, consent — the consumer's responsibility. The tracker stores whatever `ClickMetadata` is provided.
- **No HTTP layer.** This is a library, not a server. The consumer wires it into their routing (Next.js API routes, Express, Cloudflare Workers, etc.).
- **Crypto-safe codes.** Short codes use `crypto.getRandomValues()` rather than `Math.random()`. Collision detection is built in.
- **Batch ingestion.** `recordClicks()` groups clicks by code for efficient count increments — designed for CDN log processing.
- **Zero runtime dependencies.** Pure TypeScript. No external libraries.

## Documentation

- [QR & Link Tracking](https://verevoir.io/docs/qr) — encoding, rendering, link tracking, and integration patterns

## Development

```bash
npm install    # Install dependencies
make build     # Compile TypeScript
make test      # Run test suite
make lint      # Check formatting
```
