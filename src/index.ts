import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from '@/config';
import { globalErrorHandler } from '@/middleware/error-handler';
import adminRouter from '@/routes/admin';
import downloadRouter from '@/routes/download';
import packagesRouter from '@/routes/packages';
import tagsRouter from '@/routes/tags';
import type { HonoEnv } from '@/types';

const app = new Hono<HonoEnv>();

// CORS Middleware
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return '*';
      if (
        config.allowedOrigins.includes('*') ||
        config.allowedOrigins.includes(origin)
      ) {
        return origin;
      }
      return config.allowedOrigins[0] || '*';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

// Global Error Handler
app.onError(globalErrorHandler);

// Health Check Endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'unsareport-registry',
    timestamp: new Date().toISOString(),
  });
});

// Mount API v1 Routes
const v1 = new Hono<HonoEnv>();
v1.route('/packages', packagesRouter);
v1.route('/tags', tagsRouter);
v1.route('/admin', adminRouter);
v1.route('/', downloadRouter);

app.route('/v1', v1);

export default {
  port: config.port,
  fetch: app.fetch,
};
