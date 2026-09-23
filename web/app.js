/* 記帳儀表板 — 讀 data.json 快照（export_snapshot.py 產生）
   支援兩種模式：
   - summary（公開 Pages 版）：只有月總額/月×分類/日總額，無明細無備註
   - full（本機版）：含單筆明細與備註
*/
"use strict";

// ── 台灣綜所稅級距速算（不含扣除額，粗算用）──
const TAX_BRACKETS = [
  { limit: 590000, rate: 0.05 },
  { limit: 1330000, rate: 0.12 },
  { limit: 2660000, rate: 0.20 },
  { limit: 4980000, rate: 0.30 },
  { limit: Infinity, rate: 0.40 },
];

function taxAnnual(annualIncome) {
  let tax = 0, prev = 0;
  for (const b of TAX_BRACKETS) {
    if (annualIncome > prev) {
      tax += (Math.min(annualIncome, b.limit) - prev) * b.rate;
      prev = b.limit;
    } else break;
  }
  return tax;
}

function fmt(n) {
  if (n == null || isNaN(n)) return "—";
  return "$" + Math.round(n).toLocaleString("zh-TW");
}

let SNAPSHOT = null;

async function loadSnapshot() {
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("data.json 讀取失敗：" + res.status);
  SNAPSHOT = await res.json();
  document.getElementById("updated-at").textContent =
    "資料更新於 " + SNAPSHOT.generatedAt.replace("T", " ").slice(0, 16) +
    (SNAPSHOT.mode === "summary" ? "（摘要版）" : "");
}

// ── 統一取資料介面：把 summary/full 轉成圖表需要的形狀 ──
function getData() {
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);

  let byMonth = {}, byMonthCat = {}, dailyTotals = {}, months = [];

  if (SNAPSHOT.mode === "summary") {
    byMonth = SNAPSHOT.byMonth || {};
    byMonthCat = SNAPSHOT.byMonthCategory || {};
    dailyTotals = SNAPSHOT.byDay || {};
    months = Object.keys(byMonth).sort();
  } else {
    const catMap = {};
    for (const r of (SNAPSHOT.records || [])) {
      const amount = Number(r.amount) || 0;
      if (amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
      const m = r.date.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + amount;
      catMap[m] = catMap[m] || {};
      catMap[m][r.category] = (catMap[m][r.category] || 0) + amount;
      dailyTotals[r.date] = (dailyTotals[r.date] || 0) + amount;
    }
    byMonthCat = catMap;
    months = Object.keys(byMonth).sort();
  }

  const monthTotal = byMonth[thisMonth] || 0;
  const dayOfMonth = now.getDate();
  const dailyAvg = dayOfMonth > 0 ? monthTotal / dayOfMonth : 0;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projection = dailyAvg * daysInMonth;

  const baseline = months.length
    ? months.reduce((s, m) => s + byMonth[m], 0) / months.length
    : 0;

  return { thisMonth, byMonth, byMonthCat, dailyTotals, monthTotal, dailyAvg, projection, baseline, months };
}

// ── 圖表 ──
const ROSE_PALETTE = ["#c76f88", "#e8a2b4", "#f3c6d2", "#9d4f66", "#d98ba1",
  "#b56a82", "#efb9c8", "#8a3f55", "#e399ad", "#c98da0", "#dcc2cb"];

function drawPie(catTotals) {
  const entries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  document.getElementById("pie-empty").hidden = entries.length > 0;
  new Chart(document.getElementById("pie-chart"), {
    type: "doughnut",
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{ data: entries.map(e => e[1]), backgroundColor: ROSE_PALETTE, borderWidth: 2, borderColor: "#fff" }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "55%",
      plugins: { legend: { position: "right", labels: { color: "#5c3a44", font: { size: 12 } } } },
    },
  });
}

function drawTrend(dailyTotals) {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  new Chart(document.getElementById("trend-chart"), {
    type: "line",
    data: {
      labels: days.map(d => d.slice(5)),
      datasets: [{
        label: "當日支出",
        data: days.map(d => dailyTotals[d] || 0),
        borderColor: "#c76f88", backgroundColor: "rgba(232,162,180,0.25)",
        fill: true, tension: 0.35, pointRadius: 2.5,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: "#8a6572", maxTicksLimit: 8 } }, y: { ticks: { color: "#8a6572" } } },
    },
  });
}

function drawMonthly(byMonth, months) {
  new Chart(document.getElementById("monthly-chart"), {
    type: "bar",
    data: {
      labels: months,
      datasets: [{
        label: "月支出",
        data: months.map(m => byMonth[m]),
        backgroundColor: "rgba(232,162,180,0.75)",
        borderColor: "#c76f88", borderWidth: 1.5, borderRadius: 8,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: "#8a6572" } }, y: { ticks: { color: "#8a6572" } } },
    },
  });
}

// ── 可複用的「項目列表」（支出預估表與收入來源共用）──
function makeList(listEl, storeKey, preset) {
  const items = [];

  function addItem(item = { name: "", amount: null }) {
    items.push(item);

    const row = document.createElement("div");
    row.className = "budget-item";

    const name = document.createElement("input");
    name.className = "item-name";
    name.placeholder = "項目名稱";
    name.value = item.name || "";

    const amount = document.createElement("input");
    amount.className = "item-amount";
    amount.type = "number";
    amount.min = "0";
    amount.step = "100";
    amount.placeholder = "金額";
    amount.value = item.amount ?? "";

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del-btn";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      const i = items.indexOf(item);
      if (i >= 0) items.splice(i, 1);
      row.remove();
      onChange();
    });

    name.addEventListener("input", () => { item.name = name.value; onChange(); });
    amount.addEventListener("input", () => { item.amount = amount.value === "" ? null : Number(amount.value); onChange(); });

    row.append(name, amount, del);
    listEl.appendChild(row);
  }

  let onChange = () => {};

  // localStorage 還原（有的話），否則用預設
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || "null");
    if (Array.isArray(saved) && saved.length) {
      saved.forEach(it => addItem(it));
    } else {
      preset.forEach(p => addItem({ name: p, amount: null }));
    }
  } catch (e) {
    preset.forEach(p => addItem({ name: p, amount: null }));
  }

  return {
    addItem,
    get total() { return items.reduce((s, it) => s + (Number(it.amount) || 0), 0); },
    get items() { return items; },
    setListener(fn) { onChange = fn; },
    save() { try { localStorage.setItem(storeKey, JSON.stringify(items)); } catch (e) {} },
  };
}

// ── 夢想清單：一次性目標，攤提每月需存 ──
// 攤提公式：夢想總價（通膨調整後） − 夢想收入稅後淨額，除以目標月數
function makeDreams(listEl, storeKey, onChange) {
  const items = [];  // { name, cost, years, income }

  function addItem(item = { name: "", cost: null, years: null, income: null }) {
    items.push(item);

    const row = document.createElement("div");
    row.className = "dream-row";

    function cell(cls, placeholder, value, type = "text") {
      const el = document.createElement("input");
      el.className = cls;
      el.placeholder = placeholder;
      if (type === "number") { el.type = "number"; el.min = "0"; }
      el.value = value ?? "";
      return el;
    }
    const name = cell("d-name", "例如：頭款、日本之旅", item.name);
    const cost = cell("d-num c", "總價", item.cost, "number");
    const years = cell("d-num c", "年", item.years, "number");
    const income = cell("d-num c", "0", item.income, "number");
    const need = document.createElement("span");
    need.className = "d-need c";

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del-btn";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      const i = items.indexOf(item);
      if (i >= 0) items.splice(i, 1);
      row.remove();
      onChange();
    });

    name.addEventListener("input", () => { item.name = name.value; onChange(); });
    cost.addEventListener("input", () => { item.cost = cost.value === "" ? null : Number(cost.value); onChange(); });
    years.addEventListener("input", () => { item.years = years.value === "" ? null : Number(years.value); onChange(); });
    income.addEventListener("input", () => { item.income = income.value === "" ? null : Number(income.value); onChange(); });

    row.append(name, cost, years, income, need, del);
    listEl.appendChild(row);
    item._needEl = need;
  }

  // localStorage 還原
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || "null");
    if (Array.isArray(saved)) saved.forEach(it => addItem(it));
  } catch (e) {}

  return {
    addItem,
    // 每個夢想的「每月還需存」：通膨調整總價 − 夢想收入稅後淨，再除以月數
    monthlyNeed(inflation, globalYears) {
      let sum = 0;
      for (const it of items) {
        const cost = Number(it.cost) || 0;
        let need = 0;
        if (cost > 0) {
          const years = Number(it.years) || globalYears || 0;
          const inflated = cost * Math.pow(1 + inflation, years);
          const months = Math.max(years * 12, 1);
          const netIncome = it.income > 0
            ? (it.income - taxAnnual(it.income)) : 0;
          need = Math.max((inflated - netIncome) / months, 0);
        }
        if (it._needEl) {
          it._needEl.textContent = need > 0 ? fmt(need) : "—";
          it._needEl.classList.toggle("done", need === 0 && cost > 0);
        }
        sum += need;
      }
      // 清掉已移除項目的殘留 reference
      return sum;
    },
    totalCost(inflation) {
      return items.reduce((s, it) => {
        const c = Number(it.cost) || 0;
        const years = Number(it.years) || 0;
        return s + (c > 0 ? c * Math.pow(1 + inflation, years) : 0);
      }, 0);
    },
    totalIncome() {
      return items.reduce((s, it) => s + (Number(it.income) || 0), 0);
    },
    save() { try { localStorage.setItem(storeKey, JSON.stringify(items.map(({ _needEl, ...rest }) => rest))); } catch (e) {} },
  };
}

// ── 試算器 ──
function setupEstimator(sum) {
  const $ = id => document.getElementById(id);

  const budget = makeList($("budget-list"), "budget-estimator-v1", ["房租", "餐費", "交通", "訂閱"]);
  const income = makeList($("income-list"), "income-estimator-v1", ["本業", "副業"]);
  $("add-item").addEventListener("click", () => budget.addItem());
  $("add-income").addEventListener("click", () => income.addItem());

  const dreams = makeDreams($("dream-list"), "dream-estimator-v1", compute);
  $("add-dream").addEventListener("click", () => { dreams.addItem(); compute(); });

  function compute() {
    const total0 = budget.total;
    const income0 = income.total;
    const cash = Number($("in-cash").value) || 0;
    const stock = Number($("in-stock").value) || 0;
    const inflation = (Number($("in-inflation").value) || 0) / 100;
    const years = Number($("in-years").value) || 0;

    // 通膨調整：支出與收入都放大（收入假設不隨通膨自動漲，比較保守）
    const factor = Math.pow(1 + inflation, years);
    const ideal = total0 * factor;
    $("r-years-label").textContent = years > 0 ? `${years} 年後` : "今年";
    $("budget-total").textContent = years > 0 && factor !== 1
      ? `${fmt(total0)} → ${fmt(ideal)}` : fmt(total0);
    $("income-total").textContent = fmt(income0);

    $("r-baseline").textContent = fmt(sum.baseline);
    $("r-ideal").textContent = ideal > 0 ? fmt(ideal) : "—";

    // 收入稅後（多來源合計，一起套級距）
    let netMonthly = null;
    if (income0 > 0) {
      const tax = taxAnnual(income0 * 12);
      netMonthly = (income0 * 12 - tax) / 12;
      $("r-tax").textContent = `年收入 ${fmt(income0 * 12)} → 年稅額約 ${fmt(tax)}`;
      $("r-net").textContent = fmt(netMonthly);
    } else {
      $("r-tax").textContent = "—";
      $("r-net").textContent = "—";
    }

    // 每月結餘
    let surplus = null;
    if (netMonthly != null) {
      surplus = netMonthly - ideal;
      $("r-surplus").textContent = (surplus >= 0 ? "+" : "−") + fmt(Math.abs(surplus)).slice(0);
      $("r-surplus").style.color = surplus >= 0 ? "#4d8b6a" : "#c0392b";
    } else {
      $("r-surplus").textContent = "—";
    }

    // 夢想攤提
    const dreamNeed = dreams.monthlyNeed(inflation, years);
    const dreamCost = dreams.totalCost(inflation);
    const dreamInc = dreams.totalIncome();
    $("dream-sum").textContent = dreamCost > 0 ? fmt(dreamCost) : "—";
    $("dream-income-sum").textContent = dreamInc > 0 ? fmt(dreamInc) : "—";
    $("dream-total").textContent = dreamNeed > 0 ? `${fmt(dreamNeed)}/月` : "—";
    $("r-dream").textContent = dreamNeed > 0 ? fmt(dreamNeed) : "—";

    // 扣掉夢想後結餘
    if (netMonthly != null) {
      const after = surplus - dreamNeed;
      const el = $("r-after-dream");
      el.textContent = (after >= 0 ? "+" : "−") + fmt(Math.abs(after));
      el.style.color = after >= 0 ? "#4d8b6a" : "#c0392b";
    } else {
      $("r-after-dream").textContent = "—";
    }

    // 資產跑道：總資產 / 每月支出（股票視為可變現，標註假設）
    const assets = cash + stock;
    let runwayMonths = null;
    if (assets > 0 && ideal > 0) {
      runwayMonths = assets / ideal;
      const y = Math.floor(runwayMonths / 12);
      const m = Math.round(runwayMonths % 12);
      $("r-runway").textContent = y > 0 ? `${y} 年 ${m} 個月` : `${Math.round(runwayMonths * 10) / 10} 個月`;
    } else if (assets > 0 && ideal === 0) {
      $("r-runway").textContent = "填預算才知道";
    } else {
      $("r-runway").textContent = "—";
    }

    // 維持預算所需的稅前月收入（二分反推）
    let needed = null;
    if (ideal > 0) {
      let lo = 0, hi = ideal * 4 + 1000000;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const t = taxAnnual(mid * 12);
        if ((mid * 12 - t) / 12 >= ideal) hi = mid; else lo = mid;
      }
      needed = hi;
      $("r-needed").textContent = fmt(needed);
    } else {
      $("r-needed").textContent = "—";
    }

    // 判定
    const verdict = $("r-verdict");
    verdict.className = "verdict";
    const hasAssets = assets > 0;
    if (ideal > 0 && netMonthly != null && hasAssets) {
      const gap = surplus;
      if (gap >= 0) {
        const growMonths = gap > 0 ? assets / gap : Infinity;
        verdict.textContent = `收入撐得起這份預算：每月多 ${fmt(gap)}，加上資產 ${fmt(assets)}，就算明天斷收入也有 ${$("r-runway").textContent} 跑道。`;
        verdict.classList.add("good");
      } else {
        const cover = runwayMonths != null ? runwayMonths.toFixed(1) : "?";
        verdict.textContent = `每月缺口 ${fmt(-gap)}，目前靠資產可撐約 ${cover} 個月。要轉正，稅前月收入需 ${fmt(needed)}，或把預算壓到 ${fmt(netMonthly)} 以下。`;
        verdict.classList.add("warn");
      }
    } else if (ideal > 0 && hasAssets) {
      verdict.textContent = `資產 ${fmt(assets)} 只靠它可以活 ${$("r-runway").textContent}。填入收入來源可比對缺口。`;
    } else if (ideal > 0) {
      verdict.textContent = `這份預算換算成稅前月收入需要 ${fmt(needed)}。`;
    } else {
      verdict.textContent = "列出固定花費，就會算出需要賺多少、資產能撐多久。";
    }

    budget.save();
    income.save();
    dreams.save();
  }

  budget.setListener(compute);
  income.setListener(compute);
  ["in-cash", "in-stock", "in-inflation", "in-years"].forEach(id =>
    $(id).addEventListener("input", compute));
  compute();
}

// ── 啟動 ──
(async function main() {
  try {
    await loadSnapshot();
  } catch (e) {
    document.getElementById("updated-at").textContent = "資料載入失敗：" + e.message;
    return;
  }
  const sum = getData();

  document.getElementById("month-total").textContent = fmt(sum.monthTotal);
  document.getElementById("month-range").textContent = sum.thisMonth;
  document.getElementById("daily-avg").textContent = fmt(sum.dailyAvg);
  document.getElementById("month-projection").textContent = fmt(sum.projection);
  document.getElementById("baseline").textContent = fmt(sum.baseline);

  drawPie(sum.byMonthCat[sum.thisMonth] || {});
  drawTrend(sum.dailyTotals);
  drawMonthly(sum.byMonth, sum.months);
  setupEstimator(sum);
})();
