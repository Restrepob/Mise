// Regla: distancias y areas
import { canvas, measureAreaValue, measureDistanceValue, measureNotch, scene } from '../core/dom.js';
import { MEASURE_CLOSE_RADIUS, MEASURE_MIN_STEP, MEASURE_NS, MEASURE_POINT_HIT_RADIUS, measureState, metro, viewState } from '../core/state.js';
import { pointerToScene } from './view.js';

export function getMeasureSvg() {
    let svg = scene.querySelector(':scope > .measure-layer');
    if (!svg) {
        svg = document.createElementNS(MEASURE_NS, 'svg');
        svg.classList.add('measure-layer');
        svg.setAttribute('aria-hidden', 'true');
        scene.appendChild(svg);
    }
    return svg;
}

export function getMeasurementPathLength(points, closed) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    }
    if (closed && points.length > 2) {
        total += Math.hypot(
            points[0].x - points[points.length - 1].x,
            points[0].y - points[points.length - 1].y,
        );
    }
    return total;
}

export function getMeasurementArea(points) {
    let doubleArea = 0;
    for (let index = 0; index < points.length; index += 1) {
        const next = points[(index + 1) % points.length];
        doubleArea += points[index].x * next.y - next.x * points[index].y;
    }
    return Math.abs(doubleArea) / 2;
}

export function formatMeasureNumber(value, digits) {
    return new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(value);
}

export function updateMeasureNotch() {
    const { points, closed } = measureState;
    measureNotch.classList.toggle('is-visible', points.length > 0);

    if (!points.length) {
        measureDistanceValue.textContent = '—';
        measureAreaValue.textContent = '—';
        return;
    }

    const meters = getMeasurementPathLength(points, closed) / metro;
    measureDistanceValue.textContent = `${formatMeasureNumber(meters, 2)} m`;
    measureAreaValue.textContent = closed && points.length >= 3
        ? `${formatMeasureNumber(getMeasurementArea(points) / (metro * metro), 2)} m²`
        : '—';
}

export function renderMeasurement() {
    const svg = getMeasureSvg();
    svg.replaceChildren();

    const { points, closed, drag } = measureState;
    if (!points.length) return;

    if (points.length > 1) {
        const shape = document.createElementNS(MEASURE_NS, closed ? 'polygon' : 'polyline');
        shape.setAttribute('points', points.map((point) => `${point.x},${point.y}`).join(' '));
        shape.setAttribute('class', closed ? 'measure-shape measure-shape--area' : 'measure-shape');
        svg.appendChild(shape);
    }

    points.forEach((point, index) => {
        const dot = document.createElementNS(MEASURE_NS, 'circle');
        dot.setAttribute('cx', point.x);
        dot.setAttribute('cy', point.y);
        const isFirstOpen = index === 0 && !closed;
        dot.setAttribute('r', isFirstOpen ? 6 : 4.5);
        dot.setAttribute('class', [
            'measure-point',
            isFirstOpen ? 'measure-point--first' : '',
            index === drag?.index ? 'measure-point--active' : '',
        ].filter(Boolean).join(' '));
        svg.appendChild(dot);
    });
}

export function resetMeasurement() {
    measureState.points = [];
    measureState.closed = false;
    measureState.drag = null;
    canvas.classList.remove('measure-point-hover', 'measure-dragging');
    renderMeasurement();
    updateMeasureNotch();
}

export function endMeasurement() {
    resetMeasurement();
}

export function getMeasurePointIndexAt(point) {
    const radius = MEASURE_POINT_HIT_RADIUS / viewState.scale;
    for (let index = measureState.points.length - 1; index >= 0; index -= 1) {
        const target = measureState.points[index];
        if (Math.hypot(point.x - target.x, point.y - target.y) <= radius) return index;
    }
    return -1;
}

export function addMeasurePoint(point) {
    if (measureState.closed) {
        measureState.points = [];
        measureState.closed = false;
        measureState.drag = null;
    }

    const points = measureState.points;
    const last = points[points.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) <= MEASURE_MIN_STEP / viewState.scale) return;

    points.push(point);
    renderMeasurement();
    updateMeasureNotch();
}

export function updateMeasureDrag(event) {
    const { drag } = measureState;
    if (!drag) return false;
    measureState.points[drag.index] = pointerToScene(event);
    renderMeasurement();
    updateMeasureNotch();
    return true;
}

export function updateMeasureCursor(event) {
    if (measureState.drag) return;
    const index = getMeasurePointIndexAt(pointerToScene(event));
    canvas.classList.toggle('measure-point-hover', index !== -1);
}

export function stopMeasureDrag() {
    if (measureState.drag) {
        measureState.drag = null;
        renderMeasurement();
    }
    canvas.classList.remove('measure-point-hover', 'measure-dragging');
}

export function handleMeasurePointerDown(event) {
    if (event.button !== 0 || viewState.activePointers.size !== 1) return;
    event.preventDefault();

    const point = pointerToScene(event);
    const { points, closed } = measureState;

    if (!closed && points.length >= 3) {
        const first = points[0];
        if (Math.hypot(point.x - first.x, point.y - first.y) <= MEASURE_CLOSE_RADIUS / viewState.scale) {
            measureState.closed = true;
            measureState.drag = null;
            renderMeasurement();
            updateMeasureNotch();
            return;
        }
    }

    const index = getMeasurePointIndexAt(point);
    if (index !== -1) {
        measureState.drag = { index, pointerId: event.pointerId };
        canvas.classList.add('measure-dragging');
        canvas.setPointerCapture(event.pointerId);
        return;
    }

    addMeasurePoint(point);
}
