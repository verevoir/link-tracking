import { describe, it, expect } from 'vitest';
import { computeStats } from '../src/index.js';
import type { LinkClick } from '../src/index.js';

function click(overrides: Partial<LinkClick> = {}): LinkClick {
  return {
    id: 'c1',
    linkId: 'link-1',
    timestamp: '2026-03-11T10:00:00Z',
    referrer: null,
    userAgent: null,
    ip: null,
    metadata: {},
    ...overrides,
  };
}

describe('computeStats', () => {
  it('returns empty stats for no clicks', () => {
    const stats = computeStats([]);
    expect(stats.totalClicks).toBe(0);
    expect(stats.uniqueReferrers).toHaveLength(0);
    expect(Object.keys(stats.clicksByDay)).toHaveLength(0);
  });

  it('counts clicks by day', () => {
    const stats = computeStats([
      click({ timestamp: '2026-03-10T09:00:00Z' }),
      click({ timestamp: '2026-03-10T15:00:00Z' }),
      click({ timestamp: '2026-03-11T10:00:00Z' }),
    ]);
    expect(stats.totalClicks).toBe(3);
    expect(stats.clicksByDay['2026-03-10']).toBe(2);
    expect(stats.clicksByDay['2026-03-11']).toBe(1);
  });

  it('collects unique referrers', () => {
    const stats = computeStats([
      click({ referrer: 'https://google.com' }),
      click({ referrer: 'https://google.com' }),
      click({ referrer: 'https://twitter.com' }),
      click({ referrer: null }),
    ]);
    expect(stats.uniqueReferrers).toHaveLength(2);
    expect(stats.uniqueReferrers).toContain('https://google.com');
    expect(stats.uniqueReferrers).toContain('https://twitter.com');
  });
});
