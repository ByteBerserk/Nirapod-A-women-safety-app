import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /*
     * Listen on the network, not just the loopback address.
     *
     * The SOS alert email carries a live tracking link, and an emergency
     * contact opens it on their own phone. Bound only to localhost that link
     * resolves to the phone itself and shows a connection error, which is the
     * single worst way for this application to fail. Serving on the LAN means
     * the address in the email is one the recipient can actually reach.
     */
    host: true,
    /*
     * Hostnames the dev server will answer to.
     *
     * Vite rejects a request whose Host header it does not recognise, which
     * protects a dev server from DNS-rebinding attacks. A Cloudflare tunnel
     * arrives under a random *.trycloudflare.com name, so without this entry
     * an emergency contact opening the link from outside the network gets
     * "Blocked request. This host is not allowed" instead of the map.
     *
     * Scoped to the tunnel domain rather than set to `true`, so the rebinding
     * protection still applies to every other host.
     */
    allowedHosts: ['.trycloudflare.com'],
    /*
     * Proxying keeps the browser on one origin during development, which means
     * the refresh-token cookie behaves the same locally as it does in
     * production and we never hit a CORS surprise late in the day.
     *
     * 127.0.0.1 rather than localhost, deliberately. On a dual-stack machine
     * "localhost" resolves to ::1 first, the API listens on IPv4, and the proxy
     * then fails with ECONNREFUSED for some requests and not others - which
     * looks like a flaky server rather than a name resolving to the wrong
     * address. Naming the address leaves nothing to resolve.
     */
    proxy: {
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:5000', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:5000', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        /*
         * Leaflet is large and changes rarely; splitting it means a code change
         * does not force everyone to re-download the map library.
         *
         * Written as a function rather than the object form because Vite 8
         * builds with rolldown, which only accepts a function here. Leaflet is
         * matched first: "react-leaflet" would otherwise be caught by the
         * react rule and end up in the wrong chunk.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](leaflet|react-leaflet)[\\/]/.test(id)) return 'leaflet';
          if (
            /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(
              id
            )
          ) {
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
});
