"""
PDF時刻表 → CSV変換スクリプト

使い方:
  # 引数なし（既存の平塚駅データを変換）
  python scripts/pdf_to_csv.py

  # 引数あり（任意の駅）
  python scripts/pdf_to_csv.py \
    --weekday data/mystation_weekday.pdf \
    --holiday data/mystation_holiday.pdf \
    --output  data/my-station-id.csv
"""

import argparse
import pdfplumber
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"

# 種別キーワード（この単語が含まれる行は種別行と判断してスキップ）
TYPE_KEYWORDS = {"快", "特快", "快ラ", "快ア", "特湘", "特絶平"}

# 行き先の分類マップ
# (東京) 付き → "東京"、(新宿) 付き → "新宿"、単独の略語 → 以下のマップで解決
DEST_SINGLE_MAP = {
    "東": "東京",  # 東京終着
    "上": "東京",  # 上野
    "品": "東京",  # 品川
    "新": "新宿",  # 新宿終着
    "勝": "勝田",  # 勝田（臨時）
    "橋": "新前橋", # 新前橋
}


def classify_dest(raw: str) -> str:
    """行き先の略語を分類ラベルに変換する"""
    if "(東京)" in raw:
        return "東京"
    if "(新宿)" in raw:
        return "新宿"
    return DEST_SINGLE_MAP.get(raw, raw)


def parse_cell(content: str) -> list[tuple[str, str]]:
    """
    1時間分のセル文字列から (minute_str, destination) のペアリストを返す。

    セルの構造（各行は \n で区切られる）:
      [種別行]  例: "快ラ 快"  ← TYPE_KEYWORDS を含む行
      分行      例: "18 41 53"  ← 2桁数字（●付き可）のみ
      行き先行  例: "⾼(東京) 宇(東京) ⾼(新宿)"
      [分行 続き]
      [行き先行 続き]

    分と行き先は同じ順番で対応している。
    """
    minute_groups: list[list[str]] = []
    dest_groups: list[list[str]] = []

    for raw_line in content.split("\n"):
        line = raw_line.strip()
        if not line:
            continue

        tokens = line.split()

        # 種別行: TYPE_KEYWORDS を含む → スキップ
        if any(t in TYPE_KEYWORDS for t in tokens):
            continue

        # 分行: 全トークンが 2桁数字（● ■ ◆ 付き可）
        if all(re.match(r"^\d{2}[●■◆]*$", t) for t in tokens):
            minute_groups.append([re.sub(r"[●■◆]", "", t) for t in tokens])
            continue

        # 行き先行: それ以外
        dest_groups.append(tokens)

    # 分と行き先をフラットにしてペアリング
    minutes = [m for g in minute_groups for m in g]
    destinations = [d for g in dest_groups for d in g]

    pairs = []
    for i, minute in enumerate(minutes):
        dest_raw = destinations[i] if i < len(destinations) else ""
        pairs.append((minute, classify_dest(dest_raw)))

    return pairs


def parse_timetable(path: Path, day_type: str) -> list[tuple[str, str, str]]:
    """PDFから (time, destination, day_type) のリストを返す"""
    rows = []
    with pdfplumber.open(path) as pdf:
        table = pdf.pages[0].extract_tables()[0]

    for row in table:
        hour_str = row[0]
        content = row[1] if row[1] else ""

        if not (hour_str and re.match(r"^\d+$", hour_str.strip())):
            continue

        hour = int(hour_str.strip())

        for minute, dest in parse_cell(content):
            rows.append((f"{hour:02d}:{int(minute):02d}", dest, day_type))

    return rows


def main():
    parser = argparse.ArgumentParser(description="PDF時刻表 → CSV変換")
    parser.add_argument(
        "--weekday",
        default=str(DATA_DIR / "hiratuka_hei.pdf"),
        help="平日PDFファイルパス（デフォルト: data/hiratuka_hei.pdf）",
    )
    parser.add_argument(
        "--holiday",
        default=str(DATA_DIR / "hiratuka_kyu.pdf"),
        help="休日PDFファイルパス（デフォルト: data/hiratuka_kyu.pdf）",
    )
    parser.add_argument(
        "--output",
        default=str(DATA_DIR / "hiratsuka-tokaido-inbound.csv"),
        help="出力CSVファイルパス（デフォルト: data/hiratsuka-tokaido-inbound.csv）",
    )
    args = parser.parse_args()

    hei_path = Path(args.weekday)
    kyu_path = Path(args.holiday)
    out_path = Path(args.output)

    hei = parse_timetable(hei_path, "weekday")
    kyu = parse_timetable(kyu_path, "holiday")

    all_rows = sorted(hei) + sorted(kyu)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        f.write("time,destination,day_type\n")
        for time, dest, day_type in all_rows:
            f.write(f"{time},{dest},{day_type}\n")

    print(f"書き込み完了: {out_path}")
    print(f"平日: {len(hei)}件 / 休日: {len(kyu)}件 / 合計: {len(all_rows)}件")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
