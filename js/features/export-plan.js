// Exportacion del plano como texto
import { getOpeningWidth, getRooms, isOpening } from '../core/model.js';
import { metro } from '../core/state.js';
import { formatMeters, getRotation, quotePlanName } from '../core/units.js';

export function exportPlanText() {
    const lines = [];
    getRooms().forEach((room) => {
        const roomHeight = parseFloat(room.style.height) || room.offsetHeight;
        const roomWidth = parseFloat(room.style.width) || room.offsetWidth;
        lines.push([
            'room',
            quotePlanName(room.dataset.name),
            `${formatMeters(roomHeight / metro)} x ${formatMeters(roomWidth / metro)}`,
            `at ${formatMeters(room.offsetTop / metro)} ${formatMeters(room.offsetLeft / metro)}`,
            `rot ${Math.round(getRotation(room))}`,
        ].join(' '));

        [...room.children].forEach((child) => {
            if (!child.classList.contains('object')) return;
            const name = quotePlanName(child.dataset.name);

            if (isOpening(child)) {
                const edge = child.dataset.edge || 'top';
                const offsetM = (Number(child.dataset.offset) || 0) / metro;
                lines.push(`    ${child.dataset.type} ${name} ${formatMeters(getOpeningWidth(child) / metro)} on ${edge} offset ${formatMeters(offsetM)}`);
                return;
            }

            const childHeight = parseFloat(child.style.height) || child.offsetHeight;
            const childWidth = parseFloat(child.style.width) || child.offsetWidth;
            const parts = [
                '    object',
                name,
                `${formatMeters(childHeight / metro)} x ${formatMeters(childWidth / metro)}`,
                `at ${formatMeters(child.offsetTop / metro)} ${formatMeters(child.offsetLeft / metro)}`,
                `rot ${Math.round(getRotation(child))}`,
            ];
            if (child.dataset.shape === 'l') {
                const armX = (parseFloat(child.dataset.armX) || 0) / metro;
                const armY = (parseFloat(child.dataset.armY) || 0) / metro;
                parts.push('shape l', `arms ${formatMeters(armX)} ${formatMeters(armY)}`);
            } else if (child.dataset.shape === 'semicircle') {
                parts.push('shape semicircle');
            }
            lines.push(parts.join(' '));
        });
    });
    return lines.join('\n');
}

export const planExportBtn = document.getElementById('plan-export-btn');

export const planPopup = document.createElement('div');

planPopup.id = 'plan-popup';

planPopup.className = 'plan-popup hidden';

planPopup.innerHTML = `
    <div class="plan-popup-title">Plano — copiar o exportar como respaldo</div>
    <textarea id="plan-popup-text" spellcheck="false" aria-label="Texto del plano"></textarea>
    <div class="plan-popup-actions">
        <button type="button" class="plan-popup-btn" id="plan-popup-download">Exportar .txt</button>
        <button type="button" class="plan-popup-btn" id="plan-popup-copy">Copiar</button>
        <button type="button" class="plan-popup-btn plan-popup-close" id="plan-popup-close">Cerrar</button>
    </div>
`;

document.body.appendChild(planPopup);

export const planPopupText = planPopup.querySelector('#plan-popup-text');

export function openPlanPopup() {
    planPopupText.value = exportPlanText();
    const btnRect = planExportBtn.getBoundingClientRect();
    planPopup.style.left = `${btnRect.left}px`;
    planPopup.style.top = `${btnRect.bottom + 10}px`;
    planPopup.classList.remove('hidden');
    planPopupText.focus();
}

export function closePlanPopup() {
    planPopup.classList.add('hidden');
}

export function copyPlanText() {
    planPopupText.select();
    planPopupText.setSelectionRange(0, planPopupText.value.length);
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(planPopupText.value).catch(() => {
            document.execCommand('copy');
        });
    } else {
        document.execCommand('copy');
    }
}

if (planExportBtn) {
    planExportBtn.addEventListener('click', () => {
        if (planPopup.classList.contains('hidden')) {
            openPlanPopup();
        } else {
            closePlanPopup();
        }
    });
}

planPopup.querySelector('#plan-popup-copy').addEventListener('click', copyPlanText);

planPopup.querySelector('#plan-popup-download').addEventListener('click', () => {
    const blob = new Blob([planPopupText.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mise-plano-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
});

planPopup.querySelector('#plan-popup-close').addEventListener('click', closePlanPopup);

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !planPopup.classList.contains('hidden')) closePlanPopup();
});

document.addEventListener('pointerdown', (event) => {
    if (
        !planPopup.classList.contains('hidden')
        && !planPopup.contains(event.target)
        && !planExportBtn.contains(event.target)
    ) {
        closePlanPopup();
    }
});
