/**
 * URL validation for the shortener. Applied at `shorten()` time so an
 * attacker can't mint `vrev.io/login` → `javascript:fetch(...)` or
 * `data:text/html,<phishing-form>` links that ride on the host's brand
 * trust.
 *
 * Consumers can override `validateUrl` on `TrackerConfig` to extend this
 * (e.g. to block self-referential hostnames so the shortener can't be
 * pointed at its own domain). Use `defaultValidateUrl` as the baseline
 * and layer additional checks on top.
 */

/**
 * Schemes the shortener will accept by default. `http(s):` for web
 * targets; `mailto:` and `tel:` are common QR-code targets (open mail
 * client, dial a number) and are safe because browsers/OS handlers can
 * only launch the default app, not execute code in the current origin.
 *
 * Deliberately missing: `javascript:`, `data:`, `vbscript:`, `file:`,
 * `blob:`, `filesystem:`, `intent:`, `tg:`, `slack:`, `chrome:`. These
 * either execute code, bypass same-origin, or launch unexpected apps.
 */
export const DEFAULT_ALLOWED_URL_SCHEMES: readonly string[] = [
  'http:',
  'https:',
  'mailto:',
  'tel:',
];

/**
 * Largest URL we'll accept. A `data:` or base64 payload can balloon
 * to megabytes; even without that, very long URLs strain indexes and
 * are almost always abuse. Generous enough for real URLs with deep
 * query strings.
 */
const MAX_URL_LENGTH = 2048;

export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUrlError';
  }
}

/**
 * The default validator `createTracker` wires in unless you override it.
 * Checks length, rejects empty/whitespace, normalises control characters
 * (to defeat `java\tscript:` scheme-smuggling), then allowlists the
 * scheme.
 */
export function defaultValidateUrl(url: string): void {
  if (typeof url !== 'string') {
    throw new InvalidUrlError('URL must be a string');
  }
  if (url.length === 0) {
    throw new InvalidUrlError('URL must not be empty');
  }
  if (url.length > MAX_URL_LENGTH) {
    throw new InvalidUrlError(
      `URL exceeds max length of ${MAX_URL_LENGTH} characters`,
    );
  }

  // Strip ASCII control chars (tab, NUL, LF, etc.) before sniffing the
  // scheme — browsers drop these when dispatching, so any validator
  // that doesn't normalise them can be bypassed with `java\tscript:`.
  // Matching control characters is the point here: they are exactly what
  // we strip, so the rule does not apply.
  // eslint-disable-next-line no-control-regex
  const normalised = url.replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (normalised === '') {
    throw new InvalidUrlError('URL must contain non-whitespace characters');
  }

  const colonIndex = normalised.indexOf(':');
  const scheme =
    colonIndex > 0 ? normalised.slice(0, colonIndex + 1).toLowerCase() : null;

  if (!scheme) {
    // No scheme at all — reject rather than assume http://. The caller
    // is building a tracked redirect target; the scheme should be
    // explicit so we know what we're redirecting to.
    throw new InvalidUrlError('URL must include a scheme (e.g. https://)');
  }

  if (!DEFAULT_ALLOWED_URL_SCHEMES.includes(scheme)) {
    throw new InvalidUrlError(
      `URL scheme ${scheme} is not allowed; must be one of: ${DEFAULT_ALLOWED_URL_SCHEMES.join(', ')}`,
    );
  }
}

/**
 * Helper for consumers that want to block their own hostnames from
 * being shortened (prevents self-referential loops — `vrev.io/abc`
 * pointing at `vrev.io/def` pointing at …).
 *
 * Compose with `defaultValidateUrl`:
 *
 * ```ts
 * createTracker({
 *   store,
 *   validateUrl: (url) => {
 *     defaultValidateUrl(url);
 *     rejectSelfReferential(url, ['vrev.io', 'slnq.io', 'slinqi.io']);
 *   },
 * });
 * ```
 *
 * Matches the hostname exactly OR as a subdomain suffix — so blocking
 * `vrev.io` also blocks `anything.vrev.io`.
 */
export function rejectSelfReferential(
  url: string,
  blockedHostnames: readonly string[],
): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // defaultValidateUrl has already run, so this should never fire —
    // but be defensive in case a consumer calls this directly.
    return;
  }
  const host = parsed.hostname.toLowerCase();
  for (const blocked of blockedHostnames) {
    const b = blocked.toLowerCase();
    if (host === b || host.endsWith(`.${b}`)) {
      throw new InvalidUrlError(
        `Cannot shorten a URL pointing to ${b} — the shortener cannot reference itself`,
      );
    }
  }
}
