import { app, request } from './helpers.js';
import helmet from 'helmet';
import { cspDirectives } from '../src/app.js';

describe('CORS', () => {
  it('allows a request with no Origin header at all', async () => {

    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
  });

  it('allows an origin on the allowlist', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeDefined();
  });

  it('refuses an origin that is not on the allowlist', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');

    expect(response.status).toBe(403);
  });

  it('always allows the deployment’s own origin, even when it is not listed', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Host', 'nirapod.example.com')
      .set('Origin', 'http://nirapod.example.com');

    expect(response.status).toBe(200);
  });

  it('does not treat a different port on the same host as same-origin', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Host', 'nirapod.example.com')
      .set('Origin', 'http://nirapod.example.com:8080');

    expect(response.status).toBe(403);
  });

  it('does not treat a lookalike host as same-origin', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Host', 'nirapod.example.com')
      .set('Origin', 'http://nirapod.example.com.evil.net');

    expect(response.status).toBe(403);
  });
});

describe('Security headers', () => {
  it('does not advertise the framework', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('sets nosniff', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('Content Security Policy', () => {

  it('permits OpenStreetMap tiles so the safety map can draw', () => {
    const defaults = helmet.contentSecurityPolicy.getDefaultDirectives();

    expect(defaults['img-src']).not.toContain('https://*.tile.openstreetmap.org');

    expect(cspDirectives['img-src']).toContain('https://*.tile.openstreetmap.org');
  });

  it('does not upgrade insecure requests, which would blank the page over HTTP', () => {
    expect(cspDirectives['upgrade-insecure-requests']).toBeNull();
  });

  it('allows websocket connections for the realtime gateway', () => {
    expect(cspDirectives['connect-src']).toEqual(expect.arrayContaining(['wss:']));
  });
});
