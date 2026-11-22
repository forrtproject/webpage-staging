/**
 * FReD Explorer - Scatterplot Chart
 *
 * Interactive scatterplot of original vs replication effect sizes rendered
 * with Apache ECharts (SVG), including x = y line, y = 0 line, and
 * significance rug marks along both axes.
 */

window.FReD = window.FReD || {};
FReD.charts = FReD.charts || {};

FReD.charts.scatterplot = {
  container: null,
  actionsEl: null,
  lastStudies: null,
  lastCriterion: null,

  /**
   * Initialize the scatterplot
   */
  init(containerId) {
    this.container = document.getElementById(containerId);
    this.actionsEl = document.getElementById(containerId + '-actions');
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

    if (validStudies.length === 0) {
      FReD.charts.unmount(this.container, this.actionsEl);
      this.container.style.height = '';
      this.container.innerHTML = '<div class="alert alert-info">No studies with effect size data to display.</div>';
      this.container.classList.remove('loading');
      return;
    }

    // Group studies by outcome
    const groups = {};
    const tableRows = [];

    validStudies.forEach(study => {
      const { outcomeReport } = FReD.successCriteria.getOutcome(study, criterion);
      const outcome = FReD.utils.capFirstLetter(outcomeReport || 'Not calculable');

      if (!groups[outcome]) {
        groups[outcome] = [];
      }
      groups[outcome].push(study);

      tableRows.push([
        study.description || 'No description',
        outcome,
        Number(study.es_o),
        Number(study.es_r),
        study.p_o != null && !isNaN(study.p_o) ? Number(study.p_o) : '',
        study.p_r != null && !isNaN(study.p_r) ? Number(study.p_r) : ''
      ]);
    });

    const outcomeOrder = [
      'Success', 'Successful', 'Successful replication',
      'Success (homogeneous and jointly significantly above 0)',
      'Statistically successful but flawed',
      'Failure (not homogeneous but jointly significantly above 0)',
      'Failure', 'Failed', 'Failed replication', 'Informative failure',
      'Failure (reversal)',
      'Failure (homogeneous but not significant)',
      'Failure (not homogeneous and not significant)',
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
      summary: `Original vs. replication effect sizes for ${validStudies.length.toLocaleString('en-GB')} effects with numeric effect sizes (${criterionLabel}).`
    };

    // Significance rug data (pre-partitioned)
    const bottomRugData = [];
    const leftRugData = [];
    validStudies.forEach(s => {
      if (s.p_o != null && !isNaN(s.p_o)) {
        bottomRugData.push([s.es_o, -0.52, s.p_o < 0.05 ? 1 : 0]);
      }
      if (s.p_r != null && !isNaN(s.p_r)) {
        leftRugData.push([-0.02, s.es_r, s.p_r < 0.05 ? 1 : 0]);
      }
    });

    const pointSize = Math.max(6, Math.round((12 - Math.log10(validStudies.length) * 2) * 10) / 10);

    const optionFn = ({ width }) => {
      const t = FReD.charts.chartTheme();
      const rug = FReD.successCriteria.rugColors;
      const series = [];

      // Outcome scatter series (distinct colour + distinct marker shape)
      sortedOutcomes.forEach((outcome, idx) => {
        const color = FReD.successCriteria.getColor(outcome);
        const symbol = FReD.charts.outcomeSymbol(outcome);
        const pts = groups[outcome].map(study => ({
          value: [study.es_o, study.es_r],
          description: study.description || 'No description',
          outcome: outcome,
          color: color
        }));

        const sObj = {
          name: outcome,
          type: 'scatter',
          symbol: symbol,
          symbolSize: pointSize,
          itemStyle: {
            color: color,
            borderColor: t.paper,
            borderWidth: 1,
            opacity: 0.9
          },
          emphasis: {
            scale: 1.35,
            itemStyle: { opacity: 1 }
          },
          data: pts
        };

        // Attach reference lines (x = y and y = 0) to the first series
        if (idx === 0) {
          sObj.markLine = {
            silent: true,
            symbol: ['none', 'none'],
            animation: false,
            label: { show: false },
            data: [
              [
                { coord: [0, 0], lineStyle: { color: t.rule, type: 'solid', width: 1.5 } },
                { coord: [1, 1] }
              ],
              [
                { coord: [0, 0], lineStyle: { color: t.rule, type: 'dashed', width: 1.5 } },
                { coord: [1, 0] }
              ]
            ]
          };
        }

        series.push(sObj);
      });

      // Bottom rug (original study significance)
      if (bottomRugData.length > 0) {
        series.push({
          name: '_rug_orig',
          type: 'custom',
          silent: true,
          z: 2,
          renderItem: function (params, api) {
            const pt = api.coord([api.value(0), api.value(1)]);
            const isSig = api.value(2) === 1;
            return {
              type: 'line',
              shape: { x1: pt[0], y1: pt[1] - 5, x2: pt[0], y2: pt[1] + 5 },
              style: {
                stroke: isSig ? rug.significant : rug.notSignificant,
                lineWidth: 1.5,
                opacity: 0.75
              }
            };
          },
          data: bottomRugData
        });
      }

      // Left rug (replication study significance)
      if (leftRugData.length > 0) {
        series.push({
          name: '_rug_rep',
          type: 'custom',
          silent: true,
          z: 2,
          renderItem: function (params, api) {
            const pt = api.coord([api.value(0), api.value(1)]);
            const isSig = api.value(2) === 1;
            return {
              type: 'line',
              shape: { x1: pt[0] - 5, y1: pt[1], x2: pt[0] + 5, y2: pt[1] },
              style: {
                stroke: isSig ? rug.significant : rug.notSignificant,
                lineWidth: 1.5,
                opacity: 0.75
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
            FReD.charts.tipRow(d.color || p.color, d.outcome || p.seriesName),
            `r(original) = ${FReD.utils.formatNumber(xVal, 3)}`,
            `r(replication) = ${FReD.utils.formatNumber(yVal, 3)}`
          ]);
        }
      };

      const majorGridColors = ['transparent', t.grid, 'transparent', 'transparent', 'transparent'];

      return FReD.charts.finishOption({
        series: series,
        tooltip: tooltip,
        xAxis: FReD.charts.valueAxis({
          name: 'Original Effect Size (r)',
          nameGap: 32,
          min: -0.05,
          max: 1.05,
          interval: 0.05,
          splitLine: { lineStyle: { color: majorGridColors } },
          axisLabel: {
            interval: 0,
            formatter: v => {
              const r = Math.round(v * 100);
              return (r >= 0 && r <= 100 && r % 25 === 0) ? (r / 100).toFixed(2) : '';
            }
          }
        }),
        yAxis: FReD.charts.valueAxis({
          name: 'Replication Effect Size (r)',
          nameGap: 44,
          min: -0.55,
          max: 1.05,
          interval: 0.05,
          splitLine: { lineStyle: { color: majorGridColors } },
          axisLabel: {
            interval: 0,
            formatter: v => {
              const r = Math.round(v * 100);
              return (r >= -50 && r <= 100 && r % 25 === 0) ? (r / 100).toFixed(2) : '';
            }
          }
        }),
        grid: { left: 40, right: 18, top: 12, bottom: 28, containLabel: true }
      }, { width });
    };

    this.container.classList.remove('loading');

    FReD.charts.mount(this.container, {
      title: `Effect size comparison (${criterionLabel})`,
      option: optionFn,
      height: 500,
      aspect: 0.62,
      table: table,
      actionsEl: this.actionsEl
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
