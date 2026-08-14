import { describe, it, expect } from 'vitest';
import { normalizeUrl, isValidLongUrl } from './url';
import { createLinkSchema } from '../schemas/link.schema';

describe('URL Normalization & Validation Utils (Step 9)', () => {
  describe('normalizeUrl', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeUrl('   https://example.com/path   ')).toBe('https://example.com/path');
    });

    it('downcases hostname while preserving path casing', () => {
      expect(normalizeUrl('https://ExAmPLe.COM/MyPath')).toBe('https://example.com/MyPath');
    });

    it('removes default port 80 for http and 443 for https', () => {
      expect(normalizeUrl('http://example.com:80/path')).toBe('http://example.com/path');
      expect(normalizeUrl('https://example.com:443/secure')).toBe('https://example.com/secure');
      expect(normalizeUrl('http://example.com:8080/custom')).toBe('http://example.com:8080/custom');
    });

    it('strips trailing slash for root domains', () => {
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
    });

    it('optionally strips UTM query parameters when configured', () => {
      const url = 'https://example.com/landing?utm_source=twitter&utm_medium=social&ref=123';
      expect(normalizeUrl(url, { stripUtm: true })).toBe('https://example.com/landing?ref=123');
    });

    it('optionally strips URL fragments when configured', () => {
      const url = 'https://example.com/docs#section-2';
      expect(normalizeUrl(url, { stripFragment: true })).toBe('https://example.com/docs');
    });
  });

  describe('isValidLongUrl', () => {
    it('accepts valid http and https URLs', () => {
      expect(isValidLongUrl('http://example.com')).toBe(true);
      expect(isValidLongUrl('https://example.com/path?foo=bar#hash')).toBe(true);
      expect(isValidLongUrl('https://sub.domain.org:8443/app')).toBe(true);
    });

    it('rejects unsupported protocols', () => {
      expect(isValidLongUrl('ftp://example.com')).toBe(false);
      expect(isValidLongUrl('javascript:alert(1)')).toBe(false);
      expect(isValidLongUrl('file:///etc/passwd')).toBe(false);
      expect(isValidLongUrl('data:text/html,<h1>Hello</h1>')).toBe(false);
    });

    it('rejects embedded credentials for security', () => {
      expect(isValidLongUrl('http://user:pass@example.com')).toBe(false);
      expect(isValidLongUrl('https://admin@evil.com/login')).toBe(false);
    });

    it('rejects URLs longer than 2048 characters', () => {
      const longPath = 'a'.repeat(2050);
      expect(isValidLongUrl(`https://example.com/${longPath}`)).toBe(false);
    });
  });

  describe('createLinkSchema validation integration', () => {
    it('validates a correct payload', () => {
      const parsed = createLinkSchema.safeParse({
        longUrl: 'https://github.com/byt-ctrl/SnipRL',
        customAlias: 'sniprl-repo',
      });
      expect(parsed.success).toBe(true);
    });

    it('fails when longUrl contains credentials', () => {
      const parsed = createLinkSchema.safeParse({
        longUrl: 'https://user:password@secret.com',
      });
      expect(parsed.success).toBe(false);
    });
  });
});
