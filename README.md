# Finance Snapshots

Static GitHub Pages dashboard that turns Yahoo Finance data into compact company snapshots with past performance, fundamentals, key metrics, logos, charts, and a simple valuation-style rating.

The first version tracks:

- Apple (`AAPL`)
- Microsoft (`MSFT`)
- NVIDIA (`NVDA`)

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

Use the `PDF` button on a company card to print that company as a one-page snapshot. Use `PDF all` to print the whole dashboard.

## Finnhub news, sentiment, and earnings

The page supports Finnhub enrichment for:

- news sentiment
- latest company news
- next earnings date
- EPS and revenue estimates
- sentiment history across refreshes

Create a GitHub repository secret named `FINNHUB_API_KEY`. The scheduled workflow refreshes data three times per weekday:

- 07:20 UTC
- 13:20 UTC
- 19:20 UTC

If the secret is missing, the page still works with Yahoo Finance data and shows Finnhub fields as unavailable.

## GitHub Pages

Publish the repository with GitHub Pages using the `main` branch and the repository root as the Pages source. The included workflow refreshes `data/snapshots.json` every weekday and can also be run manually.

## Notes

This is an educational snapshot tool, not investment advice. The generated `rating` is a transparent heuristic based on growth, profitability, leverage, valuation, momentum, and analyst sentiment when available from Yahoo Finance.
