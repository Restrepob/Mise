// Panel de tamanio y rotacion
import { smAlto, smAncho, smNombre, smRadius, smRotate90, smRotation } from '../core/dom.js';
import { syncDoorPanel, syncEdgePanel, syncOpeningOverlay, syncTolerancePanel } from './door.js';
import { getActiveRoom, getOpeningWallLength, getSelectedObject, isOpening, setItemName } from '../core/model.js';
import { confirmDraftDimension, draftState, isDrafting, markDimensionEdited, shakeDraftInput } from './draft.js';
import { placeOpening } from './openings.js';
import { guardarCambios } from './persistence.js';
import { syncRoomSwitcher } from './rooms.js';
import { applyRotation, syncRotationHandle } from './rotation.js';
import { MARGEN_ESQUINA, OPENING_MIN, viewState } from '../core/state.js';
import { getItemLayout, getRotation, isAxesSwapped, smFromPx, smToPx, snapNameRotation } from '../core/units.js';
import { applySceneScale, clampScale, updateMinScaleForRoom, updateSceneSize } from './view.js';

export let smAlMetric = 'm';

export let smAnMetric = 'm';

export function configureSizeUnitButtons(buttonIds, input, metricState) {
    buttonIds.forEach((buttonId) => {
        document.getElementById(buttonId).addEventListener('click', () => {
            const item = getSelectedObject();
            const currentPixels = item
                ? getItemLayout(item)[input === smAlto ? 'height' : 'width']
                : null;
            const nextUnit = document.getElementById(buttonId).dataset.unit;

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
        });
    });
}

export function setSizeManagerDisabled(disabled, item = null) {
    document.querySelectorAll('.size-manager input, .size-manager button').forEach((control) => {
        control.disabled = disabled;
    });

    if (!disabled && isOpening(item)) {
        smAlto.disabled = true;
        document.getElementById('sm-alto-m').disabled = true;
        document.getElementById('sm-alto-cm').disabled = true;
        smRadius.disabled = true;
    }
}

export function setOpeningPanelFields(item) {
    const opening = isOpening(item);
    ['sm-alto-caption', 'sm-alto-box', 'sm-radius-caption', 'sm-radius', 'sm-rotation-caption', 'sm-rotation-box'].forEach((id) => {
        document.getElementById(id).style.display = opening ? 'none' : '';
    });
}

export let currentDimHighlight = null;

export function setDimensionHighlight(dimension) {
    currentDimHighlight = dimension;
    document.querySelectorAll('.dim-i-highlight').forEach((el) => el.remove());

    const item = getSelectedObject();
    if (!item || !dimension || isOpening(item)) return;

    const swapped = isAxesSwapped(item);
    const isLocalHeight = (dimension === 'height' && !swapped) || (dimension === 'width' && swapped);

    const layout = getItemLayout(item);
    const pixels = isLocalHeight ? (swapped ? layout.width : layout.height) : (swapped ? layout.height : layout.width);
    const unit = dimension === 'height' ? smAlMetric : smAnMetric;
    const valueText = `${smFromPx(pixels, unit).toFixed(2)} ${unit}`;

    const container = document.createElement('div');
    container.className = `dim-i-highlight ${isLocalHeight ? 'dim-i-highlight--v' : 'dim-i-highlight--h'}${isDrafting() ? ' dim-i-highlight--draft-active' : ''}`;

    const capStart = document.createElement('div');
    capStart.className = 'dim-i-cap';

    const lineBefore = document.createElement('div');
    lineBefore.className = 'dim-i-line';

    const badge = document.createElement('div');
    badge.className = 'dim-i-badge';
    badge.style.transform = `rotate(${snapNameRotation(getRotation(item))}deg)`;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'dim-i-value';
    valueSpan.textContent = valueText;
    badge.appendChild(valueSpan);

    const lineAfter = document.createElement('div');
    lineAfter.className = 'dim-i-line';

    const capEnd = document.createElement('div');
    capEnd.className = 'dim-i-cap';

    container.append(capStart, lineBefore, badge, lineAfter, capEnd);
    item.appendChild(container);
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
}

export function syncSizeManagerReadout() {
    const item = getSelectedObject();
    if (!item) {
        smNombre.value = '';
        smAlto.value = '';
        smAncho.value = '';
        smRadius.value = '';
        smRotation.value = '';
        return;
    }

    const { width, height } = getItemLayout(item);
    const layer = document.querySelector(`.layer-div[data-target-id="${item.id}"]`);
    smNombre.value = item.dataset.name || layer?.querySelector('.layer-content')?.textContent.trim() || '';
    smAlto.value = smFromPx(height, smAlMetric).toFixed(2);
    smAncho.value = smFromPx(width, smAnMetric).toFixed(2);
    smRadius.value = parseFloat(item.style.borderRadius) || 0;
    smRotation.value = isOpening(item) ? '' : Math.round(getRotation(item));
}

export function applySizeDimension(input, unit, dimension) {
    const item = getSelectedObject();
    const value = Number(input.value);
    if (!item || !Number.isFinite(value) || value <= 0) return false;

    if (isOpening(item)) {
        if (dimension !== 'width') return false;
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
    // vuelve a quedar pendiente hasta que se confirme con Enter.
    if (isDrafting()) markDimensionEdited(dimension);
    else guardarCambios(item);
    return true;
}

smNombre.addEventListener('change', () => {
    const item = getSelectedObject();
    if (!item) return;

    const value = smNombre.value.trim();
    setItemName(item, value);

    const layerContent = document.querySelector(`.layer-div[data-target-id="${item.id}"] .layer-content`);
    if (layerContent) layerContent.textContent = value;
    guardarCambios(item);
    syncRoomSwitcher();
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
        if (result === 'pending') {
            smAncho.focus();
            smAncho.select();
        } else {
            smAlto.blur();
        }
        return;
    }

    applySizeDimension(smAlto, smAlMetric, 'height');
    const item = getSelectedObject();
    if (item) {
        smAlto.value = smFromPx(getItemLayout(item).height, smAlMetric).toFixed(2);
    }
    smAncho.focus();
    smAncho.select();
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
            smAlto.focus();
            smAlto.select();
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

    item.style.borderRadius = value > 0 ? `${value}px` : '';
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
    guardarCambios(item);
});

export const smAlMetricState = { get value() { return smAlMetric; }, set value(value) { smAlMetric = value; } };

export const smAnMetricState = { get value() { return smAnMetric; }, set value(value) { smAnMetric = value; } };

configureSizeUnitButtons(['sm-alto-m', 'sm-alto-cm'], smAlto, smAlMetricState);

configureSizeUnitButtons(['sm-ancho-m', 'sm-ancho-cm'], smAncho, smAnMetricState);

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
