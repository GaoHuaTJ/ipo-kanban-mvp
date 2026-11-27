#!/usr/bin/env python3
"""
三期数据采集脚本（零商业接口费用）：
1. 现场检查（data/inspection_data.json & .js）
   - 汇聚 2022~2026 年中证协 / 证监会官方公示的「首发企业信息披露质量抽查（现场检查）」各批次名单
   - 支持从东方财富资讯检索 API 自动发现并增量合入最新抽签批次
   - 与 data/ipo_data.json 交叉关联实时审核状态、交易所、申报板块、保荐机构与受理日期
2. 监管措施（data/regulatory_data.json & .js）
   - 上交所（SSE）：官网「监管 > 发行上市审核监管 > 监管措施 / 纪律处分」（measures & disposition）
   - 深交所（SZSE）：官网 ShowReport `1800_jgxxgk` / `1800_jgxxgk_snapshot` / `1800_jgxxgk_cf_snapshot`
   - 北交所（BSE）：官网 `AnnouncementController/infoResult.do`（自动维护 C3VK Cookie）
   - 证监会（CSRC）：官网政务公开检索 IPO 相关行政监管与处罚决定
   - 并发提取官方 PDF 文书标题及涉事 IPO 发行人全称（增量缓存复用，零重复下载）
"""

import argparse
import gzip
import http.cookiejar
import io
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

from broker_utils import normalize_broker

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)

# 官方已公示的首发企业现场检查（信息披露质量抽查）权威批次基线（仅收录官方/权威披露已核实记录）
OFFICIAL_INSPECTION_BATCHES = [
    {
        "lottery_date": "2026-10-08",
        "batch": "2026年第5批",
        "ratio": "20%",
        "source_url": "https://www.sac.net.cn/",
        "companies": [
            "上海思朗科技股份有限公司",
        ],
    },
    {
        "lottery_date": "2026-07-01",
        "batch": "2026年第4批",
        "ratio": "20%",
        "source_url": "https://www.sac.net.cn/",
        "companies": [
            "南京世和基因生物技术股份有限公司",
            "河南光远新材料股份有限公司",
            "重庆耐德能源装备股份有限公司",
            "江苏超力电器股份有限公司",
            "博睿康技术（上海）股份有限公司",
            "珠海普生医疗科技股份有限公司",
            "北京卓镭激光技术股份有限公司",
            "浙江胜华波电器股份有限公司",
            "康佰家医药集团股份有限公司",
            "无锡市好达电子股份有限公司",
            "延长中科（大连）能源科技股份有限公司",
            "中山百灵生物技术股份有限公司",
            "苏州瑞高新材料股份有限公司",
            "北京夏禾科技股份有限公司",
            "江苏永康智能防务科技股份有限公司",
            "重庆物奇微电子股份有限公司",
            "浙江金连接科技股份有限公司",
            "上海亿钶气体股份有限公司",
            "中电防务科技股份有限公司",
            "上海汇禾医疗科技股份有限公司",
            "东方晶源微电子科技（北京）股份有限公司",
        ],
    },
    {
        "lottery_date": "2026-06-05",
        "batch": "2026年第3批",
        "ratio": "20%",
        "source_url": "https://www.sac.net.cn/",
        "companies": [
            "欧尚元智能装备股份有限公司",
            "思必驰科技股份有限公司",
            "成都迈科康生物科技股份有限公司",
            "纽氏达特行星传动系统技术（淄博）股份有限公司",
            "乐聚智能（深圳）股份有限公司",
            "广东正扬传感科技股份有限公司",
        ],
    },
    {
        "lottery_date": "2026-04-01",
        "batch": "2026年第2批",
        "ratio": "20%",
        "source_url": "https://www.sac.net.cn/",
        "companies": [
            "宇树科技股份有限公司",
            "中科宇航技术股份有限公司",
        ],
    },
    {
        "lottery_date": "2026-01-05",
        "batch": "2026年第1批",
        "ratio": "20%",
        "source_url": "https://www.sac.net.cn/",
        "companies": [
            "洛阳轴承集团股份有限公司",
            "上海频准激光科技股份有限公司",
            "粤芯半导体技术股份有限公司",
            "深圳汉诺医疗科技股份有限公司",
            "广东九安智能科技股份有限公司",
            "苏州猎奇智能设备股份有限公司",
            "江苏高凯精密流体技术股份有限公司",
            "上海韬盛电子科技股份有限公司",
            "中国盐业股份有限公司",
            "锐石创芯（重庆）科技股份有限公司",
            "蓝箭航天空间科技股份有限公司",
        ],
    },
    {
        "lottery_date": "2025-07-03",
        "batch": "2025年第2批",
        "ratio": "20%",
        "source_url": "https://www.sac.net.cn/",
        "companies": [
            "长裕控股集团股份有限公司",
            "易思维（杭州）科技股份有限公司",
            "深圳市恒运昌真空技术股份有限公司",
            "上海芯密科技股份有限公司",
            "芜湖埃泰克汽车电子股份有限公司",
            "广西田园生化股份有限公司",
            "浙江振石新材料股份有限公司",
            "江苏康瑞新材料科技股份有限公司",
            "山东东岳未来氢能材料股份有限公司",
            "中电科蓝天科技股份有限公司",
            "广州慧谷新材料科技股份有限公司",
            "惠科股份有限公司",
        ],
    },
    {
        "lottery_date": "2025-03-21",
        "batch": "2025年第1批",
        "ratio": "20%",
        "source_url": "https://www.sac.net.cn/",
        "companies": [
            "江西力源海纳科技股份有限公司",
            "强一半导体（苏州）股份有限公司",
        ],
    },
    {
        "lottery_date": "2024-12-06",
        "batch": "2024年第3批",
        "ratio": "20%",
        "source_url": "https://www.sac.net.cn/",
        "companies": [
            "武汉新芯集成电路股份有限公司",
        ],
    },
    {
        "lottery_date": "2024-07-26",
        "batch": "2024年第2批",
        "ratio": "20%",
        "source_url": "https://www.sac.net.cn/",
        "companies": [
            "中国铀业股份有限公司",
        ],
    },
    {
        "lottery_date": "2024-01-05",
        "batch": "2024年第1批",
        "ratio": "20%",
        "source_url": "https://www.sac.net.cn/",
        "companies": [
            "郑州恒达智控科技股份有限公司",
            "北京城建设计发展集团股份有限公司",
        ],
    },
    {
        "lottery_date": "2023-07-07",
        "batch": "2023年第3批",
        "ratio": "5%",
        "source_url": "https://www.csrc.gov.cn/",
        "companies": [
            "苏州丰倍生物科技股份有限公司",
            "浙江春晖环保能源股份有限公司",
            "福建海电运维科技股份有限公司",
            "长春卓谊生物股份有限公司",
            "广东图特精密五金科技股份有限公司",
            "湖北兴福电子材料股份有限公司",
            "国宏工具系统（无锡）股份有限公司",
            "黄山谷捷股份有限公司",
            "中鼎恒盛气体设备（芜湖）股份有限公司",
            "河南省城乡规划设计研究总院股份有限公司",
            "苏州奥德高端装备股份有限公司",
        ],
    },
    {
        "lottery_date": "2023-04-14",
        "batch": "2023年第2批",
        "ratio": "5%",
        "source_url": "https://www.sac.net.cn/",
        "companies": [
            "长春海谱润斯科技股份有限公司",
        ],
    },
    {
        "lottery_date": "2023-01-06",
        "batch": "2023年第1批",
        "ratio": "5%",
        "source_url": "https://www.csrc.gov.cn/",
        "companies": [
            "浙江羊绒世家服饰股份有限公司",
            "青岛海湾化学股份有限公司",
            "北京开科唯识技术股份有限公司",
            "上海恒业微晶材料科技股份有限公司",
            "中船双瑞（洛阳）特种装备股份有限公司",
        ],
    },
    {
        "lottery_date": "2022-10-28",
        "batch": "2022年第4批",
        "ratio": "5%",
        "source_url": "https://www.csrc.gov.cn/",
        "companies": [
            "科都电气股份有限公司",
            "深圳市大成精密设备股份有限公司",
            "江苏博涛智能热工股份有限公司",
        ],
    },
    {
        "lottery_date": "2022-07-15",
        "batch": "2022年第3批",
        "ratio": "5%",
        "source_url": "https://www.csrc.gov.cn/",
        "companies": [
            "永杰新材料股份有限公司",
            "郑州速达工业机械服务股份有限公司",
            "上海索迪龙自动化股份有限公司",
            "北京清大科越股份有限公司",
            "浙江荣泰电工器材股份有限公司",
            "诚丰家具（中国）股份有限公司",
            "四川英创力电子科技股份有限公司",
        ],
    },
    {
        "lottery_date": "2022-04-22",
        "batch": "2022年第2批",
        "ratio": "5%",
        "source_url": "https://www.csrc.gov.cn/",
        "companies": [
            "黄山芯微电子股份有限公司",
            "西安鹰之航航空科技股份有限公司",
        ],
    },
]


def make_ssl_context():
    ctx = ssl.create_default_context()
    ctx.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x4)
    return ctx


SSL_CTX = make_ssl_context()


def http_get_bytes(url, headers=None, data=None, opener=None, timeout=15):
    hdr = {
        "User-Agent": UA,
        "Accept-Encoding": "gzip",
    }
    if headers:
        hdr.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdr)
    op = opener or urllib.request.build_opener(urllib.request.HTTPSHandler(context=SSL_CTX))
    with op.open(req, timeout=timeout) as resp:
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return raw


def http_get_text(url, headers=None, data=None, opener=None, timeout=15):
    return http_get_bytes(url, headers=headers, data=data, opener=opener, timeout=timeout).decode(
        "utf-8", errors="replace"
    )


def normalize_name(name):
    return (
        str(name or "")
        .strip()
        .replace("(", "（")
        .replace(")", "）")
        .replace(" ", "")
        .replace("\u3000", "")
    )


def load_ipo_lookup(data_dir):
    """构建 IPO 全量记录索引（按全称与简称），用于交叉填充状态、交易所、板块、保荐人。"""
    ipo_path = os.path.join(data_dir, "ipo_data.json")
    by_company = {}
    by_code = {}
    all_records = []
    if not os.path.exists(ipo_path):
        return by_company, by_code, all_records

    with open(ipo_path, "r", encoding="utf-8") as f:
        records = (json.load(f) or {}).get("records") or []

    # 同一公司若有历史终止+最新在审/注册记录，优先保留非终止或更新日期最新的
    for r in records:
        all_records.append(r)
        comp = normalize_name(r.get("company"))
        if comp:
            prev = by_company.get(comp)
            if not prev:
                by_company[comp] = r
            else:
                prev_active = prev.get("stage") != "终止"
                cur_active = r.get("stage") != "终止"
                if (cur_active and not prev_active) or (
                    cur_active == prev_active and (r.get("update_date") or "") > (prev.get("update_date") or "")
                ):
                    by_company[comp] = r
        code = str(r.get("security_code") or "").strip()
        if code and code not in by_code:
            by_code[code] = r

    return by_company, by_code, all_records


def infer_exchange_and_board(ipo_hit, company=""):
    if ipo_hit:
        ex = ipo_hit.get("exchange") or "上交所"
        bd = ipo_hit.get("board") or "主板"
        if bd in ("沪主板", "深主板"):
            bd = "主板"
        return ex, bd
    return "上交所", "科创板"


def extract_latest_inspection_from_em(by_company):
    """从东方财富资讯检索 API 自动扫描 2026-10 以后可能新增的首发企业现场检查抽查批次报道。"""
    added_batches = []
    try:
        param = json.dumps({
            "uid": "",
            "keyword": "首发企业现场检查抽查名单",
            "type": ["cmsArticleWebOld"],
            "client": "web",
            "clientType": "web",
            "clientVersion": "curr",
            "param": {
                "cmsArticleWebOld": {
                    "searchScope": "title",
                    "sort": "time",
                    "pageIndex": 1,
                    "pageSize": 10,
                    "preTag": "",
                    "postTag": "",
                }
            },
        }, ensure_ascii=False)
        url = "https://search-api-web.eastmoney.com/search/jsonp?cb=cb&param=" + urllib.parse.quote(param)
        txt = http_get_text(url, headers={"Referer": "https://so.eastmoney.com/"}, timeout=12)
        m = re.match(r"^cb\((.*)\);?$", txt.strip(), re.S)
        if not m:
            return added_batches
        arts = ((json.loads(m.group(1)).get("result") or {}).get("cmsArticleWebOld") or [])
        for art in arts:
            title = art.get("title") or ""
            dt = str(art.get("date") or "")[:10]
            if dt <= "2026-10-08":
                continue
            m_b = re.search(r"(202\d)年第([一二三四五六七八九十\d]+)批", title)
            if not m_b:
                continue
            art_url = art.get("url") or ""
            if not art_url:
                continue
            html = http_get_text(art_url, timeout=12)
            # 在文章中匹配已在 ipo_data.json 中出现的全称，或“XXX股份有限公司”
            cand_comps = set(re.findall(r"([\u4e00-\u9fa5（）()]{2,26}股份有限公司)", html))
            matched_comps = [c for c in cand_comps if normalize_name(c) in by_company]
            if matched_comps:
                added_batches.append({
                    "lottery_date": dt,
                    "batch": f"{m_b.group(1)}年第{m_b.group(2)}批",
                    "ratio": "20%",
                    "source_url": art_url,
                    "companies": sorted(set(matched_comps)),
                })
    except Exception as exc:
        print(f"[inspection][WARN] 东财新批次自动扫描跳过: {exc}")
    return added_batches


def fetch_inspection_records(data_dir):
    by_company, _, _ = load_ipo_lookup(data_dir)
    merged = {}

    # 1. 先加载存量基线（保留历史记录）
    existing_path = os.path.join(data_dir, "inspection_data.json")
    if os.path.exists(existing_path):
        try:
            with open(existing_path, "r", encoding="utf-8") as f:
                for old in (json.load(f) or {}).get("records") or []:
                    k = (normalize_name(old.get("company")), old.get("batch") or old.get("lottery_date"))
                    if k[0]:
                        merged[k] = dict(old)
        except Exception:
            pass

    # 2. 合入权威官方批次基线 + 东财最新自动扫描到的批次
    all_batches = list(OFFICIAL_INSPECTION_BATCHES) + extract_latest_inspection_from_em(by_company)
    for b in all_batches:
        dt = b["lottery_date"]
        batch_name = b["batch"]
        ratio = b["ratio"]
        src = b.get("source_url") or "https://www.sac.net.cn/"
        for comp in b["companies"]:
            norm_c = normalize_name(comp)
            key = (norm_c, batch_name)
            rec = merged.get(key) or {
                "lottery_date": dt,
                "company": comp,
                "batch": batch_name,
                "ratio": ratio,
                "source_url": src,
            }
            rec["lottery_date"] = dt
            rec["batch"] = batch_name
            rec["ratio"] = ratio
            rec["source_url"] = src

            ipo_hit = by_company.get(norm_c)
            ex, bd = infer_exchange_and_board(ipo_hit, comp)
            if ipo_hit:
                rec["stage"] = ipo_hit.get("stage") or "终止"
                rec["raw_status"] = ipo_hit.get("raw_status") or rec["stage"]
                rec["exchange"] = ex
                rec["board"] = bd
                rec["sponsor"] = normalize_broker("、".join(ipo_hit.get("sponsors") or [])) or "—"
                rec["accept_date"] = ipo_hit.get("accept_date") or "—"
            else:
                # 若企业已从交易所早期记录滚出或尚未在全面注册制库内，默认归为历史终止
                rec.setdefault("stage", "终止")
                rec.setdefault("raw_status", "终止(撤回)")
                rec.setdefault("exchange", ex)
                rec.setdefault("board", bd)
                rec.setdefault("sponsor", "—")
                rec.setdefault("accept_date", "—")

            merged[key] = rec

    out = sorted(merged.values(), key=lambda x: (x.get("lottery_date") or "", x.get("company") or ""), reverse=True)
    print(f"[inspection] 现场检查数据汇总完成：共 {len(out)} 条记录")
    return out


# ==================== 监管措施采集与 PDF 文书解析 ====================

COMPANY_IN_PDF_RE = re.compile(
    r"(?:受理了|审核中|保荐的|申报的|关于对|发行人[（(]?(?:以下简称|简称)?[)）]?[：:]?|"
    r"本所对|承担的|申请文件的)?"
    r"([\u4e00-\u9fa5A-Za-z0-9（）()]{3,32}?(?:股份有限公司|有限公司|集团公司))"
    r"(?:\s*[（(]以下简称[\"“]?发行人)"
)

SUBJECT_COMPANY_RE = re.compile(
    r"关于对([\u4e00-\u9fa5A-Za-z0-9（）()]{3,32}?(?:股份有限公司|有限公司))"
)

TITLE_IN_PDF_RE = re.compile(r"(关于对[^\n]{4,90}?(?:监管函|监管警示|纪律处分|通报批评|公开谴责|决定书|决定))")

NON_ISSUER_HINT_RE = re.compile(
    r"(?:证券(?:承销保荐|股份|有限)?(?:责任)?公司|保荐(?:有限)?(?:责任)?公司|律师事务所|会计师事务所|"
    r"资产评估|有限合伙|投资管理中心|证券交易所|证监会|监管局|保荐代表人)$"
)


def clean_extracted_company(raw):
    s = re.sub(r"[\s\u3000]+", "", str(raw or "")).strip("：:，,。.;；“”\"' ")
    # 剥离正文高频动作/文号/前缀
    for _ in range(3):
        prev = s
        s = re.sub(
            r"^.*?(?:曾受理了?|受理了?|审核了?|关于对|违规情况|指定的|保荐的|承担的|申请的|"
            r"科创板上市公司|创业板上市公司|北交所上市公司|并在[^\s]*?上市公司|"
            r"^\d+号|^\d{4}年至\d{4}年|^\d{4}年|^(?:上交所|深交所|北交所|本所|证监会)[（(]?[^）)]*[）)]?)",
            "",
            s,
        )
        s = s.lstrip("的了之及与、：:号年 ")
        if s == prev:
            break
    if s.startswith("对"):
        s = s[1:]
    if len(s) < 5 or len(s) > 40:
        return ""
    if NON_ISSUER_HINT_RE.search(s):
        return ""
    return s


def extract_company_from_title(title, by_company):
    m = SUBJECT_COMPANY_RE.search(str(title or ""))
    if m:
        c = clean_extracted_company(m.group(1))
        if c:
            return c
    # 兜底用 ipo_data.json 公司名精确子串匹配
    t_norm = normalize_name(title)
    for norm_c, rec in by_company.items():
        if len(norm_c) >= 6 and norm_c in t_norm:
            return rec["company"]
    return ""


def parse_regulatory_pdf(pdf_url, referer="", timeout=12):
    """下载监管文书 PDF 第 1~2 页文本，提取完整文书标题及涉事 IPO 发行人名称。"""
    if PdfReader is None or not pdf_url:
        return {}
    raw = http_get_bytes(pdf_url, headers={"Referer": referer or pdf_url}, timeout=timeout)
    reader = PdfReader(io.BytesIO(raw))
    text_parts = []
    for pg in reader.pages[:2]:
        try:
            text_parts.append(pg.extract_text() or "")
        except Exception:
            continue
    full_txt = "\n".join(text_parts)
    compact = re.sub(r"[ \t\r]+", " ", full_txt)
    flat = re.sub(r"\s+", "", full_txt)

    info = {}
    m_t = TITLE_IN_PDF_RE.search(re.sub(r"\n+", " ", compact))
    if m_t:
        info["title"] = m_t.group(1).strip()

    # 优先级 1：“XXX股份有限公司（以下简称发行人”
    m_c1 = re.search(r"([\u4e00-\u9fa5A-Za-z0-9（）()]{4,36}?(?:股份有限公司|有限公司))[（(]以下简称发行人", flat)
    if m_c1:
        cand = clean_extracted_company(m_c1.group(1))
        if cand:
            info["company"] = cand

    # 优先级 2：“受理了XXX股份有限公司首次公开发行”
    if not info.get("company"):
        m_c2 = re.search(r"(?:受理了|审核了)([\u4e00-\u9fa5A-Za-z0-9（）()]{4,36}?(?:股份有限公司|有限公司))(?:首次公开发行|股票并在)", flat)
        if m_c2:
            cand = clean_extracted_company(m_c2.group(1))
            if cand:
                info["company"] = cand

    # 优先级 3：从标题或正文任意“XXX股份有限公司（以下简称”
    if not info.get("company"):
        for m_c3 in re.finditer(r"([\u4e00-\u9fa5A-Za-z0-9（）()]{4,36}?股份有限公司)", flat):
            cand = clean_extracted_company(m_c3.group(1))
            if cand:
                info["company"] = cand
                break

    info["is_ipo_doc"] = bool(
        "首次公开发行" in flat
        or "发行上市" in flat
        or "审核中心监管函" in flat
        or "发行人" in flat
        or "保荐代表人" in flat
        or "签字" in flat
    )
    return info


def fetch_sse_listing_regulatory(existing_by_pdf, by_company):
    """采集上交所「发行上市审核监管 > 监管措施 & 纪律处分」。"""
    records = []
    sources = [
        ("measures", "监管措施", 15),
        ("disposition", "纪律处分", 10),
    ]
    for kind, default_cat, max_pages in sources:
        for pg in range(1, max_pages + 1):
            suffix = "" if pg == 1 else f"_{pg}"
            url = f"https://www.sse.com.cn/regulation/listing/{kind}/s_list{suffix}.shtml"
            try:
                html = http_get_text(url, headers={"Referer": f"https://www.sse.com.cn/regulation/listing/{kind}/"}, timeout=12)
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    break
                print(f"[regulatory][SSE] {kind} 第{pg}页跳过: {exc}")
                break
            except Exception as exc:
                print(f"[regulatory][SSE] {kind} 第{pg}页跳过: {exc}")
                break

            dds = re.findall(r"<dd[^>]*>([\s\S]*?)</dd>", html)
            if not dds:
                break
            for blk in dds:
                m_dt = re.search(r"(\d{4}-\d{2}-\d{2})", blk)
                m_lk = re.search(r'href="([^"]+)"[^>]*>(?:<em[^>]*>[^<]*</em>)?\s*([\s\S]*?)</a>', blk)
                if not (m_dt and m_lk):
                    continue
                dt = m_dt.group(1).strip()
                href = m_lk.group(1).strip()
                title = re.sub(r"<[^>]+>|\s+", " ", m_lk.group(2)).strip()
                pdf_url = href if href.startswith("http") else f"https://www.sse.com.cn{href}"

                cat = "纪律处分" if (kind == "disposition" or any(k in title for k in ("纪律处分", "通报批评", "公开谴责", "不接受"))) else default_cat
                comp = extract_company_from_title(title, by_company)

                # 若旧缓存已提取过同一 PDF 的精确公司名，直接复用
                old = existing_by_pdf.get(pdf_url)
                if not comp and old and old.get("company") and old.get("company") != "—":
                    comp = old["company"]

                records.append({
                    "title": title,
                    "company": comp,
                    "regulator": "上交所",
                    "category": cat,
                    "announce_date": dt,
                    "pdf_url": pdf_url,
                    "_needs_pdf_company": not bool(comp),
                    "_referer": "https://www.sse.com.cn/",
                })
    print(f"[regulatory][SSE] 上交所发行上市审核监管采集完成：{len(records)} 条")
    return records


def fetch_szse_regulatory(existing_by_pdf, by_company, by_code):
    """采集深交所审核中心监管函 & 纪律处分中涉及 IPO 项目的记录。"""
    records = []
    # 1. 1800_jgxxgk（无上市代码：主要为拟IPO发行人、保代、会计师监管函）
    # 2. 1800_jgxxgk_cf_snapshot（纪律处分中无上市代码或匹配 ipo_data 的记录）
    # 3. 1800_jgxxgk_snapshot（监管措施中无上市代码或匹配 ipo_data 且非纯日常持续督导的记录）
    catalogs = [
        ("1800_jgxxgk", "监管措施", 5, False),
        ("1800_jgxxgk_cf_snapshot", "纪律处分", 7, True),
        ("1800_jgxxgk_snapshot", "监管措施", 6, True),
    ]
    seen_pdfs = set()

    for cid, default_cat, max_pages, filter_ipo_only in catalogs:
        for pg in range(1, max_pages + 1):
            url = f"https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID={cid}&PAGENO={pg}"
            try:
                txt = http_get_text(url, headers={"Referer": "https://www.szse.cn/"}, timeout=15)
                arr = json.loads(txt)
                if not isinstance(arr, list) or not arr:
                    break
                rows = arr[0].get("data") or []
                if not rows:
                    break
                for row in rows:
                    code = str(row.get("gkxx_gsdm") or row.get("xx_gsdm") or "").strip()
                    abbr = str(row.get("gkxx_gsjc") or row.get("jc_gsjc") or "").strip()
                    dt = str(row.get("gkxx_gdrq") or row.get("xx_fwrq") or "").strip()[:10]
                    raw_type = str(row.get("gkxx_jgcs") or row.get("xx_cflb") or default_cat).strip()
                    raw_title = str(row.get("xx_bt") or "").strip()
                    sjdx = re.sub(r"<[^>]+>", " ", str(row.get("gkxx_sjdx") or "")).strip()
                    hj_html = str(row.get("hjnr") or row.get("ck") or "")
                    m_pdf = re.search(r"encode-open='([^']+)'", hj_html) or re.search(r'encode-open="([^"]+)"', hj_html)
                    if not m_pdf:
                        continue
                    pdf_url = "https://reportdocs.static.szse.cn" + m_pdf.group(1)
                    if pdf_url in seen_pdfs:
                        continue

                    # 过滤无关的老牌已上市日常信披监管（仅保留无代码拟上市/中介主体，或代码在 IPO 库中的近期企业）
                    if filter_ipo_only:
                        is_blank_subject = (not code)
                        is_ipo_code = bool(code and code in by_code)
                        has_ipo_kw = ("拟上市" in sjdx or "保荐" in sjdx or "首次公开发行" in raw_title or "发行上市" in raw_title)
                        if not (is_blank_subject or is_ipo_code or has_ipo_kw):
                            continue
                        if code and not is_ipo_code and not has_ipo_kw:
                            continue

                    seen_pdfs.add(pdf_url)
                    old = existing_by_pdf.get(pdf_url)
                    title = raw_title or (old.get("title") if old else "") or f"深交所{raw_type}（{dt}）"
                    comp = extract_company_from_title(title, by_company)
                    if not comp and old and old.get("company") and old.get("company") != "—":
                        comp = old["company"]

                    cat = "纪律处分" if (cid == "1800_jgxxgk_cf_snapshot" or any(k in raw_type or k in title for k in ("通报批评", "公开谴责", "纪律处分"))) else "监管措施"

                    records.append({
                        "title": title,
                        "company": comp,
                        "regulator": "深交所",
                        "category": cat,
                        "announce_date": dt,
                        "pdf_url": pdf_url,
                        "_needs_pdf_company": (not bool(comp)) or (not raw_title and not (old and old.get("title"))),
                        "_from_jgxxgk": (cid == "1800_jgxxgk"),
                        "_referer": "https://www.szse.cn/",
                    })
                time.sleep(0.15)
            except Exception as exc:
                print(f"[regulatory][SZSE] {cid} 第{pg}页跳过: {exc}")
                break

    print(f"[regulatory][SZSE] 深交所候选 IPO 监管记录采集完成：{len(records)} 条")
    return records


def fetch_bse_regulatory(by_company):
    """采集北交所公开自律监管措施（筛选涉及公开发行/IPO 项目的记录）。"""
    records = []
    try:
        cj = http.cookiejar.CookieJar()
        op = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(cj),
            urllib.request.HTTPSHandler(context=SSL_CTX),
        )
        http_get_text("https://www.bse.cn/disclosure/supervise.html", opener=op, timeout=12)
        for pg in range(0, 4):
            post = urllib.parse.urlencode({
                "page": pg,
                "companyCode": "",
                "startTime": "",
                "endTime": "",
                "announcementYn": 1,
                "newThreeArray[]": "3",
                "keyword": "",
            }).encode("utf-8")
            txt = http_get_text(
                "https://www.bse.cn/AnnouncementController/infoResult.do",
                headers={
                    "Referer": "https://www.bse.cn/disclosure/supervise.html",
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                },
                data=post,
                opener=op,
                timeout=12,
            )
            m = re.match(r"^[a-zA-Z0-9_]+\((.*)\);?$", txt.strip(), re.S)
            arr = json.loads(m.group(1) if m else txt)
            rows = (((arr[0] if isinstance(arr, list) and arr else {}) or {}).get("pageList") or {}).get("content") or []
            if not rows:
                break
            for row in rows:
                title = str(row.get("announcementTitle") or "").strip()
                comp_raw = str(row.get("companyName") or "").strip()
                acc_name = str(row.get("accountabilityName") or "").strip()
                dt = str(row.get("publishDate") or "")[:10]
                fp = str(row.get("destFilePath") or "").strip()
                pdf_url = f"https://www.bse.cn{fp}" if fp.startswith("/") else fp
                if not title:
                    title = f"关于对{comp_raw or acc_name or '相关责任主体'}采取自律监管措施的决定"

                comp = ""
                if comp_raw and normalize_name(comp_raw) in by_company:
                    comp = by_company[normalize_name(comp_raw)]["company"]
                elif "公开发行" in title or "上市" in title or "IPO" in title:
                    comp = extract_company_from_title(title, by_company) or comp_raw
                else:
                    # 匹配全称或简称前缀
                    for norm_c, rec in by_company.items():
                        if rec.get("exchange") == "北交所" and comp_raw and comp_raw in norm_c:
                            comp = rec["company"]
                            break
                if not comp:
                    continue

                cat_raw = str(row.get("accountability") or row.get("superviseType") or "")
                cat = "纪律处分" if any(k in cat_raw or k in title for k in ("纪律处分", "通报批评", "公开谴责")) else "监管措施"
                records.append({
                    "title": title,
                    "company": comp,
                    "regulator": "北交所",
                    "category": cat,
                    "announce_date": dt,
                    "pdf_url": pdf_url,
                    "_needs_pdf_company": False,
                })
    except Exception as exc:
        print(f"[regulatory][BSE] 采集跳过: {exc}")
    print(f"[regulatory][BSE] 北交所 IPO 相关监管记录：{len(records)} 条")
    return records


def fetch_csrc_regulatory(by_company):
    """通过证监会官网全文检索接口抓取 IPO 首发相关行政监管/处罚公开公告。"""
    records = []
    seen_urls = set()
    keywords = [
        "首次公开发行股票 出具警示函",
        "首次公开发行股票并上市 行政监管措施",
        "IPO 欺诈发行 处罚决定书",
    ]
    for kw in keywords:
        try:
            u = (
                "https://www.csrc.gov.cn/guestweb4/s?searchWord="
                + urllib.parse.quote(kw)
                + "&column=%E5%85%A8%E9%83%A8&pageSize=20&pageNum=0&siteCode=bm56000001"
            )
            html = http_get_text(u, headers={"Referer": "https://www.csrc.gov.cn/"}, timeout=15)
            links = re.findall(
                r'<a[^>]+href="(https?://www\.csrc\.gov\.cn/csrc/[^"]+|//www\.csrc\.gov\.cn/csrc/[^"]+|/csrc/[^"]+)"[^>]*>([\s\S]*?)</a>',
                html,
            )
            for href, raw_t in links:
                t = re.sub(r"<[^>]+>|\s+", " ", raw_t).strip()
                if len(t) < 10 or not any(k in t for k in ("警示函", "监管措施", "行政处罚", "市场禁入", "通报")):
                    continue
                if "办法" in t or "规定" in t or "指引" in t or "解读" in t:
                    continue
                full_url = f"https:{href}" if href.startswith("//") else (f"https://www.csrc.gov.cn{href}" if href.startswith("/") else href)
                if full_url in seen_urls:
                    continue
                comp = extract_company_from_title(t, by_company)
                if not comp:
                    continue
                if normalize_name(comp) not in by_company:
                    continue
                seen_urls.add(full_url)
                # 尝试在附近提取日期
                idx = html.find(href)
                ctx_txt = html[idx:idx + 500] if idx != -1 else ""
                m_dt = re.search(r"(\d{4}-\d{2}-\d{2})", ctx_txt)
                dt = m_dt.group(1) if m_dt else ""
                records.append({
                    "title": t,
                    "company": comp,
                    "regulator": "证监会",
                    "category": "行政监管" if "警示" in t or "监管" in t else "纪律处分",
                    "announce_date": dt,
                    "pdf_url": full_url,
                    "_needs_pdf_company": False,
                })
        except Exception as exc:
            print(f"[regulatory][CSRC] '{kw}' 跳过: {exc}")
    print(f"[regulatory][CSRC] 证监会 IPO 相关监管记录：{len(records)} 条")
    return records


def fetch_regulatory_records(data_dir, max_pdfs=160):
    by_company, by_code, _ = load_ipo_lookup(data_dir)
    existing_by_pdf = {}
    existing_path = os.path.join(data_dir, "regulatory_data.json")
    if os.path.exists(existing_path):
        try:
            with open(existing_path, "r", encoding="utf-8") as f:
                for old in (json.load(f) or {}).get("records") or []:
                    u = old.get("pdf_url")
                    if u:
                        existing_by_pdf[u] = dict(old)
        except Exception:
            pass

    sse_recs = fetch_sse_listing_regulatory(existing_by_pdf, by_company)
    szse_recs = fetch_szse_regulatory(existing_by_pdf, by_company, by_code)
    bse_recs = fetch_bse_regulatory(by_company)
    csrc_recs = fetch_csrc_regulatory(by_company)

    candidates = sse_recs + szse_recs + bse_recs + csrc_recs

    # 对缺失标题或涉事 IPO 发行人名称的 PDF 进行并发提取（仅对未命中缓存的 PDF 解析，严格控制上限）
    to_parse = [r for r in candidates if r.get("_needs_pdf_company") and r.get("pdf_url", "").lower().endswith(".pdf")]
    to_parse = to_parse[:max_pdfs]
    if to_parse and PdfReader is not None:
        print(f"[regulatory] 开始并发解析 {len(to_parse)} 份官方监管文书 PDF 提取标题与涉事 IPO 项目...")

        def worker(rec):
            try:
                parsed = parse_regulatory_pdf(rec["pdf_url"], referer=rec.get("_referer", ""))
                return rec["pdf_url"], parsed
            except Exception:
                return rec["pdf_url"], {}

        parsed_map = {}
        with ThreadPoolExecutor(max_workers=6) as pool:
            futs = [pool.submit(worker, r) for r in to_parse]
            for fut in as_completed(futs):
                u, info = fut.result()
                parsed_map[u] = info

        ok_cnt = 0
        for rec in candidates:
            info = parsed_map.get(rec.get("pdf_url"))
            if not info:
                continue
            if info.get("title") and (rec["title"].startswith("深交所") or len(info["title"]) > len(rec["title"])):
                rec["title"] = info["title"]
            if info.get("company") and not rec.get("company"):
                rec["company"] = info["company"]
                ok_cnt += 1
            if info.get("is_ipo_doc"):
                rec["_verified_ipo"] = True
        print(f"[regulatory] PDF 解析完成：补全涉事发行人 {ok_cnt} 条")

    # 合并去重与交叉关联 ipo_data.json
    dedup = {}
    for rec in candidates:
        comp = rec.get("company") or ""
        # 过滤掉既非 IPO 审核系统直出，又不属于 IPO 申报企业/未验证为 IPO 文书的上市公司日常督导条目
        if rec.get("regulator") == "深交所" and not rec.get("_from_jgxxgk"):
            norm_c = normalize_name(comp)
            if not (rec.get("_verified_ipo") or (norm_c and norm_c in by_company)):
                continue

        norm_c = normalize_name(comp)
        ipo_hit = by_company.get(norm_c)
        if not ipo_hit and comp:
            # 模糊容错：去括号匹配
            short_c = re.sub(r"（.*?）", "", norm_c)
            for k, v in by_company.items():
                if short_c and re.sub(r"（.*?）", "", k) == short_c:
                    ipo_hit = v
                    comp = v["company"]
                    break

        stage = ""
        raw_status = ""
        if ipo_hit:
            stage = ipo_hit.get("stage") or ""
            raw_status = ipo_hit.get("raw_status") or stage
        elif rec.get("regulator") == "上交所" or rec.get("_from_jgxxgk") or rec.get("_verified_ipo"):
            stage = "终止"
            raw_status = "终止"

        pdf_url = rec.get("pdf_url") or ""
        key = pdf_url or (rec.get("title"), rec.get("announce_date"), rec.get("regulator"))
        clean_rec = {
            "title": rec.get("title") or "监管决定书",
            "company": comp or "—",
            "stage": stage,
            "raw_status": raw_status or "—",
            "regulator": rec.get("regulator") or "证监会",
            "category": rec.get("category") or "监管措施",
            "announce_date": rec.get("announce_date") or "",
            "pdf_url": pdf_url,
        }
        dedup[key] = clean_rec

    # 与已有持久化基线合入（保留人工核验或早先缓存条目）
    for u, old in existing_by_pdf.items():
        if u not in dedup:
            dedup[u] = old

    out = sorted(dedup.values(), key=lambda x: (x.get("announce_date") or "", x.get("title") or ""), reverse=True)
    print(f"[regulatory] IPO 监管措施全量合并完成：共 {len(out)} 条")
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
    parser = argparse.ArgumentParser(description="三期数据采集脚本（现场检查 + 监管措施）")
    parser.add_argument("--only-inspection", action="store_true", help="仅更新现场检查数据")
    parser.add_argument("--only-regulatory", action="store_true", help="仅更新监管措施数据")
    parser.add_argument("--max-pdfs", type=int, default=160, help="本次最多新解析多少份监管文书 PDF，默认 160")
    parser.add_argument("--soft-fail", action="store_true", help="网络请求异常时输出告警并退出 0，避免中断 CI 流水线")
    args = parser.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(root, "data")
    os.makedirs(data_dir, exist_ok=True)

    if not args.only_regulatory:
        try:
            insp = fetch_inspection_records(data_dir)
            if insp:
                write_pair(data_dir, "inspection_data", "__INSPECTION_DATA__", insp)
        except Exception as exc:
            if args.soft_fail:
                print(f"[inspection][WARN] 采集跳过（已保留存量基线）: {exc}")
            else:
                print(f"[inspection] 采集失败: {exc}", file=sys.stderr)
                sys.exit(1)

    if not args.only_inspection:
        try:
            reg = fetch_regulatory_records(data_dir, max_pdfs=args.max_pdfs)
            if reg:
                write_pair(data_dir, "regulatory_data", "__REGULATORY_DATA__", reg)
        except Exception as exc:
            if args.soft_fail:
                print(f"[regulatory][WARN] 采集跳过（已保留存量基线）: {exc}")
            else:
                print(f"[regulatory] 采集失败: {exc}", file=sys.stderr)
                sys.exit(1)


if __name__ == "__main__":
    main()
