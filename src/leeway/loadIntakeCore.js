const MAX_CANDIDATES = 3;

function clean(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function match(text, expressions) {
  for (const expression of expressions) {
    const found = text.match(expression);
    if (found?.[1]) return clean(found[1]);
  }
  return '';
}

function addressBlock(text, labels, stops) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!labels.some((label) => label.test(line))) continue;
    const inline = line.replace(
      /^\s*(?:pickup|pick\s*up|origin|delivery|drop\s*off|destination)\s*(?:address|location)?\s*[:#-]?\s*/i,
      '',
    );
    const values = [inline];
    for (
      let cursor = index + 1;
      cursor < Math.min(lines.length, index + 5);
      cursor += 1
    ) {
      if (stops.some((stop) => stop.test(lines[cursor]))) break;
      if (!clean(lines[cursor])) break;
      values.push(lines[cursor]);
    }
    const result = clean(values.join(', ')).replace(/^,\s*/, '');
    if (result) return result;
  }
  return '';
}

/** Extract a reviewable draft from a broker document. Every field remains editable. */
export function parseLoadIntake(text) {
  const sourceText = String(text || '').replace(/\r/g, '');
  const pickupLabels = [/^\s*(?:pickup|pick\s*up|origin)\b/i];
  const deliveryLabels = [/^\s*(?:delivery|drop\s*off|destination)\b/i];
  const allStops = [
    ...pickupLabels,
    ...deliveryLabels,
    /^\s*(?:rate|broker|reference|load\s*(?:id|number)?|equipment|commodity|weight)\b/i,
  ];
  const pickup =
    addressBlock(sourceText, pickupLabels, allStops) ||
    match(sourceText, [
      /(?:pickup|pick\s*up|origin)\s*(?:address|location)?\s*[:#-]\s*([^\n]+)/i,
    ]);
  const delivery =
    addressBlock(sourceText, deliveryLabels, allStops) ||
    match(sourceText, [
      /(?:delivery|drop\s*off|destination)\s*(?:address|location)?\s*[:#-]\s*([^\n]+)/i,
    ]);
  const rateText = match(sourceText, [
    /(?:rate|pay|offer(?:ed)?)\s*[:#-]?\s*\$?([\d,]+(?:\.\d{1,2})?)/i,
  ]);
  const rate = Number(rateText.replace(/,/g, ''));
  return {
    broker: match(sourceText, [
      /(?:broker|carrier contact)\s*[:#-]\s*([^\n]+)/i,
    ]),
    reference: match(sourceText, [
      /(?:load\s*(?:id|number)|reference|ref)\s*[:#-]\s*([^\n]+)/i,
    ]),
    equipment: match(sourceText, [/(?:equipment|trailer)\s*[:#-]\s*([^\n]+)/i]),
    commodity: match(sourceText, [/(?:commodity|freight)\s*[:#-]\s*([^\n]+)/i]),
    pickup,
    delivery,
    rate: Number.isFinite(rate) && rate > 0 ? rate : null,
    sourceText,
    extraction: {
      pickup: pickup ? 'EXTRACTED_REQUIRES_ADDRESS_CONFIRMATION' : 'MISSING',
      delivery: delivery
        ? 'EXTRACTED_REQUIRES_ADDRESS_CONFIRMATION'
        : 'MISSING',
      rate: Number.isFinite(rate) && rate > 0 ? 'EXTRACTED' : 'MISSING',
    },
  };
}

export function validateLoadCandidate(value) {
  const candidate = {
    id: clean(value?.id),
    broker: clean(value?.broker) || 'Broker not named',
    reference: clean(value?.reference),
    equipment: clean(value?.equipment),
    commodity: clean(value?.commodity),
    pickup: clean(value?.pickup),
    delivery: clean(value?.delivery),
    rate: Number(value?.rate) || null,
    sourceText: String(value?.sourceText || ''),
  };
  if (!candidate.id) throw new Error('Load candidate needs an internal ID.');
  if (!candidate.pickup)
    throw new Error('Confirm the pickup street address first.');
  if (!candidate.delivery)
    throw new Error('Confirm the delivery street address first.');
  if (candidate.pickup.toLowerCase() === candidate.delivery.toLowerCase())
    throw new Error('Pickup and delivery need different addresses.');
  return candidate;
}

export function addLoadCandidate(rows, candidate) {
  const next = [...(Array.isArray(rows) ? rows : [])];
  if (next.length >= MAX_CANDIDATES)
    throw new Error(
      'Compare up to three offers at one time. Remove an offer first.',
    );
  const checked = validateLoadCandidate(candidate);
  if (next.some((row) => row.id === checked.id))
    throw new Error('That load candidate is already in the comparison.');
  next.push(checked);
  return next;
}

export function choiceEvent({
  candidate,
  choice,
  reason = '',
  actor = 'Driver',
}) {
  const allowed = new Set(['PREFER', 'ASK_DISPATCH', 'CANNOT_TAKE']);
  if (!allowed.has(choice)) throw new Error('Unsupported driver choice.');
  const checked = validateLoadCandidate(candidate);
  return {
    type: 'LOAD_CANDIDATE_CHOICE',
    candidateId: checked.id,
    choice,
    reason: clean(reason),
    actor: clean(actor) || 'Driver',
    createdAt: new Date().toISOString(),
    externalWrite: false,
  };
}

export { MAX_CANDIDATES };
