from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yfinance as yf


COMPANIES = {
    "AAPL": {
        "logo_text": "A",
        "brand_color": "#111111",
        "brand_domain": "apple.com",
    },
    "MSFT": {
        "logo_text": "MS",
        "brand_color": "#2563eb",
        "brand_domain": "microsoft.com",
    },
    "NVDA": {
        "logo_text": "NV",
        "brand_color": "#76b900",
        "brand_domain": "nvidia.com",
    },
}
TICKERS = list(COMPANIES)
OUT = Path(__file__).resolve().parents[1] / "data" / "snapshots.json"


def safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        number = float(value)
        if not math.isfinite(number):
            return None
        return number
    except (TypeError, ValueError):
        return None


def fmt_percent(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value * 100, 2)


def fmt_yield(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 2)


def get_return(history, start_index: int, end_index: int = -1) -> float | None:
    if history.empty or len(history) <= abs(start_index):
        return None
    try:
        start = safe_float(history["Close"].iloc[start_index])
        end = safe_float(history["Close"].iloc[end_index])
        if not start or not end:
            return None
        return (end / start) - 1
    except Exception:
        return None


def chart_points(history) -> list[dict[str, float | str]]:
    if history.empty:
        return []

    closes = history["Close"].dropna()
    if closes.empty:
        return []

    sampled = closes.tail(252)
    if len(sampled) > 70:
        step = max(1, (len(sampled) + 69) // 70)
        sampled = sampled.iloc[::step]

    return [
        {
            "date": index.strftime("%Y-%m-%d"),
            "close": round(float(value), 2),
        }
        for index, value in sampled.items()
    ]


def valuation_history(stock: yf.Ticker, history) -> list[dict[str, float | int | None]]:
    financials = stock.financials
    if financials.empty:
        return []

    rows = []
    previous_revenue = None
    for column in list(financials.columns)[:5]:
        year = int(column.year)
        revenue = safe_float(financials.at["Total Revenue", column]) if "Total Revenue" in financials.index else None
        eps = safe_float(financials.at["Diluted EPS", column]) if "Diluted EPS" in financials.index else None
        shares = safe_float(financials.at["Diluted Average Shares", column]) if "Diluted Average Shares" in financials.index else None
        price = None

        if not history.empty:
            fiscal_date = column
            if history.index.tz is not None and fiscal_date.tzinfo is None:
                fiscal_date = fiscal_date.tz_localize(history.index.tz)
            sliced = history.loc[:fiscal_date]
            if not sliced.empty:
                price = safe_float(sliced["Close"].iloc[-1])

        pe = round(price / eps, 2) if price and eps and eps > 0 else None
        ps = round((price * shares) / revenue, 2) if price and shares and revenue else None
        revenue_growth = None
        if revenue and previous_revenue:
            revenue_growth = round(((previous_revenue / revenue) - 1) * 100, 2)

        rows.append(
            {
                "year": year,
                "price": round(price, 2) if price else None,
                "pe": pe,
                "price_to_sales": ps,
                "eps": round(eps, 2) if eps else None,
                "revenue": round(revenue, 0) if revenue else None,
                "revenue_growth": revenue_growth,
            }
        )
        previous_revenue = revenue

    return list(reversed(rows))


def score_snapshot(info: dict[str, Any], performance: dict[str, float | None]) -> tuple[str, int, list[str]]:
    score = 50
    reasons: list[str] = []

    revenue_growth = safe_float(info.get("revenueGrowth"))
    profit_margin = safe_float(info.get("profitMargins"))
    roe = safe_float(info.get("returnOnEquity"))
    debt_to_equity = safe_float(info.get("debtToEquity"))
    forward_pe = safe_float(info.get("forwardPE"))
    peg = safe_float(info.get("pegRatio"))
    target_upside = None

    current = safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
    target = safe_float(info.get("targetMeanPrice"))
    if current and target:
        target_upside = (target / current) - 1

    if revenue_growth is not None:
        if revenue_growth > 0.12:
            score += 12
            reasons.append("croissance du chiffre d'affaires solide")
        elif revenue_growth < 0:
            score -= 10
            reasons.append("croissance du chiffre d'affaires negative")

    if profit_margin is not None:
        if profit_margin > 0.18:
            score += 10
            reasons.append("marges nettes elevees")
        elif profit_margin < 0.05:
            score -= 8
            reasons.append("marges faibles")

    if roe is not None:
        if roe > 0.2:
            score += 8
            reasons.append("rentabilite des fonds propres forte")
        elif roe < 0.08:
            score -= 6

    if debt_to_equity is not None:
        if debt_to_equity < 80:
            score += 5
        elif debt_to_equity > 180:
            score -= 8
            reasons.append("levier financier eleve")

    if forward_pe is not None:
        if forward_pe < 22:
            score += 8
            reasons.append("valorisation raisonnable en forward P/E")
        elif forward_pe > 45:
            score -= 10
            reasons.append("valorisation exigeante")

    if peg is not None:
        if 0 < peg < 1.5:
            score += 7
        elif peg > 2.5:
            score -= 6

    one_year = performance.get("one_year")
    if one_year is not None:
        if one_year > 0.15:
            score += 8
            reasons.append("momentum annuel positif")
        elif one_year < -0.15:
            score -= 8
            reasons.append("momentum annuel negatif")

    if target_upside is not None:
        if target_upside > 0.12:
            score += 8
            reasons.append("objectif moyen des analystes au-dessus du cours")
        elif target_upside < -0.08:
            score -= 8
            reasons.append("objectif moyen des analystes sous le cours")

    score = max(0, min(100, score))
    if score >= 68:
        rating = "Acheter"
    elif score >= 45:
        rating = "Garder"
    else:
        rating = "Eviter"

    return rating, score, reasons[:4]


def snapshot(ticker: str) -> dict[str, Any]:
    stock = yf.Ticker(ticker)
    info = stock.info
    hist = stock.history(period="5y", auto_adjust=True)
    meta = COMPANIES[ticker]

    performance = {
        "one_month": get_return(hist.tail(23), 0) if len(hist) >= 23 else None,
        "six_months": get_return(hist.tail(127), 0) if len(hist) >= 127 else None,
        "one_year": get_return(hist.tail(253), 0) if len(hist) >= 253 else None,
        "five_years": get_return(hist, 0) if len(hist) >= 2 else None,
    }

    rating, score, reasons = score_snapshot(info, performance)

    return {
        "ticker": ticker,
        "name": info.get("longName") or info.get("shortName") or ticker,
        "logo_text": meta["logo_text"],
        "brand_color": meta["brand_color"],
        "brand_domain": meta["brand_domain"],
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "summary": info.get("longBusinessSummary"),
        "price": safe_float(info.get("currentPrice") or info.get("regularMarketPrice")),
        "currency": info.get("currency"),
        "market_cap": safe_float(info.get("marketCap")),
        "enterprise_value": safe_float(info.get("enterpriseValue")),
        "dividend_yield": fmt_yield(safe_float(info.get("dividendYield"))),
        "beta": safe_float(info.get("beta")),
        "trailing_pe": safe_float(info.get("trailingPE")),
        "forward_pe": safe_float(info.get("forwardPE")),
        "peg_ratio": safe_float(info.get("pegRatio")),
        "price_to_sales": safe_float(info.get("priceToSalesTrailing12Months")),
        "price_to_book": safe_float(info.get("priceToBook")),
        "profit_margin": fmt_percent(safe_float(info.get("profitMargins"))),
        "operating_margin": fmt_percent(safe_float(info.get("operatingMargins"))),
        "gross_margin": fmt_percent(safe_float(info.get("grossMargins"))),
        "revenue_growth": fmt_percent(safe_float(info.get("revenueGrowth"))),
        "earnings_growth": fmt_percent(safe_float(info.get("earningsGrowth"))),
        "return_on_equity": fmt_percent(safe_float(info.get("returnOnEquity"))),
        "debt_to_equity": safe_float(info.get("debtToEquity")),
        "free_cashflow": safe_float(info.get("freeCashflow")),
        "recommendation_key": info.get("recommendationKey"),
        "analyst_target_mean": safe_float(info.get("targetMeanPrice")),
        "number_of_analyst_opinions": info.get("numberOfAnalystOpinions"),
        "performance": {key: fmt_percent(value) for key, value in performance.items()},
        "chart_points": chart_points(hist),
        "valuation_history": valuation_history(stock, hist),
        "rating": rating,
        "score": score,
        "rating_reasons": reasons,
    }


def main() -> None:
    data = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Yahoo Finance via yfinance",
        "disclaimer": "Educational snapshot only. Not financial advice.",
        "companies": [snapshot(ticker) for ticker in TICKERS],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
