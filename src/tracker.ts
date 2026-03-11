import type {
  TrackerConfig,
  Tracker,
  TrackedLink,
  ClickMetadata,
  LinkClick,
  LinkStats,
  TrackerStore,
  ShortenOptions,
} from './types.js';
import { generateUniqueCode } from './codes.js';
import { computeStats } from './stats.js';

const LINK_BLOCK = 'tracked-link';
const CLICK_BLOCK = 'link-click';

function docToLink(doc: {
  id: string;
  data: Record<string, unknown>;
}): TrackedLink {
  return {
    id: doc.id,
    shortCode: doc.data.shortCode as string,
    targetUrl: doc.data.targetUrl as string,
    createdAt: doc.data.createdAt as string,
    createdBy: (doc.data.createdBy as string) ?? null,
    clickCount: (doc.data.clickCount as number) ?? 0,
    expiresAt: (doc.data.expiresAt as string) ?? null,
  };
}

function isExpired(doc: { data: Record<string, unknown> }): boolean {
  const expiresAt = doc.data.expiresAt as string | null;
  if (!expiresAt) return false;
  return new Date(expiresAt) <= new Date();
}

function normalizeShortenOptions(
  createdByOrOptions?: string | ShortenOptions,
): ShortenOptions {
  if (typeof createdByOrOptions === 'string') {
    return { createdBy: createdByOrOptions };
  }
  return createdByOrOptions ?? {};
}

function docToClick(doc: {
  id: string;
  data: Record<string, unknown>;
}): LinkClick {
  return {
    id: doc.id,
    linkId: doc.data.linkId as string,
    timestamp: doc.data.timestamp as string,
    referrer: (doc.data.referrer as string) ?? null,
    userAgent: (doc.data.userAgent as string) ?? null,
    ip: (doc.data.ip as string) ?? null,
    metadata: (doc.data.metadata as Record<string, unknown>) ?? {},
  };
}

async function findByCode(
  store: TrackerStore,
  code: string,
): Promise<{ id: string; data: Record<string, unknown> } | null> {
  const docs = await store.list(LINK_BLOCK, {
    where: { shortCode: code },
  });
  return docs[0] ?? null;
}

export function createTracker(config: TrackerConfig): Tracker {
  const { store, codeLength = 6 } = config;

  return {
    async shorten(
      url: string,
      createdByOrOptions?: string | ShortenOptions,
    ): Promise<TrackedLink> {
      const options = normalizeShortenOptions(createdByOrOptions);

      let code: string;
      if (options.alias) {
        const existing = await findByCode(store, options.alias);
        if (existing) {
          throw new Error(`Alias already in use: ${options.alias}`);
        }
        code = options.alias;
      } else {
        code = await generateUniqueCode(store, codeLength);
      }

      const doc = await store.create(LINK_BLOCK, {
        shortCode: code,
        targetUrl: url,
        createdAt: new Date().toISOString(),
        createdBy: options.createdBy ?? null,
        clickCount: 0,
        expiresAt: options.expiresAt ? options.expiresAt.toISOString() : null,
      });
      return docToLink(doc);
    },

    async resolve(code: string): Promise<string | null> {
      const doc = await findByCode(store, code);
      if (!doc) return null;
      if (isExpired(doc)) return null;
      return doc.data.targetUrl as string;
    },

    async recordClick(code: string, metadata?: ClickMetadata): Promise<void> {
      const doc = await findByCode(store, code);
      if (!doc) throw new Error(`Link not found: ${code}`);

      await store.create(CLICK_BLOCK, {
        linkId: doc.id,
        timestamp: new Date().toISOString(),
        referrer: metadata?.referrer ?? null,
        userAgent: metadata?.userAgent ?? null,
        ip: metadata?.ip ?? null,
        metadata: metadata ?? {},
      });

      await store.update(doc.id, {
        ...doc.data,
        clickCount: ((doc.data.clickCount as number) ?? 0) + 1,
      });
    },

    async recordClicks(
      clicks: { code: string; metadata?: ClickMetadata }[],
    ): Promise<void> {
      // Group clicks by short code for efficient batch processing
      const grouped = new Map<
        string,
        { code: string; metadata?: ClickMetadata }[]
      >();
      for (const click of clicks) {
        const group = grouped.get(click.code);
        if (group) {
          group.push(click);
        } else {
          grouped.set(click.code, [click]);
        }
      }

      for (const [code, codeClicks] of grouped) {
        const doc = await findByCode(store, code);
        if (!doc) throw new Error(`Link not found: ${code}`);

        // Create all click records for this code
        for (const click of codeClicks) {
          await store.create(CLICK_BLOCK, {
            linkId: doc.id,
            timestamp: new Date().toISOString(),
            referrer: click.metadata?.referrer ?? null,
            userAgent: click.metadata?.userAgent ?? null,
            ip: click.metadata?.ip ?? null,
            metadata: click.metadata ?? {},
          });
        }

        // Single batched increment for this code
        await store.update(doc.id, {
          ...doc.data,
          clickCount:
            ((doc.data.clickCount as number) ?? 0) + codeClicks.length,
        });
      }
    },

    async getLink(code: string): Promise<TrackedLink | null> {
      const doc = await findByCode(store, code);
      return doc ? docToLink(doc) : null;
    },

    async getClicks(
      code: string,
      options?: { limit?: number; offset?: number },
    ): Promise<LinkClick[]> {
      const doc = await findByCode(store, code);
      if (!doc) return [];

      const clicks = await store.list(CLICK_BLOCK, {
        where: { linkId: doc.id },
        orderBy: { timestamp: 'desc' },
        limit: options?.limit,
        offset: options?.offset,
      });

      return clicks.map(docToClick);
    },

    async getStats(code: string): Promise<LinkStats> {
      const doc = await findByCode(store, code);
      if (!doc) return { totalClicks: 0, uniqueReferrers: [], clicksByDay: {} };

      const clicks = await store.list(CLICK_BLOCK, {
        where: { linkId: doc.id },
      });

      return computeStats(clicks.map(docToClick));
    },
  };
}
