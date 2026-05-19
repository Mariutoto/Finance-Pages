from __future__ import annotations

import json
import math
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
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
SENTIMENT_HISTORY_OUT = Path(__file__).resolve().parents[1] / "data" / "sentiment_history.json"
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "").strip()


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


def finnhub_get(path: str, params: dict[str, Any]) -> dict[str, Any] | list[Any] | None:
    if not FINNHUB_API_KEY:
        return None

    url = f"https://finnhub.io/api/v1/{path.lstrip('/')}"
    try:
        response = requests.get(
            url,
            params={**params, "token": FINNHUB_API_KEY},
            timeout=15,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as error:
        print(f"Finnhub request failed for {path}: {error}")
        return None


def sentiment_label(score: float | None) -> str:
    if score is None:
        return "Unavailable"
    if score >= 0.25:
        return "Positive"
    if score <= -0.25:
        return "Negative"
    return "Neutral"


def fetch_finnhub_sentiment(ticker: str) -> dict[str, Any]:
    payload = finnhub_get("news-sentiment", {"symbol": ticker})
    if not isinstance(payload, dict):
        return {
            "available": False,
            "score": None,
            "label": "Unavailable",
            "bullish_percent": None,
            "bearish_percent": None,
            "articles_last_week": None,
            "source": "Finnhub",
        }

    bullish = safe_float(payload.get("bullishPercent"))
    bearish = safe_float(payload.get("bearishPercent"))
    company_score = safe_float(payload.get("companyNewsScore"))
    if bullish is not None and bearish is not None:
        score = bullish - bearish
    else:
        score = company_score
        if score is not None and score > 1:
            score = score / 100

    if score is not None:
        score = max(-1, min(1, score))

    buzz = payload.get("buzz") if isinstance(payload.get("buzz"), dict) else {}
    articles_last_week = safe_float(buzz.get("articlesInLastWeek"))

    return {
        "available": score is not None,
        "score": round(score, 3) if score is not None else None,
        "label": sentiment_label(score),
        "bullish_percent": round(bullish * 100, 1) if bullish is not None else None,
        "bearish_percent": round(bearish * 100, 1) if bearish is not None else None,
        "articles_last_week": int(articles_last_week) if articles_last_week is not None else None,
        "source": "Finnhub",
    }


def fetch_company_news(ticker: str) -> list[dict[str, Any]]:
    today = date.today()
    payload = finnhub_get(
        "company-news",
        {
            "symbol": ticker,
            "from": (today - timedelta(days=14)).isoformat(),
            "to": today.isoformat(),
        },
    )
    if not isinstance(payload, list):
        return []

    news = []
    for item in payload[:5]:
        if not isinstance(item, dict):
            continue
        timestamp = safe_float(item.get("datetime"))
        published_at = datetime.fromtimestamp(timestamp, timezone.utc).isoformat() if timestamp else None
        news.append(
            {
                "headline": item.get("headline"),
                "source": item.get("source"),
                "url": item.get("url"),
                "published_at": published_at,
                "summary": item.get("summary"),
            }
        )
    return news


def fetch_earnings(ticker: str) -> dict[str, Any]:
    today = date.today()
    payload = finnhub_get(
        "calendar/earnings",
        {
            "symbol": ticker,
            "from": today.isoformat(),
            "to": (today + timedelta(days=180)).isoformat(),
        },
    )
    rows = payload.get("earningsCalendar") if isinstance(payload, dict) else None
    if not rows:
        return {"available": False, "source": "Finnhub"}

    upcoming = sorted(rows, key=lambda row: row.get("date") or "")[0]
    return {
        "available": True,
        "source": "Finnhub",
        "date": upcoming.get("date"),
        "hour": upcoming.get("hour"),
        "quarter": upcoming.get("quarter"),
        "year": upcoming.get("year"),
        "eps_estimate": safe_float(upcoming.get("epsEstimate")),
        "eps_actual": safe_float(upcoming.get("epsActual")),
        "revenue_estimate": safe_float(upcoming.get("revenueEstimate")),
        "revenue_actual": safe_float(upcoming.get("revenueActual")),
    }


def load_sentiment_history() -> dict[str, Any]:
    if not SENTIMENT_HISTORY_OUT.exists():
        return {"history": {}}
    try:
        return json.loads(SENTIMENT_HISTORY_OUT.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"history": {}}


def update_sentiment_history(history_doc: dict[str, Any], timestamp: str, ticker: str, sentiment: dict[str, Any]) -> list[dict[str, Any]]:
    history = history_doc.setdefault("history", {})
    rows = history.setdefault(ticker, [])
    if sentiment.get("available"):
        rows.append(
            {
                "timestamp": timestamp,
                "score": sentiment.get("score"),
                "label": sentiment.get("label"),
                "bullish_percent": sentiment.get("bullish_percent"),
                "bearish_percent": sentiment.get("bearish_percent"),
                "articles_last_week": sentiment.get("articles_last_week"),
            }
        )
    history[ticker] = rows[-90:]
    return history[ticker][-30:]


def sentiment_delta(rows: list[dict[str, Any]]) -> float | None:
    if len(rows) < 2:
        return None
    current = safe_float(rows[-1].get("score"))
    previous = safe_float(rows[-2].get("score"))
    if current is None or previous is None:
        return None
    return round(current - previous, 3)


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


def score_snapshot(info: dict[str, Any], performance: dict[str, float | None], sentiment: dict[str, Any]) -> tuple[str, int, list[str]]:
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
            reasons.append("solid revenue growth")
        elif revenue_growth < 0:
            score -= 10
            reasons.append("negative revenue growth")

    if profit_margin is not None:
        if profit_margin > 0.18:
            score += 10
            reasons.append("high net margins")
        elif profit_margin < 0.05:
            score -= 8
            reasons.append("weak margins")

    if roe is not None:
        if roe > 0.2:
            score += 8
            reasons.append("strong return on equity")
        elif roe < 0.08:
            score -= 6

    if debt_to_equity is not None:
        if debt_to_equity < 80:
            score += 5
        elif debt_to_equity > 180:
            score -= 8
            reasons.append("high financial leverage")

    if forward_pe is not None:
        if forward_pe < 22:
            score += 8
            reasons.append("reasonable forward P/E valuation")
        elif forward_pe > 45:
            score -= 10
            reasons.append("demanding valuation")

    if peg is not None:
        if 0 < peg < 1.5:
            score += 7
        elif peg > 2.5:
            score -= 6

    one_year = performance.get("one_year")
    if one_year is not None:
        if one_year > 0.15:
            score += 8
            reasons.append("positive one-year momentum")
        elif one_year < -0.15:
            score -= 8
            reasons.append("negative one-year momentum")

    if target_upside is not None:
        if target_upside > 0.12:
            score += 8
            reasons.append("analyst target above current price")
        elif target_upside < -0.08:
            score -= 8
            reasons.append("analyst target below current price")

    sentiment_score = safe_float(sentiment.get("score"))
    if sentiment_score is not None:
        if sentiment_score >= 0.3:
            score += 8
            reasons.append("strong positive news sentiment")
        elif sentiment_score >= 0.1:
            score += 4
            reasons.append("mild positive news sentiment")
        elif sentiment_score <= -0.3:
            score -= 8
            reasons.append("strong negative news sentiment")
        elif sentiment_score <= -0.1:
            score -= 4
            reasons.append("mild negative news sentiment")

    score = max(0, min(100, score))
    if score >= 68:
        rating = "Buy"
    elif score >= 45:
        rating = "Hold"
    else:
        rating = "Avoid"

    return rating, score, reasons[:4]


def snapshot(ticker: str, history_doc: dict[str, Any], generated_at: str) -> dict[str, Any]:
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

    sentiment = fetch_finnhub_sentiment(ticker)
    sentiment_history_rows = update_sentiment_history(history_doc, generated_at, ticker, sentiment)
    sentiment["delta"] = sentiment_delta(sentiment_history_rows)
    sentiment["history"] = sentiment_history_rows

    latest_news = fetch_company_news(ticker)
    earnings = fetch_earnings(ticker)

    rating, score, reasons = score_snapshot(info, performance, sentiment)

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
        "sentiment": sentiment,
        "latest_news": latest_news,
        "earnings": earnings,
        "rating": rating,
        "score": score,
        "rating_reasons": reasons,
    }


def main() -> None:
    generated_at = datetime.now(timezone.utc).isoformat()
    sentiment_history_doc = load_sentiment_history()
    data = {
        "generated_at": generated_at,
        "source": "Yahoo Finance via yfinance + Finnhub",
        "disclaimer": "Educational snapshot only. Not financial advice.",
        "companies": [snapshot(ticker, sentiment_history_doc, generated_at) for ticker in TICKERS],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    SENTIMENT_HISTORY_OUT.write_text(
        json.dumps({"updated_at": generated_at, "history": sentiment_history_doc.get("history", {})}, indent=2, ensure_ascii=False, allow_nan=False),
        encoding="utf-8",
    )
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
