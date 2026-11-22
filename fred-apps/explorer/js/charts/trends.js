/**
 * FReD Explorer - Trend Charts
 *
 * Decade trend line chart and discipline horizontal stacked bar chart
 * rendered with Apache ECharts (SVG), following the flora-explorer helpers.
 */

window.FReD = window.FReD || {};
FReD.charts = FReD.charts || {};

FReD.charts.trends = {
  decadeContainer: null,
  disciplineContainer: null,
  decadeActionsEl: null,
  disciplineActionsEl: null,
  decadeCountEl: null,
  toolbarEl: null,
  decadeHasData: false,
  disciplineHasData: false,
  displayMode: 'totals', // 'totals' | 'shares'
  lastStudies: null,
  lastCriterion: null,

  /**
   * Initialize trend charts
   */
  init(decadeContainerId, disciplineContainerId) {
    this.decadeContainer = document.getElementById(decadeContainerId);
    this.disciplineContainer = document.getElementById(disciplineContainerId);
    this.decadeActionsEl = document.getElementById(decadeContainerId + '-actions');
    this.disciplineActionsEl = document.getElementById(disciplineContainerId + '-actions');
    this.decadeCountEl = document.getElementById('decade-count');
    this.toolbarEl = document.querySelector('.correlates-toolbar');

    document.querySelectorAll('[data-correlates-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.correlatesMode === 'shares' ? 'shares' : 'totals';
        this.setDisplayMode(mode);
      });
    });
  },

  _updateToolbarVisibility() {
    if (this.toolbarEl) {
      this.toolbarEl.hidden = !this.decadeHasData && !this.disciplineHasData;
    }
  },

  setDisplayMode(mode) {
    const next = mode === 'shares' ? 'shares' : 'totals';
    if (this.displayMode === next) return;
    this.displayMode = next;
    document.querySelectorAll('[data-correlates-mode]').forEach(btn => {
      const isActive = btn.dataset.correlatesMode === next;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
    if (this.lastStudies && this.lastCriterion) {
      this.renderDecade(this.lastStudies, this.lastCriterion);
      this.renderDiscipline(this.lastStudies, this.lastCriterion);
    }
  },

  _sortOutcomes(outcomes) {
    const outcomeOrder = [
      'success', 'successful', 'successful replication',
      'success (homogeneous and jointly significantly above 0)',
      'success (homogeneous and jointly significantly different from 0)',
      'statistically successful but flawed',
      'failure (not homogeneous but jointly significantly above 0)',
      'failure (not homogeneous but jointly significantly different from 0)',
      'failure', 'failed', 'failed replication', 'informative failure',
      'failure (homogeneous but not significant)',
      'failure (not homogeneous and not significant)',
      'failure (reversal)',
      'failure (homogeneous but jointly significant in opposite direction)',
      'failure (not homogeneous and jointly significant in opposite direction)',
      'mixed',
      'os not significant', 'uninformative', 'descriptive only',
      'not calculable', 'not coded'
    ];
    return outcomes.slice().sort((a, b) => {
      const aIdx = outcomeOrder.findIndex(o => o === a.toLowerCase());
      const bIdx = outcomeOrder.findIndex(o => o === b.toLowerCase());
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
  },

  /**
   * Render decade trend chart
   */
  renderDecade(studies, criterion) {
    if (!this.decadeContainer) return;

    this.lastStudies = studies;
    this.lastCriterion = criterion;

    // Aggregate by reference to avoid counting same original multiple times
    const aggregated = FReD.dataLoader.aggregateByReference(studies, criterion);

    // Extract years and decades (prefer pre-extracted orig_year over regex fallback)
    const withDecade = aggregated.map(item => {
      const year = item.orig_year || FReD.utils.extractYear(item.ref_o);
      const decade = year ? FReD.utils.getDecade(year) : null;
      return { ...item, year, decade };
    }).filter(item => item.decade && item.decade >= 1950 && item.decade <= 2020);

    if (this.decadeCountEl) {
      this.decadeCountEl.textContent = withDecade.length > 0
        ? `(k = ${withDecade.length.toLocaleString('en-GB')} original studies)`
        : '';
    }

    if (withDecade.length === 0) {
      this.decadeHasData = false;
      this._updateToolbarVisibility();
      FReD.charts.unmount(this.decadeContainer, this.decadeActionsEl);
      this.decadeContainer.classList.add('is-empty');
      this.decadeContainer.style.height = '';
      this.decadeContainer.innerHTML = '<div class="alert alert-info">No valid publication years found.</div>';
      return;
    }

    this.decadeHasData = true;
    this._updateToolbarVisibility();
    this.decadeContainer.classList.remove('is-empty');

    // Group by decade and outcome
    const decadeOutcomes = {};
    const decadeTotals = {};
    withDecade.forEach(item => {
      if (!decadeOutcomes[item.decade]) {
        decadeOutcomes[item.decade] = {};
      }
      decadeOutcomes[item.decade][item.outcome] = (decadeOutcomes[item.decade][item.outcome] || 0) + 1;
      decadeTotals[item.decade] = (decadeTotals[item.decade] || 0) + 1;
    });

    const outcomes = this._sortOutcomes([...new Set(withDecade.map(d => d.outcome))]);
    const decades = Object.keys(decadeOutcomes).sort((a, b) => Number(a) - Number(b));
    const displayOutcomes = outcomes.map(o => FReD.utils.capFirstLetter(o));

    const criterionInfo = FReD.successCriteria.getCriterion(criterion);
    const criterionLabel = criterionInfo ? criterionInfo.label : criterion;
    const isShares = this.displayMode === 'shares';

    const table = isShares
      ? {
          headers: ['Decade', ...displayOutcomes.map(o => `${o} (%)`), 'Total (N)'],
          rows: decades.map(dec => {
            const tot = decadeTotals[dec] || 0;
            return [
              Number(dec),
              ...outcomes.map(o => tot ? Number(((100 * (decadeOutcomes[dec][o] || 0)) / tot).toFixed(1)) : 0),
              tot
            ];
          }),
          summary: `Outcome shares (%) by decade across ${withDecade.length.toLocaleString('en-GB')} original studies (${criterionLabel}). Shares are rounded to 1 decimal place and may not sum to 100%.`
        }
      : {
          headers: ['Decade', ...displayOutcomes, 'Total (N)'],
          rows: decades.map(dec => [Number(dec), ...outcomes.map(o => decadeOutcomes[dec][o] || 0), decadeTotals[dec] || 0]),
          summary: `Aggregated replication outcomes by decade across ${withDecade.length.toLocaleString('en-GB')} original studies (${criterionLabel}).`
        };

    const xAxisLabels = isShares
      ? decades.map(d => `${d}s\n(n=${decadeTotals[d] || 0})`)
      : decades;

    const optionFn = ({ width }) => {
      const t = FReD.charts.chartTheme();
      const colors = outcomes.map(o => FReD.successCriteria.getColor(o));
      const legendData = [];
      const series = outcomes.map((outcome, i) => {
        const marker = FReD.charts.outcomeMarker(outcome, colors[i]);
        const lineColor = marker.itemStyle.color === t.paper ? marker.itemStyle.borderColor : colors[i];
        legendData.push({
          name: displayOutcomes[i],
          icon: marker.symbol,
          itemStyle: marker.itemStyle
        });
        return {
          name: displayOutcomes[i],
          type: 'line',
          smooth: false,
          symbol: marker.symbol,
          symbolSize: 7,
          lineStyle: { color: lineColor, width: 2.2 },
          itemStyle: marker.itemStyle,
          emphasis: { focus: 'series' },
          data: decades.map(d => {
            const c = decadeOutcomes[d][outcome] || 0;
            if (!isShares) return c;
            const tot = decadeTotals[d] || 0;
            return tot ? Number(((100 * c) / tot).toFixed(1)) : 0;
          })
        };
      });

      const tooltip = {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        formatter: ps => {
          if (!ps || !ps.length) return '';
          const dec = decades[ps[0].dataIndex];
          const fullTotal = decadeTotals[dec] || 0;
          const visibleCount = ps.reduce((sum, p) => sum + (decadeOutcomes[dec][outcomes[p.seriesIndex]] || 0), 0);
          const totalLabel = visibleCount === fullTotal
            ? `N=${FReD.charts.formatNumber(fullTotal, 0)}`
            : `${FReD.charts.formatNumber(visibleCount, 0)} shown of ${FReD.charts.formatNumber(fullTotal, 0)}`;
          const lines = [`<strong>${FReD.charts.escapeHtml(dec)}s</strong> \u00b7 ${totalLabel}`];
          ps.forEach(p => {
            const sObj = series[p.seriesIndex];
            const swatch = (sObj && sObj.lineStyle.color) || colors[p.seriesIndex];
            const marker = sObj ? { symbol: sObj.symbol, itemStyle: sObj.itemStyle } : null;
            const rawCount = decadeOutcomes[dec][outcomes[p.seriesIndex]] || 0;
            const pctStr = FReD.charts.formatPercent(rawCount, fullTotal, 1) + '%';
            const valueText = isShares
              ? `${p.seriesName}: ${pctStr} (${FReD.charts.formatNumber(rawCount, 0)})`
              : `${p.seriesName}: ${FReD.charts.formatNumber(rawCount, 0)} (${pctStr})`;
            lines.push(FReD.charts.tipRow(swatch, valueText, marker));
          });
          return FReD.charts.tipLines(lines);
        }
      };

      const yAxis = isShares
        ? FReD.charts.valueAxis({
            name: 'Share of Original Studies (%)',
            nameGap: 44,
            min: 0,
            max: 100,
            interval: 25,
            axisLabel: { formatter: v => `${v}%` }
          })
        : FReD.charts.valueAxis(Object.assign(FReD.charts.countAxis(), {
            name: 'Number of Original Studies',
            nameGap: 44
          }));

      return FReD.charts.finishOption({
        series: series,
        tooltip: tooltip,
        legend: { data: legendData },
        xAxis: FReD.charts.categoryAxis({
          data: xAxisLabels,
          name: 'Decade the Original Finding was Published',
          nameGap: isShares ? 44 : 32,
          axisLabel: isShares
            ? { fontSize: width < 460 ? 10 : 11, lineHeight: 13 }
            : {}
        }),
        yAxis: yAxis,
        grid: { left: 42, right: 16, top: 12, bottom: isShares ? 36 : 28, containLabel: true }
      }, { width });
    };

    FReD.charts.mount(this.decadeContainer, {
      title: isShares
        ? `Outcomes by decade — shares (%) (${criterionLabel})`
        : `Outcomes by decade (${criterionLabel})`,
      option: optionFn,
      height: 360,
      aspect: 0.44,
      table: table,
      actionsEl: this.decadeActionsEl
    });
  },

  /**
   * Render discipline horizontal stacked bar chart
   */
  renderDiscipline(studies, criterion) {
    if (!this.disciplineContainer) return;

    this.lastStudies = studies;
    this.lastCriterion = criterion;

    const aggregated = FReD.dataLoader.aggregateByReference(studies, criterion);

    const withDiscipline = aggregated.filter(item =>
      item.discipline &&
      item.discipline.trim() !== ''
    );

    if (withDiscipline.length === 0) {
      this.disciplineHasData = false;
      this._updateToolbarVisibility();
      FReD.charts.unmount(this.disciplineContainer, this.disciplineActionsEl);
      this.disciplineContainer.classList.add('is-empty');
      this.disciplineContainer.style.height = '';
      this.disciplineContainer.innerHTML = '<div class="alert alert-info">No discipline information available.</div>';
      return;
    }

    this.disciplineHasData = true;
    this._updateToolbarVisibility();
    this.disciplineContainer.classList.remove('is-empty');

    const disciplineOutcomes = {};
    withDiscipline.forEach(item => {
      const discipline = this.capitalizeDiscipline(item.discipline);
      if (!disciplineOutcomes[discipline]) {
        disciplineOutcomes[discipline] = {};
      }
      disciplineOutcomes[discipline][item.outcome] = (disciplineOutcomes[discipline][item.outcome] || 0) + 1;
    });

    const MIN_COUNT = 10;
    const MAX_UNCOLLAPSED = 12;
    const disciplineTotals = Object.entries(disciplineOutcomes).map(([discipline, outcomes]) => ({
      discipline,
      total: Object.values(outcomes).reduce((a, b) => a + b, 0),
      outcomes
    }));

    const largeOnly = disciplineTotals.filter(d => d.total >= MIN_COUNT);
    const shouldCollapse = disciplineTotals.length > MAX_UNCOLLAPSED && largeOnly.length > 0;
    const largeDisciplines = shouldCollapse ? [...largeOnly] : [...disciplineTotals];
    const smallDisciplines = shouldCollapse ? disciplineTotals.filter(d => d.total < MIN_COUNT) : [];

    if (smallDisciplines.length > 0) {
      const otherOutcomes = {};
      smallDisciplines.forEach(d => {
        Object.entries(d.outcomes).forEach(([outcome, count]) => {
          otherOutcomes[outcome] = (otherOutcomes[outcome] || 0) + count;
        });
      });
      const otherTotal = Object.values(otherOutcomes).reduce((a, b) => a + b, 0);
      if (otherTotal > 0) {
        largeDisciplines.push({
          discipline: 'Other',
          total: otherTotal,
          outcomes: otherOutcomes
        });
      }
    }

    // Largest first (yAxis inverse: true places index 0 at the top), "Other" always last
    largeDisciplines.sort((a, b) => {
      if (a.discipline === 'Other') return 1;
      if (b.discipline === 'Other') return -1;
      return b.total - a.total;
    });

    const displayDisciplines = largeDisciplines.map(d => d.discipline);
    const finalDisciplineOutcomes = {};
    largeDisciplines.forEach(d => {
      finalDisciplineOutcomes[d.discipline] = d.outcomes;
    });

    const allOutcomes = new Set();
    largeDisciplines.forEach(d => {
      Object.keys(d.outcomes).forEach(o => allOutcomes.add(o));
    });

    const outcomes = this._sortOutcomes([...allOutcomes]);
    const displayOutcomes = outcomes.map(o => FReD.utils.capFirstLetter(o));

    const criterionInfo = FReD.successCriteria.getCriterion(criterion);
    const criterionLabel = criterionInfo ? criterionInfo.label : criterion;
    const isShares = this.displayMode === 'shares';

    const otherNote = smallDisciplines.length > 0
      ? ` Disciplines with fewer than ${MIN_COUNT} original studies are grouped into Other.`
      : '';

    const table = isShares
      ? {
          headers: ['Discipline', ...displayOutcomes.map(o => `${o} (%)`), 'Total (N)'],
          rows: largeDisciplines.map(d => [
            d.discipline,
            ...outcomes.map(o => d.total ? Number(((100 * (d.outcomes[o] || 0)) / d.total).toFixed(1)) : 0),
            d.total
          ]),
          summary: `Outcome shares (%) by discipline across ${withDiscipline.length.toLocaleString('en-GB')} original studies (${criterionLabel}).${otherNote} Shares are rounded to 1 decimal place and may not sum to 100%.`
        }
      : {
          headers: ['Discipline', ...displayOutcomes, 'Total (N)'],
          rows: largeDisciplines.map(d => [
            d.discipline,
            ...outcomes.map(o => d.outcomes[o] || 0),
            d.total
          ]),
          summary: `Aggregated replication outcomes by discipline across ${withDiscipline.length.toLocaleString('en-GB')} original studies (${criterionLabel}).${otherNote}`
        };

    const yAxisLabels = isShares
      ? largeDisciplines.map(d => `${d.discipline} (n=${d.total})`)
      : displayDisciplines;

    const optionFn = ({ width }) => {
      const t = FReD.charts.chartTheme();
      const colors = outcomes.map(o => FReD.successCriteria.getColor(o));
      const countMatrix = outcomes.map(o => displayDisciplines.map(d => finalDisciplineOutcomes[d][o] || 0));
      const plotMatrix = isShares
        ? outcomes.map((o, si) => displayDisciplines.map((d, di) => {
            const tot = largeDisciplines[di].total;
            return tot ? (100 * countMatrix[si][di]) / tot : 0;
          }))
        : countMatrix;
      const corners = FReD.charts.stackCorners(countMatrix, true, 5);

      const series = outcomes.map((outcome, si) => ({
        name: displayOutcomes[si],
        type: 'bar',
        stack: 'total',
        barWidth: 14,
        itemStyle: {
          color: colors[si],
          borderColor: t.paper,
          borderWidth: 1
        },
        emphasis: { focus: 'series' },
        data: plotMatrix[si].map((v, di) => ({
          value: v,
          itemStyle: { borderRadius: corners(si, di) }
        }))
      }));

      const tooltip = {
        trigger: 'axis',
        formatter: ps => {
          if (!ps || !ps.length) return '';
          const di = ps[0].dataIndex;
          const total = largeDisciplines[di].total;
          const visibleCount = ps.reduce((sum, p) => sum + countMatrix[p.seriesIndex][di], 0);
          const totalLabel = visibleCount === total
            ? `N=${FReD.charts.formatNumber(total, 0)}`
            : `${FReD.charts.formatNumber(visibleCount, 0)} shown of ${FReD.charts.formatNumber(total, 0)}`;
          const lines = [`<strong>${FReD.charts.escapeHtml(displayDisciplines[di])}</strong> \u00b7 ${totalLabel}`];
          ps.forEach(p => {
            const v = countMatrix[p.seriesIndex][di];
            if (v > 0) {
              const pct = FReD.charts.formatPercent(v, total, 1) + '%';
              const rowText = isShares
                ? `${p.seriesName}: ${pct} (${FReD.charts.formatNumber(v, 0)})`
                : `${p.seriesName}: ${FReD.charts.formatNumber(v, 0)} (${pct})`;
              lines.push(FReD.charts.tipRow(colors[p.seriesIndex], rowText));
            }
          });
          return FReD.charts.tipLines(lines);
        }
      };

      const xAxis = isShares
        ? FReD.charts.valueAxis({
            name: 'Share of Replicated Original Studies (%)',
            nameGap: 32,
            min: 0,
            max: 100,
            interval: 25,
            axisLabel: { formatter: v => `${v}%` }
          })
        : FReD.charts.valueAxis(Object.assign(FReD.charts.countAxis(), {
            name: 'Number of Replicated Original Studies',
            nameGap: 32
          }));

      return FReD.charts.finishOption({
        series: series,
        tooltip: tooltip,
        xAxis: xAxis,
        yAxis: FReD.charts.categoryAxis({
          data: yAxisLabels,
          inverse: true,
          axisLabel: {
            interval: 0,
            width: FReD.charts.categoryLabelWidth(width),
            overflow: 'break',
            lineHeight: 14,
            height: 42,
            lineOverflow: 'truncate'
          }
        }),
        grid: { left: 10, right: 16, top: 10, bottom: 28, containLabel: true }
      }, { width });
    };

    FReD.charts.mount(this.disciplineContainer, {
      title: isShares
        ? `Outcomes by discipline — shares (%) (${criterionLabel})`
        : `Outcomes by discipline (${criterionLabel})`,
      option: optionFn,
      heightFor: width => Math.max(260, FReD.charts.horizontalBarHeight(yAxisLabels, displayOutcomes, width)),
      table: table,
      actionsEl: this.disciplineActionsEl
    });
  },

  /**
   * Capitalize discipline name properly (keeping minor conjunctions/prepositions lowercase)
   */
  capitalizeDiscipline(name) {
    if (!name) return 'Unknown';
    const minorWords = new Set(['and', 'of', 'in', 'for', 'the', 'to', 'on', 'or']);
    return name
      .trim()
      .split(/\s+/)
      .map((word, idx) =>
        word
          .split('/')
          .map((part, pIdx) => {
            const lower = part.toLowerCase();
            if (idx > 0 && pIdx === 0 && minorWords.has(lower)) return lower;
            return lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : '';
          })
          .join('/')
      )
      .join(' ');
  },

  /**
   * Clear charts
   */
  clear() {
    this.decadeHasData = false;
    this.disciplineHasData = false;
    this._updateToolbarVisibility();
    if (this.decadeContainer) {
      FReD.charts.unmount(this.decadeContainer, this.decadeActionsEl);
      this.decadeContainer.innerHTML = '';
    }
    if (this.disciplineContainer) {
      FReD.charts.unmount(this.disciplineContainer, this.disciplineActionsEl);
      this.disciplineContainer.innerHTML = '';
    }
    if (this.decadeCountEl) {
      this.decadeCountEl.textContent = '';
    }
  }
};

window.FReD = FReD;
