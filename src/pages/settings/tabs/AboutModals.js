/**
 * ============================================================================
 * Litefin Tizen - About Tab Modal Dialogs
 * ============================================================================
 * Modal dialog definitions, QR code layouts, and focus trap controllers for
 * the Settings About tab.
 * ============================================================================
 */

import { focusManager } from '../../../ui/FocusManager.js';
import { i18n } from '../../../utils/i18n.js';
import { getDeviceSpecsData, openExternalUrl } from './AboutDeviceSpecs.js';

export { getDeviceSpecsData, openExternalUrl };

/**
 * Shared modal dialog wrapper template generator.
 * @private
 */
function renderDialogShell({ titleSvg, title, subtitle, contentHtml, closeBtnId = 'btn-about-modal-close', modalClass = '' }) {
    return `
        <div class="settings-modal about-dialog-modal ${modalClass}" role="dialog" aria-modal="true" aria-label="${title}">
            <div class="about-dialog-header">
                <h2>${titleSvg}${title}</h2>
                <p class="about-dialog-subtitle">${subtitle}</p>
            </div>
            <div class="about-dialog-content">${contentHtml}</div>
            <div class="about-dialog-actions">
                <button class="modal-action-btn focusable about-dialog-close-btn" id="${closeBtnId}" tabindex="0" data-focusable="true">
                    ${i18n.t('Close') || 'Close'}
                </button>
            </div>
        </div>
    `;
}

/**
 * Shared QR card component template generator.
 * @private
 */
function renderQrCard({ qrImg, title, desc, urlChip, btnId, navRight, navLeft, navUp, navDown, maxCardWidth }) {
    const cardStyle = maxCardWidth ? `style="max-width: ${maxCardWidth};"` : '';
    const rightAttr = navRight ? `data-nav-right="${navRight}"` : '';
    const leftAttr = navLeft ? `data-nav-left="${navLeft}"` : '';
    const upAttr = navUp ? `data-nav-up="${navUp}"` : '';
    const downAttr = navDown ? `data-nav-down="${navDown}"` : '';

    return `
        <div class="about-qr-card" ${cardStyle}>
            <div class="about-qr-image-wrap">
                <img src="${qrImg}" class="about-qr-img" alt="${title} QR Code" />
            </div>
            <span class="about-qr-title">${title}</span>
            <span class="about-qr-desc">${desc}</span>
            <span class="about-qr-url-chip">${urlChip}</span>
            <button class="btn btn-secondary btn-small focusable about-qr-btn" id="${btnId}" tabindex="0" data-focusable="true" ${rightAttr} ${leftAttr} ${upAttr} ${downAttr}>
                ${i18n.t('OpenLink') || 'Open Link'}
            </button>
        </div>
    `;
}

/**
 * Controller for rendering and handling modal dialogs within the About tab.
 */
export class AboutModals {
    /**
     * Creates an instance of AboutModals.
     * @param {HTMLElement|Function} overlayProvider Function or element for modal overlay
     */
    constructor(overlayProvider) {
        this._overlayProvider = overlayProvider;
        this._closeTimer = null;
    }

    /**
     * Resolves the current DOM overlay element.
     * @private
     * @returns {HTMLElement|null}
     */
    _getOverlay() {
        if (typeof this._overlayProvider === 'function') {
            return this._overlayProvider();
        }
        return this._overlayProvider || document.getElementById('modal-overlay');
    }

    /**
     * Closes the currently active About dialog and pops the focus trap.
     */
    closeDialog() {
        const overlay = this._getOverlay();
        if (!overlay || !overlay.classList.contains('visible')) return;

        // Disarm interactive elements to prevent focus clinging
        const actionButtons = overlay.querySelectorAll('button, [tabindex]');
        for (let i = 0; i < actionButtons.length; i++) {
            const btn = actionButtons[i];
            btn.setAttribute('tabindex', '-1');
            btn.setAttribute('disabled', 'true');
            if (typeof btn.blur === 'function') {
                btn.blur();
            }
        }

        // Hide overlay smoothly
        overlay.classList.remove('visible');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.onclick = null;

        if (this._closeTimer) {
            clearTimeout(this._closeTimer);
        }

        this._closeTimer = setTimeout(() => {
            if (overlay) {
                overlay.innerHTML = '';
            }
        }, 300);

        // Pop focus trap
        focusManager.popTrap();
    }

    /**
     * Mounts, binds, and activates modal dialog trap.
     * @private
     */
    _displayModal({ titleSvg, title, subtitle, contentHtml, closeBtnId = 'btn-about-modal-close', modalClass = '', defaultFocus, orientation = 'grid', actionBindings = [] }) {
        const overlay = this._getOverlay();
        if (!overlay) return;

        overlay.innerHTML = renderDialogShell({ titleSvg, title, subtitle, contentHtml, closeBtnId, modalClass });
        overlay.classList.add('visible');
        overlay.setAttribute('aria-hidden', 'false');

        // Backdrop click dismiss
        overlay.onclick = (e) => {
            if (e.target === overlay) this.closeDialog();
        };

        // Close button dismiss
        const closeBtn = overlay.querySelector(`#${closeBtnId}`);
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                this.closeDialog();
            };
        }

        // Action button bindings
        actionBindings.forEach(({ selector, url }) => {
            const btn = overlay.querySelector(selector);
            if (btn) {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    openExternalUrl(url);
                };
            }
        });

        // Activate focus trap
        focusManager.pushTrap(overlay.querySelector('.about-dialog-modal'), {
            orientation,
            defaultFocusSelector: defaultFocus
        });
    }

    /**
     * Displays the Device Specifications dialog modal.
     */
    showDeviceInformationDialog() {
        const specs = getDeviceSpecsData();

        const buildBadgeCloud = (codecs) =>
            codecs
                .map((c) => {
                    const statusClass = !c.hw ? 'unsupported' : !c.user ? 'disabled' : 'supported';
                    const statusLabel = !c.hw
                        ? ` (${i18n.t('Unsupported') || 'Unsupported'})`
                        : !c.user
                          ? ` (${i18n.t('Disabled') || 'Disabled'})`
                          : '';
                    return `<span class="about-codec-badge ${statusClass}">${c.name}${statusLabel}</span>`;
                })
                .join('');

        const contentHtml = `
            <div class="about-device-specs-grid">
                <div class="about-device-tile">
                    <span class="about-device-label" data-i18n="Model">${i18n.t('Model')}</span>
                    <span class="about-device-val">${specs.modelName}</span>
                </div>
                <div class="about-device-tile">
                    <span class="about-device-label" data-i18n="Platform">${i18n.t('Platform')}</span>
                    <span class="about-device-val">${specs.platform}</span>
                </div>
                <div class="about-device-tile">
                    <span class="about-device-label" data-i18n="Resolution">${i18n.t('Resolution')}</span>
                    <span class="about-device-val">${specs.resolution}</span>
                </div>
                <div class="about-device-tile">
                    <span class="about-device-label" data-i18n="HDRSupport">${i18n.t('HDRSupport')}</span>
                    <span class="about-device-val">${specs.hdr}</span>
                </div>
                <div class="about-device-tile span-2">
                    <span class="about-device-label" data-i18n="VideoCodecs">${i18n.t('VideoCodecs')}</span>
                    <div class="about-badge-cloud">${buildBadgeCloud(specs.videoCodecs)}</div>
                </div>
                <div class="about-device-tile span-2">
                    <span class="about-device-label" data-i18n="AudioCodecs">${i18n.t('AudioCodecs') || 'Audio Codecs'}</span>
                    <div class="about-badge-cloud">${buildBadgeCloud(specs.audioCodecs)}</div>
                </div>
            </div>
        `;

        this._displayModal({
            titleSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
            title: i18n.t('ViewDeviceInfo') || 'Device Specifications',
            subtitle: 'Hardware identity, display pipeline, and hardware decoding decoders.',
            contentHtml,
            closeBtnId: 'btn-device-info-done',
            defaultFocus: '#btn-device-info-done',
            orientation: 'horizontal'
        });
    }

    /**
     * Displays GitHub repository and issue tracker dialog with 2 QR codes.
     * @param {'repo'|'issues'} [initialFocus='repo']
     */
    showGitHubDialog(initialFocus = 'repo') {
        const card1 = renderQrCard({
            qrImg: 'assets/qr/qr-github.png',
            title: i18n.t('GitHubRepo') || 'GitHub Repository',
            desc: 'View source code, release notes, and documentation on GitHub.',
            urlChip: 'github.com/MoazSalem/litefin',
            btnId: 'btn-github-open',
            navRight: '#btn-issues-open',
            navDown: '#btn-about-modal-close'
        });

        const card2 = renderQrCard({
            qrImg: 'assets/qr/qr-issues.png',
            title: i18n.t('ReportIssue') || 'Quick Issue Reporter',
            desc: 'Submit bug reports, feature requests, or troubleshooting crash reports.',
            urlChip: 'github.com/MoazSalem/litefin/issues',
            btnId: 'btn-issues-open',
            navLeft: '#btn-github-open',
            navDown: '#btn-about-modal-close'
        });

        this._displayModal({
            titleSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>`,
            title: 'GitHub & Bug Tracker',
            subtitle: 'Scan with your phone camera, or click to open directly in a browser.',
            contentHtml: `<div class="about-qr-grid">${card1}${card2}</div>`,
            defaultFocus: initialFocus === 'issues' ? '#btn-issues-open' : '#btn-github-open',
            actionBindings: [
                { selector: '#btn-github-open', url: 'https://github.com/MoazSalem/litefin' },
                { selector: '#btn-issues-open', url: 'https://github.com/MoazSalem/litefin/issues' }
            ]
        });
    }

    /**
     * Displays server companion plugins dialog featuring 2 QR codes.
     */
    showPluginsDialog() {
        const card1 = renderQrCard({
            qrImg: 'assets/qr/qr-plugin-jellyfin.png',
            title: 'Jellyfin Plugin',
            desc: 'Official server companion plugin for Jellyfin server instances.',
            urlChip: 'github.com/MoazSalem/litefin-plugin',
            btnId: 'btn-plugin-jellyfin-open',
            navRight: '#btn-plugin-emby-open',
            navDown: '#btn-about-modal-close'
        });

        const card2 = renderQrCard({
            qrImg: 'assets/qr/qr-plugin-emby.png',
            title: 'Emby Plugin',
            desc: 'Official server companion plugin for Emby server instances.',
            urlChip: 'github.com/MoazSalem/litefin-plugin-emby',
            btnId: 'btn-plugin-emby-open',
            navLeft: '#btn-plugin-jellyfin-open',
            navDown: '#btn-about-modal-close'
        });

        this._displayModal({
            titleSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
            title: 'Server Companion Plugins',
            subtitle: 'Install companion plugins on your media server for Seerr integration and cloud settings backup.',
            contentHtml: `<div class="about-qr-grid">${card1}${card2}</div>`,
            defaultFocus: '#btn-plugin-jellyfin-open',
            actionBindings: [
                { selector: '#btn-plugin-jellyfin-open', url: 'https://github.com/MoazSalem/litefin-plugin' },
                { selector: '#btn-plugin-emby-open', url: 'https://github.com/MoazSalem/litefin-plugin-emby' }
            ]
        });
    }

    /**
     * Displays the Discord Community invitation dialog.
     */
    showDiscordDialog() {
        const card = renderQrCard({
            qrImg: 'assets/qr/qr-discord.png',
            title: 'Official Discord Server',
            desc: 'Real-time troubleshooting, alpha announcements, and community discussions.',
            urlChip: 'discord.gg/N3VpazBtTx',
            btnId: 'btn-discord-open',
            navDown: '#btn-about-modal-close',
            maxCardWidth: '380px'
        });

        this._displayModal({
            titleSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
            title: i18n.t('DiscordCommunity') || 'Discord Community',
            subtitle: 'Scan to join the official Litefin Discord server. Connect with other users, ask questions, and share feedback.',
            contentHtml: `<div class="about-qr-grid">${card}</div>`,
            modalClass: 'compact-modal',
            defaultFocus: '#btn-discord-open',
            actionBindings: [
                { selector: '#btn-discord-open', url: 'https://discord.gg/N3VpazBtTx' }
            ]
        });
    }

    /**
     * Displays the Support & Donations dialog featuring 2 QR codes.
     */
    showSupportDialog() {
        const card1 = renderQrCard({
            qrImg: 'assets/qr/qr-donation.png',
            title: 'Buy Me a Coffee',
            desc: 'Support developer coffee fuels and ongoing rapid release cycles!',
            urlChip: 'buymeacoffee.com/moazsalem',
            btnId: 'btn-support-coffee-open',
            navRight: '#btn-support-sponsors-open',
            navDown: '#btn-about-modal-close'
        });

        const card2 = renderQrCard({
            qrImg: 'assets/qr/qr-sponsors.png',
            title: 'GitHub Sponsors',
            desc: 'Become an official sponsor of the Litefin repository.',
            urlChip: 'github.com/sponsors/MoazSalem',
            btnId: 'btn-support-sponsors-open',
            navLeft: '#btn-support-coffee-open',
            navDown: '#btn-about-modal-close'
        });

        this._displayModal({
            titleSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
            title: 'Support & Donations',
            subtitle: 'Litefin is free and open-source. Help back continuous development and infrastructure support.',
            contentHtml: `<div class="about-qr-grid">${card1}${card2}</div>`,
            defaultFocus: '#btn-support-coffee-open',
            actionBindings: [
                { selector: '#btn-support-coffee-open', url: 'https://www.buymeacoffee.com/moazsalem' },
                { selector: '#btn-support-sponsors-open', url: 'https://github.com/sponsors/MoazSalem' }
            ]
        });
    }

    /**
     * Teardown timer cleanup.
     */
    destroy() {
        if (this._closeTimer) {
            clearTimeout(this._closeTimer);
            this._closeTimer = null;
        }
        this._overlayProvider = null;
    }
}

export default AboutModals;
