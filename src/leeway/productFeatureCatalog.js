/*
REGION: LeeWay Maps / Product Capability Catalog
TAG: LEEWAY.MAPS.FEATURE_CATALOG
5WH:
WHAT = Canonical product-visible capability catalog for business and personal map editions.
WHY = Keeps trucking, municipal-transit, and personal map surfaces complete without leaking business-only tools into the personal edition.
WHO = LeeWay Industries under Creator authority.
WHERE = Browser product shell.
WHEN = Feature Center rendering and acceptance tests.
HOW = Immutable domain records with explicit audience, action, runtime dependency, and feature inventory.
LICENSE = MIT, matching this repository.
*/

const domain = (id, label, audience, action, state, features) =>
  Object.freeze({
    id,
    label,
    audience,
    action,
    state,
    features: Object.freeze(features),
  });

const SHARED = Object.freeze([
  domain('navigation', 'Navigation & route planning', 'shared', 'routing', 'map-native', [
    'Turn-by-turn navigation','Voice-guided directions','Spoken street names','2D map view','3D world view','Satellite map view','Terrain context','Day/night/high-contrast map presentation','Lane and exit guidance surfaces','Missed-turn recovery','Dynamic rerouting','Traffic-aware rerouting','Closure-aware rerouting','Construction-aware rerouting','Weather-aware rerouting','Alternate route comparison','Route preview','Step-by-step itinerary','Saved and favorite routes','Recurring route templates','Route sharing','Route history and replay','Address, landmark and stop search','Multi-stop planning','Stop reordering','Time-window planning','Arrival and departure status','Walking connections for personal transit','Public-transit route planning context'
  ]),
  domain('traffic-weather', 'Traffic, weather & road conditions', 'shared', 'layers', 'map-native', [
    'Live traffic map','Congestion overlays','Traffic incidents','Accident alerts','Road closures','Lane closures','Construction and work zones','Traffic-adjusted ETA','Road-speed context','Weather alerts','Rain','Snow and ice','Fog','Wind','High-wind warnings','Thunderstorms','Tornado and severe weather','Flooding','Wildfire and smoke','Road-condition overlays','Mountain-pass conditions','Chain-control information where available','Public highway cameras','DOT incident feeds','Community road hazard reports','Traffic and weather map layers'
  ]),
  domain('offline-maps', 'Maps, offline & resilience', 'shared', 'offline', 'map-native', [
    'Online navigation','Offline trip cache','Offline route continuity','Offline saved-location access','Map cache management','Regional map packages','State map packages','Nationwide package strategy','Incremental updates','Storage controls','Wi-Fi-only update policy','Automatic resynchronization','Traffic layer','Weather layer','Parking layer','Fuel layer','Weigh-station layer','Truck-stop layer','Rest-area layer','Restriction layer','Low-clearance layer','Roadwork layer','Custom map layers','Custom geofences'
  ]),
  domain('roadside-parking', 'Parking, stops & roadside services', 'shared', 'roadside', 'map-native', [
    'Truck-stop and travel-center search','Rest-area search','Safe parking search','Overnight parking','Paid/free parking','Reserveable parking where provider supports it','On-route parking','Near-destination parking','Parking availability and capacity','Crowdsourced parking reports','Parking demand estimates','Parking alerts','Favorite parking locations','Amenities','Showers','Laundry','Restaurants','Wi-Fi','Driver lounges','DEF','Propane','Truck wash','Tire service','Repair service','Towing service','Security notes','Driver reviews and comments','Parking entrance instructions','Oversize parking','Reefer parking','Bobtail parking','Trailer-drop parking','Scale search','Inspection stations','Ports of entry','Border crossings','Chain-up areas','Brake-check areas','Emergency pull-offs','Mobile repair','Truck parts and dealer search'
  ]),
  domain('fuel-cost', 'Fuel & cost intelligence', 'shared', 'fuel', 'map-native', [
    'Diesel price display','Nearby fuel search','On-route fuel search','Fuel price comparison','Fuel map layer','Brand and network filtering','DEF filtering','Truck-access filtering','Parking/service filtering','Preferred fuel network','Fleet fuel vendor preference','Fuel-card connector slots','Fuel discount/rebate connector slots','Route fuel-spend estimate','Fuel cost per mile','Fuel cost per stop','Fuel-use estimate','Fuel-burn estimate','Route fuel-efficiency comparison','Fuel optimization','Fuel purchase log','Receipt capture workflow','Idle-cost tracking','Excess-idle analysis','Out-of-route fuel anomaly hooks','Fuel range estimate','Load pricing and counteroffer estimate'
  ]),
  domain('community-safety', 'Community, safety & emergency', 'shared', 'community', 'map-native', [
    'Driver-submitted hazards','Road closure reports','Parking reports','Fuel-price reports','Scale-status reports','Truck-stop reviews','Amenity reports','Dock/site notes','Photo evidence workflow','Safety warnings','Report timestamps','Report reliability status','Moderation boundary','Regional alerts','Route sharing','Driver-to-driver intelligence','Speed-limit awareness','Speeding alerts','Steep-grade warnings','Curve warnings','Low-bridge warnings','Restricted-road warnings','Adverse-weather warnings','High-wind warnings','Winter-road warnings','Construction warnings','Breakdown reporting','Accident reporting','Emergency location sharing'
  ]),
  domain('public-transit-rider', 'Public transit & rider information', 'shared', 'transit', 'map-native', [
    'Live transit vehicles','Transit routes','Transit stops','Vehicle positions','Scheduled trips','GTFS route/stop geometry','GTFS-Realtime vehicle positions','GTFS-Realtime trip updates when feed is available','GTFS-Realtime service alerts when feed is available','Real-time arrival context','Transfer context','Stop search','Route search','Accessible stop attributes where published','Service alert display','Detour and stop closure display','Walking connections','Rider-facing route context','Multimodal map context'
  ]),
  domain('cctv', 'Public traffic cameras', 'shared', 'cctv', 'runtime', [
    'Live public traffic-camera catalog','Camera marker layer','Nearest-camera focus','Camera frame viewer','Camera cycling','Camera provider attribution','Per-camera health','Automatic failed-camera recovery','National 56-jurisdiction registry','International implemented networks','Snapshot proxy','HLS support on persistent runtime','Keyed 511 connector support','Credential blocker reporting','Camera source search and filtering'
  ]),
  domain('accessibility', 'Accessibility, language & device experience', 'shared', 'preferences', 'map-native', [
    'Screen-reader-aware controls','High-contrast presentation','Text scaling support','Large touch targets','Touchscreen driver interface','Dark mode','Language preferences','Unit preferences','Miles/kilometers support','Hands-free voice workflow','Bluetooth audio compatibility','Mobile phone layout','Tablet layout','Desktop console layout','Offline-first behavior','Privacy controls','Data-retention controls','Accessible public-transit context'
  ]),
]);

const BUSINESS = Object.freeze([
  domain('truck-routing', 'Truck-safe routing & commercial restrictions', 'business', 'routing', 'map-native', [
    'Truck-specific routing','Practical truck route','Fastest truck route','Shortest truck route','Toll optimized route','Toll avoidance','Fuel-efficient routing','Preferred highways','National Truck Network preference','State truck-route preference','Interstate preference','Avoid unpaved roads','Avoid residential roads','Avoid private roads','Avoid sharp turns','Avoid steep grades','Avoid narrow roads','Low-clearance avoidance','Weight restriction avoidance','Length restriction avoidance','Width restriction avoidance','Height restriction avoidance','Axle restriction avoidance','Truck-prohibited road avoidance','Commercial vehicle restriction avoidance','Hazmat restriction avoidance','Parkway avoidance','Tunnel restriction avoidance','Bridge restriction avoidance','Seasonal road avoidance','Dangerous road avoidance','Custom road/area avoidance','Dispatcher route policies','Route adherence','Route deviation alerts','Out-of-route miles','Route compliance audit'
  ]),
  domain('vehicle-cargo', 'Vehicle, trailer & cargo profiles', 'business', 'routing', 'map-native', [
    'Multiple truck profiles','Straight truck','Tractor trailer','Single/double/triple trailer profiles','Flatbed','Box truck','Reefer','Tanker','Oversize load','Heavy haul','Vehicle height','Width','Length','Combination length','Gross vehicle weight','Gross combination weight','Axle count','Axle configuration','Trailer count','Trailer dimensions','Trailer weight','Cargo type','Load restrictions','Oversize/overweight constraints','Hazmat class','Tunnel cargo restrictions','Bridge weight restrictions','Axle restrictions','Fleet profile management','Driver vehicle assignment','Trailer-specific routing','Automatic assigned profile','Temporary permit profile','Permit route support where provider data exists'
  ]),
  domain('trip-dispatch', 'Trip planning, dispatch & customer stops', 'business', 'workspace', 'map-native', [
    'Pickup/delivery sequencing','Appointment windows','Planned driver breaks','HOS-aware planning surface','Fuel-stop planning','Parking-stop planning','Weigh-station planning','Service stops','Meal and overnight stops','Planned versus actual stops','Stop arrival/departure','Stop completion','Skipped stop alerting','Dispatch stop-order changes','Route edit permissions','Dispatcher route lock','Customer route templates','Last-mile instructions','Gate entry/exit instructions','Security checkpoint notes','Yard navigation','Site speed limits','Dock-door instructions','Truck entry/exit points','Site restriction warnings','Site hours','Appointment detail','Driver notes','Shared fleet notes','Site photos','Site hazards','Dwell estimate','Detention tracking','Load comparison','Closed-loop/triangular load planning'
  ]),
  domain('dispatch-tms', 'Dispatch, TMS, documents & communications', 'business', 'workspace', 'connector-ready', [
    'TMS connector surface','Dispatch-system connector surface','Load-board connector surface','Order import','Pickup/delivery import','Address ingestion','Address standardization','Address validation','Geocoding','Truck entrance geocoding','Dock geocoding','Customer geofence creation','Route creation from load','Dispatch-to-driver route delivery','Driver acknowledgement','Real-time dispatch status','Pickup/delivery confirmation','Arrival/departure notifications','Delay/exception notifications','Appointment changes','Driver-dispatch messaging','Route and stop notes','Customer instructions','Hazard instructions','Temperature-control instructions','Special handling','Proof of delivery workflow','Bill of lading metadata','Document upload','Delivery photo','Signature connector','Exception photo','Customer notification hooks','REST API/webhook integration slots','Role-based access'
  ]),
  domain('eld-compliance', 'ELD, HOS & compliance', 'business', 'cockpit', 'connector-ready', [
    'ELD connector surface','HOS remaining drive time','Remaining duty time','Break alerts','Required break planning','Parking recommendations by hours remaining','HOS route feasibility','Predicted legal stop','HOS-adjusted ETA','Shift planning','Team-driver support','Duty-status awareness','ELD event ingestion','Automatic driving-status hook','Commercial route compliance','Hazmat compliance','Weight compliance','Low-clearance compliance','Oversize/overweight support','Permit tracking','State-specific commercial considerations','IFTA mileage connector','Jurisdiction mileage','DVIR workflow','Pre-trip inspection','Post-trip inspection','Vehicle defects','Driver violation alerts','Compliance exceptions','Dispatch audit trail','Routing decision audit trail'
  ]),
  domain('fleet-telematics', 'Fleet, telematics & asset tracking', 'business', 'workspace', 'connector-ready', [
    'Real-time fleet map','Last known location','GPS breadcrumb trail','Trip history and replay','Vehicle speed','Ignition','Engine state','Idle state','Heading','Stop duration','Arrival/departure events','Dynamic ETA','Fleet filters','Driver filter','Truck filter','Trailer filter','Load filter','Route status filter','Exception filter','Customer filter','Geofence filter','Vehicle status colors','Late arrival alerts','Prolonged stop alerts','Unauthorized stop alerts','Route deviation','Geofence entry/exit','Yard/customer/dock/terminal arrival','Trailer location','Asset tracking','Reefer connector','Cargo temperature connector','Door sensor connector','Engine diagnostics connector','Battery voltage connector','Fault codes','Maintenance alerts','TPMS connector','Dashcam connector','Driver safety event connector'
  ]),
  domain('geofence', 'Geofencing & location operations', 'business', 'workspace', 'connector-ready', [
    'Custom geofences','Terminal geofences','Yard geofences','Customer geofences','Pickup/delivery geofences','Gate and dock geofences','Fuel/parking geofences','Maintenance facility geofences','Restricted areas','Driver-defined geofences','Entry/exit alerts','Dwell-time measurement','Customer/yard/dock/fuel dwell','Unauthorized entry','Out-of-zone alerts','Location workflow triggers','Automatic arrival/departure','Automatic detention timer','Customer notifications','Asset geofence tracking','Maintenance reminders'
  ]),
  domain('analytics', 'Reports, analytics & cost control', 'business', 'workspace', 'connector-ready', [
    'Route mileage','Planned versus actual mileage','Loaded/empty/deadhead/out-of-route/revenue miles','Fuel cost','Fuel cost per mile','Route cost','Toll cost','Driver-pay mileage','ETA accuracy','On-time pickup/delivery','Late delivery','Route delays','Dwell and detention','Customer/dock/terminal/parking dwell','Idle time','Fuel efficiency','MPG','Fuel burn','Fuel purchases','Fuel-network compliance','Route compliance','Driver deviation','Dispatch exceptions','Weather impact','Traffic impact','Safety events','Driver scorecards','Vehicle/asset/trailer utilization','Maintenance cost','Engine fault reporting','Customer performance','Lane profitability','Load profitability','Driver performance','Fleet dashboards','Custom dashboards','Scheduled report hooks','CSV export surface','PDF export surface','API export','Warehouse integration hook','Historical trends','KPI alerts'
  ]),
  domain('municipal-service-planning', 'Municipal transit: service planning & scheduling', 'business', 'transit', 'transit-hub', [
    'Route creation/editing','Route geometry','Bus stop lifecycle','Stop IDs/codes','Stop accessibility','Stop amenities','Route patterns','Inbound/outbound directions','Local/express/limited/circulator/shuttle/seasonal/event routes','Detour routes','Temporary stops','Service calendars','Weekday/weekend/holiday schedules','Timetables','Timepoints','Headway planning','Transfer coordination','Layover/recovery planning','Pull-out/pull-in','Deadhead routing','Vehicle blocks','Operator runs/run cutting','Shift/roster planning','Operator bids','Vehicle assignment','Spare-bus planning','Accessible vehicle assignment','Electric-bus range-aware assignment','Service change scenarios','Stop spacing analysis','Ridership and demand analysis','Route productivity','Title VI/equity analysis','ADA access analysis','Public comment/hearing workflow','Board approval tracking'
  ]),
  domain('municipal-cadavl', 'Municipal transit: CAD/AVL operations', 'business', 'transit', 'transit-hub', [
    'Automatic vehicle location','Real-time fleet map','Vehicle breadcrumbs/replay','Speed/heading/ignition status','Route/trip/block/operator assignment','Dispatch console','Route/vehicle views','Schedule adherence','Early/late/missed/cancelled trip alerts','Headway adherence','Bus bunching detection','Service gap detection','Live ETA prediction','Traffic-aware arrival prediction','Detours and road closures','Temporary route/stop changes','Incident/disruption management','Breakdown workflow','Accident/passenger incidents','Severe-weather operations','Bus swap/spare deployment','Operator/vehicle/route/trip/block reassignment','Short-turn instructions','Hold-for-transfer','Service recovery','Dispatch notes/timelines','Supervisor tracking','Two-way operator messaging','Predefined messages','Acknowledgement requirements','Emergency/panic integration','Radio/cellular/onboard Wi-Fi integration','In-cab tablet support','Remote device configuration','Operations audit trail'
  ]),
  domain('municipal-rider-info', 'Municipal transit: rider information & GTFS', 'business', 'transit', 'transit-hub', [
    'Rider website/app surfaces','Trip planner','Address/landmark/stop/map search','Live bus tracking','Arrival countdowns','Scheduled and predicted departures','Stop/route predictions','Service alerts','Detour alerts','Stop closures/relocations','Cancellation/delay alerts','Holiday/weather alerts','Push/SMS/email/web notification connectors','Route/stop subscriptions','Interactive route maps','Transfer instructions','Walking directions','Accessible trip planning','Fewer-transfer/low-walking preferences','Park-and-ride/bike-and-ride info','Stop amenities','Fare/pass information','Feedback/complaints/commendations/lost-and-found workflows','Multilingual rider content','Screen reader/high contrast','Digital signs/kiosks/QR links','GTFS schedule publishing','GTFS stops/routes/trips/shapes/calendars/fares','GTFS accessibility','GTFS service changes','GTFS-Realtime vehicle positions','GTFS-Realtime trip updates','GTFS-Realtime alerts','Feed validation/versioning','Third-party planner integrations','Open data APIs','Historical feed archive'
  ]),
  domain('municipal-ada-demand', 'Municipal transit: ADA, paratransit & microtransit', 'business', 'transit', 'transit-hub', [
    'Accessible vehicle inventory','Lift/ramp assignment','Wheelchair capacity','Securement positions','Accessible stop inventory','Curb/pathway info','Audio/visual stop announcements','Announcement compliance','Accessible trip planning','Screen-reader support','Text scaling','Multilingual information','ADA complaint tracking','Reasonable modification tracking','Paratransit eligibility','Applications/reviews/renewals/expirations','Accommodation notes','PCA/companion support','Door-to-door/curb-to-curb instructions','Paratransit reservations','Advance/same-day policy support','Phone/web/app/call-center booking surfaces','Pickup windows','Rider reminders','Vehicle-arriving alerts','Rider tracking','Recurring/subscription trips','Return/will-call trips','Medical/dialysis/employment/school/group trips','Capacity/wheelchair management','Dynamic scheduling/dispatch','Closest vehicle','Shared-ride pooling','Driver/dispatcher manifests','Demand-response AVL','No-show/late-cancel tracking','Trip denial/unmet trip reporting','Contractor/broker trips','NEMT connector','Fare/invoicing','Service zones/hours','Microtransit zones','Virtual stops','Dynamic pickup points','First/last-mile feeder service'
  ]),
  domain('municipal-fare-apc', 'Municipal transit: fares, APC & onboard systems', 'business', 'transit', 'transit-hub', [
    'Automatic passenger counters','Boarding/alighting counts','Stop/route/trip/time ridership','Passenger load/crowding','Capacity alerts','APC calibration/health','Manual count reconciliation','Farebox/APC reconciliation','NTD support','Cash fares','Paper tickets/passes','Transfers','Day/week/month/student/senior/disability/reduced fares','Fare zones/distance fares','Fare capping','Electronic fareboxes','Smart cards','Contactless bank cards','Mobile ticketing','QR/barcode validation','Mobile wallets','Account-based ticketing','Stored value/auto reload','Online pass sales','Proof-of-payment/fare inspection','Fare evasion reports','Cash vault/revenue reconciliation','Employer/university programs','Paratransit billing','Subsidy/voucher programs','Onboard GPS','Cellular modem/Wi-Fi router','Operator sign-in','Trip/block selection','Automatic trip start/end','Geofenced stops/timepoints','Operator early/late display','Dispatch messages','Defect/road-call reports','Panic/silent alarm','Destination sign control','Interior next-stop displays','Audio/visual announcements','Wheelchair lift/ramp status','Video/event tagging','Passenger charging management'
  ]),
  domain('municipal-maintenance-safety', 'Municipal transit: fleet, maintenance, safety & reporting', 'business', 'workspace', 'transit-hub', [
    'Fleet inventory','VIN/make/model/capacity/fuel/accessibility history','Diesel/hybrid/BEV/CNG/hydrogen support','Availability dashboard','Out-of-service status','Spare ratio','Preventive maintenance','Mileage/hour/date triggers','Driver defects','Work orders','Parts inventory','Warranty','Road call/towing','Diagnostic codes','Fuel and idle tracking','Tire/brake/oil/cooling/battery monitoring hooks','EV state of charge/range/energy/charger/session tracking','Charging schedules','Fueling/charging station management','Maintenance labor/cost','Asset lifecycle/replacement','Stop/shelter/sign/kiosk/fare/camera/radio asset management','Emergency alarms','Accident/collision/injury/passenger incidents','Security/assault workflow','Emergency detours','Police/fire/EMS coordination','Video search/event tagging','Speed/harsh event connectors','Door/lift status alerts','Geofenced speed zones','Safety investigations','Training/certification tracking','On-time performance','Missed/cancelled/completed trips','Headway/bunching/gaps','Travel/dwell/layover/recovery time','Ridership/load/crowding/transfers','Paratransit productivity/on-time/no-show/denial','Fare revenue','Fleet availability','Fuel/energy/emissions','Maintenance reliability','Safety/security incidents','Customer satisfaction','Cost per revenue hour/mile','Subsidy per trip','Title VI/ADA/equity','NTD/FTA reporting','Board/public dashboards','Scheduled reports'
  ]),
  domain('platform-enterprise', 'Platform, integrations & governance', 'business', 'workspace', 'connector-ready', [
    'Android','iPhone/iPad','In-cab tablet','Rugged device','Web dispatch console','Desktop fleet console','Bluetooth audio','Voice commands','Remote device configuration','Remote app updates','MDM connector','Device health','Multi-device driver access','Driver login/logout','Fleet device assignment','Privacy controls','Data retention','Role-based permissions','Audit logs','SSO connector','API/developer platform','Tenant administration','Feature entitlements','Branding','Support access','Exports/deletion','Service status','Feature flags','Agent Lee assistance','Realtime operations events','Governed receipts and audit boundaries'
  ]),
]);

const PERSONAL = Object.freeze([
  domain('personal-trip', 'Personal trips & everyday travel', 'personal', 'routing', 'map-native', [
    'Address-to-address directions','Multi-stop personal trips','Favorite locations','Saved trips','Trip sharing','Traffic-aware ETA','Road closure awareness','Weather-aware trip context','Roadside stop search','Fuel search','Parking search','Public transit context','Flights map context','Walking-to-transit context','Offline trip continuity','Hazard reporting','Camera viewing','Language/unit preferences'
  ]),
  domain('personal-transit', 'Personal public transit', 'personal', 'transit', 'map-native', [
    'Live transit vehicles','Routes','Stops','Arrival context when published','Service alert context','Vehicle positions','GTFS/GTFS-Realtime feed support','Accessible stop attributes when published','Transfer context','Walking connection context','Bike-share layer','Multimodal map layers'
  ]),
]);

export const BUSINESS_FEATURE_CATALOG = Object.freeze([...SHARED, ...BUSINESS]);
export const PERSONAL_FEATURE_CATALOG = Object.freeze([...SHARED, ...PERSONAL]);

export function featureCatalogForEdition(edition = 'business') {
  return edition === 'personal'
    ? PERSONAL_FEATURE_CATALOG
    : BUSINESS_FEATURE_CATALOG;
}

export function featureCatalogSummary(edition = 'business') {
  const rows = featureCatalogForEdition(edition);
  return Object.freeze({
    domainCount: rows.length,
    featureCount: rows.reduce((sum, row) => sum + row.features.length, 0),
    actions: Object.freeze([...new Set(rows.map((row) => row.action))]),
  });
}
