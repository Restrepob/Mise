// Historial undo/redo
import { objectLayers, roomLayers, scene } from '../core/dom.js';
import { clearOpeningOverlay } from './door.js';
import { endMeasurement } from './measure.js';
import { getActiveRoom, getRooms } from '../core/model.js';
import { getItemState, guardar, rebuildScene } from './persistence.js';
import { syncRotationHandle } from './rotation.js';
import { clearGroupSelectionOverlay } from './group-selection.js';
import { clearSnapGuides } from './snapping.js';
import { HISTORY_COMMIT_DELAY, HISTORY_LIMIT, roomViews, state, viewState } from '../core/state.js';
import { clampScale, setViewScroll, updateMinScaleForRoom } from './view.js';

export let historyUndoStack = [];

export let historyRedoStack = [];

export let historyCurrent = null;

export let historyCurrentJson = '';

export let historyTimer = null;

export function captureSnapshot() {
    const rooms = getRooms();
    const states = [];
    rooms.forEach((room) => {
        states.push(getItemState(room));
        room.querySelectorAll(':scope > .object').forEach((item) => {
            // Un borrador todavia no forma parte del documento: no entra en
            // los snapshots parciales mientras se esta configurando.
            if (item.dataset.draft === 'true') return;
            states.push(getItemState(item));
        });
    });
    return {
        states,
        activeRoomIndex: rooms.indexOf(getActiveRoom()),
    };
}

export function snapshotKey(snapshot) {
    return JSON.stringify(snapshot.states.map(({ viewScale, viewScrollX, viewScrollY, ...rest }) => rest));
}

export function resetHistory() {
    if (historyTimer) {
        clearTimeout(historyTimer);
        historyTimer = null;
    }
    historyUndoStack = [];
    historyRedoStack = [];
    historyCurrent = captureSnapshot();
    historyCurrentJson = snapshotKey(historyCurrent);
}

export function commitHistory() {
    if (historyTimer) {
        clearTimeout(historyTimer);
        historyTimer = null;
    }
    if (state.historySuspended || !historyCurrent) return;

    const next = captureSnapshot();
    const nextJson = snapshotKey(next);
    if (nextJson === historyCurrentJson) return;

    historyUndoStack.push(historyCurrent);
    if (historyUndoStack.length > HISTORY_LIMIT) historyUndoStack.shift();
    historyRedoStack = [];
    historyCurrent = next;
    historyCurrentJson = nextJson;
}

export function scheduleHistoryCommit() {
    if (state.historySuspended || !historyCurrent) return;
    if (historyTimer) clearTimeout(historyTimer);
    historyTimer = setTimeout(commitHistory, HISTORY_COMMIT_DELAY);
}

export function applySnapshot(snapshot) {
    if (!snapshot) return;

    const currentRooms = getRooms();
    const currentActive = getActiveRoom();
    const currentActiveIndex = currentActive ? currentRooms.indexOf(currentActive) : -1;
    const activeRoomIndex = currentActiveIndex >= 0 ? currentActiveIndex : snapshot.activeRoomIndex;
    const viewBefore = {
        scale: viewState.scale,
        scrollX: viewState.scrollX,
        scrollY: viewState.scrollY,
    };

    state.historySuspended = true;
    try {
        endMeasurement();
        document.querySelectorAll('.popup-menu-box, .tol-input-popup').forEach((el) => el.remove());
        scene.querySelectorAll(':scope > .object').forEach((item) => item.remove());
        roomLayers.replaceChildren();
        objectLayers.replaceChildren();
        clearOpeningOverlay();
        clearSnapGuides();
        syncRotationHandle(null);
        state.selectedLayerId = null;
        state.selectedObjectIds = [];
        clearGroupSelectionOverlay();
        rebuildScene(snapshot.states, activeRoomIndex);
    } finally {
        state.historySuspended = false;
    }

    // La vista no forma parte del historial: conservamos el encuadre actual.
    const active = getActiveRoom();
    updateMinScaleForRoom(active);
    viewState.scale = clampScale(viewBefore.scale);
    setViewScroll(viewBefore.scrollX, viewBefore.scrollY);
    if (active) {
        roomViews[active.id] = {
            scale: viewState.scale,
            scrollX: viewState.scrollX,
            scrollY: viewState.scrollY,
        };
        guardar(getItemState(active));
    }

    historyCurrent = captureSnapshot();
    historyCurrentJson = snapshotKey(historyCurrent);
}

export function undo() {
    if (state.historySuspended) return;
    commitHistory();
    if (!historyUndoStack.length) return;
    historyRedoStack.push(historyCurrent);
    applySnapshot(historyUndoStack.pop());
}

export function redo() {
    if (state.historySuspended) return;
    commitHistory();
    if (!historyRedoStack.length) return;
    historyUndoStack.push(historyCurrent);
    applySnapshot(historyRedoStack.pop());
}
