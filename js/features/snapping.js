// Snap a grid, paredes y objetos (X e Y independientes)
import { canvas, guidesLayer } from '../core/dom.js';
import { getItemBoxSize, getParentInnerSize, isOpening } from '../core/model.js';
import { GRID_STEP, SNAP_GRID_SENS, SNAP_GRID_WORLD_MAX, SNAP_SENS, SNAP_WORLD_MAX, viewState } from '../core/state.js';
import { getParentRotation, localToCanvas } from './view.js';

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
    // Las paredes son los bordes del área interior de la room.
    const alignXs = [0, parentSize.width];
    const alignYs = [0, parentSize.height];

    parent.querySelectorAll(':scope > .object').forEach((sibling) => {
        // Las puertas/ventanas viven sobre la pared: no deben competir como
        // objetivo de snap. El objeto debe alinearse con la pared real.
        if (sibling === item || isOpening(sibling) || sibling.getClientRects().length === 0) return;

        const { width, height } = getItemBoxSize(sibling);
        // Bordes izquierdo/derecho y centro del hermano: el arrastrado puede
        // alinear cualquiera de sus tres anclas contra cualquiera de estas.
        alignXs.push(
            sibling.offsetLeft - width / 2,
            sibling.offsetLeft,
            sibling.offsetLeft + width / 2,
        );
        alignYs.push(
            sibling.offsetTop - height / 2,
            sibling.offsetTop,
            sibling.offsetTop + height / 2,
        );
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
    // Las tres anclas del objeto arrastrado en este eje: sus dos bordes y su
    // centro. Cada eje se resuelve por separado, así el objeto puede quedar
    // enganchado en X y libre en Y (o al revés).
    const anchors = [center - size / 2, center, center + size / 2];
    let winner = null;

    candidates.forEach((candidate) => {
        anchors.forEach((anchor) => {
            const delta = candidate - anchor;
            if (Math.abs(delta) > threshold) return;
            if (!winner || Math.abs(delta) < Math.abs(winner.delta)) {
                winner = { delta, pos: candidate };
            }
        });
    });

    return winner;
}

export function pickSnap(center, size, targets, alignThreshold, gridThreshold) {
    // Los bordes/centros de otros objetos y las paredes mandan sobre la grid:
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
    const { width, height } = getItemBoxSize(item);
    // Cada eje busca su propio enganche: puede quedar pegado en X (por ejemplo
    // a una pared) y seguir libre en Y para deslizarse a lo largo de ella.
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
