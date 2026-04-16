const defaults = {
  initialAmount: 100000,
  years: 20,
  contributionAmount: 2000,
  contributionFrequency: "monthly",
  annualRate: 8,
  contributionTiming: "start",
  scenarioSpread: 2,
  chartMode: "breakdown",
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
  hiddenSeries: {
    breakdown: new Set(),
    scenario: new Set(),
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
  yearlyTableBody: document.getElementById("yearlyTableBody"),
  scenarioStrip: document.getElementById("scenarioStrip"),
  metricFinalValue: document.getElementById("metricFinalValue"),
  metricFinalCaption: document.getElementById("metricFinalCaption"),
  metricPrincipal: document.getElementById("metricPrincipal"),
  metricProfit: document.getElementById("metricProfit"),
  metricReturnRate: document.getElementById("metricReturnRate"),
  metricPrincipalCaption: document.getElementById("metricPrincipalCaption"),
  metricProfitCaption: document.getElementById("metricProfitCaption"),
  metricReturnCaption: document.getElementById("metricReturnCaption"),
  initialAmount: document.getElementById("initialAmount"),
  years: document.getElementById("years"),
  contributionAmount: document.getElementById("contributionAmount"),
  contributionFrequency: document.getElementById("contributionFrequency"),
  annualRate: document.getElementById("annualRate"),
  contributionTiming: document.getElementById("contributionTiming"),
  scenarioSpread: document.getElementById("scenarioSpread"),
  chartMode: document.getElementById("chartMode"),
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

function sanitizeInputs() {
  const parsed = {
    initialAmount: Math.max(0, Math.round(toNumber(elements.initialAmount.value, defaults.initialAmount))),
    years: clamp(Math.round(toNumber(elements.years.value, defaults.years)), 1, 50),
    contributionAmount: Math.max(0, Math.round(toNumber(elements.contributionAmount.value, defaults.contributionAmount))),
    contributionFrequency: elements.contributionFrequency.value === "yearly" ? "yearly" : "monthly",
    annualRate: clamp(toNumber(elements.annualRate.value, defaults.annualRate), -50, 80),
    contributionTiming: elements.contributionTiming.value === "end" ? "end" : "start",
    scenarioSpread: clamp(Math.abs(toNumber(elements.scenarioSpread.value, defaults.scenarioSpread)), 0, 15),
    chartMode: elements.chartMode.value === "scenario" ? "scenario" : "breakdown",
  };

  elements.initialAmount.value = String(parsed.initialAmount);
  elements.years.value = String(parsed.years);
  elements.contributionAmount.value = String(parsed.contributionAmount);
  elements.annualRate.value = String(parsed.annualRate);
  elements.scenarioSpread.value = String(parsed.scenarioSpread);

  state.inputs = parsed;
  return parsed;
}

function simulateScenario(inputs, annualRateDecimal) {
  const monthlyRate = Math.pow(1 + clamp(annualRateDecimal, -0.99, 5), 1 / 12) - 1;
  const rows = [];

  let balance = inputs.initialAmount;
  let cumulativePrincipal = inputs.initialAmount;

  rows.push({
    year: 0,
    yearStartBalance: inputs.initialAmount,
    annualContribution: 0,
    cumulativePrincipal,
    annualInterest: 0,
    cumulativeProfit: balance - cumulativePrincipal,
    endBalance: balance,
    cumulativeReturn: safeRatio(balance - cumulativePrincipal, cumulativePrincipal),
  });

  for (let year = 1; year <= inputs.years; year += 1) {
    const yearStartBalance = balance;
    let annualContribution = 0;
    let annualInterest = 0;

    for (let month = 1; month <= 12; month += 1) {
      const isMonthlyContribution = inputs.contributionFrequency === "monthly";
      const isYearlyAtStart = inputs.contributionFrequency === "yearly" && inputs.contributionTiming === "start" && month === 1;
      const isYearlyAtEnd = inputs.contributionFrequency === "yearly" && inputs.contributionTiming === "end" && month === 12;
      const shouldContribute = isMonthlyContribution || isYearlyAtStart || isYearlyAtEnd;

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
    const cumulativeProfit = balance - cumulativePrincipal;

    rows.push({
      year,
      yearStartBalance,
      annualContribution,
      cumulativePrincipal,
      annualInterest,
      cumulativeProfit,
      endBalance: balance,
      cumulativeReturn: safeRatio(cumulativeProfit, cumulativePrincipal),
    });
  }

  return {
    annualRate: annualRateDecimal,
    monthlyRate,
    rows,
    finalRow: rows[rows.length - 1],
  };
}

function calculateProjection(inputs) {
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
    simulation: simulateScenario(inputs, scenario.rate),
  }));

  return {
    scenarios,
    base: scenarios.find((scenario) => scenario.key === "base").simulation,
  };
}

function buildScenarioCards() {
  const markup = state.projection.scenarios
    .map((scenario) => {
      const tone = scenario.key;
      return `
        <article class="scenario-card" data-tone="${tone}">
          <span>${scenario.label}</span>
          <strong>${formatCurrency(scenario.simulation.finalRow.endBalance)}</strong>
          <span>年化假设 ${formatPercent(scenario.rate)}</span>
        </article>
      `;
    })
    .join("");

  elements.scenarioStrip.innerHTML = markup;
}

function updateMetrics() {
  const baseFinal = state.projection.base.finalRow;
  const annualContributionLabel = state.inputs.contributionFrequency === "monthly" ? "每月定投" : "每年定投";

  elements.metricFinalValue.textContent = formatCurrency(baseFinal.endBalance);
  elements.metricFinalCaption.textContent = `${state.inputs.years} 年后的基准情景终值`;
  elements.metricPrincipal.textContent = formatCurrency(baseFinal.cumulativePrincipal);
  elements.metricPrincipalCaption.textContent = `初始本金 + ${annualContributionLabel}`;
  elements.metricProfit.textContent = formatCurrency(baseFinal.cumulativeProfit);
  elements.metricProfitCaption.textContent = `${formatPercent(state.projection.base.annualRate)} 固定年化假设`;
  elements.metricReturnRate.textContent = formatPercent(baseFinal.cumulativeReturn);
  elements.metricReturnCaption.textContent = `累计收益 / 累计本金`;
  elements.metricProfit.classList.toggle("negative", baseFinal.cumulativeProfit < 0);
  elements.metricReturnRate.classList.toggle("negative", baseFinal.cumulativeReturn < 0);
}

function renderTable() {
  const rows = state.projection.base.rows.slice(1);

  elements.yearlyTableBody.innerHTML = rows
    .map((row) => {
      const profitClass = row.cumulativeProfit >= 0 ? "positive" : "negative";
      return `
        <tr data-year="${row.year}">
          <td>第 ${row.year} 年</td>
          <td>${formatCurrency(row.yearStartBalance)}</td>
          <td>${formatCurrency(row.annualContribution)}</td>
          <td>${formatCurrency(row.cumulativePrincipal)}</td>
          <td class="${row.annualInterest >= 0 ? "positive" : "negative"}">${formatCurrency(row.annualInterest)}</td>
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

function getScenarioSeries() {
  const rows = state.projection.base.rows;
  return {
    mode: "scenario",
    rows,
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
  return state.inputs.chartMode === "scenario" ? getScenarioSeries() : getBreakdownSeries();
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
    element.setAttribute(key, String(value));
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
  if (state.inputs.chartMode === "scenario") {
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
  const details = [
    ["总资产", formatCurrency(row.endBalance)],
    ["累计本金", formatCurrency(row.cumulativePrincipal)],
    ["累计收益", formatCurrency(row.cumulativeProfit)],
    ["累计收益率", formatPercent(row.cumulativeReturn)],
  ];

  if (index > 0) {
    details.splice(2, 0, ["本年投入", formatCurrency(row.annualContribution)]);
    details.splice(4, 0, ["本年收益", formatCurrency(row.annualInterest)]);
  }

  return `
    <h3>${index === 0 ? "初始状态" : `第 ${row.year} 年`}</h3>
    <dl>
      ${details.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("")}
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
  const rawMax = Math.max(1, ...allValues);
  const range = rawMax - rawMin || 1;
  const paddedMin = rawMin - range * 0.08;
  const paddedMax = rawMax + range * 0.12;
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
    label.textContent = formatCompactCurrency(value);
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
    label.textContent = index === 0 ? "起点" : `${index}年`;
    root.appendChild(label);
  });

  if (state.inputs.chartMode === "breakdown") {
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
    const baseSeries = visibleSeries.find((series) => series.key === "base");
    if (baseSeries) {
      const basePoints = baseSeries.values.map((value, index) => ({ x: xScale(index), y: yScale(value) }));
      const baselinePoints = baseSeries.values.map((_, index) => ({ x: xScale(index), y: yScale(0) }));

      root.appendChild(
        createSvgElement("path", {
          d: buildAreaPath(basePoints, baselinePoints),
          fill: baseSeries.fill,
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
  elements.chartModeHint.textContent = state.inputs.chartMode === "scenario" ? "当前视图：情景对比" : "当前视图：资产拆解";
}

function updateProjection() {
  const inputs = sanitizeInputs();
  state.projection = calculateProjection(inputs);
  buildScenarioCards();
  updateMetrics();
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
  const headers = ["年份", "年初资产", "本年投入", "累计本金", "本年收益", "累计收益", "年末总资产", "累计收益率"];
  const lines = state.projection.base.rows.slice(1).map((row) =>
    [
      row.year,
      row.yearStartBalance.toFixed(2),
      row.annualContribution.toFixed(2),
      row.cumulativePrincipal.toFixed(2),
      row.annualInterest.toFixed(2),
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

  elements.resetButton.addEventListener("click", resetAll);
  elements.exportButton.addEventListener("click", exportCsv);
  elements.chartSurface.addEventListener("mousemove", handleSurfacePointer);
  elements.chartSurface.addEventListener("mouseleave", clearChartFocus);
  elements.chartSurface.addEventListener("touchstart", (event) => {
    if (!event.touches[0]) {
      return;
    }
    handleSurfacePointer(event.touches[0]);
  }, { passive: true });
  elements.chartSurface.addEventListener("touchmove", (event) => {
    if (!event.touches[0]) {
      return;
    }
    handleSurfacePointer(event.touches[0]);
  }, { passive: true });
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
