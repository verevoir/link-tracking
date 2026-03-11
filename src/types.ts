/** Structural store interface — compatible with @verevoir/storage StorageAdapter without importing it. */
export interface TrackerStore {
  create(
    blockType: string,
    data: Record<string, unknown>,
  ): Promise<{ id: string; data: Record<string, unknown> }>;
  list(
    blockType: string,
    options?: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ id: string; data: Record<string, unknown> }[]>;
  update(
    id: string,
    data: Record<string, unknown>,
  ): Promise<{ id: string; data: Record<string, unknown> }>;
}

export interface TrackedLink {
  readonly id: string;
  readonly shortCode: string;
  readonly targetUrl: string;
  readonly createdAt: string;
  readonly createdBy: string | null;
  readonly clickCount: number;
  readonly expiresAt: string | null;
}

export interface ClickMetadata {
  readonly referrer?: string;
  readonly userAgent?: string;
  readonly ip?: string;
  readonly [key: string]: unknown;
}

export interface LinkClick {
  readonly id: string;
  readonly linkId: string;
  readonly timestamp: string;
  readonly referrer: string | null;
  readonly userAgent: string | null;
  readonly ip: string | null;
  readonly metadata: Record<string, unknown>;
}

export interface LinkStats {
  readonly totalClicks: number;
  readonly uniqueReferrers: string[];
  readonly clicksByDay: Record<string, number>;
}

export interface ShortenOptions {
  readonly createdBy?: string;
  readonly expiresAt?: Date;
  readonly alias?: string;
}

export interface TrackerConfig {
  readonly store: TrackerStore;
  readonly baseUrl: string;
  readonly codeLength?: number;
}

export interface Tracker {
  shorten(
    url: string,
    createdByOrOptions?: string | ShortenOptions,
  ): Promise<TrackedLink>;
  resolve(code: string): Promise<string | null>;
  recordClick(code: string, metadata?: ClickMetadata): Promise<void>;
  recordClicks(
    clicks: { code: string; metadata?: ClickMetadata }[],
  ): Promise<void>;
  getLink(code: string): Promise<TrackedLink | null>;
  getClicks(
    code: string,
    options?: { limit?: number; offset?: number },
  ): Promise<LinkClick[]>;
  getStats(code: string): Promise<LinkStats>;
}
