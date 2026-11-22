/**
 * FReD Theme Toggle
 *
 * Handles dark/light mode switching with localStorage persistence
 * and system preference detection
 */

window.FReD = window.FReD || {};

FReD.themeToggle = {
  // Dedicated key for explicit user theme choice so legacy auto-written 'fred-theme'
  // entries don't block returning visitors from following OS prefers-color-scheme.
  storageKey: 'fred-theme-explicit',

  /**
   * Initialize theme based on explicit stored preference or system preference
   */
  init() {
    const stored = localStorage.getItem(this.storageKey);
    // Clean up legacy auto-saved key if present so it doesn't linger
    if (localStorage.getItem('fred-theme') !== null) {
      localStorage.removeItem('fred-theme');
    }

    if (stored === 'dark' || stored === 'light') {
      this.setTheme(stored, false);
    } else {
      // Check system preference without locking localStorage
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.setTheme(prefersDark ? 'dark' : 'light', false);
    }

    // Listen for system preference changes until user picks an explicit theme
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(this.storageKey)) {
        this.setTheme(e.matches ? 'dark' : 'light', false);
      }
    });

    // Setup toggle buttons
    this.setupToggleButtons();
  },

  /**
   * Set the theme (persists to localStorage only when user explicitly chooses)
   */
  setTheme(theme, persist = true) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) {
      localStorage.setItem(this.storageKey, theme);
    }

    // Dispatch event for charts to re-render
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  },

  /**
   * Get current theme
   */
  getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  },

  /**
   * Toggle between light and dark
   */
  toggle() {
    const current = this.getTheme();
    this.setTheme(current === 'dark' ? 'light' : 'dark');
  },

  /**
   * Setup click handlers for toggle buttons
   */
  setupToggleButtons() {
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', () => this.toggle());
    });
  },

  /**
   * Check if currently dark mode
   */
  isDark() {
    return this.getTheme() === 'dark';
  },

  /**
   * Read a design token (CSS custom property) from shared/css/theme.css.
   * Charts call this at render time so they follow the active theme.
   */
  token(name, fallback = '') {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  },

  /**
   * Pick a readable label colour (white or dark text) for a given fill colour.
   */
  textOn(color) {
    const probe = document.createElement('span');
    probe.style.color = color;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) || [0, 0, 0];
    probe.remove();
    const [r, g, b] = rgb.slice(0, 3).map(v => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Contrast against white vs. against the dark text colour (#2c2c2c, L≈0.025)
    return (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.075) ? '#ffffff' : '#2c2c2c';
  },

  /**
   * Get Plotly layout colors for current theme
   * Use this when creating/updating Plotly charts
   */
  getPlotlyLayout() {
    const t = (name, fallback) => this.token(name, fallback);
    const card = t('--white', '#ffffff');
    const grid = t('--border-light', '#e0e1e1');
    const line = t('--border', '#d0d1d1');
    const text = t('--text-secondary', '#4a4a4a');
    const fontFamily = '"Source Sans 3", "Segoe UI", system-ui, sans-serif';

    const axis = {
      gridcolor: grid,
      linecolor: line,
      tickcolor: line,
      zerolinecolor: line
    };

    return {
      paper_bgcolor: card,
      plot_bgcolor: card,
      font: {
        family: fontFamily,
        color: text
      },
      xaxis: { ...axis },
      yaxis: { ...axis },
      legend: {
        bgcolor: 'transparent',
        font: {
          family: fontFamily,
          color: text
        }
      },
      hoverlabel: {
        bgcolor: '#2c2c2c',
        bordercolor: '#2c2c2c',
        font: { family: fontFamily, color: '#ffffff', size: 12 }
      }
    };
  },

  /**
   * Merge theme layout with custom layout
   */
  mergeLayout(customLayout) {
    const themeLayout = this.getPlotlyLayout();

    return {
      ...customLayout,
      paper_bgcolor: themeLayout.paper_bgcolor,
      plot_bgcolor: themeLayout.plot_bgcolor,
      font: { ...customLayout.font, ...themeLayout.font },
      xaxis: { ...customLayout.xaxis, ...themeLayout.xaxis },
      yaxis: { ...customLayout.yaxis, ...themeLayout.yaxis },
      legend: { ...customLayout.legend, ...themeLayout.legend }
    };
  }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => FReD.themeToggle.init());
} else {
  FReD.themeToggle.init();
}

window.FReD = FReD;
