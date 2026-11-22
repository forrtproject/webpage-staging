/**
 * FReD Explorer - Bar Chart (Outcome Distribution)
 *
 * One-row horizontal proportion bar rendered with Apache ECharts (SVG),
 * following the flora-explorer shared chart setup.
 */

window.FReD = window.FReD || {};
FReD.charts = FReD.charts || {};

FReD.charts.barchart = {
  container: null,
  countSpan: null,
  actionsEl: null,
  lastStudies: null,
  lastCriterion: null,

  /**
   * Initialize the bar chart
   */
  init(containerId) {
    this.container = document.getElementById(containerId);
    this.countSpan = document.getElementById('outcome-count');
    this.actionsEl = document.getElementById(containerId + '-actions');
    if (!this.container) {
      console.error('Barchart container not found:', containerId);
    }
  },

  /**
   * Render the bar chart with given data
   */
  render(studies, criterion) {
    if (!this.container) return;

    this.lastStudies = studies;
    this.lastCriterion = criterion;

    const total = studies.length;
    if (this.countSpan) {
      this.countSpan.textContent = `(${total.toLocaleString('en-GB')} effects)`;
    }

    if (total === 0) {
      FReD.charts.unmount(this.container, this.actionsEl);
      this.container.classList.add('is-empty');
      this.container.style.height = '';
      this.container.innerHTML = '<div class="alert alert-info">No studies selected.</div>';
      return;
    }

    this.container.classList.remove('is-empty');

    // Count outcomes
    const counts = {};
    studies.forEach(study => {
      const { outcomeReport } = FReD.successCriteria.getOutcome(study, criterion);
      const outcome = FReD.utils.capFirstLetter(outcomeReport || 'Not calculable');
      counts[outcome] = (counts[outcome] || 0) + 1;
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

    const outcomes = Object.keys(counts).sort((a, b) => {
      const aIdx = outcomeOrder.findIndex(o => a.toLowerCase() === o.toLowerCase());
      const bIdx = outcomeOrder.findIndex(o => b.toLowerCase() === o.toLowerCase());
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

    const criterionInfo = FReD.successCriteria.getCriterion(criterion);
    const criterionLabel = criterionInfo ? criterionInfo.label : criterion;

    const rows = outcomes.map(outcome => {
      const count = counts[outcome];
      const pct = Number(((100 * count) / total).toFixed(1));
      return [outcome, count, pct];
    });

    const table = {
      headers: ['Outcome', 'Effects', 'Percentage (%)'],
      rows: rows,
      summary: `Outcome distribution across ${total.toLocaleString('en-GB')} selected effects (${criterionLabel}).`
    };

    const optionFn = ({ width }) => {
      const t = FReD.charts.chartTheme();
      const seriesValues = outcomes.map(outcome => [counts[outcome]]);
      const corners = FReD.charts.stackCorners(seriesValues, true, 5);
      const seriesColors = outcomes.map(outcome => FReD.successCriteria.getColor(outcome));

      const series = outcomes.map((outcome, si) => {
        const count = counts[outcome];
        const proportion = count / total;
        const pctText = FReD.charts.formatPercent(count, total, 1) + '%';
        const color = seriesColors[si];

        // Compute actual available pixel width in this bar segment so labels NEVER overflow or collide
        const segPx = width * proportion;
        const fullText = `${outcome}: ${pctText}`;
        const fullNeededPx = fullText.length * 7.6 + 18;
        const pctNeededPx = pctText.length * 7.8 + 14;
        let labelText = '';
        if (segPx >= fullNeededPx) {
          labelText = fullText;
        } else if (segPx >= pctNeededPx) {
          labelText = pctText;
        }

        return {
          name: outcome,
          type: 'bar',
          stack: 'total',
          barWidth: 22,
          itemStyle: {
            color: color,
            borderColor: t.paper,
            borderWidth: 1
          },
          emphasis: { focus: 'none' },
          label: {
            show: labelText.length > 0,
            position: 'inside',
            color: FReD.charts.labelColor(color),
            fontSize: 12,
            fontWeight: 600,
            fontFamily: t.fontFamily,
            formatter: () => labelText
          },
          data: [{
            value: count,
            itemStyle: { borderRadius: corners(si, 0) }
          }]
        };
      });

      const tooltip = {
        trigger: 'axis',
        axisPointer: { type: 'none' },
        formatter: ps => {
          const lines = [`<strong>Outcome Distribution</strong> \u00b7 N=${FReD.charts.formatNumber(total, 0)}`];
          ps.forEach(p => {
            const c = counts[p.seriesName] || 0;
            if (c > 0) {
              lines.push(FReD.charts.tipRow(
                seriesColors[p.seriesIndex],
                `${p.seriesName}: ${FReD.charts.formatNumber(c, 0)} (${FReD.charts.formatPercent(c, total, 1)}%)`
              ));
            }
          });
          return FReD.charts.tipLines(lines);
        }
      };

      return FReD.charts.finishOption({
        series: series,
        tooltip: tooltip,
        xAxis: { type: 'value', show: false, min: 0, max: Math.max(total, 1) },
        yAxis: { type: 'category', show: false, data: ['Outcomes'] },
        grid: { left: 0, right: 0, top: 6, bottom: 2, height: 28, containLabel: false }
      }, { width });
    };

    FReD.charts.mount(this.container, {
      title: `Outcome distribution (${criterionLabel})`,
      option: optionFn,
      heightFor: width => {
        const scale = FReD.charts.textScale();
        const rowsCount = FReD.charts.legendRows(outcomes, width, scale);
        return Math.round(rowsCount * 24 * scale + 50);
      },
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
    if (this.countSpan) {
      this.countSpan.textContent = '';
    }
  }
};

window.FReD = FReD;
