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
let chartTooltip;

const helpText = {
  score: "Score maison sur 100. Pondération cible: croissance 25 pts, rentabilité 25 pts, valorisation 20 pts, solidité financière 15 pts, momentum et analystes 15 pts. Lecture: 80+ très attractif, 65-79 Acheter, 50-64 Garder, 35-49 Prudence, sous 35 Eviter.",
  price: "Dernier cours de l'action fourni par Yahoo Finance. Il sert aussi a comparer le prix actuel avec les objectifs analystes et certaines valorisations.",
  marketCap: "Capitalisation boursiere: prix de l'action multiplie par le nombre d'actions. C'est la taille de marche de l'entreprise.",
  forwardPe: "Forward P/E: prix actuel divise par le benefice attendu par action. Plus il est haut, plus le marche paie cher la croissance future.",
  margin: "Marge nette: part du chiffre d'affaires qui reste en benefice apres les couts, impots et charges. Une marge haute indique souvent un business plus rentable.",
  oneYear: "Performance du cours sur un an. C'est un indicateur de momentum, pas une preuve que la tendance va continuer.",
  priceChart: "Evolution du cours sur environ un an. Le graphique montre la direction et la volatilite, pas la valeur intrinseque.",
  peChart: "P/E annuel: prix de fin d'annee divise par EPS annuel. Il aide a voir si le marche paie l'entreprise plus ou moins cher au fil du temps.",
  psChart: "Price/Sales annuel: capitalisation approximee divisee par revenus. Utile quand les profits varient beaucoup, mais il ignore les marges.",
  table: "Table historique de valorisation. Compare P/E, P/S, EPS et revenus par an pour voir si le prix evolue avec les fondamentaux.",
  pe: "P/E: prix divise par benefice par action. Un P/E bas peut etre attractif ou signaler un risque; un P/E haut suppose souvent une forte croissance.",
  ps: "P/S: prix compare aux ventes. A comparer surtout entre entreprises du meme secteur, car les marges changent beaucoup d'un secteur a l'autre.",
  eps: "EPS: benefice par action. Sa progression indique que l'entreprise gagne plus par action, souvent grace a la croissance ou aux rachats d'actions.",
  revenue: "Revenus: chiffre d'affaires annuel. La croissance des revenus montre l'expansion commerciale, mais ne dit pas seule si l'entreprise est rentable.",
  quickRead: "Lecture courte des facteurs qui ont influence le score: croissance, rentabilite, valorisation, momentum ou objectif analystes selon les donnees disponibles.",
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
  return date.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
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
            <span>${company.rating} ${help("score")}</span>
            <strong>${company.score}/100</strong>
          </div>
        </div>
      </div>

      <section class="summary-strip">
        <div><span>Cours ${help("price")}</span><strong>${number(company.price)} ${company.currency || ""}</strong></div>
        <div><span>Cap. ${help("marketCap")}</span><strong>${large(company.market_cap, company.currency)}</strong></div>
        <div><span>P/E fwd ${help("forwardPe")}</span><strong>${number(company.forward_pe)}x</strong></div>
        <div><span>Marge nette ${help("margin")}</span><strong>${number(company.profit_margin, "%")}</strong></div>
        <div><span>1 an ${help("oneYear")}</span><strong class="${Number(company.performance.one_year) >= 0 ? "positive" : "negative"}">${percent(company.performance.one_year)}</strong></div>
      </section>

      <div class="snapshot-grid">
        <section class="chart-panel">
          <h3>Prix 1 an ${help("priceChart")}</h3>
          <canvas class="price-chart" data-chart="${company.ticker}"></canvas>
        </section>
        <section class="chart-panel">
          <h3>P/E par an ${help("peChart")}</h3>
          <canvas class="pe-chart" data-pe="${company.ticker}"></canvas>
        </section>
        <section class="chart-panel">
          <h3>Price / Sales par an ${help("psChart")}</h3>
          <canvas class="ps-chart" data-ps="${company.ticker}"></canvas>
        </section>
      </div>

      <section class="table-section">
        <h3>Table ${company.ticker} ${help("table")}</h3>
        <table>
          <thead>
            <tr>
              <th>Annee</th>
              <th>P/E ${help("pe")}</th>
              <th>P/S ${help("ps")}</th>
              <th>EPS ${help("eps")}</th>
              <th>Revenus ${help("revenue")}</th>
            </tr>
          </thead>
          <tbody>${valuationRows(company)}</tbody>
        </table>
      </section>

      <section class="takeaway">
        <h3>Lecture rapide ${help("quickRead")}</h3>
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
      attachChartTooltip(price, company.chart_points, "close", "Cours", (value) => `${number(value)} ${company.currency || ""}`.trim());
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
