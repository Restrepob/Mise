// Unidades, rotacion y geometria basica
import { getOpeningWidth, isOpening } from './model.js';
import { OPENING_DEPTH, metro } from './state.js';

// Cuantos metros representa una unidad visible. El lienzo siempre trabaja en
// pixeles de escena; estas equivalencias solo viven en la capa de UI.
export const UNIT_METERS = {
    m: 1,
    cm: 0.01,
    in: 0.0254,
    ft: 0.3048,
};

function unitToMeters(unit) {
    return UNIT_METERS[unit] ?? UNIT_METERS.m;
}

export function smToPx(value, unit) {
    return value * unitToMeters(unit) * metro;
}

export function smFromPx(px, unit) {
    return px / (unitToMeters(unit) * metro);
}

export function getRotation(item) {
    return Number(item?.dataset.rotation) || 0;
}

export function normalizeDeg(deg) {
    return ((Number(deg) % 360) + 360) % 360;
}

export const ROT_SWAP_TOL = 3;

export function isAxesSwapped(item) {
    if (!item || isOpening(item)) return false;
    const quarter = normalizeDeg(getRotation(item)) % 180;
    return Math.abs(quarter - 90) <= ROT_SWAP_TOL;
}

export function getItemLayout(item) {
    if (isOpening(item)) {
        return { width: getOpeningWidth(item), height: OPENING_DEPTH };
    }
    const rawWidth = parseFloat(item.style.width) || item.offsetWidth;
    const rawHeight = parseFloat(item.style.height) || item.offsetHeight;
    return isAxesSwapped(item)
        ? { width: rawHeight, height: rawWidth }
        : { width: rawWidth, height: rawHeight };
}

export function snapNameRotation(rotation) {
    const R = normalizeDeg(rotation);
    return R >= 90 && R < 270 ? 180 : 0;
}

export function snapRotation(deg) {
    const normalized = normalizeDeg(deg);
    const nearest = Math.round(normalized / 90) * 90;
    return Math.abs(normalized - nearest) <= 6 ? normalizeDeg(nearest) : normalized;
}

export function trimMeters(value) {
    return String(Math.round(value * 1000) / 1000);
}

export function formatMeters(m) {
    return `${trimMeters(m)}m`;
}

export function quotePlanName(name) {
    const n = String(name || '').trim();
    return /\s/.test(n) ? `"${n.replace(/"/g, '\\"')}"` : n;
}
