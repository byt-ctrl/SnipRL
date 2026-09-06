import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getLinkCacheHitRate, getLinkCacheStats } from '../cache/linkCache.js';

/** JSON shape returned by `GET /metrics` (default content type). */
export interface CacheMetricsResponse {
  redirect_cache_hits: number;
  redirect_cache_misses: number;
  redirect_cache_hit_rate: number;
  uptime_seconds: number;
  timestamp: string;
}

/** Prometheus content type per exposition format 0.0.4. */
const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4';

/**
 * Build a dependency-free Prometheus 0.0.4 exposition body.
 * HELP/TYPE lines precede samples; output ends with a trailing newline.
 */
function buildPrometheusBody(
  hits: number,
  misses: number,
  hitRate: number,
  uptimeSeconds: number,
): string {
  const lines: string[] = [
    '# HELP redirect_cache_hits Total number of redirect cache hits.',
    '# TYPE redirect_cache_hits counter',
    `redirect_cache_hits ${hits}`,
    '# HELP redirect_cache_misses Total number of redirect cache misses.',
    '# TYPE redirect_cache_misses counter',
    `redirect_cache_misses ${misses}`,
    '# HELP redirect_cache_hit_rate Ratio of redirect cache hits to total lookups.',
    '# TYPE redirect_cache_hit_rate gauge',
    `redirect_cache_hit_rate ${hitRate}`,
    '# HELP process_uptime_seconds Process uptime in seconds.',
    '# TYPE process_uptime_seconds gauge',
    `process_uptime_seconds ${uptimeSeconds}`,
  ];
  return `${lines.join('\n')}\n`;
}

function wantsPrometheusText(request: FastifyRequest): boolean {
  const accept: unknown = request.headers.accept;
  return typeof accept === 'string' && accept.includes('text/plain');
}

export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { hits, misses } = getLinkCacheStats();
      const hitRate: number = getLinkCacheHitRate();
      const uptimeSeconds: number = Math.floor(process.uptime());
      const timestamp: string = new Date().toISOString();

      reply.header('Cache-Control', 'no-store');

      if (wantsPrometheusText(request)) {
        const body: string = buildPrometheusBody(hits, misses, hitRate, uptimeSeconds);
        return reply.type(PROMETHEUS_CONTENT_TYPE).status(200).send(body);
      }

      const payload: CacheMetricsResponse = {
        redirect_cache_hits: hits,
        redirect_cache_misses: misses,
        redirect_cache_hit_rate: hitRate,
        uptime_seconds: uptimeSeconds,
        timestamp,
      };
      return reply.status(200).send(payload);
    } catch (err) {
      // Degradation: metrics never throws. Return zeroed counters with 200
      // so scrapers stay healthy; never leak internals (sanitized body).
      fastify.log.error({ err }, 'Metrics collection failed');
      reply.header('Cache-Control', 'no-store');

      if (wantsPrometheusText(request)) {
        const fallback: string = buildPrometheusBody(0, 0, 0, 0);
        return reply.type(PROMETHEUS_CONTENT_TYPE).status(200).send(fallback);
      }

      const fallback: CacheMetricsResponse = {
        redirect_cache_hits: 0,
        redirect_cache_misses: 0,
        redirect_cache_hit_rate: 0,
        uptime_seconds: 0,
        timestamp: new Date().toISOString(),
      };
      return reply.status(200).send(fallback);
    }
  });
}
