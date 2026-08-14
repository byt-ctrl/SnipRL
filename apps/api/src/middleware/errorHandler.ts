import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, ZodIssue } from 'zod';

interface ZodErrorLike {
  name: string;
  issues: ZodIssue[];
}

function isZodErrorLike(error: unknown): error is ZodErrorLike {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Record<string, unknown>;
  return candidate.name === 'ZodError' && Array.isArray(candidate.issues);
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  request.log.error(error);

  // 1. Zod validation error -> HTTP 400 (handle both instanceof and error.name across monorepo boundaries)
  if (error instanceof ZodError || isZodErrorLike(error)) {
    const zodIssues = error.issues || [];
    reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      issues: zodIssues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // 2. Fastify or custom HTTP errors with statusCode
  if (error.statusCode && error.statusCode < 500) {
    reply.status(error.statusCode).send({
      statusCode: error.statusCode,
      error: error.name || 'Bad Request',
      message: error.message,
    });
    return;
  }

  // 3. Unknown server error -> HTTP 500 (Sanitized body for production)
  reply.status(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
}
