/*
	great-circle-geojson
	Range circles and great-circle routes as GeoJSON that render correctly across the antimeridian and over the poles.

	Version 1.0.0, 10/2026.
	Copyright Sami Puro / 2026. MIT License.
*/

// Mean Earth radius in meters (IUGG).
export const EARTH_RADIUS_METERS = 6371008.8;

// Default latitude limit of the generated points, the practical Web Mercator display limit.
export const DEFAULT_MAX_LATITUDE = 85;

const toRadians = Math.PI / 180;


//   Returns a GeoJSON Polygon of the area within the great-circle distance radiusMeters from center ([longitude, latitude]); an area around one pole closes along that pole, and an area around both poles is the world with the unreachable antipodal cap as a hole.
export function rangeCircle(center, radiusMeters, options = {}) {
	const settings = readOptions(center, radiusMeters, options, 180);

	// Ring points; a ring around a pole ends one turn away from its start.
	const ring = getRingPoints(center, radiusMeters, settings);

	// Coverage of both poles fills a complete world with the boundary as an interior hole.
	if (radiusMeters / settings.earthRadius > (90 + Math.abs(center[1])) * toRadians) {
		let minimumLongitude = ring[0][0];
		let maximumLongitude = ring[0][0];
		for (const point of ring) {
			minimumLongitude = Math.min(minimumLongitude, point[0]);
			maximumLongitude = Math.max(maximumLongitude, point[0]);
		}

		// Place the world seam outside the hole and close the hole exactly with clockwise winding.
		const west = (minimumLongitude + maximumLongitude) / 2 - 180;
		const east = west + 360;
		const maxLatitude = settings.maxLatitude;
		ring[ring.length - 1] = ring[0];

		return {
			type: 'Polygon',
			coordinates: [[[west, -maxLatitude], [east, -maxLatitude], [east, maxLatitude], [west, maxLatitude], [west, -maxLatitude]], ring.reverse()]
		};
	}

	// Coverage without a pole uses the boundary directly as the exterior ring.
	if (!enclosesPole(center, radiusMeters, options)) {
		return {
			type: 'Polygon',
			coordinates: [ring]
		};
	}

	// Close the area along the pole latitude.
	const poleLatitude = (center[1] >= 0 ? settings.maxLatitude : -settings.maxLatitude);

	return {
		type: 'Polygon',
		coordinates: [ring.concat([[ring[ring.length - 1][0], poleLatitude], [ring[0][0], poleLatitude], ring[0]])]
	};
}


//   Returns a GeoJSON LineString of the points at the great-circle distance radiusMeters from center ([longitude, latitude]), without the pole closing edges of rangeCircle.
export function rangeLine(center, radiusMeters, options = {}) {
	const settings = readOptions(center, radiusMeters, options, 180);

	// Only the ring points.
	return {
		type: 'LineString',
		coordinates: getRingPoints(center, radiusMeters, settings)
	};
}


//   Returns true when the great-circle distance radiusMeters from center ([longitude, latitude]) reaches over the nearer pole.
export function enclosesPole(center, radiusMeters, options = {}) {
	const settings = readOptions(center, radiusMeters, options, 180);

	// Angular distance to the pole on the same hemisphere.
	return (radiusMeters / settings.earthRadius > (90 - Math.abs(center[1])) * toRadians);
}


//   Returns a GeoJSON LineString of the great-circle route between start and end ([longitude, latitude]), with continuous longitudes across the antimeridian; steps defaults to about one segment per 150 km, 1-64 segments.
export function greatCircle(start, end, options = {}) {
	assertPosition(start, 'start');
	assertPosition(end, 'end');
	const earthRadius = readEarthRadius(options);

	// Angular distance by the haversine formula.
	const startLatitudeRadians = start[1] * toRadians;
	const startLongitudeRadians = start[0] * toRadians;
	const endLatitudeRadians = end[1] * toRadians;
	const endLongitudeRadians = end[0] * toRadians;
	const haversine = Math.pow(Math.sin((endLatitudeRadians - startLatitudeRadians) / 2), 2) + Math.cos(startLatitudeRadians) * Math.cos(endLatitudeRadians) * Math.pow(Math.sin((endLongitudeRadians - startLongitudeRadians) / 2), 2);
	const distance = 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
	const segmentCount = (options.steps !== undefined && options.steps !== null ? readSteps(options.steps, 1) : Math.max(1, Math.min(64, Math.ceil(distance * earthRadius / 150000))));
	const coordinates = [];

	// Spherical interpolation; a route too short or too long to interpolate is a straight segment.
	for (let step = 0; step <= segmentCount; step++) {
		const fraction = step / segmentCount;
		let point;
		if (Math.sin(distance) < 1e-9) {
			point = [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction];
		} else {
			const startWeight = Math.sin((1 - fraction) * distance) / Math.sin(distance);
			const endWeight = Math.sin(fraction * distance) / Math.sin(distance);
			const vectorX = startWeight * Math.cos(startLatitudeRadians) * Math.cos(startLongitudeRadians) + endWeight * Math.cos(endLatitudeRadians) * Math.cos(endLongitudeRadians);
			const vectorY = startWeight * Math.cos(startLatitudeRadians) * Math.sin(startLongitudeRadians) + endWeight * Math.cos(endLatitudeRadians) * Math.sin(endLongitudeRadians);
			const vectorZ = startWeight * Math.sin(startLatitudeRadians) + endWeight * Math.sin(endLatitudeRadians);
			point = [Math.atan2(vectorY, vectorX) / toRadians, Math.atan2(vectorZ, Math.sqrt(vectorX * vectorX + vectorY * vectorY)) / toRadians];
		}

		// Keep each longitude within half a turn of the previous point.
		const previousLongitude = (coordinates.length > 0 ? coordinates[coordinates.length - 1][0] : start[0]);
		point[0] += Math.round((previousLongitude - point[0]) / 360) * 360;
		coordinates.push(point);
	}

	return {
		type: 'LineString',
		coordinates: coordinates
	};
}


//   Returns the destination points of every bearing step at the great-circle distance radiusMeters from center, with continuous longitudes across the antimeridian and latitudes clamped to maxLatitude.
function getRingPoints(center, radiusMeters, settings) {
	// Angular distance, limited below the antipode.
	const angularDistance = Math.min(radiusMeters / settings.earthRadius, Math.PI * 0.999);
	const centerLatitudeRadians = center[1] * toRadians;
	const centerLongitudeRadians = center[0] * toRadians;
	const ring = [];
	let previousLongitude = null;

	// Destination point for each bearing.
	for (let step = 0; step <= settings.steps; step++) {
		const bearing = (step / settings.steps) * 2 * Math.PI;
		const latitudeRadians = Math.asin(Math.sin(centerLatitudeRadians) * Math.cos(angularDistance) + Math.cos(centerLatitudeRadians) * Math.sin(angularDistance) * Math.cos(bearing));
		let longitudeDegrees = (centerLongitudeRadians + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLatitudeRadians), Math.cos(angularDistance) - Math.sin(centerLatitudeRadians) * Math.sin(latitudeRadians))) / toRadians;
		if (previousLongitude !== null) {
			while (longitudeDegrees - previousLongitude > 180) {
				longitudeDegrees -= 360;
			}
			while (previousLongitude - longitudeDegrees > 180) {
				longitudeDegrees += 360;
			}
		}
		previousLongitude = longitudeDegrees;
		ring.push([longitudeDegrees, Math.max(-settings.maxLatitude, Math.min(settings.maxLatitude, latitudeRadians / toRadians))]);
	}

	return ring;
}


//   Validates the circle input and returns the options with their defaults.
function readOptions(center, radiusMeters, options, defaultSteps) {
	assertPosition(center, 'center');

	// The radius is a finite distance, zero included.
	if (typeof radiusMeters !== 'number' || !Number.isFinite(radiusMeters) || radiusMeters < 0) {
		throw new TypeError('radiusMeters must be a finite number of meters, 0 or more.');
	}

	// The latitude limit stays within the valid latitude range.
	const maxLatitude = (options.maxLatitude !== undefined ? options.maxLatitude : DEFAULT_MAX_LATITUDE);
	if (typeof maxLatitude !== 'number' || !(maxLatitude > 0 && maxLatitude <= 90)) {
		throw new TypeError('maxLatitude must be a number above 0 and at most 90.');
	}

	return {
		steps: (options.steps !== undefined ? readSteps(options.steps, 3) : defaultSteps),
		maxLatitude: maxLatitude,
		earthRadius: readEarthRadius(options)
	};
}


//   Validates and returns a step count of at least minimum.
function readSteps(steps, minimum) {
	// Steps are whole numbers.
	if (!Number.isInteger(steps) || steps < minimum) {
		throw new TypeError('steps must be an integer of ' + minimum + ' or more.');
	}

	return steps;
}


//   Validates and returns the Earth radius option in meters.
function readEarthRadius(options) {
	// Default to the mean Earth radius.
	const earthRadius = (options.earthRadius !== undefined ? options.earthRadius : EARTH_RADIUS_METERS);
	if (typeof earthRadius !== 'number' || !Number.isFinite(earthRadius) || earthRadius <= 0) {
		throw new TypeError('earthRadius must be a positive finite number of meters.');
	}

	return earthRadius;
}


//   Throws when position is not a [longitude, latitude] pair of finite numbers with a valid latitude.
function assertPosition(position, name) {
	// Positions follow the GeoJSON [longitude, latitude] order.
	if (!Array.isArray(position) || position.length < 2 || !Number.isFinite(position[0]) || !Number.isFinite(position[1]) || Math.abs(position[1]) > 90) {
		throw new TypeError(name + ' must be a [longitude, latitude] position with a latitude from -90 to 90.');
	}
}