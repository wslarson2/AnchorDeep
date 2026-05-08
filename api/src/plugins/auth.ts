import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    authenticateInternal: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }

  interface FastifyRequest {
    user?: { sub: string; [key: string]: unknown }
  }
}

const IS_DEV = process.env.NODE_ENV !== 'production'
const AUTH0_CONFIGURED =
  process.env.AUTH0_DOMAIN && !process.env.AUTH0_DOMAIN.startsWith('your-tenant')

async function authPlugin(fastify: FastifyInstance) {
  if (AUTH0_CONFIGURED) {
    await fastify.register(fastifyJwt, {
      secret: {
        public: {
          url: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
        },
      },
      decode: { complete: true },
      verify: {
        audience: process.env.AUTH0_AUDIENCE,
        issuer: `https://${process.env.AUTH0_DOMAIN}/`,
        algorithms: ['RS256'],
      },
    })

    fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify()
      } catch {
        reply.code(401).send({ error: 'Unauthorized' })
      }
    })
  } else {
    // Dev mode: auth disabled — all protected routes pass through
    if (IS_DEV) {
      fastify.log.warn('Auth0 not configured — protected routes are OPEN (dev mode only)')
    }
    fastify.decorate('authenticate', async function (_request: FastifyRequest, _reply: FastifyReply) {
      // noop in dev
    })
  }

  // Internal API key auth for scraper → API calls
  fastify.decorate('authenticateInternal', async function (request: FastifyRequest, reply: FastifyReply) {
    const apiKey = request.headers['x-api-key'] as string | undefined
    if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
      reply.code(401).send({ error: 'Unauthorized' })
      return
    }
  })
}

export default fp(authPlugin)
