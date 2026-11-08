// Snap a grid, paredes y objetos (X e Y independientes)
import { canvas, guidesLayer } from '../core/dom.js';
import { getItemBoxSize, getItemHitboxEdges, getParentInnerSize, isOpening } from '../core/model.js';
import { GRID_STEP, SNAP_GRID_SENS, SNAP_GRID_WORLD_MAX, SNAP_SENS, SNAP_WORLD_MAX, viewState } from '../core/state.js';
import { getParentRotation, localToCanvas } from './view.js';

function edgeKey(edge) {
    const round = (value) => (Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value);
    return `${round(edge.pos)}|${round(edge.min)}|${round(edge.max)}`;
}

export function uniqueSnapTargets(edges) {
    const seen = new Set();
    return edges
        .filter((edge) => {
            const key = edgeKey(edge);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => a.pos - b.pos);
}

// La grid se reparte en un número entero de divisiones entre las dos paredes.
// Así el paso ronda los 10 cm pero las líneas siempre caen justo sobre las
// paredes, sin dejar una franja de 1 cm que compita con el snap a la pared.
export function getGridStep(length) {
    if (!Number.isFinite(length) || length <= 0) return GRID_STEP;
    const divisions = Math.max(1, Math.round(length / GRID_STEP));
    return length / divisions;
}

export function buildGridTargets(length) {
    const step = getGridStep(length);
    const divisions = Math.max(1, Math.round(length / step));
    const targets = [];
    for (let index = 0; index <= divisions; index += 1) {
        targets.push(index * step);
    }
    return targets;
}

export function getSnapThreshold(screenSens = SNAP_SENS, worldMax = SNAP_WORLD_MAX) {
    return Math.min(screenSens / viewState.scale, worldMax);
}

export function collectSnapTargets(parent, item, ignoredItems = []) {
    const ignored = new Set(ignoredItems);
    const parentSize = getParentInnerSize(parent);
    // Las paredes son los bordes del área interior de la room y abarcan todo
    // el alto/ancho interior.
    const alignXs = [
        { axis: 'x', pos: 0, min: 0, max: parentSize.height },
        { axis: 'x', pos: parentSize.width, min: 0, max: parentSize.height },
    ];
    const alignYs = [
        { axis: 'y', pos: 0, min: 0, max: parentSize.width },
        { axis: 'y', pos: parentSize.height, min: 0, max: parentSize.width },
    ];

    parent.querySelectorAll(':scope > .object').forEach((sibling) => {
        // Las puertas/ventanas viven sobre la pared: no deben competir como
        // objetivo de snap. El objeto debe alinearse con la pared real.
        if (sibling === item || ignored.has(sibling) || isOpening(sibling) || sibling.getClientRects().length === 0) return;

        // Cada hermano aporta los lados de su silueta real (no solo la caja
        // cuadrada). El tramo de cada lado evita que el snap enganche contra
        // zonas vacías, como el hueco de una L o las esquinas del semicírculo.
        getItemHitboxEdges(sibling).forEach((edge) => {
            if (edge.axis === 'x') alignXs.push(edge);
            else alignYs.push(edge);
        });
    });

    return {
        x: {
            align: uniqueSnapTargets(alignXs),
            grid: buildGridTargets(parentSize.width).map((pos) => (
                { axis: 'x', pos, min: 0, max: parentSize.height }
            )),
        },
        y: {
            align: uniqueSnapTargets(alignYs),
            grid: buildGridTargets(parentSize.height).map((pos) => (
                { axis: 'y', pos, min: 0, max: parentSize.width }
            )),
        },
    };
}

function spansOverlap(a, b) {
    return Math.max(a.min, b.min) <= Math.min(a.max, b.max) + 0.01;
}

export function findNearestSnap(anchors, candidates, threshold) {
    // Cada ancla y cada objetivo traen el tramo visible del lado. Solo se
    // enganchan si ambos tramos se solapan en el eje perpendicular: así una
    // pared corta o el hueco de una L no atraen al objeto desde cualquier
    // posición.
    let winner = null;

    candidates.forEach((candidate) => {
        anchors.forEach((anchor) => {
            if (!spansOverlap(anchor, candidate)) return;
            const delta = candidate.pos - anchor.pos;
            if (Math.abs(delta) > threshold) return;
            if (!winner || Math.abs(delta) < Math.abs(winner.delta)) {
                winner = { delta, pos: candidate.pos };
            }
        });
    });

    return winner;
}

export function pickSnap(anchors, targets, alignThreshold, gridThreshold) {
    // Los bordes/centros de otros objetos y las paredes mandan sobre la grid:
    // así el snap nunca mete un objeto unos pocos píxeles dentro de otro.
    const alignSnap = findNearestSnap(anchors, targets.align, alignThreshold);
    if (alignSnap) return alignSnap;

    // Descartamos las líneas de grid que quedan pegadas a una pared o a un
    // borde de objeto. Sin esto, al salir del rango del borde, la grid vuelve
    // a atrapar el objeto y se produce un salto de ida y vuelta.
    const gridTargets = targets.grid.filter((edge) => (
        targets.align.every((align) => Math.abs(edge.pos - align.pos) > alignThreshold)
    ));
    return findNearestSnap(anchors, gridTargets, gridThreshold);
}

export function ensureGuidesLayer() {
    return guidesLayer;
}

export function drawSnapGuide(axis, pos, parent) {
    const guide = document.createElement('div');
    guide.className = `snap-guide ${axis}`;
    const rotation = getParentRotation(parent);

    if (!rotation) {
        const parentRect = parent.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const scale = viewState.scale;
        const originX = parentRect.left - canvasRect.left + parent.clientLeft * scale;
        const originY = parentRect.top - canvasRect.top + parent.clientTop * scale;
        const screenPos = (axis === 'x' ? originX : originY) + pos * scale;

        if (axis === 'x') {
            guide.style.left = `${screenPos}px`;
        } else {
            guide.style.top = `${screenPos}px`;
        }
        ensureGuidesLayer().appendChild(guide);
        return;
    }

    // Con la room rotada, una linea local ya no es vertical ni horizontal en
    // pantalla. Dibujamos un segmento largo que pasa por el punto de snap y
    // sigue el eje local correspondiente.
    const center = {
        x: parent.offsetWidth / 2 - parent.clientLeft,
        y: parent.offsetHeight / 2 - parent.clientTop,
    };
    const anchor = axis === 'x'
        ? { x: pos, y: center.y }
        : { x: center.x, y: pos };
    const start = localToCanvas(parent, anchor.x, anchor.y);
    const angle = axis === 'x' ? rotation + 90 : rotation;
    const radians = angle * Math.PI / 180;
    const length = (canvas.clientWidth + canvas.clientHeight) * 2;
    const half = length / 2;

    guide.style.left = `${start.x - Math.cos(radians) * half}px`;
    guide.style.top = `${start.y - Math.sin(radians) * half}px`;
    guide.style.width = `${length}px`;
    guide.style.height = '1px';
    guide.style.transformOrigin = '0 50%';
    guide.style.transform = `rotate(${angle}deg)`;
    ensureGuidesLayer().appendChild(guide);
}

export function clearSnapGuides() {
    ensureGuidesLayer().replaceChildren();
}

export function snapObject(item, left, top, parent) {
    const alignThreshold = getSnapThreshold();
    const gridThreshold = getSnapThreshold(SNAP_GRID_SENS, SNAP_GRID_WORLD_MAX);
    const targets = collectSnapTargets(parent, item);
    // El arrastrado usa su propio hitbox en la posición propuesta, no la caja
    // cuadrada: sus lados interiores también pueden engancharse.
    const edges = getItemHitboxEdges(item, { x: left, y: top });
    const xAnchors = edges.filter((edge) => edge.axis === 'x');
    const yAnchors = edges.filter((edge) => edge.axis === 'y');
    // Cada eje busca su propio enganche: puede quedar pegado en X (por ejemplo
    // a una pared) y seguir libre en Y para deslizarse a lo largo de ella.
    const xSnap = pickSnap(xAnchors, targets.x, alignThreshold, gridThreshold);
    const ySnap = pickSnap(yAnchors, targets.y, alignThreshold, gridThreshold);

    clearSnapGuides();
    if (xSnap) drawSnapGuide('x', xSnap.pos, parent);
    if (ySnap) drawSnapGuide('y', ySnap.pos, parent);

    return {
        left: left + (xSnap?.delta || 0),
        top: top + (ySnap?.delta || 0),
    };
}

export function snapGroup(items, parent) {
    if (!items?.length || !parent) return { deltaX: 0, deltaY: 0 };

    const bounds = items.map((item) => {
        const x = Number.parseFloat(item.style.left) || 0;
        const y = Number.parseFloat(item.style.top) || 0;
        const { width, height } = getItemBoxSize(item);
        return { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 };
    });
    const left = Math.min(...bounds.map((box) => box.left));
    const right = Math.max(...bounds.map((box) => box.right));
    const top = Math.min(...bounds.map((box) => box.top));
    const bottom = Math.max(...bounds.map((box) => box.bottom));
    const xAnchors = [
        { axis: 'x', pos: left, min: top, max: bottom },
        { axis: 'x', pos: right, min: top, max: bottom },
    ];
    const yAnchors = [
        { axis: 'y', pos: top, min: left, max: right },
        { axis: 'y', pos: bottom, min: left, max: right },
    ];
    const targets = collectSnapTargets(parent, null, items);
    const alignThreshold = getSnapThreshold();
    const gridThreshold = getSnapThreshold(SNAP_GRID_SENS, SNAP_GRID_WORLD_MAX);
    const xSnap = pickSnap(xAnchors, targets.x, alignThreshold, gridThreshold);
    const ySnap = pickSnap(yAnchors, targets.y, alignThreshold, gridThreshold);

    clearSnapGuides();
    if (xSnap) drawSnapGuide('x', xSnap.pos, parent);
    if (ySnap) drawSnapGuide('y', ySnap.pos, parent);

    return { deltaX: xSnap?.delta || 0, deltaY: ySnap?.delta || 0 };
}
