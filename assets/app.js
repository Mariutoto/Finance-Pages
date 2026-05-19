const money = new Intl.NumberFormat("fr-CH", {
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat("fr-CH", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const percent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  const sign = Number(value) > 0 ? "+" : "";
  return `${sign}${Number(value).toFixed(2)}%`;
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
  if (rating === "Acheter") return "buy";
  if (rating === "Eviter") return "avoid";
  return "hold";
};

let latestCompanies = [];

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const metric = (label, value) => `
  <div class="metric">
    <span>${label}</span>
    <strong>${value}</strong>
  </div>
`;

const performanceCell = (label, value) => `
  <div class="perf">
    <span>${label}</span>
    <strong class="${Number(value) >= 0 ? "positive" : "negative"}">${percent(value)}</strong>
  </div>
`;

const barMetric = (label, value) => `
  <div class="bar-row">
    <span>${label}</span>
    <strong>${percent(value)}</strong>
  </div>
`;

function drawSparkline(canvas, points) {
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth * ratio;
  const height = canvas.clientHeight * ratio;
  canvas.width = width;
  canvas.height = height;

  ctx.clearRect(0, 0, width, height);
  if (!points?.length) return;

  const values = points.map((point) => Number(point.close)).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const pad = 14 * ratio;

  ctx.lineWidth = 3 * ratio;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(36, 92, 156, 0.18)";
  ctx.beginPath();
  ctx.moveTo(pad, height - pad);
  ctx.lineTo(width - pad, height - pad);
  ctx.stroke();

  ctx.strokeStyle = values.at(-1) >= values[0] ? "#13795b" : "#b42318";
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = pad + (index / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / spread) * (height - pad * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawScoreGauge(canvas, score) {
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth * ratio;
  const height = canvas.clientHeight * ratio;
  canvas.width = width;
  canvas.height = height;

  const centerX = width / 2;
  const centerY = height * 0.9;
  const radius = Math.min(width * 0.42, height * 0.78);
  const start = Math.PI;
  const end = Math.PI * 2;
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const valueEnd = start + (value / 100) * Math.PI;

  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 14 * ratio;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#d9e1ea";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, start, end);
  ctx.stroke();

  ctx.strokeStyle = value >= 68 ? "#13795b" : value >= 45 ? "#9a6700" : "#b42318";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, start, valueEnd);
  ctx.stroke();
}

function companyTemplate(company) {
  const reasons = company.rating_reasons?.length
    ? company.rating_reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")
    : "<li>donnees insuffisantes pour isoler les facteurs principaux</li>";

  return `
    <article class="company" id="snapshot-${company.ticker}">
      <div class="company-head">
        <div class="identity">
          <img class="logo" src="${company.logo_url}" alt="">
          <div>
            <p class="ticker">${company.ticker}</p>
            <h2>${escapeHtml(company.name)}</h2>
            <p class="meta">${escapeHtml(company.sector || "Secteur n/a")} / ${escapeHtml(company.industry || "Industrie n/a")}</p>
          </div>
        </div>
        <div class="actions">
          <button class="small-btn" type="button" data-print="${company.ticker}">PDF</button>
          <div class="rating ${ratingClass(company.rating)}">
            <span>${company.rating}</span>
            <strong>${company.score}/100</strong>
          </div>
        </div>
      </div>

      <div class="snapshot-layout">
        <section class="chart-panel">
          <div class="price-line">
            <div>
              <span class="label">Cours</span>
              <strong>${number(company.price)} ${company.currency || ""}</strong>
            </div>
            <div>
              <span class="label">Objectif analystes</span>
              <strong>${number(company.analyst_target_mean)} ${company.currency || ""}</strong>
            </div>
          </div>
          <canvas class="sparkline" data-chart="${company.ticker}" aria-label="Graphique du cours sur un an"></canvas>
        </section>

        <section class="gauge-panel">
          <canvas class="gauge" data-gauge="${company.ticker}" aria-label="Score du snapshot"></canvas>
          <p class="gauge-score">${company.score}<span>/100</span></p>
        </section>
      </div>

      <div class="grid">
        <section>
          <h3>Fondamentaux</h3>
          <div class="metrics">
            ${metric("Capitalisation", large(company.market_cap, company.currency))}
            ${metric("Enterprise value", large(company.enterprise_value, company.currency))}
            ${metric("Marge nette", number(company.profit_margin, "%"))}
            ${metric("Marge operationnelle", number(company.operating_margin, "%"))}
            ${metric("Croissance CA", percent(company.revenue_growth))}
            ${metric("Croissance BPA", percent(company.earnings_growth))}
            ${metric("ROE", number(company.return_on_equity, "%"))}
            ${metric("Dette / fonds propres", number(company.debt_to_equity))}
          </div>
        </section>

        <section>
          <h3>Key metrics</h3>
          <div class="metrics">
            ${metric("P/E trailing", number(company.trailing_pe))}
            ${metric("P/E forward", number(company.forward_pe))}
            ${metric("PEG", number(company.peg_ratio))}
            ${metric("Price / Sales", number(company.price_to_sales))}
            ${metric("Price / Book", number(company.price_to_book))}
            ${metric("Beta", number(company.beta))}
            ${metric("Free cashflow", large(company.free_cashflow, company.currency))}
            ${metric("Dividende", number(company.dividend_yield, "%"))}
          </div>
        </section>
      </div>

      <section class="performance">
        <h3>Past performance</h3>
        <div class="perf-grid">
          ${performanceCell("1 mois", company.performance.one_month)}
          ${performanceCell("6 mois", company.performance.six_months)}
          ${performanceCell("1 an", company.performance.one_year)}
          ${performanceCell("5 ans", company.performance.five_years)}
        </div>
      </section>

      <section class="visual-metrics">
        <h3>Graphique fondamentaux</h3>
        <div class="bar-list">
          ${barMetric("Marge brute", company.gross_margin)}
          ${barMetric("Marge nette", company.profit_margin)}
          ${barMetric("Croissance CA", company.revenue_growth)}
          ${barMetric("Croissance BPA", company.earnings_growth)}
        </div>
      </section>

      <section class="takeaway">
        <h3>Lecture rapide</h3>
        <ul>${reasons}</ul>
        <p>${escapeHtml(company.summary ? company.summary.slice(0, 390) : "Description non disponible.")}${company.summary && company.summary.length > 390 ? "..." : ""}</p>
      </section>
    </article>
  `;
}

function drawCharts(companies) {
  companies.forEach((company) => {
    const chart = document.querySelector(`[data-chart="${company.ticker}"]`);
    const gauge = document.querySelector(`[data-gauge="${company.ticker}"]`);
    if (chart) drawSparkline(chart, company.chart_points);
    if (gauge) drawScoreGauge(gauge, company.score);
  });
}

function printSnapshot(ticker) {
  document.querySelectorAll(".company").forEach((node) => {
    node.classList.toggle("print-target", node.id === `snapshot-${ticker}`);
  });
  document.body.classList.add("print-single");
  window.print();
}

async function load() {
  const response = await fetch("data/snapshots.json", { cache: "no-store" });
  const data = await response.json();
  document.getElementById("source").textContent = data.source;
  document.getElementById("updated").textContent = new Date(data.generated_at).toLocaleString("fr-CH");
  latestCompanies = data.companies;
  document.getElementById("companies").innerHTML = data.companies.map(companyTemplate).join("");
  drawCharts(data.companies);

  document.querySelectorAll("[data-print]").forEach((button) => {
    button.addEventListener("click", () => printSnapshot(button.dataset.print));
  });
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
  resizeTimer = setTimeout(() => {
    drawCharts(latestCompanies);
  }, 150);
});

load().catch((error) => {
  document.getElementById("companies").innerHTML = `<p class="error">Impossible de charger le snapshot: ${error.message}</p>`;
});
