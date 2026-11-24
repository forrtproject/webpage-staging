/**
 * FReD Explorer - Main Application
 *
 * Initializes and coordinates all components of the Explorer app
 */

window.FReD = window.FReD || {};

FReD.explorer = {
  // Data
  allStudies: [],
  filteredStudies: [],
  dataTable: null,
  fullDataTable: null,
  visibleColumns: [],

  /**
   * Initialize the application
   */
  async init() {
    console.log('Initializing FReD Explorer...');

    // Show welcome modal (unless user opted out)
    this.initWelcomeModal();

    // Initialize state management
    FReD.state.init();

    // Initialize filters
    FReD.filters.init();

    // Initialize charts
    FReD.charts.scatterplot.init('scatterplot');
    FReD.charts.barchart.init('barchart');
    FReD.charts.forestplot.init('forestplot');
    FReD.charts.trends.init('decade-chart', 'discipline-chart');

    // Setup tab navigation
    this.setupTabs();

    // Setup export buttons
    this.setupExportButtons();

    // Setup column selector
    this.setupColumnSelector();

    // Setup reference tooltips
    this.setupTooltips();

    // Listen for state changes
    FReD.state.onChange((changes, state) => {
      this.onStateChange(changes, state);
    });

    // Load data
    try {
      await this.loadData();
    } catch (error) {
      console.error('Failed to load data:', error);
      FReD.utils.showNotification('Failed to load data. Please try refreshing the page.', 'error');
    }

    // Load citation
    this.loadCitation();
  },

  /**
   * Accessible modal open/close helper with focus trap, Escape/backdrop dismiss,
   * and focus restoration.
   */
  _activeModal: null,
  _lastFocusedEl: null,

  _setBackgroundInert(inert) {
    document.querySelectorAll('body > header, body > main, body > footer').forEach(el => {
      el.inert = !!inert;
    });
    document.body.style.overflow = inert ? 'hidden' : '';
  },

  openModal(modalEl, triggerEl) {
    if (!modalEl) return;
    this._lastFocusedEl = triggerEl || null;
    this._activeModal = modalEl;
    modalEl.classList.add('active');
    modalEl.setAttribute('aria-hidden', 'false');
    this._setBackgroundInert(true);
    // Force style flush so visibility:visible is active before focusing
    void modalEl.offsetHeight;

    const focusables = this._getModalFocusables(modalEl);
    if (focusables.length > 0) {
      focusables[0].focus();
    }
  },

  closeModal(modalEl) {
    if (!modalEl || !modalEl.classList.contains('active')) return;
    if (modalEl.id === 'welcome-modal') {
      const dontShow = document.getElementById('welcome-dont-show');
      if (dontShow?.checked) {
        localStorage.setItem('fred-explorer-welcome-dismissed', 'true');
      }
    } else if (modalEl.id === 'about-modal') {
      this.resetCitationCopyState();
    }
    modalEl.classList.remove('active');
    modalEl.setAttribute('aria-hidden', 'true');
    this._setBackgroundInert(false);
    if (this._activeModal === modalEl) {
      this._activeModal = null;
    }
    const prev = this._lastFocusedEl;
    this._lastFocusedEl = null;
    if (prev && typeof prev.focus === 'function' && document.contains(prev) && prev.offsetParent !== null) {
      prev.focus();
    } else if (prev) {
      // Trigger is hidden (e.g. #about-link inside collapsed mobile #header-nav): return focus to menu toggle if visible
      const menuBtn = document.getElementById('topbar-menu-btn');
      if (menuBtn && menuBtn.offsetParent !== null) {
        menuBtn.focus();
      } else if (document.activeElement && modalEl.contains(document.activeElement)) {
        document.body.setAttribute('tabindex', '-1');
        document.body.focus({ preventScroll: true });
        document.body.removeAttribute('tabindex');
      }
    } else if (document.activeElement && modalEl.contains(document.activeElement)) {
      // First-run modal without trigger: move sequential focus cursor to top of document so the next Tab reaches .skip-link first
      document.body.setAttribute('tabindex', '-1');
      document.body.focus({ preventScroll: true });
      document.body.removeAttribute('tabindex');
    }
  },

  _getModalFocusables(modalEl) {
    return [...modalEl.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(el => el.offsetParent !== null);
  },

  setupModals() {
    if (this._modalsBound) return;
    this._modalsBound = true;

    const welcomeModal = document.getElementById('welcome-modal');
    const aboutModal = document.getElementById('about-modal');

    document.getElementById('welcome-close-btn')?.addEventListener('click', () => this.closeModal(welcomeModal));
    document.getElementById('welcome-modal-x')?.addEventListener('click', () => this.closeModal(welcomeModal));
    document.getElementById('about-close-btn')?.addEventListener('click', () => this.closeModal(aboutModal));
    document.getElementById('about-modal-close')?.addEventListener('click', () => this.closeModal(aboutModal));

    // Backdrop click closes modal
    [welcomeModal, aboutModal].forEach(modalEl => {
      modalEl?.addEventListener('click', (e) => {
        if (e.target === modalEl) {
          this.closeModal(modalEl);
        }
      });
    });

    // Global Escape & Tab focus trap while a modal is active
    document.addEventListener('keydown', (e) => {
      const modalEl = this._activeModal;
      if (!modalEl || !modalEl.classList.contains('active')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeModal(modalEl);
        return;
      }
      if (e.key === 'Tab') {
        const focusables = this._getModalFocusables(modalEl);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && (document.activeElement === first || !modalEl.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !modalEl.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  },

  /**
   * Initialize welcome modal with "don't show again" functionality
   */
  initWelcomeModal() {
    this.setupModals();
    const STORAGE_KEY = 'fred-explorer-welcome-dismissed';
    const modal = document.getElementById('welcome-modal');

    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      return;
    }

    this.openModal(modal, null);
  },

  _citationCopyAttemptId: 0,
  _citationCopyResetTimer: null,

  /**
   * Reset Citation Copy button state and invalidate any in-flight copy feedback
   */
  resetCitationCopyState() {
    this._citationCopyAttemptId += 1;
    clearTimeout(this._citationCopyResetTimer);
    this._citationCopyResetTimer = null;

    const copyBtn = document.getElementById('btn-copy-citation');
    const statusEl = document.getElementById('citation-copy-status');
    if (copyBtn) {
      copyBtn.classList.remove('is-copied');
      const labelEl = copyBtn.querySelector('.citation-copy-label');
      if (labelEl) labelEl.textContent = 'Copy';
    }
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.classList.remove('is-error');
      statusEl.classList.add('visually-hidden');
    }
  },

  /**
   * Load citation from FReD-data repo
   */
  async loadCitation() {
    const citationEl = document.getElementById('citation');
    const copyBtn = document.getElementById('btn-copy-citation');
    const statusEl = document.getElementById('citation-copy-status');
    if (!citationEl) return;

    if (copyBtn && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = 'true';
      copyBtn.addEventListener('click', async () => {
        const text = citationEl.textContent.trim();
        if (!text || copyBtn.disabled) return;

        // Clear any prior feedback/timer and tag this attempt so overlapping or post-close callbacks are ignored
        this.resetCitationCopyState();
        const attemptId = this._citationCopyAttemptId;
        const labelEl = copyBtn.querySelector('.citation-copy-label');

        try {
          if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
            throw new Error('Clipboard API unavailable');
          }
          await navigator.clipboard.writeText(text);
          if (attemptId !== this._citationCopyAttemptId) return;

          copyBtn.classList.add('is-copied');
          if (labelEl) labelEl.textContent = 'Copied';
          if (statusEl) {
            statusEl.classList.remove('is-error');
            statusEl.classList.add('visually-hidden');
            statusEl.textContent = 'Citation copied to clipboard';
          }
          this._citationCopyResetTimer = setTimeout(() => {
            if (attemptId !== this._citationCopyAttemptId) return;
            this.resetCitationCopyState();
          }, 2000);
        } catch (err) {
          if (attemptId !== this._citationCopyAttemptId) return;
          console.error('Failed to copy citation:', err);
          if (statusEl) {
            statusEl.classList.remove('visually-hidden');
            statusEl.classList.add('is-error');
            statusEl.textContent = 'Could not copy automatically. Select the citation text above to copy manually.';
          }
        }
      });
    }

    try {
      const response = await fetch('https://raw.githubusercontent.com/forrtproject/FReD-data/refs/heads/main/output/citation.txt');
      if (response.ok) {
        const citation = await response.text();
        citationEl.textContent = citation.trim();
        if (copyBtn) copyBtn.disabled = !citation.trim();
      } else {
        citationEl.textContent = 'Citation unavailable.';
        if (copyBtn) copyBtn.disabled = true;
      }
    } catch (error) {
      console.error('Failed to load citation:', error);
      citationEl.textContent = 'Citation unavailable.';
      if (copyBtn) copyBtn.disabled = true;
    }
  },

  /**
   * Load data from JSON file
   */
  async loadData() {
    console.log('Loading data...');

    const data = await FReD.dataLoader.loadExplorerData();

    this.allStudies = data.studies || [];
    console.log(`Loaded ${this.allStudies.length} studies`);

    // Populate source dropdown
    // data.sources may be a string or non-array, so check for array explicitly
    const sources = Array.isArray(data.sources) ? data.sources : FReD.dataLoader.getSources(this.allStudies);
    FReD.filters.populateSources(sources);

    // Update metadata displays
    if (data.metadata) {
      document.getElementById('data-updated').textContent =
        new Date(data.metadata.generated).toLocaleDateString();
    }

    // Apply initial state to filters
    FReD.filters.applyState(FReD.state.get());

    // Initial render
    this.updateFilters();

    // Set active tab from state
    const tab = FReD.state.get('tab');
    if (tab) {
      this.switchTab(tab);
    }

    // Ensure success note is shown (updateFilters already calls this, but ensure visibility)
    this.updateSuccessNote(FReD.state.get('criterion'));
  },

  /**
   * Handle state changes
   */
  onStateChange(changes, state) {
    // Apply state to filter UI
    FReD.filters.applyState(state);

    // Re-filter and render (includes success note update)
    this.updateFilters();

    // Switch tab if changed
    if (changes.tab) {
      this.switchTab(changes.tab);
    }
  },

  /**
   * Update filters and re-render
   */
  updateFilters() {
    const state = FReD.state.get();

    // Apply filters
    this.filteredStudies = FReD.filters.applyFilters(this.allStudies, {
      source: state.source,
      minPower: state.minPower,
      keepMissingPower: state.keepMissingPower,
      search: state.search
    });

    // Update count displays & power breakdown note
    FReD.filters.updateStudyCount(this.filteredStudies.length, this.allStudies.length);
    FReD.filters.updateReplicationCount(this.filteredStudies, this.allStudies);
    FReD.filters.updatePowerNote(this.allStudies, state);

    // Update success note (depends on filtered studies)
    this.updateSuccessNote(state.criterion);

    // Update all visualizations
    this.renderAll(state.criterion);
  },

  /**
   * Render all visualizations
   */
  renderAll(criterion) {
    // Scatterplot
    FReD.charts.scatterplot.render(this.filteredStudies, criterion);

    // Bar chart
    FReD.charts.barchart.render(this.filteredStudies, criterion);

    // Update studies table
    this.updateStudiesTable(criterion);

    // Forest plot and trends are rendered on tab switch for performance
    const activeTab = FReD.state.get('tab');
    if (activeTab === 'forest') {
      FReD.charts.forestplot.render(this.filteredStudies);
    } else if (activeTab === 'correlates') {
      FReD.charts.trends.renderDecade(this.filteredStudies, criterion);
      FReD.charts.trends.renderDiscipline(this.filteredStudies, criterion);
    } else if (activeTab === 'data') {
      this.updateFullDataTable(criterion);
    }
  },

  /**
   * Update success criterion note
   */
  updateSuccessNote(criterion) {
    const noteEl = document.getElementById('success-note');
    const criterionInfo = FReD.successCriteria.getCriterion(criterion);
    if (criterionInfo && noteEl) {
      let noteHtml = `<strong>Note:</strong> ${criterionInfo.note}`;

      // Add dynamic reversal caveat for significance_r criterion
      if (criterionInfo.hasDynamicReversalNote && this.filteredStudies.length > 0) {
        const { successCount, nonAssessableCount } = FReD.successCriteria.countNonAssessableSuccesses(
          this.filteredStudies,
          criterion
        );

        if (nonAssessableCount > 0) {
          noteHtml += `<br><em style="color: var(--text-muted);">For the selected entries, ${nonAssessableCount} of ${successCount} successes cannot be distinguished from reversals (non-directional effect type or missing effect size data).</em>`;
        }
      }

      noteHtml += '<br>A failure under any criterion can come from chance, low power, flaws in the replication, or differences in sample and setting, so on its own it does not show that the original finding was false. Open the studies before drawing conclusions.';

      noteEl.innerHTML = noteHtml;
    }
  },

  /**
   * Setup tab/sidebar navigation
   */
  setupTabs() {
    // Support both old tabs and new sidebar nav
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        FReD.state.set('tab', tabId);
      });
    });

    // Sidebar navigation links
    const sidebarLinks = document.querySelectorAll('.sidebar-nav-link');
    sidebarLinks.forEach(link => {
      link.addEventListener('click', () => {
        const tabId = link.dataset.tab;
        FReD.state.set('tab', tabId);
      });
    });

    // Topbar brand home link (return to Overview on unmodified primary click)
    const homeLink = document.getElementById('topbar-home-link');
    if (homeLink) {
      homeLink.addEventListener('click', (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        FReD.state.set('tab', 'overview');
        window.scrollTo(0, 0);
      });
    }

    // About modal links (header & footer)
    const aboutModal = document.getElementById('about-modal');
    ['about-link', 'footer-about-link'].forEach(id => {
      const link = document.getElementById(id);
      if (link) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          this.openModal(aboutModal, link);
        });
      }
    });

    // Mobile topbar menu toggle (<= 960px)
    const menuBtn = document.getElementById('topbar-menu-btn');
    const headerNav = document.getElementById('header-nav');
    if (menuBtn && headerNav) {
      const closeMenu = (restoreFocus) => {
        if (!headerNav.classList.contains('open')) return;
        headerNav.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
        if (restoreFocus) menuBtn.focus();
      };
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = headerNav.classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', String(isOpen));
      });
      headerNav.addEventListener('click', (e) => {
        if (e.target.closest('a')) {
          closeMenu(false);
        }
      });
      document.addEventListener('click', (e) => {
        if (headerNav.classList.contains('open') && !headerNav.contains(e.target) && !menuBtn.contains(e.target)) {
          closeMenu(false);
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && headerNav.classList.contains('open')) {
          e.preventDefault();
          closeMenu(true);
        }
      });
      headerNav.addEventListener('focusout', () => {
        setTimeout(() => {
          if (headerNav.classList.contains('open') && !headerNav.contains(document.activeElement) && document.activeElement !== menuBtn) {
            closeMenu(false);
          }
        }, 0);
      });
    }

    // Harden DataTables scrollX header/body width alignment across font loads and resizes
    if (!this._tableAdjustBound) {
      this._tableAdjustBound = true;
      const adjustTables = FReD.utils.debounce(() => {
        if (this.dataTable && document.getElementById('tab-overview')?.classList.contains('active')) {
          this.dataTable.columns.adjust();
        }
        if (this.fullDataTable && document.getElementById('tab-data')?.classList.contains('active')) {
          this.fullDataTable.columns.adjust();
        }
      }, 120);
      window.addEventListener('resize', adjustTables);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(adjustTables);
      }
    }
  },

  /**
   * Switch to a tab
   */
  switchTab(tabId) {
    // Update tab buttons (legacy)
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    // Update sidebar navigation links & aria-current
    document.querySelectorAll('.sidebar-nav-link').forEach(link => {
      const isCurrent = link.dataset.tab === tabId;
      link.classList.toggle('active', isCurrent);
      if (isCurrent) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabId}`);
    });

    // Render tab-specific content and re-adjust DataTables column widths
    const criterion = FReD.state.get('criterion');
    if (tabId === 'overview') {
      requestAnimationFrame(() => {
        if (this.dataTable) this.dataTable.columns.adjust();
      });
    } else if (tabId === 'forest') {
      FReD.charts.forestplot.render(this.filteredStudies);
    } else if (tabId === 'correlates') {
      FReD.charts.trends.renderDecade(this.filteredStudies, criterion);
      FReD.charts.trends.renderDiscipline(this.filteredStudies, criterion);
    } else if (tabId === 'data') {
      this.updateFullDataTable(criterion);
      requestAnimationFrame(() => {
        if (this.fullDataTable) this.fullDataTable.columns.adjust();
      });
    }
  },

  /**
   * Update the studies table
   */
  updateStudiesTable(criterion) {
    const self = this;

    // Get visible columns from column config
    if (!this.visibleColumns || this.visibleColumns.length === 0) {
      this.visibleColumns = FReD.columnConfig.getVisibleColumns();
    }

    // Build row data using column config
    const tableData = this.filteredStudies.map((study, idx) => {
      return FReD.columnConfig.buildRowData(study, idx, this.visibleColumns, criterion);
    });

    // Get the index of the idx column (always last)
    const idxColIndex = this.visibleColumns.length + 1;

    if (this.dataTable) {
      this.dataTable.clear();
      this.dataTable.rows.add(tableData);
      this.dataTable.draw();
    } else {
      const columns = FReD.columnConfig.buildTableColumns(this.visibleColumns);

      this.dataTable = $('#studies-table').DataTable({
        data: tableData,
        columns: columns,
        pageLength: 10,
        lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
        order: [[this.getOrigRefColumnIndex(), 'asc']], // Order by Original Reference if visible
        dom: 'lfrtip', // Include length menu
        scrollX: true,
        language: {
          emptyTable: 'No effects match the current filters'
        }
      });

      // Add click handler for expand/collapse (unbind first to prevent duplicates on rebuildTable)
      $('#studies-table tbody').off('click', 'td.dt-control').on('click', 'td.dt-control', function() {
        const tr = $(this).closest('tr');
        const row = self.dataTable.row(tr);
        const btn = $(this).find('.dt-expand-btn')[0];

        if (row.child.isShown()) {
          row.child.hide();
          tr.removeClass('shown');
          if (btn) {
            btn.setAttribute('aria-expanded', 'false');
            btn.setAttribute('aria-label', 'Show study details');
          }
        } else {
          const rowData = row.data();
          const studyIdx = rowData[rowData.length - 1]; // idx is always last
          const study = self.filteredStudies[studyIdx];
          const activeCriterion = FReD.state.get('criterion');
          row.child(self.formatStudyDetails(study, activeCriterion)).show();
          tr.addClass('shown');
          if (btn) {
            btn.setAttribute('aria-expanded', 'true');
            btn.setAttribute('aria-label', 'Hide study details');
          }
        }
      });
    }
  },

  /**
   * Get the column index for Original Reference (for default sorting)
   */
  getOrigRefColumnIndex() {
    const idx = this.visibleColumns.indexOf('ref_o');
    return idx >= 0 ? idx + 1 : 1; // +1 for control column, default to 1
  },

  /**
   * Setup column selector UI
   */
  setupColumnSelector() {
    const container = document.getElementById('column-selector-container');
    if (!container) return;

    // Initialize visible columns
    this.visibleColumns = FReD.columnConfig.getVisibleColumns();

    // Build the dropdown HTML
    const selectableColumns = FReD.columnConfig.getSelectableColumns();

    let html = `
      <div class="column-selector-wrapper">
        <button class="column-selector-btn" id="column-selector-btn" type="button">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          Columns
        </button>
        <div class="column-selector-dropdown" id="column-selector-dropdown" role="region" aria-label="Select visible columns">
          <div class="column-selector-header">
            Select Columns
            <button type="button" class="column-selector-reset" id="column-selector-reset">Reset</button>
          </div>
          <div class="column-selector-list">
    `;

    selectableColumns.forEach((col, i) => {
      const checked = this.visibleColumns.includes(col.key) ? 'checked' : '';
      html += `
        <div class="column-selector-item" draggable="true" data-column-key="${col.key}">
          <span class="column-drag-handle" aria-hidden="true" title="Drag to reorder">&#8801;</span>
          <input type="checkbox" id="col-${col.key}" data-column="${col.key}" ${checked}>
          <label for="col-${col.key}">${col.label}</label>
          <span class="column-move-btns">
            <button type="button" class="column-move-btn" data-move="up" data-column="${col.key}" aria-label="Move ${col.label} up" ${i === 0 ? 'disabled' : ''}>&#9650;</button>
            <button type="button" class="column-move-btn" data-move="down" data-column="${col.key}" aria-label="Move ${col.label} down" ${i === selectableColumns.length - 1 ? 'disabled' : ''}>&#9660;</button>
          </span>
        </div>
      `;
    });

    html += `
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Setup event handlers
    const btn = document.getElementById('column-selector-btn');
    const dropdown = document.getElementById('column-selector-dropdown');
    const resetBtn = document.getElementById('column-selector-reset');
    btn?.setAttribute('aria-expanded', 'false');
    btn?.setAttribute('aria-controls', 'column-selector-dropdown');

    // Toggle dropdown
    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dropdown.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });

    // Close dropdown when clicking outside or pressing Escape (bound once)
    if (!this._colSelectorDocBound) {
      this._colSelectorDocBound = true;
      document.addEventListener('click', (e) => {
        if (!e.target.isConnected) return;
        const c = document.getElementById('column-selector-container');
        const dd = document.getElementById('column-selector-dropdown');
        const b = document.getElementById('column-selector-btn');
        if (c && dd && !c.contains(e.target)) {
          dd.classList.remove('open');
          b?.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const dd = document.getElementById('column-selector-dropdown');
          const b = document.getElementById('column-selector-btn');
          if (dd && dd.classList.contains('open')) {
            dd.classList.remove('open');
            b?.setAttribute('aria-expanded', 'false');
            b?.focus();
          }
        }
      });
    }

    // Handle checkbox changes
    dropdown?.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        this.handleColumnToggle(e.target.dataset.column, e.target.checked);
      }
    });

    // Handle keyboard & pointer up/down move buttons without closing the popup
    dropdown?.addEventListener('click', (e) => {
      const moveBtn = e.target.closest('.column-move-btn');
      if (!moveBtn) return;
      e.stopPropagation();
      const item = moveBtn.closest('.column-selector-item');
      if (!item) return;
      const dir = moveBtn.dataset.move;
      const colKey = moveBtn.dataset.column;
      const moved = (dir === 'up' && item.previousElementSibling)
        ? (item.previousElementSibling.before(item), true)
        : (dir === 'down' && item.nextElementSibling)
          ? (item.nextElementSibling.after(item), true)
          : false;
      if (!moved) return;

      this.saveColumnOrder();
      this.setupColumnSelector();
      document.getElementById('column-selector-dropdown')?.classList.add('open');
      document.getElementById('column-selector-btn')?.setAttribute('aria-expanded', 'true');
      const primary = document.querySelector(`.column-move-btn[data-move="${dir}"][data-column="${colKey}"]`);
      const fallbackDir = dir === 'up' ? 'down' : 'up';
      const fallback = document.querySelector(`.column-move-btn[data-move="${fallbackDir}"][data-column="${colKey}"]`);
      if (primary && !primary.disabled) {
        primary.focus();
      } else if (fallback && !fallback.disabled) {
        fallback.focus();
      }
    });

    // Reset to defaults (keep popup open and keep focus on Reset button)
    resetBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.visibleColumns = FReD.columnConfig.resetToDefaults();
      this.setupColumnSelector(); // Rebuild to restore default order
      document.getElementById('column-selector-dropdown')?.classList.add('open');
      document.getElementById('column-selector-btn')?.setAttribute('aria-expanded', 'true');
      document.getElementById('column-selector-reset')?.focus();
      this.rebuildTable();
    });

    // Setup drag and drop for reordering
    this.setupColumnDragAndDrop(dropdown);
  },

  /**
   * Setup drag and drop handlers for column reordering
   */
  setupColumnDragAndDrop(dropdown) {
    const list = dropdown.querySelector('.column-selector-list');
    let draggedItem = null;

    list.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.column-selector-item');
      if (!item) return;
      draggedItem = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    list.addEventListener('dragend', (e) => {
      const item = e.target.closest('.column-selector-item');
      if (item) item.classList.remove('dragging');
      list.querySelectorAll('.column-selector-item').forEach(el => {
        el.classList.remove('drag-over');
      });
      draggedItem = null;
    });

    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const item = e.target.closest('.column-selector-item');
      if (!item || item === draggedItem) return;

      // Add visual feedback
      list.querySelectorAll('.column-selector-item').forEach(el => {
        el.classList.remove('drag-over');
      });
      item.classList.add('drag-over');
    });

    list.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetItem = e.target.closest('.column-selector-item');
      if (!targetItem || !draggedItem || targetItem === draggedItem) return;

      // Reorder in DOM
      const items = [...list.querySelectorAll('.column-selector-item')];
      const draggedIndex = items.indexOf(draggedItem);
      const targetIndex = items.indexOf(targetItem);

      if (draggedIndex < targetIndex) {
        targetItem.after(draggedItem);
      } else {
        targetItem.before(draggedItem);
      }

      // Save new order
      this.saveColumnOrder();
    });
  },

  /**
   * Save current column order from DOM
   */
  saveColumnOrder() {
    const list = document.querySelector('.column-selector-list');
    const items = list.querySelectorAll('.column-selector-item');
    const order = [...items].map(item => item.dataset.columnKey);

    FReD.columnConfig.saveColumnOrder(order);

    // Update visibleColumns to reflect new order
    this.visibleColumns = FReD.columnConfig.getVisibleColumns();
    this.rebuildTable();
  },

  /**
   * Handle column visibility toggle (preserves selector order and keeps >= 1 visible column)
   */
  handleColumnToggle(columnKey, isVisible) {
    const visibleSet = new Set(this.visibleColumns);
    if (isVisible) {
      visibleSet.add(columnKey);
    } else {
      if (visibleSet.size <= 1 && visibleSet.has(columnKey)) {
        const cb = document.getElementById(`col-${columnKey}`);
        if (cb) cb.checked = true;
        FReD.utils.showNotification('At least one column must remain visible.', 'info', 2500);
        return;
      }
      visibleSet.delete(columnKey);
    }

    // Keep columns in the selector's canonical order (includes newly added columns not yet in saved order)
    const order = FReD.columnConfig.getSelectableColumns().map(c => c.key);
    this.visibleColumns = order.filter(k => visibleSet.has(k));

    // Save preference
    FReD.columnConfig.saveVisibleColumns(this.visibleColumns);

    // Rebuild table with new columns
    this.rebuildTable();
  },

  /**
   * Update checkbox states in the column selector
   */
  updateColumnCheckboxes() {
    const selectableColumns = FReD.columnConfig.getSelectableColumns();
    selectableColumns.forEach(col => {
      const checkbox = document.getElementById(`col-${col.key}`);
      if (checkbox) {
        checkbox.checked = this.visibleColumns.includes(col.key);
      }
    });
  },

  /**
   * Rebuild the table with current column configuration
   */
  rebuildTable() {
    // Destroy existing table
    if (this.dataTable) {
      this.dataTable.destroy();
      this.dataTable = null;
      $('#studies-table').empty();
    }

    // Rebuild with new columns
    const criterion = FReD.state.get('criterion');
    this.updateStudiesTable(criterion);
  },

  /**
   * Parse coded p-value operator string (e.g., 'l (<)', 'le (<=)', 'g (>)', 'ge (>=)',
   * 'ge (>)', 'e (=)', '"<"', '"="', '<', '>', 'l', 'g', 'le', 'ge', 'e') into display symbol.
   */
  parsePValueOperator(type) {
    if (type == null) return '=';
    const pt = String(type).trim().toLowerCase();
    if (!pt) return '=';

    // Check explicit symbolic operators first so strings like "ge (>=)", "ge (>)",
    // "le (<=)", '"<"', and '"="' map unambiguously before matching letter codes.
    if (pt.includes('>=')) return '≥';
    if (pt.includes('<=')) return '≤';
    if (pt.includes('>')) return '>';
    if (pt.includes('<')) return '<';

    // Fallback to letter codes when no symbolic operator is present
    if (/\bge\b/.test(pt)) return '≥';
    if (/\ble\b/.test(pt)) return '≤';
    if (/\bg\b/.test(pt)) return '>';
    if (/\bl\b/.test(pt)) return '<';
    if (pt.includes('=') || /\be\b/.test(pt)) return '=';

    return '=';
  },

  /**
   * Format coded p-value for display
   * Rules:
   * - Zero with '=', '<', or '≤' (e.g., SPSS .000 or underflowed computed p): display as "p < 0.001"
   * - Very small positive values (0 < p < 0.0001): compact scientific notation (e.g., 4.02e-22, 1e-5)
   * - p < X, p ≤ X, p > X, p ≥ X: show only up to last non-zero digit (e.g., 0.05 not 0.0500)
   * - p = X: show minimum 3 decimals, drop trailing zeros after 3 (e.g., 0.050 not 0.05000, keep 0.05001)
   */
  formatCodedPValue(value, type) {
    if (value == null || value === '') return 'N/A';

    // Convert to number in case it's a string from JSON
    const numValue = Number(value);
    if (!Number.isFinite(numValue)) return 'N/A';

    const symbol = this.parsePValueOperator(type);

    if (numValue === 0 && (symbol === '=' || symbol === '<' || symbol === '≤')) {
      return 'p < 0.001';
    }

    let formatted;
    if (numValue > 0 && numValue < 1e-4) {
      // Preserve precision for tiny / scientific-notation p-values (e.g. 4.02E-22)
      const [mantissa, exponent] = numValue.toExponential(2).split('e');
      const cleanMantissa = mantissa.replace(/\.?0+$/, '');
      formatted = `${cleanMantissa}e${exponent}`;
    } else if (symbol === '=') {
      // For p = X: minimum 3 decimals, drop trailing zeros after position 3
      const fullStr = numValue.toFixed(6);
      const decimalPos = fullStr.indexOf('.');
      if (decimalPos === -1) {
        formatted = numValue.toFixed(3);
      } else {
        const fullDecimals = fullStr.slice(decimalPos + 1);
        let lastSignificant = 2; // minimum 3 decimals (index 2)
        for (let i = fullDecimals.length - 1; i >= 3; i--) {
          if (fullDecimals[i] !== '0') {
            lastSignificant = i;
            break;
          }
        }
        formatted = numValue.toFixed(lastSignificant + 1);
      }
    } else {
      // For p <, p ≤, p >, p ≥: show only up to last non-zero digit
      const fullStr = numValue.toFixed(6);
      formatted = parseFloat(fullStr).toString();
    }

    return `p ${symbol} ${formatted}`;
  },

  /**
   * Check whether a coded p-value is indeterminate at alpha = 0.05
   * (e.g., p < 0.10, p <= 0.72, or p > 0.01)
   */
  isCodedPValueIndeterminate(value, type, alpha = 0.05) {
    if (value == null || value === '') return true;
    const numValue = Number(value);
    if (!Number.isFinite(numValue)) return true;
    const symbol = this.parsePValueOperator(type);
    if ((symbol === '<' || symbol === '≤') && numValue > alpha) return true;
    if ((symbol === '>' || symbol === '≥') && numValue < alpha) return true;
    return false;
  },

  /**
   * Format study p-value with fallback to ES-derived p-value when coded p-value is absent or indeterminate
   */
  formatStudyPValue(codedValue, codedType, computedValue) {
    const coded = this.formatCodedPValue(codedValue, codedType);
    const computed = this.formatCodedPValue(computedValue, '=');
    if (coded === 'N/A') {
      return computed !== 'N/A' ? `${computed} (computed)` : 'N/A';
    }
    if (computed !== 'N/A' && this.isCodedPValueIndeterminate(codedValue, codedType)) {
      return `${coded} (computed: ${computed})`;
    }
    return coded;
  },

  /**
   * Generate CI comparison visualization SVG (shown only when both original & replication CIs exist)
   */
  generateCIVisualization(study) {
    const es_o = study.es_o;
    const es_r = study.es_r;
    const ci_lower_o = study.ci_lower_o;
    const ci_upper_o = study.ci_upper_o;
    const ci_lower_r = study.ci_lower_r;
    const ci_upper_r = study.ci_upper_r;

    // Require both CIs so the mini forest comparison is always meaningful
    const hasOriginal = es_o != null && ci_lower_o != null && ci_upper_o != null;
    const hasReplication = es_r != null && ci_lower_r != null && ci_upper_r != null;

    if (!hasOriginal || !hasReplication) {
      return '<p style="font-size: 0.8125rem; color: var(--text-muted); margin: 0.35rem 0 0 0;">Both original and replication CIs are required for visual comparison.</p>';
    }

    // Calculate range for scaling (include 0 always)
    const allValues = [0, ci_lower_o, ci_upper_o, es_o, ci_lower_r, ci_upper_r, es_r];
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const range = maxVal - minVal || 1;
    const padding = range * 0.1;
    const scaleMin = minVal - padding;
    const scaleMax = maxVal + padding;
    const scaleRange = scaleMax - scaleMin;

    // Responsive SVG dimensions with clear Original / Replication labels
    const width = 320;
    const height = 84;
    const marginLeft = 72;
    const marginRight = 14;
    const plotWidth = width - marginLeft - marginRight;

    const scale = (val) => marginLeft + ((val - scaleMin) / scaleRange) * plotWidth;
    const zeroX = scale(0);

    const x1o = scale(ci_lower_o), x2o = scale(ci_upper_o), xPo = scale(es_o);
    const x1r = scale(ci_lower_r), x2r = scale(ci_upper_r), xPr = scale(es_r);

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Confidence interval comparison between Original and Replication" style="display: block; margin-top: 0.5rem; width: 100%; max-width: ${width}px; height: auto;">`
      + `<line x1="${zeroX}" y1="10" x2="${zeroX}" y2="66" style="stroke: var(--text-faint)" stroke-width="1" stroke-dasharray="3,3"/>`
      + `<text x="${zeroX}" y="79" text-anchor="middle" font-size="10" style="fill: var(--text-muted)">0</text>`
      + `<text x="${marginLeft - 8}" y="29" text-anchor="end" font-size="11" font-weight="600" style="fill: var(--study-original)">Original</text>`
      + `<line x1="${x1o}" y1="25" x2="${x2o}" y2="25" style="stroke: var(--study-original)" stroke-width="2"/>`
      + `<line x1="${x1o}" y1="20" x2="${x1o}" y2="30" style="stroke: var(--study-original)" stroke-width="2"/>`
      + `<line x1="${x2o}" y1="20" x2="${x2o}" y2="30" style="stroke: var(--study-original)" stroke-width="2"/>`
      + `<circle cx="${xPo}" cy="25" r="4.5" style="fill: var(--study-original)"/>`
      + `<text x="${marginLeft - 8}" y="54" text-anchor="end" font-size="11" font-weight="600" style="fill: var(--study-replication)">Replication</text>`
      + `<line x1="${x1r}" y1="50" x2="${x2r}" y2="50" style="stroke: var(--study-replication)" stroke-width="2"/>`
      + `<line x1="${x1r}" y1="45" x2="${x1r}" y2="55" style="stroke: var(--study-replication)" stroke-width="2"/>`
      + `<line x1="${x2r}" y1="45" x2="${x2r}" y2="55" style="stroke: var(--study-replication)" stroke-width="2"/>`
      + `<polygon points="${xPr},45 ${xPr + 5},50 ${xPr},55 ${xPr - 5},50" style="fill: var(--study-replication)"/>`
      + '</svg>';
  },

  /**
   * Format DOI as hyperlink showing full URL
   */
  formatDOILink(doi) {
    if (!doi) return '';
    const cleanDoi = doi.trim();
    const url = cleanDoi.startsWith('http') ? cleanDoi : `https://doi.org/${cleanDoi}`;
    return ` <a href="${FReD.utils.escapeHtml(url)}" target="_blank">${FReD.utils.escapeHtml(url)}</a>`;
  },

  /**
   * Format study details for expanded row
   */
  formatStudyDetails(study, criterion) {
    const { outcomeReport } = FReD.successCriteria.getOutcome(study, criterion);
    const criterionInfo = FReD.successCriteria.getCriterion(criterion);
    const criterionLabel = criterionInfo ? criterionInfo.label : criterion;

    const isFiniteNum = (v) => v != null && v !== '' && Number.isFinite(Number(v));
    const formatCI = (lo, hi) => {
      if (!isFiniteNum(lo) || !isFiniteNum(hi)) return 'N/A';
      return `[${FReD.utils.formatNumber(lo, 3)}, ${FReD.utils.formatNumber(hi, 3)}]`;
    };

    // Build replication reference with link
    const repRef = FReD.utils.escapeHtml(study.ref_r || 'N/A');
    const repLink = study.url_r ? ` <a href="${FReD.utils.escapeHtml(study.url_r)}" target="_blank" style="white-space: nowrap;">[Report]</a>` : '';

    // DOI links
    const origDOI = this.formatDOILink(study.doi_o);
    const repDOI = this.formatDOILink(study.doi_r);

    // Format claim (from claim_text_o field) - strip surrounding quotes if present
    let claimText = study.claim_text_o || '';
    if (claimText.startsWith('"') && claimText.endsWith('"')) {
      claimText = claimText.slice(1, -1);
    }
    claimText = claimText.trim() ? FReD.utils.escapeHtml(claimText.trim()) : null;
    const claimsHtml = claimText ? `
          <div style="margin-bottom: 1rem;">
            <h5 style="margin: 0 0 0.5rem 0; color: var(--primary);">Claim</h5>
            <div style="font-size: 0.875rem;">
              <p style="margin: 0;">${claimText}</p>
            </div>
          </div>` : '';

    return `
      <div class="study-details" style="padding: 1rem; background: var(--surface); border-radius: 4px; margin: 0.5rem;">
        ${claimsHtml}
        <div class="study-details-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 1rem;">
          <div>
            <h5 style="margin: 0 0 0.5rem 0; color: var(--primary);">Effect Sizes</h5>
            <table style="font-size: 0.875rem;">
              <tr><td style="padding-right: 1rem;"><strong>Original ES (r):</strong></td><td>${FReD.utils.formatNumber(study.es_o, 3) || 'N/A'}</td></tr>
              <tr><td><strong>Replication ES (r):</strong></td><td>${FReD.utils.formatNumber(study.es_r, 3) || 'N/A'}</td></tr>
              <tr><td><strong>Original N:</strong></td><td>${study.n_o || 'N/A'}</td></tr>
              <tr><td><strong>Replication N:</strong></td><td>${study.n_r || 'N/A'}</td></tr>
            </table>
          </div>
          <div>
            <h5 style="margin: 0 0 0.5rem 0; color: var(--primary);">Statistics</h5>
            <table style="font-size: 0.875rem;">
              <tr><td style="padding-right: 1rem;"><strong>Original p-value:</strong></td><td>${this.formatStudyPValue(study.pval_value_o, study.pval_type_o, study.p_o)}</td></tr>
              <tr><td><strong>Replication p-value:</strong></td><td>${this.formatStudyPValue(study.pval_value_r, study.pval_type_r, study.p_r)}</td></tr>
              <tr><td><strong>Power:</strong></td><td>${FReD.utils.formatNumber(study.power_r, 2) || 'N/A'}</td></tr>
              <tr><td><strong>Outcome (${FReD.utils.escapeHtml(criterionLabel)}):</strong></td><td>${FReD.utils.capFirstLetter(outcomeReport || 'Not calculable')}</td></tr>
            </table>
          </div>
          <div>
            <h5 style="margin: 0 0 0.5rem 0; color: var(--primary);">Confidence Intervals</h5>
            <table style="font-size: 0.875rem;">
              <tr><td style="padding-right: 1rem;"><strong>Original CI:</strong></td><td>${formatCI(study.ci_lower_o, study.ci_upper_o)}</td></tr>
              <tr><td><strong>Replication CI:</strong></td><td>${formatCI(study.ci_lower_r, study.ci_upper_r)}</td></tr>
            </table>
            ${this.generateCIVisualization(study)}
          </div>
        </div>
        <div style="margin-top: 1rem;">
          <h5 style="margin: 0 0 0.5rem 0; color: var(--primary);">References</h5>
          <p style="font-size: 0.875rem; margin: 0 0 0.5rem 0;"><strong>Original:</strong> ${FReD.utils.escapeHtml(study.ref_o || 'N/A')}${origDOI}</p>
          <p style="font-size: 0.875rem; margin: 0;"><strong>Replication:</strong> ${repRef}${repDOI}${repLink}</p>
        </div>
      </div>
    `;
  },

  /**
   * Update the full data table
   */
  updateFullDataTable(criterionArg) {
    const criterion = criterionArg || FReD.state.get('criterion');
    const tableData = this.filteredStudies.map((study, idx) => {
      const { outcomeReport } = FReD.successCriteria.getOutcome(study, criterion);
      const discipline = study.discipline
        ? FReD.charts.trends.capitalizeDiscipline(study.discipline)
        : '';
      return [
        FReD.utils.formatReferenceCell(study.ref_o, study.doi_o),
        FReD.utils.escapeHtml(study.description || ''),
        FReD.utils.formatNumber(study.es_o, 3),
        FReD.utils.formatNumber(study.es_r, 3),
        study.n_o ?? '',
        study.n_r ?? '',
        FReD.utils.formatNumber(study.power_r, 2),
        FReD.utils.escapeHtml(FReD.utils.capFirstLetter(outcomeReport || 'Not calculable')),
        FReD.utils.escapeHtml(discipline),
        idx
      ];
    });

    if (this.fullDataTable) {
      this.fullDataTable.clear();
      this.fullDataTable.rows.add(tableData);
      this.fullDataTable.draw();
    } else {
      this.fullDataTable = $('#full-data-table').DataTable({
        data: tableData,
        columns: [
          { title: 'Original Reference' },
          { title: 'Description', className: 'description-cell' },
          { title: 'ES (Orig)' },
          { title: 'ES (Rep)' },
          { title: 'N (Orig)' },
          { title: 'N (Rep)' },
          { title: 'Power' },
          { title: 'Result' },
          { title: 'Discipline' },
          { title: 'idx', visible: false, searchable: false }
        ],
        pageLength: 25,
        order: [[0, 'asc']],
        scrollX: true,
        language: {
          emptyTable: 'No studies match the current filters'
        }
      });
    }
  },

  /**
   * Setup export buttons
   */
  setupExportButtons() {
    // Copy button (visible columns & active table search)
    document.getElementById('btn-copy')?.addEventListener('click', () => {
      const text = this.getTableText();
      FReD.utils.copyToClipboard(text);
    });

    // CSV button (visible columns & active table search; UTF-8 BOM for Excel)
    document.getElementById('btn-csv')?.addEventListener('click', () => {
      const csv = '\uFEFF' + this.getTableCSV();
      FReD.utils.downloadFile(csv, `fred-explorer-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
    });

    // Download CSV button (full dataset tab, respects active table search; UTF-8 BOM for Excel)
    document.getElementById('btn-download')?.addEventListener('click', () => {
      const csv = '\uFEFF' + this.getFullDatasetCSV();
      FReD.utils.downloadFile(csv, `fred-explorer-full-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
    });
  },

  /**
   * Setup reference tooltips (hover, keyboard focus/Enter/Space, and touch tap)
   */
  setupTooltips() {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-popup';
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-label', 'Reference details');
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);

    const COPY_SVG = '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    const LINK_SVG = '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';

    let hideTimeout = null;
    let currentTarget = null;
    let pinnedByClick = false;
    let openedByHoverAt = 0;
    let tooltipGeneration = 0;

    const showTooltip = (target, pinned = false) => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }

      tooltipGeneration += 1;
      const gen = tooltipGeneration;
      currentTarget = target;
      pinnedByClick = pinned;
      const text = target.dataset.tooltip;
      const link = target.dataset.link;

      let html = `<div class="tooltip-text">${FReD.utils.escapeHtml(text)}</div>`;
      html += `<div class="tooltip-actions">`;
      html += `<button type="button" class="tooltip-btn tooltip-copy" title="Copy reference">${COPY_SVG}Copy</button>`;
      if (link) {
        html += `<a href="${FReD.utils.escapeHtml(link)}" target="_blank" rel="noopener" class="tooltip-btn tooltip-link" title="Open paper">${LINK_SVG}Open</a>`;
      }
      html += `<span class="visually-hidden tooltip-live" role="status" aria-live="polite"></span>`;
      html += `</div>`;

      tooltip.innerHTML = html;
      tooltip.style.display = 'block';

      const rect = target.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      let top = rect.top - tooltipRect.height - 8;
      let left = rect.left;

      if (top < 10) {
        top = rect.bottom + 8;
      }
      if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
      }
      if (left < 10) left = 10;

      tooltip.style.top = top + 'px';
      tooltip.style.left = left + 'px';

      const copyBtn = tooltip.querySelector('.tooltip-copy');
      const live = tooltip.querySelector('.tooltip-live');
      copyBtn?.addEventListener('click', () => {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') return;
        navigator.clipboard.writeText(text).then(() => {
          if (gen !== tooltipGeneration || !tooltip.contains(copyBtn)) return;
          copyBtn.textContent = 'Copied';
          setTimeout(() => {
            if (gen !== tooltipGeneration || !tooltip.contains(copyBtn)) return;
            copyBtn.innerHTML = `${COPY_SVG}Copy`;
          }, 1500);
          if (live && tooltip.contains(live)) {
            live.textContent = 'Reference copied to clipboard';
          }
        }).catch((err) => {
          console.error('Failed to copy reference:', err);
        });
      });
    };

    const hideTooltip = (immediate) => {
      if (hideTimeout) clearTimeout(hideTimeout);
      if (immediate) {
        tooltipGeneration += 1;
        tooltip.style.display = 'none';
        tooltip.innerHTML = '';
        currentTarget = null;
        pinnedByClick = false;
        return;
      }
      if (pinnedByClick) return;
      const gen = tooltipGeneration;
      hideTimeout = setTimeout(() => {
        if (gen !== tooltipGeneration || tooltip.contains(document.activeElement)) return;
        tooltipGeneration += 1;
        tooltip.style.display = 'none';
        tooltip.innerHTML = '';
        currentTarget = null;
        pinnedByClick = false;
      }, 150);
    };

    document.addEventListener('mouseover', (e) => {
      const target = e.target.closest('.ref-tooltip');
      if (target && target.dataset.tooltip) {
        if (currentTarget !== target || tooltip.style.display !== 'block') {
          openedByHoverAt = Date.now();
          showTooltip(target, false);
        }
      }
    });

    document.addEventListener('mouseout', (e) => {
      const target = e.target.closest('.ref-tooltip');
      if (target) {
        hideTooltip(false);
      }
    });

    // Touch & click activation + click-outside dismissal
    document.addEventListener('click', (e) => {
      const target = e.target.closest('.ref-tooltip');
      if (target && target.dataset.tooltip) {
        e.stopPropagation();
        if (currentTarget === target && tooltip.style.display === 'block') {
          // On touch (or desktop hover-then-click), promote hover-opened tooltip to pinned instead of immediately closing
          if (!pinnedByClick || (Date.now() - openedByHoverAt) < 350) {
            pinnedByClick = true;
          } else {
            hideTooltip(true);
          }
        } else {
          showTooltip(target, true);
        }
        return;
      }
      if (!tooltip.contains(e.target) && tooltip.style.display === 'block') {
        hideTooltip(true);
      }
    });

    // Dismiss floating fixed tooltip on page or inner-table scroll so it never drifts off its trigger
    window.addEventListener('scroll', () => {
      if (tooltip.style.display === 'block') hideTooltip(true);
    }, true);

    // Keyboard activation (Enter/Space), Tab exit back to trigger, and Escape dismissal
    document.addEventListener('keydown', (e) => {
      if (tooltip.style.display === 'block' && e.key === 'Escape') {
        const prev = currentTarget;
        hideTooltip(true);
        prev?.focus();
        return;
      }
      if (tooltip.style.display === 'block' && e.key === 'Tab' && tooltip.contains(document.activeElement)) {
        const focusables = [...tooltip.querySelectorAll('button:not([disabled]), a[href]')];
        if (focusables.length > 0) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if ((!e.shiftKey && document.activeElement === last) || (e.shiftKey && document.activeElement === first)) {
            e.preventDefault();
            const prev = currentTarget;
            hideTooltip(true);
            prev?.focus();
            return;
          }
        }
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.ref-tooltip')) {
        e.preventDefault();
        const target = e.target.closest('.ref-tooltip');
        showTooltip(target, true);
        tooltip.querySelector('.tooltip-copy')?.focus();
      }
    });

    tooltip.addEventListener('mouseenter', () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    });

    tooltip.addEventListener('mouseleave', () => {
      hideTooltip(false);
    });

    tooltip.addEventListener('focusout', () => {
      const gen = tooltipGeneration;
      setTimeout(() => {
        if (gen !== tooltipGeneration) return;
        if (!tooltip.contains(document.activeElement) && document.activeElement !== currentTarget) {
          hideTooltip(true);
        }
      }, 50);
    });
  },

  /**
   * Return studies currently matching the active DataTables search/order,
   * falling back to all filteredStudies when the table is not initialized.
   */
  _getActiveTableStudies(tableInstance) {
    if (!tableInstance) return this.filteredStudies;
    const rows = tableInstance.rows({ search: 'applied', order: 'applied' }).data().toArray();
    return rows
      .map(row => this.filteredStudies[row[row.length - 1]])
      .filter(Boolean);
  },

  /**
   * Neutralize spreadsheet formula injection in non-numeric text cells.
   */
  _neutralizeSpreadsheetFormula(str) {
    if (/^[=+\-@\t\r]/.test(str) && !/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(str.trim())) {
      return "'" + str;
    }
    return str;
  },

  /**
   * Format a single cell for CSV with RFC 4180 quoting and spreadsheet formula neutralization.
   */
  _formatCsvCell(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number') {
      return isFinite(val) ? String(val) : '';
    }
    const str = this._neutralizeSpreadsheetFormula(String(val));
    if (/[",\r\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  },

  /**
   * Get Effects table data as tab-separated text (respects visible column order & table search)
   */
  getTableText() {
    const criterion = FReD.state.get('criterion');
    const cols = this.visibleColumns.length > 0 ? this.visibleColumns : FReD.columnConfig.getVisibleColumns();
    const headers = cols.map(k => FReD.columnConfig.COLUMN_DEFINITIONS[k]?.label || k);
    const studies = this._getActiveTableStudies(this.dataTable);

    const rows = studies.map(study =>
      cols.map(k => {
        const raw = FReD.columnConfig.getPlainValue(study, k, criterion);
        if (typeof raw === 'number') return isFinite(raw) ? String(raw) : '';
        const clean = String(raw ?? '').replace(/[\t\r\n]+/g, ' ');
        return this._neutralizeSpreadsheetFormula(clean);
      }).join('\t')
    );
    return [headers.join('\t'), ...rows].join('\r\n');
  },

  /**
   * Get Effects table data as CSV (respects visible column order & table search)
   */
  getTableCSV() {
    const criterion = FReD.state.get('criterion');
    const cols = this.visibleColumns.length > 0 ? this.visibleColumns : FReD.columnConfig.getVisibleColumns();
    const headers = cols.map(k => FReD.columnConfig.COLUMN_DEFINITIONS[k]?.label || k);
    const studies = this._getActiveTableStudies(this.dataTable);

    const headerLine = headers.map(h => this._formatCsvCell(h)).join(',');
    const rows = studies.map(study =>
      cols.map(k => this._formatCsvCell(FReD.columnConfig.getPlainValue(study, k, criterion))).join(',')
    );
    return [headerLine, ...rows].join('\r\n');
  },

  /**
   * Get full dataset export as CSV (respects sidebar filters & Data tab search)
   */
  getFullDatasetCSV() {
    const criterion = FReD.state.get('criterion');
    const studies = this._getActiveTableStudies(this.fullDataTable);
    const columns = [
      { header: 'Original Reference', get: s => s.ref_o || '' },
      { header: 'Replication Reference', get: s => s.ref_r || '' },
      { header: 'Description', get: s => s.description || '' },
      { header: 'Tags', get: s => s.tags || '' },
      { header: 'Discipline', get: s => s.discipline ? FReD.charts.trends.capitalizeDiscipline(s.discipline) : '' },
      { header: 'Original Year', get: s => s.orig_year ?? '' },
      { header: 'Original Journal', get: s => s.orig_journal || '' },
      { header: 'Result', get: s => FReD.utils.capFirstLetter(FReD.successCriteria.getOutcome(s, criterion).outcomeReport || 'Not calculable') },
      { header: 'ES (Orig)', get: s => (s.es_o != null && s.es_o !== '' && Number.isFinite(Number(s.es_o))) ? Number(s.es_o) : '' },
      { header: 'ES (Rep)', get: s => (s.es_r != null && s.es_r !== '' && Number.isFinite(Number(s.es_r))) ? Number(s.es_r) : '' },
      { header: 'N (Orig)', get: s => s.n_o ?? '' },
      { header: 'N (Rep)', get: s => s.n_r ?? '' },
      { header: 'Power', get: s => (s.power_r != null && s.power_r !== '' && Number.isFinite(Number(s.power_r))) ? Number(s.power_r) : '' },
      { header: 'DOI (Orig)', get: s => s.doi_o || '' },
      { header: 'DOI (Rep)', get: s => s.doi_r || '' }
    ];

    const headerLine = columns.map(c => this._formatCsvCell(c.header)).join(',');
    const rows = studies.map(study =>
      columns.map(c => this._formatCsvCell(c.get(study))).join(',')
    );
    return [headerLine, ...rows].join('\r\n');
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  FReD.explorer.init();
});

window.FReD = FReD;
