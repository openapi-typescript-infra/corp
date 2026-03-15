import { sql } from 'kysely';

import type { IdentityInternal } from '#src/types/index.ts';

interface GoogleGeocodeAddressComponent {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

interface GoogleGeocodeResult {
  address_components?: GoogleGeocodeAddressComponent[];
  formatted_address?: string;
  geometry?: {
    location?: { lat?: number; lng?: number };
    location_type?: string;
  };
  partial_match?: boolean;
  place_id?: string;
  types?: string[];
}

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results: GoogleGeocodeResult[];
}

interface GeocodeAddressFields {
  line_1: string | null;
  line_2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

interface ScoreOptions {
  allowPostalMismatch?: boolean;
  requireCityMatch?: boolean;
  requireStateMatch?: boolean;
  requireStreetMatch?: boolean;
  requireHighConfidence?: boolean;
}

const CITY_COMPONENT_TYPES = [
  'locality',
  'postal_town',
  'sublocality',
  'sublocality_level_1',
  'administrative_area_level_2',
];

const LOCATION_TYPE_SCORES: Record<string, number> = {
  ROOFTOP: 4,
  RANGE_INTERPOLATED: 3,
  GEOMETRIC_CENTER: 2,
  APPROXIMATE: 1,
};

const HIGH_CONFIDENCE_LOCATION_TYPES = new Set(['ROOFTOP', 'RANGE_INTERPOLATED']);
const PRECISE_RESULT_TYPES = new Set(['street_address', 'premise', 'subpremise']);
const STREET_ABBREVIATIONS: Record<string, string> = {
  north: 'n',
  n: 'n',
  south: 's',
  s: 's',
  east: 'e',
  e: 'e',
  west: 'w',
  w: 'w',
  northeast: 'ne',
  ne: 'ne',
  northwest: 'nw',
  nw: 'nw',
  southeast: 'se',
  se: 'se',
  southwest: 'sw',
  sw: 'sw',
  road: 'rd',
  rd: 'rd',
  street: 'st',
  st: 'st',
  avenue: 'ave',
  ave: 'ave',
  boulevard: 'blvd',
  blvd: 'blvd',
  drive: 'dr',
  dr: 'dr',
  lane: 'ln',
  ln: 'ln',
  court: 'ct',
  ct: 'ct',
  place: 'pl',
  pl: 'pl',
  terrace: 'ter',
  ter: 'ter',
  circle: 'cir',
  cir: 'cir',
  parkway: 'pkwy',
  pkwy: 'pkwy',
  highway: 'hwy',
  hwy: 'hwy',
};

function normalizeText(value?: string) {
  return value
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
    : '';
}

function normalizeStreetText(value?: string) {
  if (!value) {
    return '';
  }
  const tokens = value
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => STREET_ABBREVIATIONS[token] || token);
  return tokens.join('').replace(/[^a-z0-9]/g, '');
}

function normalizeCountry(value?: string) {
  return value ? value.trim().toUpperCase() : '';
}

function normalizePostal(value?: string) {
  return value
    ? value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
    : '';
}

function getComponent(components: GoogleGeocodeAddressComponent[] | undefined, type: string) {
  return components?.find((component) => component.types?.includes(type));
}

function getComponentValues(
  components: GoogleGeocodeAddressComponent[] | undefined,
  types: string[],
) {
  if (!components?.length) {
    return [];
  }
  const values: string[] = [];
  for (const component of components) {
    if (!component.types?.some((componentType) => types.includes(componentType))) {
      continue;
    }
    if (component.long_name) {
      values.push(component.long_name);
    }
    if (component.short_name) {
      values.push(component.short_name);
    }
  }
  return values;
}

function componentMatches(
  components: GoogleGeocodeAddressComponent[] | undefined,
  types: string[],
  target?: string | null,
) {
  if (!target) {
    return false;
  }
  const normalizedTarget = normalizeText(target);
  if (!normalizedTarget) {
    return false;
  }
  return getComponentValues(components, types).some(
    (value) => normalizeText(value) === normalizedTarget,
  );
}

function postalMatches(addressPostal?: string | null, resultPostal?: string) {
  if (!addressPostal || !resultPostal) {
    return false;
  }
  const normalizedAddress = normalizePostal(addressPostal);
  const normalizedResult = normalizePostal(resultPostal);
  if (!normalizedAddress || !normalizedResult) {
    return false;
  }
  if (normalizedAddress === normalizedResult) {
    return true;
  }
  if (normalizedAddress.length === 5 && normalizedResult.startsWith(normalizedAddress)) {
    return true;
  }
  if (normalizedResult.length === 5 && normalizedAddress.startsWith(normalizedResult)) {
    return true;
  }
  return false;
}

function isHighConfidenceResult(result: GoogleGeocodeResult) {
  const locationType = result.geometry?.location_type;
  if (!locationType) {
    return false;
  }
  if (HIGH_CONFIDENCE_LOCATION_TYPES.has(locationType)) {
    return true;
  }
  if (locationType === 'GEOMETRIC_CENTER') {
    return result.types?.some((type) => PRECISE_RESULT_TYPES.has(type)) ?? false;
  }
  return false;
}

function scoreResult(
  result: GoogleGeocodeResult,
  address: GeocodeAddressFields,
  options: ScoreOptions = {},
) {
  const {
    allowPostalMismatch = false,
    requireCityMatch = false,
    requireStateMatch = false,
    requireStreetMatch = false,
    requireHighConfidence = false,
  } = options;
  const components = result.address_components;
  const countryComponent = getComponent(components, 'country');
  const resultCountry = normalizeCountry(
    countryComponent?.short_name || countryComponent?.long_name,
  );
  const addressCountry = normalizeCountry(address.country || undefined);

  if (addressCountry && resultCountry && addressCountry !== resultCountry) {
    return null;
  }

  const postalComponent = getComponent(components, 'postal_code');
  const resultPostal = postalComponent?.long_name || postalComponent?.short_name;
  const postalMatched =
    address.postal_code && resultPostal ? postalMatches(address.postal_code, resultPostal) : false;
  if (address.postal_code && resultPostal && !postalMatched && !allowPostalMismatch) {
    return null;
  }

  const stateComponent = getComponent(components, 'administrative_area_level_1');
  const resultState = stateComponent?.short_name || stateComponent?.long_name;
  const addressState = address.state;
  const stateMatches =
    addressState && resultState
      ? normalizeText(addressState) === normalizeText(resultState)
      : false;
  if (addressCountry === 'US' && addressState && resultState && !stateMatches) {
    return null;
  }
  if (requireStateMatch && addressState && (!resultState || !stateMatches)) {
    return null;
  }

  let score = 0;

  if (addressCountry && resultCountry && addressCountry === resultCountry) {
    score += 5;
  }
  if (address.postal_code && resultPostal) {
    if (postalMatched) {
      score += 4;
    } else if (allowPostalMismatch) {
      score -= 4;
    }
  }
  if (addressState && resultState) {
    score += stateMatches ? 3 : -1;
  }
  const cityMatches = address.city
    ? componentMatches(components, CITY_COMPONENT_TYPES, address.city)
    : false;
  if (requireCityMatch && address.city && !cityMatches) {
    return null;
  }
  if (address.city) {
    score += cityMatches ? 3 : -1;
  }

  let streetNumberMatch = false;
  let routeMatch = false;
  if (address.line_1) {
    const normalizedLine1 = normalizeText(address.line_1);
    const normalizedLine1Street = normalizeStreetText(address.line_1);
    const streetNumber = getComponent(components, 'street_number');
    const normalizedStreetNumber = normalizeText(
      streetNumber?.long_name || streetNumber?.short_name,
    );
    const normalizedRouteValues = getComponentValues(components, ['route'])
      .map((value) => normalizeStreetText(value))
      .filter(Boolean);

    const hasStreetNumber =
      normalizedLine1 && normalizedStreetNumber && normalizedLine1.includes(normalizedStreetNumber);
    const hasRoute =
      normalizedLine1Street &&
      normalizedRouteValues.some((routeValue) => normalizedLine1Street.includes(routeValue));
    streetNumberMatch = Boolean(hasStreetNumber && hasRoute);
    routeMatch = Boolean(hasRoute);

    if (normalizedLine1 && streetNumberMatch) {
      score += 4;
    } else if (normalizedLine1 && routeMatch) {
      score += 2;
    } else if (normalizedLine1) {
      score -= 1;
    }
  }
  if (requireStreetMatch && (!address.line_1 || !streetNumberMatch)) {
    return null;
  }

  if (requireHighConfidence) {
    if (result.partial_match) {
      return null;
    }
    if (!isHighConfidenceResult(result)) {
      return null;
    }
  }

  const locationType = result.geometry?.location_type;
  if (locationType && LOCATION_TYPE_SCORES[locationType]) {
    score += LOCATION_TYPE_SCORES[locationType];
  }

  if (result.partial_match) {
    score -= 2;
  }

  if (result.types?.some((type) => ['street_address', 'premise', 'subpremise'].includes(type))) {
    score += 1;
  }

  return score;
}

function scoreResults(
  results: GoogleGeocodeResult[],
  address: GeocodeAddressFields,
  options: ScoreOptions = {},
) {
  return results
    .map((result) => ({
      result,
      score: scoreResult(result, address, options),
    }))
    .filter(
      (entry): entry is { result: GoogleGeocodeResult; score: number } =>
        entry.score !== null &&
        entry.result.geometry?.location?.lat !== undefined &&
        entry.result.geometry?.location?.lng !== undefined,
    );
}

export async function geocodeAddressById(
  app: IdentityInternal['App'],
  addressMapUuid: string,
  force = false,
) {
  const mapped = await app.locals.db
    .selectFrom('address_map')
    .where('address_map_uuid', '=', addressMapUuid)
    .select('address_id')
    .executeTakeFirstOrThrow();

  const address = await app.locals.db
    .selectFrom('addresses')
    .where('address_id', '=', mapped.address_id)
    .selectAll()
    .executeTakeFirstOrThrow();

  if (!force && address.geolocation) {
    return;
  }

  const addressQuery = [
    address.line_1,
    address.line_2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(', ');

  if (!addressQuery) {
    return;
  }

  const geocodeUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  geocodeUrl.searchParams.set('address', addressQuery);
  geocodeUrl.searchParams.set('key', app.locals.config.googleMapsKey);

  const response = await fetch(geocodeUrl.toString());
  if (!response.ok) {
    throw new Error(
      `Google Geocoding API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const geocodeResponse = (await response.json()) as GoogleGeocodeResponse;
  if (geocodeResponse.status === 'ZERO_RESULTS') {
    return;
  }
  if (geocodeResponse.status !== 'OK') {
    const errorMessage = geocodeResponse.error_message ? ` (${geocodeResponse.error_message})` : '';
    throw new Error(`Google Geocoding API error: ${geocodeResponse.status}${errorMessage}`);
  }

  const geocodeAddress = {
    line_1: address.line_1,
    line_2: address.line_2,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code,
    country: address.country,
  };

  const strictResults = scoreResults(geocodeResponse.results, geocodeAddress);
  let scoredResults = strictResults;
  let usedRelaxedMatching = false;

  if (!scoredResults.length) {
    scoredResults = scoreResults(geocodeResponse.results, geocodeAddress, {
      allowPostalMismatch: true,
      requireCityMatch: false,
      requireStateMatch: true,
      requireStreetMatch: true,
      requireHighConfidence: true,
    });
    usedRelaxedMatching = scoredResults.length > 0;
  }

  if (!scoredResults.length) {
    app.locals.logger.warn({ addressMapUuid }, 'No valid geocoding results found for address');
    return;
  }

  const bestResult = scoredResults.reduce((best, current) =>
    current.score > best.score ? current : best,
  ).result;

  if (usedRelaxedMatching) {
    const resultComponents = bestResult.address_components;
    const resultPostalComponent = getComponent(resultComponents, 'postal_code');
    const resultPostal =
      resultPostalComponent?.long_name || resultPostalComponent?.short_name || null;
    const postalMismatch =
      address.postal_code && resultPostal
        ? !postalMatches(address.postal_code, resultPostal)
        : false;
    const cityMatches = componentMatches(resultComponents, CITY_COMPONENT_TYPES, address.city);
    const resultCities = getComponentValues(resultComponents, CITY_COMPONENT_TYPES);
    const cityMismatch = Boolean(address.city && !cityMatches);
    const issueLabels = [];
    if (postalMismatch) {
      issueLabels.push('postal');
    }
    if (cityMismatch) {
      issueLabels.push('city');
    }
    const issueSuffix = issueLabels.length ? ` with ${issueLabels.join(' and ')} mismatch` : '';
    app.locals.logger.warn(
      {
        addressMapUuid,
        addressPostal: address.postal_code || null,
        resultPostal,
        postalMismatch,
        addressCity: address.city || null,
        resultCities: resultCities.length ? Array.from(new Set(resultCities)) : null,
        cityMismatch,
        formattedAddress: bestResult.formatted_address || null,
        placeId: bestResult.place_id || null,
        locationType: bestResult.geometry?.location_type || null,
      },
      `Geocoding selected with relaxed matching${issueSuffix}`,
    );
  }

  const location = bestResult.geometry?.location;
  if (location?.lat === undefined || location?.lng === undefined) {
    return;
  }

  await app.locals.db
    .updateTable('addresses')
    .set({
      geolocation: sql`ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)::GEOGRAPHY`,
    })
    .where('address_id', '=', mapped.address_id)
    .execute();
}
