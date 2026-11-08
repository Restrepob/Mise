const DRAG_PIXELS_PER_STEP = 4;

function numberAttribute(input, name) {
    const raw = input.getAttribute(name);
    if (raw === null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

function getStep(input) {
    const rawStep = input.step;
    if (!rawStep || rawStep === 'any') return 1;
    const step = Number(rawStep);
    return Number.isFinite(step) && step > 0 ? step : 1;
}

function precisionFor(step) {
    const decimals = String(step).split('.')[1]?.length || 0;
    return Math.min(8, decimals);
}

document.addEventListener('pointerdown', (event) => {
    const icon = event.target.closest('.input-icon, .dim-mark');
    if (!icon || event.button !== 0) return;

    const input = icon.closest('.question-box')?.querySelector('input[type="number"]');
    if (!input || input.disabled || input.readOnly) return;

    event.preventDefault();
    icon.classList.add('is-numeric-scrubbing');
    icon.setPointerCapture?.(event.pointerId);
    input.focus({ preventScroll: true });

    const step = getStep(input);
    const precision = precisionFor(step);
    const min = numberAttribute(input, 'min');
    const max = numberAttribute(input, 'max');
    const current = Number(input.value);
    const startValue = Number.isFinite(current) ? current : (min ?? 0);
    const startY = event.clientY;
    let changed = false;

    const onMove = (moveEvent) => {
        if (moveEvent.pointerId !== event.pointerId) return;
        const pixelsPerStep = moveEvent.shiftKey ? DRAG_PIXELS_PER_STEP * 5 : DRAG_PIXELS_PER_STEP;
        const steps = Math.round((startY - moveEvent.clientY) / pixelsPerStep);
        let next = startValue + steps * step;
        if (min !== null) next = Math.max(min, next);
        if (max !== null) next = Math.min(max, next);
        next = Number(next.toFixed(precision));
        if (input.value === String(next)) return;

        input.value = String(next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        changed = true;
    };

    const finish = (upEvent) => {
        if (upEvent.pointerId !== event.pointerId) return;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', finish);
        document.removeEventListener('pointercancel', finish);
        icon.classList.remove('is-numeric-scrubbing');
        if (changed) input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
});

document.querySelectorAll('.input-icon, .dim-mark').forEach((icon) => {
    if (icon.closest('.question-box')?.querySelector('input[type="number"]')) {
        icon.classList.add('is-numeric-scrubber');
        icon.setAttribute('title', 'Arrastra arriba o abajo para cambiar el valor');
    }
});
