// Zoom, scroll y transformacion del scene
import { canvas, scene } from '../core/dom.js';
import { syncOpeningOverlay } from './door.js';
import { getActiveRoom, getSelectedObject } from '../core/model.js';
import { flushActiveView } from './persistence.js';
import { SCENE_PADDING, viewState } from '../core/state.js';

export function updateSceneSize(item) {
    if (!item.classList.contains('room')) return;

    const height = parseFloat(item.style.height) || item.offsetHeight;
    const width = parseFloat(item.style.width) || item.offsetWidth;
    scene.style.width = `${width + SCENE_PADDING}px`;
    scene.style.height = `${height + SCENE_PADDING}px`;
}

export function updateMinScaleForRoom(room) {
    if (!room || !room.classList.contains('room')) return;

    const width = parseFloat(room.style.width) || room.offsetWidth;
    const height = parseFloat(room.style.height) || room.offsetHeight;
    const fit = Math.min(
        canvas.clientWidth / (width + SCENE_PADDING),
        canvas.clientHeight / (height + SCENE_PADDING),
    );
    viewState.minScale = Math.min(viewState.baseMinScale, Math.max(0.05, fit));
}

export function clampScale(scale) {
    return Math.min(Math.max(scale, viewState.minScale), viewState.maxScale);
}

export function getCenteredViewScroll() {
    const sceneWidth = scene.offsetWidth || 0;
    const sceneHeight = scene.offsetHeight || 0;
    return {
        x: (sceneWidth * viewState.scale - canvas.clientWidth) / 2,
        y: (sceneHeight * viewState.scale - canvas.clientHeight) / 2,
    };
}

export function applySceneScale() {
    // translate + scale: el origen del scene puede quedar en cualquier punto,
    // incluso fuera de los límites del canvas. Ese es el espacio virtual.
    scene.style.transform =
        `translate(${-viewState.scrollX}px, ${-viewState.scrollY}px) scale(${viewState.scale})`;
}

export let viewPersistTimer = null;

export function setViewScroll(x, y) {
    viewState.scrollX = x;
    viewState.scrollY = y;
    applySceneScale();
    scheduleViewPersist();
}

export function scheduleViewPersist() {
    if (viewPersistTimer) clearTimeout(viewPersistTimer);
    viewPersistTimer = setTimeout(() => {
        viewPersistTimer = null;
        flushActiveView();
    }, 400);
}

export function pointerToScene(event) {
    const sceneRect = scene.getBoundingClientRect();
    return {
        x: (event.clientX - sceneRect.left) / viewState.scale,
        y: (event.clientY - sceneRect.top) / viewState.scale,
    };
}

export function zoomAtScreenPoint(screenX, screenY, nextScale) {
    const clamped = clampScale(nextScale);
    const scaleRatio = clamped / viewState.scale;

    const nextScrollX = (viewState.scrollX + screenX) * scaleRatio - screenX;
    const nextScrollY = (viewState.scrollY + screenY) * scaleRatio - screenY;

    viewState.scale = clamped;
    setViewScroll(nextScrollX, nextScrollY);
    syncOpeningOverlay(getSelectedObject());
}

export function zoomAtPoint(event, nextScale) {
    const rect = canvas.getBoundingClientRect();
    zoomAtScreenPoint(event.clientX - rect.left, event.clientY - rect.top, nextScale);
}

window.addEventListener('resize', () => {
    const room = getActiveRoom();
    if (!room) return;
    updateMinScaleForRoom(room);
    viewState.scale = clampScale(viewState.scale);
    applySceneScale();
});

applySceneScale();
