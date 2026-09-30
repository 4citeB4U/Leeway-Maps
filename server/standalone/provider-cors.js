const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'https://4citeb4u.github.io',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

export function providerCorsPlugin({
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
} = {}) {
  const allowed = new Set(allowedOrigins);

  const install = (server) => {
    server.middlewares.use((req, res, next) => {
      const origin = String(req.headers.origin || '');
      if (allowed.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        );
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type,Authorization,Range',
        );
        res.setHeader(
          'Access-Control-Expose-Headers',
          'Content-Range,Accept-Ranges,X-CCTV-Source,X-Overpass-Cache,X-Overpass-Upstream',
        );
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }

      if (req.method === 'OPTIONS' && allowed.has(origin)) {
        res.statusCode = 204;
        res.end();
        return;
      }

      next();
    });
  };

  return {
    name: 'leeway-provider-cors',
    enforce: 'pre',
    configureServer: install,
    configurePreviewServer: install,
  };
}
