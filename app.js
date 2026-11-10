const defaults = {
  calculationMode: "projection",
  initialAmount: 100000,
  years: 20,
  contributionAmount: 2000,
  contributionFrequency: "monthly",
  annualRate: 8,
  contributionTiming: "start",
  scenarioSpread: 2,
  chartMode: "breakdown",
  targetAmount: 3000000,
  inflationRate: 2.5,
  backtestDataset: "sp500",
  backtestStartYear: "2010",
  backtestPrecision: "monthly",
  backtestStartMonth: "",
  backtestEndMonth: "",
  targetBasis: "nominal",
  showTargetLine: true,
};

const currencyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const compactNumberFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const state = {
  inputs: { ...defaults },
  projection: null,
  goalAnalysis: null,
  hiddenSeries: {
    breakdown: new Set(),
    comparison: new Set(),
  },
  chartGeometry: null,
  monthlyData: {},
  dataMessage: "正在检查月度行情…",
  focusIndex: 0,
};

const elements = {
  form: document.getElementById("calculator-form"),
  resetButton: document.getElementById("reset-button"),
  exportButton: document.getElementById("exportButton"),
  chartSvg: document.getElementById("projectionChart"),
  chartSurface: document.getElementById("chartSurface"),
  chartTooltip: document.getElementById("chartTooltip"),
  chartLegend: document.getElementById("chartLegend"),
  chartModeHint: document.getElementById("chartModeHint"),
  chartComparisonButton: document.getElementById("chartComparisonButton"),
  yearlyTableBody: document.getElementById("yearlyTableBody"),
  scenarioStrip: document.getElementById("scenarioStrip"),
  assumptionTitle: document.getElementById("assumptionTitle"),
  assumptionList: document.getElementById("assumptionList"),
  insightsGrid: document.getElementById("insightsGrid"),
  backtestRangeHint: document.getElementById("backtestRangeHint"),
  metricFinalValue: document.getElementById("metricFinalValue"),
  metricFinalCaption: document.getElementById("metricFinalCaption"),
  metricPrincipal: document.getElementById("metricPrincipal"),
  metricProfit: document.getElementById("metricProfit"),
  metricReturnRate: document.getElementById("metricReturnRate"),
  metricPrincipalCaption: document.getElementById("metricPrincipalCaption"),
  metricProfitCaption: document.getElementById("metricProfitCaption"),
  metricReturnCaption: document.getElementById("metricReturnCaption"),
  metricRealValue: document.getElementById("metricRealValue"),
  metricRealCaption: document.getElementById("metricRealCaption"),
  metricInflationDrag: document.getElementById("metricInflationDrag"),
  metricInflationCaption: document.getElementById("metricInflationCaption"),
  goalTargetValue: document.getElementById("goalTargetValue"),
  goalTargetCaption: document.getElementById("goalTargetCaption"),
  goalRequiredContribution: document.getElementById("goalRequiredContribution"),
  goalRequiredCaption: document.getElementById("goalRequiredCaption"),
  goalContributionGap: document.getElementById("goalContributionGap"),
  goalGapCaption: document.getElementById("goalGapCaption"),
  goalHitTime: document.getElementById("goalHitTime"),
  goalHitCaption: document.getElementById("goalHitCaption"),
  goalMilestones: document.getElementById("goalMilestones"),
  goalSummaryText: document.getElementById("goalSummaryText"),
  calculationMode: document.getElementById("calculationMode"),
  initialAmount: document.getElementById("initialAmount"),
  years: document.getElementById("years"),
  contributionAmount: document.getElementById("contributionAmount"),
  contributionFrequency: document.getElementById("contributionFrequency"),
  annualRate: document.getElementById("annualRate"),
  contributionTiming: document.getElementById("contributionTiming"),
  scenarioSpread: document.getElementById("scenarioSpread"),
  chartMode: document.getElementById("chartMode"),
  targetAmount: document.getElementById("targetAmount"),
  inflationRate: document.getElementById("inflationRate"),
  backtestDataset: document.getElementById("backtestDataset"),
  backtestStartYear: document.getElementById("backtestStartYear"),
};

for (const id of ['backtestPrecision', 'backtestStartMonth', 'backtestEndMonth', 'targetBasis', 'showTargetLine', 'dataStatus', 'refreshData', 'monthlyRange', 'annualRange', 'formStatus', 'savePlan', 'sharePlan', 'planList', 'planStatus']) {
  elements[id] = document.getElementById(id);
}

const tones = {
  conservative: {
    color: "#194f90",
    fill: "rgba(25, 79, 144, 0.14)",
  },
  base: {
    color: "#0e7c86",
    fill: "rgba(14, 124, 134, 0.16)",
  },
  optimistic: {
    color: "#c6922a",
    fill: "rgba(198, 146, 42, 0.16)",
  },
  principal: {
    color: "#194f90",
    fill: "rgba(25, 79, 144, 0.12)",
  },
  total: {
    color: "#0e7c86",
    fill: "rgba(14, 124, 134, 0.12)",
  },
  benchmark: {
    color: "#5d7085",
    fill: "rgba(93, 112, 133, 0.12)",
  },
  real: {
    color: "#6d4fc2",
    fill: "rgba(109, 79, 194, 0.12)",
  },
  profitPositive: {
    color: "#c6922a",
    fill: "rgba(198, 146, 42, 0.16)",
  },
  profitNegative: {
    color: "#b64545",
    fill: "rgba(182, 69, 69, 0.14)",
  },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCurrency(value) {
  return currencyFormatter.format(value);
}

function formatSignedCurrency(value) {
  if (value === 0) {
    return formatCurrency(0);
  }

  return `${value > 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}

function formatCompactCurrency(value) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute < 10000) {
    return `${sign}${formatCurrency(absolute)}`;
  }
  return `${sign}¥${compactNumberFormatter.format(absolute)}`;
}

function formatPercent(ratio) {
  if (!Number.isFinite(ratio)) {
    return "0.0%";
  }
  return percentFormatter.format(ratio);
}

function safeRatio(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return numerator / denominator;
}

function getDataset(key) {
  return HISTORICAL_DATASETS[key] || HISTORICAL_DATASETS[defaults.backtestDataset];
}

function getContributionCadence(inputs) {
  return inputs.contributionFrequency === "monthly" ? "每月" : "每年";
}

function getContributionCadenceLabel(inputs) {
  return inputs.contributionFrequency === "monthly" ? "月度定投" : "年度定投";
}

function getRowLabel(row, index) {
  if (row.calendarYear) {
    return String(row.calendarYear);
  }
  return index === 0 ? "起点" : `${index}年`;
}

function simulateAnnualSeries(inputs, annualRates, yearLabels = []) {
  return InvestmentEngine.simulateAnnualSeries(inputs, annualRates, yearLabels);
}

function activeMonthlyData() {
  return elements.backtestPrecision.value === 'monthly' ? state.monthlyData[elements.backtestDataset.value] : null;
}

function getBacktestSlice(inputs) {
  const monthlyData = inputs.backtestPrecision === 'monthly' && state.monthlyData[inputs.backtestDataset];
  if (monthlyData) {
    const periods = InvestmentEngine.monthlySlice(monthlyData, inputs.backtestStartMonth, inputs.backtestEndMonth);
    const years = periods.length / 12;
    return { dataset: getDataset(inputs.backtestDataset), datasetKey: inputs.backtestDataset,
      periods, monthly: true, startYear: periods[0].date, endYear: periods.at(-1).date,
      effectiveYears: years, updatedAt: monthlyData.updatedAt, source: monthlyData.source,
      annualRates: [], yearLabels: [] };
  }
  const dataset = getDataset(inputs.backtestDataset);
  const requestedStartYear = Number(inputs.backtestStartYear);
  const fallbackStartYear = dataset.years[0];
  const startYear = dataset.years.includes(requestedStartYear) ? requestedStartYear : fallbackStartYear;
  const startIndex = Math.max(0, dataset.years.indexOf(startYear));
  const effectiveYears = Math.min(inputs.years, dataset.years.length - startIndex);

  return {
    dataset,
    datasetKey: inputs.backtestDataset,
    yearLabels: dataset.years.slice(startIndex, startIndex + effectiveYears),
    annualRates: dataset.returns.slice(startIndex, startIndex + effectiveYears),
    startYear: dataset.years[startIndex],
    endYear: dataset.years[startIndex + effectiveYears - 1],
    effectiveYears,
  };
}

function calculateBaseSimulation(inputs, contributionAmount = inputs.contributionAmount) {
  const nextInputs = { ...inputs, contributionAmount };

  if (inputs.calculationMode === "backtest") {
    const slice = getBacktestSlice(nextInputs);
    return {
      ...(slice.monthly ? InvestmentEngine.simulateMonths(nextInputs, slice.periods) : simulateAnnualSeries(nextInputs, slice.annualRates, slice.yearLabels)),
      meta: slice,
    };
  }

  const baseRate = nextInputs.annualRate / 100;
  return {
    ...simulateAnnualSeries(nextInputs, new Array(nextInputs.years).fill(baseRate)),
    meta: {
      annualRate: baseRate,
    },
  };
}

function calculateProjection(inputs) {
  if (inputs.calculationMode === "backtest") {
    const slice = getBacktestSlice(inputs);
    const base = slice.monthly ? InvestmentEngine.simulateMonths(inputs, slice.periods) : simulateAnnualSeries(inputs, slice.annualRates, slice.yearLabels);

    return {
      mode: "backtest",
      base,
      scenarios: [],
      backtest: {
        ...slice,
        label: slice.dataset.label,
        shortLabel: slice.dataset.shortLabel,
        averageAnnualReturn: base.averageAnnualReturn,
        benchmarkCagr: base.benchmarkCagr,
        bestPeriod: base.bestPeriod,
        worstPeriod: base.worstPeriod,
        negativeYearsCount: base.negativeYearsCount,
      },
    };
  }

  const baseRate = inputs.annualRate / 100;
  const spread = inputs.scenarioSpread / 100;
  const scenarioDefinitions = [
    {
      key: "conservative",
      label: "保守情景",
      shortLabel: "保守",
      rate: clamp(baseRate - spread, -0.99, 5),
    },
    {
      key: "base",
      label: "基准情景",
      shortLabel: "基准",
      rate: clamp(baseRate, -0.99, 5),
    },
    {
      key: "optimistic",
      label: "乐观情景",
      shortLabel: "乐观",
      rate: clamp(baseRate + spread, -0.99, 5),
    },
  ];

  const scenarios = scenarioDefinitions.map((scenario) => ({
    ...scenario,
    simulation: simulateAnnualSeries(inputs, new Array(inputs.years).fill(scenario.rate)),
  }));

  return {
    mode: "projection",
    scenarios,
    base: scenarios.find((scenario) => scenario.key === "base").simulation,
  };
}


function getPlanningHorizon(inputs) {
  if (inputs.calculationMode === "backtest" && inputs.backtestPrecision === "monthly" && state.monthlyData[inputs.backtestDataset]) return inputs.years;
  if (inputs.calculationMode === "backtest") {
    const dataset = getDataset(inputs.backtestDataset);
    const requestedStartYear = Number(inputs.backtestStartYear);
    const startYear = dataset.years.includes(requestedStartYear) ? requestedStartYear : dataset.years[0];
    const startIndex = Math.max(0, dataset.years.indexOf(startYear));
    return dataset.years.length - startIndex;
  }

  return 50;
}

function findTargetHitRow(rows, targetAmount, inputs = state.inputs) {
  if (targetAmount <= 0) {
    return rows[0] || null;
  }

  return rows.find((row) => (inputs.targetBasis === "real" ? row.realEndBalance : row.endBalance) >= targetAmount) || null;
}

function formatGoalTime(row) {
  if (!row) {
    return "未达标";
  }

  if (row.year === 0) {
    return "起点已达标";
  }

  return row.calendarYear ? `${row.calendarYear}` : row.months % 12 === 0 ? `第 ${row.months / 12} 年` : `第 ${row.months} 个月`;
}

function buildExtendedGoalRows(inputs, projection) {
  const maxYears = getPlanningHorizon(inputs);
  const currentYears = projection.base.finalRow.year;

  if (maxYears <= currentYears) {
    return null;
  }

  const simulation = calculateBaseSimulation({ ...inputs, years: maxYears });
  return simulation.monthlyRows || simulation.rows;
}

function buildGoalMilestones(targetAmount, currentRows, extendedRows = []) {
  if (targetAmount <= 0) {
    return [];
  }

  const finalCurrentYear = currentRows[currentRows.length - 1]?.year ?? 0;
  const lookupRows = extendedRows.length ? extendedRows : currentRows;

  return [0.25, 0.5, 0.75, 1].map((ratio) => {
    const amount = targetAmount * ratio;
    const hitRow = findTargetHitRow(lookupRows, amount);
    let status = "missing";

    if (hitRow) {
      status = hitRow.year <= finalCurrentYear ? "current" : "extended";
    }

    return {
      ratio,
      amount,
      hitRow,
      status,
      label: `${Math.round(ratio * 100)}%`,
    };
  });
}

function solveRequiredContribution(inputs, projection) {
  const targetAmount = Math.max(0, inputs.targetAmount);
  const currentFinalBalance = inputs.targetBasis === "real" ? projection.base.finalRow.realEndBalance : projection.base.finalRow.endBalance;
  const currentContribution = inputs.contributionAmount;
  const cadence = getContributionCadence(inputs);
  const targetContext = inputs.calculationMode === "backtest"
    ? `${projection.backtest.label} ${projection.backtest.startYear}-${projection.backtest.endYear} 的历史路径`
    : `${formatPercent(inputs.annualRate / 100)} 固定年化假设`;

  const simulate = amount => {
    const result = calculateBaseSimulation(inputs, amount);
    if (inputs.targetBasis === 'real') result.finalRow = { ...result.finalRow, endBalance: result.finalRow.realEndBalance };
    return result;
  };
  const solution = InvestmentEngine.solveContribution(simulate, targetAmount);
  const requiredContribution = solution.amount;

  const contributionGap = requiredContribution === null ? null : requiredContribution - currentContribution;
  const targetGap = currentFinalBalance - targetAmount;
  const status = targetGap >= 0 ? "ahead" : "shortfall";
  const currentRows = projection.base.monthlyRows || projection.base.rows;
  const goalHitRow = findTargetHitRow(currentRows, targetAmount);
  const extendedRows = goalHitRow ? [] : buildExtendedGoalRows(inputs, projection) || [];
  const extendedGoalHitRow = goalHitRow ? null : findTargetHitRow(extendedRows, targetAmount);
  const goalHitStatus = goalHitRow ? "current" : extendedGoalHitRow ? "extended" : "missing";
  const milestones = buildGoalMilestones(targetAmount, currentRows, extendedRows);

  let goalHitCaption = "当前期限内尚未达到目标";
  if (goalHitStatus === "current") {
    goalHitCaption = goalHitRow.year === 0 ? "初始本金已达到目标" : "按当前计划首次超过目标";
  } else if (goalHitStatus === "extended") {
    const maxYears = getPlanningHorizon(inputs);
    goalHitCaption = `当前 ${projection.base.finalRow.year} 年内未达标，延长测算至 ${maxYears} 年可达标`;
  }

  let summary;
  const goalTimeText = formatGoalTime(goalHitRow || extendedGoalHitRow);
  if (!solution.supported) {
    summary = "目标超出支持的单次定投上限（1 万亿元），请调整目标或期限；未返回可达标金额。";
  } else if (targetAmount === 0) {
    summary = "当前目标为 0 元，因此无需额外定投即可达标。";
  } else if (status === "ahead" && requiredContribution === 0) {
    summary = `在 ${targetContext} 下，仅凭初始本金就有机会达到 ${formatCurrency(targetAmount)}，当前计划的结果将高于目标 ${formatCurrency(Math.abs(targetGap))}。`;
  } else if (status === "ahead") {
    summary = `按 ${targetContext} 测算，你当前的 ${cadence} 定投计划有望在 ${goalTimeText} 达到目标，并在期末超过目标 ${formatCurrency(Math.abs(targetGap))}；理论上把单次定投调到 ${formatCurrency(requiredContribution)} 仍可达标。`;
  } else if (extendedGoalHitRow) {
    summary = `按 ${targetContext} 测算，当前期限内距离目标还差 ${formatCurrency(Math.abs(targetGap))}；若保持当前 ${cadence} 定投节奏并延长期限，预计可在 ${goalTimeText} 达到目标。`;
  } else {
    summary = `按 ${targetContext} 测算，你距离目标还差 ${formatCurrency(Math.abs(targetGap))}；若想在当前期限内达标，需要把 ${cadence} 定投提高到 ${formatCurrency(requiredContribution)}。`;
  }

  return {
    targetAmount,
    currentContribution,
    currentFinalBalance,
    requiredContribution,
    supported: solution.supported,
    contributionGap,
    targetGap,
    status,
    cadence,
    targetContext,
    goalHitRow,
    extendedGoalHitRow,
    goalHitStatus,
    goalHitCaption,
    milestones,
    summary: inputs.calculationMode === "backtest" ? summary.replaceAll("预计", "历史模拟").replaceAll("有望", "按样本").replaceAll("若保持", "仅在历史样本内延长；保持") : summary,
  };
}

function findCompoundingTakeoverYear(rows) {
  return rows.slice(1).find((row) => row.annualInterest > row.annualContribution) || null;
}

function generateInsights(inputs, projection, goalAnalysis) {
  const rows = projection.base.rows;
  const finalRow = projection.base.finalRow;
  const takeoverRow = findCompoundingTakeoverYear(rows);
  const finalProfitShare = safeRatio(finalRow.cumulativeProfit, finalRow.endBalance);
  const finalPrincipalShare = safeRatio(finalRow.cumulativePrincipal, finalRow.endBalance);
  const lateStageStartIndex = clamp(Math.ceil(rows.length * (2 / 3)), 1, rows.length - 1);
  const lateStageProfit = finalRow.cumulativeProfit - rows[lateStageStartIndex - 1].cumulativeProfit;
  const lateStageShare = finalRow.cumulativeProfit > 0 ? safeRatio(lateStageProfit, finalRow.cumulativeProfit) : 0;
  const purchasingPowerDragRatio = safeRatio(finalRow.purchasingPowerDrag, finalRow.endBalance);

  const insights = [
    {
      title: "目标达成度",
      metric: formatSignedCurrency(goalAnalysis.targetGap),
      tone: goalAnalysis.status === "ahead" ? "positive" : "warning",
      body: !goalAnalysis.supported ? "目标超出支持范围，请调整目标或期限。" :
        goalAnalysis.status === "ahead"
          ? `当前计划预计高出目标 ${formatCurrency(Math.abs(goalAnalysis.targetGap))}，如果只想刚好达标，可把单次定投下调到 ${formatCurrency(goalAnalysis.requiredContribution)}。`
          : `当前计划预计仍差 ${formatCurrency(Math.abs(goalAnalysis.targetGap))}，要达标需要把单次定投提高到 ${formatCurrency(goalAnalysis.requiredContribution)}。`,
    },
    {
      title: "达标时间",
      metric: formatGoalTime(goalAnalysis.goalHitRow || goalAnalysis.extendedGoalHitRow),
      tone: goalAnalysis.goalHitStatus === "missing" ? "warning" : "positive",
      body: goalAnalysis.goalHitStatus === "current"
        ? `当前计划预计在 ${formatGoalTime(goalAnalysis.goalHitRow)} 首次达到目标 ${formatCurrency(goalAnalysis.targetAmount)}。`
        : goalAnalysis.goalHitStatus === "extended"
          ? `当前期限内暂未达标，但保持投入节奏并延长期限，预计在 ${formatGoalTime(goalAnalysis.extendedGoalHitRow)} 达标。`
          : `在可测算期限内尚未达到目标 ${formatCurrency(goalAnalysis.targetAmount)}，需要提高投入、延长期限或调整收益假设。`,
    },
    {
      title: "复利接棒年份",
      metric: takeoverRow ? (takeoverRow.calendarYear ? `${takeoverRow.calendarYear}` : `第 ${takeoverRow.year} 年`) : "尚未出现",
      tone: takeoverRow ? "positive" : "neutral",
      body: takeoverRow
        ? `这一年首次出现本年收益 ${formatCurrency(takeoverRow.annualInterest)} 已经超过本年投入 ${formatCurrency(takeoverRow.annualContribution)}；这不代表以后每年都会超过投入。`
        : inputs.contributionAmount === 0 ? "当前未设置追加投入；资产变化来自初始本金的投资损益。" : "在当前期限内，本年收益尚未超过当年投入。",
    },
    {
      title: "收益结构",
      metric: formatPercent(finalProfitShare),
      tone: finalProfitShare >= 0.45 ? "positive" : "neutral",
      body: finalRow.cumulativeProfit < 0 ? `累计亏损 ${formatCurrency(-finalRow.cumulativeProfit)}，相当于累计投入的 ${formatPercent(-finalRow.cumulativeReturn)}。` : `最终资产中约 ${formatPercent(finalProfitShare)} 来自收益，约 ${formatPercent(finalPrincipalShare)} 来自累计本金。`,
    },
    {
      title: "真实购买力",
      metric: formatCurrency(finalRow.realEndBalance),
      tone: finalRow.realCumulativeProfit >= 0 ? "positive" : "warning",
      body: `按 ${formatPercent(inputs.inflationRate / 100)} 年通胀折现后，名义终值约相当于今天的 ${formatCurrency(finalRow.realEndBalance)}，购买力折损约 ${formatPercent(purchasingPowerDragRatio)}。`,
    },
  ];

  if (projection.mode === "backtest") {
    const { bestPeriod, worstPeriod, negativeYearsCount, label } = projection.backtest;
    insights.push({
      title: "历史样本特征",
      metric: worstPeriod ? `${worstPeriod.label} ${formatPercent(worstPeriod.rate)}` : "样本不足",
      tone: "neutral",
      body: bestPeriod
        ? `${label} 这段样本中共有 ${negativeYearsCount} 个下跌区间，最佳区间是 ${bestPeriod.label} 的 ${formatPercent(bestPeriod.rate)}。`
        : "当前历史样本不足，无法提炼出强弱年份特征。",
    });
  } else {
    insights.push({
      title: "后程加速",
      metric: formatPercent(lateStageShare),
      tone: lateStageShare >= 0.35 ? "positive" : "neutral",
      body: finalRow.cumulativeProfit > 0
        ? `累计收益中约 ${formatPercent(lateStageShare)} 出现在最后三分之一时期，说明复利在后段会明显提速。`
        : "当前假设下累计收益未转正，因此还看不到典型的复利后程加速现象。",
    });
  }

  return insights;
}

function renderModeSections(selectedMode) {
  document.querySelectorAll("[data-mode-section]").forEach((section) => {
    section.classList.toggle("is-hidden", section.dataset.modeSection !== selectedMode);
  });
}

function syncBacktestControls() {
  const monthly = activeMonthlyData();
  const usingMonthly = elements.calculationMode.value === 'backtest' && Boolean(monthly);
  elements.monthlyRange.hidden = !usingMonthly;
  elements.annualRange.hidden = usingMonthly;
  elements.years.readOnly = usingMonthly;
  if (usingMonthly) {
    const available = monthly.prices.slice(1).map(p => p.date);
    for (const [field, fallback] of [[elements.backtestStartMonth, available[Math.max(0, available.length - 120)]] , [elements.backtestEndMonth, available.at(-1)]]) {
      field.min = available[0]; field.max = available.at(-1);
      if (!available.includes(field.value)) field.value = fallback;
    }
    if (elements.backtestStartMonth.value > elements.backtestEndMonth.value) elements.backtestEndMonth.value = elements.backtestStartMonth.value;
    const months = InvestmentEngine.monthIndex(elements.backtestEndMonth.value) - InvestmentEngine.monthIndex(elements.backtestStartMonth.value) + 1;
    elements.years.value = String(Number((months / 12).toFixed(4)));
    elements.chartComparisonButton.textContent = '标的累计涨幅';
    renderModeSections('backtest');
    elements.backtestRangeHint.textContent = `真实月末点位回测 ${elements.backtestStartMonth.value}—${elements.backtestEndMonth.value}，共 ${months} 个月。年度投入每满 12 个月一周期；区间末尾不足一年按实际月数计算。`;
    return;
  }
  const mode = elements.calculationMode.value === "backtest" ? "backtest" : "projection";
  const dataset = getDataset(elements.backtestDataset.value);
  const maxYears = mode === "backtest" ? dataset.years.length : 50;

  elements.years.max = String(maxYears);

  const validStartYears = dataset.years;
  const currentStartYear = Number(elements.backtestStartYear.value);
  const nextStartYear = validStartYears.includes(currentStartYear) ? currentStartYear : validStartYears[0];

  elements.backtestStartYear.innerHTML = validStartYears
    .map((year) => `<option value="${year}" ${year === nextStartYear ? "selected" : ""}>${year}</option>`)
    .join("");

  elements.backtestStartYear.value = String(nextStartYear);
  elements.chartComparisonButton.textContent = mode === "backtest" ? "累计涨幅" : "情景对比";
  renderModeSections(mode);

  const firstAvailableStart = validStartYears[0];
  const lastAvailableStart = validStartYears[validStartYears.length - 1];
  elements.backtestRangeHint.textContent = `${dataset.label} 样本覆盖 ${dataset.years[0]}-${dataset.years[dataset.years.length - 1]}，年度近似回测（超出样本的年限将截断）；可选起点 ${firstAvailableStart}-${lastAvailableStart}。`;
}

function sanitizeInputs() {
  const usingMonthly = elements.calculationMode.value === "backtest" && activeMonthlyData();
  const calculationMode = elements.calculationMode.value === "backtest" ? "backtest" : "projection";
  const dataset = getDataset(elements.backtestDataset.value);
  const maxYears = calculationMode === "backtest" ? dataset.years.length : 50;

  const parsed = {
    calculationMode,
    initialAmount: Math.min(1e12, Math.max(0, Math.round(toNumber(elements.initialAmount.value === "" ? state.inputs.initialAmount : elements.initialAmount.value, defaults.initialAmount)))),
    years: usingMonthly ? (InvestmentEngine.monthIndex(elements.backtestEndMonth.value) - InvestmentEngine.monthIndex(elements.backtestStartMonth.value) + 1) / 12 : clamp(Math.round(toNumber(elements.years.value || state.inputs.years, defaults.years)), 1, maxYears),
    contributionAmount: Math.min(1e12, Math.max(0, Math.round(toNumber(elements.contributionAmount.value === "" ? state.inputs.contributionAmount : elements.contributionAmount.value, defaults.contributionAmount)))),
    contributionFrequency: elements.contributionFrequency.value === "yearly" ? "yearly" : "monthly",
    annualRate: clamp(toNumber(elements.annualRate.value === "" ? state.inputs.annualRate : elements.annualRate.value, defaults.annualRate), -50, 80),
    contributionTiming: elements.contributionTiming.value === "end" ? "end" : "start",
    scenarioSpread: clamp(Math.abs(toNumber(elements.scenarioSpread.value === "" ? state.inputs.scenarioSpread : elements.scenarioSpread.value, defaults.scenarioSpread)), 0, 15),
    chartMode: elements.chartMode.value === "comparison" ? "comparison" : "breakdown",
    targetAmount: Math.min(1e15, Math.max(0, Math.round(toNumber(elements.targetAmount.value === "" ? state.inputs.targetAmount : elements.targetAmount.value, defaults.targetAmount)))),
    inflationRate: clamp(toNumber(elements.inflationRate.value === "" ? state.inputs.inflationRate : elements.inflationRate.value, defaults.inflationRate), -10, 30),
    backtestDataset: Object.prototype.hasOwnProperty.call(HISTORICAL_DATASETS, elements.backtestDataset.value)
      ? elements.backtestDataset.value
      : defaults.backtestDataset,
    backtestStartYear: elements.backtestStartYear.value || defaults.backtestStartYear,
    backtestPrecision: usingMonthly ? 'monthly' : 'annual',
    backtestStartMonth: elements.backtestStartMonth.value,
    backtestEndMonth: elements.backtestEndMonth.value,
    targetBasis: elements.targetBasis.value === 'real' ? 'real' : 'nominal',
    showTargetLine: elements.showTargetLine.checked,
  };

  state.inputs = parsed;
  return parsed;
}

function renderAssumptions(inputs, projection) {
  if (inputs.calculationMode === "backtest") {
    elements.assumptionTitle.textContent = "历史回测说明";
    elements.assumptionList.innerHTML = `
      <li>${projection.backtest.monthly ? "使用真实月末收盘点位计算月收益；排除尚未结束的月份。" : "使用内置 2010—2024 年度示例收益，按等效固定月收益近似模拟，不代表真实月度定投。"}</li>
      <li>当前回测区间为 ${projection.backtest.startYear}-${projection.backtest.endYear}，共 ${Number(projection.backtest.effectiveYears.toFixed(2))} 年；${projection.backtest.monthly ? "Yahoo Finance 的美元指数价格回报，不含分红再投资；金额以人民币展示仅作同币种记账，不含汇率变动。" : "内置示例未附可追溯数据源，不能用于精确回测。"}</li>
      <li>实际购买力按 ${formatPercent(inputs.inflationRate / 100)} 年通胀率折现为今天价值；结果仍未包含税费、滑点、交易成本与分红再投资细节。</li>
    `;
    return;
  }

  elements.assumptionTitle.textContent = "计算假设";
  elements.assumptionList.innerHTML = `
    <li>采用固定年化收益率，并换算为等效月收益率进行逐月模拟。</li>
    <li>情景对比默认以基准收益率为中心，生成保守与乐观两条曲线。</li>
    <li>实际购买力按 ${formatPercent(inputs.inflationRate / 100)} 年通胀率折现为今天价值，目标反推按${inputs.targetBasis === "real" ? "今天购买力" : "名义终值"}计算；实际累计收益将各笔投入折现到同一基准时点。</li>
    <li>结果未包含税费、申赎费用与回撤波动。</li>
  `;
}

function renderContextCards() {
  if (state.projection.mode === "backtest") {
    const { label, startYear, endYear, benchmarkCagr, worstPeriod, effectiveYears } = state.projection.backtest;
    elements.scenarioStrip.innerHTML = `
      <article class="scenario-card" data-tone="base">
        <span>回测标的</span>
        <strong>${label}</strong>
        <span>${state.projection.backtest.monthly ? "真实月末点位 · 价格回报" : "年度示例 · 近似模拟"}</span>
      </article>
      <article class="scenario-card" data-tone="conservative">
        <span>回测区间</span>
        <strong>${startYear} - ${endYear}</strong>
        <span>${Number(effectiveYears.toFixed(2))} 年（末段可能不足一年）</span>
      </article>
      <article class="scenario-card" data-tone="optimistic">
        <span>样本年化</span>
        <strong>${formatPercent(benchmarkCagr)}</strong>
        <span>${worstPeriod ? `最弱区间 ${worstPeriod.label} ${formatPercent(worstPeriod.rate)}` : "暂无最弱区间"}</span>
      </article>
    `;
    return;
  }

  elements.scenarioStrip.innerHTML = state.projection.scenarios
    .map((scenario) => `
      <article class="scenario-card" data-tone="${scenario.key}">
        <span>${scenario.label}</span>
        <strong>${formatCurrency(scenario.simulation.finalRow.endBalance)}</strong>
        <span>年化假设 ${formatPercent(scenario.rate)}</span>
      </article>
    `)
    .join("");
}

function updateMetrics() {
  const finalRow = state.projection.base.finalRow;
  const inputs = state.inputs;

  elements.metricFinalValue.textContent = formatCurrency(finalRow.endBalance);
  elements.metricPrincipal.textContent = formatCurrency(finalRow.cumulativePrincipal);
  elements.metricProfit.textContent = formatCurrency(finalRow.cumulativeProfit);
  elements.metricReturnRate.textContent = formatPercent(finalRow.cumulativeReturn);
  elements.metricRealValue.textContent = formatCurrency(finalRow.realEndBalance);
  elements.metricInflationDrag.textContent = formatCurrency(finalRow.purchasingPowerDrag);
  elements.metricRealCaption.textContent = `按 ${formatPercent(inputs.inflationRate / 100)} 年通胀折现`;
  elements.metricInflationCaption.textContent = `${Number(finalRow.year.toFixed(2))} 年累计购买力折损`;
  elements.metricPrincipalCaption.textContent = `初始本金 + ${getContributionCadenceLabel(inputs)}`;
  elements.metricReturnCaption.textContent = "累计收益 / 累计投入，非年化";

  if (state.projection.mode === "backtest") {
    elements.metricFinalCaption.textContent = `${state.projection.backtest.startYear}—${state.projection.backtest.endYear} ${state.projection.backtest.monthly ? "月度回测" : "年度近似"}终值`;
    elements.metricProfitCaption.textContent = `${state.projection.backtest.label} 回测样本`;
  } else {
    elements.metricFinalCaption.textContent = `${inputs.years} 年后的基准情景终值`;
    elements.metricProfitCaption.textContent = `${formatPercent(inputs.annualRate / 100)} 固定年化假设`;
  }

  elements.metricProfit.classList.toggle("negative", finalRow.cumulativeProfit < 0);
  elements.metricReturnRate.classList.toggle("negative", finalRow.cumulativeReturn < 0);
  elements.metricRealValue.classList.toggle("negative", finalRow.realCumulativeProfit < 0);
}

function renderGoalSection() {
  const goal = state.goalAnalysis;

  elements.goalTargetValue.textContent = formatCurrency(goal.targetAmount);
  elements.goalTargetCaption.textContent = `${state.inputs.targetBasis === "real" ? "以今天购买力为目标" : "以未来名义金额为目标"} · ${Number(state.projection.base.finalRow.year.toFixed(2))} 年`;
  elements.goalRequiredContribution.textContent = goal.supported ? formatCurrency(goal.requiredContribution) : "超出范围";
  elements.goalRequiredCaption.textContent = `按当前 ${goal.cadence} 节奏反推`;
  elements.goalContributionGap.textContent = goal.supported ? formatSignedCurrency(goal.contributionGap) : "—";
  elements.goalGapCaption.textContent = "正数代表需要增加，负数代表可以减少";
  elements.goalHitTime.textContent = formatGoalTime(goal.goalHitRow || goal.extendedGoalHitRow);
  elements.goalHitCaption.textContent = state.inputs.calculationMode === "backtest" ? `${goal.goalHitCaption}（历史模拟，不预测未来）` : goal.goalHitCaption;
  elements.goalSummaryText.textContent = goal.summary;
  elements.goalMilestones.innerHTML = goal.milestones
    .map((milestone) => {
      const statusText = milestone.status === "current" ? formatGoalTime(milestone.hitRow) : milestone.status === "extended" ? `延长后 ${formatGoalTime(milestone.hitRow)}` : "未达成";
      const progress = Math.min(safeRatio(goal.currentFinalBalance, milestone.amount) * 100, 100);

      return `
        <article class="milestone-item" data-status="${milestone.status}">
          <div>
            <span>${milestone.label} 目标</span>
            <strong>${formatCurrency(milestone.amount)}</strong>
          </div>
          <small>${statusText}</small>
          <span class="milestone-bar" aria-hidden="true"><i style="width: ${progress}%"></i></span>
        </article>
      `;
    })
    .join("");

  elements.goalContributionGap.classList.toggle("negative", goal.contributionGap > 0);
  elements.goalContributionGap.classList.toggle("positive", goal.contributionGap < 0);
  elements.goalHitTime.classList.toggle("negative", goal.goalHitStatus === "missing");
  elements.goalHitTime.classList.toggle("positive", goal.goalHitStatus !== "missing");
}

function renderInsights() {
  const insights = generateInsights(state.inputs, state.projection, state.goalAnalysis);

  elements.insightsGrid.innerHTML = insights
    .map((insight) => `
      <article class="insight-card" data-tone="${insight.tone}">
        <span class="metric-label">${insight.title}</span>
        <strong>${insight.metric}</strong>
        <p>${insight.body}</p>
      </article>
    `)
    .join("");
}

function renderTable() {
  const rows = state.projection.base.rows.slice(1);

  elements.yearlyTableBody.innerHTML = rows
    .map((row) => {
      const profitClass = row.cumulativeProfit >= 0 ? "positive" : "negative";
      const annualReturnClass = row.annualMarketReturn >= 0 ? "positive" : "negative";
      const label = row.calendarYear ? String(row.calendarYear) : `第 ${row.year} 年`;

      return `
        <tr data-year="${row.year}">
          <td>${label}</td>
          <td>${formatCurrency(row.yearStartBalance)}</td>
          <td>${formatCurrency(row.annualContribution)}</td>
          <td>${formatCurrency(row.cumulativePrincipal)}</td>
          <td class="${row.annualInterest >= 0 ? "positive" : "negative"}">${formatCurrency(row.annualInterest)}</td>
          <td class="${annualReturnClass}">${formatPercent(row.annualMarketReturn)}</td>
          <td class="${profitClass}">${formatCurrency(row.cumulativeProfit)}</td>
          <td>${formatCurrency(row.endBalance)}</td>
          <td>${formatCurrency(row.realEndBalance)}</td>
          <td class="${row.realCumulativeProfit >= 0 ? "positive" : "negative"}">${formatCurrency(row.realCumulativeProfit)}</td>
          <td class="${profitClass}">${formatPercent(row.cumulativeReturn)}</td>
        </tr>
      `;
    })
    .join("");
}

function getBreakdownSeries() {
  const rows = state.projection.base.rows;
  const profitTone = state.projection.base.finalRow.cumulativeProfit >= 0 ? tones.profitPositive : tones.profitNegative;

  return {
    mode: "breakdown",
    rows,
    yFormatter: formatCompactCurrency,
    areaSeriesKey: null,
    series: [
      {
        key: "total",
        label: "总资产",
        color: tones.total.color,
        fill: tones.total.fill,
        values: rows.map((row) => row.endBalance),
        strokeWidth: 3.4,
      },
      {
        key: "principal",
        label: "累计本金",
        color: tones.principal.color,
        fill: tones.principal.fill,
        values: rows.map((row) => row.cumulativePrincipal),
        strokeWidth: 2.3,
        dasharray: "8 6",
      },
      {
        key: "profit",
        label: "累计收益",
        color: profitTone.color,
        fill: profitTone.fill,
        values: rows.map((row) => row.cumulativeProfit),
        strokeWidth: 2.2,
      },
      {
        key: "realEndBalance",
        label: "实际购买力",
        color: tones.real.color,
        fill: tones.real.fill,
        values: rows.map((row) => row.realEndBalance),
        strokeWidth: 2.6,
        dasharray: "4 7",
      },
    ],
  };
}

function getComparisonSeries() {
  if (state.projection.mode === "backtest") {
    const rows = state.projection.base.rows;
    return {
      mode: "comparison",
      rows,
      yFormatter: formatPercent,
      areaSeriesKey: "portfolioReturn",
      series: [
        {
          key: "portfolioReturn",
          label: "投入收益比（非年化）",
          color: tones.base.color,
          fill: tones.base.fill,
          values: rows.map((row) => row.cumulativeReturn),
          strokeWidth: 3.4,
        },
        {
          key: "benchmarkGrowth",
          label: `${state.projection.backtest.shortLabel}累计涨幅`,
          color: tones.benchmark.color,
          fill: tones.benchmark.fill,
          values: rows.map((row) => row.benchmarkGrowth - 1),
          strokeWidth: 2.6,
          dasharray: "8 6",
        },
      ],
    };
  }

  return {
    mode: "comparison",
    rows: state.projection.base.rows,
    yFormatter: formatCompactCurrency,
    areaSeriesKey: "base",
    series: state.projection.scenarios.map((scenario) => ({
      key: scenario.key,
      label: scenario.shortLabel,
      color: tones[scenario.key].color,
      fill: tones[scenario.key].fill,
      values: scenario.simulation.rows.map((row) => row.endBalance),
      strokeWidth: scenario.key === "base" ? 3.6 : 2.4,
      dasharray: scenario.key === "conservative" ? "7 6" : undefined,
    })),
  };
}

function getCurrentChartData() {
  return state.inputs.chartMode === "comparison" ? getComparisonSeries() : getBreakdownSeries();
}

function sampleIndices(length, maxTicks) {
  if (length <= maxTicks) {
    return [...Array(length).keys()];
  }

  const step = (length - 1) / (maxTicks - 1);
  const indices = [];

  for (let tick = 0; tick < maxTicks; tick += 1) {
    indices.push(Math.round(tick * step));
  }

  return [...new Set(indices)];
}

function buildLinePath(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function buildAreaPath(topPoints, bottomPoints) {
  const top = topPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const bottom = bottomPoints
    .slice()
    .reverse()
    .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  return `${top} ${bottom} Z`;
}

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      element.setAttribute(key, String(value));
    }
  });
  return element;
}

function renderLegend(chartData) {
  const hidden = state.hiddenSeries[state.inputs.chartMode];

  elements.chartLegend.innerHTML = chartData.series
    .map(
      (series) => `
        <button type="button" aria-pressed="${!hidden.has(series.key)}" class="legend-chip ${hidden.has(series.key) ? "is-muted" : ""}" data-series-key="${series.key}">
          <span class="legend-dot" style="background:${series.color}"></span>
          <span>${series.label}</span>
        </button>
      `
    )
    .join("");
}

function buildTooltipContent(index) {
  if (state.inputs.chartMode === "comparison") {
    if (state.projection.mode === "backtest") {
      const row = state.projection.base.rows[index];
      const label = row.calendarYear ? String(row.calendarYear) : "起点";

      return `
        <h3>${label}</h3>
        <dl>
          <dt>投入收益比（非年化）</dt>
          <dd>${formatPercent(row.cumulativeReturn)}</dd>
          <dt>${state.projection.backtest.shortLabel}累计涨幅</dt>
          <dd>${formatPercent(row.benchmarkGrowth - 1)}</dd>
          <dt>期间市场回报</dt>
          <dd>${index === 0 ? "--" : formatPercent(row.annualMarketReturn)}</dd>
          <dt>组合总资产</dt>
          <dd>${formatCurrency(row.endBalance)}</dd>
          <dt>实际购买力</dt>
          <dd>${formatCurrency(row.realEndBalance)}</dd>
        </dl>
      `;
    }

    const scenarioLines = state.projection.scenarios
      .map(
        (scenario) => `
          <dt>${scenario.shortLabel}</dt>
          <dd>${formatCurrency(scenario.simulation.rows[index].endBalance)}</dd>
        `
      )
      .join("");

    return `
      <h3>${index === 0 ? "初始状态" : `第 ${index} 年`}</h3>
      <dl>${scenarioLines}<dt>基准实际购买力</dt><dd>${formatCurrency(state.projection.base.rows[index].realEndBalance)}</dd></dl>
    `;
  }

  const row = state.projection.base.rows[index];
  const label = row.calendarYear ? String(row.calendarYear) : index === 0 ? "初始状态" : `第 ${row.year} 年`;
  const details = [
    ["总资产", formatCurrency(row.endBalance)],
    ["累计本金", formatCurrency(row.cumulativePrincipal)],
    ["累计收益", formatCurrency(row.cumulativeProfit)],
    ["实际购买力", formatCurrency(row.realEndBalance)],
    ["实际累计收益", formatCurrency(row.realCumulativeProfit)],
    ["累计收益率", formatPercent(row.cumulativeReturn)],
  ];

  if (state.goalAnalysis.targetAmount > 0) {
    details.push(["目标进度", formatPercent(Math.min(safeRatio(row.endBalance, state.goalAnalysis.targetAmount), 1))]);
  }

  if (index > 0) {
    details.splice(2, 0, ["本年投入", formatCurrency(row.annualContribution)]);
    details.splice(4, 0, ["本年收益", formatCurrency(row.annualInterest)]);
    details.splice(5, 0, ["期间回报", formatPercent(row.annualMarketReturn)]);
  }

  return `
    <h3>${label}</h3>
    <dl>
      ${details.map(([detailLabel, value]) => `<dt>${detailLabel}</dt><dd>${value}</dd>`).join("")}
    </dl>
  `;
}

function highlightTableRow(yearIndex) {
  const rows = elements.yearlyTableBody.querySelectorAll("tr");
  rows.forEach((row) => {
    row.classList.toggle("is-highlighted", Number(row.dataset.year) === yearIndex);
  });
}

function placeTooltip(pointerX, pointerY) {
  const tooltip = elements.chartTooltip;
  const bounds = elements.chartSurface.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  let left = pointerX + 18;
  let top = pointerY - tooltipRect.height / 2;

  if (left + tooltipRect.width > bounds.width - 12) {
    left = pointerX - tooltipRect.width - 18;
  }

  top = clamp(top, 12, bounds.height - tooltipRect.height - 12);
  left = clamp(left, 12, bounds.width - tooltipRect.width - 12);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function updateChartFocus(index, pointerX, pointerY) {
  const geometry = state.chartGeometry;
  if (!geometry) {
    return;
  }

  const x = geometry.xScale(index);
  geometry.focusLine.setAttribute("x1", x);
  geometry.focusLine.setAttribute("x2", x);
  geometry.focusLine.setAttribute("y1", geometry.top);
  geometry.focusLine.setAttribute("y2", geometry.height - geometry.bottom);
  geometry.focusLine.setAttribute("visibility", "visible");

  geometry.focusPoints.innerHTML = "";
  geometry.visibleSeries.forEach((series) => {
    const y = geometry.yScale(series.values[index]);
    geometry.focusPoints.appendChild(
      createSvgElement("circle", {
        class: "chart-point",
        cx: x,
        cy: y,
        r: 5,
        fill: series.color,
      })
    );
  });

  elements.chartTooltip.innerHTML = buildTooltipContent(index);
  elements.chartTooltip.hidden = false;
  placeTooltip(pointerX, pointerY);
  highlightTableRow(state.projection.base.rows[index].year);
}

function clearChartFocus() {
  if (state.chartGeometry) {
    state.chartGeometry.focusLine.setAttribute("visibility", "hidden");
    state.chartGeometry.focusPoints.innerHTML = "";
  }

  elements.chartTooltip.hidden = true;
  highlightTableRow(-1);
}

function chartTargetAmount() {
  return state.goalAnalysis.targetAmount * (state.inputs.targetBasis === 'real' ? state.projection.base.finalRow.inflationFactor : 1);
}

function renderChart() {
  const chartData = getCurrentChartData();
  const hidden = state.hiddenSeries[state.inputs.chartMode];
  const visibleSeries = chartData.series.filter((series) => !hidden.has(series.key));
  const width = Math.max(elements.chartSurface.clientWidth, 320);
  const height = Math.max(elements.chartSurface.clientHeight, 360);
  const left = width < 640 ? 62 : 80;
  const right = 22;
  const top = 26;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const pointsCount = chartData.rows.length;
  const xScale = (index) => left + (plotWidth * index) / Math.max(pointsCount - 1, 1);
  const allValues = visibleSeries.flatMap((series) => series.values);
  if (state.inputs.showTargetLine && chartData.mode === "breakdown" && state.goalAnalysis?.targetAmount > 0) {
    allValues.push(chartTargetAmount());
  }
  const rawMin = Math.min(0, ...allValues);
  const rawMax = Math.max(0, ...allValues);
  const range = rawMax - rawMin || 1;
  const paddedMin = rawMin - range * 0.1;
  const paddedMax = rawMax + range * 0.14;
  const yScale = (value) => top + plotHeight * (1 - (value - paddedMin) / Math.max(paddedMax - paddedMin, 1));
  const baselineY = yScale(0);
  const svg = elements.chartSvg;

  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");

  const root = createSvgElement("g");
  svg.appendChild(root);

  const tickCount = 5;
  for (let tick = 0; tick < tickCount; tick += 1) {
    const ratio = tick / (tickCount - 1);
    const value = paddedMax - (paddedMax - paddedMin) * ratio;
    const y = top + plotHeight * ratio;

    root.appendChild(
      createSvgElement("line", {
        class: "grid-line",
        x1: left,
        y1: y,
        x2: width - right,
        y2: y,
      })
    );

    const label = createSvgElement("text", {
      class: "axis-label",
      x: left - 10,
      y: y + 4,
      "text-anchor": "end",
    });
    label.textContent = chartData.yFormatter(value);
    root.appendChild(label);
  }

  root.appendChild(
    createSvgElement("line", {
      class: "axis-line",
      x1: left,
      y1: clamp(baselineY, top, height - bottom),
      x2: width - right,
      y2: clamp(baselineY, top, height - bottom),
    })
  );

  if (state.inputs.showTargetLine && chartData.mode === "breakdown" && state.goalAnalysis?.targetAmount > 0) {
    const targetY = yScale(chartTargetAmount());
    root.appendChild(
      createSvgElement("line", {
        class: "target-line",
        x1: left,
        y1: targetY,
        x2: width - right,
        y2: targetY,
      })
    );

    const targetLabel = createSvgElement("text", {
      class: "target-label",
      x: width - right - 8,
      y: targetY - 8,
      "text-anchor": "end",
    });
    targetLabel.textContent = `期末名义目标 ${formatCompactCurrency(chartTargetAmount())}`;
    root.appendChild(targetLabel);

    if (state.goalAnalysis.goalHitRow && chartData.rows.indexOf(state.goalAnalysis.goalHitRow) >= 0 && chartData.rows.indexOf(state.goalAnalysis.goalHitRow) < pointsCount) {
      const hitX = xScale(chartData.rows.indexOf(state.goalAnalysis.goalHitRow));
      root.appendChild(
        createSvgElement("circle", {
          class: "target-point",
          cx: hitX,
          cy: targetY,
          r: 5,
        })
      );
    }
  }

  const xTickIndices = sampleIndices(pointsCount, width < 640 ? 4 : 6);
  xTickIndices.forEach((index) => {
    const x = xScale(index);
    const label = createSvgElement("text", {
      class: "axis-label",
      x,
      y: height - 16,
      "text-anchor": "middle",
    });
    label.textContent = getRowLabel(chartData.rows[index], index);
    root.appendChild(label);
  });

  if (chartData.mode === "breakdown") {
    const principalVisible = visibleSeries.find((series) => series.key === "principal");
    const totalVisible = visibleSeries.find((series) => series.key === "total");
    const profitVisible = visibleSeries.find((series) => series.key === "profit");

    if (principalVisible) {
      const principalPoints = principalVisible.values.map((value, index) => ({ x: xScale(index), y: yScale(value) }));
      const baselinePoints = principalVisible.values.map((_, index) => ({ x: xScale(index), y: yScale(0) }));

      root.appendChild(
        createSvgElement("path", {
          d: buildAreaPath(principalPoints, baselinePoints),
          fill: principalVisible.fill,
        })
      );
    }

    if (totalVisible && principalVisible && profitVisible) {
      const topPoints = totalVisible.values.map((value, index) => ({ x: xScale(index), y: yScale(value) }));
      const bottomPoints = principalVisible.values.map((value, index) => ({ x: xScale(index), y: yScale(value) }));

      root.appendChild(
        createSvgElement("path", {
          d: buildAreaPath(topPoints, bottomPoints),
          fill: profitVisible.fill,
        })
      );
    } else if (totalVisible) {
      const totalPoints = totalVisible.values.map((value, index) => ({ x: xScale(index), y: yScale(value) }));
      const baselinePoints = totalVisible.values.map((_, index) => ({ x: xScale(index), y: yScale(0) }));

      root.appendChild(
        createSvgElement("path", {
          d: buildAreaPath(totalPoints, baselinePoints),
          fill: totalVisible.fill,
        })
      );
    }
  } else {
    const areaSeries = visibleSeries.find((series) => series.key === chartData.areaSeriesKey);
    if (areaSeries) {
      const topPoints = areaSeries.values.map((value, index) => ({ x: xScale(index), y: yScale(value) }));
      const baselinePoints = areaSeries.values.map((_, index) => ({ x: xScale(index), y: yScale(0) }));

      root.appendChild(
        createSvgElement("path", {
          d: buildAreaPath(topPoints, baselinePoints),
          fill: areaSeries.fill,
        })
      );
    }
  }

  visibleSeries.forEach((series) => {
    const points = series.values.map((value, index) => ({ x: xScale(index), y: yScale(value) }));

    root.appendChild(
      createSvgElement("path", {
        d: buildLinePath(points),
        fill: "none",
        stroke: series.color,
        "stroke-width": series.strokeWidth,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
        "stroke-dasharray": series.dasharray || "",
      })
    );
  });

  const focusLine = createSvgElement("line", {
    class: "focus-line",
    visibility: "hidden",
  });
  const focusPoints = createSvgElement("g");

  root.appendChild(focusLine);
  root.appendChild(focusPoints);

  state.chartGeometry = {
    width,
    height,
    top,
    bottom,
    left,
    plotWidth,
    pointsCount,
    visibleSeries,
    xScale,
    yScale,
    focusLine,
    focusPoints,
  };

  renderLegend(chartData);
  if (state.inputs.chartMode === "comparison") {
    elements.chartModeHint.textContent = state.projection.mode === "backtest" ? "当前视图：标的涨幅与投入收益比（口径不同）" : "当前视图：情景对比";
  } else {
    elements.chartModeHint.textContent = "当前视图：资产拆解";
  }
}

function updateProjection() {
  syncBacktestControls();
  const inputs = sanitizeInputs();

  state.projection = calculateProjection(inputs);
  state.goalAnalysis = solveRequiredContribution(inputs, state.projection);

  renderAssumptions(inputs, state.projection);
  renderContextCards();
  updateMetrics();
  renderGoalSection();
  renderInsights();
  renderTable();
  renderChart();
  clearChartFocus();
  const invalid = [...elements.form.querySelectorAll('input[type="number"]')].find(input => !input.readOnly && (!input.value || !input.validity.valid));
  elements.formStatus.textContent = invalid ? '正在编辑或输入超出范围；计算使用有效数值，离开输入框后规范化。' : '';
  saveCurrentInputs();
}

function resetAll() {
  Object.entries(defaults).forEach(([key, value]) => {
    const field = elements[key];
    if (field) {
      if (field.type === "checkbox") field.checked = value;
      else field.value = String(value);
    }
  });

  document.querySelectorAll(".pill-group").forEach((group) => {
    const hiddenField = elements[group.dataset.group];
    const activeValue = hiddenField ? hiddenField.value : "";
    group.querySelectorAll(".pill").forEach((pill) => {
      pill.classList.toggle("is-active", pill.dataset.value === activeValue);
      pill.setAttribute("aria-pressed", String(pill.dataset.value === activeValue));
    });
  });

  updateProjection();
}

function exportCsv() {
  const headers = ["年份", "年初资产", "本年投入", "累计本金", "本年收益", "期间回报", "累计收益", "年末总资产", "实际购买力", "实际累计收益", "累计收益率"];
  const lines = state.projection.base.rows.slice(1).map((row) =>
    [
      row.calendarYear || row.year,
      row.yearStartBalance.toFixed(2),
      row.annualContribution.toFixed(2),
      row.cumulativePrincipal.toFixed(2),
      row.annualInterest.toFixed(2),
      (row.annualMarketReturn * 100).toFixed(2) + "%",
      row.cumulativeProfit.toFixed(2),
      row.endBalance.toFixed(2),
      row.realEndBalance.toFixed(2),
      row.realCumulativeProfit.toFixed(2),
      (row.cumulativeReturn * 100).toFixed(2) + "%",
    ].join(",")
  );

  const metadata = [
    ['导出参数', '值'], ...Object.entries(state.inputs),
    ['回测来源', state.projection.backtest?.monthly ? 'Yahoo Finance / 美元指数价格回报，不含分红及汇率' : state.projection.mode === 'backtest' ? '内置年度示例，等效月收益近似，来源未核验' : '固定年化假设'],
    ['行情抓取时间', state.projection.backtest?.updatedAt || '不适用'],
    ['实际回测起止', state.projection.backtest ? `${state.projection.backtest.startYear}—${state.projection.backtest.endYear}` : '不适用'],
    ['资金加权年化收益率', state.projection.base.moneyWeightedReturn === null ? '不适用' : formatPercent(state.projection.base.moneyWeightedReturn)],
    ['收益口径', '累计收益率是累计收益/累计投入，不是年化或时间加权回报'],
  ].map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n');
  const csvContent = `\uFEFF${headers.join(",")}\n${lines.join("\n")}\n\n${metadata}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = "investment-projection.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function handleSurfacePointer(event) {
  if (!state.chartGeometry) {
    return;
  }

  const bounds = elements.chartSurface.getBoundingClientRect();
  const localX = event.clientX - bounds.left;
  const index = clamp(
    Math.round(((localX - state.chartGeometry.left) / Math.max(state.chartGeometry.plotWidth, 1)) * (state.chartGeometry.pointsCount - 1)),
    0,
    state.chartGeometry.pointsCount - 1
  );

  updateChartFocus(index, localX, event.clientY - bounds.top);
}

function bindPillGroups() {
  document.querySelectorAll(".pill-group").forEach((group) => {
    const hiddenField = elements[group.dataset.group];
    if (!hiddenField) {
      return;
    }

    group.querySelectorAll(".pill").forEach((pill) => {
      pill.classList.toggle("is-active", pill.dataset.value === hiddenField.value);
      pill.setAttribute("aria-pressed", String(pill.dataset.value === hiddenField.value));
      pill.addEventListener("click", () => {
        hiddenField.value = pill.dataset.value;
        group.querySelectorAll(".pill").forEach((button) => {
          button.classList.toggle("is-active", button === pill);
          button.setAttribute("aria-pressed", String(button === pill));
        });
        updateProjection();
      });
    });
  });
}

function bindLegend() {
  elements.chartLegend.addEventListener("click", (event) => {
    const button = event.target.closest("[data-series-key]");
    if (!button) {
      return;
    }

    const chartData = getCurrentChartData();
    const hidden = state.hiddenSeries[state.inputs.chartMode];
    const key = button.dataset.seriesKey;
    const currentlyVisible = chartData.series.filter((series) => !hidden.has(series.key));

    if (hidden.has(key)) {
      hidden.delete(key);
    } else if (currentlyVisible.length > 1) {
      hidden.add(key);
    }

    renderChart();
    clearChartFocus();
  });
}

function bindForm() {
  elements.form.addEventListener('submit', event => event.preventDefault());
  elements.form.querySelectorAll('input[type="month"]').forEach(input => input.addEventListener('change', updateProjection));
  elements.showTargetLine.addEventListener('change', updateProjection);
  elements.refreshData.addEventListener('click', () => loadMarketData(true));
  elements.savePlan.addEventListener('click', savePlan);
  elements.sharePlan.addEventListener('click', sharePlan);
  elements.chartSurface.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') return clearChartFocus();
    const count = state.chartGeometry.pointsCount;
    state.focusIndex = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : clamp(state.focusIndex + (event.key === 'ArrowRight' ? 1 : -1), 0, count - 1);
    updateChartFocus(state.focusIndex, state.chartGeometry.xScale(state.focusIndex), 50);
  });
  elements.form.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener("input", updateProjection);
    input.addEventListener('blur', () => {
      updateProjection();
      const value = state.inputs[input.id];
      if (value !== undefined) input.value = String(value);
      updateProjection();
    });
  });

  elements.form.querySelectorAll("select").forEach((select) => {
    select.addEventListener("change", () => { updateProjection(); renderDataStatus(); });
  });

  elements.resetButton.addEventListener("click", resetAll);
  elements.exportButton.addEventListener("click", exportCsv);
  elements.chartSurface.addEventListener("mousemove", handleSurfacePointer);
  elements.chartSurface.addEventListener("mouseleave", clearChartFocus);
  elements.chartSurface.addEventListener(
    "touchstart",
    (event) => {
      if (!event.touches[0]) {
        return;
      }
      handleSurfacePointer(event.touches[0]);
    },
    { passive: true }
  );
  elements.chartSurface.addEventListener(
    "touchmove",
    (event) => {
      if (!event.touches[0]) {
        return;
      }
      handleSurfacePointer(event.touches[0]);
    },
    { passive: true }
  );
  elements.chartSurface.addEventListener("touchend", clearChartFocus);
}

function bindResize() {
  const observer = new ResizeObserver(() => {
    renderChart();
    clearChartFocus();
  });
  observer.observe(elements.chartSurface);
}

syncBacktestControls();
restoreInputs();
bindPillGroups();
bindLegend();
bindForm();
bindResize();
updateProjection();

renderPlans();
loadMarketData();
