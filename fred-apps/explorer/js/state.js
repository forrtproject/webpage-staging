/**
 * FReD Explorer - URL State Management
 *
 * Handles syncing filter state with URL parameters for shareable links
 */

window.FReD = window.FReD || {};

FReD.state = {
  // Valid navigation tab IDs
  VALID_TABS: ['overview', 'forest', 'correlates', 'data'],

  // Default state
  defaults: {
    source: 'All studies',
    minPower: 0.05,
    keepMissingPower: true,
    criterion: 'significance_r',
    search: '',
    tab: 'overview'
  },

  // Current state
  current: {},

  // Listeners for state changes
  listeners: [],

  /**
   * Initialize state from URL or defaults
   */
  init() {
    this.current = { ...this.defaults };
    this.loadFromURL();
    // Normalize any invalid/out-of-range query params in place on first load
    this.saveToURL(false);

    // Listen for browser back/forward
    window.addEventListener('popstate', () => {
      const prev = { ...this.current };
      this.current = { ...this.defaults };
      this.loadFromURL();
      const changes = {};
      Object.keys(this.current).forEach((k) => {
        if (this.current[k] !== prev[k]) changes[k] = this.current[k];
      });
      if (Object.keys(changes).length === 0) return;
      this.notifyListeners(changes);
    });
  },

  /**
   * Load state from URL parameters
   */
  loadFromURL() {
    const params = FReD.utils.parseQueryParams();

    if (params.source) {
      this.current.source = params.source;
    }
    if (params.power !== undefined) {
      const power = parseFloat(params.power);
      if (!isNaN(power) && power >= 0.05 && power <= 0.99) {
        this.current.minPower = Math.round(power * 100) / 100;
      }
    }
    if (params.keepMissingPower !== undefined) {
      this.current.keepMissingPower = params.keepMissingPower !== 'false' && params.keepMissingPower !== '0';
    }
    if (params.criterion && FReD.successCriteria.criteria[params.criterion]) {
      this.current.criterion = params.criterion;
    }
    if (params.search) {
      this.current.search = params.search;
    }
    if (params.tab && this.VALID_TABS.includes(params.tab)) {
      this.current.tab = params.tab;
    }
  },

  /**
   * Save current state to URL
   */
  saveToURL(pushHistory = false) {
    // Include all state keys - use null for defaults to trigger deletion
    // Exception: criterion is always shown for transparency
    const params = {
      source: this.current.source !== this.defaults.source ? this.current.source : null,
      power: this.current.minPower !== this.defaults.minPower ? this.current.minPower : null,
      keepMissingPower: this.current.keepMissingPower !== this.defaults.keepMissingPower ? 'false' : null,
      criterion: this.current.criterion,  // Always show criterion for transparency
      search: this.current.search !== this.defaults.search ? this.current.search : null,
      tab: this.current.tab !== this.defaults.tab ? this.current.tab : null
    };

    FReD.utils.updateQueryParams(params, pushHistory);
  },

  /**
   * Get current state
   */
  get(key) {
    return key ? this.current[key] : { ...this.current };
  },

  /**
   * Set state value(s)
   */
  set(keyOrObj, value) {
    const changes = typeof keyOrObj === 'string'
      ? { [keyOrObj]: value }
      : keyOrObj;

    let hasChanges = false;
    let tabChanged = false;
    const acceptedChanges = {};
    Object.entries(changes).forEach(([k, v]) => {
      if (k === 'tab' && !this.VALID_TABS.includes(v)) return;
      if (this.current[k] !== v) {
        this.current[k] = v;
        acceptedChanges[k] = v;
        hasChanges = true;
        if (k === 'tab') tabChanged = true;
      }
    });

    if (hasChanges) {
      this.saveToURL(tabChanged);
      this.notifyListeners(acceptedChanges);
    }
  },

  /**
   * Reset to defaults
   */
  reset() {
    this.current = { ...this.defaults };
    this.saveToURL();
    this.notifyListeners(this.defaults);
  },

  /**
   * Add state change listener
   */
  onChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  },

  /**
   * Notify all listeners of state change
   */
  notifyListeners(changes = this.current) {
    this.listeners.forEach(callback => {
      try {
        callback(changes, this.current);
      } catch (err) {
        console.error('State listener error:', err);
      }
    });
  },

  /**
   * Get shareable URL for current state
   */
  getShareableURL() {
    return window.location.href;
  }
};

window.FReD = FReD;
