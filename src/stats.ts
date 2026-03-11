import type { LinkClick, LinkStats } from './types.js';

export function computeStats(clicks: LinkClick[]): LinkStats {
  const byDay: Record<string, number> = {};
  const referrers = new Set<string>();

  for (const click of clicks) {
    const day = click.timestamp.slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + 1;
    if (click.referrer) referrers.add(click.referrer);
  }

  return {
    totalClicks: clicks.length,
    uniqueReferrers: [...referrers],
    clicksByDay: byDay,
  };
}
