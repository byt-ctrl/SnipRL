export interface NormalizeUrlOptions {
  stripUtm?: boolean;
  stripFragment?: boolean;
}

const UTM_PARAMS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']);

/**
 * Normalizes a URL string by trimming, downcasing hostnames,
 * removing default ports (80/443), and optionally removing UTM params or fragments.
 */
export function normalizeUrl(rawUrl: string, options: NormalizeUrlOptions = {}): string {
  const trimmed = rawUrl.trim();
  const parsed = new URL(trimmed);

  // 1. Ensure hostname is lowercase
  parsed.hostname = parsed.hostname.toLowerCase();

  // 2. Remove default ports
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }

  // 3. Optional UTM parameter stripping
  if (options.stripUtm) {
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (UTM_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }
  }

  // 4. Optional fragment stripping
  if (options.stripFragment) {
    parsed.hash = '';
  }

  let result = parsed.toString();

  // If path is solely '/' with no query string and no fragment, strip the trailing slash for root domains
  if (parsed.pathname === '/' && !parsed.search && !parsed.hash) {
    result = result.replace(/\/$/, '');
  }

  return result;
}

/**
 * Validates whether a URL is valid, uses http/https, and does NOT contain embedded credentials.
 */
export function isValidLongUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    // Disallow embedded credentials (security requirement)
    if (parsed.username !== '' || parsed.password !== '') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
