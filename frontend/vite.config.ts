import { resolve } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';

/**
 * Routing for the two entries (dev + preview), same as deploy/nginx.conf:
 *   /                    → employee test (index.html, Vite's own SPA fallback)
 *   /admin/repondants    → /admin/index.html (HR console)
 *   /test/…, /console/…  → 301 to / and /admin/… (old links, QR codes)
 */
function spaFallback(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? '';
    const legacy = url.match(/^\/(test|console)(\/[^?]*)?(\?.*)?$/);
    if (legacy) {
      const query = legacy[3] ?? '';
      res.writeHead(301, { Location: legacy[1] === 'test' ? `/${query}` : `/admin${legacy[2] ?? '/'}${query}` });
      res.end();
      return;
    }
    const m = url.match(/^\/admin(\/[^?]*)?(\?.*)?$/);
    if (m && !/\.[a-z0-9]+$/i.test(m[1] ?? '') && !(m[1] ?? '').startsWith('/@')) {
      req.url = `/admin/index.html${m[2] ?? ''}`;
    }
    next();
  };
  return {
    name: 'tac-spa-fallback',
    configureServer: (s) => void s.middlewares.use(rewrite),
    configurePreviewServer: (s) => void s.middlewares.use(rewrite),
  };
}

// Two separately deployable apps from one codebase:
//   vite build                    → dist/index.html (test, at /) + dist/admin/ (HR console, at /admin/)
//   vite build --mode test-only   → test only     (shared with employees)
//   vite build --mode console-only→ console only  (HR intranet)
// Extra host names the dev / preview server answers to (tunnels such as ngrok); comma-separated
// VITE_ALLOWED_HOSTS adds more without editing this file.
const allowedHosts = [
  'vicinity-copartner-during.ngrok-free.dev',
  ...(process.env.VITE_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean),
];

export default defineConfig(({ mode }) => {
  const inputs: Record<string, string> = {};
  if (mode !== 'console-only') inputs.test = resolve(__dirname, 'index.html');
  if (mode !== 'test-only') inputs.console = resolve(__dirname, 'admin/index.html');
  return {
    plugins: [react(), spaFallback()],
    resolve: {
      // Required by @vionhub/design-system: every peer must be a single instance.
      // Do NOT add @mui/system here (see design-system host-setup.md § 2).
      dedupe: [
        'react', 'react-dom',
        '@mui/material', '@mui/lab',
        '@emotion/react', '@emotion/styled', '@emotion/cache',
        'react-router-dom', 'framer-motion',
        'react-hook-form', '@hookform/resolvers', 'zod',
        'dayjs', '@mui/x-date-pickers',
        'sonner', '@iconify/react', 'simplebar-react',
      ],
      alias: [
        { find: '@shared', replacement: resolve(__dirname, '../shared') },
        { find: /^react-apexcharts$/, replacement: resolve(__dirname, 'src/shared/react-apexcharts-shim.ts') },
      ],
    },
    server: {
      port: 5173,
      allowedHosts,
      fs: { allow: [resolve(__dirname, '..')] },
      proxy: { '/api': { target: process.env.VITE_API_TARGET ?? 'http://localhost:8000', changeOrigin: true } },
    },
    preview: { allowedHosts },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 2500,
      rollupOptions: { input: inputs },
    },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
