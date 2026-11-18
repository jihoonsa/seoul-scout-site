# Seoul Scout

**Live site:** https://jihoonsa.github.io/seoul-scout-site/

A map for someone about to open a small shop in Seoul. Pick one of 12 trades (café, bakery, nail salon and so on) and it shows which of Seoul's 424 neighborhoods (행정동) have fewer of those shops than similar neighborhoods, who buys there and when, how often shops close, what rent costs, and every shop on the street. In Korean and English.

**DA321 Data Analytics and Visualization**, Fall 2026 team project: Jihoon Choi, Sooyong Kim, Sejun Kim.

> A course prototype built from public data. Its suggestions are leads to check on the ground, not business advice.

## About this repository

This is only the published copy of the web app, served by GitHub Pages. The data pipeline, the analysis and the decision log are in the team's private course repository. Each update here is a fresh copy of its `web/` folder, so changes made directly in this repository are overwritten at the next publish.

## Running it on your own computer

You need Python 3 and an internet connection (the map's label letters load from Protomaps).

```bash
python serve.py
```

The map opens at http://localhost:8000. On Windows you can double-click `Open Seoul Scout.bat` instead. Opening `index.html` directly as a file does not work, because the browser then blocks the page from reading its data files.

## Data

| What | Source | As of |
|---|---|---|
| Stores (554,092): position, kind, floor, address | 소상공인시장진흥공단 상가(상권)정보, [data.go.kr](https://www.data.go.kr/data/15083033/fileData.do) | 2026-06-30 |
| People present by hour and age (생활인구) | 서울특별시 서울 생활인구 | July 2026 |
| Registered residents | 행정안전부 주민등록 인구 | 2026-08-31 |
| Card sales, shop counts, openings and closings, workers (직장인구), universities (집객시설) | 서울특별시 상권분석서비스, [data.seoul.go.kr](https://data.seoul.go.kr) | 2026 Q2 (openings and closings: 2025 Q3 to 2026 Q2) |
| Official commercial districts (주요상권) | 소상공인시장진흥공단 OpenAPI | boundaries 2024-01 |
| Small-shop rent and vacancy | 한국부동산원 R-ONE 임대동향 | 2026 Q2 |
| Neighborhood boundaries | [vuski/admdongkor](https://github.com/vuski/admdongkor) (CC BY 4.0) | 2026-07-01 |
| Base map | © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), via [Protomaps](https://protomaps.com) | |

## Third-party code and fonts

Each is in `vendor/` with its licence file:

- [MapLibre GL JS](https://maplibre.org) 5.24.0 (BSD-3-Clause)
- [PMTiles](https://github.com/protomaps/PMTiles) 4.5.0 (BSD-3-Clause)
- [Lucide](https://lucide.dev) icons 1.66.0 (ISC), drawn in `icons.js`
- Pretendard and Gowun Batang fonts (SIL Open Font License)
