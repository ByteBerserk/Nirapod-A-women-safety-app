import path from 'path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';

import env from './config/env.js';
import * as logger from './config/logger.js';
import routes from './routes/index.js';
import * as limiter from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import AppError from './utils/AppError.js';

import { fileURLToPath as __toPath } from 'url';
import { dirname as __toDir } from 'path';

const __dirname = __toDir(__toPath(import.meta.url));

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

const cspDirectives = {
  ...helmet.contentSecurityPolicy.getDefaultDirectives(),
  'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],

  'connect-src': ["'self'", 'ws:', 'wss:'],

  'upgrade-insecure-requests': null,
};

app.use(
  helmet({

    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: env.isProd ? { directives: cspDirectives } : false,
  })
);

app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;

    const selfOrigin = `${req.protocol}://${req.get('host')}`;

    const allowed =

      !origin || origin === selfOrigin || env.corsOrigins.includes(origin);

    if (!allowed) return callback(AppError.forbidden(`Origin ${origin} is not allowed.`));

    return callback(null, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    });
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(compression());

app.use(mongoSanitize({ replaceWith: '_' }));

app.use(hpp({ whitelist: ['category', 'severity', 'status', 'tags', 'type'] }));

if (!env.isTest) {
  app.use(
    morgan(env.isProd ? 'combined' : 'dev', {
      stream: { write: (message) => logger.debug(message.trim()) },

      skip: (req) => req.originalUrl === '/api/health',
    })
  );
}

app.use(
  '/uploads',
  express.static(env.uploads.dir, {
    index: false,
    dotfiles: 'deny',
    maxAge: env.isProd ? '7d' : 0,
    setHeaders(res) {

      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
    },
  })
);

app.use('/api', limiter.general);
app.use('/api', routes);

if (env.isProd) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));

  app.get(/^\/(?!api|uploads).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

export { cspDirectives };
