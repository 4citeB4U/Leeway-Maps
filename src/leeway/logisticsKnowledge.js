export const LOGISTICS_KNOWLEDGE = Object.freeze({
  trucking: Object.freeze({
    summary:
      'Truck operations connect driver qualification, tractor/trailer assignment, load constraints, appointments, HOS, route restrictions, fuel/service availability, facility approach, maintenance, documents, exceptions, and settlement.',
    operationalQuestions: [
      'Is the driver/equipment assignment valid for this load?',
      'Is the visual route verified for truck constraints?',
      'Will HOS and appointment windows remain feasible?',
      'Are pickup/delivery references and special instructions complete?',
      'What exception or evidence changes the next action?',
    ],
  }),
  dispatch: Object.freeze({
    summary:
      'Dispatch coordinates drivers, equipment, loads, routes, appointments, communications, exceptions, and recovery while preserving a time-stamped activity history.',
    operationalQuestions: [
      'What is moving, waiting, delayed, or unassigned?',
      'Which driver/equipment combination can execute the work?',
      'What requires human approval or customer/broker communication?',
      'What changed since the previous dispatch state?',
    ],
  }),
  load_board: Object.freeze({
    summary:
      'Load-board evaluation should connect rate, loaded miles, deadhead, equipment match, HOS, pickup/delivery windows, route risk, fuel/service availability, customer/broker history, and downstream load opportunities.',
    operationalQuestions: [
      'What is the all-in revenue and expected operating cost?',
      'How much deadhead is required before and after the load?',
      'Does the equipment and driver qualify?',
      'Can the load be chained into a better sequence?',
    ],
  }),
  hos: Object.freeze({
    summary:
      'Hours-of-service values are operational constraints and evidence inputs, not merely dashboard numbers. A displayed remaining-time value does not by itself prove a dispatch is compliant.',
    rules: [
      'Use authoritative ELD/HOS data when available.',
      'Do not infer compliance from stale or training fixtures.',
      'Route, appointment, loading/unloading, break, and delay assumptions affect feasibility.',
    ],
  }),
  driver_qualification: Object.freeze({
    summary:
      'For U.S. interstate CMV operations, driver qualification workflows may require a driver qualification file and associated application, record inquiries/reviews, road-test/equivalent evidence, and medical qualification records depending on operation and applicability.',
    sources: [
      {
        authority: 'FMCSA',
        label: '49 CFR 391 / Driver Qualification File guidance',
        url: 'https://www.fmcsa.dot.gov/safety/passenger-safety/guidelines-and-driver-qualifications-motor-carriers-passengers-parts-390-391',
      },
      {
        authority: 'FMCSA',
        label: 'Driver Qualification Checklist',
        url: 'https://csa.fmcsa.dot.gov/safetyplanner/documents/Forms/Driver%20Qualification%20Checklist_508.pdf',
      },
    ],
    caution:
      'Requirements vary by driver, vehicle, operation, jurisdiction, exemption, and current regulation. LeeWay organizes workflow/evidence; the employer remains responsible for legal/compliance decisions.',
  }),
  employment_onboarding: Object.freeze({
    summary:
      'Employee onboarding should connect accepted-offer status, identity/work-authorization workflow, payroll/tax setup, role assignment, required credentials, policy acknowledgements, training, equipment/system access, and evidence review.',
    sources: [
      {
        authority: 'USCIS',
        label: 'Form I-9 Employment Eligibility Verification',
        url: 'https://www.uscis.gov/i-9',
      },
      {
        authority: 'IRS',
        label: 'Form W-4 Employee Withholding Certificate',
        url: 'https://www.irs.gov/forms-pubs/about-form-w-4',
      },
    ],
    caution:
      'Do not collect or expose sensitive identity, tax, payroll, or banking credentials in a public/static client. Use an authorized production backend and current official forms/instructions.',
  }),
  crm: Object.freeze({
    summary:
      'Logistics CRM connects accounts, contacts, brokers, shippers, consignees, facilities, loads, contracts, activities, tasks, communications, documents, incidents, and spatial locations.',
    principles: [
      'One governed record can appear in table, board, timeline, calendar, inspector, and world views.',
      'A map marker is a view of a business record, not a separate source of truth.',
      'Activity history should preserve who changed what, when, and under which authority.',
    ],
  }),
  fleet_maintenance: Object.freeze({
    summary:
      'Fleet operations connect asset identity, assignment, telemetry, inspections, defects, preventive maintenance, work orders, parts/service events, downtime, roadside events, documents, and service hubs.',
    operationalQuestions: [
      'Is the asset available and authorized for this work?',
      'What inspection/maintenance evidence is current?',
      'What fault or upcoming service could affect the route?',
      'Where is the nearest appropriate service capability?',
    ],
  }),
  municipal_transit: Object.freeze({
    summary:
      'Municipal transit operations connect vehicles, blocks/runs, routes, stops, schedules, operators, service alerts, headways, accessibility, incidents, depots, maintenance, public traffic, and rider-impact context.',
    operationalQuestions: [
      'Which trips or routes are late or disrupted?',
      'Where is bunching, congestion, detour, or missed service occurring?',
      'What vehicles/operators can recover the service?',
      'What public-facing information should change?',
    ],
  }),
  rail: Object.freeze({
    summary:
      'Rail context can include train/consist identity, route/corridor, terminals/yards, schedule/pathing, interchange, dwell, maintenance, crossings, congestion, and freight/passenger connections.',
    caution:
      'Rail movement and infrastructure data must be treated according to provider authority, freshness, and permitted use. Do not infer unrestricted operational access from public map visibility.',
  }),
  marine_intermodal: Object.freeze({
    summary:
      'Marine/intermodal logistics connects vessels, ports, terminals, containers/cargo, drayage, rail, appointments, customs/security boundaries, storage/demurrage context, and inland delivery.',
    operationalQuestions: [
      'What transfer point connects vessel, rail, and truck legs?',
      'What terminal appointment or dwell is constraining the shipment?',
      'Which inland asset should receive the next handoff?',
    ],
  }),
  facilities: Object.freeze({
    summary:
      'Facility intelligence should distinguish business address from truck entrance, gate, dock, yard path, staging/parking, one-way movement, clearance, turning geometry, service restrictions, and operating instructions.',
    caution:
      'A geocoded address does not prove a safe truck entrance or dock approach. Facility-approach guidance requires evidence.',
  }),
  routing: Object.freeze({
    summary:
      'LeeWay separates visual road routing from truck-route authority. Route safety depends on equipment dimensions/weight, HGV/access restrictions, clearances, road class/turn restrictions, terrain/grade, weather, traffic, facility approach, HOS, and appointment constraints.',
    statuses: ['BLOCKED', 'NO_CONFLICT_FOUND', 'UNVERIFIED', 'VERIFIED'],
    caution:
      'NO_CONFLICT_FOUND is not VERIFIED unless authoritative restriction coverage and relevant evidence are proven.',
  }),
  evidence: Object.freeze({
    summary:
      'Every important claim should retain source, timestamp/freshness, tenant/authority, confidence/provenance, state, and receipt. Uploaded != validated; configured != proven; rendered != verified.',
    rules: [
      'Preserve original evidence separately from interpretation.',
      'Do not silently promote training/demo data to production/live status.',
      'Do not expose tenant-private records to public-data providers.',
    ],
  }),
  world_intelligence: Object.freeze({
    summary:
      'Transit World can combine map context with transportation layers such as fleet, transit, rail, vessels, flights when relevant, traffic, CCTV, weather, incidents, fires/disasters, infrastructure, facilities, and public-world context.',
    rules: [
      'Use current map/entity context before explaining what the operator is looking at.',
      'Name feed state when data is stale, fallback, degraded, or unavailable.',
      'Use aircraft/space layers only when operationally relevant to logistics or explicitly requested.',
    ],
  }),
});

export const LOGISTICS_KNOWLEDGE_TOPICS = Object.freeze(
  Object.keys(LOGISTICS_KNOWLEDGE),
);

export function logisticsKnowledge(topic) {
  return LOGISTICS_KNOWLEDGE[topic] || null;
}
