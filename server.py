#!/usr/bin/env python3
"""
零依赖本地静态托管 + 方案 B 实时详情透传服务器（仅使用 Python 标准库）。

支持三大交易所 100% 官网实时直连：
- 上交所（沪主板 / 科创板）：query.sse.com.cn/statusAction.do + GP_GPZCZ_SHXXPL
- 深交所（深主板 / 创业板）：listing.szse.cn/api/ras/projectrends/query + details
- 北交所（北证）：www.bse.cn/projectNewsController/infoResult.do + infoDetailResult.do（自动维护 C3VK Cookie）
"""

import argparse
import gzip
import http.cookiejar
import json
import os
import re
import ssl
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)

CACHE = {}
CACHE_TTL_SEC = 1800  # 30 分钟缓存
TZ_CN = timezone(timedelta(hours=8))

# 北交所专用带 CookieJar 的 opener（处理 C3VK 会话 Cookie）
BSE_COOKIE_JAR = http.cookiejar.CookieJar()
BSE_OPENER = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(BSE_COOKIE_JAR),
    urllib.request.HTTPSHandler(context=ssl.create_default_context()),
)
BSE_COOKIE_INIT_AT = 0.0


def normalize_name(name):
    """统一中英文括号与空格，避免全半角差异导致匹配失败。"""
    if not name:
        return ""
    return (
        str(name)
        .strip()
        .replace("(", "（")
        .replace(")", "）")
        .replace(" ", "")
    )


def search_keyword(company):
    """提取不含括号的核心前缀词用于交易所搜索。"""
    clean = re.sub(r"[（()）]", "", str(company or "")).strip()
    return clean[:8] if len(clean) > 8 else clean


def http_get_json(url, headers=None, timeout=15):
    req_headers = {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "gzip",
    }
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, headers=req_headers)
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        text = raw.decode("utf-8", errors="replace").strip()
        m = re.match(r"^[a-zA-Z0-9_]+\((.*)\);?$", text, re.S)
        if m:
            text = m.group(1)
        return json.loads(text)


def bse_request(url, post=None, referer="https://www.bse.cn/audit/project_news.html", timeout=15):
    global BSE_COOKIE_INIT_AT
    now = time.time()
    # 每 4 分钟刷新一次北交所 C3VK 会话 Cookie
    if now - BSE_COOKIE_INIT_AT > 240:
        try:
            init_req = urllib.request.Request(
                "https://www.bse.cn/audit/project_news.html",
                headers={"User-Agent": UA, "Accept-Encoding": "gzip"},
            )
            with BSE_OPENER.open(init_req, timeout=timeout) as r:
                r.read()
            BSE_COOKIE_INIT_AT = now
        except Exception:
            pass

    data = urllib.parse.urlencode(post).encode() if post else None
    hdr = {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "gzip",
        "Referer": referer,
    }
    if post:
        hdr["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
    req = urllib.request.Request(url, data=data, headers=hdr)
    with BSE_OPENER.open(req, timeout=timeout) as resp:
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        text = raw.decode("utf-8", errors="replace").strip()
        m = re.match(r"^[a-zA-Z0-9_]+\((.*)\);?$", text, re.S)
        if m:
            text = m.group(1)
        return json.loads(text)


def fmt_date(raw):
    if not raw:
        return ""
    if isinstance(raw, dict) and raw.get("time"):
        try:
            dt = datetime.fromtimestamp(float(raw["time"]) / 1000.0, tz=TZ_CN)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            return ""
    s = str(raw).strip()
    if len(s) >= 10 and s[4] == "-":
        return s[:10]
    digits = re.sub(r"\D", "", s)
    if len(digits) >= 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
    return s[:10]


def clean_people(raw):
    if not raw:
        return ""
    if isinstance(raw, list):
        names = [str(x).strip() for x in raw if str(x).strip()]
        return "、".join(dict.fromkeys(names))
    parts = [p.strip() for p in re.split(r"[,，、;；]+", str(raw)) if p.strip()]
    return "、".join(dict.fromkeys(parts))


SZSE_INDEX_CACHE = {"ts": 0.0, "rows": []}


def get_szse_all_rows():
    """拉取并缓存深交所全部 IPO 项目索引（含主板+创业板共约 1460+ 条），30 分钟刷新一次。"""
    now = time.time()
    if SZSE_INDEX_CACHE["rows"] and (now - SZSE_INDEX_CACHE["ts"] < CACHE_TTL_SEC):
        return SZSE_INDEX_CACHE["rows"]
    data = http_get_json(
        "https://listing.szse.cn/api/ras/projectrends/query?bizType=1&pageIndex=0&pageSize=2000",
        headers={"Referer": "https://listing.szse.cn/"},
        timeout=25,
    )
    rows = data.get("data") or []
    if rows:
        SZSE_INDEX_CACHE["rows"] = rows
        SZSE_INDEX_CACHE["ts"] = now
    return rows


def fetch_szse_detail(company):
    """实时透传深交所审核详情（主板 / 创业板），全量索引精确匹配 prjid。"""
    norm_target = normalize_name(company)
    rows = get_szse_all_rows()
    matched = [r for r in rows if normalize_name(r.get("cmpnm")) == norm_target]
    if not matched:
        matched = [r for r in rows if norm_target in normalize_name(r.get("cmpnm")) or normalize_name(r.get("cmpnm")) in norm_target]
    if not matched:
        return None
    matched.sort(key=lambda r: str(r.get("updtdt") or ""), reverse=True)
    target = matched[0]

    prjid = target.get("prjid")
    detail_resp = http_get_json(
        f"https://listing.szse.cn/api/ras/projectrends/details?id={prjid}",
        headers={"Referer": f"https://listing.szse.cn/projectdynamic/ipo/detail/index.html?id={prjid}"},
    )
    d = detail_resp.get("data") or detail_resp

    pjdot_raw = d.get("pjdot") or "{}"
    try:
        pjdot = json.loads(pjdot_raw) if isinstance(pjdot_raw, str) else pjdot_raw
    except Exception:
        pjdot = {}

    step_defs = [
        ("0", "受理", "已受理"),
        ("1", "问询", "已问询"),
        ("2", "上市委", "上市委会议"),
        ("3", "提交注册", "提交注册"),
        ("4", "注册结果", "注册结果"),
    ]
    timeline = []
    for k, key_name, default_label in step_defs:
        node = pjdot.get(k) or {}
        dt = fmt_date(node.get("startTime"))
        timeline.append({
            "key": key_name,
            "label": node.get("name") or default_label,
            "date": dt,
            "done": bool(dt),
        })

    docs = []
    doc_fields = [
        ("disclosureMaterials", "招股及申报文件"),
        ("enquiryResponseAttachment", "问询与回复"),
        ("meetingConclusionAttachment", "上市委会议"),
        ("registrationResultAttachment", "注册结果"),
        ("terminationNoticeAttachment", "终止公告"),
    ]
    for field, cat in doc_fields:
        items = d.get(field) or []
        if not isinstance(items, list):
            continue
        for item in items:
            path = item.get("dfpth") or item.get("filePath") or ""
            title = item.get("dfnm") or item.get("fileName") or item.get("title") or "审核公告文件"
            dt = fmt_date(item.get("ddt") or item.get("pubDate") or "")
            if path:
                full_url = path if path.startswith("http") else f"https://reportdocs.static.szse.cn{path}"
                docs.append({"title": title, "category": cat, "date": dt, "url": full_url})

    docs.sort(key=lambda x: x["date"], reverse=True)

    sponsors = [x for x in [d.get("sprinst"), d.get("jsprinst")] if x]
    sponsor_reps = [x for x in [d.get("sprrep"), d.get("jsprrep")] if x]
    raise_amt = d.get("maramt")

    return {
        "ok": True,
        "live_source": "深交所官网实时直连",
        "company": d.get("cmpnm") or company,
        "exchange": "深交所",
        "board": d.get("boardName") or "",
        "status": d.get("prjst") or "",
        "industry": d.get("csrcind") or "",
        "province": d.get("regloc") or "",
        "plan_raise_yi": f"{float(raise_amt):.2f} 亿元" if raise_amt else "暂无数据",
        "issue_ratio": "暂无数据",
        "listing_standard": d.get("issueTargetName") or "—",
        "board_position": d.get("approveProcessTypeName") or d.get("boardName") or "—",
        "sponsor": "、".join(sponsors) or "—",
        "sponsor_reps": clean_people("、".join(sponsor_reps)) or "—",
        "accounting_firm": d.get("acctfm") or "—",
        "accountants": clean_people(d.get("acctsgnt")) or "—",
        "law_firm": d.get("lawfm") or "—",
        "lawyers": clean_people(d.get("lglsgnt")) or "—",
        "source_url": "https://www.szse.cn/listing/",
        "timeline": timeline,
        "documents": docs[:30],
    }


def fetch_sse_detail(company):
    """实时透传上交所审核详情（同时覆盖 1=科创板 与 2=沪主板），兼容全半角括号。"""
    norm_target = normalize_name(company)
    rows = []
    for kw in dict.fromkeys([norm_target, search_keyword(company), company]):
        q = urllib.parse.urlencode({
            "isPagination": "true",
            "sqlId": "SH_XM_LB",
            "issueMarketType": "1,2",
            "stockAuditName": kw,
            "pageHelp.pageSize": "20",
            "pageHelp.pageNo": "1",
            "pageHelp.beginPage": "1",
            "pageHelp.endPage": "1",
        })
        resp = http_get_json(
            f"https://query.sse.com.cn/statusAction.do?{q}",
            headers={"Referer": "https://listing.sse.com.cn/"},
        )
        rows = (resp.get("pageHelp") or {}).get("data") or []
        if rows:
            break

    # 严格按公司名匹配（禁止盲目取无关的 rows[0]），多条记录时取最新 updateDate
    matched = [r for r in rows if normalize_name(r.get("stockAuditName")) == norm_target]
    if not matched:
        matched = [r for r in rows if norm_target in normalize_name(r.get("stockAuditName")) or normalize_name(r.get("stockAuditName")) in norm_target]
    if not matched:
        return None
    matched.sort(key=lambda r: str(r.get("updateDate") or ""), reverse=True)
    d = matched[0]

    audit_num = str(d.get("stockAuditNum") or "")
    intermediaries = d.get("intermediary") or []
    sponsors, sponsor_reps = [], []
    acc_firms, accountants = [], []
    law_firms, lawyers = [], []

    for item in intermediaries:
        itype = item.get("i_intermediaryType")
        name = (item.get("i_intermediaryName") or item.get("i_intermediaryAbbrName") or "").strip()
        persons = item.get("i_person") or []
        if itype == 1:
            if name:
                sponsors.append(name)
            for p in persons:
                title = p.get("i_p_jobTitle") or ""
                if "保荐代表人" in title and p.get("i_p_personName"):
                    sponsor_reps.append(p["i_p_personName"])
        elif itype == 2:
            if name:
                acc_firms.append(name)
            for p in persons:
                title = p.get("i_p_jobTitle") or ""
                if "签字会计师" in title and p.get("i_p_personName"):
                    accountants.append(p["i_p_personName"])
        elif itype == 3:
            if name:
                law_firms.append(name)
            for p in persons:
                title = p.get("i_p_jobTitle") or ""
                if "签字律师" in title and p.get("i_p_personName"):
                    lawyers.append(p["i_p_personName"])

    docs = []
    if audit_num:
        try:
            fq = urllib.parse.urlencode({
                "isPagination": "false",
                "sqlId": "GP_GPZCZ_SHXXPL",
                "issueMarketType": "1,2",
                "stockAuditNum": audit_num,
            })
            fresp = http_get_json(
                f"https://query.sse.com.cn/commonSoaQuery.do?{fq}",
                headers={"Referer": "https://listing.sse.com.cn/"},
            )
            frows = (fresp.get("pageHelp") or {}).get("data") or []
            for f in frows:
                fpath = f.get("filePath") or ""
                if not fpath:
                    continue
                full_url = fpath if fpath.startswith("http") else f"https://static.sse.com.cn/stock{fpath}"
                docs.append({
                    "title": f.get("fileTitle") or f.get("filename") or "审核公告文件",
                    "category": f.get("fileTypeDesc") or "信息披露",
                    "date": fmt_date(f.get("fileUpdateTime") or f.get("publishDate")),
                    "url": full_url,
                })
        except Exception:
            pass
    docs.sort(key=lambda x: x["date"], reverse=True)

    curr = int(d.get("currStatus") or 0)
    status_name_map = {1: "已受理", 2: "已问询", 3: "上市委会议", 4: "提交注册", 5: "注册生效", 7: "中止", 8: "终止"}
    accept_dt = fmt_date(d.get("auditApplyDate"))
    update_dt = fmt_date(d.get("updateDate"))

    step_level = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 7: 2, 8: 2}.get(curr, 1)
    timeline = [
        {"key": "受理", "label": "已受理", "date": accept_dt, "done": step_level >= 1},
        {"key": "问询", "label": "已问询", "date": update_dt if step_level == 2 else "", "done": step_level >= 2},
        {"key": "上市委", "label": "上市委会议", "date": update_dt if step_level == 3 else "", "done": step_level >= 3},
        {"key": "提交注册", "label": "提交注册", "date": update_dt if step_level == 4 else "", "done": step_level >= 4},
        {"key": "注册结果", "label": "注册结果", "date": update_dt if step_level == 5 else "", "done": step_level >= 5},
    ]

    issuer = (d.get("stockIssuer") or [{}])[0] if isinstance(d.get("stockIssuer"), list) and d.get("stockIssuer") else {}
    plan_cap = d.get("planIssueCapital")
    is_star = str(d.get("issueMarketType")) == "1"

    return {
        "ok": True,
        "live_source": "上交所官网实时直连",
        "company": d.get("stockAuditName") or company,
        "exchange": "上交所",
        "board": "科创板" if is_star else "沪主板",
        "status": status_name_map.get(curr, str(curr)),
        "industry": issuer.get("s_csrcCodeDesc") or "—",
        "province": issuer.get("s_province") or "—",
        "plan_raise_yi": f"{float(plan_cap):.2f} 亿元" if plan_cap else "暂无数据",
        "issue_ratio": "暂无数据",
        "listing_standard": "—",
        "board_position": "科创板" if is_star else "沪市主板",
        "sponsor": "、".join(dict.fromkeys(sponsors)) or "—",
        "sponsor_reps": clean_people(sponsor_reps) or "—",
        "accounting_firm": "、".join(dict.fromkeys(acc_firms)) or "—",
        "accountants": clean_people(accountants) or "—",
        "law_firm": "、".join(dict.fromkeys(law_firms)) or "—",
        "lawyers": clean_people(lawyers) or "—",
        "source_url": f"https://www.sse.com.cn/listing/renewal/ipo/index_listing_detail.shtml?auditId={audit_num}",
        "timeline": timeline,
        "documents": docs[:30],
    }


def fetch_bse_detail(company, security_code=""):
    """实时直连北交所官网审核详情接口（infoResult.do + infoDetailResult.do）。"""
    norm_target = normalize_name(company)
    items = []
    for kw in dict.fromkeys([norm_target, search_keyword(company), security_code]):
        if not kw:
            continue
        res = bse_request(
            "https://www.bse.cn/projectNewsController/infoResult.do",
            post={"page": 0, "type": "[1]", "keyword": kw},
        )
        if isinstance(res, list) and res and isinstance(res[0], dict):
            items = ((res[0].get("listInfo") or {}).get("content")) or []
        if items:
            break

    matched = [r for r in items if normalize_name(r.get("companyName")) == norm_target]
    if not matched:
        matched = [r for r in items if norm_target in normalize_name(r.get("companyName")) or normalize_name(r.get("companyName")) in norm_target]
    if not matched:
        return None
    target = matched[0]

    pid = target.get("id")
    det_res = bse_request(
        "https://www.bse.cn/projectNewsController/infoDetailResult.do",
        post={"id": pid},
        referer=f"https://www.bse.cn/audit/project_news_detail.html?id={pid}",
    )
    det = det_res[0] if isinstance(det_res, list) and det_res else {}
    pn = det.get("projectNews") or target
    ps = det.get("projectStatus") or {}

    status_map = {
        "P01": "已受理",
        "P02": "已问询",
        "P03": "上市委会议通过",
        "P04": "提交注册",
        "P05": "注册生效",
        "P06": "中止",
        "P07": "终止",
        "P08": "不予注册",
        "P09": "上市委暂缓",
    }

    # 精确 5 节点审核时间轴
    t_receive = fmt_date(ps.get("receiveDate") or pn.get("receiveDate"))
    t_inquiry = fmt_date(ps.get("inquiryDate"))
    t_meeting = fmt_date(ps.get("listingCommitteeResultDate") or ps.get("listingCommitteeDate"))
    t_submit = fmt_date(ps.get("rePassDate") or ps.get("submitRegisterDate"))
    t_result = fmt_date(ps.get("approveResultDate"))

    timeline = [
        {"key": "受理", "label": "已受理", "date": t_receive, "done": bool(t_receive)},
        {"key": "问询", "label": "已问询", "date": t_inquiry, "done": bool(t_inquiry)},
        {"key": "上市委", "label": "上市委会议", "date": t_meeting, "done": bool(t_meeting)},
        {"key": "提交注册", "label": "提交注册", "date": t_submit, "done": bool(t_submit)},
        {"key": "注册结果", "label": "注册结果", "date": t_result, "done": bool(t_result)},
    ]

    # 汇总官方 PDF 文件（招股书/保荐书/审计报告/法律意见书/问询回复）
    docs = []
    cat_labels = {
        "ZGSMS": "招股说明书",
        "GPFXBJS": "发行保荐书",
        "SJBG": "审计报告",
        "FYYJS": "法律意见书",
        "GPZJXCGPTJS": "上市保荐书",
        "QT": "其他申报文件",
    }
    xxgk = det.get("xxgkInfo") or {}
    if isinstance(xxgk, dict):
        for cat_key, stage_map in xxgk.items():
            if not isinstance(stage_map, dict):
                continue
            for arr in stage_map.values():
                if not isinstance(arr, list):
                    continue
                for item in arr:
                    fp = item.get("destFilePath") or item.get("filePath") or ""
                    if not fp:
                        continue
                    docs.append({
                        "title": item.get("disclosureTitle") or "申报文件",
                        "category": cat_labels.get(cat_key, "申报文件"),
                        "date": fmt_date(item.get("publishDate") or item.get("pubDate")),
                        "url": fp if fp.startswith("http") else f"https://www.bse.cn{fp}",
                    })

    for list_key, cat_name in [("wxhfhInfo", "问询与回复"), ("hyggjgInfo", "上市委会议"), ("zmInfo", "注册结果")]:
        arr = det.get(list_key) or []
        if not isinstance(arr, list):
            continue
        for item in arr:
            fp = item.get("destFilePath") or item.get("filePath") or ""
            if not fp:
                continue
            docs.append({
                "title": item.get("disclosureTitle") or cat_name,
                "category": cat_name,
                "date": fmt_date(item.get("publishDate") or item.get("pubDate")),
                "url": fp if fp.startswith("http") else f"https://www.bse.cn{fp}",
            })

    docs.sort(key=lambda x: x["date"], reverse=True)

    return {
        "ok": True,
        "live_source": "北交所官网实时直连",
        "company": pn.get("companyName") or company,
        "exchange": "北交所",
        "board": "北证",
        "status": status_map.get(str(pn.get("status") or ""), str(pn.get("status") or "—")),
        "industry": pn.get("industry") or "—",
        "province": pn.get("registerAddress") or "—",
        "plan_raise_yi": "详见下方招股说明书",
        "issue_ratio": "详见招股说明书",
        "listing_standard": "—",
        "board_position": "符合创新特征",
        "sponsor": pn.get("sponsorOrg") or "—",
        "sponsor_reps": clean_people(pn.get("sponsorRepresent")) or "—",
        "accounting_firm": pn.get("accountingOrg") or "—",
        "accountants": clean_people(pn.get("accountant")) or "—",
        "law_firm": pn.get("lawyerOrg") or "—",
        "lawyers": clean_people(pn.get("lawyer")) or "—",
        "source_url": f"https://www.bse.cn/audit/project_news_detail.html?id={pid}",
        "timeline": timeline,
        "documents": docs[:30],
    }


def query_project_detail(company, exchange, security_code=""):
    cache_key = f"{exchange}::{normalize_name(company)}"
    now = time.time()
    cached = CACHE.get(cache_key)
    if cached and (now - cached[0] < CACHE_TTL_SEC):
        return cached[1]

    result = None
    if exchange == "深交所":
        result = fetch_szse_detail(company)
    elif exchange == "上交所":
        result = fetch_sse_detail(company)
    elif exchange == "北交所":
        result = fetch_bse_detail(company, security_code)

    if result:
        CACHE[cache_key] = (now, result)
    return result


class IpoKanbanHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/project-detail":
            self.handle_project_detail(parsed.query)
            return
        super().do_GET()

    def handle_project_detail(self, query_str):
        params = urllib.parse.parse_qs(query_str)
        company = (params.get("company") or [""])[0].strip()
        exchange = (params.get("exchange") or [""])[0].strip()
        code = (params.get("code") or [""])[0].strip()

        if not company:
            self.send_json(400, {"ok": False, "error": "缺少 company 参数"})
            return

        try:
            detail = query_project_detail(company, exchange, code)
            if not detail:
                self.send_json(404, {"ok": False, "error": f"未在 {exchange or '目标交易所'} 查询到 {company} 的实时详情"})
                return
            self.send_json(200, detail)
        except Exception as exc:
            self.send_json(502, {"ok": False, "error": f"实时透传上游接口失败: {exc}"})

    def send_json(self, status_code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description="IPO 看板本地静态托管 + 实时详情代理服务器")
    parser.add_argument("--port", type=int, default=8080, help="监听端口，默认 8080")
    args = parser.parse_args()

    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), IpoKanbanHandler)
    print(f"IPO 看板（三大交易所官网实时直连）已启动：http://127.0.0.1:{args.port}")
    print("按 Ctrl+C 退出服务")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")


if __name__ == "__main__":
    main()
