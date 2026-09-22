/* 記帳儀表板 — 讀 data.json 快照（export_snapshot.py 產生） */
"use strict";

const TAIPEI_TZ = "Asia/Taipei";

// ── 台灣綜所稅級距速算（2024 起適用，不含扣除額，粗算用）──
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

// ── 載入快照 ──
let SNAPSHOT = null;

async function loadSnapshot() {
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("data.json 讀取失敗：" + res.status);
  SNAPSHOT = await res.json();
  document.getElementById("updated-at").textContent =
    "資料更新於 " + SNAPSHOT.generatedAt.replace("T", " ").slice(0, 16);
}

// ── 資料整理 ──
function parseRecords() {
  return (SNAPSHOT.records || []).map(r => ({
    date: r.date,                       // YYYY-MM-DD
    amount: Number(r.amount) || 0,
    category: r.category || "其他",
    note: r.note || "",
  })).filter(r => r.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
}

function monthKey(dateStr) { return dateStr.slice(0, 7); }

function summarize(records) {
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7); //近似即可，快照同步在台北白天

  const byMonth = {};
  const byMonthCat = {};
  for (const r of records) {
    const m = monthKey(r.date);
    byMonth[m] = (byMonth[m] || 0) + r.amount;
    byMonthCat[m] = byMonthCat[m] || {};
    byMonthCat[m][r.category] = (byMonthCat[m][r.category] || 0) + r.amount;
  }

  const monthTotal = byMonth[thisMonth] || 0;
  const dayOfMonth = now.getDate();
  const dailyAvg = dayOfMonth > 0 ? monthTotal / dayOfMonth : 0;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projection = dailyAvg * daysInMonth;

  const months = Object.keys(byMonth).sort();
  const baseline = months.length ? months.reduce((s, m) => s + byMonth[m], 0) / months.length : 0;

  return { thisMonth, byMonth, byMonthCat, monthTotal, dailyAvg, projection, baseline, months };
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

function drawTrend(records) {
  const days = [];
  const totals = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push(key);
  }
  for (const r of records) totals[r.date] = (totals[r.date] || 0) + r.amount;
  new Chart(document.getElementById("trend-chart"), {
    type: "line",
    data: {
      labels: days.map(d => d.slice(5)),
      datasets: [{
        label: "當日支出",
        data: days.map(d => totals[d] || 0),
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

// ── 試算器 ──
function setupEstimator(sum) {
  const $ = id => document.getElementById(id);
  const inputs = ["in-ideal", "in-income", "in-inflation", "in-years"].map($);

  function compute() {
    const ideal0 = Number($("in-ideal").value) || 0;
    const income = Number($("in-income").value) || 0;
    const inflation = (Number($("in-inflation").value) || 0) / 100;
    const years = Number($("in-years").value) || 0;

    // 通膨調整：理想支出隨年數放大
    const factor = Math.pow(1 + inflation, years);
    const ideal = ideal0 * factor;
    $("r-years-label").textContent = years > 0 ? `${years} 年後` : "今年";

    // 現況基準
    $("r-baseline").textContent = fmt(sum.baseline);

    // 收入稅後
    let netMonthly = null;
    if (income > 0) {
      const tax = taxAnnual(income * 12);
      netMonthly = (income * 12 - tax) / 12;
      $("r-tax").textContent = `年稅額約 ${fmt(tax)}（稅後年收入 ${fmt(income * 12 - tax)}）`;
      $("r-net").textContent = fmt(netMonthly);
    } else {
      $("r-tax").textContent = "—";
      $("r-net").textContent = "—";
    }

    // 要過理想生活所需的稅前月收入：反推
    // 需要稅後 = ideal → 稅前月收入 gross 使 ((gross*12 - tax(gross*12))/12) >= ideal
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
    if (ideal > 0 && netMonthly != null) {
      const gap = netMonthly - ideal;
      if (gap >= 0) {
        verdict.textContent = `目前收入撐得起這個理想：每月約多 ${fmt(gap)} 可以存下來。`;
        verdict.classList.add("good");
      } else {
        verdict.textContent = `目前收入還差 ${fmt(-gap)}／月。要把理想生活過下去，稅前月收入要達到 ${fmt(needed)}。`;
        verdict.classList.add("warn");
      }
    } else {
      verdict.textContent = "填入理想支出與（或）收入，就能看到試算。";
    }
  }

  inputs.forEach(el => el.addEventListener("input", compute));

  // 用實際月均先幫使用者帶入理想支出預設值（方便起步）
  if (sum.baseline > 0) $("in-ideal").placeholder = `例：${Math.round(sum.baseline / 1000) * 1000}`;
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
  const records = parseRecords();
  const sum = summarize(records);

  document.getElementById("month-total").textContent = fmt(sum.monthTotal);
  document.getElementById("month-range").textContent = sum.thisMonth;
  document.getElementById("daily-avg").textContent = fmt(sum.dailyAvg);
  document.getElementById("month-projection").textContent = fmt(sum.projection);
  document.getElementById("baseline").textContent = fmt(sum.baseline);

  drawPie(sum.byMonthCat[sum.thisMonth] || {});
  drawTrend(records);
  drawMonthly(sum.byMonth, sum.months);
  setupEstimator(sum);
})();
