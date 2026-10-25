/**
 * ============================================================================
 * Litefin Tizen - About Tab Controller
 * ============================================================================
 * Handles rendering, lifecycle orchestration, and event wiring for the
 * Settings About tab. Dialogs and hardware specifications are delegated to
 * AboutModals to maintain strict file length limits.
 * ============================================================================
 */

import { storage } from '../../../utils/StorageService.js';
import { versionChecker } from '../../../utils/VersionChecker.js';
import { i18n } from '../../../utils/i18n.js';
import { logger } from '../../../utils/Logger.js';
import { AboutModals, openExternalUrl, getDeviceSpecsData } from './AboutModals.js';

const log = logger.create('AboutTab');

/**
 * Controller for the Settings About tab view.
 */
export class AboutTab {
    /**
     * Creates an instance of AboutTab.
     * @param {Object} pageContext The parent SettingsPage instance
     */
    constructor(pageContext) {
        // Reference parent page for DOM lookup and modal overlay resolution
        this.page = pageContext;

        // Track bound event listeners for clean unmount teardown
        this._listeners = [];

        // Dedicated modal dialog sub-controller
        this.modals = new AboutModals(() => this._getOverlay());
    }

    /**
     * Helper to resolve the global modal overlay container safely.
     * @private
     * @returns {HTMLElement|null}
     */
    _getOverlay() {
        if (this.page && typeof this.page.$ === 'function') {
            const el = this.page.$('#modal-overlay');
            if (el) return el;
        }
        return document.getElementById('modal-overlay');
    }

    /**
     * Generates HTML markup for the primary About tab content.
     * @returns {string} Serialized HTML template
     */
    render() {
        // Resolve application version with universal fallback
        const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

        return `
            <div class="settings-tab-content">
                <h2 class="content-title" data-i18n="AboutLitefin">${i18n.t('AboutLitefin')}</h2>
                <p class="content-subtitle" data-i18n="AboutTabDescription">
                    ${i18n.t('AboutTabDescription') || 'View application version, platform specifications, and hardware identity.'}
                </p>
                
                <!-- Main application version banner -->
                <div class="about-card" tabindex="0">
                    <h3 class="app-version">${i18n.t('AppVersion', [appVersion])}</h3>
                    <p class="about-desc" data-i18n="AppDescription">
                        ${i18n.t('AppDescription')}
                    </p>
                    <p class="about-credits" data-i18n="DevelopedBy">${i18n.t('DevelopedBy')}</p>
                </div>

                <!-- Community and Resources Section -->
                <h3 class="setting-section-title" data-i18n="AboutResourcesTitle">${i18n.t('AboutResourcesTitle') || 'Community & Resources'}</h3>
                <p class="content-subtitle" data-i18n="AboutResourcesDesc" style="margin-top: -10px; margin-bottom: 16px;">
                    ${i18n.t('AboutResourcesDesc') || 'Explore project source code, install server plugins, access quick issue reporting, join Discord, or support development.'}
                </p>

                <!-- Compact Action Cards Grid -->
                <div class="about-actions-grid" id="about-actions-grid">
                    <!-- Device Information Card (Row 1 Left) -->
                    <button class="about-action-card focusable" 
                            id="btn-about-device-info" 
                            tabindex="0" 
                            data-focusable="true"
                            data-nav-right="#btn-about-github"
                            data-nav-down="#btn-about-issues">
                        <div class="about-card-icon-wrap" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                                <line x1="8" y1="21" x2="16" y2="21"/>
                                <line x1="12" y1="17" x2="12" y2="21"/>
                            </svg>
                        </div>
                        <div class="about-card-info">
                            <span class="about-card-title" data-i18n="ViewDeviceInfo">${i18n.t('ViewDeviceInfo') || 'Device Specifications'}</span>
                            <span class="about-card-desc" data-i18n="ViewDeviceInfoDesc">${i18n.t('ViewDeviceInfoDesc') || 'Hardware model, platform details, resolution, and supported audio/video codecs.'}</span>
                        </div>
                        <div class="about-card-chevron" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 18l6-6-6-6"/>
                            </svg>
                        </div>
                    </button>

                    <!-- GitHub Repository Card (Row 1 Right) -->
                    <button class="about-action-card focusable" 
                            id="btn-about-github" 
                            tabindex="0" 
                            data-focusable="true"
                            data-nav-left="#btn-about-device-info"
                            data-nav-down="#btn-about-plugins">
                        <div class="about-card-icon-wrap" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/>
                            </svg>
                        </div>
                        <div class="about-card-info">
                            <span class="about-card-title" data-i18n="GitHubRepo">${i18n.t('GitHubRepo') || 'GitHub Repository'}</span>
                            <span class="about-card-desc" data-i18n="GitHubRepoDesc">${i18n.t('GitHubRepoDesc') || 'Explore the source code, check releases, and follow development.'}</span>
                        </div>
                        <div class="about-card-chevron" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 18l6-6-6-6"/>
                            </svg>
                        </div>
                    </button>

                    <!-- Quick Issue Reporter Card (Row 2 Left) -->
                    <button class="about-action-card focusable" 
                            id="btn-about-issues" 
                            tabindex="0" 
                            data-focusable="true"
                            data-nav-up="#btn-about-device-info"
                            data-nav-right="#btn-about-plugins"
                            data-nav-down="#btn-about-discord">
                        <div class="about-card-icon-wrap" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                        </div>
                        <div class="about-card-info">
                            <span class="about-card-title" data-i18n="ReportIssue">${i18n.t('ReportIssue') || 'Quick Issue Reporter'}</span>
                            <span class="about-card-desc" data-i18n="ReportIssueDesc">${i18n.t('ReportIssueDesc') || 'Quickly submit bug reports and feature requests via GitHub.'}</span>
                        </div>
                        <div class="about-card-chevron" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 18l6-6-6-6"/>
                            </svg>
                        </div>
                    </button>

                    <!-- Companion Plugins Card (Row 2 Right) -->
                    <button class="about-action-card focusable" 
                            id="btn-about-plugins" 
                            tabindex="0" 
                            data-focusable="true"
                            data-nav-up="#btn-about-github"
                            data-nav-left="#btn-about-issues"
                            data-nav-down="#btn-about-support">
                        <div class="about-card-icon-wrap" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                                <line x1="12" y1="22.08" x2="12" y2="12"/>
                            </svg>
                        </div>
                        <div class="about-card-info">
                            <span class="about-card-title" data-i18n="CompanionPlugins">${i18n.t('CompanionPlugins') || 'Companion Plugins'}</span>
                            <span class="about-card-desc" data-i18n="CompanionPluginsDesc">${i18n.t('CompanionPluginsDesc') || 'Download the Litefin companion plugins for Jellyfin and Emby servers.'}</span>
                        </div>
                        <div class="about-card-chevron" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 18l6-6-6-6"/>
                            </svg>
                        </div>
                    </button>

                    <!-- Discord Community Card (Row 3 Left) -->
                    <button class="about-action-card focusable" 
                            id="btn-about-discord" 
                            tabindex="0" 
                            data-focusable="true"
                            data-nav-up="#btn-about-issues"
                            data-nav-right="#btn-about-support">
                        <div class="about-card-icon-wrap" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                            </svg>
                        </div>
                        <div class="about-card-info">
                            <span class="about-card-title" data-i18n="DiscordCommunity">${i18n.t('DiscordCommunity') || 'Discord Community'}</span>
                            <span class="about-card-desc" data-i18n="DiscordCommunityDesc">${i18n.t('DiscordCommunityDesc') || 'Join our live Discord chat for questions, discussions, and updates.'}</span>
                        </div>
                        <div class="about-card-chevron" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 18l6-6-6-6"/>
                            </svg>
                        </div>
                    </button>

                    <!-- Support & Donations Card (Row 3 Right) -->
                    <button class="about-action-card focusable" 
                            id="btn-about-support" 
                            tabindex="0" 
                            data-focusable="true"
                            data-nav-up="#btn-about-plugins"
                            data-nav-left="#btn-about-discord">
                        <div class="about-card-icon-wrap" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                            </svg>
                        </div>
                        <div class="about-card-info">
                            <span class="about-card-title" data-i18n="SupportDonations">${i18n.t('SupportDonations') || 'Support & Donations'}</span>
                            <span class="about-card-desc" data-i18n="SupportDonationsDesc">${i18n.t('SupportDonationsDesc') || 'Help support continuous development of Litefin via Buy Me a Coffee or Sponsors.'}</span>
                        </div>
                        <div class="about-card-chevron" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 18l6-6-6-6"/>
                            </svg>
                        </div>
                    </button>
                </div>

                <!-- Updates Section -->
                <h3 class="setting-section-title" data-i18n="Updates">${i18n.t('Updates')}</h3>
                <div class="setting-item">
                    <div class="setting-label">
                        <span class="setting-name" data-i18n="AutoUpdateCheck">${i18n.t('AutoUpdateCheck')}</span>
                        <span class="setting-description" data-i18n="AutoUpdateCheckDesc">${i18n.t('AutoUpdateCheckDesc')}</span>
                    </div>
                    <div class="setting-control">
                        <button class="toggle-switch focusable ${storage.getItem('pref:checkForUpdates') !== 'false' ? 'active' : ''}" 
                                id="toggle-check-updates" 
                                tabindex="0"
                                data-focusable="true">
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-label">
                        <span class="setting-name" data-i18n="CheckForUpdates">${i18n.t('CheckForUpdates')}</span>
                        <span class="setting-description" data-i18n="CheckForUpdatesDesc">${i18n.t('CheckForUpdatesDesc') || 'Trigger a manual check for new releases on GitHub.'}</span>
                    </div>
                    <div class="setting-control">
                        <button class="btn btn-secondary btn-small focusable" id="btn-check-updates" tabindex="0" data-focusable="true" style="width: auto; min-width: 120px;">
                            ${i18n.t('CheckForUpdatesNow')}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Binds DOM event listeners when the About tab is mounted.
     * @param {HTMLElement} container The tab container or page root
     */
    mount(container) {
        this._unbindListeners();

        const find = (selector) => {
            return (container && container.querySelector(selector)) || document.querySelector(selector);
        };

        const addManagedListener = (element, event, handler) => {
            if (!element) return;
            element.addEventListener(event, handler);
            this._listeners.push({ element, event, handler });
        };

        // Action card click triggers
        addManagedListener(find('#btn-about-device-info'), 'click', () => {
            this.modals.showDeviceInformationDialog();
        });

        addManagedListener(find('#btn-about-github'), 'click', () => {
            this.modals.showGitHubDialog('repo');
        });

        addManagedListener(find('#btn-about-issues'), 'click', () => {
            this.modals.showGitHubDialog('issues');
        });

        addManagedListener(find('#btn-about-plugins'), 'click', () => {
            this.modals.showPluginsDialog();
        });

        addManagedListener(find('#btn-about-discord'), 'click', () => {
            this.modals.showDiscordDialog();
        });

        addManagedListener(find('#btn-about-support'), 'click', () => {
            this.modals.showSupportDialog();
        });

        // Toggle Switch for Auto Update Check
        const autoUpdateToggle = find('#toggle-check-updates');
        addManagedListener(autoUpdateToggle, 'click', () => {
            const currentValue = storage.getItem('pref:checkForUpdates') !== 'false';
            const newValue = !currentValue;
            storage.setItem('pref:checkForUpdates', newValue.toString());
            if (autoUpdateToggle) {
                autoUpdateToggle.classList.toggle('active', newValue);
            }
            log.info(`Auto Update Check set to: ${newValue}`);
        });

        // Manual Check for Updates Button
        addManagedListener(find('#btn-check-updates'), 'click', () => {
            versionChecker.checkUpdate(true);
        });
    }

    /**
     * Delegation helpers for dialog triggers.
     */
    showDeviceInformationDialog() {
        return this.modals.showDeviceInformationDialog();
    }

    showGitHubDialog(initialFocus = 'repo') {
        return this.modals.showGitHubDialog(initialFocus);
    }

    showPluginsDialog() {
        return this.modals.showPluginsDialog();
    }

    showDiscordDialog() {
        return this.modals.showDiscordDialog();
    }

    showSupportDialog() {
        return this.modals.showSupportDialog();
    }

    closeDialog() {
        return this.modals.closeDialog();
    }

    getDeviceSpecsData() {
        return getDeviceSpecsData();
    }

    openExternalUrl(url) {
        return openExternalUrl(url);
    }

    /**
     * Handles back key navigation. Dismisses open modal if present.
     * @returns {boolean} True if back key was handled
     */
    handleBack() {
        const overlay = this._getOverlay();
        if (overlay && overlay.querySelector('.about-dialog-modal')) {
            this.closeDialog();
            return true;
        }
        return false;
    }

    /**
     * Cleanly removes all managed DOM listeners.
     * @private
     */
    _unbindListeners() {
        for (let i = 0; i < this._listeners.length; i++) {
            const { element, event, handler } = this._listeners[i];
            if (element && typeof element.removeEventListener === 'function') {
                element.removeEventListener(event, handler);
            }
        }
        this._listeners = [];
    }

    /**
     * Teardown hook.
     */
    destroy() {
        this._unbindListeners();
        if (this.modals) {
            this.modals.destroy();
        }
        this.page = null;
    }
}

export default AboutTab;
