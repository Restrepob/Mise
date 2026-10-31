// Snap a grid, paredes y objetos
import { canvas, guidesLayer } from '../core/dom.js';
import { getItemBoxSize, getParentInnerSize, isOpening } from '../core/model.js';
import { GRID_STEP, SNAP_GRID_SENS, SNAP_GRID_WORLD_MAX, SNAP_SENS, SNAP_WORLD_MAX, viewState } from '../core/state.js';

export function uniqueSnapTargets(values) {
    return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))]
        .sort((a, b) => a - b);
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

export function collectSnapTargets(parent, item) {
    const parentSize = getParentInnerSize(parent);
    const alignXs = [0, parentSize.width];
    const alignYs = [0, parentSize.height];

    parent.querySelectorAll(':scope > .object').forEach((sibling) => {
        // Las puertas/ventanas viven sobre la pared: no deben competir como
        // objetivo de snap. El objeto debe alinearse con la pared real.
        if (sibling === item || isOpening(sibling) || sibling.getClientRects().length === 0) return;

        const { width, height } = getItemBoxSize(sibling);
        alignXs.push(sibling.offsetLeft - width / 2, sibling.offsetLeft + width / 2);
        alignYs.push(sibling.offsetTop - height / 2, sibling.offsetTop + height / 2);
    });

    return {
        x: {
            align: uniqueSnapTargets(alignXs),
            grid: uniqueSnapTargets(buildGridTargets(parentSize.width)),
        },
        y: {
            align: uniqueSnapTargets(alignYs),
            grid: uniqueSnapTargets(buildGridTargets(parentSize.height)),
        },
    };
}

export function findNearestSnap(center, size, candidates, threshold) {
    const edges = [center - size / 2, center + size / 2];
    let winner = null;

    candidates.forEach((candidate) => {
        edges.forEach((edge) => {
            const delta = candidate - edge;
            if (Math.abs(delta) > threshold) return;
            if (!winner || Math.abs(delta) < Math.abs(winner.delta)) {
                winner = { delta, pos: candidate };
            }
        });
    });

    return winner;
}

export function pickSnap(center, size, targets, alignThreshold, gridThreshold) {
    // Los bordes de otros objetos y las paredes mandan sobre la grid:
    // así el snap nunca mete un objeto unos pocos píxeles dentro de otro.
    const alignSnap = findNearestSnap(center, size, targets.align, alignThreshold);
    if (alignSnap) return alignSnap;

    // Descartamos las líneas de grid que quedan pegadas a una pared o a un
    // borde de objeto. Sin esto, al salir del rango del borde, la grid vuelve
    // a atrapar el objeto y se produce un salto de ida y vuelta.
    const gridTargets = targets.grid.filter((position) => (
        targets.align.every((align) => Math.abs(position - align) > alignThreshold)
    ));
    return findNearestSnap(center, size, gridTargets, gridThreshold);
}

export function ensureGuidesLayer() {
    return guidesLayer;
}

export function drawSnapGuide(axis, pos, parent) {
    const guide = document.createElement('div');
    const parentRect = parent.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const scale = viewState.scale;
    const originX = parentRect.left - canvasRect.left + parent.clientLeft * scale;
    const originY = parentRect.top - canvasRect.top + parent.clientTop * scale;
    const screenPos = (axis === 'x' ? originX : originY) + pos * scale;

    guide.className = `snap-guide ${axis}`;
    if (axis === 'x') {
        guide.style.left = `${screenPos}px`;
    } else {
        guide.style.top = `${screenPos}px`;
    }
    ensureGuidesLayer().appendChild(guide);
}

export function clearSnapGuides() {
    ensureGuidesLayer().replaceChildren();
}

export function snapObject(item, left, top, parent) {
    const alignThreshold = getSnapThreshold();
    const gridThreshold = getSnapThreshold(SNAP_GRID_SENS, SNAP_GRID_WORLD_MAX);
    const targets = collectSnapTargets(parent, item);
    const { width, height } = getItemBoxSize(item);
    const xSnap = pickSnap(left, width, targets.x, alignThreshold, gridThreshold);
    const ySnap = pickSnap(top, height, targets.y, alignThreshold, gridThreshold);

    clearSnapGuides();
    if (xSnap) drawSnapGuide('x', xSnap.pos, parent);
    if (ySnap) drawSnapGuide('y', ySnap.pos, parent);

    return {
        left: left + (xSnap?.delta || 0),
        top: top + (ySnap?.delta || 0),
    };
}
