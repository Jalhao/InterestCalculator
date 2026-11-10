/* Data loading and user-owned local scenarios. No external browser API keys. */
const INPUT_STORAGE = 'interest-calculator:inputs:v1';
const PLAN_STORAGE = 'interest-calculator:plans:v1';
const DATA_STORAGE = 'interest-calculator:market:v1';
function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function savedInputs() {
  return { ...state.inputs, backtestPrecision: elements.backtestPrecision.value };
}
function saveCurrentInputs() {
  writeLocal(INPUT_STORAGE, savedInputs());
}
function applyInputs(inputs) {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) return;
  for (const [key, fallback] of Object.entries(defaults)) {
    if (!Object.hasOwn(inputs, key)) continue;
    const value = inputs[key];
    const field = elements[key];
    if (!field) continue;
    if (typeof fallback === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      field.value = String(value);
    } else if (typeof fallback === 'boolean') {
      field.checked = value === true;
    } else {
      if (typeof value !== 'string' || value.length > 40) continue;
      if (field.tagName === 'SELECT' && ![...field.options].some(option => option.value === value)) continue;
      if (['calculationMode', 'contributionFrequency', 'contributionTiming', 'chartMode'].includes(key)) {
        const choices = { calculationMode: ['projection','backtest'], contributionFrequency: ['monthly','yearly'], contributionTiming: ['start','end'], chartMode: ['breakdown','comparison'] };
        if (!choices[key].includes(value)) continue;
      }
      field.value = value;
    }
  }
  document.querySelectorAll('.pill-group').forEach(group => {
    const value = elements[group.dataset.group]?.value;
    group.querySelectorAll('.pill').forEach(button => {
      button.classList.toggle('is-active', button.dataset.value === value);
      button.setAttribute('aria-pressed', String(button.dataset.value === value));
    });
  });
}
function restoreInputs() {
  let inputs = readLocal(INPUT_STORAGE, null);
  try {
    const shared = new URL(location.href).searchParams.get('plan');
    if (shared && shared.length <= 6000) inputs = JSON.parse(shared);
  } catch { /* Ignore malformed shared inputs. */ }
  applyInputs(inputs);
}
async function sharePlan() {
  const url = new URL(location.href);
  url.searchParams.set('plan', JSON.stringify(savedInputs()));
  try {
    await navigator.clipboard.writeText(url.href);
    elements.planStatus.textContent = '方案链接已复制。';
  } catch {
    const field = document.getElementById('shareUrl');
    field.hidden = false; field.value = url.href; field.select();
    elements.planStatus.textContent = '请复制下方方案链接。';
  }
}
function getPlans() {
  const plans = readLocal(PLAN_STORAGE, []);
  return Array.isArray(plans) ? plans.filter(plan => plan && typeof plan.name === 'string' && plan.inputs && typeof plan.inputs === 'object').slice(0, 4) : [];
}
function savePlan() {
  const plans = getPlans();
  if (plans.length >= 4) { elements.planStatus.textContent = '最多保存 4 个方案，请先删除旧方案。'; return; }
  const name = document.getElementById('planName').value.trim().slice(0, 40) || `方案 ${plans.length + 1}`;
  plans.push({ name, inputs: savedInputs() });
  elements.planStatus.textContent = writeLocal(PLAN_STORAGE, plans) ? '方案已保存在此浏览器；各方案按当前可用数据重算。' : '浏览器未允许保存，请使用分享链接。';
  renderPlans();
}
function renderPlans() {
  const plans = getPlans();
  elements.planList.replaceChildren();
  plans.forEach((plan, index) => {
    const card = document.createElement('article'); card.className = 'insight-card';
    const name = document.createElement('h3'); name.textContent = plan.name;
    const value = document.createElement('p');
    const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'text-button'; restore.textContent = '载入方案';
    restore.addEventListener('click', () => { applyInputs(plan.inputs); updateProjection(); renderDataStatus(); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = '删除';
    remove.addEventListener('click', () => { const next = getPlans(); next.splice(index, 1); writeLocal(PLAN_STORAGE, next); renderPlans(); });
    // Use the same sanitization and selection rules as the main UI. Restore current UI after preview.
    const previous = savedInputs();
    try {
      applyInputs(plan.inputs); syncBacktestControls();
      const inputs = sanitizeInputs();
      const projection = calculateProjection(inputs);
      const row = projection.base.finalRow;
      const missingMonthly = inputs.calculationMode === 'backtest' && plan.inputs.backtestPrecision === 'monthly' && !state.monthlyData[inputs.backtestDataset];
      value.textContent = missingMonthly ? '月度数据尚未就绪，暂不比较。' : `终值 ${formatCurrency(row.endBalance)} · 投入 ${formatCurrency(row.cumulativePrincipal)} · 购买力 ${formatCurrency(row.realEndBalance)} · 年化 ${projection.base.moneyWeightedReturn === null ? "不适用" : formatPercent(projection.base.moneyWeightedReturn)} · ${Number(row.year.toFixed(2))} 年`;
    } catch { value.textContent = '数据区间不可用，请载入后调整。'; }
    finally { applyInputs(previous); syncBacktestControls(); sanitizeInputs(); }
    card.append(name, value, restore, remove); elements.planList.append(card);
  });
}
function renderDataStatus() {
  const data = state.monthlyData[elements.backtestDataset.value];
  if (!data || elements.backtestPrecision.value !== 'monthly') {
    elements.dataStatus.textContent = `${state.dataMessage} 当前使用年度示例近似模拟；数据源未核验，不作为精确回测。`;
    return;
  }
  const last = data.prices.at(-1).date;
  const now = new Date();
  const expected = now.getUTCFullYear() * 12 + now.getUTCMonth() - 1;
  const stale = InvestmentEngine.monthIndex(last) < expected;
  elements.dataStatus.textContent = `${state.dataMessage} Yahoo Finance · ${data.symbol} · 月末点位截至 ${last} · 抓取于 ${data.updatedAt.slice(0, 10)}。${stale ? '数据已滞后，刷新后仍滞后请检查自动更新任务。' : ''} 美元价格指数，不含分红再投资、税费或汇率。`;
}
async function loadMarketData(refresh = false) {
  if (elements.refreshData.disabled) return;
  elements.refreshData.disabled = true;
  if (!Object.keys(state.monthlyData).length) {
    try { state.monthlyData = InvestmentEngine.validateMarketData(readLocal(DATA_STORAGE, null)); }
    catch { /* An invalid cache must never become a simulation input. */ }
  }
  state.dataMessage = '正在检查已发布行情…'; renderDataStatus();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`data/market-data.json${refresh ? '?t=' + Date.now() : ''}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('行情请求失败');
    const payload = await response.json();
    const validated = InvestmentEngine.validateMarketData(payload);
    // Keep a newer validated cached snapshot if a stale deployment is served.
    const regressed = ['sp500', 'nasdaq100'].some(key => state.monthlyData[key] && validated[key].prices.at(-1).date < state.monthlyData[key].prices.at(-1).date);
    if (regressed) {
      state.dataMessage = '发布文件落后于本地缓存，继续使用已验证缓存。';
    } else {
      state.monthlyData = validated; writeLocal(DATA_STORAGE, payload);
      state.dataMessage = '已载入行情快照。';
    }
  } catch {
    state.dataMessage = Object.keys(state.monthlyData).length ? '刷新失败，继续使用已验证缓存。' : '月度行情尚未发布或暂不可用。';
  } finally {
    clearTimeout(timeout); elements.refreshData.disabled = false;
    updateProjection(); renderDataStatus(); renderPlans();
  }
}
