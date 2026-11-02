// Borrador de creacion: la figura existe en el canvas pero no en el documento.
// Vive centrada en su room, se puede dimensionar en vivo y solo se guarda (y
// entra al historial) cuando se fijan las dos medidas o se hace clic afuera.
import { smAlto, smAncho } from '../core/dom.js';
import { state } from '../core/state.js';
import { guardarCambios } from './persistence.js';

const SETTLE_MS = 300;

export const draftState = {
    active: false,
    itemId: '',
    roomId: '',
    confirmed: { height: false, width: false },
};

export function isDrafting() {
    return draftState.active;
}

export function getDraftItem() {
    return draftState.active ? document.getElementById(draftState.itemId) : null;
}

export function getDraftRoomId() {
    return draftState.roomId;
}

export function isDraftItem(item) {
    return !!item && item.dataset.draft === 'true';
}

function emit(phase) {
    document.dispatchEvent(new CustomEvent('draft:change', { detail: { phase } }));
}

function draftLayerRow(id) {
    return document.querySelector(`.layer-div[data-target-id="${id}"]`);
}

function dimensionInput(dimension) {
    return dimension === 'height' ? smAlto : smAncho;
}

function isDimensionValid(dimension) {
    const value = Number(dimensionInput(dimension).value);
    return Number.isFinite(value) && value > 0;
}

function focusInput(input) {
    input.focus();
    input.select();
}

function shakeInput(input) {
    input.classList.remove('draft-shake');
    // Reinicia la animacion aunque ya se haya sacudido con el mismo valor.
    void input.offsetWidth;
    input.classList.add('draft-shake');
}

export function shakeDraftInput(input) {
    if (input) shakeInput(input);
}

function focusInvalidDraftInput() {
    const input = !isDimensionValid('height')
        ? smAlto
        : (!isDimensionValid('width') ? smAncho : null);
    if (!input) return;
    focusInput(input);
    shakeInput(input);
}

function focusPendingDraftInput() {
    focusInput(draftState.confirmed.height ? smAncho : smAlto);
}

// Cuando el clic afuera no puede fijar la figura (medida en 0) hay que
// bloquear tambien el click/contextmenu que viene detras del pointerdown.
function swallowNextEvent(type) {
    const swallow = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };
    const options = { capture: true, once: true };
    document.addEventListener(type, swallow, options);
    window.setTimeout(() => document.removeEventListener(type, swallow, true), 400);
}

export function beginDraft(item) {
    if (!item) return false;
    if (draftState.active) cancelDraft();

    draftState.active = true;
    draftState.itemId = item.id;
    draftState.roomId = item.dataset.roomId || item.parentElement?.id || '';
    draftState.confirmed = { height: false, width: false };

    item.dataset.draft = 'true';
    item.classList.add('draft');
    draftLayerRow(item.id)?.classList.add('layer-draft');

    emit('begin');
    return true;
}

// Se llama en cada tecla valida: si la medida ya estaba confirmada, vuelve a
// quedar pendiente porque el valor cambio.
export function markDimensionEdited(dimension) {
    if (!draftState.active) return;
    draftState.confirmed[dimension] = false;
    emit('edit');
}

// 'invalid'  -> el valor no sirve, no se confirma
// 'pending'  -> quedo confirmada pero falta la otra medida
// 'done'     -> se confirmaron las dos y la figura ya se fijo
export function confirmDraftDimension(dimension) {
    if (!draftState.active) return 'invalid';
    if (!isDimensionValid(dimension)) return 'invalid';

    draftState.confirmed[dimension] = true;

    if (draftState.confirmed.height && draftState.confirmed.width) {
        return finalizeDraft() ? 'done' : 'invalid';
    }

    emit('dimension');
    return 'pending';
}

// Fija la figura con las medidas que tenga en ese momento. Devuelve false si
// alguna medida es 0/invalida: en ese caso la creacion no se completa.
export function tryFinalizeDraft() {
    if (!draftState.active) return false;
    if (!isDimensionValid('height') || !isDimensionValid('width')) {
        focusInvalidDraftInput();
        return false;
    }
    return finalizeDraft();
}

function finalizeDraft() {
    const item = getDraftItem();
    if (!item) {
        cancelDraft();
        return false;
    }

    draftState.active = false;
    draftState.itemId = '';
    draftState.roomId = '';
    draftState.confirmed = { height: false, width: false };

    delete item.dataset.draft;
    item.classList.remove('draft');
    item.classList.add('draft-settling');
    draftLayerRow(item.id)?.classList.remove('layer-draft');
    window.setTimeout(() => item.classList.remove('draft-settling'), SETTLE_MS);

    // Recien ahora entra en localStorage y en el historial: un solo paso de undo.
    guardarCambios(item);
    emit('commit');
    return true;
}

export function cancelDraft() {
    if (!draftState.active) return false;

    const item = getDraftItem();
    const id = draftState.itemId;
    draftState.active = false;
    draftState.itemId = '';
    draftState.roomId = '';
    draftState.confirmed = { height: false, width: false };

    const layer = draftLayerRow(id);
    layer?.remove();
    item?.remove();
    item?.classList.remove('selected');
    if (state.selectedLayerId === id) state.selectedLayerId = null;

    emit('cancel');
    return true;
}

// Un clic fuera de la figura y del panel de medidas la fija con los valores
// actuales. Si alguna medida es 0 no se crea y el clic no hace nada mas.
document.addEventListener('pointerdown', (event) => {
    if (!draftState.active) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const draftItem = target.closest('.object.draft');
    if (draftItem) {
        // Mientras se arrastra, la figura deja de flotar: el ancla del arrastre
        // se mide con su posicion real (la animacion mueve el rect).
        draftItem.classList.add('is-dragging');
        const stopFloating = () => {
            draftItem.classList.remove('is-dragging');
            document.removeEventListener('pointerup', stopFloating, true);
            document.removeEventListener('pointercancel', stopFloating, true);
        };
        document.addEventListener('pointerup', stopFloating, true);
        document.addEventListener('pointercancel', stopFloating, true);
        return;
    }
    if (target.closest('.size-manager')) return;
    if (target.closest('#popupAddObject')) return;

    // Otra creacion: se descarta el borrador y sigue el flujo normal.
    if (target.closest('#add-object-btn, #create-room-btn')) {
        cancelDraft();
        return;
    }

    // La fila del propio borrador solo devuelve el foco a la medida pendiente.
    const row = target.closest('.layer-div');
    if (row && row.dataset.targetId === draftState.itemId) {
        focusPendingDraftInput();
        return;
    }

    // Cambiar de room cancela; el borrador pertenece a la room donde nacio.
    if (target.closest('.room-switcher')) {
        cancelDraft();
        return;
    }
    if (row && (row.dataset.type === 'room' || (row.dataset.roomId && row.dataset.roomId !== draftState.roomId))) {
        cancelDraft();
        return;
    }

    if (!tryFinalizeDraft()) {
        event.preventDefault();
        event.stopPropagation();
        swallowNextEvent('click');
        swallowNextEvent('contextmenu');
    }
}, true);
