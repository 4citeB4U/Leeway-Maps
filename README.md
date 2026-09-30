# LeeWay Maps

Independent personal mapping application extracted from LeeWay Logistics. It has its own source, deployment, PWA identity and service worker. No runtime dependency on the Logistics repository. Business CRM, employees, dispatch and equipment stores are excluded.

## Run

Use Node 24.14+ and run `npm ci`, then `npm run dev`. Run `npm run build` for production.

## Public data

Cameras, aircraft and transit require a running World API. For static hosting set `VITE_LEEWAY_WORLD_API_URL` to your public HTTPS runtime. Never use localhost in a public build. Provider credentials belong only on the server. Public availability, licenses, coverage and realtime support vary by provider; missing data is not simulated as live.

## Attribution

Preserves the upstream MIT license and THIRD_PARTY_NOTICES.md, including God's Eye View spatial-engine lineage.
