// Handle de rotacion
import { syncEdgeTogglerRotation, syncToleranceTogglerRotation } from './door.js';
import { getSelectedObject, isOpening } from '../core/model.js';
import { syncSizeManagerReadout } from './size-manager.js';
import { toolState } from '../core/state.js';
import { getRotation, normalizeDeg, snapNameRotation } from '../core/units.js';

export function applyRotation(item, deg) {
    if (!item || isOpening(item)) return;
    const rotation = normalizeDeg(deg);
    item.dataset.rotation = String(rotation);
    item.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
    item.querySelectorAll(':scope > .rotate-handle').forEach((handle) => {
        handle.style.transform = `translate(-50%, -50%) rotate(${-rotation}deg)`;
    });
    const nameEl = item.querySelector(':scope > .balance-name');
    if (nameEl) nameEl.style.transform = `rotate(${snapNameRotation(rotation)}deg)`;
    if (getSelectedObject() === item) {
        syncEdgeTogglerRotation(rotation);
        syncToleranceTogglerRotation(rotation);
        syncSizeManagerReadout();
    }
}

// Gira 90 grados según el clic:
// - Clic derecho (button === 2): sentido horario (+90)
// - Clic izquierdo (button === 0): sentido antihorario (-90)
export function rotateByClick(item, button) {
    if (!item || isOpening(item)) return;
    const clockwise = button === 2 || button === true;
    const turn = clockwise ? 90 : -90;
    applyRotation(item, getRotation(item) + turn);
}

export const ROTATE_HANDLE_SVG_FREE = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
        <path d="M204-318q-22-38-33-78t-11-82q0-134 93-228t227-94h7l-64-64 56-56 160 160-160 160-56-56 64-64h-7q-100 0-170 70.5T240-478q0 26 6 51t18 49l-60 60ZM481-40 321-200l160-160 56 56-64 64h7q100 0 170-70.5T720-482q0-26-6-51t-18-49l60-60q22 38 33 78t11 82q0 134-93 228t-227 94h-7l64 64-56 56Z"/>
    </svg>
`;

export const ROTATE_DRAG_THRESHOLD = 5;

export function syncRotationHandle(item) {
    document.querySelectorAll('.rotate-handle').forEach((handle) => {
        if (!item || handle.parentElement !== item) handle.remove();
    });

    if (!item || isOpening(item)) return;

    let handle = item.querySelector(':scope > .rotate-handle');
    if (!handle) {
        handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'rotate-handle';
        handle.setAttribute('aria-label', 'Girar objeto: arrastra para rotar libre, clic izquierdo/derecho para girar 90 grados');
        handle.innerHTML = ROTATE_HANDLE_SVG_FREE;
        handle.addEventListener('pointerdown', startRotationDrag);
        handle.addEventListener('pointerup', finishRotationClick);
        handle.addEventListener('contextmenu', (event) => event.preventDefault());
        item.appendChild(handle);
    }

    handle.style.transform = `translate(-50%, -50%) rotate(${-getRotation(item)}deg)`;
}

export function startRotationDrag(event) {
    if (event.button !== 0 && event.button !== 2) return;

    // Con Alt, el clic sobre el handle sigue la misma regla que el resto del
    // objeto (giro de 90 grados: horario con clic derecho, antihorario con clic
    // izquierdo) y no inicia arrastre.
    if (event.altKey) return;

    event.stopPropagation();
    event.preventDefault();
    const item = event.currentTarget.parentElement;
    const rect = item.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    toolState.rotateDrag = {
        item,
        pointerId: event.pointerId,
        center,
        startX: event.clientX,
        startY: event.clientY,
        startAngle: Math.atan2(event.clientY - center.y, event.clientX - center.x),
        base: getRotation(item),
        button: event.button,
        dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
}

export function finishRotationClick(event) {
    const drag = toolState.rotateDrag;
    if (!drag || drag.pointerId !== event.pointerId || drag.dragging) return;

    const turn = drag.button === 2 ? 90 : -90;
    applyRotation(drag.item, getRotation(drag.item) + turn);
}
