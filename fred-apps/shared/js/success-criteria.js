/**
 * FReD Static Apps - Success Criteria Definitions
 *
 * Mirrors the R implementation in replication_outcomes.R
 * Note: Client-side calculations are only for reference/validation.
 * The preprocessed JSON should have all outcomes pre-computed.
 */

window.FReD = window.FReD || {};

FReD.successCriteria = {
  // Criterion definitions
  criteria: {
    significance_r: {
      id: 'significance_r',
      label: 'Significance of Replication',
      shortLabel: 'Significance (Rep)',
      hasOSNotSignificant: true,
      note: 'Replication success was assessed based on the statistical significance of the replication effect (using reported p-values) and whether its direction is consistent with the original effect. Replications that were significant and in the same direction as the original were considered as successes, while replications that were not significant or in the opposite direction were considered as failures.',
      hasDynamicReversalNote: true
    },
    significance_agg: {
      id: 'significance_agg',
      label: 'Aggregated Significance',
      shortLabel: 'Aggregated Sig',
      hasOSNotSignificant: false,
      note: 'Replication success was assessed based on the aggregation of effect sizes from the original and replication studies using a meta-analytic approach. Replications where the combined effect was significantly different from zero were considered as successes, while those where the combined effect was not significant were considered as failures.'
    },
    consistency_ci: {
      id: 'consistency_ci',
      label: 'Consistency with CI',
      shortLabel: 'Consistency (CI)',
      hasOSNotSignificant: false,
      note: 'Replication success was assessed based on whether the original effect size fell within the confidence interval of the replication effect size. Replications where the original effect size was within the confidence interval were considered as successes, while those where it was outside were considered as failures.'
    },
    consistency_pi: {
      id: 'consistency_pi',
      label: 'Consistency with PI',
      shortLabel: 'Consistency (PI)',
      hasOSNotSignificant: false,
      note: 'Replication success was assessed based on whether the replication effect size fell within the prediction interval derived from the original study and replication sample size. Replications within the prediction interval were considered as successes, while those outside the prediction interval were considered as failures.'
    },
    homogeneity: {
      id: 'homogeneity',
      label: 'Homogeneity',
      shortLabel: 'Homogeneity',
      hasOSNotSignificant: false,
      note: 'Replication success was assessed based on the homogeneity of the effects from the original and replication studies using a heterogeneity test (Q-test). Replications where the effects were homogeneous were considered as successes, while those that showed heterogeneity were considered as failures.'
    },
    homogeneity_significance: {
      id: 'homogeneity_significance',
      label: 'Homogeneity & Significance',
      shortLabel: 'Homog. & Sig',
      hasOSNotSignificant: true,
      note: 'Replication success was assessed based on the combination of homogeneity and the significance of the effect sizes. Replications where the effects were homogeneous and jointly significantly different from zero were considered as successes, while those that were either not homogeneous or not significantly different from zero were considered as failures.'
    },
    small_telescopes: {
      id: 'small_telescopes',
      label: 'Small Telescopes',
      shortLabel: 'Small Telescopes',
      hasOSNotSignificant: false,
      note: 'Replication success was assessed based on whether the replication effect size was larger than the effect size that would have given the original study a power of 33%. Replications that met this criterion were considered as successes, while those that did not were considered as failures.'
    },
    reported_success: {
      id: 'reported_success',
      label: 'Reported Success',
      shortLabel: 'Reported',
      hasOSNotSignificant: false,
      note: 'Replication success was assessed based on how the replication authors described their results, as coded in the FReD database. Where this coding is missing, the calculated outcome stored in the database is used instead.'
    }
  },

  // Outcome -> chart series design token (CSS custom property in shared/css/theme.css).
  // Uses the flora-explorer --color-chart-* palette, resolved at render time so every
  // chart follows the active light/dark theme.
  colorTokens: {
    // Common outcomes
    'success': '--color-chart-successful',
    'Success': '--color-chart-successful',
    'successful replication': '--color-chart-successful',
    'Successful replication': '--color-chart-successful',
    'failure': '--color-chart-failed',
    'Failure': '--color-chart-failed',
    'failed replication': '--color-chart-failed',
    'Failed replication': '--color-chart-failed',
    'failure (reversal)': '--color-chart-technical-failure',
    'Failure (reversal)': '--color-chart-technical-failure',
    'OS not significant': '--color-chart-uninformative',
    'os not significant': '--color-chart-uninformative',
    'Not calculable': '--color-chart-not-coded',
    'not calculable': '--color-chart-not-coded',
    'not coded': '--color-chart-not-coded',
    'Not coded': '--color-chart-not-coded',

    // Reported success outcomes (from FReD/FLoRA)
    'successful': '--color-chart-successful',
    'Successful': '--color-chart-successful',
    'failed': '--color-chart-failed',
    'Failed': '--color-chart-failed',
    'mixed': '--color-chart-mixed',
    'Mixed': '--color-chart-mixed',
    'informative failure': '--color-chart-failed',
    'Informative failure': '--color-chart-failed',
    'uninformative': '--color-chart-uninformative',
    'Uninformative': '--color-chart-uninformative',
    'descriptive only': '--color-chart-descriptive',
    'Descriptive only': '--color-chart-descriptive',
    'statistically successful but flawed': '--color-chart-qualified',
    'Statistically successful but flawed': '--color-chart-qualified',

    // Homogeneity & significance specific
    'success (homogeneous and jointly significantly above 0)': '--color-chart-successful',
    'Success (homogeneous and jointly significantly above 0)': '--color-chart-successful',
    'failure (not homogeneous but jointly significantly above 0)': '--color-chart-failure-partial',
    'Failure (not homogeneous but jointly significantly above 0)': '--color-chart-failure-partial',
    'failure (not homogeneous and not significant)': '--color-chart-technical-failure',
    'Failure (not homogeneous and not significant)': '--color-chart-technical-failure',
    'failure (homogeneous but not significant)': '--color-chart-failed',
    'Failure (homogeneous but not significant)': '--color-chart-failed'
  },

  // Rug plot colors (significance indicators)
  rugColorTokens: {
    significant: '--sig-yes',
    notSignificant: '--sig-no'
  },

  _resolved: null,
  _resolvedTheme: null,

  _resolve(map) {
    const out = {};
    const style = getComputedStyle(document.documentElement);
    Object.keys(map).forEach(key => {
      const token = map[key];
      out[key] = style.getPropertyValue(token).trim();
    });
    return out;
  },

  _refresh() {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    if (!this._resolved || this._resolvedTheme !== theme) {
      this._resolved = {
        colors: this._resolve(this.colorTokens),
        rug: this._resolve(this.rugColorTokens)
      };
      this._resolvedTheme = theme;
    }
    return this._resolved;
  },

  /** Outcome label -> colour for the active theme */
  get colors() {
    return this._refresh().colors;
  },

  /** Significance rug colours for the active theme */
  get rugColors() {
    return this._refresh().rug;
  },

  /**
   * Get color for an outcome label (case-insensitive)
   */
  getColor(outcome) {
    const colors = this.colors;
    if (!outcome) return colors['Not calculable'];
    if (colors[outcome]) return colors[outcome];
    const lower = String(outcome).toLowerCase();
    return colors[lower] || colors['Not calculable'];
  },

  /**
   * Get colors for a specific criterion
   */
  getColorsForCriterion(criterionId) {
    const criterion = this.criteria[criterionId];
    if (!criterion) return {};

    const colors = {
      'success': this.colors['success'],
      'Success': this.colors['Success'],
      'failure': this.colors['failure'],
      'Failure': this.colors['Failure'],
      'Not calculable': this.colors['Not calculable']
    };

    // Add criterion-specific colors
    if (criterion.hasOSNotSignificant) {
      colors['OS not significant'] = this.colors['OS not significant'];
    }

    if (criterionId === 'significance_r' || criterionId === 'significance_agg') {
      colors['failure (reversal)'] = this.colors['failure (reversal)'];
      colors['Failure (reversal)'] = this.colors['Failure (reversal)'];
    }

    if (criterionId === 'homogeneity_significance') {
      Object.assign(colors, {
        'success (homogeneous and jointly significantly above 0)': this.colors['success (homogeneous and jointly significantly above 0)'],
        'Success (homogeneous and jointly significantly above 0)': this.colors['Success (homogeneous and jointly significantly above 0)'],
        'failure (not homogeneous but jointly significantly above 0)': this.colors['failure (not homogeneous but jointly significantly above 0)'],
        'Failure (not homogeneous but jointly significantly above 0)': this.colors['Failure (not homogeneous but jointly significantly above 0)'],
        'failure (not homogeneous and not significant)': this.colors['failure (not homogeneous and not significant)'],
        'Failure (not homogeneous and not significant)': this.colors['Failure (not homogeneous and not significant)'],
        'failure (homogeneous but not significant)': this.colors['failure (homogeneous but not significant)'],
        'Failure (homogeneous but not significant)': this.colors['Failure (homogeneous but not significant)']
      });
    }

    // Add reported success colors
    if (criterionId === 'reported_success') {
      Object.assign(colors, {
        'successful': this.colors['successful'],
        'Successful': this.colors['Successful'],
        'failed': this.colors['failed'],
        'Failed': this.colors['Failed'],
        'mixed': this.colors['mixed'],
        'Mixed': this.colors['Mixed'],
        'informative failure': this.colors['informative failure'],
        'Informative failure': this.colors['Informative failure'],
        'uninformative': this.colors['uninformative'],
        'Uninformative': this.colors['Uninformative'],
        'descriptive only': this.colors['descriptive only'],
        'Descriptive only': this.colors['Descriptive only'],
        'statistically successful but flawed': this.colors['statistically successful but flawed'],
        'Statistically successful but flawed': this.colors['Statistically successful but flawed']
      });
    }

    return colors;
  },

  /**
   * Get outcome for a study based on pre-computed data
   */
  getOutcome(study, criterionId) {
    if (!study || !study.outcomes) {
      return { outcome: 'Not calculable', outcomeReport: 'Not calculable', color: this.colors['Not calculable'] };
    }

    // Special case for reported_success
    if (criterionId === 'reported_success') {
      const result = study.reported_success || study.result || 'Not calculable';
      return {
        outcome: result,
        outcomeReport: result,
        color: this.getColor(result)
      };
    }

    const outcomeData = study.outcomes[criterionId];
    if (!outcomeData) {
      return { outcome: 'Not calculable', outcomeReport: 'Not calculable', color: this.colors['Not calculable'] };
    }

    return {
      outcome: outcomeData.outcome || 'Not calculable',
      outcomeReport: outcomeData.outcome_report || outcomeData.outcome || 'Not calculable',
      color: this.getColor(outcomeData.outcome_report || outcomeData.outcome)
    };
  },

  /**
   * Calculate p-value from r and N (for reference)
   */
  pFromR(r, n) {
    if (r === null || n === null || isNaN(r) || isNaN(n) || n <= 2) return null;
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    // Two-tailed p-value using approximation
    const df = n - 2;
    const x = df / (df + t * t);
    // Incomplete beta approximation (simplified)
    const p = this._betaInc(df / 2, 0.5, x);
    return p;
  },

  /**
   * Incomplete beta function approximation
   */
  _betaInc(a, b, x) {
    // Simplified approximation for p-value calculation
    // For production use, consider a more robust implementation
    if (x === 0) return 0;
    if (x === 1) return 1;
    // Use normal approximation for large df
    if (a > 100) {
      const z = Math.sqrt(2 * a) * (Math.pow(x / (1 - x), 1/3) * (1 - 1/(9*a)) - (1 - 1/(9*b)));
      return 1 - this._normalCDF(Math.abs(z)) * 2;
    }
    // Fallback
    return 0.05; // Default fallback
  },

  /**
   * Normal CDF approximation
   */
  _normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  },

  /**
   * Get all available criteria as array
   */
  getCriteriaList() {
    return Object.values(this.criteria);
  },

  /**
   * Get criterion by ID
   */
  getCriterion(id) {
    return this.criteria[id] || null;
  },

  /**
   * Check if a study's direction is assessable
   * (has directional effect type and both effect sizes)
   */
  isDirectionAssessable(study) {
    return study && study.direction_assessable === true;
  },

  /**
   * Count successes where direction cannot be assessed
   * (these could potentially be reversals that we can't detect)
   * @param {Array} studies - Array of study objects
   * @param {string} criterionId - The criterion to check (only relevant for significance_r)
   * @returns {Object} { successCount, nonAssessableCount }
   */
  countNonAssessableSuccesses(studies, criterionId) {
    if (criterionId !== 'significance_r') {
      return { successCount: 0, nonAssessableCount: 0 };
    }

    let successCount = 0;
    let nonAssessableCount = 0;

    studies.forEach(study => {
      const { outcome } = this.getOutcome(study, criterionId);
      // Check for success (case-insensitive)
      if (outcome && outcome.toLowerCase() === 'success') {
        successCount++;
        // If direction is not assessable, we can't distinguish from reversal
        if (!this.isDirectionAssessable(study)) {
          nonAssessableCount++;
        }
      }
    });

    return { successCount, nonAssessableCount };
  }
};

window.FReD = FReD;
