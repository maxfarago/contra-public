import fastify from 'fastify';
import autoload from '@fastify/autoload';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function build (opts = {}) {
  const app = fastify(opts);

  // register the cookie parser plugin
  app.register(cookie, {
    secret: process.env.COOKIE_SECRET,
  });

  // configure cors for credentialed requests
  const uiUrl = process.env.UI_URL || 'http://127.0.0.1:5173';
  app.register(cors, {
    // explicitly set the ui's origin
    origin: uiUrl,
    // allow cookies to be sent
    credentials: true,
  });

  // register plugins
  app.register(autoload, {
    dir: path.join(__dirname, 'plugins'),
    options: Object.assign({}, opts)
  });

  // register routes
  app.register(autoload, {
    dir: path.join(__dirname, 'routes'),
    options: { prefix: '/v1' }
  });

  return app;
}

export { build };
