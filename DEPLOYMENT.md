# Browser deployments and live data

The business edition builds only the root application. The personal edition is maintained independently in https://github.com/4citeB4U/Leeway-Maps. Neither map requires installing a phone application or a local runtime.

GitHub Pages hosts the static application. Set repository variable `LEEWAY_WORLD_API_URL` to the public HTTPS Vercel service and rerun Pages after changing it. Vercel uses `apps/transit-world` as this repository's Root Directory; the standalone Maps repository uses its root. The committed vercel.json builds Vite and serves the server-only data adapters. Never expose provider secrets as VITE_ variables.

Live source boundaries:
- Aircraft positions: public ADS-B sources, with timestamps and bounded coasting between observations. Carrier names/colors derive from operating callsigns and are not an assertion of aircraft paint or marketing codeshares. Detailed scheduled/estimated/actual airport times require server-side `FLIGHTAWARE_API_KEY`; missing times are shown as unavailable.
- Transit routes and stops: bounded OpenStreetMap network fallback; `TRANSITLAND_API_KEY` adds supported GTFS network/schedule coverage. A mapped route is not a live vehicle position. Vehicle observations remain provider-specific. Greyhound and nationwide coverage are not guaranteed by an OSM route.
- Cameras: implemented source catalog and coverage status report actual provider results. Wisconsin/New York/Georgia/Ontario sources may need their server-side agency keys. Stale catalog retention does not turn an old image into a live frame.
- Weather: public observed radar and National Weather Service alerts. Traffic incidents cover the implemented Illinois source, with expired observations excluded; flow/simulation is separate from incidents.
- AIS needs a persistent collector; the serverless adapter reports unavailable rather than presenting invented vessel positions.

Optional local Agent Lee model and cloned voice adapters are independent of map operation. Their controls do not make local installation a map prerequisite. Public business data authentication and private integrations must be configured separately before using remote shared records.
