#!/usr/bin/env python3
"""
零成本 A股IPO 审核数据采集脚本（纯 Python 标准库，无需 pip install 任何第三方包）。

采集全面注册制下沪深北交易所全量 IPO 审核记录（含在审 370+ 家、注册同意、终止），
输出 data/ipo_data.json 与 data/ipo_data.js：
- 全景图仅统计 is_active=True 的当前在审企业
- 审核动态支持全量浏览（含注册同意/终止），点击企业通过方案 B（/api/project-detail）实时透传详情
"""

import argparse
import gzip
import json
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime

from broker_utils import normalize_broker_list

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)

PROVINCE_MAP = {
    "北京": "北京市",
    "天津": "天津市",
    "上海": "上海市",
    "重庆": "重庆市",
    "河北": "河北省",
    "山西": "山西省",
    "辽宁": "辽宁省",
    "吉林": "吉林省",
    "黑龙江": "黑龙江省",
    "江苏": "江苏省",
    "浙江": "浙江省",
    "安徽": "安徽省",
    "福建": "福建省",
    "江西": "江西省",
    "山东": "山东省",
    "河南": "河南省",
    "湖北": "湖北省",
    "湖南": "湖南省",
    "广东": "广东省",
    "海南": "海南省",
    "四川": "四川省",
    "贵州": "贵州省",
    "云南": "云南省",
    "陕西": "陕西省",
    "甘肃": "甘肃省",
    "青海": "青海省",
    "台湾": "台湾省",
    "内蒙古": "内蒙古自治区",
    "广西": "广西壮族自治区",
    "西藏": "西藏自治区",
    "宁夏": "宁夏回族自治区",
    "新疆": "新疆维吾尔自治区",
    "香港": "香港特别行政区",
    "澳门": "澳门特别行政区",
}

# 旧核准制遗留状态（直接过滤，不纳入全面注册制统计）
LEGACY_KEYWORDS = ("已反馈", "中止审查", "发审会", "未在规定时限内回复")


def http_get_json(url, headers=None, timeout=20):
    req_headers = {
        "User-Agent": USER_AGENT,
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
        jsonp_match = re.match(r"^[a-zA-Z0-9_]+\((.*)\);?$", text, re.S)
        if jsonp_match:
            text = jsonp_match.group(1)
        return json.loads(text)


def normalize_province(raw_prov):
    if not raw_prov:
        return "其他"
    p = str(raw_prov).strip()
    for short_name, full_name in PROVINCE_MAP.items():
        if p.startswith(short_name):
            return full_name
    return p


def normalize_board(raw_board):
    if not raw_board:
        return ""
    b = str(raw_board).strip()
    if "科创" in b:
        return "科创板"
    if "创业" in b:
        return "创业板"
    if "北交" in b or "北证" in b or "BSE" in b.upper():
        return "北证"
    if "沪" in b or "上证" in b or "上交所" in b:
        return "沪主板"
    if "深" in b:
        return "深主板"
    return b


def classify_stage(raw_status, update_dt):
    """
    将审核状态归类为 (stage, is_active)：
    - 在审 5 阶段：受理、问询、上市委、提交注册、中止（is_active=True）
    - 历史完结 2 阶段：注册同意、终止（is_active=False）
    - 核准制僵尸状态：返回 (None, False)
    """
    if not raw_status:
        return None, False
    s = str(raw_status).strip()
    if any(k in s for k in LEGACY_KEYWORDS):
        return None, False

    if "注册生效" in s or "同意注册" in s or "已发行" in s or "已上市" in s:
        return "注册同意", False
    if "终止" in s or "撤回" in s or "不予注册" in s or "否决" in s or "未通过" in s or "发行失败" in s:
        return "终止", False

    # 在审状态过滤 2023-03-01 全面注册制落地前未更新的历史僵尸单
    if update_dt and update_dt < "2023-03-01":
        return None, False

    if "中止" in s:
        return "中止", True
    if "提交注册" in s or "报送证监会" in s:
        return "提交注册", True
    if "上市委" in s or "过会" in s or "暂缓" in s:
        return "上市委", True
    if "问询" in s or "回复" in s or "落实" in s:
        return "问询", True
    if "受理" in s or "申报" in s:
        return "受理", True
    return None, False


def normalize_org_list(raw_val, strip_suffix=True):
    if not raw_val:
        return []
    parts = re.split(r"[,，、;；/|]+", str(raw_val))
    result = []
    for p in parts:
        name = p.strip()
        if not name or name in ("-", "--", "无"):
            continue
        if strip_suffix:
            name = re.sub(r"（特殊普通合伙）|\(特殊普通合伙\)|（普通合伙）|\(普通合伙\)", "", name)
            name = re.sub(r"股份有限公司$|有限责任公司$|有限公司$", "", name)
            name = name.replace("保荐有限责任公司", "").replace("证券承销保荐", "")
        name = name.strip()
        if name and name not in result:
            result.append(name)
    return result


def safe_date(raw_dt):
    if not raw_dt:
        return ""
    return str(raw_dt).strip()[:10]


def fetch_from_eastmoney():
    """从东方财富数据中心（RPT_IPO_INFOALLNEW）拉取全量注册制 IPO 审核列表。"""
    base_url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
    page = 1
    page_size = 500
    all_records = []

    exchange_map = {
        "沪主板": ("上交所", "https://www.sse.com.cn/ipo/"),
        "科创板": ("上交所", "https://www.sse.com.cn/ipo/"),
        "深主板": ("深交所", "https://www.szse.cn/listing/"),
        "创业板": ("深交所", "https://www.szse.cn/listing/"),
        "北证": ("北交所", "https://www.bse.cn/audit/project_news.html"),
    }

    while True:
        params = {
            "sortColumns": "UPDATE_DATE,ACCEPT_DATE",
            "sortTypes": "-1,-1",
            "pageSize": str(page_size),
            "pageNumber": str(page),
            "reportName": "RPT_IPO_INFOALLNEW",
            "columns": "ALL",
            "source": "WEB",
            "client": "WEB",
        }
        url = f"{base_url}?{urllib.parse.urlencode(params)}"
        data = http_get_json(url, headers={"Referer": "https://data.eastmoney.com/xg/ipo/"})
        result = data.get("result") or {}
        rows = result.get("data") or []
        if not rows:
            break

        for row in rows:
            raw_status = row.get("STATE") or row.get("CURRENT_STATUS") or ""
            update_dt = safe_date(row.get("UPDATE_DATE"))
            stage, is_active = classify_stage(raw_status, update_dt)
            if not stage:
                continue

            board = normalize_board(row.get("PREDICT_LISTING_MARKET") or row.get("BOARD_NAME") or "")
            if board not in exchange_map:
                continue

            exchange, source_url = exchange_map[board]
            all_records.append({
                "id": str(row.get("INFO_CODE") or row.get("ORG_CODE") or f"EM-{len(all_records)+1}"),
                "company": (row.get("DECLARE_ORG") or "").strip(),
                "security_code": str(row.get("SECURITY_CODE") or "").strip(),
                "board": board,
                "exchange": exchange,
                "stage": stage,
                "is_active": is_active,
                "raw_status": str(raw_status).strip(),
                "province": normalize_province(row.get("REG_ADDRESS") or row.get("REGISTER_ADDRESS") or ""),
                "industry": (row.get("CSRC_INDUSTRY") or row.get("INDUSTRY") or "其他").strip(),
                "sponsors": normalize_broker_list([row.get("RECOMMEND_ORG") or ""]),
                "law_firms": normalize_org_list(row.get("LAW_FIRM") or ""),
                "accounting_firms": normalize_org_list(row.get("ACCOUNT_FIRM") or ""),
                "accept_date": safe_date(row.get("ACCEPT_DATE")),
                "update_date": update_dt,
                "source_url": source_url,
            })

        total_pages = int(result.get("pages") or 1)
        print(f"[eastmoney] 已处理第 {page}/{total_pages} 页，当前累计 {len(all_records)} 条")
        if page >= total_pages or page >= 30:
            break
        page += 1

    # 按公司名+板块+受理日期去重
    dedup = {}
    for rec in all_records:
        key = (rec["company"], rec["board"], rec["accept_date"])
        if key not in dedup or rec["update_date"] > dedup[key]["update_date"]:
            dedup[key] = rec

    records = sorted(dedup.values(), key=lambda x: (x["update_date"], x["accept_date"]), reverse=True)
    return records, "eastmoney", "东方财富网数据中心（实时汇总沪深北交易所公开披露）"


def save_output(records, source_key, source_label):
    today = datetime.now().strftime("%Y-%m-%d")
    active_count = sum(1 for r in records if r.get("is_active"))
    payload = {
        "meta": {
            "update_date": today,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "data_source": source_key,
            "data_source_label": source_label,
            "total": len(records),
            "active_total": active_count,
        },
        "records": records,
    }

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(root, "data")
    os.makedirs(data_dir, exist_ok=True)

    json_path = os.path.join(data_dir, "ipo_data.json")
    js_path = os.path.join(data_dir, "ipo_data.js")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    with open(js_path, "w", encoding="utf-8") as f:
        f.write("window.__IPO_DATA__ = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")

    print(f"写入完成：全量 {len(records)} 条（其中在审 {active_count} 家） -> {json_path}")


def main():
    parser = argparse.ArgumentParser(description="A股IPO审核数据零成本采集脚本")
    parser.add_argument("--source", choices=["eastmoney"], default="eastmoney")
    parser.parse_args()

    try:
        records, key, label = fetch_from_eastmoney()
    except Exception as exc:
        print(f"采集失败: {exc}", file=sys.stderr)
        sys.exit(1)

    if not records:
        print("警告：未获取到任何记录，保留现有文件。", file=sys.stderr)
        sys.exit(2)

    save_output(records, key, label)


if __name__ == "__main__":
    main()
