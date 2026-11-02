// Herramientas activas y atajos de teclado
import { canvas, popup } from '../core/dom.js';
import { cancelDraft, isDrafting } from './draft.js';
import { setDragShift } from './drag.js';
import { redo, undo } from './history.js';
import { deleteLayer } from './layers.js';
import { endMeasurement } from './measure.js';
import { getSelectedObject, isOpening } from '../core/model.js';
import { guardarCambios } from './persistence.js';
import { alertapopup } from './popups.js';
import { switchActiveRoom } from './rooms.js';
import { applyRotation } from './rotation.js';
import { toolState } from '../core/state.js';
import { getRotation } from '../core/units.js';

// Atajos que interrumpen la creacion. Escape y los atajos globales descartan
// el borrador; Ctrl+K lo descarta y deja que se abra el popup de formas.
function handleDraftShortcut(evento) {
    if (!isDrafting()) return false;

    if (evento.key === 'Escape') {
        evento.preventDefault();
        cancelDraft();
        return true;
    }

    const editingField = evento.target.closest?.('input, textarea, [contenteditable="true"]');
    if (evento.key === 'Delete' && !editingField) {
        evento.preventDefault();
        cancelDraft();
        return true;
    }

    if ((evento.ctrlKey || evento.metaKey) && !evento.altKey) {
        const key = evento.key.toLowerCase();
        if (key === 'z' || key === 'y') {
            evento.preventDefault();
            cancelDraft();
            return true;
        }
        if (key === 'k') {
            cancelDraft();
            return false;
        }
    }

    return false;
}

document.addEventListener('keydown', (evento) => {
    if (handleDraftShortcut(evento)) return;

    if (evento.ctrlKey && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        document.getElementById('add-object-btn').click();
        return;
    }

    const editingField = evento.target.closest?.('input, textarea, [contenteditable="true"]');
    if (evento.key === 'Delete' && !editingField) {
        const selectedObject = getSelectedObject();
        const selectedLayer = selectedObject
            ? document.querySelector(`.layer-div[data-target-id="${selectedObject.id}"]`)
            : null;

        if (selectedObject?.dataset.type === 'furniture' && selectedLayer) {
            evento.preventDefault();
            deleteLayer(selectedLayer);
            return;
        }
    }

    if (!alertapopup.classList.contains('hidden') && (evento.key === 'Enter' || evento.key === 'Escape')) {
        evento.preventDefault();
        alertapopup.classList.add('hidden');
        return;
    }

    if (evento.key === 'Escape' && !popup.classList.contains('hidden')) {
        evento.preventDefault();
        popup.classList.add('hidden');
    }

    if (evento.key === 'Escape' && toolState.active === 'measure') {
        evento.preventDefault();
        setActiveTool('select');
        return;
    }

    if (evento.key === 'Escape') {
        document.querySelector('.tol-input-popup')?.remove();
    }
});

export const toolButtons = document.querySelectorAll('.tool-btn');

export function setActiveTool(tool) {
    const nextTool = tool || 'select';
    if (toolState.active === 'measure' || nextTool === 'measure') endMeasurement();
    toolState.active = nextTool;
    canvas.classList.toggle('measure-active', nextTool === 'measure');
    toolButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tool === nextTool);
    });
}

toolButtons.forEach((button) => {
    button.addEventListener('click', () => {
        setActiveTool(button.dataset.tool);
    });
});

document.addEventListener('keydown', (event) => {
    if (event.target.matches?.('input, textarea, select, [contenteditable]')) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const shortcut = event.key.toLowerCase();
    const button = [...toolButtons].find((btn) => (btn.dataset.shortcut || '').toLowerCase() === shortcut);
    if (!button) return;
    setActiveTool(button.dataset.tool);
});

document.addEventListener('keydown', (event) => {
    if (event.target.matches?.('input, textarea, select, [contenteditable]')) return;
    if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        switchActiveRoom(event.key === 'ArrowRight' ? 1 : -1);
    }
});

document.addEventListener('keydown', (event) => {
    if (event.target.matches?.('input, textarea, select, [contenteditable]')) return;
    if (event.key.toLowerCase() !== 'r') return;
    // Alt + R gira antihorario; Alt + Shift + R gira horario. Ctrl/Cmd quedan
    // libres: Ctrl + R recarga el navegador y se pulsaba por accidente.
    if (!event.altKey || event.ctrlKey || event.metaKey) return;

    const item = getSelectedObject();
    if (!item || isOpening(item)) return;

    event.preventDefault();
    applyRotation(item, getRotation(item) + (event.shiftKey ? 90 : -90));
    guardarCambios(item);
});

document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;

    const key = event.key.toLowerCase();
    const isUndo = key === 'z' && !event.shiftKey;
    const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
    if (!isUndo && !isRedo) return;

    event.preventDefault();
    if (isUndo) {
        undo();
    } else {
        redo();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') setDragShift(true);
});

document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') setDragShift(false);
});
