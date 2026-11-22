/**
 * FReD Explorer - Scatterplot Chart
 *
 * Interactive scatterplot of original vs replication effect sizes rendered
 * with Apache ECharts (SVG), including x = y line, y = 0 line, dynamic
 * bounds covering every valid effect, and clipped significance rug marks.
 */

window.FReD = window.FReD || {};
FReD.charts = FReD.charts || {};

FReD.charts.scatterplot = {
  container: null,
  actionsEl: null,
  countEl: null,
  rugLegendEl: null,
  lastStudies: null,
  lastCriterion: null,

  /**
   * Initialize the scatterplot
   */
  init(containerId) {
    this.container = document.getElementById(containerId);
    this.actionsEl = document.getElementById(containerId + '-actions');
    this.countEl = document.getElementById(containerId + '-count');
    this.rugLegendEl = document.getElementById('scatterplot-rug-legend');
    if (!this.container) {
      console.error('Scatterplot container not found:', containerId);
      return;
    }
    this.container.classList.add('loading');
  },

  /**
   * Render the scatterplot with given data
   */
  render(studies, criterion) {
    if (!this.container) return;

    this.lastStudies = studies;
    this.lastCriterion = criterion;

    // Filter out studies without effect sizes
    const validStudies = studies.filter(s =>
      s.es_o != null && !isNaN(s.es_o) &&
      s.es_r != null && !isNaN(s.es_r)
    );

    if (this.countEl) {
      this.countEl.textContent = studies.length > 0
        ? `(${validStudies.length.toLocaleString()} of ${studies.length.toLocaleString()} selected effects with numeric effect sizes)`
        : '';
    }

    if (validStudies.length === 0) {
      FReD.charts.unmount(this.container, this.actionsEl);
      this.container.classList.remove('loading');
      this.container.classList.add('is-empty');
      this.container.style.height = '';
      this.container.innerHTML = '<div class="alert alert-info">No studies with effect size data to display.</div>';
      if (this.rugLegendEl) this.rugLegendEl.hidden = true;
      return;
    }

    this.container.classList.remove('is-empty');
    if (this.rugLegendEl) this.rugLegendEl.hidden = false;

    // Group studies by outcome and compute dynamic bounds so no point is ever clipped
    const groups = {};
    const tableRows = [];
    let dataMinX = 0;
    let dataMaxX = 1;
    let dataMinY = -0.5;
    let dataMaxY = 1;

    validStudies.forEach(study => {
      const { outcomeReport } = FReD.successCriteria.getOutcome(study, criterion);
      const outcome = FReD.utils.capFirstLetter(outcomeReport || 'Not calculable');

      if (!groups[outcome]) {
        groups[outcome] = [];
      }
      groups[outcome].push(study);

      const x = Number(study.es_o);
      const y = Number(study.es_r);
      if (x < dataMinX) dataMinX = x;
      if (x > dataMaxX) dataMaxX = x;
      if (y < dataMinY) dataMinY = y;
      if (y > dataMaxY) dataMaxY = y;

      tableRows.push([
        study.description || 'No description',
        outcome,
        x,
        y,
        study.p_o != null && !isNaN(study.p_o) ? Number(study.p_o) : '',
        study.p_r != null && !isNaN(study.p_r) ? Number(study.p_r) : ''
      ]);
    });

    // Snap bounds outward to clean 0.25 steps, then add a 0.10 rug band (2 x 0.05 steps) so
    // every 0.05 tick aligns with multiples of 0.25 and rugs stay well clear of x=0 / y=minY.
    const tickMinX = Math.floor(dataMinX * 4) / 4;
    const tickMaxX = Math.ceil(dataMaxX * 4) / 4;
    const tickMinY = Math.floor(dataMinY * 4) / 4;
    const tickMaxY = Math.ceil(dataMaxY * 4) / 4;

    const axisMinX = Number((tickMinX - 0.10).toFixed(2));
    const axisMaxX = Number((tickMaxX + 0.05).toFixed(2));
    const axisMinY = Number((tickMinY - 0.10).toFixed(2));
    const axisMaxY = Number((tickMaxY + 0.05).toFixed(2));

    const bottomRugY = Number((tickMinY - 0.05).toFixed(2));
    const leftRugX = Number((tickMinX - 0.05).toFixed(2));

    // Define order for legend (exact case-insensitive matching across all criteria)
    const outcomeOrder = [
      'Success', 'Successful', 'Successful replication',
      'Success (homogeneous and jointly significantly above 0)',
      'Success (homogeneous and jointly significantly different from 0)',
      'Statistically successful but flawed',
      'Failure (not homogeneous but jointly significantly above 0)',
      'Failure (not homogeneous but jointly significantly different from 0)',
      'Failure', 'Failed', 'Failed replication', 'Informative failure',
      'Failure (homogeneous but not significant)',
      'Failure (not homogeneous and not significant)',
      'Failure (reversal)',
      'Failure (homogeneous but jointly significant in opposite direction)',
      'Failure (not homogeneous and jointly significant in opposite direction)',
      'Mixed',
      'OS not significant', 'Uninformative', 'Descriptive only',
      'Not calculable', 'Not coded'
    ];

    const sortedOutcomes = Object.keys(groups).sort((a, b) => {
      const aIdx = outcomeOrder.findIndex(o => a.toLowerCase() === o.toLowerCase());
      const bIdx = outcomeOrder.findIndex(o => b.toLowerCase() === o.toLowerCase());
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

    const criterionInfo = FReD.successCriteria.getCriterion(criterion);
    const criterionLabel = criterionInfo ? criterionInfo.label : criterion;

    const table = {
      headers: ['Description', 'Outcome', 'Original r', 'Replication r', 'Original p', 'Replication p'],
      rows: tableRows,
      summary: `Original vs. replication effect sizes for ${validStudies.length.toLocaleString('en-GB')} of ${studies.length.toLocaleString('en-GB')} selected effects with numeric effect sizes (${criterionLabel}).`
    };

    const bottomRugData = [];
    const leftRugData = [];
    validStudies.forEach(s => {
      if (s.p_o != null && !isNaN(s.p_o)) {
        bottomRugData.push([Number(s.es_o), bottomRugY, s.p_o < 0.05 ? 1 : 0]);
      }
      if (s.p_r != null && !isNaN(s.p_r)) {
        leftRugData.push([leftRugX, Number(s.es_r), s.p_r < 0.05 ? 1 : 0]);
      }
    });

    const pointSize = Math.max(6, Math.round((12 - Math.log10(validStudies.length) * 2) * 10) / 10);

    const optionFn = ({ width }) => {
      const t = FReD.charts.chartTheme();
      const rug = FReD.successCriteria.rugColors;
      const series = [];
      const legendData = [];

      // Dedicated silent series for reference lines so legend toggles NEVER remove x = y or y = 0
      const diagStart = Math.max(tickMinX, tickMinY);
      const diagEnd = Math.min(tickMaxX, tickMaxY);
      series.push({
        name: '_ref_lines',
        type: 'scatter',
        silent: true,
        symbolSize: 0,
        z: 1,
        data: [],
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          animation: false,
          label: { show: false },
          data: [
            [
              { coord: [diagStart, diagStart], lineStyle: { color: t.rule, type: 'solid', width: 1.5 } },
              { coord: [diagEnd, diagEnd] }
            ],
            [
              { coord: [tickMinX, 0], lineStyle: { color: t.rule, type: 'dashed', width: 1.5 } },
              { coord: [tickMaxX, 0] }
            ]
          ]
        }
      });

      // Outcome scatter series with distinct colour + distinct shape (also reflected in legend)
      sortedOutcomes.forEach(outcome => {
        const color = FReD.successCriteria.getColor(outcome);
        const marker = FReD.charts.outcomeMarker(outcome, color);
        const swatchColor = marker.itemStyle.color === t.paper ? marker.itemStyle.borderColor : color;
        const pts = groups[outcome].map(study => ({
          value: [Number(study.es_o), Number(study.es_r)],
          description: study.description || 'No description',
          outcome: outcome,
          swatchColor: swatchColor
        }));

        legendData.push({
          name: outcome,
          icon: marker.symbol,
          itemStyle: marker.itemStyle
        });

        series.push({
          name: outcome,
          type: 'scatter',
          symbol: marker.symbol,
          symbolSize: pointSize,
          itemStyle: Object.assign({}, marker.itemStyle, { opacity: 0.92 }),
          emphasis: {
            scale: 1.35,
            itemStyle: { opacity: 1 }
          },
          z: 3,
          data: pts
        });
      });

      // Bottom rug (original study significance) - strictly clipped inside plot
      if (bottomRugData.length > 0) {
        series.push({
          name: '_rug_orig',
          type: 'custom',
          silent: true,
          clip: true,
          z: 2,
          renderItem: function (params, api) {
            const pt = api.coord([api.value(0), api.value(1)]);
            const isSig = api.value(2) === 1;
            return {
              type: 'line',
              shape: { x1: pt[0], y1: pt[1] - 4, x2: pt[0], y2: pt[1] + 4 },
              style: {
                stroke: isSig ? rug.significant : rug.notSignificant,
                lineWidth: 1.5,
                opacity: 0.78
              }
            };
          },
          data: bottomRugData
        });
      }

      // Left rug (replication study significance) - strictly clipped inside plot
      if (leftRugData.length > 0) {
        series.push({
          name: '_rug_rep',
          type: 'custom',
          silent: true,
          clip: true,
          z: 2,
          renderItem: function (params, api) {
            const pt = api.coord([api.value(0), api.value(1)]);
            const isSig = api.value(2) === 1;
            return {
              type: 'line',
              shape: { x1: pt[0] - 4, y1: pt[1], x2: pt[0] + 4, y2: pt[1] },
              style: {
                stroke: isSig ? rug.significant : rug.notSignificant,
                lineWidth: 1.5,
                opacity: 0.78
              }
            };
          },
          data: leftRugData
        });
      }

      const tooltip = {
        trigger: 'item',
        formatter: p => {
          const d = p.data || {};
          const xVal = Array.isArray(d.value) ? d.value[0] : p.value?.[0];
          const yVal = Array.isArray(d.value) ? d.value[1] : p.value?.[1];
          return FReD.charts.tipLines([
            `<strong>${FReD.charts.escapeHtml(d.description || 'No description')}</strong>`,
            FReD.charts.tipRow(d.swatchColor || p.color, d.outcome || p.seriesName),
            `r(original) = ${FReD.utils.formatNumber(xVal, 3)}`,
            `r(replication) = ${FReD.utils.formatNumber(yVal, 3)}`
          ]);
        }
      };

      const majorGridColors = ['transparent', 'transparent', t.grid, 'transparent', 'transparent'];
      const narrow = width < 480;
      const formatQuarterTick = (minTick, maxTick, step = 25) => v => {
        const r = Math.round(v * 100);
        if (r < Math.round(minTick * 100) || r > Math.round(maxTick * 100) || r % step !== 0) return '';
        const val = r === 0 ? 0 : r / 100;
        return val.toFixed(2);
      };

      return FReD.charts.finishOption({
        series: series,
        tooltip: tooltip,
        legend: { data: legendData },
        xAxis: FReD.charts.valueAxis({
          name: 'Original Effect Size (r)',
          nameGap: narrow ? 26 : 32,
          min: axisMinX,
          max: axisMaxX,
          interval: 0.05,
          splitLine: { lineStyle: { color: majorGridColors } },
          axisLabel: {
            interval: 0,
            formatter: formatQuarterTick(tickMinX, tickMaxX, 25)
          }
        }),
        yAxis: FReD.charts.valueAxis({
          name: 'Replication Effect Size (r)',
          nameGap: narrow ? 38 : 44,
          min: axisMinY,
          max: axisMaxY,
          interval: 0.05,
          splitLine: { lineStyle: { color: majorGridColors } },
          axisLabel: {
            interval: 0,
            formatter: formatQuarterTick(tickMinY, tickMaxY, 25)
          }
        }),
        grid: {
          left: narrow ? 26 : 36,
          right: narrow ? 14 : 18,
          top: 12,
          bottom: narrow ? 34 : 30,
          containLabel: true
        }
      }, { width });
    };

    this.container.classList.remove('loading');

    FReD.charts.mount(this.container, {
      title: `Effect size comparison (${criterionLabel})`,
      option: optionFn,
      height: 500,
      aspect: 0.62,
      table: table,
      actionsEl: this.actionsEl,
      disclosureAfterEl: this.rugLegendEl || this.container
    });
  },

  /**
   * Clear the plot
   */
  clear() {
    if (this.container) {
      FReD.charts.unmount(this.container, this.actionsEl);
      this.container.innerHTML = '';
    }
  }
};

window.FReD = FReD;
