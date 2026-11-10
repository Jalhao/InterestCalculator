/* Pure calculation engine; usable by browsers and Node's built-in test runner. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.InvestmentEngine = factory();
})(globalThis, function () {
  'use strict';
  const MAX_CONTRIBUTION = 1e12;
  const ratio = (a, b) => b ? a / b : 0;
  const inflationFactor = (inputs, months) => (1 + inputs.inflationRate / 100) ** (months / 12);

  function moneyWeightedAnnualReturn(flows, finalBalance, months) {
    if (!months || !flows.some(f => f.amount > 0)) return null;
    if (finalBalance <= 0) return -1;
    const value = rate => flows.reduce((sum, f) => sum + f.amount * (1 + rate) ** (months - f.month), 0);
    let low = -0.999999999, high = 1;
    while (value(high) < finalBalance && high < 1e6) high *= 2;
    if (value(low) > finalBalance || value(high) < finalBalance) return null;
    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      if (value(mid) >= finalBalance) high = mid;
      else low = mid;
    }
    const annual = (1 + (low + high) / 2) ** 12 - 1;
    return Number.isFinite(annual) ? annual : null;
  }

  function simulateMonths(inputs, periods) {
    if (!periods.length || periods.some(p => !Number.isFinite(p.rate) || p.rate <= -1)) {
      throw new Error('需要连续、有效的月收益数据');
    }
    let balance = inputs.initialAmount, principal = balance, realPrincipal = balance;
    let benchmarkGrowth = 1, yearInterest = 0, yearContribution = 0, yearGrowth = 1;
    let yearStart = balance, groupStart = 0;
    const flows = [{ month: 0, amount: balance }];
    const rows = [], monthlyRows = [];
    const makeRow = (months, label, annualReturn) => {
      const factor = inflationFactor(inputs, months);
      const realEndBalance = balance / factor;
      return {
        year: months / 12, months, calendarYear: label || null,
        yearStartBalance: yearStart, annualContribution: yearContribution,
        cumulativePrincipal: principal, annualInterest: yearInterest,
        annualMarketReturn: annualReturn, benchmarkGrowth,
        cumulativeProfit: balance - principal, endBalance: balance,
        cumulativeReturn: ratio(balance - principal, principal),
        inflationFactor: factor, realEndBalance, realCumulativePrincipal: realPrincipal,
        realCumulativeProfit: realEndBalance - realPrincipal,
        realCumulativeReturn: ratio(realEndBalance - realPrincipal, realPrincipal),
        purchasingPowerDrag: balance - realEndBalance,
      };
    };
    rows.push(makeRow(0, null, 0));
    monthlyRows.push(rows[0]);
    periods.forEach((period, i) => {
      const monthly = inputs.contributionFrequency === 'monthly';
      // Annual contributions occur once each investment year, not each calendar year.
      const contribute = monthly || (inputs.contributionTiming === 'start' ? i % 12 === 0 : i % 12 === 11);
      const add = month => {
        balance += inputs.contributionAmount;
        principal += inputs.contributionAmount;
        yearContribution += inputs.contributionAmount;
        realPrincipal += inputs.contributionAmount / inflationFactor(inputs, month);
        flows.push({ month, amount: inputs.contributionAmount });
      };
      if (contribute && inputs.contributionTiming === 'start') add(i);
      const interest = balance * period.rate;
      balance += interest;
      yearInterest += interest;
      if (contribute && inputs.contributionTiming === 'end') add(i + 1);
      benchmarkGrowth *= 1 + period.rate;
      yearGrowth *= 1 + period.rate;
      monthlyRows.push(makeRow(i + 1, period.date || period.label, yearGrowth - 1));
      if ((i + 1) % 12 === 0 || i === periods.length - 1) {
        const label = period.label || (period.date ? `${periods[groupStart].date}—${period.date}` : null);
        rows.push(makeRow(i + 1, label, yearGrowth - 1));
        groupStart = i + 1; yearStart = balance;
        yearInterest = 0; yearContribution = 0; yearGrowth = 1;
      }
    });
    const descriptors = rows.slice(1).map(row => ({ label: row.calendarYear || `第 ${row.year} 年`, rate: row.annualMarketReturn }));
    return {
      rows, monthlyRows, finalRow: rows.at(-1), periods,
      annualRates: descriptors.map(p => p.rate), yearLabels: descriptors.map(p => p.label),
      averageAnnualReturn: descriptors.reduce((s, p) => s + p.rate, 0) / descriptors.length,
      bestPeriod: descriptors.reduce((a, b) => !a || b.rate > a.rate ? b : a, null),
      worstPeriod: descriptors.reduce((a, b) => !a || b.rate < a.rate ? b : a, null),
      negativeYearsCount: descriptors.filter(p => p.rate < 0).length,
      benchmarkCagr: benchmarkGrowth ** (12 / periods.length) - 1,
      moneyWeightedReturn: moneyWeightedAnnualReturn(flows, balance, periods.length),
    };
  }

  function simulateAnnualSeries(inputs, rates, labels = []) {
    return simulateMonths(inputs, rates.flatMap((rate, i) => Array.from({ length: 12 }, () => ({
      rate: (1 + rate) ** (1 / 12) - 1, label: labels[i] || null,
    }))));
  }

  function solveContribution(simulate, target) {
    const zero = simulate(0).finalRow.endBalance;
    if (zero >= target) return { amount: 0, supported: true };
    // Terminal wealth is affine in the contribution amount for a fixed return path.
    // A sizeable probe avoids subtractive cancellation for large initial balances.
    const probe = Math.max(1000, Math.abs(zero) * 1e-6);
    const coefficient = (simulate(probe).finalRow.endBalance - zero) / probe;
    const raw = (target - zero) / coefficient;
    if (!(coefficient > 0) || !Number.isFinite(raw) || raw > MAX_CONTRIBUTION) return { amount: null, supported: false };
    let amount = Math.max(0, Math.ceil(raw));
    if (simulate(amount).finalRow.endBalance < target) amount++;
    return amount <= MAX_CONTRIBUTION && simulate(amount).finalRow.endBalance >= target
      ? { amount, supported: true } : { amount: null, supported: false };
  }

  function monthIndex(date) {
    if (typeof date !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) throw new Error('月份格式无效');
    return Number(date.slice(0, 4)) * 12 + Number(date.slice(5)) - 1;
  }
  function validateMarketData(payload, now = new Date()) {
    if (!payload || payload.schemaVersion !== 1 || !payload.datasets || typeof payload.updatedAt !== 'string' || !Number.isFinite(Date.parse(payload.updatedAt)) || Date.parse(payload.updatedAt) > now.getTime() + 86400000) throw new Error('行情文件格式无效');
    const currentMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
    const validated = {};
    for (const key of ['sp500', 'nasdaq100']) {
      const data = payload.datasets[key];
      if (!data || data.currency !== 'USD' || data.returnType !== 'price' || data.symbol !== (key === 'sp500' ? '^GSPC' : '^NDX') || !Array.isArray(data.prices) || data.prices.length < 13) throw new Error('行情至少需要 13 个连续月末点位');
      let previous = null;
      for (const p of data.prices) {
        const month = monthIndex(p.date);
        if (month >= currentMonth || previous !== null && month !== previous + 1 || !Number.isFinite(p.close) || p.close <= 0) throw new Error('行情包含缺月、重复、未结束月份或无效点位');
        previous = month;
      }
      validated[key] = { ...data, updatedAt: payload.updatedAt };
    }
    return validated;
  }
  function monthlySlice(data, start, end) {
    const prices = data.prices;
    const first = prices.findIndex(p => p.date === start);
    const last = prices.findIndex(p => p.date === end);
    if (first < 1 || last < first) throw new Error('回测起止月份超出数据范围');
    return prices.slice(first, last + 1).map((p, i) => ({ date: p.date, rate: p.close / prices[first + i - 1].close - 1 }));
  }
  return { simulateMonths, simulateAnnualSeries, solveContribution, moneyWeightedAnnualReturn, validateMarketData, monthlySlice, monthIndex, MAX_CONTRIBUTION };
});
