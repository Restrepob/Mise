// Herramientas activas y atajos de teclado
import { canvas, popup } from '../core/dom.js';
import { cancelDraft, isDrafting } from './draft.js';
import { setDragShift } from './drag.js';
import { redo, undo } from './history.js';
import { deleteLayer, handleMenuAction } from './layers.js';
import { endMeasurement } from './measure.js';
import { getSelectedObject, isOpening } from '../core/model.js';
import { guardarCambios } from './persistence.js';
import { alertapopup } from './popups.js';
import { switchActiveRoom } from './rooms.js';
import { applyRotation } from './rotation.js';
import { isGroupSelectionActive, rotateSelectionGroupBy } from './group-selection.js';
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

document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const editingField = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if (editingField) return;

    const item = getSelectedObject();
    if (!item || item.dataset.type === 'room') return;
    const layer = document.querySelector(`.layer-div[data-target-id="${item.id}"]`);
    if (!layer) return;

    const key = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    let action = null;

    if (event.key === 'F2' && !command && !event.altKey && !event.shiftKey) {
        action = 'rename';
    } else if (command && !event.altKey && !event.shiftKey && key === 'd') {
        action = 'duplicate';
    } else if (command && event.shiftKey && !event.altKey && key === 'h') {
        action = 'hide';
    } else if (command && event.shiftKey && !event.altKey && key === 'l') {
        action = 'lock';
    } else if (event.key === 'Delete' && !command && !event.altKey && !event.shiftKey) {
        action = 'delete';
    }

    if (!action) return;
    event.preventDefault();
    handleMenuAction(action, layer);
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
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // Las flechas quedan libres para el movimiento fino del objeto. El cambio
    // de room usa corchetes, estilo Linear, y no compite con el nudge.
    if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        switchActiveRoom(event.key === ']' ? 1 : -1);
    }
});

document.addEventListener('keydown', (event) => {
    if (event.target.matches?.('input, textarea, select, [contenteditable]')) return;
    if (event.key.toLowerCase() !== 'r') return;
    // Shift + R gira antihorario; Shift + Alt + R gira horario. Ctrl/Cmd quedan
    // libres: Ctrl + R recarga el navegador y se pulsaba por accidente. Sin
    // modificador R es la herramienta de medicion.
    if (!event.shiftKey || event.ctrlKey || event.metaKey) return;

    if (isGroupSelectionActive()) {
        event.preventDefault();
        rotateSelectionGroupBy(event.altKey ? 90 : -90);
        return;
    }

    const item = getSelectedObject();
    if (!item || isOpening(item)) return;

    event.preventDefault();
    applyRotation(item, getRotation(item) + (event.altKey ? 90 : -90));
    guardarCambios(item);
});

document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

    const key = event.key.toLowerCase();
    const isUndo = key === 'z' && !event.shiftKey;
    const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
    if (!isUndo && !isRedo) return;

    const editingField = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
    // En el panel del objeto seleccionado Ctrl+Z/Y deshace la escena: despues
    // de editar medidas o el nombre el foco suele quedar ahi, y el undo nativo
    // solo cambiaria el texto del campo (o lo dejaria sin efecto aparente).
    const sizePanelField = editingField ? editingField.closest('.size-manager') : null;
    if (editingField && !sizePanelField) return;

    event.preventDefault();
    if (sizePanelField) {
        // Se suelta el campo para que la lectura del panel se refresque con el
        // estado restaurado y no quede el texto viejo seleccionado.
        editingField.blur();
        window.getSelection()?.removeAllRanges();
    }

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
