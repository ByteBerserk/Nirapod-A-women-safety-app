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

// import.meta.dirname exists in Node 20.11+ but is not populated by every
// ESM runtime (Jest, notably), so derive it the portable way.
const __dirname = __toDir(__toPath(import.meta.url));

const app = express();

/*
 * Behind a proxy (Render, Railway, Fly, nginx) req.ip is the proxy's address
 * unless this is set, which would make every rate limiter see one client.
 * Trusting exactly one hop rather than `true` avoids letting a client spoof
 * its own address with a forged X-Forwarded-For header.
 */
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ------------------------------------------------------------- security --- */

/*
 * Content Security Policy.
 *
 * Helmet's defaults are a good starting point but two of them break this
 * application outright when the API also serves the SPA:
 *
 *   img-src 'self' data:
 *     The safety map draws OpenStreetMap raster tiles (FR-8, FR-18). Without
 *     the tile host every map renders as a blank grey grid.
 *
 *   upgrade-insecure-requests
 *     Rewrites every subresource to https://. Served over plain HTTP - which
 *     is exactly how a local production check or an internal demo runs - the
 *     browser upgrades /assets/*.js, fails to fetch them, and renders a blank
 *     page with nothing in the console. Transport security is already covered
 *     by HSTS, which browsers correctly ignore over plain HTTP, so dropping
 *     this costs nothing and removes a silent failure.
 */
const cspDirectives = {
  ...helmet.contentSecurityPolicy.getDefaultDirectives(),
  'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
  // 'self' does not cover websockets in every browser, hence ws:/wss:.
  'connect-src': ["'self'", 'ws:', 'wss:'],

  /*
   * null, not `delete`. Helmet merges its defaults back in unless a directive
   * is explicitly set to null, so removing the key from this object achieves
   * nothing - the header still carries the directive.
   */
  'upgrade-insecure-requests': null,
};

app.use(
  helmet({
    // The API and the uploads folder are same-origin to each other but the SPA
    // sits on a different port in development, so images must be embeddable.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: env.isProd ? { directives: cspDirectives } : false,
  })
);

/*
 * CORS.
 *
 * The allowlist covers *other* origins. A request from the app's own origin is
 * always allowed, and working that out needs the request, which is why this
 * uses the dynamic form rather than a static `origin` list.
 *
 * Without the same-origin check, serving the SPA from this process is broken:
 * Vite emits its module scripts with a `crossorigin` attribute, so the browser
 * attaches an Origin header even for same-origin subresources. Unless the
 * deployment's exact scheme://host:port happened to be listed in CORS_ORIGINS,
 * every one of those scripts came back 403 and the page rendered blank with
 * nothing in the console.
 */
app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;

    // Behind a proxy the original scheme is in x-forwarded-proto; req.protocol
    // already honours it because `trust proxy` is set above.
    const selfOrigin = `${req.protocol}://${req.get('host')}`;

    const allowed =
      // No Origin header: curl, a server-to-server call, or a native app.
      !origin || origin === selfOrigin || env.corsOrigins.includes(origin);

    if (!allowed) return callback(AppError.forbidden(`Origin ${origin} is not allowed.`));

    return callback(null, {
      origin: true,
      credentials: true, // required for the refresh-token cookie
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    });
  })
);

/* -------------------------------------------------------------- parsing --- */

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(compression());

/*
 * Strips keys beginning with "$" or containing "." from the body, query and
 * params, which is what stops `{"email": {"$gt": ""}}` being used as a login.
 * `replaceWith` rather than deletion so the request still has a shape the
 * validators can complain about.
 */
app.use(mongoSanitize({ replaceWith: '_' }));

/*
 * Repeated query parameters collapse to the last value. The whitelist covers
 * the few places where a repeated parameter is meaningful.
 */
app.use(hpp({ whitelist: ['category', 'severity', 'status', 'tags', 'type'] }));

/* ------------------------------------------------------------- logging ---- */

if (!env.isTest) {
  app.use(
    morgan(env.isProd ? 'combined' : 'dev', {
      stream: { write: (message) => logger.debug(message.trim()) },
      // Health checks would otherwise drown out everything else.
      skip: (req) => req.originalUrl === '/api/health',
    })
  );
}

/* --------------------------------------------------------------- static --- */

/*
 * Uploaded evidence and profile pictures. `index: false` and `dotfiles: deny`
 * so the folder cannot be browsed and hidden files stay hidden. Express'
 * static handler already resolves paths, so "../" cannot escape the root.
 */
app.use(
  '/uploads',
  express.static(env.uploads.dir, {
    index: false,
    dotfiles: 'deny',
    maxAge: env.isProd ? '7d' : 0,
    setHeaders(res) {
      // A malicious upload must never be rendered as a document in the browser.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
    },
  })
);

/* ------------------------------------------------------------------ api --- */

app.use('/api', limiter.general);
app.use('/api', routes);

/*
 * Serve the built client in production, so one process hosts the whole app.
 */
if (env.isProd) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));

  // Any non-API path falls through to the SPA so client-side routes survive a
  // page refresh.
  app.get(/^\/(?!api|uploads).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
// Exported so the policy can be asserted directly: it is only attached to
// responses in production, which a test run is not.
export { cspDirectives };
