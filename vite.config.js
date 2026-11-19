import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'DEVNET_');
  const target = env.DEVNET_API_TARGET || 'https://eap02-back.onrender.com';
  const proxy = {
    target,
    changeOrigin: true,
    secure: true,
    proxyTimeout: 120_000,
    configure(server) {
      // Solo en el servidor local: Render marca el refresco como Secure.
      // El navegador de localhost usa HTTP; retirar Secure permite probar la
      // sesión sin tocar la configuración de producción del backend.
      server.on('proxyRes', response => {
        const cookies = response.headers['set-cookie'];
        if (cookies && target.startsWith('https://')) {
          response.headers['set-cookie'] = cookies.map(cookie =>
            cookie.replace(/;\s*Secure(?=;|$)/i, '').replace(/;\s*Domain=[^;]*/i, ''));
        }
      });
    }
  };

  return {
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': proxy } },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy: { '/api': proxy } }
  };
});
