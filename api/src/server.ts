import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import authPlugin from './plugins/auth.js'
import listingsRoutes from './routes/listings.routes.js'
import analyticsRoutes from './routes/analytics.routes.js'
import internalRoutes from './routes/internal.routes.js'
import meRoutes from './routes/me.routes.js'

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
})

await fastify.register(helmet)
await fastify.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://anchordeep.com', 'https://www.anchordeep.com']
    : true,
})

await fastify.register(swagger, {
  openapi: {
    info: { title: 'AnchorDeep API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
  },
})
await fastify.register(swaggerUi, { routePrefix: '/docs' })

await fastify.register(authPlugin)

await fastify.register(
  async (app) => {
    await app.register(listingsRoutes)
    await app.register(analyticsRoutes)
    await app.register(internalRoutes)
    await app.register(meRoutes)
  },
  { prefix: '/api/v1' }
)

fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

const port = parseInt(process.env.PORT ?? '3001', 10)

try {
  await fastify.listen({ port, host: '0.0.0.0' })
  console.log(`AnchorDeep API running on port ${port}`)
  console.log(`Swagger docs: http://localhost:${port}/docs`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
