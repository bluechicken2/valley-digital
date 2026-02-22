#!/usr/bin/env python3
"""
TradingAI Sentiment Engine - Enhanced Version v2.1
Multi-source news aggregation with improved sentiment accuracy

Sources: Google News, Yahoo Finance, CoinDesk, CryptoNews
Features: Weighted keywords, negation handling, recency scoring, market status
"""

import json
import os
from datetime import datetime, timezone, timedelta, time as dt_time
from pathlib import Path
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
import re
import html
from collections import defaultdict
import time

# Configuration
DATA_FILE = Path("/a0/usr/workdir/tradingai-repo/data/sentiment.json")
ASSETS = ["AAPL", "NVDA", "BTC", "ETH"]

# Price Alert Thresholds
ALERT_THRESHOLDS = {
    "BTC": {"support": 95000, "resistance": 100000},
    "ETH": {"support": 3200, "resistance": 3500},
    "AAPL": {"support": 240, "resistance": 260},
    "NVDA": {"support": 140, "resistance": 160}
}


def get_market_status():
    """Get stock/crypto market status based on ET timezone"""
    try:
        from zoneinfo import ZoneInfo
        et = ZoneInfo("America/New_York")
    except ImportError:
        # Fallback for systems without zoneinfo
        import pytz
        et = pytz.timezone("America/New_York")
    
    now = datetime.now(et)
    weekday = now.weekday()  # 0=Monday, 6=Sunday
    current_time = now.time()
    
    market_open = dt_time(9, 30)
    market_close = dt_time(16, 0)
    
    is_weekday = weekday < 5  # Mon-Fri
    is_market_hours = market_open <= current_time < market_close
    
    stock_status = "open" if (is_weekday and is_market_hours) else "closed"
    
    # Calculate next open/close for stocks
    if stock_status == "open":
        next_close = now.replace(hour=16, minute=0, second=0, microsecond=0)
        next_event = {"next_close": next_close.isoformat()}
    else:
        # Find next market open
        days_ahead = 0
        if is_weekday:
            if current_time < market_open:
                days_ahead = 0
            else:
                days_ahead = 1
        else:
            # Weekend: days until Monday
            days_ahead = (7 - weekday) % 7
            if days_ahead == 0:
                days_ahead = 7
        
        next_open = now.replace(hour=9, minute=30, second=0, microsecond=0) + timedelta(days=days_ahead)
        # Ensure it's a weekday
        while next_open.weekday() >= 5:
            next_open += timedelta(days=1)
        next_event = {"next_open": next_open.isoformat()}
    
    return {
        "stock": stock_status,
        "crypto": "open",
        **next_event
    }


def fetch_current_prices():
    """Fetch current prices and 24h changes from CoinGecko API"""
    prices = {}
    try:
        # Crypto prices from CoinGecko
        url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true"
        req = urllib.request.Request(url, headers={"User-Agent": "TradingAI/1.0"})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            if "bitcoin" in data:
                prices["BTC"] = {
                    "price": data["bitcoin"].get("usd", 0),
                    "change_24h": round(data["bitcoin"].get("usd_24h_change", 0), 2)
                }
            if "ethereum" in data:
                prices["ETH"] = {
                    "price": data["ethereum"].get("usd", 0),
                    "change_24h": round(data["ethereum"].get("usd_24h_change", 0), 2)
                }
    except Exception as e:
        print("    [WARN] CoinGecko fetch failed: " + str(e)[:50])
        prices["BTC"] = {"price": 97000, "change_24h": 0}
        prices["ETH"] = {"price": 3400, "change_24h": 0}
    
    # Stock prices (mock for now - would need Yahoo Finance API for real)
    prices["AAPL"] = {"price": 250, "change_24h": 1.2}
    prices["NVDA"] = {"price": 150, "change_24h": 2.5}
    return prices

# ============================================================================
# RSS FEEDS - Multiple sources for better coverage
# ============================================================================
RSS_FEEDS = {
    "google_crypto": {
        "url": "https://news.google.com/rss/search?q=bitcoin+OR+ethereum&hl=en-US&gl=US&ceid=US:en",
        "category": "crypto",
        "source_name": "Google News"
    },
    "google_stocks": {
        "url": "https://news.google.com/rss/search?q=AAPL+OR+NVDA+stock&hl=en-US&gl=US&ceid=US:en",
        "category": "stocks",
        "source_name": "Google News"
    },
    "google_apple": {
        "url": "https://news.google.com/rss/search?q=Apple+AAPL+stock&hl=en-US&gl=US&ceid=US:en",
        "category": "aapl",
        "source_name": "Google News"
    },
    "google_nvidia": {
        "url": "https://news.google.com/rss/search?q=NVIDIA+NVDA+stock&hl=en-US&gl=US&ceid=US:en",
        "category": "nvda",
        "source_name": "Google News"
    },
    "yahoo_apple": {
        "url": "https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL&region=US&lang=en-US",
        "category": "aapl",
        "source_name": "Yahoo Finance"
    },
    "yahoo_nvidia": {
        "url": "https://feeds.finance.yahoo.com/rss/2.0/headline?s=NVDA&region=US&lang=en-US",
        "category": "nvda",
        "source_name": "Yahoo Finance"
    },
    "coindesk": {
        "url": "https://www.coindesk.com/arc/outboundfeeds/rss/",
        "category": "crypto",
        "source_name": "CoinDesk"
    },
    "cryptonews": {
        "url": "https://cryptonews.com/news/feed/",
        "category": "crypto",
        "source_name": "CryptoNews"
    },
    "cointelegraph": {
        "url": "https://cointelegraph.com/rss",
        "category": "crypto",
        "source_name": "Cointelegraph"
    },
    "investing_stocks": {
        "url": "https://www.investing.com/rss/news.rss",
        "category": "stocks",
        "source_name": "Investing.com"
    }
}

# ============================================================================
# WEIGHTED SENTIMENT KEYWORDS
# ============================================================================

BULLISH_KEYWORDS = {
    "moon": 3, "mooning": 3, "rocket": 3, "skyrocket": 3, "surge": 3, "soar": 3,
    "breakout": 3, "explode": 3, "blast": 3, "parabolic": 3,
    "record high": 3, "all-time high": 3, "ath": 3, "fly": 3, "flying": 3,
    "rally": 2, "bull": 2, "bullish": 2, "gain": 2, "rise": 2, "jump": 2,
    "climb": 2, "outperform": 2, "upgrade": 2,
    "buy": 2, "accumulation": 2, "strong": 2, "boost": 2, "growth": 2,
    "profit": 2, "positive": 2, "optimistic": 2, "beat": 2, "exceed": 2,
    "recover": 2, "recovery": 2, "rebound": 2, "support": 2,
    "up": 1, "high": 1, "green": 1,
    "steady": 1, "stable": 1, "solid": 1, "healthy": 1,
    "accumulate": 1, "attractive": 1, "promising": 1, "potential": 1,
    "opportunity": 1, "undervalued": 1, "oversold": 1
}

BEARISH_KEYWORDS = {
    "crash": 3, "collapse": 3, "plunge": 3, "tank": 3, "nosedive": 3,
    "freefall": 3, "wipeout": 3, "decimate": 3,
    "bloodbath": 3, "carnage": 3, "massacre": 3, "avalanche": 3,
    "bear": 2, "bearish": 2, "drop": 2, "fall": 2, "decline": 2, "sink": 2,
    "tumble": 2, "slide": 2, "slump": 2, "downgrade": 2, "underperform": 2,
    "sell": 2, "dump": 2, "sell-off": 2, "selloff": 2, "weak": 2,
    "loss": 2, "negative": 2, "pessimistic": 2, "miss": 2, "disappoint": 2,
    "risk": 2, "warning": 2, "concern": 2, "fear": 2, "panic": 2,
    "down": 1, "low": 1, "red": 1,
    "pressure": 1, "struggle": 1, "challenge": 1, "headwind": 1,
    "overbought": 1, "resistance": 1, "cautious": 1, "uncertain": 1,
    "volatile": 1, "retreat": 1, "pullback": 1
}

NEGATION_WORDS = [
    "not", "no", "never", "neither", "nobody", "nothing", "nowhere",
    "hardly", "barely", "scarcely", "seldom", "rarely", "without"
]

INTENSIFIERS = ["very", "extremely", "highly", "incredibly", "massively",
                "significantly", "substantially", "tremendously", "hugely"]

def clean_text(text):
    if not text:
        return ""
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", "", text)
    text = " ".join(text.split())
    return text.strip()

def parse_pub_date(date_str):
    if not date_str:
        return None
    formats = [
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S GMT",
        "%a, %d %b %Y %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M:%S"
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None

def get_recency_weight(pub_date):
    if not pub_date:
        return 0.7
    now = datetime.now(timezone.utc)
    age = now - pub_date
    if age < timedelta(hours=1):
        return 1.0
    elif age < timedelta(hours=6):
        return 0.9
    elif age < timedelta(hours=12):
        return 0.8
    elif age < timedelta(hours=24):
        return 0.7
    elif age < timedelta(hours=48):
        return 0.5
    else:
        return 0.3

def tokenize(text):
    return re.findall(r"\b[a-z]+\b", text.lower())

def get_sentiment_score_v2(text, pub_date=None):
    if not text:
        return 50, 0.5, {"bullish_score": 0, "bearish_score": 0, "matched_keywords": []}

    text_lower = text.lower()
    words = tokenize(text_lower)

    bullish_score = 0
    bearish_score = 0
    matched_keywords = []

    for i, word in enumerate(words):
        has_negation = any(neg in words[max(0, i-3):i] for neg in NEGATION_WORDS)
        has_intensifier = any(intens in words[max(0, i-2):i] for intens in INTENSIFIERS)
        multiplier = 1.5 if has_intensifier else 1.0

        if word in BULLISH_KEYWORDS:
            weight = BULLISH_KEYWORDS[word] * multiplier
            if has_negation:
                bearish_score += weight
                matched_keywords.append("NOT " + word)
            else:
                bullish_score += weight
                matched_keywords.append(word)
        elif word in BEARISH_KEYWORDS:
            weight = BEARISH_KEYWORDS[word] * multiplier
            if has_negation:
                bullish_score += weight
                matched_keywords.append("NOT " + word)
            else:
                bearish_score += weight
                matched_keywords.append(word)

    total_score = bullish_score + bearish_score
    if total_score == 0:
        return 50, 0.3, {"bullish_score": 0, "bearish_score": 0, "matched_keywords": []}

    net_score = bullish_score - bearish_score
    sentiment_range = 40
    normalized = (net_score / max(total_score, 1)) * sentiment_range
    score = 50 + normalized

    recency_weight = get_recency_weight(pub_date)
    if recency_weight < 1.0:
        score = 50 + (score - 50) * recency_weight

    confidence = min(0.9, 0.5 + (total_score / 20) * 0.4)
    score = max(10, min(90, int(score)))

    return score, round(confidence, 2), {
        "bullish_score": round(bullish_score, 1),
        "bearish_score": round(bearish_score, 1),
        "matched_keywords": matched_keywords[:10]
    }

def get_trend(score):
    if score >= 58:
        return "bullish"
    elif score >= 52:
        return "slightly_bullish"
    elif score <= 42:
        return "bearish"
    elif score <= 48:
        return "slightly_bearish"
    else:
        return "neutral"


def calculate_trend_strength(confidence, volume_score, price_change_24h):
    """
    Calculate trend strength score (0-100) based on:
    - Sentiment confidence (50% weight)
    - Volume score (30% weight)
    - Price change magnitude (20% weight)
    """
    # Normalize confidence (0-1) to 0-100
    confidence_component = confidence * 100 * 0.50
    
    # Volume score already 0-100
    volume_component = volume_score * 0.30
    
    # Price change magnitude - use absolute value, cap at 10% = 100
    price_magnitude = min(abs(price_change_24h) * 10, 100) * 0.20
    
    # Calculate total
    trend_strength = int(confidence_component + volume_component + price_magnitude)
    trend_strength = max(0, min(100, trend_strength))
    
    # Determine label
    if trend_strength < 30:
        label = "Weak"
    elif trend_strength < 60:
        label = "Moderate"
    else:
        label = "Strong"
    
    return trend_strength, label


def calculate_momentum_score(price_change_24h, sentiment_score, volume_trend):
    """
    Calculate momentum score (0-100) based on:
    - Price change direction and magnitude (50% weight)
    - Sentiment trend direction (30% weight)
    - Volume trend (20% weight - high volume = stronger momentum)
    """
    # Price change component (50%): -10% to +10% maps to 0-100
    price_component = max(0, min(100, 50 + (price_change_24h * 5)))

    # Sentiment component (30%): 0-100 sentiment score
    sentiment_component = sentiment_score

    # Volume component (20%): high volume = stronger momentum signal
    volume_multiplier = 1.0
    if volume_trend == "high":
        volume_multiplier = 1.2
    elif volume_trend == "low":
        volume_multiplier = 0.8

    volume_base = 50 + (50 if volume_trend == "high" else 0 if volume_trend == "normal" else -20)
    volume_component = volume_base

    # Calculate weighted score
    momentum_score = int(
        (price_component * 0.50) +
        (sentiment_component * 0.30) +
        (volume_component * 0.20)
    )
    momentum_score = max(0, min(100, momentum_score))

    # Determine label based on score
    if momentum_score >= 75:
        label = "Strong Up"
    elif momentum_score >= 55:
        label = "Up"
    elif momentum_score >= 45:
        label = "Neutral"
    elif momentum_score >= 25:
        label = "Down"
    else:
        label = "Strong Down"

    return {
        "momentum_score": momentum_score,
        "momentum_label": label
    }

def get_volume_analysis(asset, sentiment_score=None):
    """
    Generate volume analysis for an asset.
    Returns volume_trend (high/normal/low) and volume_score (0-100).
    Mock implementation - can be replaced with real API data.
    """
    import random

    # Base volume levels vary by asset type
    base_volumes = {
        "BTC": {"typical": 30e9, "std": 10e9},   # $30B typical daily
        "ETH": {"typical": 15e9, "std": 5e9},    # $15B typical daily
        "AAPL": {"typical": 50e6, "std": 20e6},  # 50M shares typical
        "NVDA": {"typical": 40e6, "std": 15e6}   # 40M shares typical
    }

    # Mock: generate random volume relative to typical
    base = base_volumes.get(asset, {"typical": 1e9, "std": 0.3e9})
    multiplier = random.uniform(0.5, 1.8)

    # Higher sentiment often correlates with higher volume
    if sentiment_score and sentiment_score > 60:
        multiplier *= 1.2
    elif sentiment_score and sentiment_score < 40:
        multiplier *= 1.3  # Selloffs also have high volume

    volume_ratio = multiplier

    # Calculate volume_score (0-100)
    volume_score = min(100, int(volume_ratio * 60))

    # Determine trend
    if volume_ratio >= 1.3:
        volume_trend = "high"
    elif volume_ratio <= 0.7:
        volume_trend = "low"
    else:
        volume_trend = "normal"

    return {
        "volume_trend": volume_trend,
        "volume_score": volume_score
    }


def calculate_fear_greed_index(assets_data, overall_score):
    """
    Calculate Fear & Greed Index (0-100 scale)
    Components:
    - Overall sentiment score (40% weight)
    - Market momentum from price changes (30% weight)  
    - Asset trends from individual sentiments (30% weight)
    """
    # Component 1: Overall Sentiment (40%) - normalize to 0-100
    sentiment_component = overall_score

    # Component 2: Market Momentum (30%) - based on 24h price changes
    # Scale: -10% to +10% maps to 0-100 (50 = neutral)
    price_changes = [a.get("price_change_24h", 0) for a in assets_data.values()]
    avg_price_change = sum(price_changes) / len(price_changes) if price_changes else 0
    momentum_component = max(0, min(100, 50 + (avg_price_change * 5)))

    # Component 3: Asset Trends (30%) - weighted average of asset sentiments
    # BTC/ETH weighted higher as crypto drives sentiment
    weights = {"BTC": 1.5, "ETH": 1.2, "NVDA": 1.0, "AAPL": 1.0}
    weighted_sum = 0
    total_weight = 0
    for asset, data in assets_data.items():
        w = weights.get(asset, 1.0)
        weighted_sum += data["sentiment"] * w
        total_weight += w
    trend_component = weighted_sum / total_weight if total_weight > 0 else 50

    # Calculate final index
    fear_greed_index = int(
        (sentiment_component * 0.40) +
        (momentum_component * 0.30) +
        (trend_component * 0.30)
    )

    # Determine label
    if fear_greed_index <= 25:
        label = "Extreme Fear"
    elif fear_greed_index <= 45:
        label = "Fear"
    elif fear_greed_index <= 55:
        label = "Neutral"
    elif fear_greed_index <= 75:
        label = "Greed"
    else:
        label = "Extreme Greed"

    return {
        "value": fear_greed_index,
        "label": label,
        "components": {
            "sentiment_score": round(sentiment_component, 1),
            "market_momentum": round(momentum_component, 1),
            "asset_trends": round(trend_component, 1)
        }
    }


def fetch_rss_news(feed_config, max_items=20):
    news_items = []
    url = feed_config["url"]
    source_name = feed_config["source_name"]
    category = feed_config["category"]

    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/rss+xml, application/xml, text/xml"
            }
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            xml_content = response.read().decode("utf-8", errors="ignore")

        root = ET.fromstring(xml_content)

        for item in root.findall(".//item")[:max_items]:
            title_elem = item.find("title")
            title = clean_text(title_elem.text) if title_elem is not None and title_elem.text else ""

            pub_date_elem = item.find("pubDate")
            if pub_date_elem is None:
                pub_date_elem = item.find("published")
            if pub_date_elem is None:
                pub_date_elem = item.find("{http://purl.org/dc/elements/1.1/}date")
            pub_date_str = pub_date_elem.text if pub_date_elem is not None and pub_date_elem.text else None
            pub_date = parse_pub_date(pub_date_str)

            if title:
                news_items.append({
                    "title": title,
                    "source": source_name,
                    "category": category,
                    "pub_date": pub_date,
                    "pub_date_str": pub_date_str
                })

    except urllib.error.HTTPError as e:
        print("    [WARN] " + source_name + ": HTTP " + str(e.code))
    except urllib.error.URLError as e:
        print("    [WARN] " + source_name + ": URL Error - " + str(e.reason))
    except ET.ParseError:
        print("    [WARN] " + source_name + ": XML Parse Error")
    except Exception as e:
        print("    [WARN] " + source_name + ": " + type(e).__name__ + " - " + str(e)[:50])

    return news_items

def fetch_all_sources():
    all_news = defaultdict(list)
    source_stats = defaultdict(lambda: {"count": 0, "success": False})

    print("")
    print("[INFO] Fetching news from multiple sources...")
    print("-" * 50)

    for feed_name, feed_config in RSS_FEEDS.items():
        print("  Fetching " + feed_config["source_name"] + " (" + feed_config["category"] + ")... ", end="")
        items = fetch_rss_news(feed_config)

        if items:
            print("[OK] " + str(len(items)) + " headlines")
            source_stats[feed_config["source_name"]]["count"] += len(items)
            source_stats[feed_config["source_name"]]["success"] = True
            all_news[feed_config["category"]].extend(items)
        else:
            print("[FAIL] No data")

        time.sleep(0.5)

    return all_news, dict(source_stats)

def analyze_asset_sentiment_v2(asset, news_data):
    headlines = []

    if asset == "BTC":
        headlines = [n for n in news_data.get("crypto", [])
                     if "bitcoin" in n["title"].lower() or "btc" in n["title"].lower()]
        headlines.extend(news_data.get("crypto", [])[:5])
    elif asset == "ETH":
        headlines = [n for n in news_data.get("crypto", [])
                     if "ethereum" in n["title"].lower() or "eth" in n["title"].lower()]
    elif asset == "AAPL":
        headlines = news_data.get("aapl", [])
        headlines.extend([n for n in news_data.get("stocks", [])
                          if "apple" in n["title"].lower() or "aapl" in n["title"].lower()])
    elif asset == "NVDA":
        headlines = news_data.get("nvda", [])
        headlines.extend([n for n in news_data.get("stocks", [])
                          if "nvidia" in n["title"].lower() or "nvda" in n["title"].lower()])

    seen = set()
    unique_headlines = []
    for h in headlines:
        title_key = h["title"][:50].lower()
        if title_key not in seen:
            seen.add(title_key)
            unique_headlines.append(h)

    if not unique_headlines:
        base_scores = {"AAPL": 65, "NVDA": 70, "BTC": 55, "ETH": 55}
        score = base_scores.get(asset, 50)
        volume_data = get_volume_analysis(asset, score)
        volume_score = volume_data.get("volume_score", 50)
        trend_strength, trend_label = calculate_trend_strength(0.5, volume_score, 0)
        return {
            "sentiment": score,
            "trend": get_trend(score),
            "confidence": 0.5,
            "headlines_analyzed": 0,
            "sources": [],
            "matched_keywords": [],
            **volume_data,
            "trend_strength": trend_strength,
            "trend_strength_label": trend_label
        }

    total_score = 0
    total_weight = 0
    all_keywords = []
    all_confidences = []
    sources_used = set()

    for headline in unique_headlines[:15]:
        pub_date = headline.get("pub_date")
        score, confidence, details = get_sentiment_score_v2(headline["title"], pub_date)

        recency_weight = get_recency_weight(pub_date)
        weight = recency_weight * confidence

        total_score += score * weight
        total_weight += weight

        all_keywords.extend(details["matched_keywords"])
        all_confidences.append(confidence)
        sources_used.add(headline["source"])

    final_score = int(total_score / max(total_weight, 0.1))
    avg_confidence = sum(all_confidences) / len(all_confidences) if all_confidences else 0.5

    keyword_counts = defaultdict(int)
    for kw in all_keywords:
        keyword_counts[kw] += 1
    top_keywords = sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    # Get volume analysis
    volume_data = get_volume_analysis(asset, final_score)

    volume_score = volume_data.get("volume_score", 50)
    price_change = 0  # Will be added later in update_sentiment_file
    trend_strength, trend_label = calculate_trend_strength(avg_confidence, volume_score, price_change)
    
    return {
        "sentiment": final_score,
        "trend": get_trend(final_score),
        "confidence": round(avg_confidence, 2),
        "headlines_analyzed": len(unique_headlines[:15]),
        "sources": list(sources_used),
        "matched_keywords": [kw[0] for kw in top_keywords],
        **volume_data,
        "trend_strength": trend_strength,
        "trend_strength_label": trend_label
    }

def get_top_themes_v2(news_data):
    all_titles = " ".join([
        item.get("title", "")
        for category in news_data.values()
        for item in category
    ]).lower()

    theme_keywords = {
        "AI/Tech": ["ai", "artificial intelligence", "machine learning", "chatgpt", "openai", "gpt", "llm"],
        "Earnings": ["earnings", "revenue", "profit", "quarterly", "q1", "q2", "q3", "q4", "beat estimates"],
        "Fed/Rates": ["fed", "federal reserve", "interest rate", "inflation", "rate cut", "rate hike", "powell"],
        "Crypto": ["crypto", "bitcoin", "ethereum", "blockchain", "defi", "nft", "web3"],
        "Regulation": ["sec", "regulation", "compliance", "lawsuit", "fine", "investigation"],
        "Semiconductors": ["chip", "semiconductor", "gpu", "nvidia", "amd", "intel", "tsmc"],
        "Options/Derivatives": ["options", "calls", "puts", "derivatives", "futures"],
        "ETF/Institutional": ["etf", "spot", "institutional", "blackrock", "fidelity", "fund"]
    }

    theme_scores = {}
    for theme, keywords in theme_keywords.items():
        score = sum(all_titles.count(kw) for kw in keywords)
        if score > 0:
            theme_scores[theme] = score

    sorted_themes = sorted(theme_scores.items(), key=lambda x: x[1], reverse=True)
    return [t[0] for t in sorted_themes[:4]]




def get_top_headlines(news_data, limit=5):
    """Extract top headlines with sentiment impact."""
    all_headlines = []

    for category, items in news_data.items():
        for item in items:
            title = item.get("title", "")
            pub_date = item.get("pub_date")

            # Determine asset based on category and title content
            asset = "General"
            title_lower = title.lower()

            if category in ["crypto"]:
                if "bitcoin" in title_lower or "btc" in title_lower:
                    asset = "BTC"
                elif "ethereum" in title_lower or "eth" in title_lower:
                    asset = "ETH"
                else:
                    asset = "BTC"  # Default crypto
            elif category in ["aapl", "apple"]:
                asset = "AAPL"
            elif category in ["nvda", "nvidia"]:
                asset = "NVDA"
            elif category in ["stocks"]:
                if "apple" in title_lower or "aapl" in title_lower:
                    asset = "AAPL"
                elif "nvidia" in title_lower or "nvda" in title_lower:
                    asset = "NVDA"
                else:
                    asset = "Stocks"

            # Get sentiment impact
            score, _, _ = get_sentiment_score_v2(title, pub_date)
            if score >= 55:
                sentiment_impact = "bullish"
            elif score <= 45:
                sentiment_impact = "bearish"
            else:
                sentiment_impact = "neutral"

            # Calculate relevance score (recency + sentiment strength)
            recency = get_recency_weight(pub_date)
            strength = abs(score - 50) / 50  # 0-1
            relevance = recency * (0.5 + strength * 0.5)

            all_headlines.append({
                "title": title,
                "asset": asset,
                "sentiment_impact": sentiment_impact,
                "relevance": relevance,
                "pub_date": pub_date
            })

    # Sort by relevance and return top N
    all_headlines.sort(key=lambda x: x["relevance"], reverse=True)

    # Remove relevance key from output
    result = []
    for h in all_headlines[:limit]:
        result.append({
            "title": h["title"],
            "asset": h["asset"],
            "sentiment_impact": h["sentiment_impact"]
        })

    return result

def calculate_market_regime(assets_data, overall_score):
    """
    Calculate market regime based on sentiment and trend signals.
    Returns regime (Bull Market/Bear Market/Range-bound/Transition) and confidence (0-100).
    """
    # Count bullish vs bearish assets
    bullish_count = sum(1 for a in assets_data.values() if a.get("sentiment", 50) > 55)
    bearish_count = sum(1 for a in assets_data.values() if a.get("sentiment", 50) < 45)
    total_assets = len(assets_data)
    
    # Get average trend strength
    trend_strengths = [a.get("trend_strength", 50) for a in assets_data.values()]
    avg_trend_strength = sum(trend_strengths) / len(trend_strengths) if trend_strengths else 50
    
    # Determine regime based on overall sentiment and trend
    strong_trend = avg_trend_strength >= 60
    weak_trend = avg_trend_strength < 40
    
    # Check for conflicting signals (some bullish, some bearish)
    signal_conflict = bullish_count > 0 and bearish_count > 0 and abs(bullish_count - bearish_count) <= 1
    
    if signal_conflict:
        regime = "Transition"
        confidence = int(100 - avg_trend_strength)  # Lower confidence when trending in conflict
    elif overall_score >= 60 and strong_trend:
        regime = "Bull Market"
        confidence = int(min(100, overall_score * 0.8 + avg_trend_strength * 0.2))
    elif overall_score <= 40 and strong_trend:
        regime = "Bear Market"
        confidence = int(min(100, (100 - overall_score) * 0.8 + avg_trend_strength * 0.2))
    elif 40 <= overall_score <= 60:
        regime = "Range-bound"
        confidence = int(100 - abs(50 - overall_score) - (100 - avg_trend_strength) * 0.5)
    elif overall_score > 60 and not strong_trend:
        regime = "Transition"  # Bullish sentiment but weak trend
        confidence = int(avg_trend_strength)
    elif overall_score < 40 and not strong_trend:
        regime = "Transition"  # Bearish sentiment but weak trend
        confidence = int(avg_trend_strength)
    else:
        regime = "Range-bound"
        confidence = 50
    
    confidence = max(20, min(95, confidence))
    
    return {
        "regime": regime,
        "confidence": confidence
    }


def calculate_signal_summary(assets_data, overall_score, fear_greed_value):
    """
    Calculate overall trading signal based on weighted factors.
    Returns signal (STRONG BUY/BUY/HOLD/SELL/STRONG SELL) and confidence (0-100).
    Weights: sentiment 30%, fear_greed 30%, avg_trend_strength 40%
    """
    # Calculate average trend strength from all assets
    trend_strengths = [a.get("trend_strength", 50) for a in assets_data.values()]
    avg_trend_strength = sum(trend_strengths) / len(trend_strengths) if trend_strengths else 50

    # Weighted score calculation
    weighted_score = (
        (overall_score * 0.30) +
        (fear_greed_value * 0.30) +
        (avg_trend_strength * 0.40)
    )

    # Determine signal based on weighted score
    if weighted_score >= 75:
        signal = "STRONG BUY"
    elif weighted_score >= 60:
        signal = "BUY"
    elif weighted_score >= 40:
        signal = "HOLD"
    elif weighted_score >= 25:
        signal = "SELL"
    else:
        signal = "STRONG SELL"

    # Calculate confidence based on signal strength and agreement
    signal_strength = abs(weighted_score - 50)
    base_confidence = min(100, signal_strength * 2)

    # Boost confidence if trend strength supports the signal
    if (weighted_score > 50 and avg_trend_strength > 50) or (weighted_score < 50 and avg_trend_strength < 50):
        base_confidence = min(100, base_confidence + 15)

    # Reduce confidence if signals conflict
    sentiment_fear_agreement = (overall_score > 50) == (fear_greed_value > 50)
    if not sentiment_fear_agreement:
        base_confidence = max(20, base_confidence - 20)

    confidence = int(base_confidence)

    return {
        "signal": signal,
        "confidence": confidence,
        "weighted_score": round(weighted_score, 1)
    }







def calculate_performance_score(source_stats, assets_data, signal_summary):
    """
    Calculate performance score (0-100) based on:
    - Prediction accuracy (mock for now) - 40% weight
    - Signal reliability (how often signals were correct) - 35% weight
    - Data quality score (sources, freshness) - 25% weight
    Returns score and label.
    """
    import random

    # 1. Prediction accuracy (mock) - 40% weight
    # Higher confidence signals = better accuracy
    signal_conf = signal_summary.get("confidence", 50) / 100
    prediction_accuracy = 50 + (signal_conf * 50) + random.uniform(-10, 10)
    prediction_score = min(100, max(0, prediction_accuracy)) * 0.40

    # 2. Signal reliability - 35% weight
    # Based on trend strength consistency and confidence
    trend_strengths = [a.get("trend_strength", 50) for a in assets_data.values()]
    avg_trend = sum(trend_strengths) / len(trend_strengths) if trend_strengths else 50
    confidences = [a.get("confidence", 0.5) for a in assets_data.values()]
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.5
    reliability_score = (avg_trend * 0.6 + avg_conf * 100 * 0.4) * 0.35

    # 3. Data quality score - 25% weight
    # Based on number of sources and headlines
    active_sources = sum(1 for s in source_stats.values() if s.get("success", False))
    quality_score = min(100, (active_sources * 10) + random.uniform(5, 15)) * 0.25

    # Calculate total score
    total_score = int(prediction_score + reliability_score + quality_score)
    total_score = max(0, min(100, total_score))

    # Determine label
    if total_score >= 80:
        label = "Excellent"
    elif total_score >= 60:
        label = "Good"
    elif total_score >= 40:
        label = "Fair"
    else:
        label = "Poor"

    return {
        "score": total_score,
        "label": label,
        "components": {
            "prediction_accuracy": round(prediction_accuracy, 1),
            "signal_reliability": round(avg_trend * 0.6 + avg_conf * 100 * 0.4, 1),
            "data_quality": round(min(100, active_sources * 10 + 10), 1)
        }
    }

def calculate_risk_assessment(assets_data, fear_greed_value):
    """
    Calculate risk assessment based on:
    - Volatility (price_change_24h magnitude) - 40% weight
    - Fear & Greed extreme readings - 30% weight  
    - Trend strength (weak = higher risk) - 30% weight
    Returns risk_level (Low/Medium/High/Extreme) and risk_score (0-100)
    """
    # 1. Volatility component (40% weight)
    # Higher price swings = higher risk
    price_changes = [abs(a.get("price_change_24h", 0)) for a in assets_data.values()]
    avg_volatility = sum(price_changes) / len(price_changes) if price_changes else 0
    # Scale: 0% change = 0, 10%+ change = 100
    volatility_score = min(100, avg_volatility * 10) * 0.40

    # 2. Fear & Greed extreme component (30% weight)
    # Extreme fear (<25) or extreme greed (>75) = higher risk
    fg_extremeness = 0
    if fear_greed_value <= 25:
        fg_extremeness = 100 - (fear_greed_value * 4)  # 0=100, 25=0
    elif fear_greed_value >= 75:
        fg_extremeness = (fear_greed_value - 75) * 4  # 75=0, 100=100
    else:
        fg_extremeness = 0  # Neutral zone = low risk
    fg_score = fg_extremeness * 0.30

    # 3. Trend strength component (30% weight)
    # Weak trends = higher risk (uncertainty)
    trend_strengths = [a.get("trend_strength", 50) for a in assets_data.values()]
    avg_trend_strength = sum(trend_strengths) / len(trend_strengths) if trend_strengths else 50
    # Invert: low strength = high risk
    weakness_score = (100 - avg_trend_strength) * 0.30

    # Calculate total risk score (0-100)
    risk_score = int(volatility_score + fg_score + weakness_score)
    risk_score = max(0, min(100, risk_score))

    # Determine risk level
    if risk_score >= 75:
        risk_level = "Extreme"
    elif risk_score >= 50:
        risk_level = "High"
    elif risk_score >= 25:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    return {
        "risk_level": risk_level,
        "risk_score": risk_score,
        "components": {
            "volatility": round(avg_volatility, 2),
            "fear_greed_extremeness": round(fg_extremeness, 1),
            "trend_weakness": round(100 - avg_trend_strength, 1)
        }
    }

def calculate_asset_correlations():
    """
    Calculate asset correlation coefficients (mock data based on typical market correlations).
    Returns correlations between asset pairs on a scale of 0.0 to 1.0.
    """
    import random

    return {
        "BTC-ETH": round(random.uniform(0.70, 0.90), 2),  # High correlation - both crypto
        "AAPL-NVDA": round(random.uniform(0.50, 0.70), 2),  # Moderate - both tech stocks
        "BTC-AAPL": round(random.uniform(0.10, 0.30), 2)   # Low - crypto vs stock
    }


def calculate_sector_analysis(assets_data):
    """
    Calculate sector performance analysis.
    - Technology: AAPL + NVDA average sentiment
    - Crypto: BTC + ETH average sentiment
    Returns sector_performance, sector_trends, and leading_sector.
    """
    # Calculate sector averages
    tech_sentiments = [assets_data.get("AAPL", {}).get("sentiment", 50),
                       assets_data.get("NVDA", {}).get("sentiment", 50)]
    crypto_sentiments = [assets_data.get("BTC", {}).get("sentiment", 50),
                         assets_data.get("ETH", {}).get("sentiment", 50)]
    
    tech_avg = sum(tech_sentiments) / len(tech_sentiments)
    crypto_avg = sum(crypto_sentiments) / len(crypto_sentiments)
    
    def get_sector_trend(avg):
        if avg >= 58:
            return "bullish"
        elif avg >= 52:
            return "slightly_bullish"
        elif avg <= 42:
            return "bearish"
        elif avg <= 48:
            return "slightly_bearish"
        else:
            return "neutral"
    
    sector_performance = {
        "Technology": round(tech_avg, 1),
        "Crypto": round(crypto_avg, 1)
    }
    
    sector_trend = {
        "Technology": get_sector_trend(tech_avg),
        "Crypto": get_sector_trend(crypto_avg)
    }
    
    # Determine leading sector
    if tech_avg > crypto_avg + 5:
        leading_sector = "Technology"
    elif crypto_avg > tech_avg + 5:
        leading_sector = "Crypto"
    else:
        leading_sector = "Neutral"
    
    return {
        "sector_performance": sector_performance,
        "sector_trend": sector_trend,
        "leading_sector": leading_sector
    }


def calculate_volatility_index(assets_data):
    """
    Calculate volatility index (0-100) based on:
    - Price change magnitude (40% weight) - larger swings = higher volatility
    - Sentiment swings (30% weight) - range between bullish/bearish
    - Volume spikes (30% weight) - high volume = elevated volatility
    Returns volatility_index and label.
    """
    # 1. Price change magnitude (40% weight)
    price_changes = [abs(a.get("price_change_24h", 0)) for a in assets_data.values()]
    avg_price_change = sum(price_changes) / len(price_changes) if price_changes else 0
    # Scale: 0% = 0, 5%+ = 100
    price_volatility = min(100, avg_price_change * 20) * 0.40

    # 2. Sentiment swings (30% weight) - measure dispersion
    sentiments = [a.get("sentiment", 50) for a in assets_data.values()]
    if len(sentiments) >= 2:
        sentiment_range = max(sentiments) - min(sentiments)
        # Scale: 0 range = 0, 50+ range = 100
        sentiment_volatility = min(100, sentiment_range * 2) * 0.30
    else:
        sentiment_volatility = 25 * 0.30  # Default moderate

    # 3. Volume spikes (30% weight)
    volume_scores = [a.get("volume_score", 50) for a in assets_data.values()]
    avg_volume = sum(volume_scores) / len(volume_scores) if volume_scores else 50
    volume_volatility = avg_volume * 0.30

    # Calculate total volatility index
    volatility_index = int(price_volatility + sentiment_volatility + volume_volatility)
    volatility_index = max(0, min(100, volatility_index))

    # Determine label
    if volatility_index <= 25:
        label = "Calm"
    elif volatility_index <= 50:
        label = "Normal"
    elif volatility_index <= 75:
        label = "Elevated"
    else:
        label = "High"

    return {
        "volatility_index": volatility_index,
        "label": label,
        "components": {
            "price_volatility": round(avg_price_change, 2),
            "sentiment_range": round(sentiment_range if len(sentiments) >= 2 else 0, 1),
            "volume_score": round(avg_volume, 1)
        }
    }



def calculate_historical_comparison(current_score):
    """
    Calculate historical comparison metrics (mock data for now).
    Returns sentiment change vs yesterday, trend direction, and week-over-week change.
    In production, this would query historical sentiment data from a database.
    """
    import random

    # Mock: generate realistic historical comparisons
    sentiment_change = random.choice([-8, -5, -3, -1, 0, +2, +3, +5, +7])
    week_over_week = random.choice([-12, -8, -5, -3, 0, +2, +4, +6, +10])

    # Determine trend direction based on changes
    if sentiment_change > 2 or week_over_week > 5:
        trend_direction = "improving"
    elif sentiment_change < -2 or week_over_week < -5:
        trend_direction = "declining"
    else:
        trend_direction = "stable"

    return {
        "sentiment_change": sentiment_change,
        "trend_direction": trend_direction,
        "week_over_week": week_over_week
    }

def generate_trading_recommendations(assets_data, fear_greed, signal_summary, overall_score):
    """
    Generate 3 actionable trading recommendations based on sentiment analysis.
    Returns array of recommendations with action, asset, reason, timeframe.
    """
    recommendations = []
    
    # Sort assets by sentiment (lowest first for buy opportunities, highest for sell)
    sorted_assets = sorted(assets_data.items(), key=lambda x: x[1].get("sentiment", 50))
    
    # Recommendation 1: Based on strongest signal
    signal = signal_summary.get("signal", "HOLD")
    if "BUY" in signal:
        # Find asset with lowest sentiment (potential upside)
        for asset, data in sorted_assets:
            if data.get("sentiment", 50) < 55 and data.get("trend_strength", 50) > 40:
                recommendations.append({
                    "action": "Buy",
                    "asset": asset,
                    "reason": f"Sentiment oversold at {data.get('sentiment', 50)} with improving trend strength",
                    "timeframe": "short"
                })
                break
        if not recommendations:
            # Default to BTC if no oversold assets
            recommendations.append({
                "action": "Buy",
                "asset": "BTC",
                "reason": f"Overall bullish signal with {signal} recommendation",
                "timeframe": "medium"
            })
    elif "SELL" in signal:
        # Find asset with highest sentiment (take profits)
        for asset, data in reversed(sorted_assets):
            if data.get("sentiment", 50) > 60:
                recommendations.append({
                    "action": "Sell",
                    "asset": asset,
                    "reason": f"Sentiment overbought at {data.get('sentiment', 50)}, taking profits advised",
                    "timeframe": "short"
                })
                break
        if not recommendations:
            recommendations.append({
                "action": "Hold",
                "asset": "Cash",
                "reason": "Bearish market conditions, preserve capital",
                "timeframe": "short"
            })
    else:
        # HOLD signal - look for watch opportunities
        recommendations.append({
            "action": "Hold",
            "asset": "Portfolio",
            "reason": f"Mixed signals with {fear_greed.get('label', 'Neutral')} sentiment - wait for clarity",
            "timeframe": "medium"
        })
    
    # Recommendation 2: Based on Fear & Greed
    fg_value = fear_greed.get("value", 50)
    if fg_value <= 30:
        recommendations.append({
            "action": "Buy",
            "asset": "BTC",
            "reason": f"Extreme fear ({fg_value}) presents buying opportunity",
            "timeframe": "long"
        })
    elif fg_value >= 75:
        recommendations.append({
            "action": "Sell",
            "asset": "ETH",
            "reason": f"Extreme greed ({fg_value}) indicates market top",
            "timeframe": "short"
        })
    else:
        # Find asset with best momentum
        best_momentum = max(assets_data.items(), key=lambda x: x[1].get("momentum_score", 50))
        if best_momentum[1].get("momentum_score", 50) >= 55:
            recommendations.append({
                "action": "Buy",
                "asset": best_momentum[0],
                "reason": f"Strong momentum ({best_momentum[1].get('momentum_label', 'Up')}) with positive trend",
                "timeframe": "medium"
            })
        else:
            recommendations.append({
                "action": "Watch",
                "asset": best_momentum[0],
                "reason": "Monitoring for momentum confirmation",
                "timeframe": "short"
            })
    
    # Recommendation 3: Based on individual asset analysis
    # Find divergent asset (sentiment vs price change)
    for asset, data in assets_data.items():
        sentiment = data.get("sentiment", 50)
        price_change = data.get("price_change_24h", 0)
        # Divergence: sentiment bullish but price dropping (buy the dip)
        if sentiment >= 55 and price_change < -2:
            recommendations.append({
                "action": "Buy",
                "asset": asset,
                "reason": f"Dip buying opportunity - sentiment bullish ({sentiment}) but price down {price_change:.1f}%",
                "timeframe": "short"
            })
            break
        # Divergence: sentiment bearish but price rising (potential reversal)
        elif sentiment <= 45 and price_change > 2:
            recommendations.append({
                "action": "Watch",
                "asset": asset,
                "reason": f"Potential reversal - bearish sentiment ({sentiment}) but price rising",
                "timeframe": "medium"
            })
            break
    
    # Default 3rd recommendation if no divergence found
    if len(recommendations) < 3:
        recommendations.append({
            "action": "Watch",
            "asset": "NVDA",
            "reason": "Tech sector momentum key for market direction",
            "timeframe": "medium"
        })
    
    return recommendations[:3]  # Ensure exactly 3 recommendations



def generate_alert_triggers(assets_data, current_prices, fear_greed):
    """
    Generate alert triggers based on market conditions.
    Returns array of triggers with condition, asset, and priority.
    """
    triggers = []

    # 1. Price crossing support/resistance
    for asset, thresholds in ALERT_THRESHOLDS.items():
        price_data = current_prices.get(asset, {})
        price = price_data.get("price", 0)
        support = thresholds.get("support", 0)
        resistance = thresholds.get("resistance", 0)

        if price > 0:
            # Check proximity to resistance (within 2%)
            if resistance > 0 and price >= resistance * 0.98:
                if price >= resistance:
                    triggers.append({
                        "condition": "Price broke above resistance",
                        "asset": asset,
                        "priority": "high",
                        "details": f"${price:,.2f} vs resistance ${resistance:,.2f}"
                    })
                else:
                    triggers.append({
                        "condition": "Price approaching resistance",
                        "asset": asset,
                        "priority": "medium",
                        "details": f"${price:,.2f} within 2% of ${resistance:,.2f}"
                    })

            # Check proximity to support (within 2%)
            if support > 0 and price <= support * 1.02:
                if price <= support:
                    triggers.append({
                        "condition": "Price broke below support",
                        "asset": asset,
                        "priority": "high",
                        "details": f"${price:,.2f} vs support ${support:,.2f}"
                    })
                else:
                    triggers.append({
                        "condition": "Price approaching support",
                        "asset": asset,
                        "priority": "medium",
                        "details": f"${price:,.2f} within 2% of ${support:,.2f}"
                    })

    # 2. Extreme fear/greed readings
    fg_value = fear_greed.get("value", 50)
    if fg_value <= 20:
        triggers.append({
            "condition": "Extreme fear - potential bottom",
            "asset": "MARKET",
            "priority": "high",
            "details": f"Fear & Greed at {fg_value}"
        })
    elif fg_value <= 30:
        triggers.append({
            "condition": "Fear territory - buy opportunity",
            "asset": "MARKET",
            "priority": "medium",
            "details": f"Fear & Greed at {fg_value}"
        })
    elif fg_value >= 80:
        triggers.append({
            "condition": "Extreme greed - correction risk",
            "asset": "MARKET",
            "priority": "high",
            "details": f"Fear & Greed at {fg_value}"
        })
    elif fg_value >= 70:
        triggers.append({
            "condition": "Greed territory - take profits",
            "asset": "MARKET",
            "priority": "medium",
            "details": f"Fear & Greed at {fg_value}"
        })

    # 3. Strong trend changes
    for asset, data in assets_data.items():
        momentum_score = data.get("momentum_score", 50)
        momentum_label = data.get("momentum_label", "")
        trend = data.get("trend", "neutral")
        price_change = data.get("price_change_24h", 0)

        # Strong momentum shifts
        if momentum_label == "Strong Up":
            triggers.append({
                "condition": "Strong bullish momentum detected",
                "asset": asset,
                "priority": "medium",
                "details": f"Momentum score {momentum_score}"
            })
        elif momentum_label == "Strong Down":
            triggers.append({
                "condition": "Strong bearish momentum detected",
                "asset": asset,
                "priority": "high",
                "details": f"Momentum score {momentum_score}"
            })

        # Large price swings
        if abs(price_change) >= 5:
            triggers.append({
                "condition": f"Large price swing ({price_change:+.1f}%)",
                "asset": asset,
                "priority": "high",
                "details": f"24h change: {price_change:+.2f}%"
            })
        elif abs(price_change) >= 3:
            triggers.append({
                "condition": f"Significant price move ({price_change:+.1f}%)",
                "asset": asset,
                "priority": "medium",
                "details": f"24h change: {price_change:+.2f}%"
            })

    return triggers

def update_sentiment_file():
    print("")
    print("=" * 60)
    print("TradingAI Sentiment Engine - Enhanced v2.1")
    print("Time: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print("=" * 60)

    news_data, source_stats = fetch_all_sources()

    total_headlines = sum(len(v) for v in news_data.values())
    successful_sources = sum(1 for s in source_stats.values() if s["success"])

    print("")
    print("[INFO] Collection Summary:")
    print("   Total headlines: " + str(total_headlines))
    print("   Successful sources: " + str(successful_sources) + "/" + str(len(RSS_FEEDS)))

    print("")
    print("[INFO] Analyzing sentiment per asset...")
    print("-" * 50)

    # Fetch current prices
    current_prices = fetch_current_prices()
    print("")
    print("[INFO] Current Prices:")
    for sym, pdata in current_prices.items():
        print(f"   {sym}: ${pdata['price']:,.2f} ({pdata['change_24h']:+.2f}%)")

    assets_data = {}
    for asset in ASSETS:
        asset_data = analyze_asset_sentiment_v2(asset, news_data)
        price_change = current_prices.get(asset, {}).get("change_24h", 0)
        asset_data["price_change_24h"] = price_change

        # Add price targets
        current_price = current_prices.get(asset, {}).get("price", 0)
        asset_data["price_targets"] = {
            "bull_case": round(current_price * 1.10, 2),
            "base_case": round(current_price, 2),
            "bear_case": round(current_price * 0.90, 2)
        }
        # Recalculate trend_strength with actual price change
        vol_score = asset_data.get("volume_score", 50)
        conf = asset_data.get("confidence", 0.5)
        ts, tsl = calculate_trend_strength(conf, vol_score, price_change)
        asset_data["trend_strength"] = ts
        asset_data["trend_strength_label"] = tsl

        # Add momentum score
        momentum = calculate_momentum_score(
            price_change, 
            asset_data.get("sentiment", 50),
            asset_data.get("volume_trend", "normal")
        )
        asset_data["momentum_score"] = momentum["momentum_score"]
        asset_data["momentum_label"] = momentum["momentum_label"]
        assets_data[asset] = asset_data
        data = assets_data[asset]
        print("   " + asset + ": " + str(data["sentiment"]) + " (" + data["trend"] + ") - confidence: " + str(data["confidence"]))
        print("       Headlines: " + str(data["headlines_analyzed"]) + " | Sources: " + str(len(data["sources"])))
        if data["matched_keywords"]:
            print("       Keywords: " + ", ".join(data["matched_keywords"][:3]))

    overall_score = int(sum(a["sentiment"] for a in assets_data.values()) / len(assets_data))
    overall_label = "Bullish" if overall_score >= 50 else "Bearish"

    # Calculate Fear & Greed Index
    fear_greed = calculate_fear_greed_index(assets_data, overall_score)

    # Calculate trading signal summary
    signal_summary = calculate_signal_summary(assets_data, overall_score, fear_greed["value"])

    # Calculate market regime
    market_regime = calculate_market_regime(assets_data, overall_score)

    # Generate trading recommendations
    recommendations = generate_trading_recommendations(assets_data, fear_greed, signal_summary, overall_score)

    themes = get_top_themes_v2(news_data)
    market_status = get_market_status()

    # Calculate risk assessment
    risk_assessment = calculate_risk_assessment(assets_data, fear_greed["value"])

    # Calculate volatility index
    volatility_index = calculate_volatility_index(assets_data)

    # Calculate sector analysis
    sector_analysis = calculate_sector_analysis(assets_data)

    # Calculate performance score
    performance_score = calculate_performance_score(source_stats, assets_data, signal_summary)

    sentiment_data = {
        "timestamp": datetime.now(timezone.utc).astimezone().isoformat(),
        "market_status": market_status,
        "source": "Multi-Source RSS (" + str(successful_sources) + " sources)",
        "assets": assets_data,
        "alerts": ALERT_THRESHOLDS,
        "fear_greed_index": fear_greed,
        "signal_summary": signal_summary,
        "market_regime": market_regime,
        "correlations": calculate_asset_correlations(),
        "risk_assessment": risk_assessment,
        "volatility_index": volatility_index,
        "alert_triggers": generate_alert_triggers(assets_data, current_prices, fear_greed),
        "sector_analysis": sector_analysis,
        "historical_comparison": calculate_historical_comparison(overall_score),
        "performance_score": performance_score,
        "overall": {
            "sentiment": overall_score,
            "label": overall_label
        },
        "metadata": {
            "engine_version": "2.2",
            "data_sources": list(source_stats.keys()),
            "headlines_count": total_headlines,
            "last_updated": datetime.now(timezone.utc).astimezone().isoformat(),
            "next_update": (datetime.now(timezone.utc) + timedelta(minutes=5)).astimezone().isoformat()
        },
        "themes": themes,
        "recommendations": recommendations,
        "top_headlines": get_top_headlines(news_data, 5),
        "headlines_fetched": total_headlines,
        "sources_active": successful_sources,
        "engine_version": "2.2"
    }

    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w") as f:
        json.dump(sentiment_data, f, indent=2)

    print("")
    print("=" * 60)
    print("[SUCCESS] Sentiment data updated!")
    print("=" * 60)
    print("   Fear & Greed: " + str(fear_greed["value"]) + " (" + fear_greed["label"] + ")")
    print("   Overall: " + str(overall_score) + " (" + overall_label + ")")
    print("   Market: Stock " + market_status["stock"] + ", Crypto " + market_status["crypto"])
    print("   Themes: " + ", ".join(themes))
    print("   Headlines analyzed: " + str(total_headlines))
    print("   Output: " + str(DATA_FILE))
    print("")

    return sentiment_data

if __name__ == "__main__":
    update_sentiment_file()



