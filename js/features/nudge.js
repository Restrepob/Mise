// Movimiento fino del objeto seleccionado con las flechas.
// Un paso base de 1 px de escena (unos 6.7 mm) permite ajustar sin pelear con
// el snap. Shift multiplica el paso x10 para desplazamientos mas grandes.
import { scene } from '../core/dom.js';
import { clampOpeningOffset, getOpeningWidth, getSelectedObject, isOpening } from '../core/model.js';
import { syncOpeningOverlay } from './door.js';
import { isDrafting } from './draft.js';
import { placeOpening } from './openings.js';
import { guardarCambios } from './persistence.js';
import { clearSnapGuides } from './snapping.js';
import { sceneDeltaToLocal } from './view.js';

export const NUDGE_STEP = 1;

export const NUDGE_STEP_COARSE = 10;

function nudgeFurniture(item, dx, dy) {
    const parent = item.offsetParent || scene;
    const local = sceneDeltaToLocal(parent, dx, dy);
    const left = (Number.parseFloat(item.style.left) || item.offsetLeft || 0) + local.x;
    const top = (Number.parseFloat(item.style.top) || item.offsetTop || 0) + local.y;

    item.style.left = `${left}px`;
    item.style.top = `${top}px`;
}

function nudgeOpening(item, dx, dy) {
    const parent = item.offsetParent || scene;
    const local = sceneDeltaToLocal(parent, dx, dy);
    const horizontal = item.dataset.edge !== 'left' && item.dataset.edge !== 'right';
    const delta = horizontal ? local.x : local.y;
    if (!delta) return;

    const width = getOpeningWidth(item);
    const next = clampOpeningOffset(item, (Number(item.dataset.offset) || 0) + delta, width);
    item.dataset.offset = String(next);
    placeOpening(item);
    syncOpeningOverlay(item);
}

function nudgeSelected(event) {
    if (isDrafting()) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return false;

    const item = getSelectedObject();
    if (!item) return false;

    const step = event.shiftKey ? NUDGE_STEP_COARSE : NUDGE_STEP;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return false;

    clearSnapGuides();
    if (isOpening(item)) nudgeOpening(item, dx, dy);
    else nudgeFurniture(item, dx, dy);
    guardarCambios(item);
    return true;
}

document.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight'
        && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

    if (nudgeSelected(event)) event.preventDefault();
});
