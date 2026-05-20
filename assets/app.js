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
let latestAssetGroups = [];
let selectedGroupId = "";
let selectedTicker = "all";
let latestVisibleAssets = [];
let chartTooltip;

const helpText = {
  score: [
    "House score out of 100.",
    "Target weighting:",
    "Growth: 25 pts",
    "Profitability: 25 pts",
    "Valuation: 20 pts",
    "Financial strength: 15 pts",
    "Momentum + analysts: 15 pts",
    "News sentiment overlay: +/-8 pts",
    "Reading:",
    "80+ very attractive",
    "65-79 Buy",
    "50-64 Hold",
    "35-49 Caution",
    "Below 35 Avoid",
  ],
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
  sentiment: "News sentiment comes from Finnhub when FINNHUB_API_KEY is configured. It can add up to +8 points or subtract up to -8 points from the score.",
  earnings: "Next earnings announcement from Finnhub. EPS estimate is expected earnings per share; revenue estimate is expected sales for the quarter.",
  news: "Latest company news from Finnhub. Use it to understand what may have moved sentiment since the previous refresh.",
  assetTable: "Cross-asset table. The score is a simple directional snapshot based on recent performance for non-equity assets and fundamentals for equities.",
};

function help(key) {
  const text = Array.isArray(helpText[key]) ? helpText[key].join(" ") : helpText[key];
  const body = Array.isArray(helpText[key])
    ? `<span role="tooltip"><strong>${escapeHtml(helpText[key][0])}</strong><ul>${helpText[key].slice(1).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></span>`
    : `<span role="tooltip">${escapeHtml(helpText[key])}</span>`;

  return `
    <button class="help" type="button" aria-label="${escapeHtml(text)}" title="${escapeHtml(text)}">
      ?
      ${body}
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

function sentimentTone(sentiment) {
  if (!sentiment?.available) return "neutral";
  if (sentiment.score >= 0.25) return "positive";
  if (sentiment.score <= -0.25) return "negative";
  return "neutral";
}

function sentimentDelta(sentiment) {
  if (!sentiment || sentiment.delta === null || sentiment.delta === undefined) return "no prior refresh";
  const sign = Number(sentiment.delta) > 0 ? "+" : "";
  return `${sign}${Number(sentiment.delta).toFixed(3)} since last refresh`;
}

function formatDate(value) {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function newsRows(news) {
  if (!news?.length) return "<li>No recent Finnhub news available.</li>";
  return news.slice(0, 3).map((item) => `
    <li>
      <a href="${escapeHtml(item.url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(item.headline || "Untitled news")}</a>
      <span>${escapeHtml(item.source || "Source n/a")} / ${formatDate(item.published_at)}</span>
    </li>
  `).join("");
}

function earningsText(earnings, currency) {
  if (!earnings?.available) return "No upcoming earnings date available.";
  const quarter = earnings.quarter && earnings.year ? `Q${earnings.quarter} ${earnings.year}` : "Next report";
  const hour = earnings.hour ? ` / ${earnings.hour}` : "";
  return `
    <strong>${quarter}</strong>
    <span>${formatDate(earnings.date)}${hour}</span>
    <span>EPS est.: ${number(earnings.eps_estimate)}</span>
    <span>Revenue est.: ${large(earnings.revenue_estimate, currency)}</span>
  `;
}

function valuationRows(company) {
  const rows = [...(company.valuation_history || [])]
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
  return rows || `<tr><td colspan="5">No valuation history available.</td></tr>`;
}

function activeGroup() {
  return latestAssetGroups.find((group) => group.id === selectedGroupId) || latestAssetGroups[0];
}

function assetRows(assets) {
  return (assets || []).map((asset) => `
    <tr class="asset-row ${selectedTicker === asset.ticker ? "selected" : ""}" data-asset-ticker="${escapeHtml(asset.ticker)}" tabindex="0" role="button" aria-label="Show ${escapeHtml(asset.ticker)}">
      <td>
        <div class="asset-cell">
          ${logo(asset)}
          <div>
            <strong>${escapeHtml(asset.ticker)}</strong>
            <span>${escapeHtml(asset.name || asset.ticker)}</span>
          </div>
        </div>
      </td>
      <td>${escapeHtml(asset.asset_type || "asset")}</td>
      <td>${number(asset.price)} ${asset.currency || ""}</td>
      <td class="${Number(asset.performance?.one_month) >= 0 ? "positive" : "negative"}">${percent(asset.performance?.one_month)}</td>
      <td class="${Number(asset.performance?.six_months) >= 0 ? "positive" : "negative"}">${percent(asset.performance?.six_months)}</td>
      <td class="${Number(asset.performance?.one_year) >= 0 ? "positive" : "negative"}">${percent(asset.performance?.one_year)}</td>
      <td>
        <span class="mini-rating ${ratingClass(asset.rating)}">${escapeHtml(asset.rating)} ${asset.score}/100</span>
      </td>
    </tr>
  `).join("");
}

function assetGroupTemplate(group) {
  return `
    <section class="asset-group" id="group-${escapeHtml(group.id)}">
      <div class="asset-group-head">
        <div>
          <p class="eyebrow">${escapeHtml(group.name)}</p>
          <h2>${escapeHtml(group.description || group.name)}</h2>
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Underlying ${help("assetTable")}</th>
              <th>Type</th>
              <th>Price</th>
              <th>1M</th>
              <th>6M</th>
              <th>1Y</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>${assetRows(group.assets)}</tbody>
        </table>
      </div>
    </section>
  `;
}

function universeControlsTemplate(group) {
  const options = latestAssetGroups.map((item) => `
    <option value="${escapeHtml(item.id)}" ${item.id === group.id ? "selected" : ""}>${escapeHtml(item.name)}</option>
  `).join("");
  const chips = [
    `<button class="asset-chip ${selectedTicker === "all" ? "selected" : ""}" type="button" data-picker-ticker="all">All 3</button>`,
    ...(group.assets || []).map((asset) => `
      <button class="asset-chip ${selectedTicker === asset.ticker ? "selected" : ""}" type="button" data-picker-ticker="${escapeHtml(asset.ticker)}">
        ${escapeHtml(asset.ticker)}
      </button>
    `),
  ].join("");

  return `
    <select id="universeSelect" aria-label="Universe category">${options}</select>
    <div class="asset-rail" aria-label="Underlyings">${chips}</div>
  `;
}

function marketAssetTemplate(asset) {
  const reasons = asset.rating_reasons?.length
    ? asset.rating_reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")
    : "<li>limited directional signal</li>";

  return `
    <article class="company market-snapshot" id="snapshot-${escapeHtml(asset.ticker)}">
      <div class="company-head">
        <div class="identity">
          ${logo(asset)}
          <div>
            <p class="ticker">${escapeHtml(asset.ticker)}</p>
            <h2>${escapeHtml(asset.name || asset.ticker)}</h2>
            <p class="meta">${escapeHtml(asset.asset_type || "Asset")} / ${escapeHtml(asset.currency || "Currency n/a")}</p>
          </div>
        </div>
        <div class="rating ${ratingClass(asset.rating)}">
          <span>${escapeHtml(asset.rating)} ${help("score")}</span>
          <strong>${asset.score}/100</strong>
        </div>
      </div>

      <section class="summary-strip">
        <div><span>Price ${help("price")}</span><strong>${number(asset.price)} ${asset.currency || ""}</strong></div>
        <div><span>Type</span><strong>${escapeHtml(asset.asset_type || "Asset")}</strong></div>
        <div><span>1M return</span><strong class="${Number(asset.performance?.one_month) >= 0 ? "positive" : "negative"}">${percent(asset.performance?.one_month)}</strong></div>
        <div><span>6M return</span><strong class="${Number(asset.performance?.six_months) >= 0 ? "positive" : "negative"}">${percent(asset.performance?.six_months)}</strong></div>
        <div><span>1Y return ${help("oneYear")}</span><strong class="${Number(asset.performance?.one_year) >= 0 ? "positive" : "negative"}">${percent(asset.performance?.one_year)}</strong></div>
      </section>

      <div class="snapshot-grid single-chart">
        <section class="chart-panel">
          <h3>1Y price ${help("priceChart")}</h3>
          <canvas class="price-chart" data-chart="${escapeHtml(asset.ticker)}"></canvas>
        </section>
      </div>

      <section class="takeaway">
        <h3>Quick read ${help("quickRead")}</h3>
        <ul>${reasons}</ul>
      </section>
    </article>
  `;
}

function assetTemplate(asset) {
  return asset.asset_type === "equity" ? companyTemplate(asset) : marketAssetTemplate(asset);
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
        <div><span>Sentiment ${help("sentiment")}</span><strong class="${sentimentTone(company.sentiment)}">${company.sentiment?.available ? `${company.sentiment.label} ${number(company.sentiment.score)}` : "Unavailable"}</strong></div>
        <div><span>1Y return ${help("oneYear")}</span><strong class="${Number(company.performance.one_year) >= 0 ? "positive" : "negative"}">${percent(company.performance.one_year)}</strong></div>
      </section>

      <div class="event-grid">
        <section class="event-panel">
          <h3>News sentiment ${help("sentiment")}</h3>
          <p class="event-score ${sentimentTone(company.sentiment)}">${company.sentiment?.available ? company.sentiment.label : "Unavailable"}</p>
          <p>${company.sentiment?.available ? `Score ${number(company.sentiment.score)} / Bullish ${number(company.sentiment.bullish_percent, "%")} / Bearish ${number(company.sentiment.bearish_percent, "%")}` : "Add FINNHUB_API_KEY to GitHub Secrets to enable this."}</p>
          <p>${sentimentDelta(company.sentiment)}</p>
        </section>
        <section class="event-panel">
          <h3>Next earnings ${help("earnings")}</h3>
          <p>${earningsText(company.earnings, company.currency)}</p>
        </section>
        <section class="event-panel news-panel">
          <h3>Latest news ${help("news")}</h3>
          <ul>${newsRows(company.latest_news)}</ul>
        </section>
      </div>

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
  selectAsset(ticker);
  document.querySelectorAll(".company").forEach((node) => {
    node.classList.toggle("print-target", node.id === `snapshot-${ticker}`);
  });
  document.body.classList.add("print-single");
}

function selectAsset(ticker) {
  selectedTicker = ticker || "all";
  const owningGroup = latestAssetGroups.find((group) => (group.assets || []).some((asset) => asset.ticker === selectedTicker));
  if (owningGroup) selectedGroupId = owningGroup.id;
  renderSelection();
}

function bindSelectionEvents() {
  document.getElementById("universeSelect")?.addEventListener("change", (event) => {
    selectedGroupId = event.target.value;
    selectedTicker = "all";
    renderSelection();
  });

  document.querySelectorAll("[data-picker-ticker]").forEach((button) => {
    button.addEventListener("click", () => selectAsset(button.dataset.pickerTicker));
  });

  document.querySelectorAll("[data-asset-ticker]").forEach((row) => {
    row.addEventListener("click", () => selectAsset(row.dataset.assetTicker));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectAsset(row.dataset.assetTicker);
      }
    });
  });

  document.querySelectorAll("[data-print]").forEach((button) => {
    button.addEventListener("click", () => printSnapshot(button.dataset.print));
  });
}

function renderSelection() {
  const group = activeGroup();
  if (!group) return;

  const assets = selectedTicker === "all"
    ? group.assets || []
    : (group.assets || []).filter((asset) => asset.ticker === selectedTicker);

  latestVisibleAssets = assets;
  latestCompanies = assets.filter((asset) => asset.asset_type === "equity");
  document.getElementById("universeControls").innerHTML = universeControlsTemplate(group);
  document.getElementById("assetGroups").innerHTML = assetGroupTemplate(group);
  document.getElementById("companies").innerHTML = assets.map(assetTemplate).join("");
  drawCharts(assets);
  bindSelectionEvents();
}

async function load() {
  const response = await fetch("data/snapshots.json", { cache: "no-store" });
  const data = await response.json();
  latestCompanies = data.companies;
  latestAssetGroups = data.asset_groups || [{ id: "tech-stocks", name: "Tech stocks", description: "Large-cap technology equities.", assets: latestCompanies }];
  selectedGroupId = latestAssetGroups[0]?.id || "";
  selectedTicker = "all";
  document.getElementById("source").textContent = data.source;
  document.getElementById("updated").textContent = new Date(data.generated_at).toLocaleString("en-US");
  renderSelection();

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
  resizeTimer = setTimeout(() => drawCharts(latestVisibleAssets), 150);
});

load().catch((error) => {
  document.getElementById("companies").innerHTML = `<p class="error">Unable to load snapshots: ${error.message}</p>`;
});
