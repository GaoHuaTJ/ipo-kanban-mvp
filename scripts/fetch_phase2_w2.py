#!/usr/bin/env python3
"""
二期第 2 周数据采集与解析脚本：
1. 新三板挂牌（全国股转系统 www.neeq.com.cn/nqxxController/nqxx.do）
   -> data/neeq_data.json & data/neeq_data.js（window.__NEEQ_DATA__）
2. 全市场 IPO 辅导备案（中国证监会公开发行辅导公示系统 http://eid.csrc.gov.cn/csrcfd/）
   - 兼容单报告新备案企业主行与多报告折叠子行，收集完整历史报告数组
   - 支持读取存量 data/tutoring_data.json 增量合并，历史记录永不丢失
   - 自动交叉比对 data/ipo_data.json（已受理状态/板块/中介）与 data/neeq_data.json（挂牌情况）
   - 并发下载并用 pypdf 解析《辅导备案报告》中的基本面信息与律所/会所，支持增量缓存
   -> data/tutoring_data.json & data/tutoring_data.js（window.__TUTORING_DATA__）
"""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import gzip
import hashlib
import html as html_lib
import http.cookiejar
import io
import json
import logging
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

from broker_utils import normalize_broker

try:
    import pypdf
    logging.getLogger("pypdf").setLevel(logging.ERROR)
except ImportError:
    pypdf = None

CSRC_PRE_IPO_PREFIX = "http://eid.csrc.gov.cn/mnt/storage/stock/pre_ipo/"
_OCR_BIN_PATH = "/tmp/ipo_pdf_ocr_bin"
_OCR_SWIFT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pdf_ocr.swift")


def ensure_macos_ocr_bin():
    """仅在 macOS 且具备 swiftc 时编译缓存 Vision OCR 工具，Linux/CI 环境自动跳过。"""
    if sys.platform != "darwin" or not os.path.exists(_OCR_SWIFT_PATH):
        return None
    if os.path.exists(_OCR_BIN_PATH) and os.path.getmtime(_OCR_BIN_PATH) >= os.path.getmtime(_OCR_SWIFT_PATH):
        return _OCR_BIN_PATH
    if not shutil.which("swiftc"):
        return None
    try:
        res = subprocess.run(
            ["swiftc", "-O", _OCR_SWIFT_PATH, "-o", _OCR_BIN_PATH],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if res.returncode == 0 and os.path.exists(_OCR_BIN_PATH):
            return _OCR_BIN_PATH
    except Exception:
        pass
    return None


def run_macos_pdf_ocr(pdf_bytes, max_pages=3):
    bin_path = ensure_macos_ocr_bin()
    if not bin_path or not pdf_bytes:
        return ""
    fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
    try:
        with os.fdopen(fd, "wb") as tf:
            tf.write(pdf_bytes)
        res = subprocess.run([bin_path, tmp_path, str(max_pages)], capture_output=True, text=True, timeout=35)
        return (res.stdout or "").strip() if res.returncode == 0 else ""
    except Exception:
        return ""
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def company_shard(company):
    return hashlib.md5(str(company or "").encode("utf-8")).hexdigest()[0]


def to_rel_pdf_path(url):
    u = str(url or "").strip()
    if u.startswith(CSRC_PRE_IPO_PREFIX):
        return urllib.parse.unquote(u[len(CSRC_PRE_IPO_PREFIX):])
    return u


def from_rel_pdf_path(path_or_url):
    p = str(path_or_url or "").strip()
    if not p:
        return ""
    if p.startswith("http"):
        return p
    return CSRC_PRE_IPO_PREFIX + urllib.parse.quote(p, safe="/")

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)

MIN_DATE = "2023-01-01"

KNOWN_LAW_ROOTS = [
    "锦天城", "竞天公诚", "君合", "金杜", "中伦", "国浩", "大成", "德恒",
    "环球", "嘉源", "天元", "海问", "通商", "方达", "汉坤", "康达", "植德",
    "信达", "华商", "中银", "观韬中茂", "观韬", "天册", "世纪同仁", "至理",
    "启元", "天禾", "德和衡", "泰和泰", "广发", "段和段", "金诚同达", "隆安",
    "浩天", "万商天勤", "卓纬", "嘉润", "国枫", "天达共和", "君泽君", "星来",
    "安杰世泽", "金天", "大钧", "高朋", "众成清泰", "瑛明", "通力", "澄明则正",
    "道可特", "天衍禾", "天衡联合", "卓建", "经世", "中闻", "天驰君泰", "炜衡",
    "盈科", "汇业",
]

KNOWN_ACCT_ROOTS = [
    "毕马威华振", "毕马威", "普华永道中天", "普华永道", "安永华明", "安永",
    "德勤华永", "德勤", "天健", "容诚", "立信中联", "立信", "致同",
    "信永中和", "大华", "大信", "中汇", "中喜", "公证天业", "天职国际",
    "中审众环", "中审亚太", "中审华", "中天运", "上会", "苏亚金诚", "希格玛",
    "政旦志远", "利安达", "鹏盛", "北京兴华", "中兴华", "中兴财光华",
    "众华", "天衡", "天圆全", "亚太", "华兴", "尤尼泰振青", "中名国成", "和信",
]

PROVINCE_PREFIXES = (
    "北京市", "北京", "上海市", "上海", "深圳市", "深圳", "广州市", "广州",
    "广东省", "广东", "浙江省", "浙江", "江苏省", "江苏", "四川省", "四川",
    "陕西省", "陕西", "重庆市", "重庆", "安徽省", "安徽", "福建省", "福建",
    "山东省", "山东", "湖北省", "湖北", "湖南省", "湖南", "河南省", "河南",
    "河北省", "河北", "辽宁省", "辽宁", "吉林省", "吉林", "黑龙江省", "黑龙江",
    "云南省", "云南", "贵州省", "贵州", "天津市", "天津", "江西省", "江西",
    "山西省", "山西", "广西", "海南省", "海南", "甘肃省", "甘肃",
    "宁夏", "青海", "新疆", "西藏", "内蒙古", "福建", "厦门", "青岛",
    "大连", "宁波", "苏州", "杭州", "南京", "成都", "武汉", "长沙", "西安",
)


def fmt_date(raw):
    if not raw:
        return ""
    s = str(raw).strip()
    if len(s) >= 10 and s[4] == "-":
        return s[:10]
    m_cn = re.search(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?", s)
    if m_cn:
        return f"{m_cn.group(1)}-{int(m_cn.group(2)):02d}-{int(m_cn.group(3)):02d}"
    digits = re.sub(r"\D", "", s)
    if len(digits) >= 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
    return s[:10]


def normalize_name(name):
    if not name:
        return ""
    return (
        str(name)
        .strip()
        .replace("(", "（")
        .replace(")", "）")
        .replace(" ", "")
        .replace("\u3000", "")
    )


def shorten_law_firm(raw):
    s = re.sub(r"\s+", "", str(raw or "")).strip()
    if not s or s == "—":
        return "—"
    s = re.sub(r"[（(]以下.*?[）)]", "", s)
    s = re.sub(r"[（(]特殊普通合伙[）)]|[（(]普通合伙[）)]", "", s)
    # 优先匹配常见大所词根
    for root in sorted(KNOWN_LAW_ROOTS, key=len, reverse=True):
        if root in s:
            return root
    core = re.sub(r"（[^）]*）|\([^)]*\)", "", s)
    core = re.sub(r"(?:律师)?事务所$", "", core)
    core = re.sub(r"律师$", "", core)
    for pref in PROVINCE_PREFIXES:
        if core.startswith(pref) and len(core) - len(pref) >= 2:
            core = core[len(pref):]
            break
    return core or s[:8]


def shorten_acct_firm(raw):
    s = re.sub(r"\s+", "", str(raw or "")).strip()
    if not s or s == "—":
        return "—"
    s = re.sub(r"[（(]以下.*?[）)]", "", s)
    for root in sorted(KNOWN_ACCT_ROOTS, key=len, reverse=True):
        if root in s:
            if root.startswith("毕马威"):
                return "毕马威"
            if root.startswith("普华永道"):
                return "普华永道"
            if root.startswith("安永"):
                return "安永"
            if root.startswith("德勤"):
                return "德勤"
            return root
    core = re.sub(r"[（(]特殊普通合伙[）)]|[（(]特?普通合伙[）)]?|[（(]集团[）)]|[（(]特.*", "", s)
    core = re.sub(r"(?:股份有限公司|有限责任公司|有限公司)$", "", core)
    core = re.sub(r"(?:会计师)?事务所$", "", core)
    core = re.sub(r"会计师$", "", core)
    return core or s[:8]


def _is_valid_law_firm(s):
    if not s or len(s) < 5:
        return False
    bad_kws = ("证券", "金融", "辅导", "服务机构", "执业", "配合开展", "会计师", "监管局", "交易所")
    if any(k in s for k in bad_kws):
        return False
    short = shorten_law_firm(s)
    return len(short) >= 2 and "律师" not in short and "事务所" not in short


def _is_valid_acct_firm(s):
    if not s or len(s) < 6:
        return False
    bad_kws = ("证券", "金融", "辅导", "服务机构", "执业", "配合开展", "律师", "监管局", "交易所")
    if any(k in s for k in bad_kws):
        return False
    if s.startswith(("（", "(")):
        return False
    short = shorten_acct_firm(s)
    return len(short) >= 2 and "会计师" not in short and "事务所" not in short and "普通合伙" not in short


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


def classify_report_category(report_type, title=""):
    txt = f"{report_type} {title}"
    if "验收" in txt or "完成" in txt or "撤回" in txt or "终止" in txt:
        return "辅导验收报告"
    if "进展" in txt:
        return "中期进展报告"
    return "辅导备案报告"


def infer_board_from_text(text, default="沪深"):
    t = str(text or "")
    if "北京证券交易所" in t or "北交所" in t or "向不特定合格投资者公开发行股票" in t:
        return "北证"
    return default


def strip_html(frag):
    txt = re.sub(r"<[^>]+>", " ", str(frag or ""))
    return re.sub(r"\s+", " ", html_lib.unescape(txt)).strip()


def clean_pdf_value(val):
    if not val:
        return ""
    s = re.sub(r"\s+", " ", str(val)).strip()
    # 去掉中文汉字之间的多余排版空格，保留数字/英文与汉字间的必要分隔
    s = re.sub(r"(?<=[\u4e00-\u9fa5，。；：、（）%])\s+(?=[\u4e00-\u9fa5，。；：、（）])", "", s)
    s = re.sub(r"\s+([，。；：、）%万])", r"\1", s)
    s = re.sub(r"([（])\s+", r"\1", s)
    return s.strip(" ：:;；")


def extract_profile_from_pdf_bytes(pdf_bytes, report_title="", is_filing_report=True, allow_ocr=True):
    """从证监会辅导备案报告/进展报告 PDF 提取结构化基本面与中介字段（支持 macOS Vision OCR 兜底）。"""
    profile = {}
    if not pdf_bytes:
        return profile

    raw_text = ""
    if pypdf is not None:
        try:
            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            pages_txt = []
            for i in range(min(5, len(reader.pages))):
                try:
                    t = reader.pages[i].extract_text() or ""
                    if t.strip():
                        pages_txt.append(t)
                except Exception:
                    continue
            raw_text = "\n".join(pages_txt).strip()
        except Exception:
            raw_text = ""

    # 扫描版 PDF 或局部含扫描页且未见中介/基本面关键字时，macOS 下用 Vision OCR 识别
    if allow_ocr and (len(raw_text) < 20 or (is_filing_report and "律师事务所" not in raw_text and "会计师事务所" not in raw_text)):
        ocr_text = run_macos_pdf_ocr(pdf_bytes, max_pages=3)
        if len(ocr_text) > len(raw_text):
            raw_text = ocr_text
        elif ocr_text:
            raw_text = raw_text + "\n" + ocr_text

    if len(raw_text) < 20:
        return profile

    profile["_has_text"] = True
    # 去除页眉页脚常见孤立页码行
    cleaned_lines = []
    for line in raw_text.splitlines():
        st = line.strip()
        if re.fullmatch(r"—?\s*\d{1,2}\s*—?", st):
            continue
        cleaned_lines.append(st)
    flat = re.sub(r"\s+", " ", "\n".join(cleaned_lines))

    # 板块判断（仅当全文明确出现北交所字样，避免误判新三板）
    if "北京证券交易所" in flat or "向不特定合格投资者公开发行股票" in flat or "拟申请在北交所" in flat:
        profile["board"] = "北证"
    elif is_filing_report and ("上海证券交易所" in flat or "深圳证券交易所" in flat or "创业板" in flat or "科创板" in flat or "主板" in flat or "首次公开发行" in flat):
        profile["board"] = "沪深"

    def grab(start_pat, end_pat, max_len=360):
        m = re.search(start_pat + r"[\s:：]*(.{1," + str(max_len) + r"}?)(?=" + end_pat + r"|$)", flat, re.S)
        return clean_pdf_value(m.group(1)) if m else ""

    if is_filing_report or ("公司基本情况" in flat and "成立日期" in flat):
        founded_raw = grab(r"成\s*立\s*(?:日\s*期|时\s*间)", r"注\s*册\s*资\s*本|法\s*定\s*代\s*表\s*人|注\s*册\s*地\s*址", 40)
        founded_dt = fmt_date(founded_raw)
        if founded_dt and len(founded_dt) >= 8:
            profile["founded_date"] = founded_dt

        reg_cap = grab(r"注\s*册\s*资\s*本", r"法\s*定\s*代\s*表\s*人|注\s*册\s*地\s*址|注\s*册\s*地|实\s*收\s*资\s*本", 60)
        if reg_cap:
            profile["reg_capital"] = reg_cap

        reg_addr = grab(r"注\s*册\s*地\s*址", r"办\s*公\s*地\s*址|联\s*系\s*电\s*话|控\s*股\s*股\s*东|实\s*际\s*控\s*制\s*人|行\s*业\s*分\s*类", 140)
        if reg_addr:
            profile["reg_address"] = reg_addr

        holder = grab(
            r"控\s*股\s*股\s*东(?:\s*及\s*持\s*股\s*比\s*例)?",
            r"实\s*际\s*控\s*制\s*人|行\s*业\s*分\s*类|所\s*属\s*行\s*业|在\s*其\s*他\s*交\s*易\s*场\s*所",
            420,
        )
        if holder:
            profile["controlling_shareholder"] = holder

        ind = grab(
            r"(?:行\s*业\s*分\s*类|所\s*属\s*行\s*业)",
            r"所\s*[（(]?\s*申\s*请\s*[）)]?\s*挂\s*牌|在\s*其\s*他\s*交\s*易\s*场|备\s*注|前\s*次\s*申\s*报|二\s*[、.]\s*辅\s*导",
            80,
        )
        if ind:
            profile["industry"] = re.sub(r"\s*(?:在\s*其\s*他\s*交\s*易\s*场.*|所\s*[（(]申\s*请.*)$", "", ind).strip()

        neeq_txt = grab(
            r"(?:在\s*其\s*他\s*交\s*易\s*场\s*所\s*)?[（(]?\s*申\s*请\s*[）)]?\s*挂\s*牌(?:\s*或\s*上\s*市\s*的\s*情\s*况)?",
            r"备\s*注|前\s*次\s*申\s*报|二\s*[、.]\s*辅\s*导|阶\s*段\s*辅\s*导|[\u4e00-\u9fa5]{2,16}(?:证券|金融)股份有限公司",
            220,
        )
        if neeq_txt:
            neeq_clean = re.sub(r"^(?:或上市的?情况\s*)+", "", neeq_txt)
            neeq_clean = re.sub(r"(?:\s*或上市的?情况)+$", "", neeq_clean).strip()
            if neeq_clean == "或上市的情况":
                neeq_clean = ""
            if neeq_clean:
                profile["neeq_status"] = neeq_clean

        remark = grab(r"备\s*注", r"二\s*[、.]\s*辅\s*导|阶\s*段\s*辅\s*导", 240)
        if remark:
            if (
                remark == "无"
                or "不存在" in remark
                or "未曾" in remark
                or "不适用" in remark
                or "不予核准" in remark
                or "不予注册" in remark
                or remark.startswith("止审查")
            ):
                profile["prev_filing"] = "无"
            else:
                profile["prev_filing"] = remark
        elif "前次申报" in flat:
            pf = grab(r"前\s*次\s*申\s*报(?:\s*情\s*况)?", r"二\s*[、.]|挂\s*牌", 160)
            if pf:
                profile["prev_filing"] = pf

        law_raw = grab(
            r"律\s*师\s*事\s*务\s*所",
            r"会\s*计\s*师\s*事\s*务|签\s*字\s*律\s*师|三\s*[、.]\s*辅\s*导|辅\s*导\s*工\s*作|辅\s*导\s*小\s*组",
            90,
        )
        if law_raw:
            law_clean = re.sub(r"[（(]以下.*?[）)].*$", "", law_raw).strip()
            m_lf_end = re.match(r"^(.*?律师事务所(?:[（(][^）)]*[）)])?)", law_clean)
            if m_lf_end:
                law_clean = m_lf_end.group(1)
            if _is_valid_law_firm(law_clean):
                profile["law_firm"] = law_clean
                profile["law_firm_short"] = shorten_law_firm(law_clean)

        acct_raw = grab(
            r"会\s*计\s*师\s*事\s*务\s*所?",
            r"三\s*[、.]\s*辅\s*导|辅\s*导\s*工\s*作|签\s*字\s*会\s*计\s*师|其\s*他\s*中\s*介|时\s*间\s*辅\s*导",
            90,
        )
        if acct_raw:
            acct_clean = re.sub(r"[（(]以下.*?[）)].*$", "", acct_raw).strip()
            if "会计师事务所" in acct_clean and _is_valid_acct_firm(acct_clean):
                profile["acct_firm"] = acct_clean
                profile["acct_firm_short"] = shorten_acct_firm(acct_clean)

    # 兜底：若第 2 页恰好为图片扫描件或为进展报告，尝试从全文正则与知名所名称匹配律所/会所
    compact_text = clean_pdf_value(flat)
    if not profile.get("law_firm"):
        for m_law in re.finditer(r"([\u4e00-\u9fa5（()）]{2,26}律师事务所)", compact_text):
            lf = re.sub(r"^.*?(?:联合|委托|聘请|会同|以及|与|和|及|、|，|。)", "", m_law.group(1)).strip()
            lf = re.sub(r"^.*?(?:执业|机构|情况|为|有)", "", lf).strip()
            if _is_valid_law_firm(lf):
                profile["law_firm"] = lf
                profile["law_firm_short"] = shorten_law_firm(lf)
                break
        if not profile.get("law_firm"):
            for root in KNOWN_LAW_ROOTS:
                if re.search(r"(?:、|与|及|律师事务所|律师)" + re.escape(root) + r"(?:律师|相关人员|、|，)", compact_text) or (root + "律师") in compact_text:
                    profile["law_firm"] = f"{root}律师事务所"
                    profile["law_firm_short"] = root
                    break

    if not profile.get("acct_firm"):
        for m_acct in re.finditer(r"([\u4e00-\u9fa5]{2,22}会计师事务所(?:（特殊普通合伙）|\(特殊普通合伙\))?)", compact_text):
            af = re.sub(r"^.*?(?:联合|委托|聘请|会同|以及|与|和|及|、|，|。)", "", m_acct.group(1)).strip()
            af = re.sub(r"^.*?(?:会计师事务|所)", "", af).strip() if af.startswith("会计师事务") else af
            if _is_valid_acct_firm(af):
                profile["acct_firm"] = af
                profile["acct_firm_short"] = shorten_acct_firm(af)
                break
        if not profile.get("acct_firm"):
            for root in KNOWN_ACCT_ROOTS:
                if re.search(r"(?:、|与|及|会计师事务所|会计师)" + re.escape(root) + r"(?:会计师|相关人员|、|，)", compact_text) or (root + "会计师") in compact_text:
                    profile["acct_firm"] = f"{root}会计师事务所"
                    profile["acct_firm_short"] = shorten_acct_firm(root)
                    break

    return profile


def parse_tutoring_pdf_url(pdf_url, timeout=16):
    """下载单个 eid.csrc.gov.cn PDF 并提取基本信息，供批量预解析与本地 /api/tutoring-detail 共用。"""
    if not pdf_url or not pdf_url.startswith("http"):
        return {}
    # 强制使用 http（eid.csrc.gov.cn HTTPS 会触发 TLSV1_ALERT_INTERNAL_ERROR）
    safe_url = re.sub(r"^https://", "http://", pdf_url.strip())
    req = urllib.request.Request(
        safe_url,
        headers={"User-Agent": UA, "Referer": "http://eid.csrc.gov.cn/fd.html"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        pdf_bytes = resp.read()
    is_filing = ("备案报告" in safe_url) or ("备案报告" in urllib.parse.unquote(safe_url))
    return extract_profile_from_pdf_bytes(pdf_bytes, is_filing_report=is_filing)


def _extract_row_pdf_info(tr_html, td_title_html, fallback_date=""):
    m_pdf = re.search(
        r"downloadPdf1\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]*)['\"],\s*['\"]([^'\"]*)['\"]",
        tr_html,
    )
    if not m_pdf:
        m_pdf = re.search(r"downloadPdf1\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]*)['\"]", tr_html)

    pdf_path = html_lib.unescape(m_pdf.group(1)).strip() if m_pdf else ""
    pdf_url = (
        f"http://eid.csrc.gov.cn{urllib.parse.quote(pdf_path, safe='/')}"
        if pdf_path
        else ""
    )

    m_title = re.search(r'title=["\']([^"\']+)["\']', td_title_html or "")
    report_title = html_lib.unescape(m_title.group(1)).strip() if m_title else ""
    if not report_title and m_pdf and len(m_pdf.groups()) >= 2 and m_pdf.group(2):
        report_title = html_lib.unescape(m_pdf.group(2)).strip()
    if not report_title:
        report_title = strip_html(td_title_html)

    report_date = ""
    if m_pdf and len(m_pdf.groups()) >= 3 and m_pdf.group(3):
        report_date = fmt_date(m_pdf.group(3))
    if not report_date:
        m_dt = re.search(r"/pre_ipo/(\d{4})/(\d{2})/(\d{2})/", pdf_path)
        if m_dt:
            report_date = f"{m_dt.group(1)}-{m_dt.group(2)}-{m_dt.group(3)}"
    if not report_date:
        report_date = fallback_date
    return report_title, pdf_url, report_date


def _parse_csrc_page_rows(page_html):
    """解析单个 eid.csrc.gov.cn HTML 列表页中的所有主行（含单报告无 '>' 行）与折叠子行。"""
    items = []
    trs = re.findall(r"<tr[^>]*>.*?</tr>", page_html, re.S)
    current_rec = None

    for tr in trs:
        tds = re.findall(r"<td[^>]*>.*?</td>", tr, re.S)
        if len(tds) < 8:
            continue

        company = strip_html(tds[1])
        if company:
            sponsor_full = strip_html(tds[2])
            sponsor = normalize_broker(sponsor_full)
            record_date = fmt_date(strip_html(tds[3]))
            status = normalize_tutoring_status(strip_html(tds[4]))
            bureau = strip_html(tds[5])
            report_type = strip_html(tds[6]) or "辅导报告"
            report_title, pdf_url, update_date = _extract_row_pdf_info(tr, tds[7], record_date)
            category = classify_report_category(report_type, report_title)

            rep = {
                "category": category,
                "type": report_type,
                "title": report_title or report_type,
                "date": update_date or record_date or "",
                "pdf_url": pdf_url,
            }

            current_rec = {
                "company": company,
                "sponsor": sponsor or "—",
                "sponsor_full": sponsor or "—",
                "record_date": record_date or "—",
                "status": status,
                "bureau": bureau or "—",
                "report_type": report_type,
                "report_title": report_title or report_type,
                "update_date": update_date or record_date or "—",
                "pdf_url": pdf_url,
                "reports": [rep] if (pdf_url or report_title) else [],
            }
            items.append(current_rec)
        elif current_rec is not None:
            # 折叠历史子行：tds[1] 为空，tr 带有 downloadPdf1
            report_type = strip_html(tds[6]) or "辅导进展情况报告"
            report_title, pdf_url, rep_date = _extract_row_pdf_info(tr, tds[7], current_rec["record_date"])
            if pdf_url or report_title:
                current_rec["reports"].append({
                    "category": classify_report_category(report_type, report_title),
                    "type": report_type,
                    "title": report_title or report_type,
                    "date": rep_date or current_rec["record_date"],
                    "pdf_url": pdf_url,
                })
    return items


def _merge_reports(existing_reports, new_reports):
    by_key = {}
    for rep in list(existing_reports or []) + list(new_reports or []):
        url = (rep.get("pdf_url") or "").strip()
        title = (rep.get("title") or "").strip()
        dt = (rep.get("date") or "").strip()
        cat = rep.get("category") or classify_report_category(rep.get("type", ""), title)
        key = url or f"{cat}::{title}::{dt}"
        if not key:
            continue
        norm_rep = {
            "category": cat,
            "type": rep.get("type") or cat,
            "title": title or rep.get("type") or cat,
            "date": dt,
            "pdf_url": url,
        }
        if key not in by_key or (len(norm_rep["title"]) > len(by_key[key].get("title", ""))):
            by_key[key] = norm_rep
    merged = sorted(by_key.values(), key=lambda x: (x.get("date") or "", x.get("title") or ""), reverse=True)
    return merged


def _compute_stage_and_milestones(rec):
    reports = rec.get("reports") or []
    status = rec.get("status") or "辅导备案"

    filing_reps = [r for r in reports if r.get("category") == "辅导备案报告"]
    mid_reps = [r for r in reports if r.get("category") == "中期进展报告"]
    accept_reps = [r for r in reports if r.get("category") == "辅导验收报告"]

    filing_date = ""
    if filing_reps:
        filing_dates = sorted([r.get("date") for r in filing_reps if r.get("date")])
        filing_date = filing_dates[0] if filing_dates else ""
    if not filing_date and rec.get("record_date") and rec.get("record_date") != "—":
        filing_date = rec["record_date"]

    mid_date = ""
    if mid_reps:
        mid_dates = sorted([r.get("date") for r in mid_reps if r.get("date")], reverse=True)
        mid_date = mid_dates[0] if mid_dates else ""

    if status in ("撤回辅导备案", "辅导验收终止"):
        stage = "辅导终止"
        accept_date = ""
    elif status in ("辅导验收", "辅导工作完成"):
        stage = "辅导验收"
        acc_dates = sorted([r.get("date") for r in accept_reps if r.get("date")], reverse=True)
        accept_date = acc_dates[0] if acc_dates else (rec.get("update_date") if rec.get("update_date") != "—" else "")
    elif mid_reps:
        stage = "辅导中期"
        accept_date = ""
    else:
        stage = "辅导备案"
        accept_date = ""

    rec["stage"] = stage
    rec["milestones"] = {
        "filing_date": filing_date,
        "mid_date": mid_date,
        "accept_date": accept_date,
    }
    rec["report_count"] = max(len(reports), rec.get("report_count") or 1)
    if filing_reps:
        # 优先记录最早或最新的备案报告链接
        rec["filing_pdf_url"] = filing_reps[-1].get("pdf_url") or filing_reps[0].get("pdf_url") or rec.get("pdf_url", "")
    else:
        rec["filing_pdf_url"] = rec.get("filing_pdf_url") or rec.get("pdf_url", "")


def _load_cross_reference_maps(data_dir):
    ipo_map = {}
    ipo_path = os.path.join(data_dir, "ipo_data.json")
    if os.path.exists(ipo_path):
        try:
            with open(ipo_path, "r", encoding="utf-8") as f:
                ipo_recs = json.load(f).get("records") or []
            for r in ipo_recs:
                k = normalize_name(r.get("company"))
                if k and k not in ipo_map:
                    ipo_map[k] = r
        except Exception:
            pass

    neeq_by_abbr = {}
    neeq_path = os.path.join(data_dir, "neeq_data.json")
    if os.path.exists(neeq_path):
        try:
            with open(neeq_path, "r", encoding="utf-8") as f:
                neeq_recs = json.load(f).get("records") or []
            for n in neeq_recs:
                abbr = str(n.get("abbr") or "").strip()
                if len(abbr) >= 3:
                    neeq_by_abbr[abbr] = n
        except Exception:
            pass
    return ipo_map, neeq_by_abbr


def fetch_tutoring_records(data_dir, backfill=False, parse_pdfs_limit=120, reparse_scanned=False):
    """
    直连中国证监会资本市场电子化信息披露平台（http://eid.csrc.gov.cn/csrcfd/），
    爬取全量公示页面 + 增量合并已有 tutoring_data.json + 并发解析辅导备案报告 PDF。
    """
    # 1. 加载历史已存数据，保留存量企业、分片报告与已解析档案
    merged_map = {}
    shard_dir = os.path.join(data_dir, "tutoring_reports")
    sharded_reports = {}
    if os.path.isdir(shard_dir):
        for sh in [f"{i:x}" for i in range(16)]:
            sp = os.path.join(shard_dir, f"{sh}.json")
            if os.path.exists(sp):
                try:
                    with open(sp, "r", encoding="utf-8") as sf:
                        sdata = json.load(sf) or {}
                    for comp_k, rep_list in sdata.items():
                        sharded_reports[comp_k] = [
                            {
                                "category": r.get("c") or "辅导备案报告",
                                "type": r.get("c") or "辅导报告",
                                "title": r.get("t") or r.get("c") or "辅导报告",
                                "date": r.get("d") or "",
                                "pdf_url": from_rel_pdf_path(r.get("p") or ""),
                            }
                            for r in (rep_list or [])
                        ]
                except Exception:
                    pass

    existing_path = os.path.join(data_dir, "tutoring_data.json")
    if os.path.exists(existing_path):
        try:
            with open(existing_path, "r", encoding="utf-8") as f:
                old_recs = json.load(f).get("records") or []
            for old in old_recs:
                c = old.get("company")
                if c:
                    rec_copy = dict(old)
                    if not rec_copy.get("reports") and c in sharded_reports:
                        rec_copy["reports"] = sharded_reports[c]
                    merged_map[c] = rec_copy
            print(f"[tutoring] 已加载存量基线 {len(merged_map)} 家用于增量合并")
        except Exception as exc:
            print(f"[tutoring] 读取存量基线跳过: {exc}")

    def fetch_page_html(pg):
        url = (
            "http://eid.csrc.gov.cn/csrcfd/index.html"
            if pg == 1
            else f"http://eid.csrc.gov.cn/csrcfd/index_{pg}.html"
        )
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "http://eid.csrc.gov.cn/fd.html"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="replace")

    def merge_parsed_items(parsed_items):
        for item in parsed_items:
            comp = item["company"]
            prev = merged_map.get(comp)
            if not prev:
                merged_map[comp] = item
            else:
                # 增量合并：保留已有 profile 字段，更新最新状态与合并完整报告清单
                prev_reports = prev.get("reports") or []
                if not prev_reports and prev.get("pdf_url"):
                    prev_reports = [{
                        "category": classify_report_category(prev.get("report_type", ""), prev.get("report_title", "")),
                        "type": prev.get("report_type") or "辅导报告",
                        "title": prev.get("report_title") or prev.get("report_type") or "辅导报告",
                        "date": prev.get("update_date") or prev.get("record_date") or "",
                        "pdf_url": prev.get("pdf_url") or "",
                    }]
                prev["reports"] = _merge_reports(prev_reports, item.get("reports") or [])
                if item.get("update_date", "") >= prev.get("update_date", ""):
                    for fld in ("sponsor", "sponsor_full", "status", "bureau", "report_type", "report_title", "update_date", "pdf_url"):
                        if item.get(fld) and item[fld] != "—":
                            prev[fld] = item[fld]
                if (not prev.get("record_date") or prev["record_date"] == "—") and item.get("record_date") != "—":
                    prev["record_date"] = item["record_date"]

    # 2. 抓取默认全量 60 页
    first_html = fetch_page_html(1)
    m_total = re.search(r"共\s*<b>\s*(\d+)\s*</b>\s*页", first_html)
    total_pages = min(int(m_total.group(1)), 60) if m_total else 60

    fresh_companies = set()
    for pg in range(1, total_pages + 1):
        if pg > 1:
            time.sleep(0.1)
            try:
                page_html = fetch_page_html(pg)
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    break
                raise
        else:
            page_html = first_html
        rows = _parse_csrc_page_rows(page_html)
        for r in rows:
            fresh_companies.add(r["company"])
        merge_parsed_items(rows)

    print(f"[tutoring] 官网默认列表（{total_pages} 页）抓取完成，本轮覆盖 {len(fresh_companies)} 家")

    # 3. 可选历史时间切片回溯（POST index_f.html / index_{pg}_f.html）
    if backfill:
        slices = [
            ("2015-01-01", "2020-12-31"),
            ("2021-01-01", "2021-06-30"), ("2021-07-01", "2021-12-31"),
            ("2022-01-01", "2022-06-30"), ("2022-07-01", "2022-12-31"),
            ("2023-01-01", "2023-06-30"), ("2023-07-01", "2023-12-31"),
            ("2024-01-01", "2024-06-30"), ("2024-07-01", "2024-12-31"),
            ("2025-01-01", "2025-06-30"), ("2025-07-01", "2025-12-31"),
            ("2026-01-01", "2026-12-31"),
        ]
        for s_dt, e_dt in slices:
            payload = urllib.parse.urlencode({
                "keyWord": "", "keyWord1": "", "isfilter": "1",
                "startDate": s_dt, "endDate": e_dt,
                "startDate2": "", "endDate2": "", "order": "", "by": "",
            }).encode("utf-8")
            try:
                req = urllib.request.Request(
                    "http://eid.csrc.gov.cn/csrcfd/index_f.html",
                    data=payload,
                    headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "Referer": "http://eid.csrc.gov.cn/fd.html"},
                )
                h = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="replace")
                m_p = re.search(r"共\s*<b>\s*(\d+)\s*</b>\s*页", h)
                p_cnt = min(int(m_p.group(1)), 60) if m_p else 1
                merge_parsed_items(_parse_csrc_page_rows(h))
                for pno in range(2, p_cnt + 1):
                    time.sleep(0.08)
                    req_p = urllib.request.Request(
                        f"http://eid.csrc.gov.cn/csrcfd/index_{pno}_f.html",
                        data=payload,
                        headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "Referer": "http://eid.csrc.gov.cn/csrcfd/index_f.html"},
                    )
                    hp = urllib.request.urlopen(req_p, timeout=15).read().decode("utf-8", errors="replace")
                    merge_parsed_items(_parse_csrc_page_rows(hp))
            except Exception as exc:
                print(f"[tutoring] 历史切片 {s_dt}~{e_dt} 跳过: {exc}")

    # 4. 交叉比对 ipo_data.json & neeq_data.json，计算 stage/milestones 与默认字段
    ipo_map, neeq_by_abbr = _load_cross_reference_maps(data_dir)
    all_records = list(merged_map.values())

    for rec in all_records:
        rec["reports"] = _merge_reports(rec.get("reports") or [], [])
        _compute_stage_and_milestones(rec)

        norm_c = normalize_name(rec["company"])
        ipo_hit = ipo_map.get(norm_c)
        rec["ipo_accepted"] = bool(ipo_hit)

        # 板块先根据自身/报告标题推断，再用 IPO 在审库纠正
        all_titles = " ".join([r.get("title", "") for r in rec.get("reports", [])])
        inferred_board = infer_board_from_text(all_titles, default=rec.get("board") or "沪深")
        if ipo_hit:
            inferred_board = "北证" if ipo_hit.get("board") == "北证" else "沪深"
        rec["board"] = inferred_board

        if ipo_hit:
            if (not rec.get("law_firm") or rec.get("law_firm") == "—") and ipo_hit.get("law_firms"):
                lf = "、".join(ipo_hit["law_firms"])
                rec["law_firm"] = lf
                rec["law_firm_short"] = shorten_law_firm(ipo_hit["law_firms"][0])
            if (not rec.get("acct_firm") or rec.get("acct_firm") == "—") and ipo_hit.get("accounting_firms"):
                af = "、".join(ipo_hit["accounting_firms"])
                rec["acct_firm"] = af
                rec["acct_firm_short"] = shorten_acct_firm(ipo_hit["accounting_firms"][0])
            if (not rec.get("industry") or rec.get("industry") == "—") and ipo_hit.get("industry"):
                rec["industry"] = ipo_hit["industry"]

        # 新三板挂牌交叉比对（简称 + 所属省份前缀双校验，防误匹配）
        if not rec.get("neeq_status") or rec.get("neeq_status") == "—":
            bureau_prefix = (rec.get("bureau") or "")[:2]
            for abbr, neeq_row in neeq_by_abbr.items():
                prov = neeq_row.get("province") or ""
                if abbr in rec["company"] and bureau_prefix and bureau_prefix in prov:
                    rec["neeq_status"] = f"于{neeq_row.get('list_date') or ''}在全国中小企业股份转让系统挂牌，证券代码为{neeq_row.get('code')}（{neeq_row.get('tier')}）"
                    break

    # 5. 并发解析未缓存企业 PDF（优先贵州证监局 + 按 update_date 降序最新企业）
    if parse_pdfs_limit and parse_pdfs_limit > 0 and pypdf is not None:
        ensure_macos_ocr_bin()
        if reparse_scanned:
            candidates = [
                r for r in all_records
                if (
                    not r.get("pdf_checked")
                    or not r.get("pdf_parsed")
                    or not r.get("law_firm")
                    or r.get("law_firm") == "—"
                    or not r.get("acct_firm")
                    or r.get("acct_firm") == "—"
                )
            ]
        else:
            candidates = [r for r in all_records if not r.get("pdf_checked")]

        candidates.sort(
            key=lambda x: (
                1 if "贵州" in (x.get("bureau") or "") else 0,
                x.get("update_date") or "",
                x.get("record_date") or "",
            ),
            reverse=True,
        )
        todo = candidates[:parse_pdfs_limit]
        if todo:
            print(f"[tutoring] 开始并发解析 {len(todo)} 家企业的 PDF 备案/进展报告（优先重点辖区与最新项目）...")

            def worker(rec):
                # 优先解析《辅导备案报告》，若没有则退而解析最新《中期进展报告》或《pdf_url》
                filing_urls = [r["pdf_url"] for r in rec.get("reports", []) if r.get("category") == "辅导备案报告" and r.get("pdf_url")]
                other_urls = [r["pdf_url"] for r in rec.get("reports", []) if r.get("category") != "辅导备案报告" and r.get("pdf_url")]
                urls_to_try = filing_urls[:1] + other_urls[:1]
                if not urls_to_try and rec.get("pdf_url"):
                    urls_to_try = [rec["pdf_url"]]

                combined = {}
                for u in urls_to_try:
                    try:
                        parsed = parse_tutoring_pdf_url(u, timeout=14)
                        for k, v in parsed.items():
                            if v and not combined.get(k):
                                combined[k] = v
                        # 如果备案报告已经拿到基本面+律所+会所，无需再下第2份
                        if combined.get("founded_date") and combined.get("law_firm") and combined.get("acct_firm"):
                            break
                    except Exception:
                        continue
                return rec["company"], combined

            parsed_ok = 0
            with ThreadPoolExecutor(max_workers=4) as pool:
                futs = [pool.submit(worker, r) for r in todo]
                for fut in as_completed(futs):
                    comp_name, prof = fut.result()
                    rec = merged_map.get(comp_name)
                    if not rec:
                        continue
                    rec["pdf_checked"] = True
                    if prof.get("_has_text"):
                        rec["pdf_parsed"] = True
                        parsed_ok += 1
                    else:
                        rec["pdf_parsed"] = bool(rec.get("pdf_parsed"))
                    for fld in (
                        "board", "founded_date", "reg_capital", "reg_address",
                        "controlling_shareholder", "industry", "neeq_status",
                        "prev_filing", "law_firm", "law_firm_short",
                        "acct_firm", "acct_firm_short",
                    ):
                        if prof.get(fld) and (not rec.get(fld) or rec.get(fld) in ("—", "无") or fld == "board"):
                            rec[fld] = prof[fld]
            print(f"[tutoring] PDF 解析完成：文本提取成功 {parsed_ok}/{len(todo)} 家（其余扫描件已优雅保留原报告链接）")

    # 6. 确保输出字段整齐、简洁、兼容前端渲染
    for rec in all_records:
        rec.setdefault("board", "沪深")
        rec.setdefault("law_firm", "—")
        rec["law_firm_short"] = rec.get("law_firm_short") or shorten_law_firm(rec["law_firm"])
        rec.setdefault("acct_firm", "—")
        rec["acct_firm_short"] = rec.get("acct_firm_short") or shorten_acct_firm(rec["acct_firm"])
        rec.setdefault("founded_date", "")
        rec.setdefault("reg_address", "")
        rec.setdefault("reg_capital", "")
        rec.setdefault("controlling_shareholder", "")
        rec.setdefault("industry", "")
        rec.setdefault("prev_filing", "")
        rec.setdefault("neeq_status", "")
        rec.setdefault("pdf_parsed", False)
        rec.setdefault("pdf_checked", False)

    all_records.sort(key=lambda x: (x.get("update_date") or "", x.get("record_date") or ""), reverse=True)
    print(f"[tutoring] 证监会辅导公示全量合并完成，共 {len(all_records)} 家企业")
    return all_records


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


def write_tutoring_sharded(data_dir, records):
    """主列表（data/tutoring_data.json/.js）与 16 哈希分片历史报告（data/tutoring_reports/{0..f}.json）拆分写入。"""
    shard_dir = os.path.join(data_dir, "tutoring_reports")
    os.makedirs(shard_dir, exist_ok=True)
    shards = {f"{i:x}": {} for i in range(16)}

    slim_records = []
    total_reports = 0
    for rec in records:
        comp = rec.get("company") or ""
        sh = company_shard(comp)
        reps = rec.get("reports") or []
        total_reports += len(reps)
        shards[sh][comp] = [
            {
                "c": r.get("category") or "辅导备案报告",
                "t": r.get("title") or r.get("type") or "辅导报告",
                "d": r.get("date") or "",
                "p": to_rel_pdf_path(r.get("pdf_url") or ""),
            }
            for r in reps
        ]
        slim = {k: v for k, v in rec.items() if k != "reports"}
        slim["r_shard"] = sh
        slim_records.append(slim)

    for sh, data_map in shards.items():
        sp = os.path.join(shard_dir, f"{sh}.json")
        with open(sp, "w", encoding="utf-8") as sf:
            json.dump(data_map, sf, ensure_ascii=False)

    write_pair(data_dir, "tutoring_data", "__TUTORING_DATA__", slim_records)
    print(f"[tutoring] 报告分片写入完成：16 个分片共 {total_reports} 份历史报告 -> {shard_dir}")


def main():
    parser = argparse.ArgumentParser(description="二期第 2 周数据采集脚本（新三板 + 全市场辅导备案 + PDF 解析）")
    parser.add_argument("--parse-pdfs", type=int, default=120, help="本次最多新解析多少家企业的 PDF 报告，默认 120")
    parser.add_argument("--backfill", action="store_true", help="是否同时执行 eid.csrc.gov.cn 时间切片回溯")
    parser.add_argument("--only-tutoring", action="store_true", help="仅更新辅导备案，跳过新三板采集")
    parser.add_argument("--reparse-scanned", action="store_true", help="使用本地 OCR 重新解析之前未识别出的扫描件或缺失律所/会所的项目")
    args = parser.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(root, "data")
    os.makedirs(data_dir, exist_ok=True)

    if not args.only_tutoring:
        try:
            nget = create_neeq_client()
            neeq_records, _ = fetch_neeq_records(nget)
            if neeq_records:
                write_pair(data_dir, "neeq_data", "__NEEQ_DATA__", neeq_records)
        except Exception as exc:
            print(f"[neeq] 采集失败: {exc}", file=sys.stderr)
            sys.exit(1)

    try:
        tutoring_records = fetch_tutoring_records(
            data_dir,
            backfill=args.backfill,
            parse_pdfs_limit=args.parse_pdfs,
            reparse_scanned=args.reparse_scanned,
        )
        if tutoring_records:
            write_tutoring_sharded(data_dir, tutoring_records)
    except Exception as exc:
        print(f"[tutoring] 采集失败: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
