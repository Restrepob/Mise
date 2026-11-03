// Panel de tamanio y rotacion
import { smAlto, smAncho, smNombre, smRadius, smRotate90, smRotation } from '../core/dom.js';
import { syncDoorPanel, syncEdgePanel, syncOpeningOverlay, syncTolerancePanel } from './door.js';
import { getActiveRoom, getOpeningWallLength, getSelectedObject, isOpening, setItemName } from '../core/model.js';
import { confirmDraftDimension, confirmDraftName, draftState, getNextDraftInput, isDrafting, markDimensionEdited, markDraftNameEdited, shakeDraftInput } from './draft.js';
import { placeOpening } from './openings.js';
import { guardarCambios } from './persistence.js';
import { syncRoomSwitcher } from './rooms.js';
import { applyRotation, syncRotationHandle } from './rotation.js';
import { MARGEN_ESQUINA, OPENING_MIN, viewState } from '../core/state.js';
import { getItemLayout, getRotation, isAxesSwapped, smFromPx, smToPx, snapNameRotation } from '../core/units.js';
import { applySceneScale, clampScale, updateMinScaleForRoom, updateSceneSize } from './view.js';

export let smAlMetric = 'm';

export let smAnMetric = 'm';

const smRadiusValue = document.getElementById('sm-radius-value');
const smRotationValue = document.getElementById('sm-rotation-value');
const UNIT_SYSTEM_KEY = 'mise-unit-system';
const UNIT_IDS = {
    height: ['sm-alto-m', 'sm-alto-cm', 'sm-alto-in', 'sm-alto-ft'],
    width: ['sm-ancho-m', 'sm-ancho-cm', 'sm-ancho-in', 'sm-ancho-ft'],
};

function syncRadiusControls() {
    const item = getSelectedObject();
    const editable = !!item && !isOpening(item);
    if (!editable) {
        if (smRadiusValue) smRadiusValue.textContent = '0';
        return;
    }

    const value = Number.parseFloat(smRadius.value) || 0;
    if (smRadiusValue) {
        const isRelative = (item.style.borderRadius || '').includes('%');
        smRadiusValue.textContent = value > 0 ? `${Math.round(value)}${isRelative ? '%' : 'px'}` : '0';
    }
}

function syncRotationControls() {
    const item = getSelectedObject();
    const editable = !!item && !isOpening(item);
    if (!editable) {
        if (smRotationValue) smRotationValue.textContent = '—';
        return;
    }

    const value = Number.parseFloat(smRotation.value) || 0;
    if (smRotationValue) smRotationValue.textContent = `${Math.round(value)}°`;
}

function setDimensionUnit(buttonIds, input, metricState, nextUnit) {
    const item = getSelectedObject();
    const currentPixels = item
        ? getItemLayout(item)[input === smAlto ? 'height' : 'width']
        : null;

    metricState.value = nextUnit;
    buttonIds.forEach((id) => {
        document.getElementById(id).classList.toggle(
            'selected',
            document.getElementById(id).dataset.unit === nextUnit,
        );
    });

    if (Number.isFinite(currentPixels)) {
        input.value = smFromPx(currentPixels, nextUnit).toFixed(2);
    }
    if (currentDimHighlight) {
        setDimensionHighlight(currentDimHighlight);
    }
}

export function configureSizeUnitButtons(buttonIds, input, metricState) {
    buttonIds.forEach((buttonId) => {
        document.getElementById(buttonId).addEventListener('click', () => {
            const nextUnit = document.getElementById(buttonId).dataset.unit;
            setDimensionUnit(buttonIds, input, metricState, nextUnit);
        });
    });
}

export function setSizeManagerDisabled(disabled, item = null) {
    document.querySelectorAll('.size-manager .panel-body input, .size-manager .panel-body button').forEach((control) => {
        control.disabled = disabled;
    });

    if (!disabled && isOpening(item)) {
        smAlto.disabled = true;
        UNIT_IDS.height.forEach((id) => {
            document.getElementById(id).disabled = true;
        });
        smRadius.disabled = true;
    }
}

export function setOpeningPanelFields(item) {
    const opening = isOpening(item);
    ['sm-alto-field', 'sm-radius-field', 'sm-rotation-field'].forEach((id) => {
        document.getElementById(id).style.display = opening ? 'none' : '';
    });
}

export let currentDimHighlight = null;

function dimensionInput(dimension) {
    return dimension === 'height' ? smAlto : smAncho;
}

function buildDimensionHighlight(item, dimension, active) {
    const swapped = isAxesSwapped(item);
    const isLocalHeight = (dimension === 'height' && !swapped) || (dimension === 'width' && swapped);

    const layout = getItemLayout(item);
    const pixels = isLocalHeight ? (swapped ? layout.width : layout.height) : (swapped ? layout.height : layout.width);
    const unit = dimension === 'height' ? smAlMetric : smAnMetric;

    // Mientras se escribe, el campo del objeto es un espejo exacto del input
    // del sidebar: mismo texto crudo (sin redondear) e incluso vacio al borrar.
    const input = dimensionInput(dimension);
    const mirrorsInput = active && document.activeElement === input;
    const valueText = mirrorsInput
        ? (input.value ? `${input.value} ${unit}` : '')
        : `${smFromPx(pixels, unit).toFixed(2)} ${unit}`;

    const container = document.createElement('div');
    container.className = `dim-i-highlight ${isLocalHeight ? 'dim-i-highlight--v' : 'dim-i-highlight--h'}`
        + (isDrafting() ? ' dim-i-highlight--draft-active' : '')
        + (active ? ' dim-i-highlight--active' : '');

    const capStart = document.createElement('div');
    capStart.className = 'dim-i-cap';

    const lineBefore = document.createElement('div');
    lineBefore.className = 'dim-i-line';

    const badge = document.createElement('div');
    badge.className = 'dim-i-badge';
    badge.style.transform = `rotate(${snapNameRotation(getRotation(item))}deg)`;

    if (valueText) {
        const valueSpan = document.createElement('span');
        valueSpan.className = 'dim-i-value';
        valueSpan.textContent = valueText;
        badge.appendChild(valueSpan);
    } else {
        badge.style.display = 'none';
    }

    const lineAfter = document.createElement('div');
    lineAfter.className = 'dim-i-line';

    const capEnd = document.createElement('div');
    capEnd.className = 'dim-i-cap';

    container.append(capStart, lineBefore, badge, lineAfter, capEnd);
    return container;
}

function renderDimensionHighlights(dimensions, active = null) {
    document.querySelectorAll('.dim-i-highlight').forEach((el) => el.remove());

    const item = getSelectedObject();
    if (!item || isOpening(item)) return;

    dimensions.filter(Boolean).forEach((dimension) => {
        item.appendChild(buildDimensionHighlight(item, dimension, dimension === active));
    });
}

export function setDimensionHighlight(dimension) {
    currentDimHighlight = dimension;

    // Mientras hay borrador se muestran siempre las dos medidas; al editar una
    // de ellas se marca como activa.
    if (isDrafting()) {
        renderDimensionHighlights(['height', 'width'], dimension);
        return;
    }
    renderDimensionHighlights(dimension ? [dimension] : [], dimension);
}

export function focusSizeInputForEditing() {
    smAlto.focus();
    smAlto.select();
    setDimensionHighlight('height');
}

export function syncSizeManager() {
    const item = getSelectedObject();
    document.querySelector('.size-manager').classList.toggle('empty', !item);
    setSizeManagerDisabled(!item, item);
    setOpeningPanelFields(item);
    syncDoorPanel(item);
    syncEdgePanel(item);
    syncTolerancePanel(item);
    syncSizeManagerReadout();
    syncDraftUI();
    if (!item) {
        setDimensionHighlight(null);
    } else if (currentDimHighlight) {
        setDimensionHighlight(currentDimHighlight);
    }
}

export function syncDraftUI() {
    const drafting = isDrafting();
    document.querySelector('.size-manager')?.classList.toggle('is-draft', drafting);

    const fields = [
        [smAlto.closest('.question-box'), 'height'],
        [smAncho.closest('.question-box'), 'width'],
    ];
    fields.forEach(([box, dimension]) => {
        if (!box) return;
        box.classList.toggle('dim-pending', drafting && !draftState.confirmed[dimension]);
        box.classList.toggle('dim-confirmed', drafting && draftState.confirmed[dimension]);
    });

    // El nombre es el ultimo valor a fijar: se resalta cuando ya estan las
    // medidas y todavia falta confirmarlo.
    const nameIsNext = drafting
        && draftState.confirmed.height
        && draftState.confirmed.width
        && !draftState.confirmed.name;
    smNombre.classList.toggle('draft-name-pending', nameIsNext);
    smNombre.classList.toggle('draft-name-confirmed', drafting && draftState.confirmed.name);
}

export function syncSizeManagerReadout() {
    const item = getSelectedObject();
    if (!item) {
        smNombre.value = '';
        smAlto.value = '';
        smAncho.value = '';
        smRadius.value = '';
        smRotation.value = '';
        syncRadiusControls();
        syncRotationControls();
        return;
    }

    const { width, height } = getItemLayout(item);
    const layer = document.querySelector(`.layer-div[data-target-id="${item.id}"]`);
    smNombre.value = item.dataset.name || layer?.querySelector('.layer-content')?.textContent.trim() || '';
    smAlto.value = smFromPx(height, smAlMetric).toFixed(2);
    smAncho.value = smFromPx(width, smAnMetric).toFixed(2);
    smRadius.value = parseFloat(item.style.borderRadius) || 0;
    smRotation.value = isOpening(item) ? '' : Math.round(getRotation(item));
    syncRadiusControls();
    syncRotationControls();
}

export function applySizeDimension(input, unit, dimension) {
    const item = getSelectedObject();
    if (!item) return false;

    const value = Number(input.value);
    const valid = Number.isFinite(value) && value > 0;

    // El borrador vuelve a quedar pendiente apenas se toca la medida, incluso
    // si el campo se vacia.
    if (isDrafting()) markDimensionEdited(dimension);

    // Aunque el valor no sea valido hay que refrescar el campo del objeto para
    // que refleje el texto crudo del input (incluido el vacio).
    setDimensionHighlight(dimension);

    if (!valid) return false;
    if (isOpening(item) && dimension !== 'width') return false;

    if (isOpening(item)) {
        const maxWidth = Math.max(OPENING_MIN, getOpeningWallLength(item) - MARGEN_ESQUINA * 2);
        item.dataset.openingWidth = String(Math.min(Math.max(OPENING_MIN, smToPx(value, unit)), maxWidth));
        placeOpening(item);
        syncOpeningOverlay(item);
        guardarCambios(item);
        return true;
    }

    const swapped = isAxesSwapped(item);
    const localDimension = swapped
        ? (dimension === 'width' ? 'height' : 'width')
        : dimension;
    item.style[localDimension] = `${smToPx(value, unit)}px`;
    updateSceneSize(item);
    if (item === getActiveRoom()) {
        updateMinScaleForRoom(item);
        viewState.scale = clampScale(viewState.scale);
        applySceneScale();
    }
    // En un borrador el tamano se aplica en vivo pero no se guarda: la medida
    // vuelve a quedar pendiente hasta que se confirme con Enter o Tab.
    // El campo de medida del objeto se actualiza al mismo tiempo que el input
    // del sidebar, como si se escribiera sobre el objeto.
    setDimensionHighlight(dimension);
    if (!isDrafting()) guardarCambios(item);
    return true;
}

function applySizeName() {
    const item = getSelectedObject();
    if (!item) return;

    const value = smNombre.value.trim();
    setItemName(item, value);

    const layerContent = document.querySelector(`.layer-div[data-target-id="${item.id}"] .layer-content`);
    if (layerContent) layerContent.textContent = value;

    // Durante el borrador el nombre se ve en vivo pero no se guarda todavia.
    if (isDrafting()) {
        markDraftNameEdited();
        return;
    }
    guardarCambios(item);
    syncRoomSwitcher();
}

smNombre.addEventListener('input', () => applySizeName());

smNombre.addEventListener('change', () => applySizeName());

smNombre.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && event.shiftKey) {
        event.preventDefault();
        smAncho.focus();
        smAncho.select();
        return;
    }

    if (event.key !== 'Enter') return;
    event.preventDefault();

    if (isDrafting()) {
        const result = confirmDraftName();
        if (result === 'invalid') {
            if (document.activeElement === smNombre) shakeDraftInput(smNombre);
            return;
        }
        // Al fijar el borrador con Enter el foco no debe quedarse en el campo
        // del nombre que ya no tiene nada que editar.
        smNombre.blur();
        return;
    }
    smNombre.blur();
});

smAlto.addEventListener('input', () => applySizeDimension(smAlto, smAlMetric, 'height'));

smAlto.addEventListener('change', () => {
    const item = getSelectedObject();
    if (!item) return;
    smAlto.value = smFromPx(getItemLayout(item).height, smAlMetric).toFixed(2);
});

smAlto.addEventListener('focus', () => {
    setDimensionHighlight('height');
});

smAlto.addEventListener('blur', () => {
    setTimeout(() => {
        if (document.activeElement !== smAncho && document.activeElement !== smAlto) {
            setDimensionHighlight(null);
        }
    }, 50);
});

smAlto.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
        if (event.shiftKey) return;
        event.preventDefault();

        // Tab confirma la medida y avanza al siguiente campo.
        if (isDrafting()) {
            if (!applySizeDimension(smAlto, smAlMetric, 'height')) {
                shakeDraftInput(smAlto);
                return;
            }
            if (confirmDraftDimension('height') === 'invalid') {
                shakeDraftInput(smAlto);
                return;
            }
        }

        smAncho.focus();
        smAncho.select();
        return;
    }

    if (event.key !== 'Enter') return;
    event.preventDefault();

    if (isDrafting()) {
        if (!applySizeDimension(smAlto, smAlMetric, 'height')) {
            shakeDraftInput(smAlto);
            return;
        }
        const result = confirmDraftDimension('height');
        if (result === 'invalid') {
            shakeDraftInput(smAlto);
            return;
        }
        // Enter fija la medida y pasa a Ancho, tanto al crear como al editar.
        smAncho.focus();
        smAncho.select();
        return;
    }

    applySizeDimension(smAlto, smAlMetric, 'height');
    const item = getSelectedObject();
    if (item) {
        smAlto.value = smFromPx(getItemLayout(item).height, smAlMetric).toFixed(2);
    }
    // Al editar un objeto ya creado, Enter solo fija la altura: no salta a Ancho.
    smAlto.blur();
});

smAncho.addEventListener('input', () => applySizeDimension(smAncho, smAnMetric, 'width'));

smAncho.addEventListener('change', () => {
    const item = getSelectedObject();
    if (!item) return;
    smAncho.value = smFromPx(getItemLayout(item).width, smAnMetric).toFixed(2);
});

smAncho.addEventListener('focus', () => {
    setDimensionHighlight('width');
});

smAncho.addEventListener('blur', () => {
    setTimeout(() => {
        if (document.activeElement !== smAncho && document.activeElement !== smAlto) {
            setDimensionHighlight(null);
        }
    }, 50);
});

smAncho.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
        event.preventDefault();

        // Tab confirma la medida y avanza al siguiente campo.
        if (!event.shiftKey && isDrafting()) {
            if (!applySizeDimension(smAncho, smAnMetric, 'width')) {
                shakeDraftInput(smAncho);
                return;
            }
            if (confirmDraftDimension('width') === 'invalid') {
                shakeDraftInput(smAncho);
                return;
            }
        }

        const target = event.shiftKey ? smAlto : smNombre;
        target.focus();
        target.select();
        return;
    }

    if (event.key !== 'Enter') return;
    event.preventDefault();

    if (isDrafting()) {
        if (!applySizeDimension(smAncho, smAnMetric, 'width')) {
            shakeDraftInput(smAncho);
            return;
        }
        const result = confirmDraftDimension('width');
        if (result === 'invalid') {
            shakeDraftInput(smAncho);
            return;
        }
        if (result === 'pending') {
            const next = getNextDraftInput();
            if (next && next !== smAncho) {
                next.focus();
                next.select();
            }
        } else {
            smAncho.blur();
        }
        return;
    }

    applySizeDimension(smAncho, smAnMetric, 'width');
    const item = getSelectedObject();
    if (item) {
        smAncho.value = smFromPx(getItemLayout(item).width, smAnMetric).toFixed(2);
    }
    smAncho.blur();
});

smRadius.addEventListener('input', () => {
    const item = getSelectedObject();
    const value = Number(smRadius.value);
    if (!item || isOpening(item) || !Number.isFinite(value) || value < 0) return;

    // Un radio relativo (por ejemplo el 100% del circulo) debe seguir siendo
    // relativo al redimensionar el objeto.
    const isRelative = (item.style.borderRadius || '').includes('%');
    item.style.borderRadius = value > 0 ? `${value}${isRelative ? '%' : 'px'}` : '';
    guardarCambios(item);
});

smRotation.addEventListener('input', () => {
    const item = getSelectedObject();
    const value = Number(smRotation.value);
    if (!item || isOpening(item) || !Number.isFinite(value)) return;

    applyRotation(item, value);
});

smRotation.addEventListener('change', () => {
    const item = getSelectedObject();
    if (!item || isOpening(item)) return;

    applyRotation(item, Number(smRotation.value));
    smRotation.value = Math.round(getRotation(item));
    guardarCambios(item);
});

smRotate90.addEventListener('click', () => {
    const item = getSelectedObject();
    if (!item || isOpening(item)) return;

    applyRotation(item, getRotation(item) + 90);
    smRotation.value = Math.round(getRotation(item));
    syncRotationControls();
    guardarCambios(item);
});

document.getElementById('sm-rotate--90').addEventListener('click', () => {
    const item = getSelectedObject();
    if (!item || isOpening(item)) return;

    applyRotation(item, getRotation(item) - 90);
    smRotation.value = Math.round(getRotation(item));
    syncRotationControls();
    guardarCambios(item);
});

export const smAlMetricState = { get value() { return smAlMetric; }, set value(value) { smAlMetric = value; } };

export const smAnMetricState = { get value() { return smAnMetric; }, set value(value) { smAnMetric = value; } };

configureSizeUnitButtons(UNIT_IDS.height, smAlto, smAlMetricState);

configureSizeUnitButtons(UNIT_IDS.width, smAncho, smAnMetricState);

const unitSystemButtons = [...document.querySelectorAll('.unit-system .segmented-btn')];

function markUnitSystem(system) {
    unitSystemButtons.forEach((button) => {
        button.classList.toggle('selected', button.dataset.system === system);
    });
}

function setUnitSystem(system) {
    const nextSystem = system === 'imperial' ? 'imperial' : 'metric';
    const unit = nextSystem === 'imperial' ? 'ft' : 'm';
    setDimensionUnit(UNIT_IDS.height, smAlto, smAlMetricState, unit);
    setDimensionUnit(UNIT_IDS.width, smAncho, smAnMetricState, unit);
    markUnitSystem(nextSystem);
    localStorage.setItem(UNIT_SYSTEM_KEY, nextSystem);
}

unitSystemButtons.forEach((button) => {
    button.addEventListener('click', () => setUnitSystem(button.dataset.system));
});

const savedUnitSystem = localStorage.getItem(UNIT_SYSTEM_KEY);
if (savedUnitSystem === 'imperial') {
    setUnitSystem('imperial');
} else {
    markUnitSystem('metric');
}

document.querySelectorAll('.size-manager input, #popupGetSize input').forEach((input) => {
    let selectNextMouseUp = false;
    input.addEventListener('focus', () => {
        selectNextMouseUp = true;
        input.select();
    });
    input.addEventListener('mouseup', (event) => {
        if (selectNextMouseUp) {
            selectNextMouseUp = false;
            event.preventDefault();
        }
    });
});

// Tocar cualquier cosa fuera del panel termina la edicion de la medida: el
// campo pierde el foco y la medida resaltada en el objeto se apaga, aunque
// despues se seleccione otro elemento.
document.addEventListener('pointerdown', (event) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (!active.closest('.size-manager')) return;
    if (event.target instanceof Element && event.target.closest('.size-manager')) return;

    active.blur();
    setDimensionHighlight(null);
}, true);

document.addEventListener('draft:change', (event) => {
    // En cada tecla solo se refresca el estado de los campos: no hay que
    // reescribir el valor que el usuario esta escribiendo.
    if (event.detail?.phase === 'edit') {
        syncDraftUI();
        return;
    }

    if (!isDrafting()) setDimensionHighlight(null);
    syncRotationHandle(getSelectedObject());
    syncSizeManager();
});
