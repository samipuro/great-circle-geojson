import { rangeCircle, rangeLine, greatCircle } from '../src/index.js';
import turfCircle from 'https://esm.sh/@turf/circle@7.4.0';
import turfGreatCircle from 'https://esm.sh/@turf/great-circle@7.4.0';

// Initial state from the URL, e.g. ?center=10,82&radius=1500&to=-122.38,37.62&view=10,55,0.6&panel=0.
const query = new URLSearchParams(location.search);
const state = {
	center: parsePosition(query.get('center')) || [24.96, 60.32],
	radiusKm: Number(query.get('radius')) || 8000,
	destination: parsePosition(query.get('to'))
};
const view = parseView(query.get('view')) || { center: [20, 30], zoom: 0.2 };
if (query.get('panel') === '0') {
	document.querySelector('.panel').hidden = true;
}

const radiusInput = document.getElementById('radius');
const radiusValue = document.getElementById('radiusValue');
radiusInput.value = state.radiusKm;

// The same drawing setup on both maps, each with its own geometry builders.
const sides = [
	{
		map: createMap('mapTurf'),
		color: '#d1242f',
		area: () => turfCircle(state.center, state.radiusKm, { units: 'kilometers', steps: 180 }),
		outline: () => turfCircle(state.center, state.radiusKm, { units: 'kilometers', steps: 180 }),
		route: () => turfGreatCircle(state.center, state.destination, { npoints: 100 })
	},
	{
		map: createMap('mapOurs'),
		color: '#1f6feb',
		area: () => rangeCircle(state.center, state.radiusKm * 1000),
		outline: () => rangeLine(state.center, state.radiusKm * 1000),
		route: () => greatCircle(state.center, state.destination)
	}
];
let readyCount = 0;

// Add the sources and layers of each map, then draw once both are ready.
for (const side of sides) {
	side.map.on('load', () => {
		for (const name of ['area', 'outline', 'route', 'points']) {
			side.map.addSource(name, { type: 'geojson', data: emptyFeature() });
		}
		side.map.addLayer({ id: 'area', type: 'fill', source: 'area', paint: { 'fill-color': side.color, 'fill-opacity': 0.3 } });
		side.map.addLayer({ id: 'outline', type: 'line', source: 'outline', paint: { 'line-color': side.color, 'line-width': 2 } });
		side.map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#1a7f37', 'line-width': 3 } });
		side.map.addLayer({ id: 'points', type: 'circle', source: 'points', paint: { 'circle-radius': 5, 'circle-color': '#000', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
		readyCount++;
		draw();
	});

	// Click moves the center; shift-click sets the route destination.
	side.map.on('click', (event) => {
		const position = [event.lngLat.lng, event.lngLat.lat];
		if (event.originalEvent.shiftKey) {
			state.destination = position;
		} else {
			state.center = position;
		}
		draw();
	});
}

// Keep both cameras in the same view.
let syncing = false;
for (const side of sides) {
	side.map.on('move', () => {
		if (syncing) {
			return;
		}
		syncing = true;
		for (const other of sides) {
			if (other !== side) {
				other.map.jumpTo({ center: side.map.getCenter(), zoom: side.map.getZoom() });
			}
		}
		syncing = false;
	});
}

radiusInput.addEventListener('input', () => {
	state.radiusKm = Number(radiusInput.value);
	draw();
});

// Presets set the classic problem cases and a fitting view.
document.querySelectorAll('.presets button').forEach((button) => {
	button.addEventListener('click', () => {
		state.center = parsePosition(button.dataset.center);
		state.radiusKm = Number(button.dataset.radius);
		state.destination = parsePosition(button.dataset.to);
		radiusInput.value = state.radiusKm;
		const presetView = parseView(button.dataset.view);
		sides[0].map.jumpTo(presetView);
		draw();
	});
});

//   Creates a map in the container element with the shared view.
function createMap(container) {
	return new maplibregl.Map({
		container: container,
		style: 'https://demotiles.maplibre.org/style.json',
		center: view.center,
		zoom: view.zoom,
		attributionControl: { compact: true },
		preserveDrawingBuffer: true
	});
}

//   Redraws the areas, outlines, routes and points of both maps from the state.
function draw() {
	radiusValue.textContent = state.radiusKm.toLocaleString('en') + ' km';
	if (readyCount < sides.length) {
		return;
	}

	// Each map draws the same state with its own implementation.
	const points = [state.center].concat(state.destination ? [state.destination] : []);
	for (const side of sides) {
		side.map.getSource('area').setData(side.area());
		side.map.getSource('outline').setData(side.outline());
		side.map.getSource('route').setData(state.destination ? side.route() : emptyFeature());
		side.map.getSource('points').setData({ type: 'MultiPoint', coordinates: points });
	}
}

//   Returns a "longitude,latitude" string as a position, or null.
function parsePosition(text) {
	const parts = (text || '').split(',').map(Number);

	return (parts.length === 2 && parts.every(Number.isFinite) ? parts : null);
}

//   Returns a "longitude,latitude,zoom" string as a camera view, or null.
function parseView(text) {
	const parts = (text || '').split(',').map(Number);

	return (parts.length === 3 && parts.every(Number.isFinite) ? { center: [parts[0], parts[1]], zoom: parts[2] } : null);
}

//   Returns an empty GeoJSON feature collection.
function emptyFeature() {
	return { type: 'FeatureCollection', features: [] };
}