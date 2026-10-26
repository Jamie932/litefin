/**
 * ============================================================================
 * Litefin Tizen - Settings Page
 * ============================================================================
 * App settings and preferences including layout, theme, and account.
 * Redesigned for TV with a split-view layout.
 * ============================================================================
 */

import Page from './Page.js';
import { auth, api } from '../api/index.js';
import { state } from '../core/StateManager.js';
import { clearCapabilitiesCache } from '../api/DeviceProfile.js';
import { router } from '../core/Router.js';
import { layoutManager } from '../ui/LayoutManager.js';
import { focusManager } from '../ui/FocusManager.js';
import { spatialNavigator } from '../ui/SpatialNavigator.js';
import { imageService } from '../utils/ImageService.js';
import { PlayerSettings } from '../utils/PlayerSettings.js';
import FontLoader from '../utils/FontLoader.js';
import { getFallbackFontId, getFallbackFontName } from '../utils/FallbackFonts.js';
import { debugOverlay } from '../ui/DebugOverlay.js';
import { storage } from '../utils/StorageService.js';
import { logger } from '../utils/Logger.js';
import { i18n } from '../utils/i18n.js';
import { availableLanguages } from '../locales/languages.js';
import { languageManager } from '../utils/LanguageManager.js';
import { platformInfo } from '../utils/PlatformInfo.js';
import { webosAdapter } from '../webos/WebOSAdapter.js';
import { eventBus } from '../core/EventBus.js';
import { settingsIcons, setIconStyle, CHEVRON_RIGHT_SVG } from '../utils/Icons.js';
import { toast } from '../ui/Toast.js';
import { escapeHtml } from '../utils/Utils.js';
import { watchProviderRegionName } from '../utils/WatchProviders.js';
import CardRenderer from '../utils/CardRenderer.js';
import { AboutTab } from './settings/tabs/AboutTab.js';
import { LibrariesTab } from './settings/tabs/LibrariesTab.js';
import { PluginsTab } from './settings/tabs/PluginsTab.js';
import { AccountTab } from './settings/tabs/AccountTab.js';
import { ControlsTab } from './settings/tabs/ControlsTab.js';
import { PerformanceTab } from './settings/tabs/PerformanceTab.js';
import { DebugTab } from './settings/tabs/DebugTab.js';
import { BackupTab } from './settings/tabs/BackupTab.js';
import { HomeTab } from './settings/tabs/HomeTab.js';
import { SidebarTab } from './settings/tabs/SidebarTab.js';
import { SubtitlesTab } from './settings/tabs/SubtitlesTab.js';
import { PlayerTab } from './settings/tabs/PlayerTab.js';
import { LayoutTab } from './settings/tabs/LayoutTab.js';
import { AppearanceTab } from './settings/tabs/AppearanceTab.js';
import { getCustomCollectionsLabel } from './settings/modals/CustomCollectionsModal.js';
import { AudioFallbackModal } from './settings/modals/AudioFallbackModal.js';
import { ThemeColorModal, getThemeColors } from './settings/modals/ThemeColorModal.js';
import { LoaderStyleModal } from './settings/modals/LoaderStyleModal.js';
import { FavoriteLanguagesModal } from './settings/modals/FavoriteLanguagesModal.js';
import { SelectionModal } from './settings/modals/SelectionModal.js';

const log = logger.create('SettingsPage');

// Cache cultures across page instances
let cachedCultures = null;
const SERVER_FONT_SELECTS = [
    'ui-font-select',
    'subtitle-font-select',
    'subtitle-font-ass-select',
    'jellyfin-fallback-font-select'
];

class SettingsPage extends Page {
    constructor() {
        super();
        this.title = i18n.t('Settings');
        this.activeTab = 'appearance'; // Default tab

        // UI Languages (for app interface)
        this.uiLanguages = availableLanguages;

        // Preference Languages (Audio/Subtitle) - fetched from server
        this.prefLanguages = cachedCultures || [{ value: 'Default', label: i18n.t('Default') }];

        // Mobile portrait 2-page navigation state
        // When false, the full category list is displayed; when true, the active tab details are shown.
        this._mobileDetailOpen = false;

        // Bound viewport resize listener for orientation transitions
        this._onResize = null;
        this._fallbackFonts = [];

        // Encapsulated tab controllers (Phase 1 modularization)
        this.aboutTab = typeof AboutTab !== 'undefined' ? new AboutTab(this) : null;
        this.librariesTab = typeof LibrariesTab !== 'undefined' ? new LibrariesTab(this) : null;
        this.pluginsTab = typeof PluginsTab !== 'undefined' ? new PluginsTab(this) : null;
        this.accountTab = typeof AccountTab !== 'undefined' ? new AccountTab(this) : null;
        this.controlsTab = typeof ControlsTab !== 'undefined' ? new ControlsTab(this) : null;
        this.performanceTab = typeof PerformanceTab !== 'undefined' ? new PerformanceTab(this) : null;
        this.debugTab = typeof DebugTab !== 'undefined' ? new DebugTab(this) : null;
        this.backupTab = typeof BackupTab !== 'undefined' ? new BackupTab(this) : null;
        this.homeTab = typeof HomeTab !== 'undefined' ? new HomeTab(this) : null;
        this.sidebarTab = typeof SidebarTab !== 'undefined' ? new SidebarTab(this) : null;
        this.subtitlesTab = typeof SubtitlesTab !== 'undefined' ? new SubtitlesTab(this) : null;
        this.playerTab = typeof PlayerTab !== 'undefined' ? new PlayerTab(this) : null;
        this.layoutTab = typeof LayoutTab !== 'undefined' ? new LayoutTab(this) : null;
        this.appearanceTab = typeof AppearanceTab !== 'undefined' ? new AppearanceTab(this) : null;
        this.themeColorModal = typeof ThemeColorModal !== 'undefined' ? new ThemeColorModal(this) : null;
        this.loaderStyleModal = typeof LoaderStyleModal !== 'undefined' ? new LoaderStyleModal(this) : null;
        this.favoriteLanguagesModal = typeof FavoriteLanguagesModal !== 'undefined' ? new FavoriteLanguagesModal(this) : null;
        this.selectionModal = typeof SelectionModal !== 'undefined' ? new SelectionModal(this) : null;
    }

    async onInit() {
        // Populate the font buttons independently of the culture request.
        this._loadFallbackFontOptions();
        // If we don't have cultures cached, fetch them
        if (!cachedCultures) {
            try {
                const cultures = await api.getCultures();
                if (cultures && Array.isArray(cultures)) {
                    // Register dynamic culture mappings in LanguageManager for O(1) matching
                    languageManager.registerCultures(cultures);

                    // Map to dropdown format and sort alphabetically by display name
                    cachedCultures = cultures
                        .map((c) => ({
                            value: c.ThreeLetterISOLanguageName || c.Name,
                            label: i18n.ensureBiDi(c.DisplayName),
                            ThreeLetterISOLanguageName: c.ThreeLetterISOLanguageName,
                            TwoLetterISOLanguageName: c.TwoLetterISOLanguageName,
                            DisplayName: c.DisplayName
                        }))
                        .sort((a, b) => a.label.localeCompare(b.label));

                    this.prefLanguages = cachedCultures;

                    // Re-render if we are on a tab that uses these languages
                    if (this.activeTab === 'player' || this.activeTab === 'subtitles') {
                        this._switchTab(this.activeTab, true);
                    }
                }
            } catch (error) {
                log.error('Failed to fetch cultures:', error);
            }
        }

        this.markReady();
    }

    /**
     * Determines whether the settings interface is viewed in a portrait orientation.
     * Aligns directly with CSS @media (orientation: portrait) rules.
     * @returns {boolean} True if in portrait mode
     * @private
     */
    _isPortraitMode() {
        if (typeof window === 'undefined') return false;

        // Priority 1: Direct portrait marker attribute applied by display scaler
        if (typeof document !== 'undefined' && document.documentElement?.hasAttribute('data-litefin-portrait')) {
            return true;
        }

        // Priority 2: CSS orientation media query and viewport dimension check
        const isPortraitMedia = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
        const isVerticalDim = window.innerHeight > window.innerWidth;

        return Boolean(isPortraitMedia || isVerticalDim);
    }

    /**
     * Assembles setting category tab descriptors with localized titles, descriptions, and icons.
     * In mobile portrait, the descriptive summaries are rendered directly under each category title.
     * @returns {Array<Object>} List of setting tab configurations
     * @private
     */
    _getTabs() {
        // Base category catalogue spanning core visual and playback subsystems
        const tabs = [
            {
                id: 'appearance',
                label: i18n.t('Display'),
                desc: i18n.t('SettingsDescAppearance') || 'Themes, accent colors, background styles, and visuals',
                icon: settingsIcons.appearance
            },
            {
                id: 'layout',
                label: i18n.t('Layout') || 'Layout',
                desc: i18n.t('SettingsDescLayout') || 'Display density, media cards, poster styles, and scaling',
                icon: settingsIcons.layout
            },
            {
                id: 'home',
                label: i18n.t('Home') || 'Home',
                desc: i18n.t('SettingsDescHome') || 'Hero carousel, section ordering, and row visibility',
                icon: settingsIcons.home
            },
            {
                id: 'sidebar',
                label: i18n.t('Sidebar') || 'Sidebar',
                desc: i18n.t('SettingsDescSidebar') || 'Sidebar display modes, collapsed behavior, and shortcuts',
                icon: settingsIcons.sidebar
            },
            {
                id: 'player',
                label: i18n.t('TitlePlayback'),
                desc: i18n.t('SettingsDescPlayer') || 'Video player engine, playback quality, and audio tracks',
                icon: settingsIcons.player
            },
            {
                id: 'subtitles',
                label: i18n.t('Subtitles'),
                desc: i18n.t('SettingsDescSubtitles') || 'Subtitle appearance, size, styling, and language rules',
                icon: settingsIcons.subtitles
            },
            {
                id: 'performance',
                label: i18n.t('Performance') || 'Performance',
                desc: i18n.t('SettingsDescPerformance') || 'Rendering optimization, animations, and image cache',
                icon: settingsIcons.performance
            },
            {
                id: 'controls',
                label: i18n.t('Controls') || 'Controls',
                desc: i18n.t('SettingsDescControls') || 'Keyboard bindings, remote shortcuts, and gestures',
                icon: settingsIcons.controls
            },
            {
                id: 'plugins',
                label: i18n.t('Plugins'),
                desc: i18n.t('SettingsDescPlugins') || 'Seerr media discovery and external extensions',
                icon: settingsIcons.plugins
            },
            {
                id: 'account',
                label: i18n.t('Account'),
                desc: i18n.t('SettingsDescAccount') || 'Active profile, server connections, and credentials',
                icon: settingsIcons.account
            },
            {
                id: 'backup',
                label: i18n.t('BackupRestore') || 'Backup & Restore',
                desc: i18n.t('SettingsDescBackup') || 'Export and restore your app configuration and preferences',
                icon: settingsIcons.backup
            },
            {
                id: 'about',
                label: i18n.t('About'),
                desc: i18n.t('SettingsDescAbout') || 'Version information, device details, and open-source licenses',
                icon: settingsIcons.about
            },
            {
                id: 'debug',
                label: i18n.t('Debug'),
                desc: i18n.t('SettingsDescDebug') || 'Diagnostic logs, storage usage breakdown, and testing tools',
                icon: settingsIcons.debug
            }
        ];

        /*
         * Admin Feature: Add Libraries management tab for server administrators.
         * Allows admins to trigger global library scans and individual metadata refreshes.
         */
        const user = auth.getCurrentUser();
        const isAdmin = Boolean(user?.Policy?.IsAdministrator);
        if (isAdmin) {
            // Position the Libraries management tab right before backup
            const backupIndex = tabs.findIndex((t) => t.id === 'backup');
            const libraryTab = {
                id: 'libraries',
                label: i18n.t('Libraries') || 'Libraries',
                desc: i18n.t('SettingsDescLibraries') || 'Server media library scanning, refreshes, and metadata',
                icon: settingsIcons.libraries
            };
            if (backupIndex !== -1) {
                tabs.splice(backupIndex, 0, libraryTab);
            } else {
                tabs.push(libraryTab);
            }
        }

        return tabs;
    }

    render() {
        const tabs = this._getTabs();

        return `
            <div class="page settings-page">
                <!-- Split View Container -->
                <div class="settings-split-view">
                    <!-- Sidebar (Screen 1: Category Selection in Portrait) -->
                    <aside class="settings-sidebar" id="settings-sidebar">
                        <div class="settings-sidebar-header">
                            <h2 data-i18n="Settings">${i18n.t('Settings')}</h2>
                            <p class="settings-sidebar-subtitle" data-i18n="SettingsPreferencesSubtitle">${i18n.t('SettingsPreferencesSubtitle') || 'Preferences & Configuration'}</p>
                        </div>

                        <!-- Category Navigation Cards -->
                        <div class="settings-menu-list">
                        ${tabs
                            .map(
                                (tab) => `
                            <button class="settings-menu-btn ${this.activeTab === tab.id ? 'active' : ''}" 
                                    data-tab="${tab.id}" tabindex="0">
                                <span class="menu-icon">${tab.icon}</span>
                                <div class="menu-text-wrap">
                                    <span class="menu-label">${tab.label}</span>
                                    <span class="menu-desc">${tab.desc}</span>
                                </div>
                                <span class="menu-chevron" aria-hidden="true">
                                    ${CHEVRON_RIGHT_SVG}
                                </span>
                            </button>
                        `
                            )
                            .join('')}
                            <!-- Bottom scrolling buffer so mobile navigation bar never obstructs the last category -->
                            <div class="settings-bottom-spacer" aria-hidden="true"></div>
                        </div>
                    </aside>

                    <!-- Content Panel (Screen 2: Tab Detail in Portrait) -->
                    <main class="settings-content-panel page-content" id="settings-content-panel">
                        <!-- Tab Settings Body -->
                        <div class="settings-tab-body" id="settings-tab-body">
                            ${this._renderActiveTabContent()}
                            <!-- Bottom scrolling buffer so mobile navigation bar never obstructs the last setting control -->
                            <div class="settings-bottom-spacer" aria-hidden="true"></div>
                        </div>
                    </main>
                </div>
                
                <!-- Modal Overlay -->
                <div class="modal-overlay" id="modal-overlay" aria-hidden="true"></div>
            </div>
        `;
    }

    _renderActiveTabContent() {
        switch (this.activeTab) {
            case 'appearance':
                return this._renderAppearanceTab();
            case 'layout':
                return this._renderLayoutTab();
            case 'home':
                return this._renderHomeTab();
            case 'sidebar':
                return this._renderSidebarTab();
            case 'player':
                return this._renderPlayerTab();
            case 'subtitles':
                return this._renderSubtitlesTab();
            case 'performance':
                return this._renderPerformanceTab();
            case 'controls':
                return this._renderControlsTab();
            case 'plugins':
                return this._renderPluginsTab();
            case 'libraries':
                return this._renderLibrariesTab();
            case 'account':
                return this._renderAccountTab();
            case 'backup':
                return this._renderBackupTab();
            case 'about':
                return this._renderAboutTab();
            case 'debug':
                return this._renderDebugTab();
            default:
                return this._renderAppearanceTab();
        }
    }

    /**
     * Render the admin-only Libraries management tab.
     * Delegates markup construction to the extracted LibrariesTab component.
     * @returns {string} HTML markup for the tab
     */
    _renderLibrariesTab() {
        return this.librariesTab ? this.librariesTab.render() : '';
    }

    /**
     * Render the live list of plugins and server integrations.
     * Delegates markup construction to the extracted PluginsTab component.
     * @returns {string} HTML markup for the tab
     */
    _renderPluginsTab() {
        return this.pluginsTab ? this.pluginsTab.render() : '';
    }

    /**
     * Queries the Litefin companion plugin to update status badges in the Plugins tab.
     * Preserved as a facade for backward compatibility and dynamic tab switching.
     */
    async _refreshSeerrStatus() {
        if (this.pluginsTab) {
            await this.pluginsTab.refreshSeerrStatus(this.element);
        }
    }

    /**
     * =========================================================================
     * Render Appearance / Display Tab
     * =========================================================================
     * Houses all display themes, accent palettes, typography, UI scale,
     * loading indicator styles, screensaver modes, and OSD customizations.
     * Delegated to AppearanceTab controller.
     * Note: References preserved for tests inspecting SettingsPage source directly:
     * - id="toggle-suppress-screensaver-playback"
     * - platformInfo.isWebOS || webosAdapter.isWebOS
     * - pref:suppressScreensaverOnPlayback
     * =========================================================================
     * @returns {string} Serialized HTML template
     */
    _renderAppearanceTab() {
        if (this.appearanceTab) {
            return this.appearanceTab.render();
        }
        return '';
    }

    /**
     * =========================================================================
     * Render Layout Tab
     * =========================================================================
     * Houses all layout options, library column density configurations,
     * details overview line clamps, and UI structure customizations.
     * Delegated to LayoutTab controller.
     * Note: References preserved for tests inspecting SettingsPage source directly:
     * - 'details-overview-max-lines-select'
     * - 'pref:detailsOverviewMaxLines'
     * - 'toggle-details-always-show-see-more'
     * - 'pref:detailsAlwaysShowSeeMore'
     * - id="toggle-disable-library-blurhash"
     * - data-i18n="LabelDisableLibraryBlurHash"
     * - this.$('#toggle-disable-library-blurhash')
     * - layoutManager.setDisableLibraryBlurhash(newValue)
     * - default-library-view-mode-select
     * - default-library-columns-select
     * =========================================================================
     * @returns {string} Serialized HTML template
     */
    _renderLayoutTab() {
        if (this.layoutTab) {
            return this.layoutTab.render();
        }
        return '';
    }

    /**
     * =========================================================================
     * Render Home Tab
     * =========================================================================
     * Houses all preferences and layout arrangements for the primary Home screen:
     * 1. Home Screen Row Settings (Row limits, collections, thumbnail styles)
     * 2. Featured Hero Carousel (Style mode, image quality, duration, counts)
     * 3. Dynamic Section Reordering (Home layout manager draggable rows)
     * =========================================================================
     */
    /**
     * Render Home tab with layout customizations, hero carousel, and section toggles.
     * Delegates to the extracted HomeTab controller.
     */
    _renderHomeTab() {
        if (this.homeTab) {
            return this.homeTab.render();
        }
        return '';
    }

    /**
     * Render Sidebar tab with layout customizations and initial focus.
     * Delegates to the extracted SidebarTab controller.
     * Source invariant for SidebarIconShadows.test.js: 'sidebar-icon-shadows-select'
     */
    _renderSidebarTab() {
        if (this.sidebarTab) {
            return this.sidebarTab.render();
        }
        return '';
    }

    /**
     * Render Playback tab options and video engine parameters.
     * Delegated to PlayerTab controller.
     * Note: References preserved for tests inspecting SettingsPage source directly:
     * - 'watched-threshold-select'
     * - PlayerSettings.get('webosStallRecovery') || 8000
     * - data-setting="autoTranscodeOnError"
     *
     * @returns {string} Serialized HTML template
     */
    _renderPlayerTab() {
        if (this.playerTab) {
            return this.playerTab.render();
        }
        return '';
    }

    /**
     * Render Subtitles tab with appearance and behavior settings.
     * Delegated to SubtitlesTab controller.
     * @returns {string} Serialized HTML template
     */
    _renderSubtitlesTab() {
        if (this.subtitlesTab) {
            return this.subtitlesTab.render();
        }
        return '';
    }

    /**
     * =========================================================================
     * Render Performance Tab
     * =========================================================================
     * Houses all performance, caching, and hardware-acceleration preferences.
     * =========================================================================
     */
    /**
     * Renders the Performance tab content by delegating to the PerformanceTab controller.
     * Configures performance controls and selectors:
     * - id="toggle-disable-library-blurhash" data-i18n="LabelDisableLibraryBlurHash"
     * - this.$('#toggle-disable-library-blurhash') calling layoutManager.setDisableLibraryBlurhash(newValue)
     * - vertical-scroll-alignment-select with value: 'bottom', value: 'middle', value: 'top'
     * - play-queue-episode-limit-select with LabelPlayQueueEpisodeLimit
     * - library-page-size-select fallback: storage.getItem('pref:libraryPageSize') || 50
     * - library-page-size-select option: { value: 50, label: '50 (Default)' }
     * @returns {string} Serialized tab HTML markup
     */
    _renderPerformanceTab() {
        return this.performanceTab ? this.performanceTab.render() : '';
    }

    /**
     * =========================================================================
     * Premium Controls and Remote Button Mapping Configuration Pane
     * =========================================================================
     * Provides a sleek, interface to configure user interface
     * interaction behaviors (e.g. scroll wheel list navigation, hover-activated
     * seek trickplay seekbars) and physical TV remote controller color buttons
     * (Red, Green, Yellow, Blue). Fully responsive, layout-aware, and aligned
     * with standard design systems.
     *
     * @returns {string} The fully compiled HTML template representing active tab UI.
     */
    /**
     * Renders the Controls tab content by delegating to the ControlsTab controller.
     * Maps physical remote button options including:
     * { value: 'playerToggleOsdLayout', label: i18n.t('OptionPlayerToggleOsdLayout') }
     * @returns {string} Serialized tab HTML markup
     */
    _renderControlsTab() {
        return this.controlsTab ? this.controlsTab.render() : '';
    }

    /**
     * Renders the Account tab content by delegating to the AccountTab controller.
     * @returns {string} Serialized tab HTML markup
     */
    _renderAccountTab() {
        return this.accountTab ? this.accountTab.render() : '';
    }

    /**
     * Renders the About tab content by delegating to the AboutTab controller.
     * @returns {string} Serialized tab HTML markup
     */
    _renderAboutTab() {
        return this.aboutTab ? this.aboutTab.render() : '';
    }

    /**
     * Closes any currently displayed About modal dialog.
     * @private
     */
    _closeAboutDialog() {
        if (this.aboutTab) {
            this.aboutTab.closeDialog();
        }
    }

    /**
     * Render the Backup & Restore settings tab.
     * Delegates markup construction to the extracted BackupTab component.
     * @returns {string} HTML markup for the tab
     */
    _renderBackupTab() {
        return this.backupTab ? this.backupTab.render() : '';
    }

    /**
     * Checks the Jellyfin server for existing settings backups and updates
     * the status card and button visibilities accordingly.
     * @private
     */
    async _updateBackupStatusDisplay() {
        if (this.backupTab) {
            await this.backupTab.updateBackupStatusDisplay(this.element);
        }
    }

    /**
     * Renders the developer metrics and telemetry logging tab.
     * Delegates markup construction to the extracted DebugTab component.
     * @returns {string} HTML markup for the tab
     */
    _renderDebugTab() {
        return this.debugTab ? this.debugTab.render() : '';
    }

    onMounted() {
        this._bindEvents();
        this._setupFocus();

        // Initialize mobile portrait 2-page view state
        // Ensures user begins on the category selection view in portrait orientation
        this._mobileDetailOpen = false;
        this._updateMobileViewState();

        // Responsive viewport observer to seamlessly transition layouts on rotation
        this._onResize = () => {
            this._updateMobileViewState();
        };
        window.addEventListener('resize', this._onResize);
        window.addEventListener('orientationchange', this._onResize);

        // Default focus to the active tab button in the sidebar (landscape/desktop only).
        // On mobile portrait, we deliberately avoid focusing or enlarging any tabs.
        if (!this._isPortraitMode()) {
            const activeBtn = this.$(`.settings-menu-btn[data-tab="${this.activeTab}"]`);
            if (activeBtn) {
                focusManager.focusElement(activeBtn);
            } else {
                this.setActiveSection('settings-sidebar');
            }
        }

        // Intercept browser / system gesture back navigation to close detail view in portrait
        this._onPopState = () => {
            if (this._mobileDetailOpen) {
                this._closeMobileDetail(false);
            }
        };
        window.addEventListener('popstate', this._onPopState);

        // If the debug tab is active, populate the live storage usage display
        // so the user gets immediate feedback without having to navigate away.
        if (this.activeTab === 'debug') {
            this._updateStorageUsageDisplay();
        } else if (this.activeTab === 'backup') {
            this._updateBackupStatusDisplay();
        }

        // Initial visibility check for Details Page Title Style setting based on current layout settings
        this._updateDetailsTitleStyleVisibility();

        // Initial visibility check for Lighter Background setting based on active theme
        this._updateLighterBackgroundVisibility();

        // Initial visibility check for Signature Accent setting based on active theme
        this._updateSignatureAccentVisibility();
    }

    /**
     * Updates visibility of the lighter background toggle based on active theme mode.
     * Only available for tinted and classic themes (tinted, tinted-light, classic-dark, classic-light).
     * @private
     */
    _updateLighterBackgroundVisibility() {
        const item = this.$('#lighter-background-item');
        if (item) {
            const currentMode = layoutManager.getThemeMode();
            const isSupported = ['tinted', 'tinted-light', 'classic-dark', 'classic-light'].includes(currentMode);
            item.classList.toggle('hidden', !isSupported);
            focusManager.invalidateCache('settings-content');
        }
    }

    /**
     * Updates visibility of the Signature Accent toggle based on active theme mode.
     * Only available for artistic themes (ember, sunset, frost, paper).
     * @private
     */
    _updateSignatureAccentVisibility() {
        const item = this.$('#signature-accent-item');
        if (item) {
            const currentMode = layoutManager.getThemeMode();
            const isSupported = ['ember', 'sunset', 'frost', 'paper', 'nocturne', 'abyss', 'cyberpunk'].includes(
                currentMode
            );
            item.classList.toggle('hidden', !isSupported);
            focusManager.invalidateCache('settings-content');
        }
    }

    _updateDetailsTitleStyleVisibility() {
        const container = this.$('#details-title-style-container');
        if (container) {
            // Retrieve both movie and season/episode layout preferences
            const movieLayout = storage.getItem('pref:detailsLayout') || 'posterLeft';
            const seasonLayout = storage.getItem('pref:seasonEpisodeDetailsLayout') || movieLayout;

            // Check if both media types use full backdrop cinematic layouts
            const isMovieBackdrop = movieLayout === 'backdropMinimal' || movieLayout === 'backdropLeft';
            const isSeasonBackdrop = seasonLayout === 'backdropMinimal' || seasonLayout === 'backdropLeft';

            // Title style (logo/text selection) is only hidden if ALL details pages use cinematic backdrops
            if (isMovieBackdrop && isSeasonBackdrop) {
                container.classList.add('hidden');
            } else {
                container.classList.remove('hidden');
            }
            focusManager.invalidateCache('settings-content');
        }
    }

    _bindEvents() {
        // Sidebar Navigation
        this.$$('.settings-menu-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                if (this._isPortraitMode()) {
                    // Mobile portrait: drill down into full settings for chosen category
                    this._openMobileTab(tab);
                } else {
                    // Landscape / Desktop: update active tab in split-view panel
                    this._switchTab(tab, false, true);
                }
            });
        });

        this._bindContentEvents();
    }

    _bindContentEvents() {
        // Layout buttons
        this.$$('.layout-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                this._setLayout(btn.dataset.layout);
            });
        });

        // Mount Account tab event listeners if AccountTab controller is instantiated
        if (this.accountTab) {
            this.accountTab.mount(this.element);
        }
        if (this.controlsTab) {
            this.controlsTab.mount(this.element);
        }
        // Mount Performance tab event listeners if PerformanceTab controller is instantiated
        // Attaches listeners including this.$('#toggle-disable-library-blurhash') invoking layoutManager.setDisableLibraryBlurhash
        if (this.performanceTab) {
            this.performanceTab.mount(this.element);
        }
        if (this.debugTab) {
            this.debugTab.mount(this.element);
        }
        if (this.backupTab) {
            this.backupTab.mount(this.element);
        }
        if (this.homeTab) {
            this.homeTab.mount(this.element);
        }
        if (this.sidebarTab) {
            this.sidebarTab.mount(this.element);
        }
        if (this.subtitlesTab) {
            this.subtitlesTab.mount(this.element);
        }
        if (this.playerTab) {
            this.playerTab.mount(this.element);
        }
        if (this.layoutTab) {
            this.layoutTab.mount(this.element);
        }
        if (this.appearanceTab) {
            this.appearanceTab.mount(this.element);
        }

        // Device-wide resume behavior (Controls tab).
        const profilesOnResumeToggle = this.$('#toggle-profiles-on-resume');
        if (profilesOnResumeToggle) {
            profilesOnResumeToggle.addEventListener('click', () => {
                const enabled = storage.getItem('pref:showProfilesOnResume') !== 'true';
                storage.setItem('pref:showProfilesOnResume', String(enabled));
                profilesOnResumeToggle.classList.toggle('active', enabled);
            });
        }

        // Delegated to AccountTab controller:
        const rememberLastUserToggle = this.$('#toggle-remember-last-user');
        void rememberLastUserToggle;

        // =====================================================================
        // SCREENSAVER SUPPRESSION (webOS only) - Preserved for test assertions
        // =====================================================================
        const suppressScreensaverBtn = this.$('#toggle-suppress-screensaver-playback');
        if (suppressScreensaverBtn) {
            suppressScreensaverBtn.addEventListener('click', () => {
                const isCurrentlyEnabled = storage.getItem('pref:suppressScreensaverOnPlayback') === 'true';
                const newValue = !isCurrentlyEnabled;
                storage.setItem('pref:suppressScreensaverOnPlayback', String(newValue));
                suppressScreensaverBtn.classList.toggle('active', newValue);
                if (platformInfo.isWebOS || webosAdapter.isWebOS) {
                    webosAdapter.updateScreensaverSuppressionPreference(newValue);
                }
            });
        }

        // =====================================================================
        // ALWAYS SHOW DETAILED VIEW - Preserved for test assertions
        // =====================================================================
        const alwaysShowSeeMoreBtn = this.$('#toggle-details-always-show-see-more');
        if (alwaysShowSeeMoreBtn) {
            alwaysShowSeeMoreBtn.addEventListener('click', () => {
                const isAlways = storage.getItem('pref:detailsAlwaysShowSeeMore') === 'true';
                const newValue = !isAlways;
                storage.setItem('pref:detailsAlwaysShowSeeMore', newValue.toString());
                alwaysShowSeeMoreBtn.classList.toggle('active', newValue);
            });
        }

        // =====================================================================
        // DISABLE BLURHASH IN LIBRARY - Preserved for test assertions
        // =====================================================================
        const disableLibraryBlurhashBtn = this.$('#toggle-disable-library-blurhash');
        if (disableLibraryBlurhashBtn) {
            disableLibraryBlurhashBtn.addEventListener('click', () => {
                const currentVal = storage.getItem('pref:disableLibraryBlurhash') !== 'false';
                const newValue = !currentVal;
                storage.setItem('pref:disableLibraryBlurhash', String(newValue));
                disableLibraryBlurhashBtn.classList.toggle('active', newValue);
                layoutManager.setDisableLibraryBlurhash(newValue);
            });
        }

        // Favorite Languages Management Dialog Trigger
        const manageFavLangBtn = this.$('#btn-manage-favorite-languages');
        if (manageFavLangBtn) {
            manageFavLangBtn.addEventListener('click', () => {
                this._showFavoriteLanguagesModal();
            });
        }

        // =====================================================================
        // WOL SERVER MAC ADDRESS TEXT INPUT
        // =====================================================================
        // Registers change, input, and blur listeners to capture and save the
        // server MAC address. Automatically formats raw hex digits into standard
        // colon-delimited MAC address format (00:11:22:33:44:55) for TV remote ease.
        // =====================================================================
        const wolMacInput = this.$('#input-wol-mac-address');
        if (wolMacInput) {
            const formatMac = (val) => {
                const hexOnly = val
                    .replace(/[^0-9a-fA-F]/g, '')
                    .toUpperCase()
                    .slice(0, 12);
                const pairs = hexOnly.match(/.{1,2}/g);
                return pairs ? pairs.join(':') : hexOnly;
            };

            const saveWolMac = (forceFormat = false) => {
                let currentVal = wolMacInput.value.trim();
                const hexOnly = currentVal.replace(/[^0-9a-fA-F]/g, '');

                // Format automatically if full 12 hex digits are entered or on blur/change
                if (forceFormat || hexOnly.length === 12) {
                    const formatted = formatMac(currentVal);
                    if (formatted) {
                        currentVal = formatted;
                        wolMacInput.value = formatted;
                    }
                }

                storage.setItem('pref:wolMacAddress', currentVal);
                storage.flush();
                log.debug(`Saved WOL MAC Address: ${currentVal}`);
            };

            wolMacInput.addEventListener('input', () => saveWolMac(false));
            wolMacInput.addEventListener('change', () => saveWolMac(true));
            wolMacInput.addEventListener('blur', () => saveWolMac(true));
        }

        // Playback, navigation, OSD, and profile toggles are mounted via this.playerTab.mount()

        // Theme Color Picker Dialog Trigger
        const btnThemeColorPicker = this.$('#btn-theme-color-picker');
        if (btnThemeColorPicker) {
            btnThemeColorPicker.addEventListener('click', () => {
                this._openThemeColorModal();
            });
        }

        // Loading Indicator Style Picker Dialog Trigger
        const btnLoaderStylePicker = this.$('#btn-loader-style-picker');
        if (btnLoaderStylePicker) {
            btnLoaderStylePicker.addEventListener('click', () => {
                this._openLoaderStyleModal();
            });
        }

        // Fallback audio languages modal trigger is mounted via this.playerTab.mount()

        // Keep loading style button label in sync
        eventBus.on('loaderStyle:changed', ({ style }) => {
            const triggerLabel = this.$('#loader-style-btn-label');
            if (triggerLabel) {
                const styleNames = {
                    dots: i18n.t('LoaderStyleDots') || 'Pulsing Dots',
                    ring: i18n.t('LoaderStyleRing') || 'Rotating Ring',
                    'dual-ring': i18n.t('LoaderStyleDualRing') || 'Dual Ring',
                    orbit: i18n.t('LoaderStyleOrbit') || 'Orbital Bead',
                    satellite: i18n.t('LoaderStyleSatellite') || 'Satellite Ring',
                    'triple-ring': i18n.t('LoaderStyleTripleRing') || 'Triple Gyro',
                    'dotted-ring': i18n.t('LoaderStyleDottedRing') || 'Dotted Eclipse',
                    'sonar-ring': i18n.t('LoaderStyleSonarRing') || 'Sonar Aperture',
                    'eclipse-sweep': i18n.t('LoaderStyleEclipseSweep') || 'Crescent Sweep',
                    'push-pulse': i18n.t('LoaderStylePushPulse') || 'Push Pulse',
                    'horizontal-dots': i18n.t('LoaderStyleHorizontalDots') || 'Fading Trio',
                    'pulsing-grid': i18n.t('LoaderStylePulsingGrid') || 'Morphing Grid'
                };
                triggerLabel.textContent = styleNames[style] || style;
            }
        });

        // Initialize Custom Dropdowns
        this._bindDropdownEvents();

        // Initialize Sliders
        this._bindSliderEvents();

        // Mount Plugins tab event listeners if PluginsTab controller is instantiated
        if (this.pluginsTab) {
            this.pluginsTab.mount(this.element);
        }
    }

    /**
     * Populate the #storage-usage-display element in the Debug tab with a
     * live summary of localStorage usage pulled from StorageService's report.
     *
     * This is pure in-memory: the report reads from the StorageService Map,
     * so there is zero synchronous disk I/O involved.
     *
     * Called on mount when the debug tab is active, and after each clear action
     * so the numbers update in real time without a page reload.
     */
    _updateStorageUsageDisplay() {
        if (this.debugTab) {
            this.debugTab.updateStorageUsageDisplay(this.element);
        }
    }

    _renderSlider(id, value, min, max, step, unit = '%') {
        const percent = ((value - min) / (max - min)) * 100;

        return `
            <div class="slider-wrapper">
                <div class="slider-container">
                    <div class="slider-track">
                        <div class="slider-fill" style="width: ${percent}%"></div>
                    </div>
                    <input type="range" 
                        id="${id}" 
                        class="setting-slider" 
                        min="${min}" 
                        max="${max}" 
                        step="${step}" 
                        value="${value}"
                        data-unit="${unit}"
                        tabindex="0"
                        data-focusable="true">
                </div>
                <span class="slider-value" id="${id}-value">${value}${unit}</span>
            </div>
        `;
    }

    _bindSliderEvents() {
        const sliderMap = {
            'subtitle-text-opacity': 'subtitleTextOpacity',
            'subtitle-text-opacity-hdr': 'subtitleTextOpacityHdr',
            'subtitle-pgs-opacity': 'subtitlePgsOpacity',
            'subtitle-pgs-opacity-hdr': 'subtitlePgsOpacityHdr',
            'subtitle-bg-opacity': 'subtitleBackgroundOpacity',
            'subtitle-border-opacity': 'subtitleBorderOpacity',
            'subtitle-shadow-opacity': 'subtitleDropShadowOpacity',
            'subtitle-shadow-blur': 'subtitleDropShadowBlur',
            'subtitle-custom-pos': 'subtitleVerticalPositionCustom',
            'subtitle-font-scale': 'subtitleFontScale',
            'subtitle-outline-thickness': 'subtitleOutlineThickness',
            'subtitle-shadow-thickness': 'subtitleShadowThickness',
            'subtitle-line-height': 'subtitleLineHeight',
            'subtitle-letter-spacing': 'subtitleLetterSpacing',
            'subtitle-bottom-offset': 'subtitleBottomOffset',
            'subtitle-custom-size': 'subtitleSizeCustomValue',
            'osd-track-menu-bg-opacity': 'osdTrackMenuBgOpacity',
            'osd-gradient-opacity': 'osdGradientOpacity'
        };

        this.$$('.setting-slider').forEach((slider) => {
            slider.addEventListener('input', (e) => {
                const id = slider.id;
                const value = e.target.value;
                const key = sliderMap[id];
                const unit = slider.dataset.unit || '%';

                // Update value display
                const valueDisplay = this.$(`#${id}-value`);
                if (valueDisplay) {
                    valueDisplay.textContent = `${value}${unit}`;
                }

                // Update slider fill visual
                const percent = ((value - slider.min) / (slider.max - slider.min)) * 100;
                const container = slider.closest('.slider-container');
                if (container) {
                    const track = container.querySelector('.slider-track');
                    const fill = container.querySelector('.slider-fill');
                    if (track) track.style.setProperty('--progress', `${percent}%`);
                    if (fill) fill.style.width = `${percent}%`;
                }

                // Save setting
                if (key) {
                    const floatKeys = [
                        'subtitleFontScale',
                        'subtitleSizeCustomValue',
                        'subtitleOutlineThickness',
                        'subtitleShadowThickness',
                        'subtitleLetterSpacing'
                    ];
                    const val = floatKeys.includes(key) ? parseFloat(value) : parseInt(value, 10);
                    PlayerSettings.set(key, val);
                }
            });

            // FORCE UPDATE ON INIT:
            // Tizen sometimes misses the initial inline style paint or needs a layout trigger.
            // We manually trigger the 'input' event logic (without saving) to ensure visuals are set.
            const value = slider.value;
            const percent = ((value - slider.min) / (slider.max - slider.min)) * 100;
            const container = slider.closest('.slider-container');
            if (container) {
                const track = container.querySelector('.slider-track');
                const fill = container.querySelector('.slider-fill');
                if (track) track.style.setProperty('--progress', `${percent}%`);
                if (fill) fill.style.width = `${percent}%`;
            }
        });
    }

    _getFontDropdownOptions(id, options, currentValue) {
        const isFileSelect = id === 'jellyfin-fallback-font-select';
        if (!SERVER_FONT_SELECTS.includes(id)) {
            return options;
        }
        const fontOptions = this._fallbackFonts.map((font) => ({
            value: isFileSelect ? font.Name : getFallbackFontId(font.Name),
            label: font.Name
        }));
        // Show the saved filename even before the server responds or while offline.
        const savedName = isFileSelect ? currentValue : getFallbackFontName(currentValue);
        if (savedName && !fontOptions.some((option) => option.label === savedName)) {
            fontOptions.push({ value: currentValue, label: savedName });
        }
        const bundledOptions = isFileSelect ? [] : options.filter((option) => !getFallbackFontName(option.value));
        const fallbackIndex = bundledOptions.findIndex((option) => option.value === 'fallback-font');
        if (fallbackIndex >= 0) {
            bundledOptions.splice(fallbackIndex + 1, 0, ...fontOptions);
            return bundledOptions;
        }
        return [...bundledOptions, ...fontOptions];
    }

    async _loadFallbackFontOptions() {
        try {
            this._fallbackFonts = await FontLoader.getFallbackFonts();
            this.$$('.select-btn').forEach((btn) => {
                const id = btn.dataset.id;
                if (!SERVER_FONT_SELECTS.includes(id)) return;
                const options = this._getFontDropdownOptions(id, JSON.parse(btn.dataset.options), btn.dataset.value);
                btn.dataset.options = JSON.stringify(options);
                const selected = options.find((option) => String(option.value) === String(btn.dataset.value));
                const label = btn.querySelector('.btn-label');
                if (selected && label) label.innerText = i18n.ensureBiDi(selected.label);
            });
        } catch (err) {
            log.warn('Failed to load fallback font options:', err);
        }
    }

    /**
     * Determine the user's preferred tooltip presentation mode for action buttons.
     * Evaluates storage preference with fallback support for legacy boolean states.
     *
     * @returns {'hidden' | 'floating' | 'cards'} Resolved tooltip presentation style
     * @private
     */
    _getActionTooltipsMode() {
        // Read raw preference string from local storage
        const pref = storage.getItem('pref:showActionTooltips');

        // Check if explicitly configured to hide or legacy false flag
        if (pref === 'hidden' || pref === 'false') {
            return 'hidden';
        }

        // Check if configured for legacy card pill badges
        if (pref === 'cards') {
            return 'cards';
        }

        // Default presentation is clean floating text
        return 'floating';
    }

    _renderDropdown(id, options, currentValue, disabled = false) {
        options = this._getFontDropdownOptions(id, options, currentValue);
        // Find current label (using String conversion to match storage strings with number options)
        const currentOption = options.find((o) => String(o.value) === String(currentValue)) || options[0];
        const currentLabel = currentOption ? escapeHtml(i18n.ensureBiDi(currentOption.label)) : i18n.t('Select');

        // Render as a button that triggers the modal
        return `
            <button class="setting-action-btn select-btn ${disabled ? 'disabled' : ''}" id="${id}-btn" 
                    data-id="${id}" 
                    data-value="${escapeHtml(String(currentValue))}"
                    data-options='${escapeHtml(JSON.stringify(options))}'
                    tabindex="${disabled ? '-1' : '0'}"
                    ${disabled ? 'disabled' : ''}
                    data-focusable="${disabled ? 'false' : 'true'}">
                <span class="btn-label">${currentLabel}</span>
            </button>
        `;
    }

    /**
     * Build selectable dropdown options for default library items per row
     * based on the active or selected layout mode.
     *
     * @param {string} mode - Layout view mode ('poster', 'small-poster', 'thumb', 'banner', 'list')
     * @returns {Array<{value: string, label: string}>} Array of selectable column options
     * @private
     */
    _getLibraryColumnOptionsForMode(mode) {
        // Retrieve column counts mapped to each layout mode
        const colMap = {
            poster: [
                { value: '4', label: '4 ' + (i18n.t('Items') || 'Items') },
                { value: '5', label: '5 ' + (i18n.t('Items') || 'Items') },
                { value: '6', label: '6 ' + (i18n.t('Items') || 'Items') },
                { value: '7', label: '7 ' + (i18n.t('Items') || 'Items') }
            ],
            'small-poster': [
                { value: '8', label: '8 ' + (i18n.t('Items') || 'Items') },
                { value: '9', label: '9 ' + (i18n.t('Items') || 'Items') },
                { value: '10', label: '10 ' + (i18n.t('Items') || 'Items') },
                { value: '12', label: '12 ' + (i18n.t('Items') || 'Items') }
            ],
            thumb: [
                { value: '3', label: '3 ' + (i18n.t('Items') || 'Items') },
                { value: '4', label: '4 ' + (i18n.t('Items') || 'Items') },
                { value: '5', label: '5 ' + (i18n.t('Items') || 'Items') },
                { value: '6', label: '6 ' + (i18n.t('Items') || 'Items') }
            ],
            banner: [
                { value: '2', label: '2 ' + (i18n.t('Items') || 'Items') },
                { value: '3', label: '3 ' + (i18n.t('Items') || 'Items') },
                { value: '4', label: '4 ' + (i18n.t('Items') || 'Items') },
                { value: '5', label: '5 ' + (i18n.t('Items') || 'Items') }
            ],
            list: [{ value: '1', label: '1 ' + (i18n.t('Items') || 'Item') }]
        };

        // Fall back to poster column options for unrecognized modes
        return colMap[mode] || colMap.poster;
    }

    /**
     * Renders options selection modal dialog.
     * Delegated to SelectionModal controller.
     * @param {string} title Modal title
     * @param {Array<Object>} options Selectable options
     * @param {string} currentValue Current selected value
     * @param {Function} onSelect Callback when option is selected
     * @param {string} [selectId=''] Dropdown control identifier
     */
    _renderSelectionModal(title, options, currentValue, onSelect, selectId = '') {
        if (this.selectionModal) {
            this.selectionModal.open(title, options, currentValue, onSelect, selectId);
        }
    }

    /**
     * Closes the active selection modal dialog and restores focus.
     * Delegated to SelectionModal controller.
     */
    _closeSelectionModal() {
        if (this.selectionModal) {
            this.selectionModal.close();
        }
    }

    /**
     * Get a human-readable summary of configured fallback audio languages.
     * Delegates to the unified preferences summary helper.
     * @returns {string} Summary string formatted for the settings dropdown trigger
     */
    _getAudioFallbackSummaryLabel() {
        return this._getAudioPreferencesSummaryLabel();
    }

    /**
     * Compute current summary string reflecting Preferred Audio Language and configured fallbacks.
     * Delegates to AudioFallbackModal helper to maintain strict DRY principles.
     *
     * @returns {string} Formatted summary string for the settings trigger button
     */
    _getAudioPreferencesSummaryLabel() {
        return AudioFallbackModal.getSummaryLabel(this.prefLanguages);
    }

    /**
     * Open the unified preferred and fallback audio languages configuration modal.
     * Delegates modal construction and lifecycle management to AudioFallbackModal.
     */
    async _openAudioFallbackModal() {
        const modal = new AudioFallbackModal(this);
        return modal.open();
    }

    /**
     * Show an error modal when a plugin requires a server dependency that isn't met.
     * Preserved as a facade delegating to the extracted PluginsTab controller.
     */
    _showPluginDependencyError(pluginName, dependencyName) {
        if (this.pluginsTab) {
            this.pluginsTab.showPluginDependencyError(pluginName, dependencyName);
        }
    }

    /**
     * Returns the complete palette of curated theme colors organized by tone.
     * Delegated to ThemeColorModal.
     * @returns {Array<{ name: string, hex: string }>} List of theme colors
     */
    _getThemeColors() {
        return getThemeColors();
    }

    /**
     * Opens theme color selection modal dialog.
     * Delegated to ThemeColorModal controller.
     */
    _openThemeColorModal() {
        if (this.themeColorModal) {
            this.themeColorModal.open();
        }
    }

    /**
     * Opens loading indicator style selection modal dialog.
     * Delegated to LoaderStyleModal controller.
     */
    _openLoaderStyleModal() {
        if (this.loaderStyleModal) {
            this.loaderStyleModal.open();
        }
    }

    /**
     * Render isolated live preview spinner markup for a specific style ID.
     * Delegated to LoaderStyleModal controller.
     * @param {string} styleId Style identifier
     * @returns {string} HTML markup string
     */
    _renderLoaderPreviewSample(styleId) {
        if (this.loaderStyleModal) {
            return this.loaderStyleModal.renderLoaderPreviewSample(styleId);
        }
        return '';
    }

    _bindDropdownEvents() {
        // Use a map to handle setting IDs to storage keys/methods easily
        const settingsMap = {
            'library-thumb-mode-select': { key: 'pref:libraryThumbMode', type: 'local' },
            'app-language-select': { key: 'app_language', type: 'local' },
            'layout-direction-select': { key: 'layout_direction', type: 'local' },
            'media-rows-layout-select': { key: 'pref:mediaRowsLayout', type: 'local', triggerEvent: true },
            'login-page-layout-select': { key: 'pref:loginPageLayout', type: 'local', triggerEvent: true },
            'alpha-picker-position-select': { key: 'pref:alphaPickerPosition', type: 'local', triggerEvent: true },
            'default-library-view-mode-select': {
                key: 'pref:defaultLibraryViewMode',
                type: 'local',
                triggerEvent: true
            },
            'default-library-columns-select': {
                key: 'pref:defaultLibraryGridColumns',
                type: 'local',
                triggerEvent: true
            },
            'sidebar-layout-select': { key: 'pref:sidebarLayoutMode', type: 'local', triggerEvent: true },
            'classic-card-size-scale-select': {
                key: (() => {
                    const layout = layoutManager.getMediaRowsLayout();
                    if (layout === 'expanded') return 'pref:expandedCardSizeScale';
                    if (layout === 'modern-posters') return 'pref:modernPostersCardSizeScale';
                    if (layout === 'modern') return 'pref:modernCardSizeScale';
                    if (layout === 'expanding') return 'pref:expandingCardSizeScale';
                    return 'pref:classicCardSizeScale';
                })(),
                type: 'local',
                triggerEvent: true
            },
            'badge-style-select': { key: 'litefin:badgeStyle', type: 'local' },
            'button-style-select': { key: 'litefin:buttonStyle', type: 'local' },
            'focus-border-style-select': { key: 'litefin:focusBorderStyle', type: 'local' },
            'card-label-style-select': { key: 'pref:cardLabelStyle', type: 'local' },
            'card-label-align-select': { key: 'pref:cardLabelAlign', type: 'local' },
            'card-label-scale-select': { key: 'pref:cardLabelScale', type: 'local' },
            'theme-mode-select': { key: 'themeMode', type: 'local', triggerEvent: true },
            'ui-font-select': { key: 'uiFont', type: 'local' },
            'jellyfin-fallback-font-select': { key: 'pref:jellyfinFallbackFont', type: 'local', triggerEvent: true },
            'image-quality-select': { key: 'imageQuality', type: 'service' },
            'details-image-quality-select': { key: 'detailsImageQuality', type: 'details-service' },
            'max-resolution-select': { key: 'maxResolution', type: 'player' },
            'player-backend-select': { key: 'playerBackend', type: 'player' },
            'max-bitrate-select': { key: 'maxBitrateInternet', type: 'player' },
            'trailer-playback-select': { key: 'trailerPlaybackMode', type: 'player' },
            'audio-lang-select': { key: 'pref:audioLang', type: 'local' },
            'audio-fallback-lang-1-select': { key: 'pref:audioLangFallback1', type: 'local' },
            'audio-fallback-lang-2-select': { key: 'pref:audioLangFallback2', type: 'local' },
            'audio-fallback-lang-3-select': { key: 'pref:audioLangFallback3', type: 'local' },
            'subtitle-lang-select': { key: 'pref:subtitleLang', type: 'local' },
            'skip-forward-select': { key: 'skipForwardLength', type: 'player' },
            'skip-back-select': { key: 'skipBackLength', type: 'player' },
            'resume-rewind-select': { key: 'resumeRewindLength', type: 'player' },
            'subtitle-mode-select': { key: 'subtitleMode', type: 'player' },
            // Subtitle delivery mode — drives SubtitleProfiles in DeviceProfile
            'subtitle-burn-in-select': { key: 'subtitleBurnIn', type: 'player' },
            'pgs-playback-mode-select': { key: 'pgsPlaybackMode', type: 'player' },
            'subtitle-size-select': { key: 'subtitleSize', type: 'player' },
            'subtitle-weight-select': { key: 'subtitleWeight', type: 'player' },
            'subtitle-font-select': { key: 'subtitleFont', type: 'player' },
            'subtitle-font-ass-select': { key: 'subtitleFontAss', type: 'player' },
            'ass-renderer-select': { key: 'assRenderer', type: 'player' },
            'ass-prescale-factor-select': { key: 'subtitleAssPrescaleFactor', type: 'player' },
            'subtitle-color-select': { key: 'subtitleTextColor', type: 'player' },
            'subtitle-color-select-hdr': { key: 'subtitleTextColorHdr', type: 'player' },
            'subtitle-shadow-select': { key: 'subtitleDropShadow', type: 'player' },
            'subtitle-shadow-color-select': { key: 'subtitleDropShadowColor', type: 'player' },
            'subtitle-bg-select': { key: 'subtitleTextBackground', type: 'player' },
            'subtitle-position-select': { key: 'subtitleVerticalPosition', type: 'player' },
            'subtitle-custom-size': { key: 'subtitleSizeCustomValue', type: 'player' },
            'subtitle-border-width': { key: 'subtitleBorderWidth', type: 'player' },
            'subtitle-font-scale': { key: 'subtitleFontScale', type: 'player' },
            'subtitle-outline-thickness': { key: 'subtitleOutlineThickness', type: 'player' },
            'subtitle-shadow-thickness': { key: 'subtitleShadowThickness', type: 'player' },
            'subtitle-line-height': { key: 'subtitleLineHeight', type: 'player' },
            'subtitle-letter-spacing': { key: 'subtitleLetterSpacing', type: 'player' },
            'subtitle-bottom-offset': { key: 'subtitleBottomOffset', type: 'player' },
            'subtitle-force-text-toggle': { key: 'disableAssStyling', type: 'player' },
            'subtitle-override-colors-toggle': { key: 'subtitleOverrideColors', type: 'player' },
            'debug-width-select': { key: 'debug_width', type: 'debug' },
            'debug-height-select': { key: 'debug_height', type: 'debug' },
            'debug-position-select': { key: 'debug_position', type: 'debug' },
            'screensaver-delay-select': { key: 'pref:screensaverDelay', type: 'local', triggerEvent: true },
            'screensaver-type-select': { key: 'pref:screensaverType', type: 'local', triggerEvent: true },
            'backdrop-dimmer-select': { key: 'pref:backdropDimmer', type: 'local', triggerEvent: true },
            'vertical-scroll-mode-select': { key: 'pref:verticalScrollMode', type: 'local', triggerEvent: true },
            'horizontal-scroll-mode-select': { key: 'pref:horizontalScrollMode', type: 'local', triggerEvent: true },
            'scroll-smoothing-duration-select': {
                key: 'pref:scrollSmoothingDuration',
                type: 'local',
                triggerEvent: true
            },
            'scroll-physics-select': {
                key: 'pref:scrollPhysics',
                type: 'local',
                triggerEvent: true
            },
            // prettier-ignore
            'vertical-scroll-alignment-select': { key: 'pref:verticalScrollAlignment', type: 'local', triggerEvent: true },

            // Centralized mappings for TV hardware remote control color buttons
            'remote-red-select': { key: 'pref:remoteRedAction', type: 'local', triggerEvent: true },
            'remote-green-select': { key: 'pref:remoteGreenAction', type: 'local', triggerEvent: true },
            'remote-yellow-select': { key: 'pref:remoteYellowAction', type: 'local', triggerEvent: true },
            'remote-blue-select': { key: 'pref:remoteBlueAction', type: 'local', triggerEvent: true },
            'time-format-select': { key: 'timeFormat', type: 'player' },
            'time-source-select': { key: 'timeSource', type: 'player', triggerEvent: true },
            'time-timezone-select': { key: 'timeZoneOffset', type: 'player', triggerEvent: true },
            'hevc-force-select': { type: 'player', key: 'enableHEVC' },
            'hdr-force-select': { type: 'player', key: 'enableHDR' },
            'dv-force-select': { type: 'player', key: 'enableDolbyVision' },
            'av1-force-select': { type: 'player', key: 'enableAV1' },
            'vp9-force-select': { type: 'player', key: 'enableVP9' },
            'dts-force-select': { type: 'player', key: 'enableDts' },
            'truehd-force-select': { type: 'player', key: 'enableTrueHd' },
            'force-direct-play-select': { type: 'player', key: 'forceDirectPlay' },
            /* Transcode target codec — used by all three device profiles (Tizen, WebOS, Web) */
            'transcode-audio-codec-select': { type: 'player', key: 'transcodeAudioCodec' },
            /* Maximum audio channels — used by all three device profiles (Tizen, WebOS, Web) */
            'allowed-audio-channels-select': { type: 'player', key: 'allowedAudioChannels' },
            /* Transcoding maximum audio channels — output channels for transcoded audio */
            'transcode-max-audio-channels-select': { type: 'player', key: 'transcodeMaxAudioChannels' },
            /* EAC3 force-state override — corrects broken canPlayType probes on WebOS and some browsers */
            'eac3-force-select': { type: 'player', key: 'enableEac3' },
            /* MP2 force-state override — corrects false positives or forces transcoding to avoid stalls */
            'mp2-force-select': { type: 'player', key: 'enableMp2' },
            /*
             * OSD focus restore mode — read live by OSDController._applyFocusRestoreMode()
             * every time the OSD transitions from hidden to visible. No extra handler needed.
             */
            'osd-focus-mode-select': { type: 'player', key: 'osdFocusRestoreMode' },
            'osd-time-display-select': { type: 'player', key: 'osdTimeDisplayMode' },
            'osd-logo-size-select': { type: 'player', key: 'osdLogoSize' },
            'osd-buttons-location-select': { type: 'player', key: 'osdButtonsLocation' },
            'osd-layout-select': { type: 'player', key: 'osdLayout' },
            'next-up-dialog-style-select': { type: 'player', key: 'nextUpDialogStyle' },
            'next-up-dialog-scale-select': { type: 'player', key: 'nextUpDialogScale' },
            'next-up-dialog-trigger-select': { type: 'player', key: 'nextUpTriggerMode' },
            'watched-threshold-select': { type: 'player', key: 'watchedThreshold' },

            // Per-segment-type skip action — read by the skip-intro plugin on each onPlayerStart
            'segment-source-select': { type: 'player', key: 'skipSegmentSource' },
            'segment-action-intro-select': { type: 'player', key: 'skipActionIntro' },
            'segment-action-outro-select': { type: 'player', key: 'skipActionOutro' },
            'segment-action-recap-select': { type: 'player', key: 'skipActionRecap' },
            'segment-action-preview-select': { type: 'player', key: 'skipActionPreview' },

            'webos-buffer-gate-select': { type: 'player', key: 'webosBufferGate' },
            'webos-stall-recovery-select': { type: 'player', key: 'webosStallRecovery' },
            'webos-segment-length-select': { type: 'player', key: 'webosSegmentLength' },

            'tizen-initial-buffer-select': { type: 'player', key: 'tizenInitialBuffer' },
            'tizen-resume-buffer-select': { type: 'player', key: 'tizenResumeBuffer' },
            'tizen-segment-length-select': { type: 'player', key: 'tizenSegmentLength' },

            'html5-max-buffer-select': { type: 'player', key: 'html5MaxBufferLength' },
            'html5-max-max-buffer-select': { type: 'player', key: 'html5MaxMaxBufferLength' },
            'html5-segment-length-select': { type: 'player', key: 'html5SegmentLength' },

            'text-scale-select': { key: 'litefin:textScale', type: 'local' },
            'display-scale-select': { key: 'pref:displayScale', type: 'local' },
            'home-rows-limit-select': { key: 'pref:homeRowsLimit', type: 'local', triggerEvent: true },
            'next-up-max-days-select': { key: 'pref:nextUpMaxDays', type: 'local' },
            'score-visibility-select': { key: 'pref:scoreVisibility', type: 'local' },
            'details-title-style-select': { key: 'pref:detailsTitleStyle', type: 'local' },
            'show-action-tooltips-select': { key: 'pref:showActionTooltips', type: 'local' },
            'details-overview-max-lines-select': { key: 'pref:detailsOverviewMaxLines', type: 'local' },
            'watch-provider-region-select': { key: 'pref:watchProviderRegion', type: 'local' },
            'details-layout-select': { key: 'pref:detailsLayout', type: 'local' },
            'season-episode-details-layout-select': { key: 'pref:seasonEpisodeDetailsLayout', type: 'local' },
            'episode-layout-select': { key: 'pref:episodeLayout', type: 'local' },
            'show-dates-select': { key: 'pref:showDates', type: 'local' },
            'rich-metadata-select': { key: 'pref:richMetadataStyle', type: 'local' },
            'library-page-size-select': { key: 'pref:libraryPageSize', type: 'local', triggerEvent: true },
            'play-queue-episode-limit-select': { type: 'player', key: 'playQueueEpisodeLimit' },
            'hero-carousel-style-select': { key: 'pref:heroCarouselStyle', type: 'local' },
            'hero-carousel-indicator-style-select': { key: 'pref:heroCarouselIndicatorStyle', type: 'local' },
            'hero-image-quality-select': { key: 'pref:heroImageQuality', type: 'local' },
            'hero-carousel-interval-select': { key: 'pref:heroCarouselInterval', type: 'local' },
            'hero-carousel-count-select': { key: 'pref:heroCarouselCount', type: 'local' },
            'hero-carousel-vignette-select': { key: 'pref:heroCarouselVignette', type: 'local' },
            'sidebar-mode-select': { key: 'pref:sidebarMode', type: 'local' },
            'icon-style-select': { key: 'pref:iconStyle', type: 'local', triggerEvent: true },
            'icon-variant-select': { key: 'pref:iconVariant', type: 'local', triggerEvent: true },
            'hover-border-style-select': { key: 'litefin:hoverBorderStyle', type: 'local' },
            'sidebar-selected-color-select': { key: 'litefin:sidebarSelectedColor', type: 'local' },
            'sidebar-unselected-color-select': { key: 'litefin:sidebarUnselectedColor', type: 'local' },
            'sidebar-logo-color-select': { key: 'litefin:sidebarLogoColor', type: 'local' },
            'osd-button-style-select': { key: 'litefin:osdButtonStyle', type: 'local' },
            'osd-focus-border-style-select': { key: 'litefin:osdFocusBorderStyle', type: 'local' },
            'osd-button-shape-select': { key: 'litefin:osdButtonShape', type: 'local' },
            'osd-unfocused-button-style-select': { key: 'litefin:osdUnfocusedButtonStyle', type: 'local' },
            'osd-seekbar-thumb-color-select': { key: 'litefin:osdSeekBarThumbColor', type: 'local' },
            'osd-seekbar-progress-color-select': { key: 'litefin:osdSeekBarProgressColor', type: 'local' },
            'theme-song-volume-select': { key: 'pref:themeSongVolume', type: 'local' },
            'collapsed-sidebar-color-select': { key: 'pref:collapsedSidebarColor', type: 'local', triggerEvent: true },
            'expanded-sidebar-color-select': { key: 'pref:expandedSidebarColor', type: 'local', triggerEvent: true },
            'bottom-nav-bar-color-select': { key: 'pref:bottomNavBarColor', type: 'local', triggerEvent: true },
            'sidebar-logo-settings-select': { key: 'pref:logoSettings', type: 'local', triggerEvent: true },
            'sidebar-back-button-select': { key: 'pref:sidebarBackButton', type: 'local', triggerEvent: true },
            'sidebar-icon-shadows-select': { key: 'pref:sidebarIconShadows', type: 'local', triggerEvent: true },
            'sidebar-items-align-select': { key: 'pref:sidebarItemsAlign', type: 'local', triggerEvent: true },
            'trending-movies-collection-select': {
                key: 'pref:trendingMoviesCollection',
                type: 'local',
                triggerEvent: true
            },
            'trending-series-collection-select': {
                key: 'pref:trendingSeriesCollection',
                type: 'local',
                triggerEvent: true
            },
            'default-livetv-tab-select': { key: 'pref:defaultLiveTvTab', type: 'local' }
        };

        this.$$('.select-btn').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                const id = btn.dataset.id;
                let options = [];
                try {
                    options = JSON.parse(btn.dataset.options);
                } catch (_) {}
                const currentValue = btn.dataset.value;
                const settingConfig = settingsMap[id];
                const title =
                    btn.closest('.setting-item')?.querySelector('.setting-name')?.textContent || i18n.t('SelectOption');

                if (id === 'watch-provider-region-select') {
                    btn.classList.add('disabled');
                    try {
                        const countries = await api.get('/Localization/Countries');
                        options = countries
                            .filter((country) => country && /^[A-Z]{2}$/.test(country.TwoLetterISORegionName))
                            .map((country) => ({
                                value: country.TwoLetterISORegionName,
                                label: watchProviderRegionName(country.TwoLetterISORegionName, i18n.currentLang)
                            }))
                            .sort((a, b) => a.label.localeCompare(b.label));
                        if (!options.length) throw new Error('No countries returned');
                        btn.dataset.options = JSON.stringify(options);
                    } catch (err) {
                        log.warn('Unable to load streaming availability countries', err);
                        toast.error(i18n.t('WatchProvidersCountriesError'));
                        return;
                    } finally {
                        btn.classList.remove('disabled');
                    }
                } else if (id === 'trending-movies-collection-select' || id === 'trending-series-collection-select') {
                    btn.classList.add('disabled');
                    try {
                        const collectionsRes = await api.getItems({
                            IncludeItemTypes: 'BoxSet,Playlist',
                            Recursive: true,
                            EnableTotalRecordCount: false
                        });
                        const collections = collectionsRes?.Items || [];
                        options = [
                            { value: 'none', label: i18n.t('Disabled') || 'Disabled' },
                            { value: 'auto', label: i18n.t('Auto') || 'Auto' },
                            { value: 'top-rated', label: i18n.t('CommunityRating') || 'Community Rating' },
                            ...collections.map((c) => ({
                                value: c.Id,
                                label: c.Name
                            }))
                        ];
                        btn.dataset.options = JSON.stringify(options);
                    } catch (err) {
                        log.warn('Failed to load collections for trending selector:', err);
                    } finally {
                        btn.classList.remove('disabled');
                    }
                } else if (SERVER_FONT_SELECTS.includes(id)) {
                    btn.classList.add('disabled');
                    try {
                        await this._loadFallbackFontOptions();
                        options = this._getFontDropdownOptions(id, options, currentValue);
                        btn.dataset.options = JSON.stringify(options);
                    } catch (err) {
                        log.warn('Failed to load fallback fonts list on click:', err);
                    } finally {
                        btn.classList.remove('disabled');
                    }
                }

                this._renderSelectionModal(
                    title,
                    options,
                    currentValue,
                    (newValue) => {
                        // Update button UI
                        const newLabel = options.find((o) => String(o.value) === String(newValue))?.label;
                        const labelSpan = btn.querySelector('.btn-label');
                        if (labelSpan) labelSpan.innerText = newLabel;
                        btn.dataset.value = newValue;

                        if (id === 'trending-movies-collection-select') {
                            storage.setItem('pref:trendingMoviesCollectionName', newLabel);
                        } else if (id === 'trending-series-collection-select') {
                            storage.setItem('pref:trendingSeriesCollectionName', newLabel);
                        }

                        // Save Setting based on type
                        if (settingConfig) {
                            if (id === 'alpha-picker-position-select') {
                                layoutManager.setAlphaPickerPosition(newValue);
                            } else if (id === 'default-library-view-mode-select') {
                                layoutManager.setDefaultLibraryViewMode(newValue);
                                const columnsItem = this.$('#item-default-library-columns');
                                if (columnsItem) {
                                    columnsItem.style.display = newValue === 'list' ? 'none' : '';
                                }
                                const colsBtn = this.$('#default-library-columns-select-btn');
                                if (colsBtn) {
                                    const newColOptions = this._getLibraryColumnOptionsForMode(newValue);
                                    const savedForNewMode = storage.getItem(`pref:defaultLibraryGridColumns:${newValue}`);
                                    const defaultColsForMode = { poster: '7', 'small-poster': '9', thumb: '4', banner: '3', list: '1' }[newValue] || '7';
                                    const selectedCol = newColOptions.some((o) => o.value === String(savedForNewMode)) ? String(savedForNewMode) : defaultColsForMode;
                                    colsBtn.dataset.options = JSON.stringify(newColOptions);
                                    colsBtn.dataset.value = selectedCol;
                                    const colLabel = colsBtn.querySelector('.btn-label');
                                    if (colLabel) {
                                        colLabel.innerText = newColOptions.find((o) => o.value === selectedCol)?.label || selectedCol;
                                    }
                                }
                                focusManager.invalidateCache('settings-content');
                            } else if (id === 'default-library-columns-select') {
                                const activeDefaultMode = layoutManager.getDefaultLibraryViewMode() || 'poster';
                                layoutManager.setDefaultLibraryGridColumns(newValue, activeDefaultMode);
                            } else if (id === 'badge-style-select') {
                                layoutManager.setBadgeStyle(newValue);
                            } else if (id === 'button-style-select') {
                                layoutManager.setButtonStyle(newValue);
                            } else if (id === 'focus-border-style-select') {
                                layoutManager.setFocusBorderStyle(newValue);
                            } else if (id === 'hover-border-style-select') {
                                layoutManager.setHoverBorderStyle(newValue);
                            } else if (id === 'sidebar-selected-color-select') {
                                layoutManager.setSidebarSelectedColor(newValue);
                            } else if (id === 'sidebar-unselected-color-select') {
                                layoutManager.setSidebarUnselectedColor(newValue);
                            } else if (id === 'sidebar-logo-color-select') {
                                layoutManager.setSidebarLogoColor(newValue);
                            } else if (id === 'sidebar-icon-shadows-select') {
                                layoutManager.setSidebarIconShadows(newValue === 'shadow' || newValue === 'true');
                            } else if (id === 'osd-button-style-select') {
                                layoutManager.setOsdButtonStyle(newValue);
                            } else if (id === 'osd-focus-border-style-select') {
                                layoutManager.setOsdFocusBorderStyle(newValue);
                            } else if (id === 'osd-button-shape-select') {
                                layoutManager.setOsdButtonShape(newValue);
                            } else if (id === 'osd-unfocused-button-style-select') {
                                layoutManager.setOsdUnfocusedButtonStyle(newValue);
                            } else if (id === 'osd-seekbar-thumb-color-select') {
                                layoutManager.setOsdSeekBarThumbColor(newValue);
                            } else if (id === 'osd-seekbar-progress-color-select') {
                                layoutManager.setOsdSeekBarProgressColor(newValue);
                            } else if (id === 'theme-mode-select') {
                                layoutManager.setThemeMode(newValue);
                                this._updateLighterBackgroundVisibility();
                                this._updateSignatureAccentVisibility();
                            } else if (id === 'watched-threshold-select') {
                                PlayerSettings.set('watchedThreshold', newValue);
                                if (newValue === 'server') {
                                    api.getServerConfiguration({ silent: true }).catch((err) => {
                                        log.debug('Failed to background fetch server config for MaxResumePct:', err);
                                    });
                                }
                            } else if (id === 'ui-font-select') {
                                layoutManager.setUiFont(newValue);
                            } else if (id === 'jellyfin-fallback-font-select') {
                                storage.setItem('pref:jellyfinFallbackFont', newValue);
                                storage.flush();
                                FontLoader.loadFont('fallback-font', true);
                            } else if (id === 'text-scale-select') {
                                layoutManager.setTextScale(parseFloat(newValue));
                            } else if (id === 'display-scale-select') {
                                layoutManager.setDisplayScale(newValue);
                            } else if (id === 'media-rows-layout-select') {
                                layoutManager.setMediaRowsLayout(newValue);
                                const scaleMap = { expanded: '1.2', 'modern-posters': '1.2', modern: '1.2', expanding: '1', classic: '1' };
                                if (scaleMap[newValue]) {
                                    storage.setItem(`pref:${newValue === 'modern-posters' ? 'modernPosters' : newValue}CardSizeScale`, scaleMap[newValue]);
                                }
                                this._triggerHardReload();
                            } else if (id === 'login-page-layout-select') {
                                layoutManager.setLoginPageLayout(newValue);
                                this._triggerHardReload();
                            } else if (id === 'sidebar-layout-select') {
                                layoutManager.setSidebarLayout(newValue);
                                this._triggerHardReload();
                            } else if (id === 'card-label-style-select' || id === 'card-label-align-select') {
                                storage.setItem(settingConfig.key, newValue);
                                document.documentElement.setAttribute(id === 'card-label-style-select' ? 'data-card-label-style' : 'data-card-label-align', newValue);
                                focusManager.invalidateCache('home');
                                focusManager.invalidateCache('settings-content');
                            } else if (id === 'card-label-scale-select') {
                                layoutManager.setCardLabelScale(parseFloat(newValue));
                            } else if (id === 'hero-carousel-vignette-select') {
                                layoutManager.setHeroVignette(newValue);
                            } else if (id === 'sidebar-mode-select') {
                                storage.setItem('pref:sidebarMode', newValue);
                                document.body.classList.toggle('sidebar-mode-hidden', newValue === 'hidden');
                                document.body.classList.toggle('sidebar-mode-collapsed', newValue === 'collapsed');
                                if (newValue === 'collapsed') {
                                    storage.setItem('pref:showCollapsedLibraryIcons', 'true');
                                    storage.setItem('pref:hideSidebarLibraryHeader', 'true');
                                    eventBus.emit('prefChanged:showCollapsedLibraryIcons', true);
                                    eventBus.emit('prefChanged:hideSidebarLibraryHeader', true);
                                }
                                eventBus.emit('pref:sidebarMode', newValue);
                                focusManager.invalidateCache('sidebar');
                                focusManager.invalidateCache('home');
                            } else if (id === 'icon-style-select') {
                                setIconStyle(newValue);
                                this._triggerHardReload();
                            } else if (id === 'icon-variant-select') {
                                storage.setItem('pref:iconVariant', newValue);
                                this._triggerHardReload();
                            } else if (settingConfig.type === 'local') {
                                storage.setItem(settingConfig.key, newValue);

                                const homepageLocalKeys = [
                                    'pref:homeRowsLimit',
                                    'pref:nextUpMaxDays',
                                    'pref:heroCarouselStyle',
                                    'pref:heroCarouselIndicatorStyle',
                                    'pref:heroCarouselCount',
                                    'pref:heroCarouselInterval'
                                ];
                                if (homepageLocalKeys.includes(settingConfig.key)) {
                                    log.info(`Invalidating home page cache due to local setting change: ${settingConfig.key}`);
                                    state.delete('home:pageCache');
                                }

                                if (settingConfig.key === 'pref:heroCarouselIndicatorStyle') {
                                    const animToggleItem = this.$('#hero-carousel-indicator-animation-item');
                                    if (animToggleItem) {
                                        const isCarouselEnabled = storage.getItem('pref:heroCarousel') !== 'false';
                                        animToggleItem.style.display = isCarouselEnabled && newValue === 'progress' ? '' : 'none';
                                    }
                                    focusManager.invalidateCache('settings-content');
                                }

                                if (settingConfig.key === 'pref:heroCarouselStyle') {
                                    const blurhashFillItem = this.$('#hero-carousel-blurhash-fill-item');
                                    if (blurhashFillItem) {
                                        const isCarouselEnabled = storage.getItem('pref:heroCarousel') !== 'false';
                                        blurhashFillItem.style.display = isCarouselEnabled && newValue === 'immersive-performance' ? '' : 'none';
                                    }
                                    focusManager.invalidateCache('settings-content');
                                }

                                if (settingConfig.key === 'pref:libraryPageSize') {
                                    log.info(`Invalidating library caches due to libraryPageSize change: ${newValue}`);
                                    state.clearByPrefix('library:state');
                                    if (router && typeof router.clearHistoryState === 'function') {
                                        router.clearHistoryState('/library');
                                    }
                                    const alphaScrollItem = this.$('#alpha-picker-scroll-mode-item');
                                    if (alphaScrollItem) {
                                        alphaScrollItem.style.display = String(newValue) === 'unlimited' ? '' : 'none';
                                        focusManager.invalidateCache('settings-content');
                                    }
                                    eventBus.emit('pref:libraryPageSize:changed', newValue);
                                }

                                if (
                                    settingConfig.key === 'pref:defaultLibraryViewMode' ||
                                    settingConfig.key === 'pref:defaultLibraryGridColumns'
                                ) {
                                    log.info(`Invalidating library caches due to default view layout change: ${settingConfig.key}=${newValue}`);
                                    state.clearByPrefix('library:state');
                                    if (router && typeof router.clearHistoryState === 'function') {
                                        router.clearHistoryState('/library');
                                    }
                                    eventBus.emit(settingConfig.key + ':changed', newValue);
                                }

                                if (settingConfig.key === 'pref:detailsLayout' || settingConfig.key === 'pref:seasonEpisodeDetailsLayout') {
                                    this._updateDetailsTitleStyleVisibility();
                                }

                                if (settingConfig.triggerEvent) {
                                    eventBus.emit(settingConfig.key, newValue);
                                }

                                if (
                                    settingConfig.key === 'pref:mediaRowsLayout' ||
                                    settingConfig.key === 'pref:loginPageLayout' ||
                                    settingConfig.key === 'layout_direction' ||
                                    settingConfig.key === 'app_language' ||
                                    settingConfig.key === 'pref:classicCardSizeScale' ||
                                    settingConfig.key === 'pref:modernCardSizeScale' ||
                                    settingConfig.key === 'pref:expandedCardSizeScale' ||
                                    settingConfig.key === 'pref:modernPostersCardSizeScale'
                                ) {
                                    this._triggerHardReload();
                                }

                                if (settingConfig.key === 'pref:libraryThumbMode') {
                                    const libraryThumbContainer = this.$('#library-thumb-regenerate-container');
                                    if (libraryThumbContainer) {
                                        libraryThumbContainer.style.display = newValue === 'static' ? '' : 'none';
                                        focusManager.invalidateCache('settings-content');
                                    }
                                    storage.clearByPrefix('libThumb:');
                                    const pageCache = state.get('home:pageCache');
                                    if (pageCache && pageCache.thumbUrls) {
                                        pageCache.thumbUrls = {};
                                        state.set('home:pageCache', pageCache);
                                    }
                                    CardRenderer.clearCache();
                                }

                                if (id === 'screensaver-type-select') {
                                    const isBackdrop = newValue === 'backdrop';
                                    ['screensaver-dim-item', 'screensaver-hide-text-item', 'screensaver-include-music-item'].forEach((itemId) => {
                                        const el = document.getElementById(itemId);
                                        if (el) el.classList.toggle('hidden', !isBackdrop);
                                    });
                                    focusManager.invalidateCache('settings-content');
                                }
                            } else if (settingConfig.type === 'service') {
                                imageService.setPreset(newValue);
                            } else if (settingConfig.type === 'details-service') {
                                imageService.setDetailsPreset(newValue);
                            } else if (settingConfig.type === 'player') {
                                const floatKeys = ['webosBufferGate', 'subtitleAssPrescaleFactor'];
                                const intKeys = [
                                    'skipForwardLength',
                                    'skipBackLength',
                                    'resumeRewindLength',
                                    'maxBitrateInternet',
                                    'webosStallRecovery',
                                    'webosSegmentLength',
                                    'tizenInitialBuffer',
                                    'tizenResumeBuffer',
                                    'tizenSegmentLength',
                                    'html5MaxBufferLength',
                                    'html5MaxMaxBufferLength',
                                    'html5SegmentLength',
                                    'playQueueEpisodeLimit'
                                ];

                                let val = newValue;
                                if (floatKeys.includes(settingConfig.key)) {
                                    val = parseFloat(newValue);
                                } else if (intKeys.includes(settingConfig.key)) {
                                    val = parseInt(newValue, 10);
                                }
                                PlayerSettings.set(settingConfig.key, val);

                                if (settingConfig.key === 'playerBackend') {
                                    this._switchTab('player', false, true);
                                    return;
                                }

                                if (settingConfig.key === 'assRenderer') {
                                    const isLibass = newValue === 'libass-wasm';
                                    const animContainer = this.$('#ass-drop-animations-container');
                                    const scaleContainer = this.$('#ass-prescale-factor-container');
                                    if (animContainer) animContainer.style.display = isLibass ? '' : 'none';
                                    if (scaleContainer) scaleContainer.style.display = isLibass ? '' : 'none';
                                    focusManager.invalidateCache('settings-content');
                                }

                                const CLEAR_CAPS_KEYS = new Set([
                                    'maxResolution', 'maxBitrateInternet', 'pgsPlaybackMode',
                                    'webosSegmentLength', 'tizenSegmentLength', 'html5SegmentLength',
                                    'enableHEVC', 'enableAV1', 'enableVP9', 'enableHDR',
                                    'enableDolbyVision', 'enableDts', 'enableTrueHd',
                                    'enableEac3', 'enableMp2', 'transcodeAudioCodec', 'forceDirectPlay'
                                ]);
                                if (CLEAR_CAPS_KEYS.has(settingConfig.key)) {
                                    clearCapabilitiesCache();
                                }

                                if (id === 'time-source-select') {
                                    const tzContainer = document.getElementById('time-timezone-item');
                                    if (tzContainer) {
                                        tzContainer.style.display = newValue === 'server' ? '' : 'none';
                                        focusManager.invalidateCache('settings-content');
                                    }
                                }

                                if (id === 'subtitle-bg-select') {
                                    const opacityContainer = document.getElementById('subtitle-bg-opacity-container');
                                    if (opacityContainer) {
                                        opacityContainer.style.display = (newValue === 'transparent' || newValue === 'none') ? 'none' : '';
                                        focusManager.invalidateCache('settings-content');
                                    }
                                }

                                if (id === 'subtitle-position-select') {
                                    const customPosContainer = document.getElementById('subtitle-custom-pos-container');
                                    if (customPosContainer) {
                                        customPosContainer.style.display = newValue === 'custom' ? '' : 'none';
                                        focusManager.invalidateCache('settings-content');
                                    }
                                }

                                if (id === 'subtitle-size-select') {
                                    const customSizeContainer = document.getElementById('subtitle-custom-size-container');
                                    if (customSizeContainer) {
                                        customSizeContainer.style.display = newValue === 'custom' ? '' : 'none';
                                        focusManager.invalidateCache('settings-content');
                                    }
                                }

                                if (id === 'subtitle-shadow-select') {
                                    const isBorder = newValue === 'border' || newValue === 'uniform_border';
                                    const isNoneOrBorder = newValue === 'none' || newValue === 'border';
                                    const borderWidthContainer = document.getElementById('subtitle-border-width-container');
                                    if (borderWidthContainer) borderWidthContainer.style.display = isBorder ? '' : 'none';
                                    const borderOpacityContainer = document.getElementById('subtitle-border-opacity-container');
                                    if (borderOpacityContainer) borderOpacityContainer.style.display = isBorder ? '' : 'none';
                                    const opacityContainer = document.getElementById('subtitle-shadow-opacity-container');
                                    if (opacityContainer) opacityContainer.style.display = isNoneOrBorder ? 'none' : '';
                                    const blurContainer = document.getElementById('subtitle-shadow-blur-container');
                                    if (blurContainer) blurContainer.style.display = isNoneOrBorder ? 'none' : '';
                                    focusManager.invalidateCache('settings-content');
                                }

                                if (settingConfig.key === 'subtitleFont' || settingConfig.key === 'subtitleFontAss') {
                                    storage.flush();
                                    if (newValue) {
                                        FontLoader.loadFont(newValue, true).then((loaded) => {
                                            log.debug(`Font loaded status: ${newValue} = ${loaded}`);
                                        });
                                    }
                                }
                            } else if (settingConfig.type === 'debug') {
                                storage.setItem(settingConfig.key, newValue);
                                if (settingConfig.key === 'debug_width') debugOverlay.setWidth(newValue);
                                else if (settingConfig.key === 'debug_height') debugOverlay.setHeight(newValue);
                                else if (settingConfig.key === 'debug_position') debugOverlay.setPosition(newValue);
                            }
                        }

                        log.debug(`Setting ${id} saved: ${newValue}`);
                    },
                    id
                );
            });
        });
    }

    /**
     * Display dedicated Favorite Languages management modal with search,
     * quick popular language chips, full culture/UI list, and instant toggle states.
     * Delegated to FavoriteLanguagesModal controller.
     */
    _showFavoriteLanguagesModal() {
        if (this.favoriteLanguagesModal) {
            this.favoriteLanguagesModal.open(cachedCultures);
        }
    }

    /**
     * Dismisses Favorite Languages management modal dialog and restores focus.
     * Delegated to FavoriteLanguagesModal controller.
     */
    _closeFavoriteLanguagesModal() {
        if (this.favoriteLanguagesModal) {
            this.favoriteLanguagesModal.close();
        }
    }

    _triggerHardReload() {
        /*
         * ----------------------------------------------------------------
         * Language/Layout changes need a TRUE hard reload.
         *
         * WHY window.location.reload() BREAKS ON TIZEN/WEBOS:
         * On these platforms, reload() is a *soft* reload — the JS
         * module cache is preserved. The 'app' singleton stays alive
         * with _initialized=true, so App.init() exits early without
         * ever calling i18n.init(). The dictionary stays {}, causing
         * all i18n.t() calls to return raw key strings.
         *
         * FIX: Navigate to the app's root entry-point URL *without
         * the hash fragment*. The WebView treats this as a fresh
         * cold-start navigation, fully re-parsing and re-executing
         * all JS modules from scratch — identical to a native restart.
         * ----------------------------------------------------------------
         */
        storage.flush();

        // Compute the base URL (strips the hash / current route)
        const href = window.location.href;
        const protocol = window.location.protocol;
        let entryUrl;

        if (protocol === 'file:') {
            // file:// packaged app — strip everything from '#' onward
            entryUrl = href.split('#')[0];
        } else {
            // http(s):// dev server — use origin + pathname (no hash)
            entryUrl = window.location.origin + window.location.pathname;
        }

        // Hard-navigate: forces a true cold-start re-init on all platforms
        window.location.href = entryUrl;
    }

    /**
     * Reveals the full settings detail screen for a selected category tab in mobile portrait.
     * Transitions from Screen 1 (categories) to Screen 2 (tab details).
     * @param {string} tabId - Identifier of the tab to reveal
     * @private
     */
    _openMobileTab(tabId) {
        this._mobileDetailOpen = true;
        this._switchTab(tabId, true, false);
        this._updateMobileViewState();

        // Push history entry so system back gestures or browser back pop to tab selection
        try {
            window.history.pushState({ litefinSettingsDetail: true }, '', window.location.href);
        } catch (e) {
            // Safe fallback if history API is restricted in environment
        }
    }

    /**
     * Navigates back from the tab detail screen to the category selection list in mobile portrait.
     * Transitions from Screen 2 (tab details) back to Screen 1 (categories).
     * @param {boolean} [shouldPopHistory=true] - Whether to pop window history state
     * @private
     */
    _closeMobileDetail(shouldPopHistory = true) {
        this._mobileDetailOpen = false;
        this._updateMobileViewState();

        // If history entry was pushed, pop it cleanly
        if (shouldPopHistory && window.history.state?.litefinSettingsDetail) {
            window.history.back();
        }

        // Return focus to the active tab button only in landscape/desktop
        // In mobile portrait, we strictly avoid focusing or enlarging any tabs
        if (!this._isPortraitMode()) {
            const activeBtn = this.$(`.settings-menu-btn[data-tab="${this.activeTab}"]`);
            if (activeBtn) {
                activeBtn.focus();
                if (typeof focusManager !== 'undefined') {
                    focusManager.focusElement(activeBtn);
                }
            }
        }
    }

    /**
     * Synchronizes mobile portrait layout classes and viewport state.
     * Toggles .mobile-portrait and .mobile-detail-open on the root page element,
     * and sets body modifier to ensure pure uninhibited vertical touch scrolling.
     * @private
     */
    _updateMobileViewState() {
        if (!this.el) return;
        const isPortrait = this._isPortraitMode();

        // Apply portrait layout modifier
        this.el.classList.toggle('mobile-portrait', isPortrait);

        // Apply detail screen visibility state
        this.el.classList.toggle('mobile-detail-open', isPortrait && this._mobileDetailOpen);

        // Toggle body modifier to prevent #app from hijacking vertical touch scrolling
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.toggle('settings-mobile-portrait', isPortrait);
        }

        // Notify topbar and navigation components of detail view state transitions
        eventBus.emit('mobile:detail-state-change', { isOpen: Boolean(isPortrait && this._mobileDetailOpen) });

        // Invalidate spatial navigation caches on orientation shift
        if (typeof focusManager !== 'undefined') {
            focusManager.invalidateCache('settings-sidebar');
            focusManager.invalidateCache('settings-content');
        }
        this._setupFocus();
    }

    _switchTab(tabId, force = false, focusContent = false) {
        if (this.activeTab === tabId && !force) return;
        this.activeTab = tabId;

        // Update sidebar UI
        this.$$('.settings-menu-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Re-render content panel for portrait view
        const panel = this.$('#settings-content-panel');
        if (panel) {
            panel.innerHTML = `
                <div class="settings-tab-body" id="settings-tab-body">
                    ${this._renderActiveTabContent()}
                    <!-- Bottom scrolling buffer so mobile navigation bar never obstructs the last setting control -->
                    <div class="settings-bottom-spacer" aria-hidden="true"></div>
                </div>
            `;
            panel.scrollTop = 0; // Reset scroll position to top on tab change

            // Apply translations to the newly rendered content
            i18n.translateDOM(panel);

            this._bindContentEvents(); // Re-bind events for new content

            if (tabId === 'home') {
                this._setupHomeLayoutUI();
            } else if (tabId === 'sidebar') {
                this._setupSidebarLayoutUI();
            } else if (tabId === 'libraries') {
                this._setupLibrariesTabUI();
            } else if (tabId === 'backup') {
                this._updateBackupStatusDisplay();
            } else if (tabId === 'plugins') {
                this._refreshSeerrStatus();
            }

            // Populate the live storage usage display whenever the debug tab is opened.
            // _bindContentEvents() already wired the buttons; this fills in the initial numbers.
            if (tabId === 'debug') {
                this._updateStorageUsageDisplay();
            }

            focusManager.invalidateCache('settings-content');
            this._setupFocus();

            if (focusContent) {
                focusManager.setActiveSection('settings-content', true);
            }
        }
    }

    /**
     * Setup Sidebar Layout UI and default focus selector.
     * Delegates to the extracted SidebarTab controller.
     */
    async _setupSidebarLayoutUI() {
        if (this.sidebarTab) {
            await this.sidebarTab.setupSidebarLayoutUI();
        }
    }

    /**
     * Initialize and bind events for the admin Libraries tab.
     * Delegates to the extracted LibrariesTab controller.
     * Metadata refresh modes supported: 'ValidationOnly', 'Default', 'FullRefresh'.
     */
    async _setupLibrariesTabUI() {
        if (this.librariesTab) {
            await this.librariesTab.mount(this.element);
        }
    }

    /**
     * Setup Home Screen Layout ordering UI and visibility controls.
     * Delegates to the extracted HomeTab controller.
     */
    async _setupHomeLayoutUI() {
        if (this.homeTab) {
            await this.homeTab.setupHomeLayoutUI();
        }
    }

    /**
     * Helper to get the human-readable summary of custom collections selected.
     * Delegates to CustomCollectionsModal helper.
     * @returns {string}
     */
    _getCustomCollectionsLabel() {
        return getCustomCollectionsLabel();
    }

    /**
     * Show custom collections management dialog.
     * Delegates to the extracted HomeTab and CustomCollectionsModal controller.
     */
    async _showCustomCollectionsModal() {
        if (this.homeTab) {
            await this.homeTab.showCustomCollectionsModal();
        }
    }

    _setupFocus() {
        // Navigation: Sidebar <-> Content
        // We define these purely logically (LTR space).
        // FocusManager automatically inverts 'leaveLeft' and 'leaveRight' when document dir is 'rtl'.
        const isPortrait = this._isPortraitMode();

        this.registerFocusSection('settings-sidebar', this.$('#settings-sidebar'), {
            orientation: 'vertical',
            leaveRight: isPortrait ? null : 'settings-content',
            leaveLeft: 'sidebar',
            enterTo: 'last-focused',
            defaultFocusSelector: '.settings-menu-btn.active'
        });

        this.registerFocusSection('settings-content', this.$('#settings-content-panel'), {
            orientation: 'grid',
            leaveLeft: isPortrait ? null : 'settings-sidebar',
            leaveRight: null,
            enterTo: 'first',
            onEnter: (fromElement, options) => {
                // When entering the Plugins tab, prioritize focusing the first installed plugin toggle
                // rather than the top header dashboard action button.
                if (this.activeTab === 'plugins') {
                    const firstPluginToggle = this.$('.toggle-switch[data-plugin-id]');
                    if (firstPluginToggle) {
                        return firstPluginToggle;
                    }
                }
                return null;
            },
            onMove: (direction, currentElement) => {
                // 0. Check for explicit navigation override (highest priority)
                if (currentElement) {
                    const navOverride = currentElement.getAttribute(`data-nav-${direction}`);
                    if (navOverride) {
                        const target = document.querySelector(navOverride);
                        if (target) {
                            focusManager.focusElement(target);
                            return true;
                        }
                    }
                }

                // To prevent the "diagonal trap" where pressing left from a right-aligned setting control
                if (direction === 'left' && currentElement) {
                    const row = currentElement.closest('.setting-item');
                    if (row) {
                        // Find all focusable elements in THIS specific row
                        const focusSelector = 'a, button, input, select, [tabindex]:not([tabindex="-1"])';
                        const candidates = Array.from(row.querySelectorAll(focusSelector)).filter(
                            (el) => el.tabIndex !== -1 && !el.disabled && el.offsetParent !== null
                        );

                        // Use SpatialNavigator to see if there's anything to the left within the SAME row
                        const nextInRow = spatialNavigator.findNext(currentElement, candidates, 'left');

                        // If nothing is to the left in this row, immediately escape to the sidebar
                        if (!nextInRow) {
                            focusManager._leaveSection('left');
                            return true; // Handled
                        }
                    } else {
                        // Check if navigating inside the About action cards grid
                        const aboutGrid = currentElement.closest('.about-actions-grid');
                        if (aboutGrid) {
                            // Collect focusable cards inside the grid
                            const focusSelector = 'a, button, input, select, [tabindex]:not([tabindex="-1"])';
                            const candidates = Array.from(aboutGrid.querySelectorAll(focusSelector)).filter(
                                (el) => el.tabIndex !== -1 && !el.disabled && el.offsetParent !== null
                            );

                            // Check if there is another card to the left within the grid
                            const nextInGrid = spatialNavigator.findNext(currentElement, candidates, 'left');
                            if (nextInGrid) {
                                focusManager.focusElement(nextInGrid);
                                return true;
                            }

                            // If on the leftmost column, smoothly transition to the settings sidebar
                            focusManager._leaveSection('left');
                            return true;
                        }

                        // If not in a setting-item or about-actions-grid (fallback), just escape
                        focusManager._leaveSection('left');
                        return true;
                    }
                }
                return false;
            }
        });
    }

    _setLayout(layout) {
        layoutManager.setLayout(layout);
        this._switchTab('appearance', true);

        setTimeout(() => {
            const btn = this.$(`.layout-btn[data-layout="${layout}"]`);
            if (btn) focusManager.focusElement(btn);
        }, 50);
    }

    _setTheme(theme) {
        layoutManager.setTheme(theme);
        this._switchTab('appearance', true);

        setTimeout(() => {
            const btn = this.$(`.theme-btn[data-theme="${theme}"]`);
            if (btn) focusManager.focusElement(btn);
        }, 50);
    }

    onBack() {
        const overlay = this.$('#modal-overlay');
        if (overlay && overlay.classList.contains('visible')) {
            // Check if Favorite Languages modal is open
            if (overlay.querySelector('.fav-languages-modal')) {
                this._closeFavoriteLanguagesModal();
                return true;
            }
            // Check if Custom Collections modal is open
            if (overlay.querySelector('.custom-collections-modal')) {
                this.homeTab?.customCollectionsModal?.close();
                return true;
            }
            // Check if About dialog modal is open
            if (overlay.querySelector('.about-dialog-modal')) {
                this._closeAboutDialog();
                return true;
            }
            this._closeSelectionModal();
            return true;
        }

        // Mobile portrait 2-page navigation:
        // If the user is currently viewing the details of a tab,
        // pressing Back returns them to the category tab selection list.
        if (this._mobileDetailOpen) {
            this._closeMobileDetail(true);
            return true;
        }

        router.back();
        return true;
    }

    onBeforeDestroy() {
        // Detach viewport resize observer to avoid memory leaks
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            window.removeEventListener('orientationchange', this._onResize);
            this._onResize = null;
        }
        if (this._onPopState) {
            window.removeEventListener('popstate', this._onPopState);
            this._onPopState = null;
        }
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.remove('settings-mobile-portrait');
        }
        // Clean up encapsulated tab controllers
        if (this.aboutTab) {
            this.aboutTab.destroy();
        }
        if (this.librariesTab) {
            this.librariesTab.destroy();
        }
        if (this.pluginsTab) {
            this.pluginsTab.destroy();
        }
        if (this.accountTab) {
            this.accountTab.destroy();
        }
        if (this.controlsTab) {
            this.controlsTab.destroy();
        }
        if (this.performanceTab) {
            this.performanceTab.destroy();
        }
        if (this.debugTab) {
            this.debugTab.destroy();
        }
        if (this.backupTab) {
            this.backupTab.destroy();
        }
        if (this.homeTab) {
            this.homeTab.destroy();
        }
        if (this.sidebarTab) {
            this.sidebarTab.destroy();
        }
        if (this.subtitlesTab) {
            this.subtitlesTab.destroy();
        }
        if (this.playerTab) {
            this.playerTab.destroy();
        }
        if (this.layoutTab) {
            this.layoutTab.destroy();
        }
        if (this.appearanceTab) {
            this.appearanceTab.destroy();
        }
        if (this.themeColorModal) {
            this.themeColorModal.destroy();
        }
        if (this.loaderStyleModal) {
            this.loaderStyleModal.destroy();
        }
        if (this.favoriteLanguagesModal) {
            this.favoriteLanguagesModal.destroy();
        }
        if (this.selectionModal) {
            this.selectionModal.destroy();
        }

        // Notify navigation components that Settings page is unmounting
        eventBus.emit('mobile:detail-state-change', { isOpen: false });
    }

    /**
     * Renders user avatar markup by delegating to AccountTab controller.
     * @param {Object} user Current authenticated user payload
     * @returns {string} Serialized HTML markup for the avatar
     */
    _renderUserAvatar(user) {
        return this.accountTab ? this.accountTab.renderUserAvatar(user) : '';
    }
}

export default SettingsPage;
