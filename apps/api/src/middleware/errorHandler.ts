import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export function setErrorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  request.log.error(error);

  if (error instanceof ZodError) {
    reply.status(400).send({
      error: 'Bad Request',
      message: 'Validation failed',
      issues: error.issues,
    });
    return;
  }

  if (error.statusCode) {
    reply.status(error.statusCode).send({
      error: error.name || 'Error',
      message: error.message,
    });
    return;
  }

  reply.status(500).send({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
}
