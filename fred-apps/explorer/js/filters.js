/**
 * FReD Explorer - Filter Management
 *
 * Handles filter UI and data filtering
 */

window.FReD = window.FReD || {};

FReD.filters = {
  // DOM element references
  elements: {},

  // Debounced search handler
  debouncedSearch: null,

  /**
   * Initialize filters
   */
  init() {
    // Get DOM elements
    this.elements = {
      search: document.getElementById('search'),
      source: document.getElementById('source'),
      minPower: document.getElementById('minpower'),
      minPowerValue: document.getElementById('minpower-value'),
      keepMissingPower: document.getElementById('keep-missing-power'),
      powerFilterNote: document.getElementById('power-filter-note'),
      criterionSelect: document.getElementById('success-criterion'),
      // Support both old radio buttons and new dropdown
      criterionRadios: document.querySelectorAll('input[name="criterion"]'),
      studyCount: document.getElementById('study-count'),
      replicationCount: document.getElementById('replication-count')
    };

    // Create debounced search
    this.debouncedSearch = FReD.utils.debounce((value) => {
      FReD.state.set('search', value);
    }, 300);

    // Setup event listeners
    this.setupListeners();

    // Apply initial state to UI
    this.applyState(FReD.state.get());
  },

  /**
   * Setup event listeners for filter controls
   */
  setupListeners() {
    // Search input
    this.elements.search.addEventListener('input', (e) => {
      this.debouncedSearch(e.target.value);
    });

    // Source dropdown
    this.elements.source.addEventListener('change', (e) => {
      FReD.state.set('source', e.target.value);
    });

    // Power slider
    this.elements.minPower.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      const label = this.formatPowerLabel(value);
      this.elements.minPowerValue.textContent = label;
      this.elements.minPower.setAttribute('aria-valuetext', label);
      if (FReD.explorer && FReD.explorer.allStudies) {
        this.updatePowerNote(FReD.explorer.allStudies, {
          ...FReD.state.get(),
          minPower: value,
          keepMissingPower: this.elements.keepMissingPower ? this.elements.keepMissingPower.checked : true
        });
      }
    });

    this.elements.minPower.addEventListener('change', (e) => {
      FReD.state.set('minPower', parseFloat(e.target.value));
    });

    // Keep missing power checkbox
    if (this.elements.keepMissingPower) {
      this.elements.keepMissingPower.addEventListener('change', (e) => {
        FReD.state.set('keepMissingPower', e.target.checked);
      });
    }

    // Criterion dropdown (new design)
    if (this.elements.criterionSelect) {
      this.elements.criterionSelect.addEventListener('change', (e) => {
        FReD.state.set('criterion', e.target.value);
      });
    }

    // Criterion radios (legacy support)
    this.elements.criterionRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          FReD.state.set('criterion', e.target.value);
        }
      });
    });
  },

  formatPowerLabel(value) {
    const v = value != null && !isNaN(value) ? value : 0.05;
    return Math.round(v * 100) + '%';
  },

  /**
   * Update live explanation of how many effects have missing power or fall below threshold
   */
  updatePowerNote(allStudies, state) {
    const el = this.elements.powerFilterNote;
    if (!el || !Array.isArray(allStudies)) return;

    // Count against the pre-power-filtered subset (after source + search)
    const prePower = FReD.dataLoader.filterStudies(allStudies, {
      source: state.source,
      search: state.search,
      minPower: 0,
      keepMissingPower: true
    });

    const minPower = state.minPower != null ? state.minPower : 0.05;
    const keepMissing = state.keepMissingPower !== false;
    const pct = Math.round(minPower * 100);

    let missingCount = 0;
    let belowCount = 0;
    for (const s of prePower) {
      const hasPower = s.power_r != null && s.power_r !== '' && Number.isFinite(Number(s.power_r));
      if (!hasPower) {
        missingCount++;
      } else if (Number(s.power_r) < minPower) {
        belowCount++;
      }
    }

    if (prePower.length === 0) {
      el.textContent = '';
      return;
    }

    if (keepMissing) {
      el.textContent = `Keeps ${missingCount.toLocaleString()} without power data · excludes ${belowCount.toLocaleString()} below ${pct}%`;
    } else {
      el.textContent = `Excludes ${missingCount.toLocaleString()} without power data & ${belowCount.toLocaleString()} below ${pct}%`;
    }
  },

  /**
   * Apply state to UI elements
   */
  applyState(state) {
    // Search
    if (this.elements.search.value !== state.search) {
      this.elements.search.value = state.search || '';
    }

    // Source
    if (this.elements.source.value !== state.source) {
      this.elements.source.value = state.source || 'All studies';
    }

    // Power slider
    const minPower = state.minPower ?? 0.05;
    if (parseFloat(this.elements.minPower.value) !== minPower) {
      this.elements.minPower.value = minPower;
    }
    const powerLabel = this.formatPowerLabel(minPower);
    this.elements.minPowerValue.textContent = powerLabel;
    this.elements.minPower.setAttribute('aria-valuetext', powerLabel);

    // Keep missing power checkbox
    if (this.elements.keepMissingPower) {
      this.elements.keepMissingPower.checked = state.keepMissingPower !== false;
    }

    // Criterion dropdown
    if (this.elements.criterionSelect && this.elements.criterionSelect.value !== state.criterion) {
      this.elements.criterionSelect.value = state.criterion;
    }

    // Criterion radios (legacy support)
    this.elements.criterionRadios.forEach(radio => {
      radio.checked = radio.value === state.criterion;
    });
  },

  /**
   * Populate source dropdown from data
   */
  populateSources(sources) {
    const select = this.elements.source;
    const currentValue = select.value;

    // Ensure sources is an array
    const sourceArray = Array.isArray(sources) ? sources : (sources ? [sources] : ['All studies']);

    select.innerHTML = '';
    sourceArray.forEach(source => {
      const option = document.createElement('option');
      option.value = source;
      option.textContent = source;
      select.appendChild(option);
    });

    // Restore selection if still valid
    if (sourceArray.includes(currentValue)) {
      select.value = currentValue;
    }
  },

  /**
   * Update study count display
   */
  updateStudyCount(count, total) {
    this.elements.studyCount.textContent = count === total
      ? count.toLocaleString()
      : `${count.toLocaleString()} of ${total.toLocaleString()}`;
  },

  /**
   * Count unique replications in a set of studies
   * Replications are defined by unique combinations of:
   * doi_o, doi_r (coalesced with url_r), study_r, and study_o
   */
  countReplications(studies) {
    const seen = new Set();
    studies.forEach(study => {
      // Coalesce doi_r with url_r
      const doiR = study.doi_r || study.url_r || '';
      // Build key from all identifying fields
      const key = [
        study.doi_o || '',
        doiR,
        study.study_r || '',
        study.study_o || ''
      ].join('|');
      seen.add(key);
    });
    return seen.size;
  },

  /**
   * Update replication count display
   */
  updateReplicationCount(filteredStudies, allStudies) {
    if (!this.elements.replicationCount) return;

    const filteredCount = this.countReplications(filteredStudies);
    const totalCount = this.countReplications(allStudies);

    this.elements.replicationCount.textContent = filteredCount === totalCount
      ? filteredCount.toLocaleString()
      : `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()}`;
  },

  /**
   * Get current filter values
   */
  getFilters() {
    // Use dropdown if available, otherwise fall back to radio buttons
    const criterion = this.elements.criterionSelect
      ? this.elements.criterionSelect.value
      : document.querySelector('input[name="criterion"]:checked')?.value || 'significance_r';

    return {
      source: this.elements.source.value,
      minPower: parseFloat(this.elements.minPower.value),
      keepMissingPower: this.elements.keepMissingPower ? this.elements.keepMissingPower.checked : true,
      search: this.elements.search.value,
      criterion
    };
  },

  /**
   * Apply filters to studies array
   */
  applyFilters(studies, filters = null) {
    const f = filters || this.getFilters();
    return FReD.dataLoader.filterStudies(studies, f);
  }
};

window.FReD = FReD;
