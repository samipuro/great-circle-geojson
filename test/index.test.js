import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeCircle, rangeLine, enclosesPole, greatCircle, EARTH_RADIUS_METERS, DEFAULT_MAX_LATITUDE } from '../src/index.js';

//   Returns the great-circle distance in meters between two [longitude, latitude] positions.
function distanceMeters(a, b) {
	const toRadians = Math.PI / 180;
	const haversine = Math.sin((b[1] - a[1]) * toRadians / 2) ** 2 + Math.cos(a[1] * toRadians) * Math.cos(b[1] * toRadians) * Math.sin((b[0] - a[0]) * toRadians / 2) ** 2;

	return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

//   Returns the largest longitude change between consecutive positions.
function maxLongitudeJump(positions) {
	let jump = 0;
	for (let i = 1; i < positions.length; i++) {
		jump = Math.max(jump, Math.abs(positions[i][0] - positions[i - 1][0]));
	}

	return jump;
}

test('a plain circle is a closed ring at the radius from its center', () => {
	const center = [24.96, 60.32];
	const polygon = rangeCircle(center, 500e3);
	const ring = polygon.coordinates[0];

	assert.equal(polygon.type, 'Polygon');
	assert.equal(polygon.coordinates.length, 1);
	assert.equal(ring.length, 181);
	assert.ok(Math.abs(ring[0][0] - ring[180][0]) < 1e-9 && Math.abs(ring[0][1] - ring[180][1]) < 1e-9);
	for (const point of ring) {
		assert.ok(Math.abs(distanceMeters(center, point) - 500e3) < 1, `point ${point} is not at the radius`);
	}
});

test('a circle across the antimeridian keeps continuous longitudes', () => {
	const ring = rangeCircle([179, 0], 500e3).coordinates[0];

	assert.ok(maxLongitudeJump(ring) < 1);
	assert.ok(Math.max(...ring.map(point => point[0])) > 180);
});

test('a circle over one pole closes along the latitude limit', () => {
	const center = [0, 85];
	const ring = rangeCircle(center, 1000e3).coordinates[0];

	assert.equal(enclosesPole(center, 1000e3), true);
	assert.deepEqual(ring[ring.length - 1], ring[0]);
	assert.equal(ring[ring.length - 2][1], DEFAULT_MAX_LATITUDE);
	assert.equal(ring[ring.length - 3][1], DEFAULT_MAX_LATITUDE);
	assert.ok(Math.abs(Math.abs(ring[ring.length - 4][0] - ring[0][0]) - 360) < 1e-9, 'the ring makes one full turn around the pole');
	assert.ok(maxLongitudeJump(ring.slice(0, -3)) < 30, 'no jump across the map between ring points');
});

test('a circle over the south pole closes along the southern limit', () => {
	const ring = rangeCircle([45, -80], 2000e3).coordinates[0];

	assert.equal(ring[ring.length - 2][1], -DEFAULT_MAX_LATITUDE);
});

test('a circle over both poles is the world with the antipodal cap as a hole', () => {
	const polygon = rangeCircle([25, 60], 19000e3);
	const [outer, hole] = polygon.coordinates;

	assert.equal(polygon.coordinates.length, 2);
	assert.equal(outer.length, 5);
	assert.equal(outer[1][0] - outer[0][0], 360);
	assert.equal(outer[0][1], -DEFAULT_MAX_LATITUDE);
	assert.equal(outer[2][1], DEFAULT_MAX_LATITUDE);
	assert.deepEqual(hole[0], hole[hole.length - 1]);
});

test('maxLatitude moves the latitude limit', () => {
	const ring = rangeCircle([0, 85], 1000e3, { maxLatitude: 90 }).coordinates[0];

	assert.equal(ring[ring.length - 2][1], 90);
	assert.ok(Math.max(...ring.map(point => point[1])) <= 90);
});

test('steps sets the number of ring segments', () => {
	assert.equal(rangeCircle([0, 0], 100e3, { steps: 16 }).coordinates[0].length, 17);
	assert.equal(rangeLine([0, 0], 100e3, { steps: 16 }).coordinates.length, 17);
});

test('rangeLine has the ring points without the pole closing edges', () => {
	const line = rangeLine([0, 85], 1000e3);

	assert.equal(line.type, 'LineString');
	assert.equal(line.coordinates.length, 181);
	assert.deepEqual(line.coordinates, rangeCircle([0, 85], 1000e3).coordinates[0].slice(0, 181));
});

test('enclosesPole compares the radius with the distance to the nearer pole', () => {
	assert.equal(enclosesPole([0, 80], 1000e3), false);
	assert.equal(enclosesPole([0, 80], 1200e3), true);
	assert.equal(enclosesPole([0, -80], 1200e3), true);
	assert.equal(enclosesPole([0, 0], 10000e3), false);
});

test('a great circle across the antimeridian is one continuous line', () => {
	const start = [139.78, 35.55];
	const end = [-122.38, 37.62];
	const line = greatCircle(start, end);
	const coordinates = line.coordinates;
	const last = coordinates[coordinates.length - 1];

	assert.equal(line.type, 'LineString');
	assert.ok(Math.abs(coordinates[0][0] - start[0]) < 1e-9 && Math.abs(coordinates[0][1] - start[1]) < 1e-9);
	assert.ok(Math.abs(last[0] - (end[0] + 360)) < 1e-9 && Math.abs(last[1] - end[1]) < 1e-9);
	assert.ok(maxLongitudeJump(coordinates) < 10);
});

test('great-circle points lie on the shortest route', () => {
	const start = [24.96, 60.32];
	const end = [-73.78, 40.64];
	const total = distanceMeters(start, end);
	const coordinates = greatCircle(start, end, { steps: 10 }).coordinates;

	assert.equal(coordinates.length, 11);
	for (let i = 0; i < coordinates.length; i++) {
		assert.ok(Math.abs(distanceMeters(start, coordinates[i]) - total * i / 10) < 1);
	}
});

test('great-circle segments default to about 150 km, at most 64', () => {
	assert.equal(greatCircle([0, 0], [1, 0]).coordinates.length, 2);
	assert.equal(greatCircle([0, 0], [10, 0]).coordinates.length, 9);
	assert.equal(greatCircle([139.78, 35.55], [-73.78, 40.64]).coordinates.length, 65);
});

test('a great circle between the same points is a straight segment', () => {
	const coordinates = greatCircle([10, 20], [10, 20], { steps: 2 }).coordinates;

	assert.deepEqual(coordinates, [[10, 20], [10, 20], [10, 20]]);
});

test('invalid input throws a TypeError', () => {
	assert.throws(() => rangeCircle([0], 1000), TypeError);
	assert.throws(() => rangeCircle([0, 91], 1000), TypeError);
	assert.throws(() => rangeCircle([0, 0], -1), TypeError);
	assert.throws(() => rangeCircle([0, 0], NaN), TypeError);
	assert.throws(() => rangeCircle([0, 0], 1000, { steps: 2 }), TypeError);
	assert.throws(() => rangeCircle([0, 0], 1000, { maxLatitude: 0 }), TypeError);
	assert.throws(() => rangeCircle([0, 0], 1000, { maxLatitude: 91 }), TypeError);
	assert.throws(() => rangeCircle([0, 0], 1000, { earthRadius: 0 }), TypeError);
	assert.throws(() => greatCircle([0, 0], ['a', 0]), TypeError);
	assert.throws(() => greatCircle([0, 0], [1, 1], { steps: 0 }), TypeError);
});