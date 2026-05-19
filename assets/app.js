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

function companyTemplate(company) {
  const reasons = company.rating_reasons?.length
    ? company.rating_reasons.map((reason) => `<li>${reason}</li>`).join("")
    : "<li>donnees insuffisantes pour isoler les facteurs principaux</li>";

  return `
    <article class="company">
      <div class="company-head">
        <div>
          <p class="ticker">${company.ticker}</p>
          <h2>${company.name}</h2>
          <p class="meta">${company.sector || "Secteur n/a"} · ${company.industry || "Industrie n/a"}</p>
        </div>
        <div class="rating ${ratingClass(company.rating)}">
          <span>${company.rating}</span>
          <strong>${company.score}/100</strong>
        </div>
      </div>

      <div class="price-line">
        <strong>${number(company.price)} ${company.currency || ""}</strong>
        <span>Objectif moyen analystes: ${number(company.analyst_target_mean)} ${company.currency || ""}</span>
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

      <section class="takeaway">
        <h3>Lecture rapide</h3>
        <ul>${reasons}</ul>
        <p>${company.summary ? company.summary.slice(0, 430) : "Description non disponible."}${company.summary && company.summary.length > 430 ? "..." : ""}</p>
      </section>
    </article>
  `;
}

async function load() {
  const response = await fetch("data/snapshots.json", { cache: "no-store" });
  const data = await response.json();
  document.getElementById("source").textContent = data.source;
  document.getElementById("updated").textContent = new Date(data.generated_at).toLocaleString("fr-CH");
  document.getElementById("companies").innerHTML = data.companies.map(companyTemplate).join("");
}

document.getElementById("printBtn").addEventListener("click", () => window.print());

load().catch((error) => {
  document.getElementById("companies").innerHTML = `<p class="error">Impossible de charger le snapshot: ${error.message}</p>`;
});
