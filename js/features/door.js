// Puertas, edges, tolerancias y overlay de aperturas
import { canvas, openingLayer } from '../core/dom.js';
import { clampOpeningOffset, getOpeningWallLength, getOpeningWidth, getParentInnerSize, getSelectedObject, isOpening, snapOpeningOffset } from '../core/model.js';
import { placeOpening } from './openings.js';
import { guardarCambios } from './persistence.js';
import { syncSizeManager } from './size-manager.js';
import { EDGE_SIDES, TOLERANCE_MAX_M, TOLERANCE_SIDES, metro, viewState } from '../core/state.js';
import { getRotation } from '../core/units.js';

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

export function setObjectEdge(item, side, on) {
    if (!item || isOpening(item)) return;
    let list = (item.dataset.edges || '').split(' ').filter(Boolean);
    if (on && !list.includes(side)) list.push(side);
    if (!on) list = list.filter((item) => item !== side);
    item.dataset.edges = list.filter((item) => EDGE_SIDES.includes(item)).join(' ');
    renderEdges(item);
}

export function renderEdges(item) {
    item.querySelector('.edges-layer')?.remove();
    if (!item || !item.classList.contains('furniture')) return;
    const sides = (item.dataset.edges || '').split(' ').filter((side) => EDGE_SIDES.includes(side));
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

export function syncEdgeTogglerRotation(rotation) {
    const toggler = document.getElementById('edge-toggler');
    if (!toggler) return;
    toggler.style.transform = rotation > 0 ? `rotate(${rotation}deg)` : '';
}

export function getToleranceSide(item, side) {
    if (!item) return 0;
    const list = (item.dataset.tolerance || '').split(' ').map(Number);
    const index = TOLERANCE_SIDES.indexOf(side);
    return Number.isFinite(list[index]) ? Math.max(0, list[index] || 0) : 0;
}

export function setToleranceSide(item, side, metros) {
    if (!item || isOpening(item)) return;
    const list = TOLERANCE_SIDES.map((s) => getToleranceSide(item, s));
    const value = Math.min(Math.max(0, Number(metros) || 0), TOLERANCE_MAX_M);
    list[TOLERANCE_SIDES.indexOf(side)] = Number(value.toFixed(2));
    item.dataset.tolerance = list.map((v) => v || 0).join(' ');
    renderTolerance(item);
}

export function renderTolerance(item) {
    item.querySelector('.tolerance-layer')?.remove();
    if (!item || !item.classList.contains('furniture')) return;

    const layer = document.createElement('div');
    layer.className = 'tolerance-layer';
    const fill = getComputedStyle(item).backgroundColor;
    if (/^rgb|^hsl|^#/.test(fill) && fill !== 'rgba(0, 0, 0, 0)') {
        layer.style.setProperty('--color-el', fill);
    }
    TOLERANCE_SIDES.forEach((side) => {
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

export function syncToleranceTogglerRotation(rotation) {
    const toggler = document.getElementById('tolerance-toggler');
    if (!toggler) return;
    toggler.style.transform = rotation > 0 ? `rotate(${rotation}deg)` : '';
    const sideDeg = { top: -90, right: 0, bottom: 90, left: 180 };
    toggler.querySelectorAll('.tol-label').forEach((label) => {
        const angle = sideDeg[label.dataset.tolSide] + rotation;
        const onBottom = Math.sin((angle * Math.PI) / 180) > 0;
        label.style.setProperty('--tol-label-rotate', `${onBottom ? -rotation : 0}deg`);
    });
}

export function syncTolerancePanel(item) {
    const editable = !!item && !isOpening(item) && item.classList.contains('furniture');
    document.getElementById('tolerance-manager').style.display = editable ? 'flex' : 'none';
    if (!editable) return;

    syncToleranceTogglerRotation(getRotation(item));
    TOLERANCE_SIDES.forEach((side) => {
        const label = document.querySelector(`.tol-label[data-tol-side="${side}"]`);
        if (label) label.textContent = getToleranceSide(item, side);
    });
}

TOLERANCE_SIDES.forEach((side) => {
    document.querySelector(`.tol-label[data-tol-side="${side}"]`).addEventListener('click', (event) => {
        event.stopPropagation();
        const item = getSelectedObject();
        if (!item || !item.classList.contains('furniture')) return;
        openToleranceInput(item, side, event.currentTarget);
    });
});

export function openToleranceInput(item, side, labelEl) {
    document.querySelector('.tol-input-popup')?.remove();

    const box = document.createElement('div');
    box.classList.add('tol-input-popup');

    const caption = document.createElement('span');
    caption.className = 'tol-input-caption';
    caption.textContent = `Tolerancia ${side} (m)`;

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
    syncEdgeTogglerRotation(getRotation(item));
    EDGE_SIDES.forEach((side) => {
        const on = hasEdge(item, side);
        toggler.classList.toggle(`on-${side}`, on);
    });
    document.querySelectorAll('.edge-switch').forEach((switchEl) => {
        switchEl.classList.toggle('on', hasEdge(item, switchEl.dataset.edge));
    });
}

EDGE_SIDES.forEach((side) => {
    document.querySelector(`.edge-switch[data-edge="${side}"]`).addEventListener('click', () => {
        const item = getSelectedObject();
        if (!item || isOpening(item)) return;
        setObjectEdge(item, side, !hasEdge(item, side));
        syncEdgePanel(item);
        guardarCambios(item);
    });
});

export function clearOpeningOverlay() {
    openingLayer.replaceChildren();
}

export function createOpeningMeasureInput(item, side) {
    const wrapper = document.createElement('div');
    wrapper.className = 'opening-label opening-measure-input';
    wrapper.dataset.targetId = item.id;
    wrapper.dataset.side = side;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0.1';
    input.step = '0.1';
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
    if (!item.isConnected || !Number.isFinite(value) || value <= 0) return;

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
    const roomRect = room.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const roomSize = getParentInnerSize(room);
    const roomWidth = roomSize.width;
    const roomHeight = roomSize.height;
    const width = getOpeningWidth(item);
    const offset = parseFloat(item.dataset.offset) || 0;
    const edge = item.dataset.edge || 'top';
    const scale = viewState.scale;
    const horizontal = edge === 'top' || edge === 'bottom';
    const wallBaseX = roomRect.left - canvasRect.left + room.clientLeft * scale;
    const wallBaseY = roomRect.top - canvasRect.top + room.clientTop * scale;
    const wallPosition = horizontal
        ? (edge === 'bottom' ? wallBaseY + roomHeight * scale : wallBaseY)
        : (edge === 'right' ? wallBaseX + roomWidth * scale : wallBaseX);
    const first = horizontal
        ? wallBaseX + offset * scale
        : wallBaseY + offset * scale;
    const second = horizontal
        ? wallBaseX + (offset + width) * scale
        : wallBaseY + (offset + width) * scale;
    const leftDistance = (offset / metro).toFixed(1);
    const rightDistance = ((horizontal ? roomWidth : roomHeight) - offset - width) / metro;
    const rightLabel = Number(rightDistance).toFixed(1);
    const outside = edge === 'top' ? -16 : edge === 'bottom' ? 16 : edge === 'left' ? -16 : 16;

    const firstLabel = createOpeningMeasureInput(item, 'left');
    const secondLabel = createOpeningMeasureInput(item, 'right');
    firstLabel.querySelector('input').value = leftDistance;
    secondLabel.querySelector('input').value = rightLabel;

    if (horizontal) {
        firstLabel.style.left = `${(first + wallBaseX) / 2}px`;
        secondLabel.style.left = `${(second + wallBaseX + roomWidth * scale) / 2}px`;
        firstLabel.style.top = `${wallPosition + outside}px`;
        secondLabel.style.top = `${wallPosition + outside}px`;
    } else {
        firstLabel.style.left = `${wallPosition + outside}px`;
        secondLabel.style.left = `${wallPosition + outside}px`;
        firstLabel.style.top = `${(first + wallBaseY) / 2}px`;
        secondLabel.style.top = `${(second + wallBaseY + roomHeight * scale) / 2}px`;
    }
}
