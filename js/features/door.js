// Puertas, edges, tolerancias y overlay de aperturas
import { openingLayer } from '../core/dom.js';
import { clampOpeningOffset, getOpeningWallLength, getOpeningWidth, getParentInnerSize, getSelectedObject, isItemLocked, isOpening, snapOpeningOffset } from '../core/model.js';
import { placeOpening } from './openings.js';
import { guardarCambios } from './persistence.js';
import { syncSizeManager } from './size-manager.js';
import { EDGE_SIDES, TOLERANCE_MAX_M, TOLERANCE_SIDES, metro } from '../core/state.js';
import { syncShapePreviews } from './shape-preview.js';
import { getRotation } from '../core/units.js';
import { localToCanvas } from './view.js';

export function drawDoorArc(item) {
    item.querySelector('.door-arc')?.remove();
    if (!item || item.dataset.type !== 'door' || !item.isConnected) return;

    const room = item.parentElement;
    const roomSize = getParentInnerSize(room);
    const roomWidth = roomSize.width;
    const roomHeight = roomSize.height;
    const width = getOpeningWidth(item);
    const edge = item.dataset.edge || 'top';
    const dirIn = (item.dataset.direction || 'in') === 'in';
    const axisSup = (item.dataset.axis || 'sup') === 'sup';

    const left = parseFloat(item.style.left);
    const top = parseFloat(item.style.top);
    const boxW = parseFloat(item.style.width) || item.offsetWidth;
    const boxH = parseFloat(item.style.height) || item.offsetHeight;
    const anchorX = left - boxW / 2;
    const anchorY = top - boxH / 2;
    const u = edge === 'top' || edge === 'bottom' ? [1, 0] : [0, 1];
    const n = edge === 'top' ? [0, 1] : edge === 'bottom' ? [0, -1] : edge === 'left' ? [1, 0] : [-1, 0];

    const offset = parseFloat(item.dataset.offset) || 0;
    const centerU = edge === 'top' || edge === 'bottom' ? left : top;
    const centerN = edge === 'top' ? top : edge === 'bottom' ? roomHeight - top : edge === 'left' ? left : roomWidth - left;
    const hingeU = axisSup ? offset : offset + width;

    const hingeX = left - centerN * n[0] + (hingeU - centerU) * u[0];
    const hingeY = top - centerN * n[1] + (hingeU - centerU) * u[1];

    const step = 24;
    const pts = [];
    for (let k = 0; k <= step; k += 1) {
        const t = Math.PI * k / step;
        const du = (axisSup ? 1 : -1) * width * Math.cos(t);
        const dn = (dirIn ? 1 : -1) * width * Math.sin(t);
        pts.push([hingeX + du * u[0] + dn * n[0], hingeY + du * u[1] + dn * n[1]]);
    }

    const xs = [hingeX, ...pts.map((p) => p[0])];
    const ys = [hingeY, ...pts.map((p) => p[1])];
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'door-arc');
    svg.setAttribute('viewBox', `0 0 ${Math.max(...xs) - minX} ${Math.max(...ys) - minY}`);
    svg.style.position = 'absolute';
    // El SVG se posiciona respecto al padding-box del objeto; compensamos su borde
    // para que el arco nazca exactamente en la pared interna de la room.
    svg.style.left = `${minX - anchorX - item.clientLeft}px`;
    svg.style.top = `${minY - anchorY - item.clientTop}px`;
    svg.style.width = `${Math.max(...xs) - minX}px`;
    svg.style.height = `${Math.max(...ys) - minY}px`;
    svg.style.overflow = 'visible';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dPts = pts.map((p) => `${p[0] - minX},${p[1] - minY}`);
    path.setAttribute('d', `M${hingeX - minX},${hingeY - minY} L${dPts.join(' L')} Z`);
    path.setAttribute('fill', 'rgba(212, 164, 119, 0.22)');
    path.setAttribute('stroke', 'rgba(212, 164, 119, 0.9)');
    path.setAttribute('stroke-width', '1.5');

    svg.appendChild(path);

    const pivot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pivot.setAttribute('cx', `${hingeX - minX}`);
    pivot.setAttribute('cy', `${hingeY - minY}`);
    pivot.setAttribute('r', '3.5');
    pivot.setAttribute('fill', '#d4a477');
    pivot.setAttribute('stroke', 'rgba(111, 74, 50, 0.85)');
    pivot.setAttribute('stroke-width', '1');
    svg.appendChild(pivot);

    const drawOpeningArrow = (t) => {
        const c = Math.cos(t);
        const s = Math.sin(t);
        const ax = hingeX + (axisSup ? 1 : -1) * width * c * u[0] + (dirIn ? 1 : -1) * width * s * n[0];
        const ay = hingeY + (axisSup ? 1 : -1) * width * c * u[1] + (dirIn ? 1 : -1) * width * s * n[1];
        const dx = -(axisSup ? 1 : -1) * width * s * u[0] + (dirIn ? 1 : -1) * width * c * n[0];
        const dy = -(axisSup ? 1 : -1) * width * s * u[1] + (dirIn ? 1 : -1) * width * c * n[1];
        const mLen = Math.hypot(dx, dy) || 1;
        const tailAngle = Math.atan2(dy / mLen, dx / mLen);
        const tailLen = 9;
        const head = 4;
        const back = Math.PI * 5 / 6;
        const tailX = ax - Math.cos(tailAngle) * tailLen;
        const tailY = ay - Math.sin(tailAngle) * tailLen;
        const w1x = ax + head * Math.cos(tailAngle + back);
        const w1y = ay + head * Math.sin(tailAngle + back);
        const w2x = ax + head * Math.cos(tailAngle - back);
        const w2y = ay + head * Math.sin(tailAngle - back);

        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrow.setAttribute('d',
            `M${tailX - minX},${tailY - minY} L${ax - minX},${ay - minY} ` +
            `M${ax - minX},${ay - minY} L${w1x - minX},${w1y - minY} ` +
            `M${ax - minX},${ay - minY} L${w2x - minX},${w2y - minY}`);
        arrow.setAttribute('fill', 'none');
        arrow.setAttribute('stroke', 'rgba(212, 164, 119, 0.95)');
        arrow.setAttribute('stroke-width', '1.5');
        arrow.setAttribute('stroke-linecap', 'round');
        arrow.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(arrow);
    };
    [Math.PI / 6, Math.PI / 3, Math.PI / 2, 2 * Math.PI / 3, 5 * Math.PI / 6].forEach(drawOpeningArrow);

    item.appendChild(svg);
}

export function syncDoorPanel(item) {
    const isDoor = item?.dataset.type === 'door';
    document.getElementById('door-props').style.display = isDoor ? '' : 'none';
    if (!isDoor) return;

    const dir = item.dataset.direction || 'in';
    const axis = item.dataset.axis || 'sup';
    document.getElementById('door-dir-in').classList.toggle('selected', dir === 'in');
    document.getElementById('door-dir-out').classList.toggle('selected', dir === 'out');
    document.getElementById('door-axis-sup').classList.toggle('selected', axis === 'sup');
    document.getElementById('door-axis-inf').classList.toggle('selected', axis === 'inf');
}

export function bindDoorToggle(ids, key, values) {
    ids.forEach((id, index) => {
        document.getElementById(id).addEventListener('click', () => {
            const item = getSelectedObject();
            if (!item || item.dataset.type !== 'door') return;
            item.dataset[key] = values[index];
            placeOpening(item);
            syncOpeningOverlay(item);
            syncDoorPanel(item);
            guardarCambios(item);
        });
    });
}

bindDoorToggle(['door-dir-in', 'door-dir-out'], 'direction', ['in', 'out']);

bindDoorToggle(['door-axis-sup', 'door-axis-inf'], 'axis', ['sup', 'inf']);

export function hasEdge(item, side) {
    return (item?.dataset.edges || '').split(' ').includes(side);
}

const L_EDGE_SIDES = ['top', 'inner-vertical', 'inner-horizontal', 'right', 'bottom', 'left'];
const L_TOLERANCE_SIDES = L_EDGE_SIDES;
const L_SIDE_LABELS = {
    top: 'superior',
    'inner-vertical': 'interior vertical',
    'inner-horizontal': 'interior horizontal',
    right: 'derecho',
    bottom: 'inferior',
    left: 'izquierdo',
};

function getEdgeSides(item) {
    return item?.dataset.shape === 'l' ? L_EDGE_SIDES : EDGE_SIDES;
}

function getToleranceSides(item) {
    return item?.dataset.shape === 'l' ? L_TOLERANCE_SIDES : TOLERANCE_SIDES;
}

function ensureLSideControls(item) {
    const edgeRotor = document.getElementById('edge-rotor');
    const toleranceRotor = document.getElementById('tolerance-rotor');
    const isL = item?.dataset.shape === 'l';

    edgeRotor.querySelectorAll('.edge-switch[data-l-side="true"]').forEach((control) => {
        if (!isL) control.remove();
    });
    toleranceRotor.querySelectorAll('.tol-label[data-l-side="true"]').forEach((control) => {
        if (!isL) control.remove();
    });
    if (!isL) return;

    L_EDGE_SIDES.slice(1, 3).forEach((side) => {
        if (edgeRotor.querySelector(`.edge-switch[data-edge="${side}"]`)) return;
        const control = document.createElement('button');
        control.type = 'button';
        control.className = `edge-switch edge-switch--${side}`;
        control.dataset.edge = side;
        control.dataset.lSide = 'true';
        control.setAttribute('aria-label', `Borde ${L_SIDE_LABELS[side]}`);
        edgeRotor.appendChild(control);
    });
    L_TOLERANCE_SIDES.slice(1, 3).forEach((side) => {
        if (toleranceRotor.querySelector(`.tol-label[data-tol-side="${side}"]`)) return;
        const control = document.createElement('span');
        control.className = `tol-label tol-label--${side}`;
        control.dataset.tolSide = side;
        control.dataset.lSide = 'true';
        control.textContent = '0';
        toleranceRotor.appendChild(control);
    });
}

export function setObjectEdge(item, side, on) {
    if (!item || isOpening(item)) return;
    let list = (item.dataset.edges || '').split(' ').filter(Boolean);
    if (on && !list.includes(side)) list.push(side);
    if (!on) list = list.filter((item) => item !== side);
    item.dataset.edges = list.filter((edge) => getEdgeSides(item).includes(edge)).join(' ');
    renderEdges(item);
}

export function renderEdges(item) {
    item.querySelector('.edges-layer')?.remove();
    if (!item || !item.classList.contains('furniture')) return;
    const sides = (item.dataset.edges || '').split(' ').filter((side) => getEdgeSides(item).includes(side));
    if (!sides.length) return;

    const layer = document.createElement('div');
    layer.className = 'edges-layer';
    sides.forEach((side) => {
        const strip = document.createElement('div');
        strip.className = `edge-strip edge-strip--${side}`;
        layer.appendChild(strip);
    });
    item.appendChild(layer);
}

export function getToleranceSide(item, side) {
    if (!item) return 0;
    const list = (item.dataset.tolerance || '').split(' ').map(Number);
    const sides = getToleranceSides(item);
    let index = sides.indexOf(side);
    if (item.dataset.shape === 'l' && list.length < L_TOLERANCE_SIDES.length) {
        index = TOLERANCE_SIDES.indexOf(side);
    }
    return Number.isFinite(list[index]) ? Math.max(0, list[index] || 0) : 0;
}

export function setToleranceSide(item, side, metros) {
    if (!item || isOpening(item)) return;
    const sides = getToleranceSides(item);
    const list = sides.map((s) => getToleranceSide(item, s));
    const value = Math.min(Math.max(0, Number(metros) || 0), TOLERANCE_MAX_M);
    list[sides.indexOf(side)] = Number(value.toFixed(2));
    item.dataset.tolerance = list.map((v) => v || 0).join(' ');
    renderTolerance(item);
}

export function renderTolerance(item) {
    if (!item || !item.classList.contains('furniture')) return;
    item.querySelector('.tolerance-layer')?.remove();

    const layer = document.createElement('div');
    layer.className = 'tolerance-layer';
    const shapeFill = item.querySelector(':scope > .l-shape-fill, :scope > .semicircle-fill') || item;
    const fill = getComputedStyle(shapeFill).backgroundColor;
    if (/^rgb|^hsl|^#/.test(fill) && fill !== 'rgba(0, 0, 0, 0)') {
        layer.style.setProperty('--color-el', fill);
    }
    getToleranceSides(item).forEach((side) => {
        const depth = getToleranceSide(item, side) * metro;
        const tab = document.createElement('div');
        tab.className = `tol-tab tol-tab--${side}`;
        if (depth > 0) {
            tab.classList.add('has-depth');
            tab.style.setProperty('--tol-depth', `${depth}px`);
        }
        layer.appendChild(tab);
    });
    item.appendChild(layer);
}

export function syncTolerancePanel(item) {
    const editable = !!item && !isOpening(item) && item.classList.contains('furniture');
    document.getElementById('tolerance-manager').style.display = editable ? 'flex' : 'none';
    if (!editable) return;

    ensureLSideControls(item);
    getToleranceSides(item).forEach((side) => {
        const label = document.querySelector(`.tol-label[data-tol-side="${side}"]`);
        if (label) label.textContent = getToleranceSide(item, side);
    });
    syncShapePreviews(item);
}

document.getElementById('tolerance-rotor').addEventListener('click', (event) => {
    const label = event.target.closest('.tol-label');
    if (!label) return;
    event.stopPropagation();
    const item = getSelectedObject();
    if (!item || !item.classList.contains('furniture')) return;
    openToleranceInput(item, label.dataset.tolSide, label);
});

export function openToleranceInput(item, side, labelEl) {
    document.querySelector('.tol-input-popup')?.remove();

    const box = document.createElement('div');
    box.classList.add('tol-input-popup');

    const caption = document.createElement('span');
    caption.className = 'tol-input-caption';
    caption.textContent = `Tolerancia ${L_SIDE_LABELS[side] || side} (m)`;

    const row = document.createElement('div');
    row.className = 'tol-input-row';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.05';
    input.value = String(getToleranceSide(item, side));
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => e.stopPropagation());

    const unit = document.createElement('span');
    unit.className = 'sm-unit-btn selected';
    unit.textContent = 'm';

    const aceptar = document.createElement('button');
    aceptar.type = 'button';
    aceptar.className = 'tol-input-aceptar';
    aceptar.textContent = 'Aceptar';
    aceptar.addEventListener('click', (e) => e.stopPropagation());

    const commit = () => {
        setToleranceSide(item, side, input.value);
        syncTolerancePanel(item);
        guardarCambios(item);
        box.remove();
    };
    aceptar.addEventListener('click', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commit();
        }
    });

    row.append(input, unit);
    box.append(caption, row, aceptar);
    document.body.appendChild(box);

    const rect = labelEl.getBoundingClientRect();
    const margen = 8;
    box.style.left = `${Math.min(rect.right + margen, window.innerWidth - box.offsetWidth - margen)}px`;
    const espacioAbajo = window.innerHeight - rect.bottom;
    const espacioArriba = rect.top;
    const top = espacioAbajo >= box.offsetHeight || espacioAbajo >= espacioArriba
        ? rect.bottom + margen
        : rect.top - box.offsetHeight - margen;
    box.style.top = `${Math.max(margen, top)}px`;

    input.focus();
    input.select();
}

export function syncEdgePanel(item) {
    const isEditable = !!item && !isOpening(item) && item.classList.contains('furniture');
    document.getElementById('edge-manager').style.display = isEditable ? 'flex' : 'none';
    if (!isEditable) return;

    const toggler = document.getElementById('edge-toggler');
    ensureLSideControls(item);
    getEdgeSides(item).forEach((side) => {
        const on = hasEdge(item, side);
        toggler.classList.toggle(`on-${side}`, on);
    });
    document.querySelectorAll('.edge-switch').forEach((switchEl) => {
        switchEl.classList.toggle('on', hasEdge(item, switchEl.dataset.edge));
    });
    syncShapePreviews(item);
}

document.getElementById('edge-rotor').addEventListener('click', (event) => {
    const control = event.target.closest('.edge-switch');
    if (!control) return;
    const item = getSelectedObject();
    if (!item || isOpening(item)) return;
    const side = control.dataset.edge;
    setObjectEdge(item, side, !hasEdge(item, side));
    syncEdgePanel(item);
    guardarCambios(item);
});

export function clearOpeningOverlay() {
    openingLayer.replaceChildren();
}

export function createOpeningMeasureInput(item, side) {
    const wrapper = document.createElement('div');
    wrapper.className = 'opening-label opening-measure-input';
    wrapper.style.zIndex = '1';
    wrapper.dataset.targetId = item.id;
    wrapper.dataset.side = side;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0.1';
    input.step = '0.1';
    input.disabled = isItemLocked(item);
    input.dataset.side = side;
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('pointerdown', (event) => event.stopPropagation());
    input.addEventListener('change', () => commitOpeningMargin(item, side, input.value));

    const unit = document.createElement('span');
    unit.textContent = 'm';

    wrapper.append(input, unit);
    openingLayer.appendChild(wrapper);
    return wrapper;
}

export function commitOpeningMargin(item, side, rawValue) {
    const value = Number(rawValue);
    if (!item.isConnected || isItemLocked(item) || !Number.isFinite(value) || value <= 0) return;

    const marginPx = value * metro;
    const wallLength = getOpeningWallLength(item);

    if (side === 'left') {
        item.dataset.offset = String(clampOpeningOffset(item, snapOpeningOffset(marginPx, wallLength)));
    } else {
        const width = getOpeningWidth(item);
        item.dataset.offset = String(clampOpeningOffset(item, snapOpeningOffset(wallLength - width - marginPx, wallLength)));
    }

    placeOpening(item);
    syncOpeningOverlay(item);
    syncSizeManager();
    guardarCambios(item);
}

export function syncOpeningOverlay(item) {
    clearOpeningOverlay();
    if (!isOpening(item) || !item.isConnected) return;

    const room = item.parentElement;
    const roomSize = getParentInnerSize(room);
    const roomWidth = roomSize.width;
    const roomHeight = roomSize.height;
    const width = getOpeningWidth(item);
    const offset = parseFloat(item.dataset.offset) || 0;
    const edge = item.dataset.edge || 'top';
    const horizontal = edge === 'top' || edge === 'bottom';
    const leftDistance = (offset / metro).toFixed(1);
    const rightDistance = ((horizontal ? roomWidth : roomHeight) - offset - width) / metro;
    const rightLabel = Number(rightDistance).toFixed(1);
    const normals = {
        top: [0, -1],
        right: [1, 0],
        bottom: [0, 1],
        left: [-1, 0],
    };
    const [normalX, normalY] = normals[edge] || normals.top;
    const radians = getRotation(room) * Math.PI / 180;
    const screenNormal = {
        x: normalX * Math.cos(radians) - normalY * Math.sin(radians),
        y: normalX * Math.sin(radians) + normalY * Math.cos(radians),
    };

    const firstLabel = createOpeningMeasureInput(item, 'left');
    const secondLabel = createOpeningMeasureInput(item, 'right');
    firstLabel.querySelector('input').value = leftDistance;
    secondLabel.querySelector('input').value = rightLabel;

    const startPoint = horizontal
        ? (edge === 'top' ? [0, 0] : [0, roomHeight])
        : (edge === 'left' ? [0, 0] : [roomWidth, 0]);
    const wallPoint = (distance, normalOffset = 0) => {
        const localX = startPoint[0] + (horizontal ? distance : 0);
        const localY = startPoint[1] + (horizontal ? 0 : distance);
        const screen = localToCanvas(room, localX, localY);
        return {
            x: screen.x + screenNormal.x * normalOffset,
            y: screen.y + screenNormal.y * normalOffset,
        };
    };

    const guides = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    guides.classList.add('opening-distance-guides');
    guides.setAttribute('aria-hidden', 'true');
    guides.style.position = 'absolute';
    guides.style.inset = '0';
    guides.style.width = '100%';
    guides.style.height = '100%';
    guides.style.overflow = 'visible';
    guides.style.pointerEvents = 'none';
    guides.style.zIndex = '0';

    const wallLength = horizontal ? roomWidth : roomHeight;
    const ranges = [[0, offset], [offset + width, wallLength]];
    ranges.forEach(([start, end]) => {
        if (end - start <= 0) return;
        const first = wallPoint(start, 16);
        const second = wallPoint(end, 16);
        const tangentX = second.x - first.x;
        const tangentY = second.y - first.y;
        const length = Math.hypot(tangentX, tangentY) || 1;
        const capX = (-tangentY / length) * 4;
        const capY = (tangentX / length) * 4;

        [[first, second],
            [{ x: first.x - capX, y: first.y - capY }, { x: first.x + capX, y: first.y + capY }],
            [{ x: second.x - capX, y: second.y - capY }, { x: second.x + capX, y: second.y + capY }],
        ].forEach(([from, to]) => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(from.x));
            line.setAttribute('y1', String(from.y));
            line.setAttribute('x2', String(to.x));
            line.setAttribute('y2', String(to.y));
            line.setAttribute('stroke', 'rgba(224, 224, 224, 0.7)');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '3 3');
            guides.appendChild(line);
        });
    });
    openingLayer.appendChild(guides);

    const placeLabel = (label, distance) => {
        const point = wallPoint(distance, 16);
        label.style.left = `${point.x}px`;
        label.style.top = `${point.y}px`;
    };
    placeLabel(firstLabel, offset / 2);
    placeLabel(secondLabel, offset + width + (rightDistance * metro) / 2);
}
