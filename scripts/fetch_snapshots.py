from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yfinance as yf


TICKERS = ["AAPL", "MSFT", "NVDA"]
OUT = Path(__file__).resolve().parents[1] / "data" / "snapshots.json"


def safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
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
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
