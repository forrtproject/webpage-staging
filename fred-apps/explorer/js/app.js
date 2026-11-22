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

  /**
   * Load citation from FReD-data repo
   */
  async loadCitation() {
    const citationEl = document.getElementById('citation');
    if (!citationEl) return;

    try {
      const response = await fetch('https://raw.githubusercontent.com/forrtproject/FReD-data/refs/heads/main/output/citation.txt');
      if (response.ok) {
        const citation = await response.text();
        citationEl.textContent = citation.trim();
      } else {
        citationEl.textContent = 'Citation unavailable.';
      }
    } catch (error) {
      console.error('Failed to load citation:', error);
      citationEl.textContent = 'Citation unavailable.';
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
      search: state.search
    });

    // Update count displays
    FReD.filters.updateStudyCount(this.filteredStudies.length, this.allStudies.length);
    FReD.filters.updateReplicationCount(this.filteredStudies, this.allStudies);

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
      this.updateFullDataTable();
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

    // About modal link
    const aboutLink = document.getElementById('about-link');
    if (aboutLink) {
      aboutLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.openModal(document.getElementById('about-modal'), aboutLink);
      });
    }

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
      this.updateFullDataTable();
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

      // Add click handler for expand/collapse (supports button & cell click + aria-expanded)
      $('#studies-table tbody').on('click', 'td.dt-control', function() {
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
   * Handle column visibility toggle
   */
  handleColumnToggle(columnKey, isVisible) {
    if (isVisible && !this.visibleColumns.includes(columnKey)) {
      this.visibleColumns.push(columnKey);
    } else if (!isVisible) {
      this.visibleColumns = this.visibleColumns.filter(k => k !== columnKey);
    }

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
   * Format coded p-value for display
   * Rules:
   * - p < X: show only up to last non-zero digit (e.g., .05 not .0500)
   * - p = X: show minimum 3 decimals, drop trailing zeros after 3 (e.g., .050 not .05000, but keep .05001)
   * - p > X: same as p <
   */
  formatCodedPValue(value, type) {
    if (value == null || value === '') return 'N/A';

    // Convert to number in case it's a string from JSON
    const numValue = Number(value);
    if (isNaN(numValue)) return 'N/A';

    const symbol = (type === 'l' || type === '<') ? '<' :
                   (type === 'g' || type === '>') ? '>' : '=';

    let formatted;
    if (symbol === '=') {
      // For p = X: minimum 3 decimals, drop trailing zeros after position 3
      // Format to enough precision first
      const fullStr = numValue.toFixed(6);
      // Find the decimal point position
      const decimalPos = fullStr.indexOf('.');
      if (decimalPos === -1) {
        formatted = numValue.toFixed(3);
      } else {
        // Check if there are significant digits beyond position 3
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
      // For p < or p >: show only up to last non-zero digit
      const fullStr = numValue.toFixed(6);
      // Remove trailing zeros
      formatted = parseFloat(fullStr).toString();
      // Ensure at least some decimal representation for small values
      if (!formatted.includes('.') && numValue < 1) {
        formatted = numValue.toFixed(2);
      }
    }

    return `p ${symbol} ${formatted}`;
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
              <tr><td style="padding-right: 1rem;"><strong>Original p-value:</strong></td><td>${this.formatCodedPValue(study.pval_value_o, study.pval_type_o)}</td></tr>
              <tr><td><strong>Replication p-value:</strong></td><td>${this.formatCodedPValue(study.pval_value_r, study.pval_type_r)}</td></tr>
              <tr><td><strong>Power:</strong></td><td>${FReD.utils.formatNumber(study.power_r, 2) || 'N/A'}</td></tr>
              <tr><td><strong>Outcome (${criterion}):</strong></td><td>${FReD.utils.capFirstLetter(outcomeReport || 'Not calculable')}</td></tr>
            </table>
          </div>
          <div>
            <h5 style="margin: 0 0 0.5rem 0; color: var(--primary);">Confidence Intervals</h5>
            <table style="font-size: 0.875rem;">
              <tr><td style="padding-right: 1rem;"><strong>Original CI:</strong></td><td>[${FReD.utils.formatNumber(study.ci_lower_o, 3) || '?'}, ${FReD.utils.formatNumber(study.ci_upper_o, 3) || '?'}]</td></tr>
              <tr><td><strong>Replication CI:</strong></td><td>[${FReD.utils.formatNumber(study.ci_lower_r, 3) || '?'}, ${FReD.utils.formatNumber(study.ci_upper_r, 3) || '?'}]</td></tr>
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
  updateFullDataTable() {
    const tableData = this.filteredStudies.map(study => [
      FReD.utils.escapeHtml(study.description || ''),
      FReD.utils.formatNumber(study.es_o, 3),
      FReD.utils.formatNumber(study.es_r, 3),
      study.n_o || '',
      study.n_r || '',
      FReD.utils.formatNumber(study.power_r, 2),
      study.result || '',
      FReD.utils.escapeHtml(study.source || '')
    ]);

    if (this.fullDataTable) {
      this.fullDataTable.clear();
      this.fullDataTable.rows.add(tableData);
      this.fullDataTable.draw();
    } else {
      this.fullDataTable = $('#full-data-table').DataTable({
        data: tableData,
        columns: [
          { title: 'Description' },
          { title: 'ES (Orig)' },
          { title: 'ES (Rep)' },
          { title: 'N (Orig)' },
          { title: 'N (Rep)' },
          { title: 'Power' },
          { title: 'Result' },
          { title: 'Source' }
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
    // Copy button
    document.getElementById('btn-copy')?.addEventListener('click', () => {
      const text = this.getTableText();
      FReD.utils.copyToClipboard(text);
    });

    // CSV button
    document.getElementById('btn-csv')?.addEventListener('click', () => {
      const csv = this.getTableCSV();
      FReD.utils.downloadFile(csv, `fred-explorer-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    });

    // Excel button
    document.getElementById('btn-excel')?.addEventListener('click', () => {
      this.downloadExcel();
    });

    // Download button (full data)
    document.getElementById('btn-download')?.addEventListener('click', () => {
      this.downloadExcel();
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

    const showTooltip = (target, pinned = false) => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }

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
      html += `<span class="sr-only tooltip-live" role="status" aria-live="polite"></span>`;
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

      tooltip.querySelector('.tooltip-copy')?.addEventListener('click', () => {
        navigator.clipboard.writeText(text).then(() => {
          const btn = tooltip.querySelector('.tooltip-copy');
          const live = tooltip.querySelector('.tooltip-live');
          if (btn) {
            btn.textContent = 'Copied';
            setTimeout(() => { btn.innerHTML = `${COPY_SVG}Copy`; }, 1500);
          }
          if (live) {
            live.textContent = 'Reference copied to clipboard';
          }
        });
      });
    };

    const hideTooltip = (immediate) => {
      if (hideTimeout) clearTimeout(hideTimeout);
      if (immediate) {
        tooltip.style.display = 'none';
        currentTarget = null;
        pinnedByClick = false;
        return;
      }
      if (pinnedByClick) return;
      hideTimeout = setTimeout(() => {
        if (tooltip.contains(document.activeElement)) return;
        tooltip.style.display = 'none';
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
      setTimeout(() => {
        if (!tooltip.contains(document.activeElement) && document.activeElement !== currentTarget) {
          hideTooltip(true);
        }
      }, 50);
    });
  },

  /**
   * Get table data as text
   */
  getTableText() {
    const criterion = FReD.state.get('criterion');
    const headers = ['Description', 'Tags', 'Result', 'Original Reference', 'Replication Reference'];
    const rows = this.filteredStudies.map(study => {
      const { outcomeReport } = FReD.successCriteria.getOutcome(study, criterion);
      return [
        study.description || '',
        study.tags || '',
        outcomeReport || 'Not calculable',
        study.ref_o || '',
        study.ref_r || ''
      ].join('\t');
    });
    return [headers.join('\t'), ...rows].join('\n');
  },

  /**
   * Get table data as CSV
   */
  getTableCSV() {
    const criterion = FReD.state.get('criterion');
    const data = this.filteredStudies.map(study => {
      const { outcomeReport } = FReD.successCriteria.getOutcome(study, criterion);
      return {
        description: study.description || '',
        tags: study.tags || '',
        result: outcomeReport || 'Not calculable',
        ref_o: study.ref_o || '',
        ref_r: study.ref_r || '',
        es_o: study.es_o,
        es_r: study.es_r,
        n_o: study.n_o,
        n_r: study.n_r,
        power: study.power_r,
        source: study.source || ''
      };
    });

    const headers = Object.keys(data[0] || {});
    const rows = data.map(row =>
      headers.map(h => {
        let val = row[h];
        if (val === null || val === undefined) val = '';
        val = String(val);
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      }).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  },

  /**
   * Download data as Excel (using CSV for now, could use SheetJS for proper xlsx)
   */
  downloadExcel() {
    const csv = this.getTableCSV();
    FReD.utils.downloadFile(csv, `fred-explorer-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    FReD.utils.showNotification('Downloaded as CSV. For Excel format, open the CSV file in Excel.', 'info');
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  FReD.explorer.init();
});

window.FReD = FReD;
