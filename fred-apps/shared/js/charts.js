/**
 * FReD Shared ECharts Helpers
 *
 * Plain-script port of flora-explorer's ECharts setup (react-frontend:
 * src/lib/charts.js, src/lib/theme.js, src/components/charts.jsx).
 * Renders all charts with ECharts SVG renderer, shared Atlas styling,
 * accessible data tables, CSV copy, theme-change redraw, legend-state
 * persistence, and crisp canvas-backed PNG / padded SVG export.
 */

window.FReD = window.FReD || {};
FReD.charts = FReD.charts || {};

(function () {
  const LABEL_LINES = 3;
  const LABEL_LINE_HEIGHT = 14;
  const mounts = new WeakMap();

  function token(name, fallback) {
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return val || (fallback || '');
  }

  function textScale() {
    return parseFloat(token('--text-scale', '1')) || 1;
  }

  function chartTheme() {
    return {
      paper: token('--white'),
      plot: token('--white'),
      grid: token('--border-light'),
      border: token('--border'),
      font: token('--text'),
      tick: token('--text-secondary'),
      muted: token('--text-muted'),
      faint: token('--text-faint'),
      primary: token('--primary'),
      band: token('--color-plot-band'),
      point: token('--color-plot-point'),
      rule: token('--color-plot-rule'),
      ruleLabel: token('--color-plot-rule-label'),
      hoverShadow: token('--color-plot-hover-shadow'),
      tooltipBg: token('--tooltip-bg'),
      tooltipFg: token('--tooltip-fg'),
      labelOnLight: token('--label-on-light'),
      labelOnDark: token('--label-on-dark'),
      notCodedStroke: token('--color-chart-not-coded-stroke'),
      fontFamily: token('--font-body', 'sans-serif').replace(/"/g, "'")
    };
  }

  function plain(s) {
    return (Array.isArray(s) ? s.join(' ') : String(s ?? ''))
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatNumber(n, maxFrac) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    return n.toLocaleString('en-GB', {
      maximumFractionDigits: maxFrac == null ? 5 : maxFrac
    }).replace(/-/g, '\u2212');
  }

  function formatPercent(n, total, digits) {
    if (!total) return '0.0';
    const p = (100 * n) / total;
    return p.toFixed(digits == null ? 1 : digits);
  }

  function cellText(v, header) {
    if (typeof v === 'number' && isFinite(v)) {
      const h = header || '';
      if (v !== 0 && Math.abs(v) < 1e-4) {
        return v.toExponential(2).replace(/-/g, '\u2212');
      }
      if (/percentage|%/i.test(h)) {
        return v.toLocaleString('en-GB', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1
        }).replace(/-/g, '\u2212');
      }
      const noGroup = /year|decade|x \/ category/i.test(h);
      return v.toLocaleString('en-GB', {
        useGrouping: !noGroup,
        maximumFractionDigits: 5
      }).replace(/-/g, '\u2212');
    }
    return plain(v);
  }

  function csvText(headers, rows, notes) {
    const cell = function (v) {
      let s;
      if (typeof v === 'number' && isFinite(v)) {
        // Preserve full precision for very small nonzero values (e.g. p-values)
        s = (v !== 0 && Math.abs(v) < 1e-4) ? String(v) : String(Number(v.toFixed(5)));
      } else {
        s = (Array.isArray(v) ? plain(v) : String(v ?? '')).replace(/^[=+@-]/, function (m) {
          return "'" + m;
        });
      }
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const outHeaders = notes ? ['Export context'].concat(headers) : headers;
    const outRows = rows.map(function (row) {
      return notes ? [notes].concat(row) : row;
    });
    return [outHeaders].concat(outRows).map(function (row) {
      return row.map(cell).join(',');
    }).join('\r\n');
  }

  function tipRow(color, text) {
    return '<span class="chart-tip-swatch" style="background:' + escapeHtml(color) + '"></span>' + escapeHtml(text);
  }

  function tipLines(lines) {
    return lines.filter(Boolean).join('<br>');
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function merge(base, over) {
    const out = Object.assign({}, base);
    const entries = Object.entries(over || {});
    for (let i = 0; i < entries.length; i++) {
      const key = entries[i][0];
      const value = entries[i][1];
      const b = base ? base[key] : undefined;
      if (
        value && typeof value === 'object' && !Array.isArray(value) && typeof value !== 'function' &&
        b && typeof b === 'object' && !Array.isArray(b)
      ) {
        out[key] = merge(b, value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  function valueAxis(extra) {
    const t = chartTheme();
    return merge({
      type: 'value',
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: t.grid } },
      axisLabel: { color: t.tick, fontSize: 11, fontFamily: t.fontFamily },
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: { color: t.tick, fontSize: 12, fontFamily: t.fontFamily }
    }, extra);
  }

  function categoryAxis(extra) {
    const t = chartTheme();
    return merge({
      type: 'category',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: t.tick, fontSize: 11, fontFamily: t.fontFamily },
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: { color: t.tick, fontSize: 12, fontFamily: t.fontFamily }
    }, extra);
  }

  function countAxis() {
    return {
      minInterval: 1,
      axisLabel: {
        formatter: function (v) { return formatNumber(v, 0); }
      }
    };
  }

  function valueOf(v) {
    return Number(v && typeof v === 'object' && !Array.isArray(v) ? v.value : v) || 0;
  }

  function hasData(s) {
    if (s.type !== 'bar') return true;
    return (s.data || []).some(function (v) { return valueOf(v) > 0; });
  }

  function categoryLabelWidth(width) {
    return (width < 560 ? 110 : 150) * textScale();
  }

  function wrappedLines(text, chars) {
    const words = String(text).split(/\s+/);
    const lines = [];
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const last = lines[lines.length - 1];
      if (last && (last + ' ' + word).length <= chars) {
        lines[lines.length - 1] = last + ' ' + word;
      } else {
        lines.push(word);
      }
    }
    return Math.max(1, lines.length);
  }

  // Conservative measurement of wrapped legend rows so long labels never collide with the plot.
  function legendRows(names, width, scale) {
    if (!names || !names.length) return 0;
    const sc = scale || 1;
    let rows = 1;
    let used = 0;
    const avail = Math.max(160, (width || 600) - 8);
    for (let i = 0; i < names.length; i++) {
      const item = names[i];
      const label = typeof item === 'string' ? item : item.name;
      const w = (String(label).length * 7.6 + 34) * sc;
      if (used && used + w > avail) {
        rows += 1;
        used = 0;
      }
      used += w;
    }
    return rows;
  }

  function horizontalBarHeight(categories, legendNames, width) {
    const scale = textScale();
    const chars = Math.max(8, Math.floor(categoryLabelWidth(width) / (5.8 * scale)));
    let maxLines = 1;
    for (let i = 0; i < categories.length; i++) {
      maxLines = Math.max(maxLines, wrappedLines(categories[i], chars));
    }
    const lines = Math.min(LABEL_LINES, maxLines);
    const band = Math.max(28, lines * LABEL_LINE_HEIGHT * scale + 14);
    const lRows = legendRows(legendNames, width, scale);
    return Math.round(categories.length * band + lRows * 24 * scale + 14 + 52 * scale);
  }

  function scaleText(node, scale) {
    if (scale === 1 || !node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(function (n) { return scaleText(n, scale); });
    const out = {};
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const val = node[key];
      if (key === 'fontSize' && typeof val === 'number') {
        out[key] = Math.round(val * scale);
      } else if (typeof val === 'function') {
        out[key] = val;
      } else {
        out[key] = scaleText(val, scale);
      }
    }
    return out;
  }

  /**
   * Shared look for every chart (flora-explorer finishOption).
   */
  function finishOption(option, opts) {
    const cfg = opts || {};
    const width = cfg.width || 600;
    const topExtra = (cfg.top || 0) * textScale();
    const t = chartTheme();
    const scale = textScale();
    const series = option.series || [];
    const legendData = (option.legend && option.legend.data)
      ? option.legend.data
      : series
          .filter(function (s) { return s.name && !String(s.name).startsWith('_') && hasData(s); })
          .map(function (s) { return s.name; });
    const showLegend = (!option.legend || option.legend.show !== false) && legendData.length > 0;
    const legendHeight = showLegend ? legendRows(legendData, width, scale) * 24 * scale + 10 : 0;
    const hasCustomIcons = Array.isArray(legendData) && legendData.some(function (item) {
      return item && typeof item === 'object' && item.icon;
    });

    const bars = series.length > 0 && series.every(function (s) { return s.type === 'bar'; });
    const base = {
      animation: !reducedMotion(),
      animationDuration: 500,
      backgroundColor: t.paper,
      aria: { enabled: false },
      textStyle: { fontFamily: t.fontFamily, fontSize: 12, color: t.font },
      tooltip: {
        trigger: bars ? 'axis' : 'item',
        axisPointer: bars ? { type: 'shadow', shadowStyle: { color: t.hoverShadow } } : undefined,
        confine: true,
        className: 'chart-tooltip',
        backgroundColor: t.tooltipBg,
        borderWidth: 0,
        extraCssText: 'max-width:min(340px,calc(100vw - 24px));white-space:normal;overflow-wrap:anywhere;',
        textStyle: { color: t.tooltipFg, fontFamily: t.fontFamily, fontSize: 12 }
      },
      legend: {
        show: showLegend,
        data: legendData,
        top: 0,
        left: 0,
        icon: hasCustomIcons ? undefined : 'circle',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
        inactiveColor: t.faint,
        inactiveBorderColor: t.border,
        textStyle: { color: t.tick, fontSize: 12, fontFamily: t.fontFamily }
      },
      grid: {
        left: 12,
        right: 16,
        bottom: 12,
        top: legendHeight + topExtra + 10,
        containLabel: true
      }
    };

    const own = Object.assign({}, option, {
      legend: Object.assign({}, option.legend, { data: legendData, show: showLegend })
    });
    if (option.grid) {
      own.grid = Object.assign({}, option.grid, {
        top: (option.grid.top == null ? 10 : option.grid.top) + legendHeight + topExtra
      });
    }
    return scaleText(merge(base, own), scale);
  }

  /**
   * Round only the outer ends of a stacked bar so the stack reads as one shape.
   */
  function stackCorners(values, horizontal, radius) {
    const r = radius == null ? (horizontal ? 5 : 3) : radius;
    const filled = function (i) {
      const idx = [];
      for (let s = 0; s < values.length; s++) {
        if (Number(values[s][i]) > 0) idx.push(s);
      }
      return idx;
    };
    return function (s, i) {
      const on = filled(i);
      const first = s === on[0];
      const last = s === on[on.length - 1];
      if (horizontal) {
        return [first ? r : 0, last ? r : 0, last ? r : 0, first ? r : 0];
      }
      return [last ? r : 0, last ? r : 0, 0, 0];
    };
  }

  /**
   * Pick whichever of dark or white label text has higher WCAG contrast on `fill`.
   */
  function labelColor(fill) {
    const t = chartTheme();
    const probe = document.createElement('span');
    probe.style.color = fill;
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const rgb = (getComputedStyle(probe).color || '').match(/\d+(\.\d+)?/g);
    probe.remove();
    if (!rgb || rgb.length < 3) return t.labelOnDark;
    const channels = rgb.slice(0, 3).map(function (v) {
      const c = Number(v) / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const fillLum = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    const DARK_LUM = 0.0112; // relative luminance of #1f1a1d
    return (fillLum + 0.05) / (DARK_LUM + 0.05) > 1.05 / (fillLum + 0.05)
      ? t.labelOnLight
      : t.labelOnDark;
  }

  /**
   * Distinct marker shape + style per outcome family so colour is never the sole encoding.
   * Never uses ECharts 'emptyCircle' (which hardcodes white interior in dark mode);
   * ring markers explicitly fill with `t.paper` and stroke with a >=3:1 border color.
   */
  function outcomeMarker(label, color) {
    const t = chartTheme();
    const s = String(label || '').toLowerCase();
    if (s.includes('reversal') || s.includes('not homogeneous and not significant')) {
      return { symbol: 'triangle', itemStyle: { color: color, borderColor: t.paper, borderWidth: 1 } };
    }
    if (s.includes('not homogeneous but jointly')) {
      return { symbol: 'roundRect', itemStyle: { color: color, borderColor: t.paper, borderWidth: 1 } };
    }
    if (s.includes('flawed') || s.includes('mixed')) {
      return { symbol: 'rect', itemStyle: { color: color, borderColor: t.paper, borderWidth: 1 } };
    }
    if (s.includes('fail')) {
      return { symbol: 'diamond', itemStyle: { color: color, borderColor: t.paper, borderWidth: 1 } };
    }
    if (s.includes('succ')) {
      return { symbol: 'circle', itemStyle: { color: color, borderColor: t.paper, borderWidth: 1 } };
    }
    if (s.includes('descriptive')) {
      return { symbol: 'roundRect', itemStyle: { color: t.paper, borderColor: color, borderWidth: 2 } };
    }
    if (s.includes('os not significant') || s.includes('uninformative')) {
      return { symbol: 'circle', itemStyle: { color: t.paper, borderColor: color, borderWidth: 2 } };
    }
    // Not calculable / not coded: hollow diamond with >=3.9:1 stroke in both themes
    return { symbol: 'diamond', itemStyle: { color: t.paper, borderColor: t.notCodedStroke || color, borderWidth: 2 } };
  }

  function outcomeSymbol(label) {
    return outcomeMarker(label, '').symbol;
  }

  const COPY_ICON = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  const CHECK_ICON = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  function renderCopyButton(actionsEl, id, title, table) {
    if (!actionsEl) return;
    let wrap = actionsEl.querySelector('.chart-copy-wrap[data-for="' + id + '"]');
    if (!table) {
      if (wrap) wrap.remove();
      return;
    }
    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = 'chart-copy-wrap';
      wrap.dataset.for = id;
      wrap.innerHTML =
        '<span class="copy-feedback" aria-hidden="true" hidden></span>' +
        '<button type="button" class="btn btn-sm btn-secondary chart-copy" id="' + escapeHtml(id) + '-data-copy">' +
        COPY_ICON + '<span>Copy chart CSV</span></button>' +
        '<span id="' + escapeHtml(id) + '-data-copy-status" class="visually-hidden" role="status"></span>';
      actionsEl.appendChild(wrap);
    }
    const btn = wrap.querySelector('.chart-copy');
    const feedback = wrap.querySelector('.copy-feedback');
    const status = wrap.querySelector('[role="status"]');
    btn.setAttribute('aria-label', 'Copy chart CSV for ' + plain(title));
    btn.title = 'Copy chart CSV';
    btn._table = table;
    btn._title = title;

    if (!btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', function () {
        const tbl = btn._table;
        if (!tbl) return;
        const text = csvText(tbl.headers, tbl.rows, tbl.summary || '');
        const finish = function (ok) {
          feedback.hidden = false;
          feedback.classList.toggle('copy-feedback--failed', !ok);
          feedback.textContent = ok ? 'CSV copied' : 'Copy failed';
          status.textContent = ok ? 'Chart CSV copied' : 'Could not copy chart CSV';
          btn.innerHTML = (ok ? CHECK_ICON : COPY_ICON) + '<span>' + (ok ? 'Copied' : 'Copy chart CSV') + '</span>';
          clearTimeout(btn._timer);
          btn._timer = setTimeout(function () {
            feedback.hidden = true;
            status.textContent = '';
            btn.innerHTML = COPY_ICON + '<span>Copy chart CSV</span>';
          }, ok ? 2000 : 3000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { finish(true); }, function () { finish(false); });
        } else {
          try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            finish(true);
          } catch (e) {
            finish(false);
          }
        }
      });
    }
  }

  function renderDataDisclosure(container, id, title, table, disclosureHost) {
    const anchor = disclosureHost || container;
    const parent = anchor.parentElement;
    if (!parent) return;
    let details = document.getElementById(id + '-data');
    if (!table) {
      if (details) details.remove();
      return;
    }
    const wasOpen = details ? details.open : false;
    if (!details) {
      details = document.createElement('details');
      details.id = id + '-data';
      details.className = 'disclosure chart-data';
      details.dataset.for = id;
      anchor.insertAdjacentElement('afterend', details);
    } else if (details.previousElementSibling !== anchor) {
      anchor.insertAdjacentElement('afterend', details);
    }

    const headCells = table.headers.map(function (h) {
      return '<th scope="col">' + escapeHtml(h) + '</th>';
    }).join('');
    const bodyRows = table.rows.map(function (row) {
      const cells = row.map(function (v, i) {
        const txt = escapeHtml(cellText(v, table.headers[i]));
        return i === 0 ? '<th scope="row">' + txt + '</th>' : '<td>' + txt + '</td>';
      }).join('');
      return '<tr>' + cells + '</tr>';
    }).join('');

    details.innerHTML =
      '<summary aria-label="View chart data for ' + escapeHtml(plain(title)) + '">View chart data</summary>' +
      (table.summary ? '<p class="chart-summary">' + escapeHtml(table.summary) + '</p>' : '') +
      '<div class="table-scroll" tabindex="0" role="region" aria-label="' + escapeHtml(plain(title)) + ': chart values">' +
        '<table>' +
          '<caption>' + escapeHtml(plain(title)) + '</caption>' +
          '<thead><tr>' + headCells + '</tr></thead>' +
          '<tbody>' + bodyRows + '</tbody>' +
        '</table>' +
      '</div>';
    details.open = wasOpen;
  }

  /**
   * Mount or update an ECharts SVG chart in `container`.
   * Waits until the container has non-zero width (hidden tabs), redraws on resize
   * and themechange, preserves user legend toggles across redraws, wires aria
   * attributes, data disclosure, and CSV copy.
   */
  function mount(container, spec) {
    if (!container || typeof echarts === 'undefined') return null;

    const id = container.id || ('chart-' + Math.random().toString(36).slice(2, 8));
    let state = mounts.get(container);

    if (!state) {
      state = {
        id: id,
        chart: null,
        spec: null,
        lastOption: null,
        legendSelected: null,
        lastWidth: 0,
        dirty: false,
        raf: 0,
        observer: null,
        onTheme: null
      };

      const draw = function () {
        if (!state.spec) return;
        const width = Math.round(container.clientWidth);
        if (!width) {
          state.dirty = true;
          return;
        }
        state.dirty = false;

        const sp = state.spec;
        let height = sp.height;
        if (typeof sp.heightFor === 'function') {
          height = sp.heightFor(width);
        } else if (sp.aspect && typeof sp.height === 'number') {
          height = Math.round(Math.max(sp.height, Math.min(width * sp.aspect, window.innerHeight * 0.72)));
        }
        if (height) {
          container.style.height = height + 'px';
        }

        const opt = typeof sp.option === 'function' ? sp.option({ width: width, height: height }) : sp.option;
        if (!opt) return;

        // Re-apply user legend toggles for series still present after theme/resize redraw
        if (state.legendSelected && opt.legend && Array.isArray(opt.legend.data)) {
          const validNames = new Set(opt.legend.data.map(function (d) { return typeof d === 'string' ? d : d.name; }));
          const preserved = {};
          let anyPreserved = false;
          Object.keys(state.legendSelected).forEach(function (k) {
            if (validNames.has(k)) {
              preserved[k] = state.legendSelected[k];
              anyPreserved = true;
            }
          });
          if (anyPreserved) {
            opt.legend.selected = Object.assign({}, opt.legend.selected, preserved);
          }
        }

        state.lastOption = opt;

        if (!state.chart || state.chart.isDisposed()) {
          container.innerHTML = '';
          state.chart = echarts.init(container, null, { renderer: 'svg' });
          state.chart.on('legendselectchanged', function (ev) {
            if (ev && ev.selected) {
              state.legendSelected = Object.assign({}, ev.selected);
            }
          });
        }
        state.lastWidth = width;
        state.chart.resize();
        state.chart.setOption(opt, { notMerge: true });
      };

      state.draw = draw;
      state.observer = new ResizeObserver(function () {
        cancelAnimationFrame(state.raf);
        state.raf = requestAnimationFrame(function () {
          const w = Math.round(container.clientWidth);
          if (!w) return;
          if (!state.chart || state.dirty || w !== state.lastWidth) {
            draw();
          } else {
            state.chart.resize();
          }
        });
      });
      state.observer.observe(container);

      state.onTheme = function () {
        state.dirty = true;
        if (state.spec) draw();
      };
      window.addEventListener('themechange', state.onTheme);
      mounts.set(container, state);
    }

    state.spec = spec;
    container.classList.add('echart');
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', plain(spec.title || 'Chart') + '. Values in the following data table.');
    container.setAttribute('aria-describedby', id + '-data');

    renderDataDisclosure(container, id, spec.title || 'Chart', spec.table, spec.disclosureAfterEl);
    renderCopyButton(spec.actionsEl, id, spec.title || 'Chart', spec.table);

    state.draw();
    return state;
  }

  function unmount(container, actionsEl) {
    if (!container) return;
    const id = container.id;
    const state = mounts.get(container);
    if (state) {
      cancelAnimationFrame(state.raf);
      if (state.observer) state.observer.disconnect();
      if (state.onTheme) window.removeEventListener('themechange', state.onTheme);
      if (state.chart && !state.chart.isDisposed()) state.chart.dispose();
      mounts.delete(container);
    }
    if (id) {
      const details = document.getElementById(id + '-data');
      if (details) details.remove();
    }
    if (actionsEl && id) {
      const wrap = actionsEl.querySelector('.chart-copy-wrap[data-for="' + id + '"]');
      if (wrap) wrap.remove();
    }
  }

  function getInstance(container) {
    const state = mounts.get(container);
    return state && state.chart && !state.chart.isDisposed() ? state.chart : null;
  }

  function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /**
   * Export crisp SVG with extra left margin buffer so standalone SVG viewers
   * without Source Sans 3 installed do not clip left-aligned labels.
   */
  function exportSvg(container, filename) {
    const state = mounts.get(container);
    const chart = getInstance(container);
    if (!chart) return;
    const width = container.clientWidth || 1200;
    const height = container.clientHeight || 800;
    let svg;
    if (state && state.lastOption) {
      const tmp = document.createElement('div');
      tmp.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + (width + 48) + 'px;height:' + height + 'px;pointer-events:none;';
      document.body.appendChild(tmp);
      try {
        const tmpChart = echarts.init(tmp, null, { renderer: 'svg' });
        const exportOpt = Object.assign({}, state.lastOption, {
          animation: false,
          grid: Object.assign({}, state.lastOption.grid, {
            left: (state.lastOption.grid && typeof state.lastOption.grid.left === 'number' ? state.lastOption.grid.left : 12) + 36
          })
        });
        tmpChart.setOption(exportOpt, { notMerge: true });
        svg = tmpChart.renderToSVGString();
        tmpChart.dispose();
      } finally {
        tmp.remove();
      }
    } else {
      svg = chart.renderToSVGString();
    }
    if (!/\bxmlns=/.test(svg)) {
      svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename.endsWith('.svg') ? filename : filename + '.svg');
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /**
   * Export 2x PNG via an offscreen ECharts Canvas renderer so the browser's
   * loaded @font-face (Source Sans 3) renders natively with zero label clipping.
   */
  function exportPng(container, filename, scale) {
    const state = mounts.get(container);
    const chart = getInstance(container);
    if (!chart) return;
    const pxRatio = scale || 2;
    const width = container.clientWidth || 1200;
    const height = container.clientHeight || 800;
    const t = chartTheme();

    if (state && state.lastOption) {
      const tmp = document.createElement('div');
      tmp.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + width + 'px;height:' + height + 'px;pointer-events:none;';
      document.body.appendChild(tmp);
      try {
        const tmpChart = echarts.init(tmp, null, { renderer: 'canvas', devicePixelRatio: pxRatio });
        const exportOpt = Object.assign({}, state.lastOption, { animation: false });
        tmpChart.setOption(exportOpt, { notMerge: true });
        const pngUrl = tmpChart.getDataURL({
          type: 'png',
          pixelRatio: pxRatio,
          backgroundColor: t.paper
        });
        tmpChart.dispose();
        triggerDownload(pngUrl, filename.endsWith('.png') ? filename : filename + '.png');
        return;
      } finally {
        tmp.remove();
      }
    }
  }

  Object.assign(FReD.charts, {
    token: token,
    textScale: textScale,
    chartTheme: chartTheme,
    plain: plain,
    escapeHtml: escapeHtml,
    formatNumber: formatNumber,
    formatPercent: formatPercent,
    cellText: cellText,
    csvText: csvText,
    tipRow: tipRow,
    tipLines: tipLines,
    valueAxis: valueAxis,
    categoryAxis: categoryAxis,
    countAxis: countAxis,
    categoryLabelWidth: categoryLabelWidth,
    horizontalBarHeight: horizontalBarHeight,
    legendRows: legendRows,
    finishOption: finishOption,
    stackCorners: stackCorners,
    labelColor: labelColor,
    outcomeMarker: outcomeMarker,
    outcomeSymbol: outcomeSymbol,
    mount: mount,
    unmount: unmount,
    getInstance: getInstance,
    exportSvg: exportSvg,
    exportPng: exportPng
  });
})();
