# @verevoir/link-tracking — Intent

## Why

URL shorteners like bitly are convenient but come with a premium price and someone else tracking your users. This package provides the same core functionality — shorten, resolve, track — as a library the developer owns and deploys.

Combined with `@verevoir/qr`, it enables generating QR codes for tracked URLs: scan the code, hit the redirect, record the click.

## Key Decisions

- **Structural storage typing** — the `TrackerStore` interface defines only `create`, `list`, `update`. It's compatible with `@verevoir/storage` StorageAdapter without importing it, following the same pattern as `@verevoir/access/role-store`.
- **Consumer-driven metadata** — the tracker doesn't decide what to collect. Cookies, headers, geo data — the consumer passes whatever they want as `ClickMetadata`.
- **Crypto-safe codes** — short codes use `crypto.getRandomValues()` with base62 encoding. Collision detection via store lookup.
- **No HTTP layer** — this is a library, not a server. The consumer wires it into their own routing (Next.js API routes, Express, etc.).
