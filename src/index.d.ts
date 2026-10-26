/** A GeoJSON position: [longitude, latitude] in degrees. */
export type Position = [number, number] | number[];

/** A GeoJSON Polygon geometry. */
export interface Polygon {
	type: 'Polygon';
	coordinates: Position[][];
}

/** A GeoJSON LineString geometry. */
export interface LineString {
	type: 'LineString';
	coordinates: Position[];
}

/** Options of the range circle functions. */
export interface RangeOptions {
	/** Number of ring segments, 3 or more. Default 180. */
	steps?: number;
	/** Latitude limit of the generated points, above 0 and at most 90. Default 85, the practical Web Mercator display limit. */
	maxLatitude?: number;
	/** Sphere radius in meters. Default 6371008.8, the mean Earth radius. */
	earthRadius?: number;
}

/** Options of greatCircle. */
export interface GreatCircleOptions {
	/** Number of segments, 1 or more. Default about one segment per 150 km, 1-64 segments. */
	steps?: number | null;
	/** Sphere radius in meters. Default 6371008.8, the mean Earth radius. */
	earthRadius?: number;
}

/** Mean Earth radius in meters (IUGG). */
export const EARTH_RADIUS_METERS: number;

/** Default latitude limit of the generated points. */
export const DEFAULT_MAX_LATITUDE: number;

/**
 * Returns the area within radiusMeters of center as a Polygon.
 * An area around one pole closes along that pole; an area around both poles is the world with the unreachable antipodal cap as a hole.
 */
export function rangeCircle(center: Position, radiusMeters: number, options?: RangeOptions): Polygon;

/** Returns the boundary points at radiusMeters from center as a LineString, without the pole closing edges of rangeCircle. */
export function rangeLine(center: Position, radiusMeters: number, options?: RangeOptions): LineString;

/** Returns true when radiusMeters from center reaches over the nearer pole. */
export function enclosesPole(center: Position, radiusMeters: number, options?: RangeOptions): boolean;

/** Returns the great-circle route between start and end as one LineString, with continuous longitudes across the antimeridian. */
export function greatCircle(start: Position, end: Position, options?: GreatCircleOptions): LineString;