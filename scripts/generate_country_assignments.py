#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import time
import urllib.request
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data" / "countrygeojsoncollection"
OUTPUT_PATH = PROJECT_ROOT / "src" / "data" / "countryAssignments.generated.json"

REPO = "LonnyGomes/CountryGeoJSONCollection"
RAW_BASE_URL = f"https://raw.githubusercontent.com/{REPO}/master"
COUNTRIES_URL = f"{RAW_BASE_URL}/countries.geojson"
VERSION_URL = f"{RAW_BASE_URL}/countries.VERSION.txt"

MAP_WIDTH = 10800
MAP_HEIGHT = 5400
HEX_SIZE = 26
PROJECTION = "equirectangular"
EXCLUDED_FEATURE_TYPES = {"Indeterminate", "Disputed", "Lease"}


Point = tuple[float, float]
BBox = tuple[float, float, float, float]
PreparedRing = tuple[BBox, list[Point]]
PreparedPolygon = dict[str, Any]
PreparedFeature = dict[str, Any]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate country assignments for the hexagonal_cells map."
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Download fresh source files even when cached copies exist.",
    )
    return parser.parse_args()


def download(url: str, path: Path, refresh: bool) -> None:
    if path.exists() and not refresh:
        print(f"Using cached {path.relative_to(PROJECT_ROOT)}")
        return

    print(f"Downloading {url}")
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "codex"})
    with urllib.request.urlopen(request, timeout=120) as response:
        with path.open("wb") as file:
            shutil.copyfileobj(response, file)


def valid_code(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    value = value.strip()
    return len(value) == 3 and value != "-99" and value.isalnum()


def normalize_name(value: Any) -> str:
    return str(value or "").strip().casefold()


def is_assignable_feature(props: dict[str, Any]) -> bool:
    return str(props.get("TYPE") or "").strip() not in EXCLUDED_FEATURE_TYPES


def choose_sovereign_features(features: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    best_by_sovereign: dict[str, tuple[tuple[int, int, int], dict[str, Any]]] = {}

    for feature in features:
        props = feature.get("properties") or {}
        if not is_assignable_feature(props):
            continue

        sovereign = str(props.get("SOVEREIGNT") or "").strip()
        adm0_a3 = props.get("ADM0_A3")
        if not sovereign or not valid_code(adm0_a3):
            continue

        admin_matches = normalize_name(props.get("ADMIN")) == normalize_name(sovereign)
        name_matches = normalize_name(props.get("NAME_EN") or props.get("NAME")) == normalize_name(sovereign)
        homepart = int(props.get("HOMEPART") or 0)
        scalerank = int(props.get("scalerank") or 99)

        score = (
            0 if admin_matches or name_matches else 1,
            0 if homepart == 1 else 1,
            scalerank,
        )
        current = best_by_sovereign.get(sovereign)
        if current is None or score < current[0]:
            best_by_sovereign[sovereign] = (score, feature)

    return {sovereign: feature for sovereign, (_, feature) in best_by_sovereign.items()}


def stable_color(country_id: str, name: str) -> str:
    digest = hashlib.sha1(f"{country_id}:{name}".encode("utf-8")).digest()
    hue = int.from_bytes(digest[:2], "big") % 360
    saturation = 46 + digest[2] % 18
    lightness = 49 + digest[3] % 12
    return hsl_to_hex(hue, saturation / 100.0, lightness / 100.0)


def hsl_to_hex(hue: int, saturation: float, lightness: float) -> str:
    c = (1 - abs(2 * lightness - 1)) * saturation
    x = c * (1 - abs((hue / 60) % 2 - 1))
    m = lightness - c / 2

    if hue < 60:
        r1, g1, b1 = c, x, 0
    elif hue < 120:
        r1, g1, b1 = x, c, 0
    elif hue < 180:
        r1, g1, b1 = 0, c, x
    elif hue < 240:
        r1, g1, b1 = 0, x, c
    elif hue < 300:
        r1, g1, b1 = x, 0, c
    else:
        r1, g1, b1 = c, 0, x

    return "#{:02X}{:02X}{:02X}".format(
        round((r1 + m) * 255),
        round((g1 + m) * 255),
        round((b1 + m) * 255),
    )


def build_countries(
    features: list[dict[str, Any]],
    sovereign_features: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, str]], dict[str, str]]:
    country_id_by_sovereign: dict[str, str] = {}
    countries_by_id: dict[str, dict[str, str]] = {}

    for sovereign, feature in sovereign_features.items():
        props = feature.get("properties") or {}
        country_id = str(props["ADM0_A3"]).strip()
        country_name = str(
            props.get("NAME_RU")
            or props.get("NAME_EN")
            or props.get("NAME")
            or sovereign
        ).strip()

        country_id_by_sovereign[sovereign] = country_id
        countries_by_id[country_id] = {
            "id": country_id,
            "name": country_name,
            "color": stable_color(country_id, country_name),
        }

    for feature in features:
        props = feature.get("properties") or {}
        if not is_assignable_feature(props):
            continue

        sovereign = str(props.get("SOVEREIGNT") or "").strip()
        if sovereign in country_id_by_sovereign:
            continue

        fallback_id = props.get("SOV_A3") if valid_code(props.get("SOV_A3")) else props.get("ADM0_A3")
        if not valid_code(fallback_id):
            continue

        country_id = str(fallback_id).strip()
        country_name = str(
            props.get("NAME_RU")
            or props.get("NAME_EN")
            or props.get("NAME")
            or sovereign
            or country_id
        ).strip()
        country_id_by_sovereign[sovereign] = country_id
        countries_by_id.setdefault(
            country_id,
            {
                "id": country_id,
                "name": country_name,
                "color": stable_color(country_id, country_name),
            },
        )

    countries = sorted(countries_by_id.values(), key=lambda item: item["name"])
    return countries, country_id_by_sovereign


def bbox_from_points(points: list[Point]) -> BBox:
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def bbox_contains(bbox: BBox, lon: float, lat: float) -> bool:
    min_lon, min_lat, max_lon, max_lat = bbox
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def bbox_union(bboxes: list[BBox]) -> BBox:
    return (
        min(bbox[0] for bbox in bboxes),
        min(bbox[1] for bbox in bboxes),
        max(bbox[2] for bbox in bboxes),
        max(bbox[3] for bbox in bboxes),
    )


def prepare_ring(raw_ring: list[list[float]]) -> PreparedRing | None:
    points = [(float(point[0]), float(point[1])) for point in raw_ring if len(point) >= 2]
    if len(points) < 4:
        return None
    return bbox_from_points(points), points


def prepare_polygon(raw_polygon: list[list[list[float]]]) -> PreparedPolygon | None:
    rings = [ring for ring in (prepare_ring(raw_ring) for raw_ring in raw_polygon) if ring]
    if not rings:
        return None
    return {"bbox": rings[0][0], "rings": rings}


def prepare_geometry(geometry: dict[str, Any]) -> list[PreparedPolygon]:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates") or []
    raw_polygons = [coordinates] if geometry_type == "Polygon" else coordinates
    if geometry_type not in {"Polygon", "MultiPolygon"}:
        return []

    polygons = [
        polygon for polygon in (prepare_polygon(raw_polygon) for raw_polygon in raw_polygons) if polygon
    ]
    return polygons


def build_prepared_features(
    features: list[dict[str, Any]],
    country_id_by_sovereign: dict[str, str],
) -> list[PreparedFeature]:
    prepared_features: list[PreparedFeature] = []

    for feature in features:
        props = feature.get("properties") or {}
        if not is_assignable_feature(props):
            continue

        sovereign = str(props.get("SOVEREIGNT") or "").strip()
        country_id = country_id_by_sovereign.get(sovereign)
        if not country_id:
            continue

        polygons = prepare_geometry(feature.get("geometry") or {})
        if not polygons:
            continue

        prepared_features.append(
            {
                "country_id": country_id,
                "bbox": bbox_union([polygon["bbox"] for polygon in polygons]),
                "polygons": polygons,
            }
        )

    return prepared_features


def point_in_ring(ring: list[Point], lon: float, lat: float) -> bool:
    inside = False
    previous_lon, previous_lat = ring[-1]

    for current_lon, current_lat in ring:
        crosses_lat = (current_lat > lat) != (previous_lat > lat)
        if crosses_lat:
            delta_lat = previous_lat - current_lat
            if abs(delta_lat) > 1e-12:
                intersect_lon = (previous_lon - current_lon) * (lat - current_lat) / delta_lat + current_lon
                if lon < intersect_lon:
                    inside = not inside
        previous_lon, previous_lat = current_lon, current_lat

    return inside


def point_in_polygon(polygon: PreparedPolygon, lon: float, lat: float) -> bool:
    rings: list[PreparedRing] = polygon["rings"]
    outer_bbox, outer_ring = rings[0]
    if not bbox_contains(outer_bbox, lon, lat) or not point_in_ring(outer_ring, lon, lat):
        return False

    for hole_bbox, hole_ring in rings[1:]:
        if bbox_contains(hole_bbox, lon, lat) and point_in_ring(hole_ring, lon, lat):
            return False

    return True


def find_country_id(features: list[PreparedFeature], lon: float, lat: float) -> str | None:
    for feature in features:
        if not bbox_contains(feature["bbox"], lon, lat):
            continue
        if any(point_in_polygon(polygon, lon, lat) for polygon in feature["polygons"]):
            return str(feature["country_id"])
    return None


def axial_to_world(q: int, r: int) -> tuple[float, float]:
    sqrt3 = math.sqrt(3)
    x = HEX_SIZE * sqrt3 * (q + r / 2)
    y = HEX_SIZE * 1.5 * r
    return x, y


def axial_round(q: float, r: float) -> tuple[int, int]:
    s = -q - r
    rounded_q = round(q)
    rounded_r = round(r)
    rounded_s = round(s)

    q_diff = abs(rounded_q - q)
    r_diff = abs(rounded_r - r)
    s_diff = abs(rounded_s - s)

    if q_diff > r_diff and q_diff > s_diff:
        rounded_q = -rounded_r - rounded_s
    elif r_diff > s_diff:
        rounded_r = -rounded_q - rounded_s

    return rounded_q, rounded_r


def world_to_axial(x: float, y: float) -> tuple[int, int]:
    sqrt3 = math.sqrt(3)
    q = (sqrt3 / 3 * x - 1 / 3 * y) / HEX_SIZE
    r = (2 / 3 * y) / HEX_SIZE
    return axial_round(q, r)


def iter_hex_cells() -> list[tuple[int, int, float, float]]:
    hex_width = math.sqrt(3) * HEX_SIZE
    hex_height = 2 * HEX_SIZE

    corners = [
        world_to_axial(0, 0),
        world_to_axial(MAP_WIDTH, 0),
        world_to_axial(0, MAP_HEIGHT),
        world_to_axial(MAP_WIDTH, MAP_HEIGHT),
    ]
    min_q = min(point[0] for point in corners) - 1
    max_q = max(point[0] for point in corners) + 1
    min_r = min(point[1] for point in corners) - 1
    max_r = max(point[1] for point in corners) + 1

    cells: list[tuple[int, int, float, float]] = []
    for r in range(min_r, max_r + 1):
        for q in range(min_q, max_q + 1):
            x, y = axial_to_world(q, r)
            if (
                x - hex_width / 2 >= 0
                and x + hex_width / 2 <= MAP_WIDTH
                and y - hex_height / 2 >= 0
                and y + hex_height / 2 <= MAP_HEIGHT
            ):
                cells.append((q, r, x, y))

    return cells


def world_to_lon_lat(x: float, y: float) -> tuple[float, float]:
    lon = x / MAP_WIDTH * 360 - 180
    lat = 90 - y / MAP_HEIGHT * 180
    return lon, lat


def generate_assignments(prepared_features: list[PreparedFeature]) -> list[list[Any]]:
    assignments: list[list[Any]] = []
    cells = iter_hex_cells()

    for index, (q, r, x, y) in enumerate(cells, start=1):
        lon, lat = world_to_lon_lat(x, y)
        country_id = find_country_id(prepared_features, lon, lat)
        if country_id:
            assignments.append([q, r, country_id])

        if index % 5000 == 0:
            print(f"Processed {index}/{len(cells)} hexes")

    return assignments


def load_source(refresh: bool) -> tuple[dict[str, Any], str]:
    countries_path = DATA_DIR / "countries.geojson"
    version_path = DATA_DIR / "countries.VERSION.txt"

    download(COUNTRIES_URL, countries_path, refresh)
    download(VERSION_URL, version_path, refresh)

    with countries_path.open("r", encoding="utf-8") as file:
        countries_geojson = json.load(file)
    version = version_path.read_text(encoding="utf-8").strip()
    return countries_geojson, version


def main() -> None:
    args = parse_args()
    started_at = time.time()

    countries_geojson, version = load_source(args.refresh)
    features = countries_geojson.get("features") or []
    sovereign_features = choose_sovereign_features(features)
    countries, country_id_by_sovereign = build_countries(features, sovereign_features)
    prepared_features = build_prepared_features(features, country_id_by_sovereign)
    assignments = generate_assignments(prepared_features)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": {
            "repo": REPO,
            "version": version,
            "file": "countries.geojson",
        },
        "map": {
            "width": MAP_WIDTH,
            "height": MAP_HEIGHT,
            "hexSize": HEX_SIZE,
            "projection": PROJECTION,
        },
        "countries": countries,
        "assignments": assignments,
    }

    with OUTPUT_PATH.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, separators=(",", ":"))
        file.write("\n")

    elapsed = time.time() - started_at
    print(f"Source version: {version}")
    print(f"Countries: {len(countries)}")
    print(f"Prepared features: {len(prepared_features)}")
    print(f"Assignments: {len(assignments)}")
    print(f"Wrote {OUTPUT_PATH.relative_to(PROJECT_ROOT)} in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
