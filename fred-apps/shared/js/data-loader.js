/**
 * FReD Static Apps - Data Loader
 *
 * Handles loading and caching of JSON data files
 */

window.FReD = window.FReD || {};

FReD.dataLoader = {
  // Cache for loaded data
  _cache: {},

  // Base URL for data files (can be overridden).
  // On staging.forrt.org, read from production GitHub Pages (CORS-enabled) so
  // large datasets are not duplicated into webpage-staging's git history.
  baseUrl: (typeof window !== 'undefined' && window.location && window.location.hostname === 'staging.forrt.org')
    ? 'https://forrt.org/fred-apps/data/'
    : '../data/',

  // JSON data file names
  dataFiles: {
    explorer: 'explorer-data.json',
    flora: 'flora-data.json'
  },

  /**
   * Resolve full URL for any static data asset
   */
  getDataUrl(filename) {
    return this.baseUrl + filename;
  },

  /**
   * Load data file with caching
   */
  async load(type) {
    if (this._cache[type]) {
      return this._cache[type];
    }

    const filename = this.dataFiles[type];
    if (!filename) {
      throw new Error(`Unknown data type: ${type}`);
    }

    const url = this.baseUrl + filename;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this._cache[type] = data;

      console.log(`Loaded ${type} data:`, {
        studies: data.studies?.length || data.entries?.length || 0,
        timestamp: data.metadata?.generated
      });

      return data;
    } catch (error) {
      console.error(`Failed to load ${type} data:`, error);
      throw error;
    }
  },

  /**
   * Load explorer data
   */
  async loadExplorerData() {
    return this.load('explorer');
  },

  /**
   * Load FLoRA/annotator data
   */
  async loadFloraData() {
    return this.load('flora');
  },

  /**
   * Clear cache
   */
  clearCache(type = null) {
    if (type) {
      delete this._cache[type];
    } else {
      this._cache = {};
    }
  },

  /**
   * Check if data is cached
   */
  isCached(type) {
    return !!this._cache[type];
  },

  /**
   * Get cached data (without loading)
   */
  getCached(type) {
    return this._cache[type] || null;
  },

  /**
   * Preload all data files
   */
  async preloadAll() {
    const promises = Object.keys(this.dataFiles).map(type => this.load(type));
    return Promise.all(promises);
  },

  /**
   * Filter explorer studies based on criteria
   */
  filterStudies(studies, filters) {
    let filtered = [...studies];

    // Source filter
    if (filters.source && filters.source !== 'All studies') {
      filtered = filtered.filter(s => s.source === filters.source);
    }

    // Power filter (respects keepMissingPower, default true)
    const minPower = filters.minPower != null ? filters.minPower : 0.05;
    const keepMissing = filters.keepMissingPower !== false;
    filtered = filtered.filter(s => {
      const hasPower = s.power_r != null && s.power_r !== '' && Number.isFinite(Number(s.power_r));
      if (!hasPower) return keepMissing;
      return Number(s.power_r) >= minPower;
    });

    // Text search
    if (filters.search && filters.search.trim()) {
      const searchLower = filters.search.toLowerCase().trim();
      filtered = filtered.filter(s =>
        (s.description && s.description.toLowerCase().includes(searchLower)) ||
        (s.ref_o && s.ref_o.toLowerCase().includes(searchLower)) ||
        (s.ref_r && s.ref_r.toLowerCase().includes(searchLower)) ||
        (s.tags && s.tags.toLowerCase().includes(searchLower))
      );
    }

    return filtered;
  },

  /**
   * Get unique sources from studies
   */
  getSources(studies) {
    const sources = new Set(['All studies']);
    studies.forEach(s => {
      if (s.source) sources.add(s.source);
    });
    return Array.from(sources).sort((a, b) => {
      if (a === 'All studies') return -1;
      if (b === 'All studies') return 1;
      return a.localeCompare(b);
    });
  },

  /**
   * Compute outcome counts for studies
   */
  computeOutcomeCounts(studies, criterionId) {
    const counts = {};
    studies.forEach(study => {
      const { outcomeReport } = FReD.successCriteria.getOutcome(study, criterionId);
      const key = outcomeReport || 'Not calculable';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  },

  /**
   * Get studies grouped by reference
   */
  getStudiesByReference(studies) {
    return FReD.utils.groupBy(studies, 'ref_o');
  },

  /**
   * Aggregate outcomes by reference (for decade/journal charts)
   */
  aggregateByReference(studies, criterionId) {
    const grouped = this.getStudiesByReference(studies);
    const aggregated = [];

    Object.entries(grouped).forEach(([ref, refStudies]) => {
      const outcomes = refStudies.map(s =>
        FReD.successCriteria.getOutcome(s, criterionId).outcome
      );

      // Determine aggregate outcome (exclude non-calculable / non-coded entries case-insensitively)
      const calculableOutcomes = outcomes.filter(o => {
        if (!o) return false;
        const lower = o.toLowerCase();
        return lower !== 'not calculable' && lower !== 'not coded';
      });
      const uniqueByLower = new Map();
      calculableOutcomes.forEach(o => {
        const lower = o.toLowerCase();
        if (!uniqueByLower.has(lower)) {
          uniqueByLower.set(lower, o);
        }
      });

      let aggregateOutcome;
      if (uniqueByLower.size === 0) {
        aggregateOutcome = 'Not calculable';
      } else if (uniqueByLower.size === 1) {
        aggregateOutcome = uniqueByLower.values().next().value;
      } else {
        aggregateOutcome = 'mixed';
      }

      aggregated.push({
        ref_o: ref,
        orig_journal: refStudies[0].orig_journal,
        orig_year: refStudies[0].orig_year,
        discipline: refStudies[0].discipline,
        outcome: aggregateOutcome,
        count: refStudies.length
      });
    });

    return aggregated;
  }
};

window.FReD = FReD;
