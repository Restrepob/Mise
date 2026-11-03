// Tooltips flotantes para cualquier elemento con data-tooltip.
// Se montan en body y se posicionan en fixed para que no los recorte el
// overflow del sidebar.
const tooltip = document.createElement('div');
tooltip.className = 'ui-tooltip';
tooltip.setAttribute('role', 'tooltip');
tooltip.setAttribute('aria-hidden', 'true');
document.body.appendChild(tooltip);

let currentTarget = null;

function positionTooltip(target) {
    const rect = target.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const margin = 8;

    let top = rect.top - tipRect.height - margin;
    if (top < margin) top = rect.bottom + margin;

    const left = Math.min(
        Math.max(rect.left + rect.width / 2 - tipRect.width / 2, margin),
        window.innerWidth - tipRect.width - margin,
    );

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function showTooltip(target) {
    const text = target?.dataset?.tooltip;
    if (!text) return;
    currentTarget = target;
    tooltip.textContent = text;
    tooltip.classList.add('is-visible');
    tooltip.setAttribute('aria-hidden', 'false');
    positionTooltip(target);
}

function hideTooltip() {
    currentTarget = null;
    tooltip.classList.remove('is-visible');
    tooltip.setAttribute('aria-hidden', 'true');
}

document.addEventListener('pointerover', (event) => {
    const target = event.target.closest?.('[data-tooltip]');
    if (!target || target === currentTarget) return;
    showTooltip(target);
});

document.addEventListener('pointerout', (event) => {
    const target = event.target.closest?.('[data-tooltip]');
    if (!target) return;
    if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
    hideTooltip();
});

document.addEventListener('focusin', (event) => {
    const target = event.target.closest?.('[data-tooltip]');
    if (target) showTooltip(target);
});

document.addEventListener('focusout', () => hideTooltip());

window.addEventListener('scroll', hideTooltip, true);

window.addEventListener('resize', hideTooltip);
