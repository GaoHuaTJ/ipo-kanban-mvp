#!/usr/bin/env python3
"""
全站券商名称统一规范化模块。
将各地证监局、三大交易所、东财、股转系统返回的多样化券商名称（全称、子公司名、承销保荐子公司名等）
统一规范化为全站通用的标准四字简称（太平洋证券保留五字避免歧义）。
"""

import re

BROKER_ALIAS_MAP = {
    "中国国际金融": "中金公司",
    "中国国际金融证券": "中金公司",
    "中金": "中金公司",
    "中金公司": "中金公司",
    "中信建投证券": "中信建投",
    "中信建投": "中信建投",
    "华泰联合证券": "华泰联合",
    "华泰联合": "华泰联合",
    "华泰证券": "华泰证券",
    "国泰海通证券": "国泰海通",
    "国泰海通": "国泰海通",
    "国泰君安证券": "国泰君安",
    "国泰君安": "国泰君安",
    "国联民生证券": "国联民生",
    "国联民生": "国联民生",
    "申万宏源证券": "申万宏源",
    "申万宏源": "申万宏源",
    "第一创业证券": "第一创业",
    "第一创业": "第一创业",
    "中国银河证券": "银河证券",
    "中国银河": "银河证券",
    "银河证券": "银河证券",
    "中银国际证券": "中银证券",
    "中银国际": "中银证券",
    "中银证券": "中银证券",
    "东亚前海证券": "东亚前海",
    "东亚前海": "东亚前海",
    "东方花旗证券": "东方花旗",
    "东方花旗": "东方花旗",
    "中国民族证券": "民族证券",
    "民族证券": "民族证券",
    "中天国富证券": "中天国富",
    "中天国富": "中天国富",
    "恒泰长财证券": "恒泰长财",
    "恒泰长财": "恒泰长财",
    "瑞信方正证券": "瑞信方正",
    "瑞信方正": "瑞信方正",
    "瑞信证券": "瑞信证券",
    "大和证券": "大和证券",
    "金圆统一证券": "金圆统一",
    "金圆统一": "金圆统一",
    "长城国瑞证券": "长城国瑞",
    "长城国瑞": "长城国瑞",
    "高盛高华证券": "高盛高华",
    "高盛高华": "高盛高华",
    "高盛证券": "高盛中国",
    "高盛中国": "高盛中国",
    "汇丰前海证券": "汇丰前海",
    "汇丰前海": "汇丰前海",
    "野村东方国际证券": "野村东方",
    "野村东方": "野村东方",
    "摩根大通证券": "摩根大通",
    "摩根大通": "摩根大通",
    "摩根士丹利华鑫证券": "摩根士丹利",
    "摩根士丹利证券": "摩根士丹利",
    "摩根士丹利": "摩根士丹利",
    "东方": "东方证券",
    "方正": "方正证券",
    "长江": "长江证券",
    "太平洋": "太平洋证券",
    "太平洋证券": "太平洋证券",
}

_SPLIT_RE = re.compile(r"[,，、;；]+")
_REGION_SUFFIX_RE = re.compile(r"[（(](?:中国|亚洲|上海|深圳|北京)[）)]$")


def _normalize_single_broker(raw):
    s = str(raw or "").strip()
    if not s or s in ("—", "-", "无", "--"):
        return s

    # 清理补充简称标注、空白、承销保荐子公司与公司法后缀
    s = re.sub(r"[（(]以下.*?[）)]", "", s)
    s = re.sub(r"\s+", "", s)
    s = s.replace("(", "（").replace(")", "）")

    for pat in ("证券承销保荐有限责任公司", "证券承销保荐有限公司", "证券承销保荐"):
        if pat in s:
            s = s.replace(pat, "证券")

    s = re.sub(r"(?:保荐有限责任公司|股份有限公司|有限责任公司|有限公司)$", "", s)
    s = _REGION_SUFFIX_RE.sub("", s).strip()

    if s in BROKER_ALIAS_MAP:
        return BROKER_ALIAS_MAP[s]

    # 兜底：清理后仍为“XXXX证券”（6字，非太平洋证券）时截取前4字
    if len(s) == 6 and s.endswith("证券") and s != "太平洋证券":
        core = s[:-2]
        return BROKER_ALIAS_MAP.get(core, core)

    return s


def normalize_broker(raw):
    """将单个或多个逗号/顿号分隔的券商名称统一规范化并去重。"""
    txt = str(raw or "").strip()
    if not txt or txt in ("—", "-", "无", "--"):
        return txt
    parts = [p.strip() for p in _SPLIT_RE.split(txt) if p.strip()]
    out = []
    seen = set()
    for p in parts:
        norm = _normalize_single_broker(p)
        if norm and norm not in seen:
            seen.add(norm)
            out.append(norm)
    return "、".join(out) if out else txt


def normalize_broker_list(items):
    """将券商列表规范化并保持顺序去重。"""
    if not items:
        return []
    out = []
    seen = set()
    for item in items:
        for p in _SPLIT_RE.split(str(item or "")):
            norm = _normalize_single_broker(p)
            if norm and norm not in ("—", "-", "无", "--") and norm not in seen:
                seen.add(norm)
                out.append(norm)
    return out
