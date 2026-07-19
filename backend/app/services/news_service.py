"""Stage 3 — News & sentiment.

Fetches ticker news from yfinance, scores each headline with VADER, and caches
to the `news_cache` table. Serving strategy (mirrors the screener's serve-cached
philosophy):
  - cold ticker (nothing cached)   → fetch synchronously, store, return
  - cached + fresh (< 30 min)       → return cache
  - cached + stale                  → return cache NOW, refresh in a background
                                      thread (stale-while-revalidate)

So yfinance is hit at most once per ~30 min per ticker, and only the very first
request for a ticker ever blocks on the network.
"""
import threading
from datetime import datetime, timedelta

import yfinance as yf
from sqlalchemy import func, nullslast
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from app.db.session import SessionLocal
from app.models.news import NewsItem
from app.services.portfolio_service import normalize_ticker

# ── Tunables ──
FRESH_MINUTES = 30      # cache considered fresh within this window
MAX_ITEMS = 15          # cap stored/returned per ticker
POS_THRESHOLD = 0.05    # VADER compound cutoffs (standard)
NEG_THRESHOLD = -0.05

_analyzer = SentimentIntensityAnalyzer()

# in-flight background refreshes, so concurrent requests don't stampede yfinance
_refreshing: set[str] = set()
_refresh_lock = threading.Lock()


# ── Sentiment ──
def score_sentiment(text: str) -> tuple[str, float]:
    """VADER compound → (label, score). label ∈ bullish|bearish|neutral."""
    compound = _analyzer.polarity_scores(text or "")["compound"]
    if compound >= POS_THRESHOLD:
        label = "bullish"
    elif compound <= NEG_THRESHOLD:
        label = "bearish"
    else:
        label = "neutral"
    return label, round(compound, 4)


def _label_from_score(score: float) -> str:
    if score >= POS_THRESHOLD:
        return "bullish"
    if score <= NEG_THRESHOLD:
        return "bearish"
    return "neutral"


# ── yfinance normalization (handles both the new nested + old flat schema) ──
def _to_dt(value) -> datetime | None:
    """Parse pubDate to a naive UTC datetime. Accepts ISO-8601 'Z' or epoch int."""
    if value is None:
        return None
    try:
        if isinstance(value, (int, float)):
            return datetime.utcfromtimestamp(value)  # old schema: providerPublishTime
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        # store naive UTC for consistency with the rest of the DB (datetime.utcnow)
        return dt.replace(tzinfo=None) - (dt.utcoffset() or timedelta(0))
    except Exception:
        return None


def _normalize_item(raw: dict) -> dict | None:
    """Map one yfinance news item → flat dict, or None if unusable (no title/url)."""
    content = raw.get("content")
    if isinstance(content, dict):  # yfinance >= ~0.2.x nested schema
        title = content.get("title")
        url = (content.get("clickThroughUrl") or content.get("canonicalUrl") or {}).get("url")
        source = (content.get("provider") or {}).get("displayName") or ""
        published = _to_dt(content.get("pubDate") or content.get("displayTime"))
    else:                          # old flat schema
        title = raw.get("title")
        url = raw.get("link")
        source = raw.get("publisher") or ""
        published = _to_dt(raw.get("providerPublishTime"))

    if not title or not url:
        return None  # drop link-less items — keeps the (ticker,url) unique key clean
    return {
        "headline": title.strip(),
        "url": url,
        "source": source,
        "published_at": published,
    }


def _fetch_and_score(ticker_norm: str) -> list[dict]:
    """Pull news for a ticker from yfinance and attach sentiment to each item."""
    try:
        raw = yf.Ticker(ticker_norm + ".NS").news or []
    except Exception:
        return []  # transient network / rate-limit — caller keeps serving cache

    items: list[dict] = []
    seen_urls: set[str] = set()
    for r in raw[:MAX_ITEMS]:
        item = _normalize_item(r)
        if not item or item["url"] in seen_urls:
            continue
        seen_urls.add(item["url"])
        label, score = score_sentiment(item["headline"])
        item["sentiment_label"] = label
        item["sentiment_score"] = score
        items.append(item)
    return items


# ── DB cache ──
def _read_cache(db, ticker_norm: str) -> list[NewsItem]:
    return (
        db.query(NewsItem)
        .filter(NewsItem.ticker == ticker_norm)
        .order_by(nullslast(NewsItem.published_at.desc()))
        .limit(MAX_ITEMS)
        .all()
    )


def _is_fresh(db, ticker_norm: str) -> bool:
    latest = (
        db.query(func.max(NewsItem.fetched_at))
        .filter(NewsItem.ticker == ticker_norm)
        .scalar()
    )
    return latest is not None and (datetime.utcnow() - latest) < timedelta(minutes=FRESH_MINUTES)


def _upsert(db, ticker_norm: str, items: list[dict]) -> None:
    """Insert new articles, refresh sentiment/freshness on ones we already have."""
    existing = {
        row.url: row
        for row in db.query(NewsItem).filter(NewsItem.ticker == ticker_norm).all()
    }
    now = datetime.utcnow()
    for it in items:
        row = existing.get(it["url"])
        if row:
            row.sentiment_label = it["sentiment_label"]
            row.sentiment_score = it["sentiment_score"]
            row.fetched_at = now
        else:
            db.add(NewsItem(
                ticker=ticker_norm,
                headline=it["headline"],
                url=it["url"],
                source=it["source"],
                published_at=it["published_at"],
                sentiment_label=it["sentiment_label"],
                sentiment_score=it["sentiment_score"],
                fetched_at=now,
            ))
    db.commit()


def _background_refresh(ticker_norm: str) -> None:
    """Daemon-thread refresh with its own DB session (stale-while-revalidate)."""
    with _refresh_lock:
        if ticker_norm in _refreshing:
            return
        _refreshing.add(ticker_norm)
    db = SessionLocal()
    try:
        items = _fetch_and_score(ticker_norm)
        if items:
            _upsert(db, ticker_norm, items)
    except Exception:
        db.rollback()  # never let a background failure crash anything
    finally:
        db.close()
        with _refresh_lock:
            _refreshing.discard(ticker_norm)


# ── Response shaping ──
def _build_response(ticker_norm: str, rows: list[NewsItem]) -> dict:
    items = [{
        "headline": r.headline,
        "url": r.url,
        "source": r.source,
        "published_at": r.published_at.isoformat() + "Z" if r.published_at else None,
        "sentiment_label": r.sentiment_label,
        "sentiment_score": r.sentiment_score,
    } for r in rows]

    counts = {"bullish": 0, "bearish": 0, "neutral": 0}
    for r in rows:
        counts[r.sentiment_label] = counts.get(r.sentiment_label, 0) + 1
    total = len(rows)
    avg = round(sum(r.sentiment_score for r in rows) / total, 4) if total else 0.0

    return {
        "ticker": ticker_norm,
        "count": total,
        "summary": {**counts, "avg_score": avg, "overall": _label_from_score(avg)},
        "items": items,
    }


# ── Public entrypoint (called by the router with the request's db session) ──
def get_news(ticker: str, db) -> dict:
    tk = normalize_ticker(ticker)
    cached = _read_cache(db, tk)

    if cached:
        if not _is_fresh(db, tk):
            threading.Thread(target=_background_refresh, args=(tk,), daemon=True).start()
        return _build_response(tk, cached)

    # cold ticker — fetch synchronously so the first request returns real data
    items = _fetch_and_score(tk)
    if items:
        try:
            _upsert(db, tk, items)
        except Exception:
            db.rollback()
        cached = _read_cache(db, tk)
    return _build_response(tk, cached)
