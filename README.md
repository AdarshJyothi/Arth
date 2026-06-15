# Arth

A live Indian stock market dashboard being built in stages — from a basic data display app to a full AI-powered research assistant.

"Arth" (अर्थ) means wealth, meaning, and purpose in Sanskrit.

---

## What It Is

Arth is a build-in-public project. The idea is to start simple, ship each stage, and keep adding meaningful functionality over time — rather than building the final product all at once. Each stage stands on its own and adds something new on top of what came before.

All market data comes from [`yfinance`](https://pypi.org/project/yfinance/) — **no paid APIs**.

---

## Stages

| Stage | Focus | Status |
|-------|-------|--------|
| **1** | Live market dashboard — stock search, quotes, charts, indices, market movers | ✅ Done |
| **2** | Portfolio tracker — auth, holdings, P&L, screener, watchlist with alerts | ✅ Done |
| **3** | News & sentiment — ticker-linked news, bullish/bearish scoring | ⏳ Next |
| **4** | AI research chat — natural language queries about the market | — |
| **5** | Financial models — DCF, Monte Carlo | — |
| **6** | Multi-agent research system — specialized agents working in parallel | — |

---

## Features

### Stage 1 — Live Dashboard
- **Stock search** with debounced autocomplete (Nifty 50 universe)
- **Live quotes** — price, day change, market cap, P/E, 52-week range, volume, sector
- **Historical charts** — line and candlestick, multiple periods (1M / 3M / 6M / 1Y), with a fullscreen mode
- **Market movers** — top gainers and losers with sparklines
- **Live indices** — Nifty 50, Sensex, Bank Nifty
- **Dark / light theme** with persisted preference

### Stage 2 — Accounts, Portfolio, Screener & Watchlist
- **Authentication** — register / login with JWT tokens (bcrypt-hashed passwords)
- **Portfolio tracker**
  - Add holdings with automatic merge + weighted-average cost basis
  - Live unrealized P&L per holding and across the portfolio (₹ and %)
  - **Portfolio value** history line chart (fullscreen-capable)
  - **Sector allocation** donut
  - **Sell** flow with realized P&L logging
  - **Transaction history** (every buy & sell) with CSV export
  - **Dividend log** with autofill ticker search
  - Holdings CSV export
- **Stock Screener** — ~170 Indian stocks
  - Filter by **sector** and **market-cap** tier (Large / Mid / Small)
  - Sort by market cap, top gainers/losers, P/E
  - Search by name or ticker
  - Two-tier data: one batched price download + a background-cached fundamentals warm-up (keeps the app fast and avoids rate limits)
  - Click a card to open that stock on the dashboard
- **Per-user Watchlist** (account-bound, stored server-side)
  - Live price + day change per card, green/red glow
  - **Price alerts** attached to each card (≥ / ≤ a target), editable and clearable
  - **YouTube-style pop-up notifications** (top-right) when an alert is hit — fires anywhere in the app, polls every 60s; click to jump to the watchlist

---

## Tech Stack

**Backend**
- Python · FastAPI · Uvicorn
- PostgreSQL · SQLAlchemy · Alembic (migrations)
- yfinance · pandas
- JWT auth · bcrypt · pydantic-settings

**Frontend**
- HTML · CSS · vanilla JavaScript (no build step)
- Chart.js (+ Luxon, financial chart plugin) via CDN

---

## Project Structure

```
backend/
  app/
    main.py                 # FastAPI app, CORS, routers, table bootstrap
    core/                   # config, security (JWT/bcrypt), deps (auth)
    db/                     # SQLAlchemy base, engine, session
    models/                 # User, Holding, Sell, Alert, Dividend, Transaction, Watchlist
    routers/                # market, auth, portfolio, screener
    schemas/                # Pydantic request/response models
    services/               # market_service, portfolio_service, screener_service
  alembic/                  # migrations
frontend/
  index.html                # single-page shell (dashboard / screener / portfolio / watchlist)
  app.js                    # dashboard, search, charts, watchlist, alerts
  portfolio.js              # auth, portfolio, transactions, dividends, alert notifications
  screener.js               # screener filters, search, cards
  style.css                 # design tokens + all styling
```

---

## Getting Started

### Prerequisites
- Python 3.11+
- PostgreSQL running locally (a database named `arth`)

### 1. Backend

```bash
cd backend
pip install fastapi uvicorn yfinance pandas pydantic-settings python-dotenv \
            sqlalchemy alembic psycopg2-binary "python-jose[cryptography]" \
            bcrypt python-multipart
```

Create `backend/.env`:

```env
APP_NAME=Arth
APP_VERSION=2.0.0
ENVIRONMENT=development
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/arth
SECRET_KEY=change-me-to-a-long-random-string
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

Apply migrations (or just start the server — tables are auto-created on startup):

```bash
alembic upgrade head
```

Run the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive API docs: <http://localhost:8000/docs>

### 2. Frontend

```bash
cd frontend
python -m http.server 8001
```

Open <http://localhost:8001>. The frontend talks to the API at `http://localhost:8000`.

---

## API Overview

| Area | Endpoint | Description |
|------|----------|-------------|
| Market | `GET /api/v1/market/quote/{ticker}` | Live price + stats |
| Market | `GET /api/v1/market/history/{ticker}?period=` | OHLCV data |
| Market | `GET /api/v1/market/search?q=` | Search stocks |
| Market | `GET /api/v1/market/movers` | Top gainers & losers |
| Market | `GET /api/v1/market/indices` | Nifty / Sensex / Bank Nifty |
| Auth | `POST /api/v1/auth/register` · `POST /api/v1/auth/login` | Accounts + JWT |
| Portfolio | `GET/POST/DELETE /api/v1/portfolio/...` | Holdings, sell, sectors, history |
| Portfolio | `.../transactions` · `.../dividends` · `.../alerts` · `.../watchlist` | Stage 2 features |
| Screener | `GET /api/v1/screener/stocks` · `.../sectors` | Filterable stock list |

All `/portfolio/*` endpoints require a Bearer token.

---

## Notes

- Market data is sourced from Yahoo Finance via `yfinance`; figures may be delayed and are for educational use only — **not financial advice**.
- This is a learning / build-in-public project, not a production trading system.
