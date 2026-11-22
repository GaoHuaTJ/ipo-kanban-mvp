#!/usr/bin/env python3
"""
二期第 2 周数据采集脚本（纯 Python 标准库，零第三方依赖）：
1. 新三板挂牌（官方直连全国股转系统 www.neeq.com.cn/nqxxController/nqxx.do）
   -> data/neeq_data.json & data/neeq_data.js（window.__NEEQ_DATA__）
2. 辅导备案（官方直连全国股转系统公告检索 www.neeq.com.cn/disclosureInfoController/infoResult.do）
   -> data/tutoring_data.json & data/tutoring_data.js（window.__TUTORING_DATA__）
"""

import gzip
import http.cookiejar
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)

MIN_DATE = "2023-01-01"


def fmt_date(raw):
    if not raw:
        return ""
    s = str(raw).strip()
    if len(s) >= 10 and s[4] == "-":
        return s[:10]
    digits = re.sub(r"\D", "", s)
    if len(digits) >= 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
    return s[:10]


def normalize_broker(raw):
    if not raw:
        return ""
    s = re.sub(r"股份有限公司$|有限责任公司$|有限公司$", "", str(raw).strip())
    return s.replace("证券承销保荐", "证券").strip()


def safe_float(val, digits=2):
    if val is None or val == "":
        return None
    try:
        return round(float(val), digits)
    except (TypeError, ValueError):
        return None


def classify_tutoring_stage(title):
    t = str(title or "")
    if "终止" in t or "撤回" in t:
        return "终止/撤回"
    if "验收" in t:
        return "辅导验收"
    if "进展" in t and "获受理" not in t and "备案登记" not in t:
        return "辅导进展"
    return "辅导备案"


def create_neeq_client():
    """构建带 CookieJar 与自动 307/302 会话刷新的全国股转系统请求客户端。"""
    ctx = ssl.create_default_context()
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cj),
        urllib.request.HTTPSHandler(context=ctx),
    )

    def refresh_cookie():
        cj.clear()
        with opener.open(
            urllib.request.Request("https://www.neeq.com.cn/index.html", headers={"User-Agent": UA}),
            timeout=15,
        ) as r:
            r.read()

    def nget(url, post=None, retries=2):
        for attempt in range(retries + 1):
            data = urllib.parse.urlencode(post).encode() if post else None
            hdr = {
                "User-Agent": UA,
                "Referer": "https://www.neeq.com.cn/",
                "Accept-Encoding": "gzip",
            }
            if post:
                hdr["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
            req = urllib.request.Request(url, data=data, headers=hdr)
            try:
                with opener.open(req, timeout=15) as resp:
                    raw = resp.read()
                    if resp.headers.get("Content-Encoding") == "gzip":
                        raw = gzip.decompress(raw)
                    txt = raw.decode("utf-8", errors="replace").strip()
                    m = re.match(r"^[a-zA-Z0-9_]+\((.*)\);?$", txt, re.S)
                    return json.loads(m.group(1) if m else txt)
            except urllib.error.HTTPError as exc:
                if exc.code in (301, 302, 307, 308) and attempt < retries:
                    time.sleep(0.6)
                    refresh_cookie()
                    continue
                raise

    refresh_cookie()
    return nget


def fetch_neeq_records(nget):
    """直连全国股转系统采集新三板挂牌公司数据（从尾部抓最近 60 页覆盖 2023 至今新挂牌企业）。"""
    first = nget("https://www.neeq.com.cn/nqxxController/nqxx.do", {"page": 0, "typejb": "T"})
    info0 = first[0] if isinstance(first, list) and first else {}
    total_pages = int(info0.get("totalPages") or 1)

    start_page = max(0, total_pages - 60)
    records = []
    neeq_map = {}

    for pg in range(total_pages - 1, start_page - 1, -1):
        time.sleep(0.15)
        j = nget("https://www.neeq.com.cn/nqxxController/nqxx.do", {"page": pg, "typejb": "T"})
        content = (j[0].get("content") if isinstance(j, list) and j else []) or []
        for row in content:
            code = str(row.get("xxzqdm") or "").strip()
            abbr = str(row.get("xxzqjc") or "").strip()
            list_dt = fmt_date(row.get("xxgprq"))
            tier = "创新层" if str(row.get("xxfcbj") or "") == "1" else "基础层"
            industry = str(row.get("xxhyzl") or "").strip()
            province = str(row.get("xxssdq") or "").strip()
            broker = normalize_broker(row.get("xxzbqs") or "")
            trade_type = str(row.get("xxzrlx") or "").strip()
            zgb = safe_float(row.get("xxzgb"), 2)
            total_shares_wan = round(zgb / 10000.0, 2) if zgb is not None else None
            eps = safe_float(row.get("xxsnsy"), 4)

            if code:
                neeq_map[code] = {
                    "province": province,
                    "industry": industry,
                    "broker": broker,
                    "abbr": abbr,
                }

            if not list_dt or list_dt < MIN_DATE:
                continue

            records.append({
                "code": code,
                "abbr": abbr,
                "list_date": list_dt,
                "tier": tier,
                "industry": industry or "—",
                "province": province or "—",
                "broker": broker or "—",
                "trade_type": trade_type or "—",
                "total_shares_wan": total_shares_wan,
                "eps": eps,
            })

    dedup = {}
    for rec in records:
        k = rec["code"] or rec["abbr"]
        if k not in dedup:
            dedup[k] = rec
    out = sorted(dedup.values(), key=lambda x: (x["list_date"], x["code"]), reverse=True)
    print(f"[neeq] 抓取完成（扫描页码 {start_page}~{total_pages - 1}），2023至今新挂牌 {len(out)} 条")
    return out, neeq_map


def fetch_tutoring_records(nget, neeq_map):
    """直连全国股转系统公告检索接口采集辅导备案公告并关联所属地区/行业/主办券商。"""
    records = []
    seen = set()

    for pg in range(25):
        time.sleep(0.15)
        j = nget(
            "https://www.neeq.com.cn/disclosureInfoController/infoResult.do",
            {"page": pg, "keyword": "辅导", "disclosureType": "0"},
        )
        li = (j[0].get("listInfo") if isinstance(j, list) and j and isinstance(j[0], dict) else None) or {}
        rows = li.get("content") or []
        if not rows:
            break

        for row in rows:
            raw_title = str(row.get("disclosureTitle") or "").strip()
            clean_title = re.sub(r"^\[临时公告\]\s*", "", raw_title).strip()
            if "辅导" not in clean_title:
                continue

            dcode = str(row.get("disclosureCode") or "").strip()
            if not dcode or dcode in seen:
                continue
            seen.add(dcode)

            code = str(row.get("companyCd") or "").strip()
            abbr = str(row.get("companyName") or "").strip()
            notice_dt = fmt_date(row.get("publishDate"))
            fpath = str(row.get("destFilePath") or row.get("filePath") or "").strip()
            pdf_url = fpath if fpath.startswith("http") else (f"https://www.neeq.com.cn{fpath}" if fpath else "")

            extra = neeq_map.get(code) or {}
            records.append({
                "id": dcode,
                "code": code,
                "abbr": abbr or extra.get("abbr") or "—",
                "title": clean_title,
                "stage": classify_tutoring_stage(clean_title),
                "notice_date": notice_dt,
                "pdf_url": pdf_url,
                "province": extra.get("province") or "—",
                "industry": extra.get("industry") or "—",
                "broker": extra.get("broker") or "—",
            })

    out = sorted(records, key=lambda x: (x["notice_date"], x["code"]), reverse=True)
    print(f"[tutoring] 抓取前 25 页辅导公告完成，共获取 {len(out)} 条")
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
        nget = create_neeq_client()
    except Exception as exc:
        print(f"[neeq] 初始化会话失败: {exc}", file=sys.stderr)
        sys.exit(1)

    neeq_map = {}
    try:
        neeq_records, neeq_map = fetch_neeq_records(nget)
        if neeq_records:
            write_pair(data_dir, "neeq_data", "__NEEQ_DATA__", neeq_records)
    except Exception as exc:
        print(f"[neeq] 采集失败: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        tutoring_records = fetch_tutoring_records(nget, neeq_map)
        if tutoring_records:
            write_pair(data_dir, "tutoring_data", "__TUTORING_DATA__", tutoring_records)
    except Exception as exc:
        print(f"[tutoring] 采集失败: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
