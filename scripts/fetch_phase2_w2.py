#!/usr/bin/env python3
"""
二期第 2 周数据采集脚本（纯 Python 标准库，零第三方依赖）：
1. 新三板挂牌（官方直连全国股转系统 www.neeq.com.cn/nqxxController/nqxx.do）
   -> data/neeq_data.json & data/neeq_data.js（window.__NEEQ_DATA__）
2. 辅导备案（官方直连全国股转系统公告检索 www.neeq.com.cn/disclosureInfoController/infoResult.do）
   -> data/tutoring_data.json & data/tutoring_data.js（window.__TUTORING_DATA__）
"""

import gzip
import html as html_lib
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


def normalize_tutoring_status(raw):
    s = str(raw or "").strip()
    if "撤回" in s or "终止" in s:
        return "撤回辅导备案"
    if "完成" in s:
        return "辅导工作完成"
    if "验收" in s:
        return "辅导验收"
    if "备案" in s:
        return "辅导备案"
    return s or "辅导备案"


def strip_html(frag):
    txt = re.sub(r"<[^>]+>", " ", str(frag or ""))
    return re.sub(r"\s+", " ", html_lib.unescape(txt)).strip()


def fetch_tutoring_records():
    """
    直连中国证监会资本市场电子化信息披露平台（http://eid.csrc.gov.cn/fd.html）
    抓取全国 36 个派出机构（证监局）公开发行的全市场 A 股 IPO 辅导企业公示数据。
    """
    records = []
    dedup = {}

    def fetch_page_html(pg):
        url = (
            "http://eid.csrc.gov.cn/csrcfd/index.html"
            if pg == 1
            else f"http://eid.csrc.gov.cn/csrcfd/index_{pg}.html"
        )
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "http://eid.csrc.gov.cn/fd.html"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="replace")

    first_html = fetch_page_html(1)
    m_total = re.search(r"共\s*<b>\s*(\d+)\s*</b>\s*页", first_html)
    total_pages = min(int(m_total.group(1)), 60) if m_total else 40

    for pg in range(1, total_pages + 1):
        if pg > 1:
            time.sleep(0.12)
            try:
                page_html = fetch_page_html(pg)
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    break
                raise
        else:
            page_html = first_html

        trs = re.findall(r"<tr[^>]*>(.*?)</tr>", page_html, re.S)
        current_rec = None
        for tr in trs:
            tds = re.findall(r"<td[^>]*>.*?</td>", tr, re.S)
            if len(tds) < 8:
                continue

            marker = strip_html(tds[0])
            if marker == ">":
                company = strip_html(tds[1])
                if not company:
                    current_rec = None
                    continue

                sponsor = normalize_broker(strip_html(tds[2]))
                record_date = fmt_date(strip_html(tds[3]))
                status = normalize_tutoring_status(strip_html(tds[4]))
                bureau = strip_html(tds[5])
                report_type = strip_html(tds[6])

                # 完整报告标题优先取 td[7] 的 title 属性或 downloadPdf1 第二个参数
                m_title = re.search(r'title=["\']([^"\']+)["\']', tds[7])
                m_pdf = re.search(r"downloadPdf1\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]*)['\"]", tr)
                report_title = html_lib.unescape(m_title.group(1)).strip() if m_title else ""
                if not report_title and m_pdf and m_pdf.group(2):
                    report_title = html_lib.unescape(m_pdf.group(2)).strip()
                if not report_title:
                    report_title = strip_html(tds[7])

                pdf_path = html_lib.unescape(m_pdf.group(1)).strip() if m_pdf else ""
                pdf_url = (
                    f"http://eid.csrc.gov.cn{urllib.parse.quote(pdf_path, safe='/')}"
                    if pdf_path
                    else ""
                )

                m_dt = re.search(r"/pre_ipo/(\d{4})/(\d{2})/(\d{2})/", pdf_path)
                update_date = f"{m_dt.group(1)}-{m_dt.group(2)}-{m_dt.group(3)}" if m_dt else record_date

                rec = {
                    "company": company,
                    "sponsor": sponsor or "—",
                    "record_date": record_date or "—",
                    "status": status,
                    "bureau": bureau or "—",
                    "report_type": report_type or "辅导报告",
                    "report_title": report_title or report_type,
                    "update_date": update_date or record_date or "—",
                    "pdf_url": pdf_url,
                    "report_count": 1,
                }
                current_rec = rec

                prev = dedup.get(company)
                if not prev or rec["update_date"] > prev["update_date"]:
                    dedup[company] = rec
            elif marker == "" and current_rec is not None:
                # 同一企业展开的历史子行，累加报告份数
                current_rec["report_count"] += 1

    records = sorted(dedup.values(), key=lambda x: (x["update_date"], x["record_date"]), reverse=True)
    print(f"[tutoring] 证监会辅导公示（eid.csrc.gov.cn）抓取完成，覆盖 {total_pages} 页，共获取 {len(records)} 家企业")
    return records


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
        neeq_records, _ = fetch_neeq_records(nget)
        if neeq_records:
            write_pair(data_dir, "neeq_data", "__NEEQ_DATA__", neeq_records)
    except Exception as exc:
        print(f"[neeq] 采集失败: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        tutoring_records = fetch_tutoring_records()
        if tutoring_records:
            write_pair(data_dir, "tutoring_data", "__TUTORING_DATA__", tutoring_records)
    except Exception as exc:
        print(f"[tutoring] 采集失败: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
