export { createTracker } from './tracker.js';
export { computeStats } from './stats.js';
export type {
  TrackerStore,
  TrackerConfig,
  Tracker,
  TrackedLink,
  ClickMetadata,
  LinkClick,
  LinkStats,
  ShortenOptions,
} from './types.js';

// URL validation — exposed so consumers can compose a stricter
// policy (e.g. block self-referential hostnames) on top of the default.
export {
  defaultValidateUrl,
  rejectSelfReferential,
  InvalidUrlError,
  DEFAULT_ALLOWED_URL_SCHEMES,
} from './validate-url.js';
