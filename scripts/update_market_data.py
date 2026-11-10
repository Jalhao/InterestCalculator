#!/usr/bin/env python3
"""Fetch index daily closes and publish only complete, consecutive month-end prices.

No third-party Python dependencies. Keep TLS verification enabled. Writes atomically
only after both series validate; a failed refresh preserves the last good snapshot.
"""
import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

SYMBOLS = {"sp500": "^GSPC", "nasdaq100": "^NDX"}


def month_number(value):
    year, month = map(int, value.split("-"))
    return year * 12 + month - 1


def extract_prices(payload, symbol, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    chart = payload.get("chart", {})
    if chart.get("error") or not chart.get("result"):
        raise ValueError(f"{symbol}: provider returned no valid chart")
    result = chart["result"][0]
    if result.get("meta", {}).get("symbol") != symbol:
        raise ValueError("Provider symbol mismatch")
    timestamps = result.get("timestamp", [])
    closes = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])
    if not timestamps or len(timestamps) != len(closes):
        raise ValueError("Invalid timestamp/close arrays")
    current_month = now.strftime("%Y-%m")
    monthly = {}
    previous_timestamp = None
    for timestamp, close in zip(timestamps, closes):
        if not isinstance(timestamp, (int, float)) or previous_timestamp is not None and timestamp <= previous_timestamp:
            raise ValueError("Timestamps must be strictly increasing")
        previous_timestamp = timestamp
        if close is None:
            continue
        if isinstance(close, bool) or not isinstance(close, (int, float)) or not math.isfinite(close) or close <= 0:
            raise ValueError("Invalid close")
        date = dt.datetime.fromtimestamp(timestamp, ZoneInfo("America/New_York"))
        month = date.strftime("%Y-%m")
        if month < current_month:
            monthly[month] = {"date": month, "close": close, "asOf": date.strftime("%Y-%m-%d")}
    prices = list(monthly.values())
    if len(prices) < 13:
        raise ValueError("Need at least 13 consecutive month-end prices")
    for a, b in zip(prices, prices[1:]):
        if month_number(b["date"]) != month_number(a["date"]) + 1:
            raise ValueError("Missing month in provider history")
    expected_last = now.year * 12 + now.month - 2
    if month_number(prices[-1]["date"]) != expected_last:
        raise ValueError("Provider history is stale; previous complete month is missing")
    # Guard against a truncated response ending in the middle of a month.
    # Month-end can fall on a weekend or holiday, but not >4 days after the last close.
    last_date = dt.date.fromisoformat(prices[-1]["asOf"])
    month_end = now.date().replace(day=1) - dt.timedelta(days=1)
    if (month_end - last_date).days > 4:
        raise ValueError("Last month appears incomplete")
    return prices


def fetch_chart(symbol):
    params = urllib.parse.urlencode({"period1": 473385600, "period2": int(time.time()), "interval": "1d"})
    url = "https://query1.finance.yahoo.com/v8/finance/chart/" + urllib.parse.quote(symbol, safe="") + "?" + params
    request = urllib.request.Request(url, headers={"User-Agent": "InterestCalculator/1.0", "Accept": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
            wait = error.headers.get('Retry-After', '')
            time.sleep(min(int(wait), 60) if wait.isdigit() else 2 ** attempt)
        except (OSError, ValueError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def update(output):
    now = dt.datetime.now(dt.timezone.utc)
    datasets = {}
    for key, symbol in SYMBOLS.items():
        prices = extract_prices(fetch_chart(symbol), symbol, now)
        datasets[key] = {"symbol": symbol, "currency": "USD", "returnType": "price",
                         "source": "Yahoo Finance chart / index close", "prices": prices}
        print(f"{symbol}: {len(prices)} month-end prices, {prices[0]['date']} to {prices[-1]['date']}")
    payload = {"schemaVersion": 1, "updatedAt": now.isoformat(), "datasets": datasets}
    output.parent.mkdir(parents=True, exist_ok=True)
    # Refuse a history regression; transient provider truncation must not replace good data.
    if output.exists():
        old = json.loads(output.read_text(encoding="utf-8"))
        for key, dataset in datasets.items():
            previous = old.get("datasets", {}).get(key, {}).get("prices", [])
            if previous and (dataset["prices"][0]["date"] > previous[0]["date"] or dataset["prices"][-1]["date"] < previous[-1]["date"]):
                raise ValueError(f"{key}: refusing truncated history")
    filename = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, delete=False) as temp:
            filename = temp.name
            json.dump(payload, temp, ensure_ascii=False, indent=2, allow_nan=False)
            temp.write("\n")
        os.replace(filename, output)
    finally:
        if filename and os.path.exists(filename):
            os.unlink(filename)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "market-data.json")
    args = parser.parse_args()
    update(args.output)
