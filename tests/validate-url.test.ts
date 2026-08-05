import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTracker,
  defaultValidateUrl,
  rejectSelfReferential,
  InvalidUrlError,
} from '../src/index.js';
import type { TrackerStore } from '../src/index.js';

function createMemoryStore(): TrackerStore {
  const docs: Map<
    string,
    { id: string; blockType: string; data: Record<string, unknown> }
  > = new Map();
  let counter = 0;
  return {
    async create(blockType, data) {
      const id = `doc-${++counter}`;
      docs.set(id, { id, blockType, data: { ...data } });
      return { id, data: { ...data } };
    },
    async list(blockType, options) {
      let results = [...docs.values()].filter((d) => d.blockType === blockType);
      if (options?.where) {
        for (const [k, v] of Object.entries(options.where)) {
          results = results.filter((d) => d.data[k] === v);
        }
      }
      return results.map((d) => ({ id: d.id, data: d.data }));
    },
    async update(id, data) {
      const existing = docs.get(id);
      if (!existing) throw new Error('not found');
      existing.data = { ...data };
      return { id, data: existing.data };
    },
  };
}

describe('defaultValidateUrl', () => {
  it('accepts http, https, mailto, tel', () => {
    expect(() => defaultValidateUrl('http://example.com')).not.toThrow();
    expect(() =>
      defaultValidateUrl('https://example.com/path?q=1'),
    ).not.toThrow();
    expect(() => defaultValidateUrl('mailto:a@b.com')).not.toThrow();
    expect(() => defaultValidateUrl('tel:+441234567890')).not.toThrow();
  });

  it('rejects javascript: URLs', () => {
    expect(() => defaultValidateUrl('javascript:alert(1)')).toThrow(
      InvalidUrlError,
    );
  });

  it('rejects data: URLs', () => {
    expect(() =>
      defaultValidateUrl('data:text/html,<script>alert(1)</script>'),
    ).toThrow(InvalidUrlError);
  });

  it('rejects vbscript:, file:, blob:, filesystem:, and app-launch schemes', () => {
    for (const url of [
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://example.com/abc',
      'filesystem:https://example.com/abc',
      'intent://scan/#Intent;scheme=zxing',
      'tg://resolve?domain=abc',
      'slack://channel?team=1',
    ]) {
      expect(() => defaultValidateUrl(url), url).toThrow(InvalidUrlError);
    }
  });

  it('rejects scheme-smuggling via tabs, newlines, and other control chars', () => {
    expect(() => defaultValidateUrl('java\tscript:alert(1)')).toThrow(
      InvalidUrlError,
    );
    expect(() => defaultValidateUrl('java\nscript:alert(1)')).toThrow(
      InvalidUrlError,
    );
    expect(() => defaultValidateUrl('\0javascript:alert(1)')).toThrow(
      InvalidUrlError,
    );
  });

  it('rejects URLs without a scheme', () => {
    expect(() => defaultValidateUrl('example.com')).toThrow(InvalidUrlError);
    expect(() => defaultValidateUrl('/relative/path')).toThrow(InvalidUrlError);
  });

  it('rejects empty and whitespace-only URLs', () => {
    expect(() => defaultValidateUrl('')).toThrow(InvalidUrlError);
    expect(() => defaultValidateUrl('   ')).toThrow(InvalidUrlError);
    expect(() => defaultValidateUrl('\t\n')).toThrow(InvalidUrlError);
  });

  it('rejects URLs over 2048 characters', () => {
    const huge = 'https://example.com/' + 'a'.repeat(2100);
    expect(() => defaultValidateUrl(huge)).toThrow(/max length/);
  });
});

describe('rejectSelfReferential', () => {
  const blocked = ['vrev.io', 'slnq.io', 'slinqi.io'];

  it('rejects exact host matches', () => {
    expect(() => rejectSelfReferential('https://vrev.io/abc', blocked)).toThrow(
      InvalidUrlError,
    );
    expect(() =>
      rejectSelfReferential('https://slnq.io/login', blocked),
    ).toThrow(InvalidUrlError);
  });

  it('rejects subdomain matches', () => {
    expect(() =>
      rejectSelfReferential('https://acme.vrev.io/link', blocked),
    ).toThrow(InvalidUrlError);
  });

  it('accepts unrelated hosts', () => {
    expect(() =>
      rejectSelfReferential('https://example.com/abc', blocked),
    ).not.toThrow();
    // A hostname that happens to CONTAIN the blocked string but isn't
    // a subdomain — e.g. `notvrev.io` — should pass.
    expect(() =>
      rejectSelfReferential('https://notvrev.io/abc', blocked),
    ).not.toThrow();
  });

  it('is case-insensitive on hostnames', () => {
    expect(() => rejectSelfReferential('https://VREV.IO/abc', blocked)).toThrow(
      InvalidUrlError,
    );
  });
});

describe('tracker.shorten URL validation', () => {
  let store: TrackerStore;

  beforeEach(() => {
    store = createMemoryStore();
  });

  it('refuses to create a link for a javascript: URL', async () => {
    const tracker = createTracker({ store, baseUrl: 'https://short.test' });
    await expect(tracker.shorten('javascript:alert(1)')).rejects.toBeInstanceOf(
      InvalidUrlError,
    );
    // Nothing persisted.
    const docs = await store.list('tracked-link');
    expect(docs).toHaveLength(0);
  });

  it('refuses to create a link for a data: URL', async () => {
    const tracker = createTracker({ store, baseUrl: 'https://short.test' });
    await expect(
      tracker.shorten('data:text/html,<script>alert(1)</script>'),
    ).rejects.toBeInstanceOf(InvalidUrlError);
  });

  it('accepts a consumer-provided validator that composes on top of the default', async () => {
    const tracker = createTracker({
      store,
      baseUrl: 'https://short.test',
      validateUrl: (url) => {
        defaultValidateUrl(url);
        rejectSelfReferential(url, ['vrev.io']);
      },
    });
    // Safe scheme but self-referential — blocked.
    await expect(tracker.shorten('https://vrev.io/abc')).rejects.toBeInstanceOf(
      InvalidUrlError,
    );
    // Safe scheme and not self-referential — allowed.
    const link = await tracker.shorten('https://example.com');
    expect(link.targetUrl).toBe('https://example.com');
  });

  it('allows override to a no-op validator (opt out of enforcement)', async () => {
    // Useful for migrations / tests where the caller has already
    // validated — but a clear foot-gun if misused in production.
    const tracker = createTracker({
      store,
      baseUrl: 'https://short.test',
      validateUrl: () => {},
    });
    const link = await tracker.shorten('javascript:alert(1)');
    expect(link.targetUrl).toBe('javascript:alert(1)');
  });
});
