import '@fastify/jwt';
import 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: number;
      login: string;
    };
    user: {
      userId: number;
      login: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    requestStartHrTime?: bigint;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
}
