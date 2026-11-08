// Modelo de items: rooms, muebles y aperturas
import { scene } from './dom.js';
import { getGridStep } from '../features/snapping.js';
import { getLShapeMetrics, isLShape } from '../features/l-shape.js';
import { MARGEN_ESQUINA, OPENING_MIN, state } from './state.js';
import { getRotation, normalizeDeg, snapNameRotation } from './units.js';

export function getSelectedObject() {
    return state.selectedLayerId ? document.getElementById(state.selectedLayerId) : null;
}

export function setItemName(item, value) {
    if (!item) return;
    item.dataset.name = value;
    if (isOpening(item)) return;

    let nameEl = item.querySelector(':scope > .balance-name');
    if (!nameEl) {
        nameEl = document.createElement('div');
        nameEl.className = 'balance-name';
        [...item.childNodes].forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) node.remove();
        });
        item.appendChild(nameEl);
        const translate = isLShape(item) ? 'translate(-50%, -50%) ' : '';
        nameEl.style.transform = `${translate}rotate(${snapNameRotation(getRotation(item))}deg)`;
    }
    let textEl = nameEl.querySelector('.balance-text');
    if (!textEl) {
        textEl = document.createElement('span');
        textEl.className = 'balance-text';
        nameEl.replaceChildren(textEl);
    }
    textEl.textContent = value;
}

export function getRooms() {
    return [...scene.children].filter((el) => el.classList.contains('room'));
}

export function getActiveRoom() {
    return state.activeRoomId ? document.getElementById(state.activeRoomId) : null;
}

export function getItemBoxSize(item) {
    const width = parseFloat(item.style.width) || item.offsetWidth || 0;
    const height = parseFloat(item.style.height) || item.offsetHeight || 0;
    const rotation = isOpening(item) ? 0 : normalizeDeg(getRotation(item));

    if (!rotation) return { width, height };

    const radians = rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    return {
        width: width * cos + height * sin,
        height: width * sin + height * cos,
    };
}

const ROTATION_EPSILON = 0.01;

function makeHitboxEdge(axis, pos, start, end) {
    return {
        axis,
        pos,
        min: Math.min(start, end),
        max: Math.max(start, end),
    };
}

function readCornerRadius(item, width, height) {
    const source = item.style.borderRadius || '';
    if (!source) return { rx: 0, ry: 0 };

    const parts = source.split('/')[0].trim().split(/\s+/).filter(Boolean);
    const toPixels = (value, base) => {
        if (!value) return 0;
        const number = Number.parseFloat(value);
        if (!Number.isFinite(number)) return 0;
        return value.includes('%') ? (base * number) / 100 : number;
    };

    return {
        rx: Math.min(Math.max(0, toPixels(parts[0], width)), width / 2),
        ry: Math.min(Math.max(0, toPixels(parts[1] || parts[0], height)), height / 2),
    };
}

// Lados reales de la silueta en coordenadas locales. La L incluye sus dos
// bordes interiores y los círculos/elipses recortan cada lado hasta donde el
// tramo recto existe de verdad (en una elipse quedan cuatro puntos tangentes).
function getLocalHitboxEdges(item, width, height) {
    if (isLShape(item)) {
        const { armX, armY } = getLShapeMetrics(item);
        const innerX = Math.min(Math.max(armX, 0), width);
        const innerY = Math.min(Math.max(height - armY, 0), height);
        return [
            makeHitboxEdge('x', 0, 0, height),
            makeHitboxEdge('y', 0, 0, innerX),
            makeHitboxEdge('x', innerX, 0, innerY),
            makeHitboxEdge('y', innerY, innerX, width),
            makeHitboxEdge('x', width, innerY, height),
            makeHitboxEdge('y', height, 0, width),
        ];
    }

    if (item.dataset.shape === 'semicircle') {
        // La base es el único lado recto; el arco solo toca los ejes en sus
        // tangentes: los dos extremos de la base y la punta superior.
        return [
            makeHitboxEdge('y', height, 0, width),
            makeHitboxEdge('x', 0, height, height),
            makeHitboxEdge('x', width, height, height),
            makeHitboxEdge('y', 0, width / 2, width / 2),
        ];
    }

    const { rx, ry } = readCornerRadius(item, width, height);
    return [
        makeHitboxEdge('x', 0, ry, height - ry),
        makeHitboxEdge('x', width, ry, height - ry),
        makeHitboxEdge('y', 0, rx, width - rx),
        makeHitboxEdge('y', height, rx, width - rx),
    ];
}

function getLocalOutlinePoints(item, width, height) {
    if (isLShape(item)) {
        const { armX, armY } = getLShapeMetrics(item);
        const innerX = Math.min(Math.max(armX, 0), width);
        const innerY = Math.min(Math.max(height - armY, 0), height);
        return [
            [0, 0],
            [innerX, 0],
            [innerX, innerY],
            [width, innerY],
            [width, height],
            [0, height],
        ];
    }

    if (item.dataset.shape === 'semicircle') {
        const points = [];
        const steps = 32;
        for (let index = 0; index <= steps; index += 1) {
            const angle = (Math.PI * index) / steps;
            points.push([
                width / 2 + (width / 2) * Math.cos(angle),
                height - height * Math.sin(angle),
            ]);
        }
        return points;
    }

    const { rx, ry } = readCornerRadius(item, width, height);
    if (rx >= width / 2 - 0.01 && ry >= height / 2 - 0.01) {
        // Elipse completa: se resuelve analíticamente, sin muestrear.
        return { ellipse: { rx, ry } };
    }

    // Rectángulos y esquinas redondeadas ya ocupan toda su caja envolvente.
    return null;
}

function getRotatedShapeBounds(item, width, height, centerX, centerY, rotation) {
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const outline = getLocalOutlinePoints(item, width, height);

    if (outline?.ellipse) {
        const { rx, ry } = outline.ellipse;
        const halfWidth = Math.hypot(rx * cos, ry * sin);
        const halfHeight = Math.hypot(rx * sin, ry * cos);
        return {
            minX: centerX - halfWidth,
            maxX: centerX + halfWidth,
            minY: centerY - halfHeight,
            maxY: centerY + halfHeight,
        };
    }

    if (!outline) {
        const halfWidth = (width * Math.abs(cos) + height * Math.abs(sin)) / 2;
        const halfHeight = (width * Math.abs(sin) + height * Math.abs(cos)) / 2;
        return {
            minX: centerX - halfWidth,
            maxX: centerX + halfWidth,
            minY: centerY - halfHeight,
            maxY: centerY + halfHeight,
        };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    outline.forEach(([localX, localY]) => {
        const dx = localX - width / 2;
        const dy = localY - height / 2;
        const x = centerX + dx * cos - dy * sin;
        const y = centerY + dx * sin + dy * cos;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    });
    return { minX, maxX, minY, maxY };
}

function transformHitboxEdge(edge, width, height, centerX, centerY, cos, sin) {
    const toParent = (localX, localY) => ({
        x: centerX + (localX - width / 2) * cos - (localY - height / 2) * sin,
        y: centerY + (localX - width / 2) * sin + (localY - height / 2) * cos,
    });
    const start = edge.axis === 'x'
        ? toParent(edge.pos, edge.min)
        : toParent(edge.min, edge.pos);
    const end = edge.axis === 'x'
        ? toParent(edge.pos, edge.max)
        : toParent(edge.max, edge.pos);

    // A 0/90/180/270 grados el lado transformado sigue siendo paralelo a un eje.
    const axis = edge.axis === 'x'
        ? (cos !== 0 ? 'x' : 'y')
        : (sin !== 0 ? 'x' : 'y');
    if (axis === 'x') return makeHitboxEdge('x', start.x, start.y, end.y);
    return makeHitboxEdge('y', start.y, start.x, end.x);
}

// Hitbox de la forma para el snap. Cada lado trae `pos` (la coordenada que se
// alinea) y `min`/`max` (el tramo visible en el otro eje). Así la L no engancha
// objetos contra la zona vacía del hueco y el semicírculo no se comporta como
// el cuadrado que lo contiene.
export function getItemHitboxEdges(item, center = null) {
    if (!item) return [];

    const width = parseFloat(item.style.width) || item.offsetWidth || 0;
    const height = parseFloat(item.style.height) || item.offsetHeight || 0;
    if (!(width > 0) || !(height > 0)) return [];

    const centerX = Number.isFinite(center?.x) ? center.x : item.offsetLeft;
    const centerY = Number.isFinite(center?.y) ? center.y : item.offsetTop;
    const rotation = normalizeDeg(getRotation(item));
    const quarter = Math.round(rotation / 90) * 90;
    const aligned = Math.abs(rotation - quarter) <= ROTATION_EPSILON;

    let edges;
    let bounds;
    if (aligned) {
        const radians = (quarter * Math.PI) / 180;
        const cos = Math.round(Math.cos(radians));
        const sin = Math.round(Math.sin(radians));
        edges = getLocalHitboxEdges(item, width, height).map((edge) => (
            transformHitboxEdge(edge, width, height, centerX, centerY, cos, sin)
        ));
        // A 0/90/180/270 la silueta sigue tocando los cuatro lados de la caja.
        const halfWidth = (width * Math.abs(cos) + height * Math.abs(sin)) / 2;
        const halfHeight = (width * Math.abs(sin) + height * Math.abs(cos)) / 2;
        bounds = {
            minX: centerX - halfWidth,
            maxX: centerX + halfWidth,
            minY: centerY - halfHeight,
            maxY: centerY + halfHeight,
        };
    } else {
        // En rotaciones libres los lados de la silueta dejan de ser paralelos a
        // los ejes de la room: usamos la caja envolvente real de la forma.
        bounds = getRotatedShapeBounds(item, width, height, centerX, centerY, rotation);
        edges = [
            makeHitboxEdge('x', bounds.minX, bounds.minY, bounds.maxY),
            makeHitboxEdge('x', bounds.maxX, bounds.minY, bounds.maxY),
            makeHitboxEdge('y', bounds.minY, bounds.minX, bounds.maxX),
            makeHitboxEdge('y', bounds.maxY, bounds.minX, bounds.maxX),
        ];
    }

    // Las líneas de centro se mantienen como anclas de alineación, pero con el
    // tramo de la propia silueta: un objeto lejano en el eje perpendicular ya
    // no se engancha al centro de una forma que no toca.
    edges.push(makeHitboxEdge('x', centerX, bounds.minY, bounds.maxY));
    edges.push(makeHitboxEdge('y', centerY, bounds.minX, bounds.maxX));
    return edges;
}

export function getParentInnerSize(parent) {
    return {
        width: parent.clientWidth || parseFloat(parent.style.width) || parent.offsetWidth || 0,
        height: parent.clientHeight || parseFloat(parent.style.height) || parent.offsetHeight || 0,
    };
}

export function isOpening(item) {
    return item?.dataset.type === 'window' || item?.dataset.type === 'door';
}

export function getOpeningWidth(item) {
    return parseFloat(item.dataset.openingWidth) || OPENING_MIN;
}

export function getOpeningWallLength(item) {
    const room = item.parentElement;
    const roomSize = getParentInnerSize(room);
    return item.dataset.edge === 'right' || item.dataset.edge === 'left'
        ? roomSize.height
        : roomSize.width;
}

export function clampOpeningOffset(item, offset, width = getOpeningWidth(item)) {
    const maxOffset = Math.max(MARGEN_ESQUINA, getOpeningWallLength(item) - width - MARGEN_ESQUINA);
    return Math.min(Math.max(offset, MARGEN_ESQUINA), maxOffset);
}

export function snapOpeningOffset(offset, wallLength) {
    const step = getGridStep(wallLength);
    return Math.round(offset / step) * step;
}
