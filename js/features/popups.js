// Alertas y menus contextuales
import { handleMenuAction } from './layers.js';

export const alertapopup =document.getElementById('popupAlerta');

export const cerrarAlerta =document.getElementById('cerrarAlerta').addEventListener('click', () => {
    alertapopup.classList.add('hidden');
})

alertapopup.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) {
        alertapopup.classList.add('hidden');
    }
})

document.body.addEventListener('click', () => {
        document.querySelector('.popup-menu-box')?.remove();
        document.querySelector('.tol-input-popup')?.remove();
    });

export function alerta(text) {
    const campo=document.getElementById('message');
    campo.textContent = text;
    alertapopup.classList.remove('hidden');
}

export function popupMenu(array, targetElement, point = null) {
    document.querySelector('.popup-menu-box')?.remove();

    const box = document.createElement('div');
    box.classList.add('popup-menu-box');
    box.style.position='fixed';

        array.forEach((option, index) => {
        const op = document.createElement('button');
        op.classList.add('menu-popup-option-box');
        op.textContent=option.label;
        op.id=(`menu-popup-${index}`);
        op.dataset.action=option.action;

            op.addEventListener('click', ()=> {
            handleMenuAction(option.action, targetElement);
            box.remove();
        });
        box.appendChild(op);
    })

    document.body.appendChild(box);

    const menuRect = box.getBoundingClientRect();
    const margen = 8;
    let left;
    let top;

    if (point) {
        left = point.x + 2;
        top = point.y + 2;
        if (left + menuRect.width + margen > window.innerWidth) left = point.x - menuRect.width - 2;
        if (top + menuRect.height + margen > window.innerHeight) top = point.y - menuRect.height - 2;
    } else {
        const rect = targetElement.getBoundingClientRect();
        const espacioAbajo = window.innerHeight - rect.bottom;
        const espacioArriba = rect.top;

        left = Math.min(
            rect.right + margen,
            window.innerWidth - menuRect.width - margen
        );
        top = espacioAbajo >= menuRect.height || espacioAbajo >= espacioArriba
            ? rect.bottom + margen
            : rect.top - menuRect.height - margen;
    }

    box.style.left = `${Math.max(margen, Math.min(left, window.innerWidth - menuRect.width - margen))}px`;
    box.style.top = `${Math.max(margen, Math.min(top, window.innerHeight - menuRect.height - margen))}px`;
}
