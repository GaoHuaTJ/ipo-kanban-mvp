#!/usr/bin/env python3
"""
生成用于 MVP 第一版开箱即用演示的 A股IPO 在审快照数据。
统计维度与数量对齐截图（共 374 家在审），便于立刻预览全景图与审核动态的全部交互。
运行 scripts/fetch_ipo_data.py 可一键替换为当日真实公开数据。
"""

import json
import os
import random
from datetime import datetime, timedelta

random.seed(20261121)

# 精确对齐截图中的 [审核阶段 x 板块] 矩阵（合计 374 家）
MATRIX = {
    "受理":     {"沪主板": 2,  "科创板": 1,  "深主板": 1,  "创业板": 1,  "北证": 0},
    "问询":     {"沪主板": 7,  "科创板": 25, "深主板": 3,  "创业板": 24, "北证": 91},
    "上市委":   {"沪主板": 0,  "科创板": 0,  "深主板": 0,  "创业板": 2,  "北证": 5},
    "提交注册": {"沪主板": 1,  "科创板": 1,  "深主板": 0,  "创业板": 3,  "北证": 21},
    "中止":     {"沪主板": 9,  "科创板": 39, "深主板": 12, "创业板": 49, "北证": 77},
}

# 对齐截图热力图省份分布（总计 374）
PROVINCE_COUNTS = [
    ("广东省", 81),
    ("江苏省", 64),
    ("浙江省", 55),
    ("上海市", 32),
    ("北京市", 27),
    ("山东省", 20),
    ("安徽省", 13),
    ("四川省", 12),
    ("湖南省", 10),
    ("湖北省", 9),
    ("辽宁省", 7),
    ("天津市", 7),
    ("福建省", 6),
    ("河南省", 5),
    ("河北省", 5),
    ("陕西省", 5),
    ("重庆市", 5),
    ("江西省", 3),
    ("甘肃省", 2),
    ("新疆维吾尔自治区", 1),
    ("西藏自治区", 1),
    ("内蒙古自治区", 1),
    ("黑龙江省", 1),
    ("吉林省", 1),
    ("海南省", 1),
]

SPONSORS = [
    ("中信证券", 38), ("中信建投", 31), ("国泰海通", 29), ("华泰联合", 26),
    ("中金公司", 24), ("招商证券", 21), ("国金证券", 19), ("民生证券", 18),
    ("申万宏源", 17), ("东方证券", 15), ("广发证券", 15), ("兴业证券", 14),
    ("开源证券", 14), ("东吴证券", 13), ("国信证券", 13), ("长江保荐", 11),
    ("光大证券", 10), ("浙商证券", 10), ("中泰证券", 9), ("安信证券", 9),
    ("平安证券", 8), ("国投证券", 8), ("东兴证券", 7), ("方正承销", 6),
    ("五矿证券", 5), ("西部证券", 4),
]

LAW_FIRMS = [
    ("国浩律师事务所", 44), ("中伦律师事务所", 39), ("锦天城律师事务所", 36),
    ("金杜律师事务所", 31), ("德恒律师事务所", 28), ("康达律师事务所", 25),
    ("天元律师事务所", 22), ("君合律师事务所", 21), ("嘉源律师事务所", 19),
    ("国枫律师事务所", 18), ("信达律师事务所", 17), ("竞天公诚律师事务所", 15),
    ("通商律师事务所", 13), ("汉坤律师事务所", 12), ("海润天睿律师事务所", 11),
    ("大成律师事务所", 10), ("启元律师事务所", 8), ("世纪同仁律师事务所", 5),
]

ACCOUNTING_FIRMS = [
    ("天健会计师事务所", 62), ("立信会计师事务所", 58), ("容诚会计师事务所", 54),
    ("信永中和会计师事务所", 35), ("大华会计师事务所", 28), ("中汇会计师事务所", 26),
    ("天职国际会计师事务所", 24), ("致同会计师事务所", 22), ("毕马威华振会计师事务所", 17),
    ("安永华明会计师事务所", 16), ("德勤华永会计师事务所", 14), ("大信会计师事务所", 11),
    ("中审众环会计师事务所", 7),
]

INDUSTRIES = [
    "计算机、通信和其他电子设备制造业",
    "专用设备制造业",
    "软件和信息技术服务业",
    "通用设备制造业",
    "化学原料和化学制品制造业",
    "电气机械和器材制造业",
    "医药制造业",
    "汽车制造业",
    "仪器仪表制造业",
    "新材料及高端制造",
]

PREFIXES = [
    "华芯", "智联", "科瑞", "精工", "蓝海", "光启", "新源", "中微", "润泽", "博创",
    "汇川", "联创", "赛诺", "天合", "迈瑞", "锐科", "晶晨", "盛美", "长川", "拓荆",
    "思瑞", "纳芯", "兆易", "卓胜", "韦尔", "澜起", "安集", "沪硅", "北方", "中科",
    "国盾", "寒武", "极米", "石头", "科沃", "亿纬", "欣旺", "德方", "容百", "恩捷",
]

SUFFIXES = [
    "半导体股份有限公司", "精密制造股份有限公司", "智能装备股份有限公司",
    "新材料科技股份有限公司", "生物医药股份有限公司", "光电科技股份有限公司",
    "微电子股份有限公司", "新能源科技股份有限公司", "信息技术股份有限公司",
    "自动化设备股份有限公司", "仪器仪表股份有限公司", "医疗科技股份有限公司",
]

EXCHANGE_MAP = {
    "沪主板": ("上交所", "https://listing.sse.com.cn/"),
    "科创板": ("上交所", "https://listing.sse.com.cn/"),
    "深主板": ("深交所", "https://listing.szse.cn/"),
    "创业板": ("深交所", "https://listing.szse.cn/"),
    "北证":   ("北交所", "https://www.bse.cn/audit/project_news.html"),
}


def weighted_choice(items):
    names = [x[0] for x in items]
    weights = [x[1] for x in items]
    return random.choices(names, weights=weights, k=1)[0]


def main():
    provinces_pool = []
    for prov, cnt in PROVINCE_COUNTS:
        provinces_pool.extend([prov] * cnt)
    random.shuffle(provinces_pool)

    base_date = datetime(2026, 11, 21)
    records = []
    idx = 0

    for stage, boards in MATRIX.items():
        for board, count in boards.items():
            for _ in range(count):
                prov = provinces_pool[idx]
                short_prov = prov.replace("省", "").replace("市", "").replace("维吾尔自治区", "").replace("自治区", "")
                company = f"{short_prov}{PREFIXES[idx % len(PREFIXES)]}{SUFFIXES[(idx * 3) % len(SUFFIXES)]}"

                accept_delta = random.randint(25, 650)
                update_delta = random.randint(0, min(accept_delta, 120))
                accept_date = (base_date - timedelta(days=accept_delta)).strftime("%Y-%m-%d")
                update_date = (base_date - timedelta(days=update_delta)).strftime("%Y-%m-%d")

                sponsor_1 = weighted_choice(SPONSORS)
                # 约 8% 为联合保荐
                if random.random() < 0.08:
                    sponsor_2 = weighted_choice(SPONSORS)
                    sponsors = [sponsor_1, sponsor_2] if sponsor_2 != sponsor_1 else [sponsor_1]
                else:
                    sponsors = [sponsor_1]

                law_firm = weighted_choice(LAW_FIRMS)
                acc_firm = weighted_choice(ACCOUNTING_FIRMS)
                exchange, url = EXCHANGE_MAP[board]

                records.append({
                    "id": f"IPO-{20260001 + idx}",
                    "company": company,
                    "board": board,
                    "exchange": exchange,
                    "stage": stage,
                    "raw_status": f"{stage}（在审）",
                    "province": prov,
                    "industry": random.choice(INDUSTRIES),
                    "sponsors": sponsors,
                    "law_firms": [law_firm],
                    "accounting_firms": [acc_firm],
                    "accept_date": accept_date,
                    "update_date": update_date,
                    "plan_raise_yi": round(random.uniform(2.5, 45.0), 2),
                    "source_url": url,
                })
                idx += 1

    # 按更新日期倒序
    records.sort(key=lambda r: r["update_date"], reverse=True)

    payload = {
        "meta": {
            "update_date": "2026-11-21",
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "data_source": "demo_snapshot",
            "data_source_label": "演示快照（运行 scripts/fetch_ipo_data.py 可同步官方实时数据）",
            "total": len(records),
        },
        "records": records,
    }

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(root, "data")
    os.makedirs(data_dir, exist_ok=True)

    json_path = os.path.join(data_dir, "ipo_data.json")
    js_path = os.path.join(data_dir, "ipo_data.js")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    with open(js_path, "w", encoding="utf-8") as f:
        f.write("window.__IPO_DATA__ = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")

    print(f"已生成 {len(records)} 条演示数据 -> {json_path} & {js_path}")


if __name__ == "__main__":
    main()
