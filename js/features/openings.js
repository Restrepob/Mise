// Colocacion de puertas y ventanas
import { drawDoorArc } from './door.js';
import { clampOpeningOffset, getOpeningWallLength, getOpeningWidth, getParentInnerSize, isItemLocked, snapOpeningOffset } from '../core/model.js';
import { OPENING_DEPTH, OPENING_MIN, SNAP_SENS, viewState } from '../core/state.js';

export function placeOpening(item) {
    const room = item.parentElement;
    // Los hijos se posicionan respecto al padding-box de la room, no al borde externo.
    const roomSize = getParentInnerSize(room);
    const roomWidth = roomSize.width;
    const roomHeight = roomSize.height;
    const maxWidth = Math.max(OPENING_MIN, getOpeningWallLength(item));
    const width = Math.min(getOpeningWidth(item), maxWidth);
    const offset = clampOpeningOffset(item, Number(item.dataset.offset) || 0, width);
    const edge = item.dataset.edge || 'top';

    item.dataset.openingWidth = String(width);
    item.dataset.offset = String(offset);
    if (edge === 'right') {
        item.style.width = `${OPENING_DEPTH}px`;
        item.style.height = `${width}px`;
        item.style.left = `${roomWidth + OPENING_DEPTH / 2}px`;
        item.style.top = `${offset + width / 2}px`;
    } else if (edge === 'bottom') {
        item.style.width = `${width}px`;
        item.style.height = `${OPENING_DEPTH}px`;
        item.style.left = `${offset + width / 2}px`;
        item.style.top = `${roomHeight + OPENING_DEPTH / 2}px`;
    } else if (edge === 'left') {
        item.style.width = `${OPENING_DEPTH}px`;
        item.style.height = `${width}px`;
        item.style.left = `${-OPENING_DEPTH / 2}px`;
        item.style.top = `${offset + width / 2}px`;
    } else {
        item.style.width = `${width}px`;
        item.style.height = `${OPENING_DEPTH}px`;
        item.style.left = `${offset + width / 2}px`;
        item.style.top = `${-OPENING_DEPTH / 2}px`;
    }
    drawDoorArc(item);
}

export function dragOpeningAlongWall(item, localX, localY, disableSnap = false) {
    if (isItemLocked(item)) return;
    const room = item.parentElement;
    const roomSize = getParentInnerSize(room);
    const roomWidth = roomSize.width;
    const roomHeight = roomSize.height;
    const width = getOpeningWidth(item);
    const threshold = Math.max((SNAP_SENS * 2) / Math.max(viewState.scale, 0.001), OPENING_DEPTH);

    const walls = [
        { edge: 'top', distance: Math.abs(localY) },
        { edge: 'bottom', distance: Math.abs(localY - roomHeight) },
        { edge: 'left', distance: Math.abs(localX) },
        { edge: 'right', distance: Math.abs(localX - roomWidth) },
    ];
    const nearest = walls.reduce((best, wall) => (wall.distance < best.distance ? wall : best));

    if (nearest.distance <= threshold) {
        item.dataset.edge = nearest.edge;
    }

    const rawOffset = item.dataset.edge === 'right' || item.dataset.edge === 'left'
        ? localY - width / 2
        : localX - width / 2;
    const nextOffset = disableSnap
        ? rawOffset
        : snapOpeningOffset(rawOffset, getOpeningWallLength(item));
    item.dataset.offset = String(clampOpeningOffset(item, nextOffset, width));
    placeOpening(item);
}
