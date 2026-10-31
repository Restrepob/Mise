// Panel de tamanio y rotacion
import { smAlto, smAncho, smNombre, smRadius, smRotate90, smRotation } from '../core/dom.js';
import { syncDoorPanel, syncEdgePanel, syncOpeningOverlay, syncTolerancePanel } from './door.js';
import { getActiveRoom, getOpeningWallLength, getSelectedObject, isOpening, setItemName } from '../core/model.js';
import { placeOpening } from './openings.js';
import { guardarCambios } from './persistence.js';
import { syncRoomSwitcher } from './rooms.js';
import { applyRotation } from './rotation.js';
import { MARGEN_ESQUINA, OPENING_MIN, viewState } from '../core/state.js';
import { getItemLayout, getRotation, isAxesSwapped, smFromPx, smToPx } from '../core/units.js';
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

export function syncSizeManager() {
    const item = getSelectedObject();
    document.querySelector('.size-manager').classList.toggle('empty', !item);
    setSizeManagerDisabled(!item, item);
    setOpeningPanelFields(item);
    syncDoorPanel(item);
    syncEdgePanel(item);
    syncTolerancePanel(item);
    syncSizeManagerReadout();
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
    if (!item || !Number.isFinite(value) || value <= 0) return;

    if (isOpening(item)) {
        if (dimension !== 'width') return;
        const maxWidth = Math.max(OPENING_MIN, getOpeningWallLength(item) - MARGEN_ESQUINA * 2);
        item.dataset.openingWidth = String(Math.min(Math.max(OPENING_MIN, smToPx(value, unit)), maxWidth));
        placeOpening(item);
        syncOpeningOverlay(item);
        guardarCambios(item);
        return;
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
    guardarCambios(item);
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

smAncho.addEventListener('input', () => applySizeDimension(smAncho, smAnMetric, 'width'));

smAncho.addEventListener('change', () => {
    const item = getSelectedObject();
    if (!item) return;
    smAncho.value = smFromPx(getItemLayout(item).width, smAnMetric).toFixed(2);
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
