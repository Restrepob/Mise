// Modelo de items: rooms, muebles y aperturas
import { scene } from './dom.js';
import { getGridStep } from '../features/snapping.js';
import { isLShape } from '../features/l-shape.js';
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
