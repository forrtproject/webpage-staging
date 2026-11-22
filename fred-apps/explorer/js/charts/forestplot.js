/**
 * FReD Explorer - Forest Plot
 *
 * Forest plot showing original and replication effect sizes with 95% confidence
 * intervals, rendered with Apache ECharts (SVG) custom series. Preserves
 * pagination, sorting, effect numbering, and PNG/SVG export.
 */

window.FReD = window.FReD || {};
FReD.charts = FReD.charts || {};

FReD.charts.forestplot = {
  container: null,
  actionsEl: null,
  autoRenderLimit: 50,
  pageSize: 50,
  pageSizeOptions: [25, 50, 100, 200],
  currentPage: 1,
  sortBy: 'alphabetical',
  allValidStudies: [],
  lastStudies: null,
  activePlotEl: null,

  /**
   * Initialize the forest plot
   */
  init(containerId) {
    this.container = document.getElementById(containerId);
    this.actionsEl = document.getElementById(containerId + '-actions');
    if (!this.container) {
      console.error('Forest plot container not found:', containerId);
    }
  },

  /**
   * Render the forest plot with given data
   */
  render(studies) {
    if (!this.container) return;

    this.lastStudies = studies;

    // Filter studies with valid effect sizes and references
    this.allValidStudies = studies.filter(s =>
      s.es_r != null && !isNaN(s.es_r) &&
      s.ref_o
    );

    if (this.allValidStudies.length === 0) {
      this._unmountActive();
      this.container.innerHTML = '<div class="alert alert-info">No effects with effect size data to display.</div>';
      return;
    }

    // Assign effect numbers BEFORE sorting (based on original data order)
    this.assignEffectNumbers();

    // Apply sorting
    this.applySorting();

    const totalEffects = this.allValidStudies.length;

    if (totalEffects <= this.autoRenderLimit) {
      this.renderPlot(this.allValidStudies, totalEffects);
      return;
    }

    this.currentPage = 1;
    this.renderWithPagination();
  },

  _unmountActive() {
    if (this.activePlotEl) {
      FReD.charts.unmount(this.activePlotEl, this.actionsEl);
      this.activePlotEl = null;
    }
  },

  /**
   * Assign effect numbers to each study (e.g., [1/3], [2/3], [3/3] for studies with same ref_o)
   */
  assignEffectNumbers() {
    const refCounts = new Map();
    for (const study of this.allValidStudies) {
      const ref = study.ref_o || 'Unknown';
      refCounts.set(ref, (refCounts.get(ref) || 0) + 1);
    }

    const refCurrentIndex = new Map();
    for (const study of this.allValidStudies) {
      const ref = study.ref_o || 'Unknown';
      const total = refCounts.get(ref);
      const current = (refCurrentIndex.get(ref) || 0) + 1;
      refCurrentIndex.set(ref, current);

      study._effectNum = current;
      study._effectTotal = total;
    }
  },

  /**
   * Apply current sorting to studies before pagination
   */
  applySorting() {
    switch (this.sortBy) {
      case 'original':
        this.allValidStudies.sort((a, b) => (b.es_o || 0) - (a.es_o || 0));
        break;
      case 'replication':
        this.allValidStudies.sort((a, b) => (b.es_r || 0) - (a.es_r || 0));
        break;
      case 'alphabetical':
      default:
        this.allValidStudies.sort((a, b) => {
          const refCompare = (a.ref_o || '').localeCompare(b.ref_o || '');
          if (refCompare !== 0) return refCompare;
          return (a._effectNum || 0) - (b._effectNum || 0);
        });
        break;
    }
  },

  /**
   * Render with pagination controls
   */
  renderWithPagination() {
    this._unmountActive();

    const totalEffects = this.allValidStudies.length;
    const totalPages = Math.ceil(totalEffects / this.pageSize);
    const startIdx = (this.currentPage - 1) * this.pageSize;
    const endIdx = Math.min(startIdx + this.pageSize, totalEffects);
    const pageStudies = this.allValidStudies.slice(startIdx, endIdx);

    const pageSizeOptionsHtml = this.pageSizeOptions
      .map(size => `<option value="${size}" ${size === this.pageSize ? 'selected' : ''}>${size}</option>`)
      .join('');

    const controlsHtml = `
      <div class="forest-controls">
        <div class="forest-controls-left">
          <span class="text-muted">
            Showing ${startIdx + 1}-${endIdx} of ${totalEffects} effects
          </span>
          <div class="forest-control-group">
            <label for="forest-page-size" class="forest-control-label">Per page:</label>
            <select id="forest-page-size" class="form-select form-select-sm">
              ${pageSizeOptionsHtml}
            </select>
          </div>
          <div class="forest-control-group">
            <label for="forest-sort" class="forest-control-label">Sort:</label>
            <select id="forest-sort" class="form-select form-select-sm">
              <option value="alphabetical" ${this.sortBy === 'alphabetical' ? 'selected' : ''}>Alphabetically</option>
              <option value="original" ${this.sortBy === 'original' ? 'selected' : ''}>By original effect</option>
              <option value="replication" ${this.sortBy === 'replication' ? 'selected' : ''}>By replication effect</option>
            </select>
          </div>
        </div>
        <div class="forest-controls-right">
          <div class="btn-group">
            <button class="btn btn-sm btn-secondary" id="forest-prev" ${this.currentPage === 1 ? 'disabled' : ''}>
              &laquo; Prev
            </button>
            <span class="forest-page-indicator">
              ${this.currentPage}/${totalPages}
            </span>
            <button class="btn btn-sm btn-secondary" id="forest-next" ${this.currentPage === totalPages ? 'disabled' : ''}>
              Next &raquo;
            </button>
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-secondary" id="forest-download-png" title="Download as PNG">
              PNG
            </button>
            <button class="btn btn-sm btn-outline-secondary" id="forest-download-svg" title="Download as SVG">
              SVG
            </button>
          </div>
        </div>
      </div>
      <div class="forest-plot-scroll">
        <div id="forest-plot-area"></div>
      </div>
    `;

    this.container.innerHTML = controlsHtml;

    document.getElementById('forest-prev')?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderWithPagination();
      }
    });

    document.getElementById('forest-next')?.addEventListener('click', () => {
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.renderWithPagination();
      }
    });

    document.getElementById('forest-page-size')?.addEventListener('change', (e) => {
      this.pageSize = parseInt(e.target.value, 10);
      this.currentPage = 1;
      this.renderWithPagination();
    });

    document.getElementById('forest-sort')?.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.applySorting();
      this.currentPage = 1;
      this.renderWithPagination();
    });

    document.getElementById('forest-download-png')?.addEventListener('click', () => {
      this.downloadPlot('png');
    });

    document.getElementById('forest-download-svg')?.addEventListener('click', () => {
      this.downloadPlot('svg');
    });

    const plotContainer = document.getElementById('forest-plot-area');
    this.renderPlotToElement(pageStudies, totalEffects, plotContainer, `Showing ${startIdx + 1}-${endIdx} of ${totalEffects}`);
  },

  /**
   * Download the plot as PNG or SVG
   */
  downloadPlot(format) {
    const plotArea = document.getElementById('forest-plot-area') || this.activePlotEl;
    if (!plotArea) return;
    const filename = `forest-plot-${new Date().toISOString().slice(0, 10)}`;
    if (format === 'svg') {
      FReD.charts.exportSvg(plotArea, filename);
    } else {
      FReD.charts.exportPng(plotArea, filename, 2);
    }
  },

  /**
   * Render plot to container element (for <= autoRenderLimit effects)
   */
  renderPlot(validStudies, totalCount) {
    this._unmountActive();

    const controlsHtml = `
      <div class="forest-controls">
        <div class="forest-controls-left">
          <span class="text-muted">
            ${validStudies.length} effect sizes
          </span>
          <div class="forest-control-group">
            <label for="forest-sort-simple" class="forest-control-label">Sort:</label>
            <select id="forest-sort-simple" class="form-select form-select-sm">
              <option value="alphabetical" ${this.sortBy === 'alphabetical' ? 'selected' : ''}>Alphabetically</option>
              <option value="original" ${this.sortBy === 'original' ? 'selected' : ''}>By original effect</option>
              <option value="replication" ${this.sortBy === 'replication' ? 'selected' : ''}>By replication effect</option>
            </select>
          </div>
        </div>
        <div class="forest-controls-right">
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-secondary" id="forest-download-png-simple" title="Download as PNG">
              PNG
            </button>
            <button class="btn btn-sm btn-outline-secondary" id="forest-download-svg-simple" title="Download as SVG">
              SVG
            </button>
          </div>
        </div>
      </div>
      <div class="forest-plot-scroll">
        <div id="forest-plot-area-simple"></div>
      </div>
    `;

    this.container.innerHTML = controlsHtml;

    document.getElementById('forest-sort-simple')?.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.applySorting();
      this.renderPlot(this.allValidStudies, totalCount);
    });

    document.getElementById('forest-download-png-simple')?.addEventListener('click', () => {
      this.downloadPlotSimple('png');
    });

    document.getElementById('forest-download-svg-simple')?.addEventListener('click', () => {
      this.downloadPlotSimple('svg');
    });

    const plotContainer = document.getElementById('forest-plot-area-simple');
    this.renderPlotToElement(validStudies, totalCount, plotContainer, `${validStudies.length} effects`);
  },

  /**
   * Download the plot as PNG or SVG (simple mode)
   */
  downloadPlotSimple(format) {
    const plotArea = document.getElementById('forest-plot-area-simple') || this.activePlotEl;
    if (!plotArea) return;
    const filename = `forest-plot-${new Date().toISOString().slice(0, 10)}`;
    if (format === 'svg') {
      FReD.charts.exportSvg(plotArea, filename);
    } else {
      FReD.charts.exportPng(plotArea, filename, 2);
    }
  },

  /**
   * Extract "Author (Year)" from a reference string
   */
  extractAuthorYear(ref) {
    if (!ref) return 'Unknown';

    const yearMatch = ref.match(/\((\d{4})\)/);
    if (!yearMatch) {
      return this.truncateRef(ref, 35);
    }
    const year = yearMatch[1];
    const beforeYear = ref.substring(0, ref.indexOf(`(${year})`)).trim();

    if (/et\s+al\.?/i.test(beforeYear)) {
      const etAlMatch = beforeYear.match(/^([A-Za-z\-']+)(?:,?\s+[A-Z]\.?,?)?\s+et\s+al\.?/i);
      if (etAlMatch) {
        return `${etAlMatch[1]} et al. (${year})`;
      }
    }

    const authorParts = beforeYear.split(/,\s*&\s*|,\s+(?=[A-Z][a-z])|;\s*|\s+&\s+/);
    const surnames = [];
    for (const part of authorParts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const surnameMatch = trimmed.match(/^([A-Za-z\-']+)/);
      if (surnameMatch && surnameMatch[1].length > 1) {
        surnames.push(surnameMatch[1]);
      }
    }

    if (surnames.length === 0) return this.truncateRef(ref, 35);
    if (surnames.length === 1) return `${surnames[0]} (${year})`;
    if (surnames.length === 2) return `${surnames[0]} & ${surnames[1]} (${year})`;
    return `${surnames[0]} et al. (${year})`;
  },

  /**
   * Format reference for hover display with line breaks (escaped)
   */
  formatRefForHover(ref) {
    if (!ref) return 'Unknown';
    const maxLineLength = 50;
    const words = String(ref).split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxLineLength) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines.map(FReD.charts.escapeHtml).join('<br>');
  },

  /**
   * Build labels for each displayed effect row
   */
  createStaggeredLabels(validStudies) {
    const ticktext = [];
    for (let i = 0; i < validStudies.length; i++) {
      const study = validStudies[i];
      const ref = study.ref_o || 'Unknown';
      const effectNum = study._effectNum || 1;
      const effectTotal = study._effectTotal || 1;
      const baseLabel = this.extractAuthorYear(ref);
      ticktext.push(effectTotal > 1 ? `${baseLabel} [${effectNum}/${effectTotal}]` : baseLabel);
    }
    return { ticktext };
  },

  /**
   * Render ECharts SVG forest plot into `element`
   */
  renderPlotToElement(validStudies, totalCount, element, rangeNote) {
    if (!element) return;
    this.activePlotEl = element;

    const { ticktext } = this.createStaggeredLabels(validStudies);

    // Compute x-axis range across all point estimates and CIs
    const allEffects = [];
    validStudies.forEach(s => {
      [s.es_o, s.es_r, s.ci_lower_o, s.ci_upper_o, s.ci_lower_r, s.ci_upper_r].forEach(v => {
        if (v != null && !isNaN(v)) allEffects.push(Number(v));
      });
    });

    const xMin = Math.floor(Math.min(...allEffects, -0.1) * 10) / 10 - 0.1;
    const xMax = Math.ceil(Math.max(...allEffects, 0.1) * 10) / 10 + 0.1;

    // Build data rows: [x, rowIndex, ciLower, ciUpper]
    const origData = [];
    const repData = [];
    const tableRows = [];

    validStudies.forEach((s, i) => {
      if (s.es_o != null && !isNaN(s.es_o)) {
        origData.push({
          value: [
            Number(s.es_o),
            i,
            s.ci_lower_o != null && !isNaN(s.ci_lower_o) ? Number(s.ci_lower_o) : Number(s.es_o),
            s.ci_upper_o != null && !isNaN(s.ci_upper_o) ? Number(s.ci_upper_o) : Number(s.es_o)
          ],
          ref: s.ref_o || 'Unknown',
          hasCi: s.ci_lower_o != null && s.ci_upper_o != null
        });
      }
      if (s.es_r != null && !isNaN(s.es_r)) {
        repData.push({
          value: [
            Number(s.es_r),
            i,
            s.ci_lower_r != null && !isNaN(s.ci_lower_r) ? Number(s.ci_lower_r) : Number(s.es_r),
            s.ci_upper_r != null && !isNaN(s.ci_upper_r) ? Number(s.ci_upper_r) : Number(s.es_r)
          ],
          ref: s.ref_r || 'Unknown',
          hasCi: s.ci_lower_r != null && s.ci_upper_r != null
        });
      }

      tableRows.push([
        ticktext[i],
        s.es_o != null && !isNaN(s.es_o) ? Number(s.es_o) : '',
        s.ci_lower_o != null && !isNaN(s.ci_lower_o) ? Number(s.ci_lower_o) : '',
        s.ci_upper_o != null && !isNaN(s.ci_upper_o) ? Number(s.ci_upper_o) : '',
        s.es_r != null && !isNaN(s.es_r) ? Number(s.es_r) : '',
        s.ci_lower_r != null && !isNaN(s.ci_lower_r) ? Number(s.ci_lower_r) : '',
        s.ci_upper_r != null && !isNaN(s.ci_upper_r) ? Number(s.ci_upper_r) : ''
      ]);
    });

    const table = {
      headers: ['Study', 'Original r', 'Orig CI lower', 'Orig CI upper', 'Replication r', 'Rep CI lower', 'Rep CI upper'],
      rows: tableRows,
      summary: `Forest plot effect sizes and 95% confidence intervals (${rangeNote}, sorted ${this.sortBy}).`
    };

    const self = this;

    const optionFn = ({ width }) => {
      const t = FReD.charts.chartTheme();
      const colorOrig = FReD.charts.token('--color-chart-original');
      const colorRep = FReD.charts.token('--color-chart-replication');
      const labelW = width < 560 ? 120 : 185;

      function renderWhiskerPoint(color, dodgePx, shapeKind) {
        return function (params, api) {
          const xVal = api.value(0);
          const yIdx = api.value(1);
          const loVal = api.value(2);
          const hiVal = api.value(3);
          const center = api.coord([xVal, yIdx]);
          const left = api.coord([loVal, yIdx]);
          const right = api.coord([hiVal, yIdx]);
          const cy = center[1] + dodgePx;

          const children = [];
          if (right[0] - left[0] > 0.5) {
            children.push({
              type: 'line',
              shape: { x1: left[0], y1: cy, x2: right[0], y2: cy },
              style: { stroke: color, lineWidth: 1.75 }
            });
            children.push({
              type: 'line',
              shape: { x1: left[0], y1: cy - 3, x2: left[0], y2: cy + 3 },
              style: { stroke: color, lineWidth: 1.5 }
            });
            children.push({
              type: 'line',
              shape: { x1: right[0], y1: cy - 3, x2: right[0], y2: cy + 3 },
              style: { stroke: color, lineWidth: 1.5 }
            });
          }

          if (shapeKind === 'diamond') {
            const r = 4.6;
            children.push({
              type: 'polygon',
              shape: {
                points: [
                  [center[0], cy - r],
                  [center[0] + r, cy],
                  [center[0], cy + r],
                  [center[0] - r, cy]
                ]
              },
              style: { fill: color, stroke: t.paper, lineWidth: 1 }
            });
          } else {
            children.push({
              type: 'circle',
              shape: { cx: center[0], cy: cy, r: 4.3 },
              style: { fill: color, stroke: t.paper, lineWidth: 1 }
            });
          }

          return { type: 'group', children: children };
        };
      }

      const series = [
        {
          name: 'Original',
          type: 'custom',
          itemStyle: { color: colorOrig },
          renderItem: renderWhiskerPoint(colorOrig, -3.5, 'circle'),
          encode: { x: 0, y: 1 },
          data: origData,
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            animation: false,
            label: { show: false },
            lineStyle: { color: t.rule, width: 1.5, type: 'dotted' },
            data: [{ xAxis: 0 }]
          }
        },
        {
          name: 'Replication',
          type: 'custom',
          itemStyle: { color: colorRep },
          renderItem: renderWhiskerPoint(colorRep, 3.5, 'diamond'),
          encode: { x: 0, y: 1 },
          data: repData
        }
      ];

      const tooltip = {
        trigger: 'item',
        formatter: p => {
          const d = p.data || {};
          const v = d.value || [];
          const est = FReD.utils.formatNumber(v[0], 3);
          const ci = d.hasCi ? ` (95% CI [${FReD.utils.formatNumber(v[2], 3)}, ${FReD.utils.formatNumber(v[3], 3)}])` : '';
          const swatchColor = p.seriesName === 'Original' ? colorOrig : colorRep;
          return FReD.charts.tipLines([
            `<strong>${self.formatRefForHover(d.ref)}</strong>`,
            FReD.charts.tipRow(swatchColor, `${p.seriesName} r = ${est}${ci}`)
          ]);
        }
      };

      return FReD.charts.finishOption({
        series: series,
        tooltip: tooltip,
        legend: {
          data: [
            { name: 'Original', icon: 'circle', itemStyle: { color: colorOrig } },
            { name: 'Replication', icon: 'diamond', itemStyle: { color: colorRep } }
          ]
        },
        xAxis: FReD.charts.valueAxis({
          name: 'Effect Size (r)',
          nameGap: 32,
          min: xMin,
          max: xMax
        }),
        yAxis: FReD.charts.categoryAxis({
          data: ticktext,
          inverse: true,
          axisLabel: {
            interval: 0,
            width: labelW,
            overflow: 'truncate',
            fontSize: 11
          }
        }),
        grid: { left: 10, right: 20, top: 10, bottom: 28, containLabel: true }
      }, { width });
    };

    const rowHeight = 28;
    const plotHeight = Math.max(380, validStudies.length * rowHeight + 96);

    FReD.charts.mount(element, {
      title: `Forest plot (${rangeNote})`,
      option: optionFn,
      height: plotHeight,
      table: table,
      actionsEl: this.actionsEl
    });
  },

  /**
   * Truncate reference string
   */
  truncateRef(ref, maxLen) {
    if (!ref) return 'Unknown';
    if (ref.length <= maxLen) return ref;
    return ref.substring(0, maxLen - 3) + '...';
  },

  /**
   * Clear the plot
   */
  clear() {
    this._unmountActive();
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
};

window.FReD = FReD;
