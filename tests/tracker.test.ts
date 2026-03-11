import { describe, it, expect, beforeEach } from 'vitest';
import { createTracker } from '../src/index.js';
import type { TrackerStore } from '../src/index.js';

/** In-memory store matching the TrackerStore interface. */
function createMemoryStore(): TrackerStore {
  const docs: Map<
    string,
    { id: string; blockType: string; data: Record<string, unknown> }
  > = new Map();
  let counter = 0;

  return {
    async create(blockType, data) {
      const id = `doc-${++counter}`;
      const doc = { id, blockType, data: { ...data } };
      docs.set(id, doc);
      return { id, data: doc.data };
    },
    async list(blockType, options) {
      let results = [...docs.values()].filter((d) => d.blockType === blockType);
      if (options?.where) {
        for (const [key, value] of Object.entries(options.where)) {
          results = results.filter((d) => d.data[key] === value);
        }
      }
      if (options?.orderBy) {
        const [field, dir] = Object.entries(options.orderBy)[0];
        results.sort((a, b) => {
          const av = String(a.data[field] ?? '');
          const bv = String(b.data[field] ?? '');
          return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (options?.offset) results = results.slice(options.offset);
      if (options?.limit) results = results.slice(0, options.limit);
      return results.map((d) => ({ id: d.id, data: d.data }));
    },
    async update(id, data) {
      const existing = docs.get(id);
      if (!existing) throw new Error(`Not found: ${id}`);
      existing.data = { ...data };
      return { id, data: existing.data };
    },
  };
}

describe('createTracker', () => {
  let store: TrackerStore;

  beforeEach(() => {
    store = createMemoryStore();
  });

  it('shortens a URL and resolves it', async () => {
    const tracker = createTracker({ store, baseUrl: 'https://short.test' });
    const link = await tracker.shorten('https://example.com');
    expect(link.shortCode).toHaveLength(6);
    expect(link.targetUrl).toBe('https://example.com');
    expect(link.clickCount).toBe(0);

    const resolved = await tracker.resolve(link.shortCode);
    expect(resolved).toBe('https://example.com');
  });

  it('returns null for unknown codes', async () => {
    const tracker = createTracker({ store, baseUrl: 'https://short.test' });
    expect(await tracker.resolve('nope')).toBeNull();
    expect(await tracker.getLink('nope')).toBeNull();
  });

  it('records clicks and increments count', async () => {
    const tracker = createTracker({ store, baseUrl: 'https://short.test' });
    const link = await tracker.shorten('https://example.com');

    await tracker.recordClick(link.shortCode, {
      referrer: 'https://google.com',
      userAgent: 'TestBot/1.0',
    });
    await tracker.recordClick(link.shortCode, {
      referrer: 'https://twitter.com',
    });

    const updated = await tracker.getLink(link.shortCode);
    expect(updated!.clickCount).toBe(2);

    const clicks = await tracker.getClicks(link.shortCode);
    expect(clicks).toHaveLength(2);
    const referrers = clicks.map((c) => c.referrer).sort();
    expect(referrers).toEqual(['https://google.com', 'https://twitter.com']);
  });

  it('throws when recording click for unknown code', async () => {
    const tracker = createTracker({ store, baseUrl: 'https://short.test' });
    await expect(tracker.recordClick('nope')).rejects.toThrow(
      'Link not found: nope',
    );
  });

  it('computes stats', async () => {
    const tracker = createTracker({ store, baseUrl: 'https://short.test' });
    const link = await tracker.shorten('https://example.com');

    await tracker.recordClick(link.shortCode, {
      referrer: 'https://google.com',
    });
    await tracker.recordClick(link.shortCode, {
      referrer: 'https://google.com',
    });
    await tracker.recordClick(link.shortCode, {
      referrer: 'https://twitter.com',
    });

    const stats = await tracker.getStats(link.shortCode);
    expect(stats.totalClicks).toBe(3);
    expect(stats.uniqueReferrers).toContain('https://google.com');
    expect(stats.uniqueReferrers).toContain('https://twitter.com');
    expect(stats.uniqueReferrers).toHaveLength(2);
  });

  it('returns empty stats for unknown code', async () => {
    const tracker = createTracker({ store, baseUrl: 'https://short.test' });
    const stats = await tracker.getStats('nope');
    expect(stats.totalClicks).toBe(0);
    expect(stats.uniqueReferrers).toHaveLength(0);
  });

  it('supports custom code length', async () => {
    const tracker = createTracker({
      store,
      baseUrl: 'https://short.test',
      codeLength: 10,
    });
    const link = await tracker.shorten('https://example.com');
    expect(link.shortCode).toHaveLength(10);
  });

  it('records createdBy', async () => {
    const tracker = createTracker({ store, baseUrl: 'https://short.test' });
    const link = await tracker.shorten('https://example.com', 'user-42');
    expect(link.createdBy).toBe('user-42');
  });

  it('supports click metadata', async () => {
    const tracker = createTracker({ store, baseUrl: 'https://short.test' });
    const link = await tracker.shorten('https://example.com');

    await tracker.recordClick(link.shortCode, {
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      referrer: 'https://search.example',
      customField: 'hello',
    });

    const clicks = await tracker.getClicks(link.shortCode);
    expect(clicks[0].ip).toBe('1.2.3.4');
    expect(clicks[0].userAgent).toBe('Mozilla/5.0');
    expect(clicks[0].metadata).toHaveProperty('customField', 'hello');
  });

  describe('recordClicks (batch)', () => {
    it('records multiple clicks across different codes', async () => {
      const tracker = createTracker({ store, baseUrl: 'https://short.test' });
      const linkA = await tracker.shorten('https://a.example.com');
      const linkB = await tracker.shorten('https://b.example.com');

      await tracker.recordClicks([
        {
          code: linkA.shortCode,
          metadata: { referrer: 'https://google.com' },
        },
        {
          code: linkA.shortCode,
          metadata: { referrer: 'https://twitter.com' },
        },
        { code: linkB.shortCode, metadata: { referrer: 'https://bing.com' } },
        { code: linkA.shortCode },
      ]);

      const updatedA = await tracker.getLink(linkA.shortCode);
      expect(updatedA!.clickCount).toBe(3);

      const updatedB = await tracker.getLink(linkB.shortCode);
      expect(updatedB!.clickCount).toBe(1);

      const clicksA = await tracker.getClicks(linkA.shortCode);
      expect(clicksA).toHaveLength(3);

      const clicksB = await tracker.getClicks(linkB.shortCode);
      expect(clicksB).toHaveLength(1);
      expect(clicksB[0].referrer).toBe('https://bing.com');
    });

    it('throws when batch contains unknown code', async () => {
      const tracker = createTracker({ store, baseUrl: 'https://short.test' });
      const link = await tracker.shorten('https://example.com');

      await expect(
        tracker.recordClicks([
          { code: link.shortCode },
          { code: 'unknown-code' },
        ]),
      ).rejects.toThrow('Link not found: unknown-code');
    });

    it('handles empty batch', async () => {
      const tracker = createTracker({ store, baseUrl: 'https://short.test' });
      await tracker.recordClicks([]);
    });
  });

  describe('link expiry', () => {
    it('resolves link before expiry', async () => {
      const tracker = createTracker({ store, baseUrl: 'https://short.test' });
      const future = new Date(Date.now() + 60_000);
      const link = await tracker.shorten('https://example.com', {
        expiresAt: future,
      });

      expect(link.expiresAt).toBe(future.toISOString());
      const resolved = await tracker.resolve(link.shortCode);
      expect(resolved).toBe('https://example.com');
    });

    it('returns null when resolving expired link', async () => {
      const tracker = createTracker({ store, baseUrl: 'https://short.test' });
      const past = new Date(Date.now() - 60_000);
      const link = await tracker.shorten('https://example.com', {
        expiresAt: past,
      });

      const resolved = await tracker.resolve(link.shortCode);
      expect(resolved).toBeNull();
    });

    it('getLink still returns expired links', async () => {
      const tracker = createTracker({ store, baseUrl: 'https://short.test' });
      const past = new Date(Date.now() - 60_000);
      const link = await tracker.shorten('https://example.com', {
        expiresAt: past,
      });

      const fetched = await tracker.getLink(link.shortCode);
      expect(fetched).not.toBeNull();
      expect(fetched!.expiresAt).toBe(past.toISOString());
    });

    it('link without expiresAt never expires', async () => {
      const tracker = createTracker({ store, baseUrl: 'https://short.test' });
      const link = await tracker.shorten('https://example.com');
      expect(link.expiresAt).toBeNull();

      const resolved = await tracker.resolve(link.shortCode);
      expect(resolved).toBe('https://example.com');
    });
  });

  describe('custom aliases', () => {
    it('shortens with a custom alias', async () => {
      const tracker = createTracker({ store, baseUrl: 'https://short.test' });
      const link = await tracker.shorten('https://example.com', {
        alias: 'my-link',
      });

      expect(link.shortCode).toBe('my-link');
      expect(link.targetUrl).toBe('https://example.com');

      const resolved = await tracker.resolve('my-link');
      expect(resolved).toBe('https://example.com');
    });

    it('rejects duplicate alias', async () => {
      const tracker = createTracker({ store, baseUrl: 'https://short.test' });
      await tracker.shorten('https://a.example.com', { alias: 'taken' });

      await expect(
        tracker.shorten('https://b.example.com', { alias: 'taken' }),
      ).rejects.toThrow('Alias already in use: taken');
    });

    it('alias with createdBy and expiresAt', async () => {
      const tracker = createTracker({ store, baseUrl: 'https://short.test' });
      const future = new Date(Date.now() + 60_000);
      const link = await tracker.shorten('https://example.com', {
        alias: 'promo',
        createdBy: 'user-1',
        expiresAt: future,
      });

      expect(link.shortCode).toBe('promo');
      expect(link.createdBy).toBe('user-1');
      expect(link.expiresAt).toBe(future.toISOString());
    });
  });
});
