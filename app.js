const HISTORICAL_DATASETS = {
  sp500: {
    label: "标普 500",
    shortLabel: "标普 500",
    years: [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    returns: [0.1506, 0.0211, 0.16, 0.3239, 0.1369, 0.0138, 0.1196, 0.2183, -0.0438, 0.3149, 0.184, 0.2871, -0.1811, 0.2629, 0.2502],
  },
  nasdaq100: {
    label: "纳斯达克 100",
    shortLabel: "纳指 100",
    years: [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    returns: [0.192, 0.027, 0.181, 0.366, 0.192, 0.095, 0.071, 0.327, -0.01, 0.39, 0.486, 0.274, -0.326, 0.549, 0.256],
  },
  csi300: {
    label: "沪深 300",
    shortLabel: "沪深 300",
    years: [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    returns: [-0.1251, -0.2501, 0.0755, -0.0765, 0.5166, 0.0558, -0.1128, 0.2178, -0.2531, 0.3607, 0.2721, -0.052, -0.2163, -0.1138, 0.1468],
  },
};

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
  backtestDataset: "sp500",
  backtestStartYear: "2010",
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
  goalTargetValue: document.getElementById("goalTargetValue"),
  goalTargetCaption: document.getElementById("goalTargetCaption"),
  goalRequiredContribution: document.getElementById("goalRequiredContribution"),
  goalRequiredCaption: document.getElementById("goalRequiredCaption"),
  goalContributionGap: document.getElementById("goalContributionGap"),
  goalGapCaption: document.getElementById("goalGapCaption"),
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
  backtestDataset: document.getElementById("backtestDataset"),
  backtestStartYear: document.getElementById("backtestStartYear"),
};

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

function annualToMonthlyRate(annualRateDecimal) {
  return Math.pow(1 + clamp(annualRateDecimal, -0.99, 5), 1 / 12) - 1;
}

function shouldContributeForMonth(inputs, month) {
  const isMonthlyContribution = inputs.contributionFrequency === "monthly";
  const isYearlyAtStart = inputs.contributionFrequency === "yearly" && inputs.contributionTiming === "start" && month === 1;
  const isYearlyAtEnd = inputs.contributionFrequency === "yearly" && inputs.contributionTiming === "end" && month === 12;

  return isMonthlyContribution || isYearlyAtStart || isYearlyAtEnd;
}

function simulateAnnualSeries(inputs, annualRates, yearLabels = []) {
  const rows = [];
  const sampleDescriptors = annualRates.map((rate, index) => ({
    label: yearLabels[index] || `第 ${index + 1} 年`,
    rate,
  }));

  let balance = inputs.initialAmount;
  let cumulativePrincipal = inputs.initialAmount;
  let benchmarkGrowth = 1;

  rows.push({
    year: 0,
    calendarYear: null,
    yearStartBalance: inputs.initialAmount,
    annualContribution: 0,
    cumulativePrincipal,
    annualInterest: 0,
    annualMarketReturn: 0,
    benchmarkGrowth,
    cumulativeProfit: balance - cumulativePrincipal,
    endBalance: balance,
    cumulativeReturn: safeRatio(balance - cumulativePrincipal, cumulativePrincipal),
  });

  annualRates.forEach((annualRate, index) => {
    const yearStartBalance = balance;
    const monthlyRate = annualToMonthlyRate(annualRate);
    let annualContribution = 0;
    let annualInterest = 0;

    for (let month = 1; month <= 12; month += 1) {
      const shouldContribute = shouldContributeForMonth(inputs, month);

      if (shouldContribute && inputs.contributionTiming === "start") {
        balance += inputs.contributionAmount;
        annualContribution += inputs.contributionAmount;
      }

      const monthlyInterest = balance * monthlyRate;
      annualInterest += monthlyInterest;
      balance += monthlyInterest;

      if (shouldContribute && inputs.contributionTiming === "end") {
        balance += inputs.contributionAmount;
        annualContribution += inputs.contributionAmount;
      }
    }

    cumulativePrincipal += annualContribution;
    benchmarkGrowth *= 1 + annualRate;
    const cumulativeProfit = balance - cumulativePrincipal;

    rows.push({
      year: index + 1,
      calendarYear: yearLabels[index] || null,
      yearStartBalance,
      annualContribution,
      cumulativePrincipal,
      annualInterest,
      annualMarketReturn: annualRate,
      benchmarkGrowth,
      cumulativeProfit,
      endBalance: balance,
      cumulativeReturn: safeRatio(cumulativeProfit, cumulativePrincipal),
    });
  });

  const averageAnnualReturn = sampleDescriptors.length
    ? sampleDescriptors.reduce((sum, item) => sum + item.rate, 0) / sampleDescriptors.length
    : 0;

  const bestPeriod = sampleDescriptors.reduce((best, current) => (best === null || current.rate > best.rate ? current : best), null);
  const worstPeriod = sampleDescriptors.reduce((worst, current) => (worst === null || current.rate < worst.rate ? current : worst), null);
  const negativeYearsCount = sampleDescriptors.filter((item) => item.rate < 0).length;
  const benchmarkCagr = sampleDescriptors.length ? Math.pow(benchmarkGrowth, 1 / sampleDescriptors.length) - 1 : 0;

  return {
    rows,
    annualRates,
    yearLabels,
    finalRow: rows[rows.length - 1],
    averageAnnualReturn,
    benchmarkCagr,
    bestPeriod,
    worstPeriod,
    negativeYearsCount,
  };
}

function getBacktestSlice(inputs) {
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
      ...simulateAnnualSeries(nextInputs, slice.annualRates, slice.yearLabels),
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
    const base = simulateAnnualSeries(inputs, slice.annualRates, slice.yearLabels);

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

function solveRequiredContribution(inputs, projection) {
  const targetAmount = Math.max(0, inputs.targetAmount);
  const currentFinalBalance = projection.base.finalRow.endBalance;
  const currentContribution = inputs.contributionAmount;
  const cadence = getContributionCadence(inputs);
  const targetContext = inputs.calculationMode === "backtest"
    ? `${projection.backtest.label} ${projection.backtest.startYear}-${projection.backtest.endYear} 的历史路径`
    : `${formatPercent(inputs.annualRate / 100)} 固定年化假设`;

  const simulateFinalBalance = (contributionAmount) => calculateBaseSimulation(inputs, contributionAmount).finalRow.endBalance;
  const zeroContributionFinal = simulateFinalBalance(0);

  let requiredContribution = 0;

  if (targetAmount > zeroContributionFinal) {
    let lowerBound = 0;
    let upperBound = Math.max(currentContribution, 1000);

    while (simulateFinalBalance(upperBound) < targetAmount && upperBound < 1_000_000_000) {
      lowerBound = upperBound;
      upperBound *= 2;
    }

    for (let iteration = 0; iteration < 52; iteration += 1) {
      const midpoint = (lowerBound + upperBound) / 2;
      if (simulateFinalBalance(midpoint) >= targetAmount) {
        upperBound = midpoint;
      } else {
        lowerBound = midpoint;
      }
    }

    requiredContribution = Math.ceil(upperBound);
  }

  const contributionGap = requiredContribution - currentContribution;
  const targetGap = currentFinalBalance - targetAmount;
  const status = targetGap >= 0 ? "ahead" : "shortfall";

  let summary;
  if (targetAmount === 0) {
    summary = "当前目标为 0 元，因此无需额外定投即可达标。";
  } else if (status === "ahead" && requiredContribution === 0) {
    summary = `在 ${targetContext} 下，仅凭初始本金就有机会达到 ${formatCurrency(targetAmount)}，当前计划的结果将高于目标 ${formatCurrency(Math.abs(targetGap))}。`;
  } else if (status === "ahead") {
    summary = `按 ${targetContext} 测算，你当前的 ${cadence} 定投计划有望超过目标 ${formatCurrency(Math.abs(targetGap))}；理论上把单次定投调到 ${formatCurrency(requiredContribution)} 仍可达标。`;
  } else {
    summary = `按 ${targetContext} 测算，你距离目标还差 ${formatCurrency(Math.abs(targetGap))}；若想在当前期限内达标，需要把 ${cadence} 定投提高到 ${formatCurrency(requiredContribution)}。`;
  }

  return {
    targetAmount,
    currentContribution,
    currentFinalBalance,
    requiredContribution,
    contributionGap,
    targetGap,
    status,
    cadence,
    targetContext,
    summary,
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

  const insights = [
    {
      title: "目标达成度",
      metric: formatSignedCurrency(goalAnalysis.targetGap),
      tone: goalAnalysis.status === "ahead" ? "positive" : "warning",
      body:
        goalAnalysis.status === "ahead"
          ? `当前计划预计高出目标 ${formatCurrency(Math.abs(goalAnalysis.targetGap))}，如果只想刚好达标，可把单次定投下调到 ${formatCurrency(goalAnalysis.requiredContribution)}。`
          : `当前计划预计仍差 ${formatCurrency(Math.abs(goalAnalysis.targetGap))}，要达标需要把单次定投提高到 ${formatCurrency(goalAnalysis.requiredContribution)}。`,
    },
    {
      title: "复利接棒年份",
      metric: takeoverRow ? (takeoverRow.calendarYear ? `${takeoverRow.calendarYear}` : `第 ${takeoverRow.year} 年`) : "尚未出现",
      tone: takeoverRow ? "positive" : "neutral",
      body: takeoverRow
        ? `从这一年开始，本年收益 ${formatCurrency(takeoverRow.annualInterest)} 已经超过本年投入 ${formatCurrency(takeoverRow.annualContribution)}，增长开始更多依赖存量资产。`
        : "在当前期限内，本年收益还没有超过当年投入，资产增长仍主要依赖继续追加本金。",
    },
    {
      title: "收益结构",
      metric: formatPercent(finalProfitShare),
      tone: finalProfitShare >= 0.45 ? "positive" : "neutral",
      body: `最终资产中约 ${formatPercent(finalProfitShare)} 来自收益，约 ${formatPercent(finalPrincipalShare)} 来自累计本金。`,
    },
  ];

  if (projection.mode === "backtest") {
    const { bestPeriod, worstPeriod, negativeYearsCount, label } = projection.backtest;
    insights.push({
      title: "历史样本特征",
      metric: worstPeriod ? `${worstPeriod.label} ${formatPercent(worstPeriod.rate)}` : "样本不足",
      tone: "neutral",
      body: bestPeriod
        ? `${label} 这段样本中共有 ${negativeYearsCount} 个下跌年份，最强年份是 ${bestPeriod.label} 的 ${formatPercent(bestPeriod.rate)}。`
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
  const mode = elements.calculationMode.value === "backtest" ? "backtest" : "projection";
  const dataset = getDataset(elements.backtestDataset.value);
  const maxYears = mode === "backtest" ? dataset.years.length : 50;
  const rawYears = clamp(Math.round(toNumber(elements.years.value, defaults.years)), 1, maxYears);
  const backtestYears = clamp(Math.round(toNumber(elements.years.value, defaults.years)), 1, dataset.years.length);

  elements.years.max = String(maxYears);
  if (mode === "backtest" && Number(elements.years.value) !== rawYears) {
    elements.years.value = String(rawYears);
  }

  const validStartYears = dataset.years.slice(0, dataset.years.length - backtestYears + 1);
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
  elements.backtestRangeHint.textContent = `${dataset.label} 样本覆盖 ${dataset.years[0]}-${dataset.years[dataset.years.length - 1]}，当前 ${backtestYears} 年回测可选起点 ${firstAvailableStart}-${lastAvailableStart}。`;
}

function sanitizeInputs() {
  const calculationMode = elements.calculationMode.value === "backtest" ? "backtest" : "projection";
  const dataset = getDataset(elements.backtestDataset.value);
  const maxYears = calculationMode === "backtest" ? dataset.years.length : 50;

  const parsed = {
    calculationMode,
    initialAmount: Math.max(0, Math.round(toNumber(elements.initialAmount.value, defaults.initialAmount))),
    years: clamp(Math.round(toNumber(elements.years.value, defaults.years)), 1, maxYears),
    contributionAmount: Math.max(0, Math.round(toNumber(elements.contributionAmount.value, defaults.contributionAmount))),
    contributionFrequency: elements.contributionFrequency.value === "yearly" ? "yearly" : "monthly",
    annualRate: clamp(toNumber(elements.annualRate.value, defaults.annualRate), -50, 80),
    contributionTiming: elements.contributionTiming.value === "end" ? "end" : "start",
    scenarioSpread: clamp(Math.abs(toNumber(elements.scenarioSpread.value, defaults.scenarioSpread)), 0, 15),
    chartMode: elements.chartMode.value === "comparison" ? "comparison" : "breakdown",
    targetAmount: Math.max(0, Math.round(toNumber(elements.targetAmount.value, defaults.targetAmount))),
    backtestDataset: Object.prototype.hasOwnProperty.call(HISTORICAL_DATASETS, elements.backtestDataset.value)
      ? elements.backtestDataset.value
      : defaults.backtestDataset,
    backtestStartYear: elements.backtestStartYear.value || defaults.backtestStartYear,
  };

  elements.initialAmount.value = String(parsed.initialAmount);
  elements.years.value = String(parsed.years);
  elements.contributionAmount.value = String(parsed.contributionAmount);
  elements.annualRate.value = String(parsed.annualRate);
  elements.scenarioSpread.value = String(parsed.scenarioSpread);
  elements.targetAmount.value = String(parsed.targetAmount);

  state.inputs = parsed;
  return parsed;
}

function renderAssumptions(inputs, projection) {
  if (inputs.calculationMode === "backtest") {
    elements.assumptionTitle.textContent = "历史回测说明";
    elements.assumptionList.innerHTML = `
      <li>历史回测基于内置年度收益样本，并按所选年份顺序逐年回放。</li>
      <li>当前回测区间为 ${projection.backtest.startYear}-${projection.backtest.endYear}，共 ${projection.backtest.effectiveYears} 个年度样本。</li>
      <li>结果仍未包含税费、滑点、交易成本与分红再投资细节，适合作为策略直觉演示。</li>
    `;
    return;
  }

  elements.assumptionTitle.textContent = "计算假设";
  elements.assumptionList.innerHTML = `
    <li>采用固定年化收益率，并换算为等效月收益率进行逐月模拟。</li>
    <li>情景对比默认以基准收益率为中心，生成保守与乐观两条曲线。</li>
    <li>目标反推基于基准情景计算，结果未包含税费、申赎费用、通胀与回撤波动。</li>
  `;
}

function renderContextCards() {
  if (state.projection.mode === "backtest") {
    const { label, startYear, endYear, benchmarkCagr, worstPeriod, effectiveYears } = state.projection.backtest;
    elements.scenarioStrip.innerHTML = `
      <article class="scenario-card" data-tone="base">
        <span>回测标的</span>
        <strong>${label}</strong>
        <span>内置年度收益样本</span>
      </article>
      <article class="scenario-card" data-tone="conservative">
        <span>回测区间</span>
        <strong>${startYear} - ${endYear}</strong>
        <span>${effectiveYears} 个完整年度</span>
      </article>
      <article class="scenario-card" data-tone="optimistic">
        <span>样本年化</span>
        <strong>${formatPercent(benchmarkCagr)}</strong>
        <span>${worstPeriod ? `最差年份 ${worstPeriod.label} ${formatPercent(worstPeriod.rate)}` : "暂无最差年份"}</span>
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
  elements.metricPrincipalCaption.textContent = `初始本金 + ${getContributionCadenceLabel(inputs)}`;
  elements.metricReturnCaption.textContent = "累计收益 / 累计本金";

  if (state.projection.mode === "backtest") {
    elements.metricFinalCaption.textContent = `${state.projection.backtest.startYear}-${state.projection.backtest.endYear} 历史路径终值`;
    elements.metricProfitCaption.textContent = `${state.projection.backtest.label} 回测样本`;
  } else {
    elements.metricFinalCaption.textContent = `${inputs.years} 年后的基准情景终值`;
    elements.metricProfitCaption.textContent = `${formatPercent(inputs.annualRate / 100)} 固定年化假设`;
  }

  elements.metricProfit.classList.toggle("negative", finalRow.cumulativeProfit < 0);
  elements.metricReturnRate.classList.toggle("negative", finalRow.cumulativeReturn < 0);
}

function renderGoalSection() {
  const goal = state.goalAnalysis;

  elements.goalTargetValue.textContent = formatCurrency(goal.targetAmount);
  elements.goalTargetCaption.textContent = `当前期限 ${state.inputs.years} 年`;
  elements.goalRequiredContribution.textContent = formatCurrency(goal.requiredContribution);
  elements.goalRequiredCaption.textContent = `按当前 ${goal.cadence} 节奏反推`;
  elements.goalContributionGap.textContent = formatSignedCurrency(goal.contributionGap);
  elements.goalGapCaption.textContent = "正数代表需要增加，负数代表可以减少";
  elements.goalSummaryText.textContent = goal.summary;

  elements.goalContributionGap.classList.toggle("negative", goal.contributionGap > 0);
  elements.goalContributionGap.classList.toggle("positive", goal.contributionGap < 0);
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
          label: "组合累计收益率",
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
        <button type="button" class="legend-chip ${hidden.has(series.key) ? "is-muted" : ""}" data-series-key="${series.key}">
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
          <dt>组合累计收益率</dt>
          <dd>${formatPercent(row.cumulativeReturn)}</dd>
          <dt>${state.projection.backtest.shortLabel}累计涨幅</dt>
          <dd>${formatPercent(row.benchmarkGrowth - 1)}</dd>
          <dt>当年市场回报</dt>
          <dd>${index === 0 ? "--" : formatPercent(row.annualMarketReturn)}</dd>
          <dt>组合总资产</dt>
          <dd>${formatCurrency(row.endBalance)}</dd>
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
      <dl>${scenarioLines}</dl>
    `;
  }

  const row = state.projection.base.rows[index];
  const label = row.calendarYear ? String(row.calendarYear) : index === 0 ? "初始状态" : `第 ${row.year} 年`;
  const details = [
    ["总资产", formatCurrency(row.endBalance)],
    ["累计本金", formatCurrency(row.cumulativePrincipal)],
    ["累计收益", formatCurrency(row.cumulativeProfit)],
    ["累计收益率", formatPercent(row.cumulativeReturn)],
  ];

  if (index > 0) {
    details.splice(2, 0, ["本年投入", formatCurrency(row.annualContribution)]);
    details.splice(4, 0, ["本年收益", formatCurrency(row.annualInterest)]);
    details.splice(5, 0, ["年度回报", formatPercent(row.annualMarketReturn)]);
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
  highlightTableRow(index);
}

function clearChartFocus() {
  if (state.chartGeometry) {
    state.chartGeometry.focusLine.setAttribute("visibility", "hidden");
    state.chartGeometry.focusPoints.innerHTML = "";
  }

  elements.chartTooltip.hidden = true;
  highlightTableRow(-1);
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
    elements.chartModeHint.textContent = state.projection.mode === "backtest" ? "当前视图：累计涨幅对比" : "当前视图：情景对比";
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
}

function resetAll() {
  Object.entries(defaults).forEach(([key, value]) => {
    const field = elements[key];
    if (field) {
      field.value = String(value);
    }
  });

  document.querySelectorAll(".pill-group").forEach((group) => {
    const hiddenField = elements[group.dataset.group];
    const activeValue = hiddenField ? hiddenField.value : "";
    group.querySelectorAll(".pill").forEach((pill) => {
      pill.classList.toggle("is-active", pill.dataset.value === activeValue);
    });
  });

  updateProjection();
}

function exportCsv() {
  const headers = ["年份", "年初资产", "本年投入", "累计本金", "本年收益", "年度回报", "累计收益", "年末总资产", "累计收益率"];
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
      (row.cumulativeReturn * 100).toFixed(2) + "%",
    ].join(",")
  );

  const csvContent = `\uFEFF${headers.join(",")}\n${lines.join("\n")}`;
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
      pill.addEventListener("click", () => {
        hiddenField.value = pill.dataset.value;
        group.querySelectorAll(".pill").forEach((button) => {
          button.classList.toggle("is-active", button === pill);
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
  elements.form.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener("input", updateProjection);
  });

  elements.form.querySelectorAll("select").forEach((select) => {
    select.addEventListener("change", updateProjection);
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

bindPillGroups();
bindLegend();
bindForm();
bindResize();
updateProjection();
