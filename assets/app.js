const money = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("fr-CH", { notation: "compact", maximumFractionDigits: 2 });

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
  if (rating === "Acheter") return "buy";
  if (rating === "Eviter") return "avoid";
  return "hold";
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

let latestCompanies = [];

function drawLineChart(canvas, points, key, color) {
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth * ratio;
  const height = canvas.clientHeight * ratio;
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const values = (points || []).map((point) => Number(point[key])).filter(Number.isFinite);
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

  const values = (points || []).map((point) => Number(point.price_to_sales)).filter(Number.isFinite);
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
  return (company.valuation_history || []).map((row) => `
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
    : "<li>donnees insuffisantes</li>";

  return `
    <article class="company" id="snapshot-${company.ticker}">
      <div class="company-head">
        <div class="identity">
          ${logo(company)}
          <div>
            <p class="ticker">${company.ticker}</p>
            <h2>${escapeHtml(company.name)}</h2>
            <p class="meta">${escapeHtml(company.sector || "Secteur n/a")} / ${escapeHtml(company.industry || "Industrie n/a")}</p>
          </div>
        </div>
        <div class="actions">
          <button class="small-btn" type="button" data-print="${company.ticker}">PDF A4</button>
          <div class="rating ${ratingClass(company.rating)}">
            <span>${company.rating}</span>
            <strong>${company.score}/100</strong>
          </div>
        </div>
      </div>

      <section class="summary-strip">
        <div><span>Cours</span><strong>${number(company.price)} ${company.currency || ""}</strong></div>
        <div><span>Cap.</span><strong>${large(company.market_cap, company.currency)}</strong></div>
        <div><span>P/E fwd</span><strong>${number(company.forward_pe)}x</strong></div>
        <div><span>Marge nette</span><strong>${number(company.profit_margin, "%")}</strong></div>
        <div><span>1 an</span><strong class="${Number(company.performance.one_year) >= 0 ? "positive" : "negative"}">${percent(company.performance.one_year)}</strong></div>
      </section>

      <div class="snapshot-grid">
        <section class="chart-panel">
          <h3>Prix 1 an</h3>
          <canvas class="price-chart" data-chart="${company.ticker}"></canvas>
        </section>
        <section class="chart-panel">
          <h3>P/E par an</h3>
          <canvas class="pe-chart" data-pe="${company.ticker}"></canvas>
        </section>
        <section class="chart-panel">
          <h3>Price / Sales par an</h3>
          <canvas class="ps-chart" data-ps="${company.ticker}"></canvas>
        </section>
      </div>

      <section class="table-section">
        <h3>Table ${company.ticker}</h3>
        <table>
          <thead>
            <tr>
              <th>Annee</th>
              <th>P/E</th>
              <th>P/S</th>
              <th>EPS</th>
              <th>Revenus</th>
            </tr>
          </thead>
          <tbody>${valuationRows(company)}</tbody>
        </table>
      </section>

      <section class="takeaway">
        <h3>Lecture rapide</h3>
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
    if (price) drawLineChart(price, company.chart_points, "close", company.brand_color || "#245c9c");
    if (pe) drawLineChart(pe, company.valuation_history, "pe", "#13795b");
    if (ps) drawBarChart(ps, company.valuation_history);
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
  document.getElementById("updated").textContent = new Date(data.generated_at).toLocaleString("fr-CH");
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
  document.getElementById("companies").innerHTML = `<p class="error">Impossible de charger le snapshot: ${error.message}</p>`;
});
