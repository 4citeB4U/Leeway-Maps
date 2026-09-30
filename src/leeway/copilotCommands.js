import { routeBriefing } from './routeBriefing.js';
import { canonicalMapCommand } from './experienceLocale.js';

function words(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministic operational commands. This intentionally handles only actions
 * with an unambiguous local map effect; it does not imitate model reasoning.
 */
function spokenTarget(value) {
  return String(value || '')
    .replace(/\s+(please|thanks?|thank you)\s*[.!?]*$/i, '')
    .trim();
}

function spokenChoice(value) {
  const normalized = words(value);
  const names = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
  if (names[normalized]) return names[normalized];
  const number = Number(normalized);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function classifyCopilotCommand(value) {
  const raw = String(canonicalMapCommand(value) || '').trim();
  const input = words(raw);
  if (!input) return null;
  // Negated and conditional requests belong to conversation.
  // A keyword match must never reverse the user's instruction.
  if (
    /\b(no|not|never|don t|dont|do not|without|instead|if|unless|except)\b/.test(
      input,
    )
  )
    return null;
  if (/\b(review|summari[sz]e|explain)\b.*\b(route|trip)\b/.test(input))
    return { action: 'route-review' };
  if (
    /\b(load|loads|triangle|triangulate|triangulation)\b/.test(input) &&
    /\b(open|plan|show|build|map|compare|dispatch)\b/.test(input)
  )
    return { action: 'load-planning' };
  if (
    /\b(weather|radar|rain|storm|lightning|clouds?)\b/.test(input) &&
    /\b(show|open|turn|check|see|look)\b/.test(input)
  )
    return { action: 'weather' };

  const cameraMatch =
    raw.match(
      /\b(?:show|open|view|find|look at|go to)\s+(?:the\s+)?(?:camera|cctv)\s+(.+?)(?:\s+please)?[.!?]*$/i,
    ) ||
    raw.match(
      /\bput\s+me\s+on\s+(?:the\s+)?([a-z]{1,6}[-_.]?\d[\w.-]*)(?:\s+please)?[.!?]*$/i,
    );
  if (cameraMatch)
    return {
      action: 'camera-select',
      query: spokenTarget(cameraMatch[1]),
    };

  const routeFromTo = raw.match(
    /\bfrom\s+(.+?)\s+to\s+(.+?)(?:\s+please)?[.!?]*$/i,
  );
  if (
    routeFromTo &&
    /\b(route|navigate|drive|take|directions?|go|get)\b/.test(input)
  )
    return {
      action: 'navigate',
      origin: spokenTarget(routeFromTo[1]),
      destination: spokenTarget(routeFromTo[2]),
    };

  const routeCurrent = raw.match(
    /\b(?:take|navigate|drive|route|get|go)\s+(?:me\s+)?(?:to|toward)\s+(.+?)(?:\s+please)?[.!?]*$/i,
  );
  if (routeCurrent)
    return {
      action: 'navigate',
      origin: 'current',
      destination: spokenTarget(routeCurrent[1]),
    };

  const directionsTo = raw.match(
    /\bdirections?\s+(?:me\s+)?to\s+(.+?)(?:\s+please)?[.!?]*$/i,
  );
  if (directionsTo)
    return {
      action: 'navigate',
      origin: 'current',
      destination: spokenTarget(directionsTo[1]),
    };

  const choiceMatch = raw.match(
    /\b(?:choose|select|use)\s+(?:address\s+|option\s+|match\s+)?(first|second|third|fourth|fifth|[1-5])\b/i,
  );
  if (choiceMatch)
    return {
      action: 'choose-address',
      choice: spokenChoice(choiceMatch[1]),
    };

  if (
    /\b(cctv|camera|cameras)\b/.test(input) &&
    /\b(show|open|turn|check|see|look)\b/.test(input)
  )
    return { action: 'cctv' };
  if (
    /\b(my|current) location\b/.test(input) &&
    /\b(use|set|find|locate|start|origin|route)\b/.test(input)
  )
    return { action: 'my-location' };
  if (
    /\b(optimize|best order|reorder)\b/.test(input) &&
    /\b(stop|stops|route|route)\b/.test(input)
  )
    return { action: 'optimize-stops' };
  if (
    /\b(open|show|start|plan|get)\b.*\b(route|directions|direction)\b/.test(
      input,
    )
  )
    return { action: 'directions' };
  return null;
}

export async function executeCopilotCommand(value, shell) {
  const command = classifyCopilotCommand(value);
  if (!command || !shell) return { handled: false };
  const target = {
    'load-planning': [shell, 'openLoadPlanning'],
    weather: [shell, 'openWeather'],
    cctv: [shell, 'openCctv'],
    'camera-select': [shell, 'selectCctv'],
    navigate: [shell.routePlanner, 'routeFromVoice'],
    'choose-address': [shell.routePlanner, 'choosePendingCandidate'],
    'my-location': [shell.routePlanner, 'useMyLocation'],
    'optimize-stops': [shell.routePlanner, 'optimize'],
    directions: [shell.routePlanner, 'open'],
    'route-review': [shell.routePlanner, 'getState'],
  }[command.action];
  if (!target || typeof target[0]?.[target[1]] !== 'function')
    return {
      handled: true,
      ok: false,
      message:
        'This map control is unavailable in the current application. No action was performed.',
    };
  if (command.action === 'route-review')
    return {
      handled: true,
      message: routeBriefing(shell.routePlanner.getState()),
    };
  if (command.action === 'load-planning') {
    shell.openLoadPlanning?.();
    return {
      handled: true,
      message:
        'Dispatch load comparison and the closed-loop trip triangle are open. This prepares a plan only; it does not book freight.',
    };
  }
  if (command.action === 'weather') {
    await shell.openWeather?.();
    return {
      handled: true,
      message:
        'Weather layers are opening. Check their source status before treating a layer as current.',
    };
  }
  if (command.action === 'cctv') {
    await shell.openCctv?.();
    return {
      handled: true,
      message:
        'CCTV coverage is opening. Each camera keeps its own source and freshness status.',
    };
  }
  if (command.action === 'camera-select') {
    const result = await shell.selectCctv?.(command.query);
    return {
      handled: true,
      ok: !!result?.ok,
      message: result?.ok
        ? `Showing ${result.name}. Source: ${result.provider || 'camera provider'}.`
        : `No loaded CCTV camera matched ${command.query}. Open CCTV and try the camera ID or displayed name.`,
    };
  }
  if (command.action === 'navigate') {
    const result = await shell.routePlanner?.routeFromVoice?.({
      origin: command.origin,
      destination: command.destination,
    });
    if (result?.ok)
      return {
        handled: true,
        ok: true,
        message:
          'Road route ready. Review the selected addresses, provider authority, restrictions, and route instructions before driving.',
      };
    if (result?.needsSelection)
      return {
        handled: true,
        ok: false,
        message: `I found ${result.candidates.length} address matches. Say “choose option 1” through “choose option ${Math.min(5, result.candidates.length)},” or select the matching address in Directions.`,
      };
    return {
      handled: true,
      ok: false,
      message:
        result?.reason === 'current-location-unavailable'
          ? 'I could not set your current position as the route origin. Check browser location permission and GPS, then try again.'
          : 'I could not complete that road route. Check the address and the provider message in Directions.',
    };
  }
  if (command.action === 'choose-address') {
    const result = await shell.routePlanner?.choosePendingCandidate?.(
      command.choice,
    );
    return {
      handled: true,
      ok: !!result?.ok,
      message: result?.ok
        ? 'Address selected and the road route is ready for review.'
        : 'That address choice could not be applied. Check the matching-address choices in Directions.',
    };
  }
  if (command.action === 'my-location') {
    shell.routePlanner?.open?.();
    const point = await shell.routePlanner.useMyLocation();
    return point
      ? {
          handled: true,
          message:
            'Your current device location is set as the route origin. Check the address and accuracy shown by the planner before routing.',
        }
      : {
          handled: true,
          ok: false,
          message:
            'The route origin was not set. Check the location permission or GPS message in Directions, then try My Location again.',
        };
  }
  if (command.action === 'optimize-stops') {
    const result = await shell.routePlanner?.optimize?.();
    return {
      handled: true,
      ok: !!result,
      message: result
        ? 'Stop optimization finished. Review the route order, road distance, and restriction status in the route planner.'
        : 'Stop optimization did not complete. Check the address selection, vehicle settings or provider error shown in Directions.',
    };
  }
  if (command.action === 'directions') {
    shell.routePlanner?.open?.();
    return {
      handled: true,
      message:
        'Directions are open. Enter and select real street addresses, then get the road route.',
    };
  }
  return { handled: false };
}
