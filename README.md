# Finance Snapshots

Static GitHub Pages dashboard that turns Yahoo Finance data into compact market snapshots with past performance, fundamentals where available, key metrics, logos, charts, and simple rating signals.

The dashboard tracks four tables of three underlyings each:

- Apple (`AAPL`)
- Microsoft (`MSFT`)
- NVIDIA (`NVDA`)
- Gold futures (`GC=F`)
- Silver futures (`SI=F`)
- Crude oil futures (`CL=F`)
- Bitcoin (`BTC-USD`)
- Ethereum (`ETH-USD`)
- Solana (`SOL-USD`)
- S&P 500 (`^GSPC`)
- Nasdaq Composite (`^IXIC`)
- Dow Jones Industrial Average (`^DJI`)
- iShares 1-3 Year Treasury Bond ETF (`SHY`)
- iShares 7-10 Year Treasury Bond ETF (`IEF`)
- iShares 20+ Year Treasury Bond ETF (`TLT`)

Use the Universe dropdown to switch sub-categories. The horizontal ticker rail lets you show all three underlyings in that category or isolate one asset. Rows in the table also filter the snapshot area to the clicked underlying.

## Local refresh

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python scripts\fetch_snapshots.py
```

Then open `index.html` in a browser, or run a local static server:

```powershell
.\.venv\Scripts\python -m http.server 4173
```

Open `http://127.0.0.1:4173`.

## PDF snapshots

Use the `PDF` button on a company card to print that company as a one-page snapshot. Use `PDF all` to print the detailed company snapshots.

## News, sentiment, and earnings

The page supports Finnhub enrichment for equities when `FINNHUB_API_KEY` is configured:

- news sentiment
- latest company news
- next earnings date
- EPS and revenue estimates
- sentiment history across refreshes

When Finnhub is unavailable, and for non-equity underlyings, the refresh falls back to Yahoo Finance news from `yfinance`. It uses a simple transparent headline lexicon to estimate positive, neutral, or negative tone.

Create a GitHub repository secret named `FINNHUB_API_KEY`. The scheduled workflow refreshes data three times per weekday:

- 07:20 UTC
- 13:20 UTC
- 19:20 UTC

If the secret is missing, the page still works with Yahoo Finance data and Yahoo headline sentiment.

## GitHub Pages

Publish the repository with GitHub Pages using the `main` branch and the repository root as the Pages source. The included workflow refreshes `data/snapshots.json` every weekday and can also be run manually.

## Notes

This is an educational snapshot tool, not investment advice. Equity ratings use a transparent heuristic based on growth, profitability, leverage, valuation, momentum, and analyst sentiment when available from Yahoo Finance. Non-equity signals are directional snapshots based on recent performance.
