import { getItemBoxSize } from '../core/model.js';
import { guardarCambios } from './persistence.js';
import { applyRotation, ROTATE_HANDLE_SVG_FREE } from './rotation.js';
import { state } from '../core/state.js';
import { getRotation, snapRotation } from '../core/units.js';

let overlay = null;
let rotatePointer = null;

export function getGroupSelection() {
    return (state.selectedObjectIds || [])
        .map((id) => document.getElementById(id))
        .filter((item) => item?.isConnected && item.dataset.type === 'furniture');
}

export function isGroupSelectionActive() {
    return getGroupSelection().length > 1;
}

function getBounds(items) {
    const bounds = items.map((item) => {
        const x = Number.parseFloat(item.style.left) || 0;
        const y = Number.parseFloat(item.style.top) || 0;
        const { width, height } = getItemBoxSize(item);
        return { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 };
    });
    return {
        left: Math.min(...bounds.map((box) => box.left)),
        right: Math.max(...bounds.map((box) => box.right)),
        top: Math.min(...bounds.map((box) => box.top)),
        bottom: Math.max(...bounds.map((box) => box.bottom)),
    };
}

export function clearGroupSelectionOverlay() {
    overlay?.remove();
    overlay = null;
}

export function syncGroupSelectionOverlay() {
    const items = getGroupSelection();
    const parent = items[0]?.parentElement;
    if (items.length < 2 || !parent || items.some((item) => item.parentElement !== parent)) {
        clearGroupSelectionOverlay();
        return;
    }

    if (!overlay || overlay.parentElement !== parent) {
        clearGroupSelectionOverlay();
        overlay = document.createElement('div');
        overlay.className = 'selection-group-box';
        overlay.setAttribute('aria-hidden', 'true');
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'selection-group-rotate';
        handle.setAttribute('aria-label', 'Girar el grupo: arrastra para rotar o haz clic para girar 90 grados');
        handle.innerHTML = ROTATE_HANDLE_SVG_FREE;
        handle.addEventListener('pointerdown', startGroupRotation);
        handle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        handle.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            rotateSelectionGroupBy(-90);
        });
        handle.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        overlay.appendChild(handle);
        parent.appendChild(overlay);
    }

    const bounds = getBounds(items);
    overlay.style.left = `${(bounds.left + bounds.right) / 2}px`;
    overlay.style.top = `${(bounds.top + bounds.bottom) / 2}px`;
    overlay.style.width = `${Math.max(1, bounds.right - bounds.left)}px`;
    overlay.style.height = `${Math.max(1, bounds.bottom - bounds.top)}px`;
}

function groupCenterLocal(items) {
    const bounds = getBounds(items);
    return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
}

function rotateGroup(items, snapshots, center, delta) {
    const radians = delta * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    items.forEach((item, index) => {
        const snapshot = snapshots[index];
        const dx = snapshot.x - center.x;
        const dy = snapshot.y - center.y;
        item.style.left = `${center.x + dx * cos - dy * sin}px`;
        item.style.top = `${center.y + dx * sin + dy * cos}px`;
        applyRotation(item, snapshot.rotation + delta);
    });
    syncGroupSelectionOverlay();
}

function startGroupRotation(event) {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    const items = getGroupSelection();
    if (items.length < 2) return;

    const center = groupCenterLocal(items);
    const rect = overlay.getBoundingClientRect();
    const snapshots = items.map((item) => ({
        x: Number.parseFloat(item.style.left) || 0,
        y: Number.parseFloat(item.style.top) || 0,
        rotation: getRotation(item),
    }));
    rotatePointer = {
        pointerId: event.pointerId,
        button: event.button,
        items,
        snapshots,
        center,
        centerScreen: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        start: { x: event.clientX, y: event.clientY },
        startAngle: Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)),
        dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.addEventListener('pointermove', moveGroupRotation);
    document.addEventListener('pointerup', finishGroupRotation);
    document.addEventListener('pointercancel', finishGroupRotation);
}

function moveGroupRotation(event) {
    const drag = rotatePointer;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y);
    if (!drag.dragging && distance < 5) return;
    drag.dragging = true;
    const angle = Math.atan2(event.clientY - drag.centerScreen.y, event.clientX - drag.centerScreen.x);
    let delta = (angle - drag.startAngle) * 180 / Math.PI;
    delta = ((delta + 180) % 360 + 360) % 360 - 180;
    delta = snapRotation(delta);
    if (delta > 180) delta -= 360;
    rotateGroup(drag.items, drag.snapshots, drag.center, delta);
}

function finishGroupRotation(event) {
    const drag = rotatePointer;
    if (!drag || drag.pointerId !== event.pointerId) return;
    document.removeEventListener('pointermove', moveGroupRotation);
    document.removeEventListener('pointerup', finishGroupRotation);
    document.removeEventListener('pointercancel', finishGroupRotation);

    if (!drag.dragging) {
        const delta = drag.button === 2 ? 90 : -90;
        rotateGroup(drag.items, drag.snapshots, drag.center, delta);
    }
    drag.items.forEach(guardarCambios);
    rotatePointer = null;
    syncGroupSelectionOverlay();
}

export function rotateSelectionGroupBy(delta) {
    const items = getGroupSelection();
    if (items.length < 2) return false;
    rotateGroup(
        items,
        items.map((item) => ({
            x: Number.parseFloat(item.style.left) || 0,
            y: Number.parseFloat(item.style.top) || 0,
            rotation: getRotation(item),
        })),
        groupCenterLocal(items),
        delta,
    );
    items.forEach(guardarCambios);
    return true;
}

