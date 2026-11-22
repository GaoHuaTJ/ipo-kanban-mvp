#!/usr/bin/env python3
"""
二期数据采集脚本（纯 Python 标准库，零第三方依赖）：
1. 上市委审议：东方财富 RPT_IPO_REVIEW（2023-01-01 至今全面注册制上会记录）
   -> data/committee_data.json & data/committee_data.js
2. 发行动态：东方财富 RPTA_APP_IPOAPPLY（2023-01-01 至今沪深北新股发行记录）
   -> data/issuance_data.json & data/issuance_data.js
"""

import gzip
import json
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)

MIN_DATE = "2023-01-01"


def fetch_em(report_name, sort_col, page_num, page_size=500):
    params = {
        "reportName": report_name,
        "columns": "ALL",
        "sortColumns": sort_col,
        "sortTypes": "-1",
        "pageNumber": str(page_num),
        "pageSize": str(page_size),
        "source": "WEB",
        "client": "WEB",
    }
    url = f"https://datacenter-web.eastmoney.com/api/data/v1/get?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Referer": "https://data.eastmoney.com/",
            "Accept-Encoding": "gzip",
        },
    )
    with urllib.request.urlopen(req, timeout=20, context=ssl.create_default_context()) as resp:
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return json.loads(raw.decode("utf-8", errors="replace"))


def safe_date(val):
    if not val:
        return ""
    return str(val).strip()[:10]


def safe_float(val, digits=2):
    if val is None or val == "":
        return None
    try:
        return round(float(val), digits)
    except (TypeError, ValueError):
        return None


def infer_board(trade_market, market_type_new="", sec_code=""):
    tm = f"{trade_market or ''} {market_type_new or ''}"
    code = str(sec_code or "").strip()
    if "科创" in tm or code.startswith("688"):
        return "科创板", "上交所"
    if "创业" in tm or code.startswith("300") or code.startswith("301"):
        return "创业板", "深交所"
    if "北交" in tm or "北证" in tm or "北京" in tm or code.startswith(("920", "8", "4")):
        return "北证", "北交所"
    if "上海" in tm or "上交" in tm or "沪" in tm or code.startswith("60"):
        return "沪主板", "上交所"
    if "深圳" in tm or "深交" in tm or "深" in tm or code.startswith("00"):
        return "深主板", "深交所"
    return "其他", "其他"


def normalize_review_result(raw):
    s = str(raw or "").strip()
    if not s or "待上会" in s or "安排" in s:
        return "待上会"
    if "通过" in s and "未通过" not in s and "不通过" not in s:
        return "上会通过"
    if "暂缓" in s:
        return "暂缓表决"
    if "取消" in s:
        return "取消审核"
    if "未通过" in s or "不通过" in s or "否决" in s:
        return "未通过"
    return s


def normalize_org(raw):
    if not raw:
        return ""
    s = re.sub(r"股份有限公司$|有限责任公司$|有限公司$", "", str(raw).strip())
    return s.replace("证券承销保荐", "证券").strip()


def fetch_committee_records():
    """采集 2023-01-01 至今的上市委审议记录。"""
    records = []
    page = 1
    while page <= 12:
        data = fetch_em("RPT_IPO_REVIEW", "REVIEW_DATE", page, 500)
        res = data.get("result") or {}
        rows = res.get("data") or []
        if not rows:
            break

        stop = False
        for row in rows:
            review_dt = safe_date(row.get("REVIEW_DATE"))
            if not review_dt:
                continue
            if review_dt < MIN_DATE:
                stop = True
                continue

            board, exchange = infer_board(row.get("TRADE_MARKET"), "", row.get("SECURITY_CODE"))
            if board == "其他":
                continue

            amt_raw = safe_float(row.get("FINANCE_AMT_UPPER"), 2)
            plan_raise_yi = round(amt_raw / 1e8, 2) if amt_raw and amt_raw > 1e5 else amt_raw

            ratio_raw = safe_float(row.get("ISSUE_RATIO_AFTER"), 4)
            issue_ratio = round(ratio_raw * 100, 2) if ratio_raw is not None and ratio_raw <= 1 else ratio_raw

            members = [m.strip() for m in re.split(r"[,，、;；]+", str(row.get("REVIEW_MEMBER") or "")) if m.strip()]

            records.append({
                "id": str(row.get("INFO_CODE") or f"REV-{len(records)+1}"),
                "company": (row.get("ORG_NAME") or "").strip(),
                "abbr": (row.get("SECURITY_NAME_ABBR") or "").strip(),
                "security_code": str(row.get("SECURITY_CODE") or "").strip(),
                "board": board,
                "exchange": exchange,
                "review_date": review_dt,
                "result": normalize_review_result(row.get("REVIEW_STATE")),
                "raw_result": str(row.get("REVIEW_STATE") or "").strip(),
                "members": members,
                "sponsor": normalize_org(row.get("LEAD_UNDERWRITER") or ""),
                "plan_raise_yi": plan_raise_yi,
                "issue_ratio_pct": issue_ratio,
                "listing_date": safe_date(row.get("LISTING_DATE")),
            })

        print(f"[committee] 第 {page} 页处理完成，累计 {len(records)} 条")
        if stop or page >= int(res.get("pages") or 1):
            break
        page += 1

    # 按公司+上会日期去重
    dedup = {}
    for rec in records:
        key = (rec["company"], rec["review_date"])
        if key not in dedup:
            dedup[key] = rec
    out = sorted(dedup.values(), key=lambda x: x["review_date"], reverse=True)
    return out


def fetch_issuance_records():
    """采集 2023-01-01 至今的沪深北新股发行动态。"""
    today = datetime.now().strftime("%Y-%m-%d")
    records = []
    page = 1
    while page <= 8:
        data = fetch_em("RPTA_APP_IPOAPPLY", "APPLY_DATE", page, 500)
        res = data.get("result") or {}
        rows = res.get("data") or []
        if not rows:
            break

        stop = False
        for row in rows:
            apply_dt = safe_date(row.get("APPLY_DATE"))
            if not apply_dt:
                continue
            if apply_dt < MIN_DATE:
                stop = True
                continue

            code = str(row.get("SECURITY_CODE") or "").strip()
            board, exchange = infer_board(row.get("TRADE_MARKET"), row.get("MARKET_TYPE_NEW"), code)
            if board == "其他":
                continue

            listing_dt = safe_date(row.get("LISTING_DATE"))
            if listing_dt and listing_dt <= today:
                issue_status = "已上市"
            elif apply_dt > today:
                issue_status = "待申购"
            elif apply_dt == today:
                issue_status = "申购中"
            else:
                issue_status = "待上市"

            raise_yi = safe_float(row.get("TOTAL_RAISE_FUNDS"), 2)
            if raise_yi is None:
                pred = safe_float(row.get("PREDICT_RAISE_FUNDS"), 2)
                raise_yi = round(pred / 1e8, 2) if pred and pred > 1e4 else pred
            elif raise_yi > 1e4:
                raise_yi = round(raise_yi / 1e8, 2)

            # 首日涨跌幅
            first_day_chg = safe_float(row.get("LD_CLOSE_CHANGE"), 2)
            if first_day_chg is None:
                first_day_chg = safe_float(row.get("LD_OPEN_PREMIUM"), 2)

            # 承销商
            underwriter = normalize_org(row.get("RECOMMEND_ORG") or row.get("UNDERWRITER_ORG") or "")

            records.append({
                "id": str(row.get("INFO_CODE") or code or f"ISS-{len(records)+1}"),
                "security_code": code,
                "abbr": (row.get("SECURITY_NAME") or row.get("SECURITY_NAME_ABBR") or "").strip(),
                "company": (row.get("SECURITY_NAME_FULL") or row.get("SECURITY_NAME") or "").strip(),
                "board": board,
                "exchange": exchange,
                "status": issue_status,
                "apply_date": apply_dt,
                "listing_date": listing_dt,
                "issue_price": safe_float(row.get("ISSUE_PRICE"), 2),
                "issue_pe": safe_float(row.get("AFTER_ISSUE_PE"), 2),
                "industry_pe": safe_float(row.get("INDUSTRY_PE") or row.get("INDUSTRY_PE_NEW"), 2),
                "lwr_pct": safe_float(row.get("ONLINE_ISSUE_LWR"), 4),
                "raise_yi": raise_yi,
                "first_day_chg": first_day_chg,
                "underwriter": underwriter,
                "issue_way": (row.get("ISSUE_WAY") or "").strip(),
                "industry": (row.get("INDUSTRY_NAME") or "").strip(),
            })

        print(f"[issuance] 第 {page} 页处理完成，累计 {len(records)} 条")
        if stop or page >= int(res.get("pages") or 1):
            break
        page += 1

    dedup = {}
    for rec in records:
        key = rec["security_code"] or (rec["company"], rec["apply_date"])
        if key not in dedup:
            dedup[key] = rec
    out = sorted(dedup.values(), key=lambda x: x["apply_date"], reverse=True)
    return out


def write_pair(data_dir, basename, global_var, records):
    today = datetime.now().strftime("%Y-%m-%d")
    payload = {
        "meta": {
            "update_date": today,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total": len(records),
        },
        "records": records,
    }
    json_path = os.path.join(data_dir, f"{basename}.json")
    js_path = os.path.join(data_dir, f"{basename}.js")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(f"window.{global_var} = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")
    print(f"写入完成：{len(records)} 条 -> {json_path}")


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(root, "data")
    os.makedirs(data_dir, exist_ok=True)

    try:
        committee = fetch_committee_records()
        if committee:
            write_pair(data_dir, "committee_data", "__COMMITTEE_DATA__", committee)
    except Exception as exc:
        print(f"[committee] 采集失败: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        issuance = fetch_issuance_records()
        if issuance:
            write_pair(data_dir, "issuance_data", "__ISSUANCE_DATA__", issuance)
    except Exception as exc:
        print(f"[issuance] 采集失败: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
