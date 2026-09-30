// Personal product capabilities only. Business catalog stays in Logistics.
const domain = (id, label, action, features) => Object.freeze({id, label, action, audience: 'personal', state: 'map-native', features: Object.freeze(features)});
export const PERSONAL_FEATURE_CATALOG = Object.freeze([
 domain('navigation', 'Directions & everyday trips', 'routing', ['Address search', 'Driving directions', 'Walking directions', 'Cycling directions', 'Multiple stops', 'Swap origin and destination', 'Route steps', 'Use my location', 'Saved addresses']),
 domain('personal-trip', 'Personal travel', 'routing', ['Trip preview', 'Passenger flight context', 'Arrival and departure context when published', 'Nearby places', 'Trip sharing']),
 domain('public-transit-rider', 'Buses, trains & commuting', 'transit', ['Public routes and stops', 'Mapped route overlays', 'Vehicle positions when supplied', 'Arrival times when supplied', 'Service alerts when supplied', 'Bike-share stations']),
 domain('traffic-weather', 'Traffic & weather', 'layers', ['Traffic overlays', 'Road incident context', 'Weather radar', 'Weather alerts', 'Public cameras', 'Source freshness']),
 domain('roadside-parking', 'Places & stops', 'roadside', ['Nearby food', 'Rest areas', 'Parking', 'Fuel stations', 'Place search']),
 domain('fuel-cost', 'Personal trip fuel', 'fuel', ['Estimated trip fuel cost', 'Fuel stop comparison when prices supplied']),
 domain('offline-maps', 'Saved trips offline', 'offline', ['Saved route geometry', 'Saved trip steps', 'Offline trip viewer']),
 domain('community-safety', 'Travel reports', 'community', ['Community road reports', 'Report timestamps', 'Shared travel context']),
]);
export function featureCatalogForEdition() { return PERSONAL_FEATURE_CATALOG; }
export function featureCatalogSummary() { return Object.freeze({domainCount:PERSONAL_FEATURE_CATALOG.length, featureCount:PERSONAL_FEATURE_CATALOG.reduce((count,row)=>count+row.features.length,0),actions:Object.freeze([...new Set(PERSONAL_FEATURE_CATALOG.map(row=>row.action))])});
}
