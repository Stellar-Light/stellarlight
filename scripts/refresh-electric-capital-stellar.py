#!/usr/bin/env python3
"""
Refresh the Electric Capital Stellar developer snapshot used by /leaderboard.

Pulls the latest day of MAD (Monthly Active Developers) data for the Stellar
ecosystem from Electric Capital's public parquet dataset, plus 30d / 90d / 1y
deltas, and writes it to src/data/electric-capital-stellar.json.

Run periodically (manually or via GitHub Actions / cron) to keep the
dashboard fresh.

Usage:
  python3 scripts/refresh-electric-capital-stellar.py

Requires:
  pip install duckdb
"""

import json
import sys
from pathlib import Path

try:
    import duckdb
except ImportError:
    print("ERROR: duckdb not installed. Run: pip install duckdb", file=sys.stderr)
    sys.exit(1)

MANIFEST_URL = "https://data.opendevdata.org/manifest.json"
STELLAR_ECOSYSTEM_ID = 7
# Peer L1s we benchmark against in the dashboard chart. Ordered roughly by
# how visitors will recognize them. Stellar is rendered separately (gold,
# bold); everyone else is a muted comparison line.
PEER_ECOSYSTEMS = [
    {"id": 2, "name": "Ethereum"},
    {"id": 391, "name": "Solana"},
    {"id": 1, "name": "Bitcoin"},
    {"id": 2692, "name": "Polygon"},
    {"id": 2817, "name": "NEAR"},
    {"id": 8, "name": "Cardano"},
]
OUT_FILE = Path(__file__).resolve().parent.parent / "src" / "data" / "electric-capital-stellar.json"


def fetch_latest_snapshot_path() -> str:
    """Read the manifest via duckdb's httpfs (avoids system Python SSL issues)
    and find the latest eco_mads.parquet URL."""
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    # read_json with a single URL returns a struct with the JSON content
    res = con.execute(
        f"SELECT content FROM read_text('{MANIFEST_URL}')"
    ).fetchone()
    manifest = json.loads(res[0])
    for resource in manifest["dataset"]["resources"]:
        if resource["path"].endswith("/eco_mads.parquet"):
            return "https://data.opendevdata.org" + resource["path"]
    raise RuntimeError("eco_mads.parquet not found in manifest")


def main() -> None:
    eco_mads_url = fetch_latest_snapshot_path()
    print(f"Fetching from {eco_mads_url}…", file=sys.stderr)

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")

    res = con.execute(
        f"""
        WITH series AS (
          SELECT day, all_devs, exclusive_devs, multichain_devs, num_commits,
                 full_time_devs, part_time_devs, one_time_devs,
                 devs_0_1y, devs_1_2y, devs_2y_plus
          FROM '{eco_mads_url}'
          WHERE ecosystem_id = {STELLAR_ECOSYSTEM_ID}
        ), latest AS (
          SELECT MAX(day) AS d FROM series
        )
        SELECT
          (SELECT d FROM latest) AS latest_day,
          (SELECT all_devs FROM series s, latest l WHERE s.day = l.d) AS today_mad,
          (SELECT exclusive_devs FROM series s, latest l WHERE s.day = l.d) AS today_exclusive,
          (SELECT multichain_devs FROM series s, latest l WHERE s.day = l.d) AS today_multichain,
          (SELECT num_commits FROM series s, latest l WHERE s.day = l.d) AS today_commits,
          (SELECT full_time_devs FROM series s, latest l WHERE s.day = l.d) AS today_full_time,
          (SELECT part_time_devs FROM series s, latest l WHERE s.day = l.d) AS today_part_time,
          (SELECT one_time_devs FROM series s, latest l WHERE s.day = l.d) AS today_one_time,
          (SELECT devs_0_1y FROM series s, latest l WHERE s.day = l.d) AS today_devs_0_1y,
          (SELECT devs_1_2y FROM series s, latest l WHERE s.day = l.d) AS today_devs_1_2y,
          (SELECT devs_2y_plus FROM series s, latest l WHERE s.day = l.d) AS today_devs_2y_plus,
          (SELECT all_devs FROM series s, latest l WHERE s.day <= (l.d - INTERVAL 30 DAY)::DATE ORDER BY s.day DESC LIMIT 1) AS mad_30d_ago,
          (SELECT all_devs FROM series s, latest l WHERE s.day <= (l.d - INTERVAL 90 DAY)::DATE ORDER BY s.day DESC LIMIT 1) AS mad_90d_ago,
          (SELECT all_devs FROM series s, latest l WHERE s.day <= (l.d - INTERVAL 365 DAY)::DATE ORDER BY s.day DESC LIMIT 1) AS mad_1y_ago,
          (SELECT num_commits FROM series s, latest l WHERE s.day <= (l.d - INTERVAL 30 DAY)::DATE ORDER BY s.day DESC LIMIT 1) AS commits_30d_ago,
          (SELECT MAX(all_devs) FROM series) AS peak_mad,
          (SELECT day FROM series WHERE all_devs = (SELECT MAX(all_devs) FROM series) ORDER BY day DESC LIMIT 1) AS peak_day
        """
    ).fetchone()

    if not res:
        raise RuntimeError("Empty result from eco_mads parquet")

    columns = [d[0] for d in con.description]
    raw = dict(zip(columns, res))

    # Also fetch the full daily MAD series for the last year so the dashboard
    # can render a time-series chart.
    series_rows = con.execute(
        f"""
        SELECT day, all_devs
        FROM '{eco_mads_url}'
        WHERE ecosystem_id = {STELLAR_ECOSYSTEM_ID}
          AND day >= ((SELECT MAX(day) FROM '{eco_mads_url}' WHERE ecosystem_id = {STELLAR_ECOSYSTEM_ID}) - INTERVAL 365 DAY)::DATE
        ORDER BY day ASC
        """
    ).fetchall()
    series = [
        {"date": str(row[0]), "mad": int(row[1] or 0)} for row in series_rows
    ]

    # Geographic breakdown: country of currently-active (28d) Stellar devs.
    # Many devs have no public location, so we report counts among the
    # _located_ subset and surface the coverage rate separately.
    base = eco_mads_url.rsplit("/", 1)[0]
    geo_rows = con.execute(
        f"""
        WITH latest AS (
          SELECT MAX(day) AS d FROM '{base}/eco_developer_28d_activities.parquet'
          WHERE ecosystem_id = {STELLAR_ECOSYSTEM_ID}
        ), active_devs AS (
          SELECT DISTINCT a.canonical_developer_id
          FROM '{base}/eco_developer_28d_activities.parquet' a, latest l
          WHERE a.ecosystem_id = {STELLAR_ECOSYSTEM_ID} AND a.day = l.d
        ), dev_country AS (
          SELECT a.canonical_developer_id, loc.country
          FROM active_devs a
          LEFT JOIN '{base}/canonical_developer_locations.parquet' loc
            ON loc.canonical_developer_id = a.canonical_developer_id
        )
        SELECT COALESCE(country, '__unknown__') AS country, COUNT(*) AS devs
        FROM dev_country
        GROUP BY 1
        ORDER BY devs DESC
        """
    ).fetchall()

    geo_total_active = sum(int(r[1]) for r in geo_rows)
    geo_unknown = sum(int(r[1]) for r in geo_rows if r[0] == "__unknown__")
    geo_located = [
        {"country": r[0], "devs": int(r[1])}
        for r in geo_rows
        if r[0] != "__unknown__"
    ]

    # Peer ecosystem comparison: for each peer L1, fetch the same 365-day MAD
    # series + current 28d total. Used to render multi-line comparison chart.
    peer_ids = tuple(p["id"] for p in PEER_ECOSYSTEMS)
    peer_rows = con.execute(
        f"""
        SELECT ecosystem_id, day, all_devs
        FROM '{eco_mads_url}'
        WHERE ecosystem_id IN {peer_ids}
          AND day >= ((SELECT MAX(day) FROM '{eco_mads_url}' WHERE ecosystem_id = {STELLAR_ECOSYSTEM_ID}) - INTERVAL 365 DAY)::DATE
        ORDER BY ecosystem_id, day ASC
        """
    ).fetchall()
    peer_series: dict[int, list[dict]] = {p["id"]: [] for p in PEER_ECOSYSTEMS}
    for eco_id, day, devs in peer_rows:
        peer_series[eco_id].append({"date": str(day), "mad": int(devs or 0)})

    peers = [
        {
            "id": p["id"],
            "name": p["name"],
            "current": (
                peer_series[p["id"]][-1]["mad"]
                if peer_series[p["id"]]
                else 0
            ),
            "series": peer_series[p["id"]],
        }
        for p in PEER_ECOSYSTEMS
    ]

    snapshot = {
        "source": "Electric Capital — Open Dev Data",
        "sourceUrl": "https://www.developerreport.com/ecosystems/stellar",
        "ecosystem": "Stellar",
        "asOf": str(raw["latest_day"]),
        "refreshedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "mad": {
            "total": int(raw["today_mad"]) if raw["today_mad"] else 0,
            "exclusive": int(raw["today_exclusive"]) if raw["today_exclusive"] else 0,
            "multichain": int(raw["today_multichain"]) if raw["today_multichain"] else 0,
            "thirtyDaysAgo": int(raw["mad_30d_ago"]) if raw["mad_30d_ago"] else 0,
            "ninetyDaysAgo": int(raw["mad_90d_ago"]) if raw["mad_90d_ago"] else 0,
            "oneYearAgo": int(raw["mad_1y_ago"]) if raw["mad_1y_ago"] else 0,
            "allTimePeak": int(raw["peak_mad"]) if raw["peak_mad"] else 0,
            "allTimePeakDay": str(raw["peak_day"]) if raw["peak_day"] else None,
        },
        "commits28d": {
            "total": int(raw["today_commits"]) if raw["today_commits"] else 0,
            "thirtyDaysAgo": int(raw["commits_30d_ago"]) if raw["commits_30d_ago"] else 0,
        },
        "tenure": {
            "fullTime": int(raw["today_full_time"]) if raw["today_full_time"] else 0,
            "partTime": int(raw["today_part_time"]) if raw["today_part_time"] else 0,
            "oneTime": int(raw["today_one_time"]) if raw["today_one_time"] else 0,
        },
        "experience": {
            "lessThan1Year": int(raw["today_devs_0_1y"]) if raw["today_devs_0_1y"] else 0,
            "oneToTwoYears": int(raw["today_devs_1_2y"]) if raw["today_devs_1_2y"] else 0,
            "twoYearsPlus": int(raw["today_devs_2y_plus"]) if raw["today_devs_2y_plus"] else 0,
        },
        "series365d": series,
        "geo": {
            "totalActive28d": geo_total_active,
            "located": geo_total_active - geo_unknown,
            "unknown": geo_unknown,
            "topCountries": geo_located[:10],
        },
        "peers": peers,
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(snapshot, indent=2) + "\n")
    print(f"Wrote {OUT_FILE}", file=sys.stderr)
    print(json.dumps(snapshot, indent=2))


if __name__ == "__main__":
    main()
