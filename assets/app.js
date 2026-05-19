const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

const percent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  const sign = Number(value) > 0 ? "+" : "";
  return `${sign}${Number(value).toFixed(1)}%`;
};

const number = (value, suffix = "") => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  return `${money.format(Number(value))}${suffix}`;
};

const large = (value, currency = "") => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  return `${compact.format(Number(value))} ${currency}`.trim();
};

const ratingClass = (rating) => {
  if (rating === "Buy") return "buy";
  if (rating === "Avoid") return "avoid";
  return "hold";
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

let latestCompanies = [];
let chartTooltip;

const helpText = {
  score: "House score out of 100. Target weighting: growth 25 pts, profitability 25 pts, valuation 20 pts, financial strength 15 pts, momentum and analysts 15 pts. Reading: 80+ very attractive, 65-79 Buy, 50-64 Hold, 35-49 Caution, below 35 Avoid.",
  price: "Latest share price from Yahoo Finance. It is used to compare the current price with analyst targets and valuation ratios.",
  marketCap: "Market capitalization: share price multiplied by shares outstanding. It represents the market size of the company.",
  forwardPe: "Forward P/E: current price divided by expected earnings per share. The higher it is, the more the market is paying for future growth.",
  margin: "Net margin: the share of revenue left as profit after costs, taxes and expenses. Higher margins often signal a stronger business model.",
  oneYear: "One-year share price performance. It is a momentum indicator, not proof that the trend will continue.",
  priceChart: "Share price evolution over roughly one year. It shows direction and volatility, not intrinsic value.",
  peChart: "Annual P/E: fiscal year-end price divided by annual EPS. It helps show whether the market is paying more or less for the company over time.",
  psChart: "Annual Price/Sales: approximate market cap divided by revenue. Useful when profits vary, but it ignores margins.",
  table: "Historical valuation table. The most recent year is shown first. Compare P/E, P/S, EPS and revenue by year to see whether price tracks fundamentals.",
  pe: "P/E: price divided by earnings per share. A low P/E can be attractive or signal risk; a high P/E usually assumes strong growth.",
  ps: "P/S: price compared with sales. Best compared between companies in the same sector because margins differ widely.",
  eps: "EPS: earnings per share. Growth in EPS means the company earns more per share, often from growth or buybacks.",
  revenue: "Revenue: annual sales. Revenue growth shows business expansion, but does not by itself prove profitability.",
  quickRead: "Short explanation of the factors that influenced the score: growth, profitability, valuation, momentum or analyst targets depending on available data.",
};

function help(key) {
  return `
    <button class="help" type="button" aria-label="${escapeHtml(helpText[key])}" title="${escapeHtml(helpText[key])}">
      ?
      <span role="tooltip">${escapeHtml(helpText[key])}</span>
    </button>
  `;
}

function validPoints(points, key) {
  return (points || [])
    .map((point) => ({ ...point, value: Number(point[key]) }))
    .filter((point) => Number.isFinite(point.value));
}

function getChartTooltip() {
  if (!chartTooltip) {
    chartTooltip = document.createElement("div");
    chartTooltip.className = "chart-tooltip";
    document.body.appendChild(chartTooltip);
  }
  return chartTooltip;
}

function formatDateLabel(dateText) {
  if (!dateText) return "";
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return String(dateText);
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function attachChartTooltip(canvas, points, key, label, formatter) {
  const plotted = validPoints(points, key);
  if (!plotted.length) return;

  canvas.onmousemove = (event) => {
    const rect = canvas.getBoundingClientRect();
    const relativeX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const index = Math.round((relativeX / Math.max(1, rect.width)) * (plotted.length - 1));
    const point = plotted[Math.min(Math.max(index, 0), plotted.length - 1)];
    const dateOrYear = point.year || formatDateLabel(point.date);
    const tooltip = getChartTooltip();
    tooltip.innerHTML = `<strong>${escapeHtml(String(dateOrYear))}</strong><span>${escapeHtml(label)}: ${escapeHtml(formatter(point.value))}</span>`;
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top = `${event.clientY}px`;
    tooltip.classList.add("visible");
  };

  canvas.onmouseleave = () => {
    getChartTooltip().classList.remove("visible");
  };
}

function drawLineChart(canvas, points, key, color) {
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth * ratio;
  const height = canvas.clientHeight * ratio;
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const values = validPoints(points, key).map((point) => point.value);
  if (values.length < 2) return;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const pad = 18 * ratio;

  ctx.strokeStyle = "#d9e1ea";
  ctx.lineWidth = 1 * ratio;
  for (let i = 0; i < 3; i += 1) {
    const y = pad + (i / 2) * (height - pad * 2);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * ratio;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = pad + (index / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / spread) * (height - pad * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawBarChart(canvas, points) {
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth * ratio;
  const height = canvas.clientHeight * ratio;
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const values = validPoints(points, "price_to_sales").map((point) => point.value);
  if (!values.length) return;

  const max = Math.max(...values, 1);
  const gap = 8 * ratio;
  const pad = 18 * ratio;
  const barWidth = (width - pad * 2 - gap * (values.length - 1)) / values.length;

  values.forEach((value, index) => {
    const h = (value / max) * (height - pad * 2);
    const x = pad + index * (barWidth + gap);
    const y = height - pad - h;
    ctx.fillStyle = index === values.length - 1 ? "#0f7187" : "#b7cadc";
    ctx.fillRect(x, y, barWidth, h);
  });
}

function logo(company) {
  return `
    <div class="logo" style="--brand:${company.brand_color}">
      <span>${escapeHtml(company.logo_text || company.ticker.slice(0, 2))}</span>
    </div>
  `;
}

function valuationRows(company) {
  return [...(company.valuation_history || [])]
    .sort((a, b) => b.year - a.year)
    .map((row) => `
      <tr>
        <td>${row.year}</td>
        <td>${number(row.pe)}x</td>
        <td>${number(row.price_to_sales)}x</td>
        <td>${number(row.eps)}</td>
        <td>${large(row.revenue, company.currency)}</td>
      </tr>
    `).join("");
}

function companyTemplate(company) {
  const reasons = company.rating_reasons?.length
    ? company.rating_reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")
    : "<li>insufficient data</li>";

  return `
    <article class="company" id="snapshot-${company.ticker}">
      <div class="company-head">
        <div class="identity">
          ${logo(company)}
          <div>
            <p class="ticker">${company.ticker}</p>
            <h2>${escapeHtml(company.name)}</h2>
            <p class="meta">${escapeHtml(company.sector || "Sector n/a")} / ${escapeHtml(company.industry || "Industry n/a")}</p>
          </div>
        </div>
        <div class="actions">
          <button class="small-btn" type="button" data-print="${company.ticker}">PDF A4</button>
          <div class="rating ${ratingClass(company.rating)}">
            <span>${company.rating} ${help("score")}</span>
            <strong>${company.score}/100</strong>
          </div>
        </div>
      </div>

      <section class="summary-strip">
        <div><span>Price ${help("price")}</span><strong>${number(company.price)} ${company.currency || ""}</strong></div>
        <div><span>Market cap ${help("marketCap")}</span><strong>${large(company.market_cap, company.currency)}</strong></div>
        <div><span>Forward P/E ${help("forwardPe")}</span><strong>${number(company.forward_pe)}x</strong></div>
        <div><span>Net margin ${help("margin")}</span><strong>${number(company.profit_margin, "%")}</strong></div>
        <div><span>1Y return ${help("oneYear")}</span><strong class="${Number(company.performance.one_year) >= 0 ? "positive" : "negative"}">${percent(company.performance.one_year)}</strong></div>
      </section>

      <div class="snapshot-grid">
        <section class="chart-panel">
          <h3>1Y price ${help("priceChart")}</h3>
          <canvas class="price-chart" data-chart="${company.ticker}"></canvas>
        </section>
        <section class="chart-panel">
          <h3>P/E by year ${help("peChart")}</h3>
          <canvas class="pe-chart" data-pe="${company.ticker}"></canvas>
        </section>
        <section class="chart-panel">
          <h3>Price / Sales by year ${help("psChart")}</h3>
          <canvas class="ps-chart" data-ps="${company.ticker}"></canvas>
        </section>
      </div>

      <section class="table-section">
        <h3>${company.ticker} valuation table ${help("table")}</h3>
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th>P/E ${help("pe")}</th>
              <th>P/S ${help("ps")}</th>
              <th>EPS ${help("eps")}</th>
              <th>Revenue ${help("revenue")}</th>
            </tr>
          </thead>
          <tbody>${valuationRows(company)}</tbody>
        </table>
      </section>

      <section class="takeaway">
        <h3>Quick read ${help("quickRead")}</h3>
        <ul>${reasons}</ul>
      </section>
    </article>
  `;
}

function drawCharts(companies) {
  companies.forEach((company) => {
    const price = document.querySelector(`[data-chart="${company.ticker}"]`);
    const pe = document.querySelector(`[data-pe="${company.ticker}"]`);
    const ps = document.querySelector(`[data-ps="${company.ticker}"]`);
    if (price) {
      drawLineChart(price, company.chart_points, "close", company.brand_color || "#245c9c");
      attachChartTooltip(price, company.chart_points, "close", "Price", (value) => `${number(value)} ${company.currency || ""}`.trim());
    }
    if (pe) {
      drawLineChart(pe, company.valuation_history, "pe", "#13795b");
      attachChartTooltip(pe, company.valuation_history, "pe", "P/E", (value) => `${number(value)}x`);
    }
    if (ps) {
      drawBarChart(ps, company.valuation_history);
      attachChartTooltip(ps, company.valuation_history, "price_to_sales", "P/S", (value) => `${number(value)}x`);
    }
  });
}

function printSnapshot(ticker) {
  document.querySelectorAll(".company").forEach((node) => {
    node.classList.toggle("print-target", node.id === `snapshot-${ticker}`);
  });
  document.body.classList.add("print-single");
  window.print();
}

function selectPrintTarget(ticker) {
  document.querySelectorAll(".company").forEach((node) => {
    node.classList.toggle("print-target", node.id === `snapshot-${ticker}`);
  });
  document.body.classList.add("print-single");
}

async function load() {
  const response = await fetch("data/snapshots.json", { cache: "no-store" });
  const data = await response.json();
  latestCompanies = data.companies;
  document.getElementById("source").textContent = data.source;
  document.getElementById("updated").textContent = new Date(data.generated_at).toLocaleString("en-US");
  document.getElementById("companies").innerHTML = latestCompanies.map(companyTemplate).join("");
  drawCharts(latestCompanies);

  document.querySelectorAll("[data-print]").forEach((button) => {
    button.addEventListener("click", () => printSnapshot(button.dataset.print));
  });

  const printTicker = new URLSearchParams(window.location.search).get("print");
  if (printTicker) {
    selectPrintTarget(printTicker.toUpperCase());
  }
}

document.getElementById("printBtn").addEventListener("click", () => {
  document.body.classList.remove("print-single");
  document.querySelectorAll(".company").forEach((node) => node.classList.remove("print-target"));
  window.print();
});

window.addEventListener("afterprint", () => {
  document.body.classList.remove("print-single");
  document.querySelectorAll(".company").forEach((node) => node.classList.remove("print-target"));
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => drawCharts(latestCompanies), 150);
});

load().catch((error) => {
  document.getElementById("companies").innerHTML = `<p class="error">Unable to load snapshots: ${error.message}</p>`;
});
