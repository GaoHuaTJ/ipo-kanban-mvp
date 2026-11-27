#!/usr/bin/env python3
"""
港股 IPO 与中国证监会境外上市备案数据采集脚本（零成本官方直连版）

数据源：
1. 香港交易所披露易（HKEXnews）EDS 官方 JSON（主板 + GEM 处理中、已聆讯、已上市、失效、撤回/被拒、被发回）
2. 中国证监会（CSRC）《境内企业境外发行证券和上市备案情况表（首次公开发行及全流通）》Excel 及备案通知书
3. 本地 A 股 IPO 库（data/ipo_data.json）及东方财富 A 股列表（用于 A+H 与境内总部省份识别）

输出：
- data/hk_ipo_data.json（供前端按需懒加载）
- data/hk_ipo_data.js（兼容 file:// 本地直接打开）
"""

from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT_DIR, "data")
OUT_JSON = os.path.join(DATA_DIR, "hk_ipo_data.json")
OUT_JS = os.path.join(DATA_DIR, "hk_ipo_data.js")
A_SHARE_JSON = os.path.join(DATA_DIR, "ipo_data.json")

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

HKEX_BASE = "https://www1.hkexnews.hk/ncms/json/eds/"
HKEX_APP_BASE = "https://www1.hkexnews.hk/app/"
CSRC_SEARCH_API = (
    "https://www.csrc.gov.cn/searchList/8d1c236a98924e38a854bbb9f215efb9"
    "?_isAgg=true&_isJson=true&_pageSize={size}&_template=index&page={page}"
)

# 常用繁体 -> 简体字符映射（成对定义，绝不错位）
_T2S_PAIRS = '萬万與与專专業业叢丛東东絲丝兩两嚴严喪丧個个臨临為为麗丽舉举義义烏乌樂乐喬乔習习鄉乡書书買买亂乱爭争於于虧亏雲云亞亚產产親亲億亿僅仅從从倉仓儀仪們们價价眾众優优會会傘伞偉伟傳传傷伤倫伦偽伪伯伯體体餘余佛佛作作佩佩佳佳併并來来例例供供保保信信修修俱俱倍倍倒倒候候借借値值假假偏偏停停健健側侧偶偶偷偷償偿儲储兒儿允允元元兄兄充充兆兆先先光光克克免免兌兑黨党入入全全八八公公六六共共關关興兴兵兵其其具具典典養养兼兼內内再再冒冒冠冠冬冬冰冰冷冷准准凋凋凌凌凝凝幾几凡凡鳳凤憑凭凱凯出出擊击函函刀刀分分切切刊刊列列初初判判別别利利刪删到到制制刷刷券券刺刺刻刻則则削削前前剔剔剛刚剝剥剩剩剪剪副副割割創创劃划劇剧劉刘劍剑劑剂力力功功加加助助努努劫劫勁劲勞劳勝胜募募勢势勤勤勳勋勸劝勺勺勾勾勿勿包包化化北北匹匹區区十十千千升升午午半半華华協协卒卒單单賣卖南南博博占占卡卡印印危危即即卻却卷卷廠厂廳厅歷历厲厉壓压厭厌去去縣县參参又又及及友友反反叔叔取取受受變变敘叙口口古古句句另另只只叫叫召召可可台台史史右右司司吃吃各各合合吉吉同同名名後后吐吐向向君君呈呈告告員员週周味味呼呼命命和和品品哲哲唐唐唯唯唱唱商商問问啟启啓启單单圖图團团園园困困圍围固固國国圓圆圈圈土土在在圭圭地地場场均均坊坊堅坚堆堆堡堡堪堪報报塑塑塔塔塗涂塞塞填填境境增增墨墨壁壁壓压壘垒壞坏士士壯壮壽寿夏夏夕夕外外多多夜夜夠够夢梦夥伙大大太太夫夫央央失失頭头夷夷誇夸夾夹奪夺奇奇奈奈奉奉奮奋女女好好如如妝妆妥妥威威娛娱娜娜婦妇媒媒子子孔孔字字存存孫孙學学宅宅宇宇守守安安完完宏宏宗宗官官定定宜宜寶宝實实客客宣宣室室宮宫害害家家容容宿宿寂寂寄寄密密富富寒寒察察寧宁審审寫写寬宽寵宠將将專专尊尊尋寻對对導导小小少少尖尖尚尚尤尤就就尼尼尾尾局局居居屆届屋屋展展屬属山山歲岁豈岂崗岗嵐岚島岛峽峡峰峰峻峻崇崇崎崎崖崖川川州州巡巡工工左左巧巧巨巨差差己己已已巴巴巷巷市市布布帥帅師师希希帳帐帶带常常幅幅幕幕幣币幫帮幹干平平年年幸幸幼幼廣广莊庄慶庆庇庇床床序序底底店店府府度度座座庫库庭庭康康庸庸廉廉廊廊廢废延延建建開开異异棄弃弄弄弊弊式式引引弘弘弟弟張张強强彈弹歸归當当錄录形形彩彩彰彰影影役役彼彼往往征征待待很很律律後后徒徒得得從从復复微微德德徹彻心心必必忍忍志志忘忘忙忙忠忠快快念念忽忽懷怀態态怒怒思思急急性性怨怨怪怪總总恆恒恐恐恢恢恥耻恨恨恩恩恭恭息息悅悦悉悉悔悔悟悟患患悲悲情情惑惑惜惜惠惠惡恶惱恼想想愁愁愈愈愉愉意意愚愚愛爱感感慈慈態态慌慌慎慎慕慕慢慢慧慧慨慨慮虑慰慰慶庆憂忧憐怜憑凭憲宪憶忆懂懂應应懷怀成成我我戒戒戰战截截戲戏戴戴戶户房房所所手手才才扎扎撲扑打打托托扣扣執执擴扩掃扫揚扬扭扭扯扯批批找找承承技技抄抄把把抑抑抓抓投投抗抗折折拋抛報报披披抬抬抱抱抵抵抹抹押押抽抽擔担拆拆拉拉拍拍拐拐拒拒拓拓拔拔拖拖拘拘招招拜拜擬拟擁拥攔拦撥拨擇择括括拳拳拿拿持持指指按按挑挑挖挖振振挺挺挽挽挾挟插插搜搜搞搞搬搬搭搭搶抢攜携攝摄擺摆搖摇攤摊摘摘摩摩摸摸擴扩撤撤播播撫抚撰撰撲扑擊击擋挡操操擎擎擔担據据擠挤擦擦攀攀攏拢支支收收改改攻攻放放政政故故效效敵敌敏敏救救敗败敘叙教教敢敢散散敬敬數数整整文文斗斗料料斤斤斥斥斷断新新方方於于施施旁旁旅旅旋旋族族旗旗既既日日旦旦舊旧旨旨早早旬旬旭旭旺旺昂昂昆昆昌昌明明易易昔昔星星映映春春昨昨昭昭是是時时晃晃晉晋晏晏晚晚晝昼晨晨普普景景晴晴晶晶智智暫暂暑暑暖暖暗暗暮暮曆历曉晓曠旷曲曲更更書书曹曹曾曾替替最最會会月月有有朋朋服服朗朗望望朝朝期期木木未未末末本本術术朱朱樸朴朵朵機机殺杀雜杂權权條条來来楊杨杭杭杯杯杰杰東东松松板板極极構构析析林林果果枝枝樞枢棗枣槍枪枯枯架架柏柏某某染染柔柔柱柱查查柳柳柴柴柵栅標标棟栋欄栏樹树棲栖樣样校校株株核核根根格格栽栽桂桂桃桃框框案案桌桌桑桑檔档橋桥梅梅梨梨梯梯械械梳梳檢检棉棉棋棋棍棍棒棒棕棕棗枣棘棘棚棚森森棱棱棵棵植植物物業业極极楷楷樓楼概概榜榜榮荣構构樂乐樑梁樞枢樸朴樹树樺桦橫横櫻樱欄栏欠欠次次欣欣欲欲欺欺款款歐欧正正此此步步武武歧歧歸归死死殘残段段殺杀殼壳母母每每毒毒比比毛毛氏氏民民氣气水水永永求求江江池池污污湯汤汪汪汰汰汽汽沈沈沉沉沙沙沛沛沒没沖冲河河沸沸油油治治沼沼沿沿況况泉泉泊泊法法泛泛泡泡波波泣泣泥泥注注淚泪泰泰泳泳泵泵洋洋洗洗洛洛洞洞津津洪洪洲洲活活洽洽派派流流淺浅漿浆測测濟济瀏览渾浑濃浓浙浙浚浚浦浦浩浩浪浪浮浮浴浴海海浸浸塗涂消消涉涉涌涌液液涵涵涼凉淑淑淚泪淡淡淨净深深混混添添清清淺浅減减測测港港游游湖湖湘湘湯汤源源準准溪溪溫温溯溯滅灭滋滋滑滑滌涤滾滚滿滿漁渔漂漂漆漆漏漏演演漠漠漢汉漫漫漲涨漸渐潔洁潘潘潛潜潤润潮潮潰溃澄澄澆浇澈澈澤泽澳澳激激濃浓濁浊澱淀澡澡澤泽濱滨濟济濠濠濤涛濫滥濱滨濺溅濾滤瀆渎瀉泻瀋沈瀑瀑瀏浏灌灌灑洒火火灰灰靈灵灶灶災灾炎炎炒炒炊炊炭炭炮炮點点為为無无焦焦然然燒烧煙烟照照煩烦煮煮熊熊熟熟熱热燃燃燈灯營营燥燥燦灿燭烛爆爆爐炉爛烂爭争爬爬愛爱父父爽爽片片版版牌牌牙牙牛牛物物牧牧牲牲特特牽牵犀犀犧牺犬犬犯犯狀状狂狂狐狐狗狗狠狠獨独狹狭獅狮獄狱獵猎獸兽玄玄率率玉玉王王玩玩玫玫環环現现玲玲玻玻珊珊珍珍珠珠班班球球理理琉琉琢琢琳琳琴琴琶琶瑞瑞瑟瑟瑰瑰瑤瑶璽玺瓊琼瓜瓜瓦瓦瓶瓶甘甘甚甚甜甜生生產产用用田田由由甲甲申申電电男男畫画界界留留畢毕略略番番異异當当疆疆疏疏疑疑療疗疫疫瘋疯病病症症痕痕痛痛痴痴瘍疡癌癌登登發发白白百百皆皆皇皇皮皮盈盈益益監监盒盒蓋盖盤盘盛盛盟盟盡尽盧卢目目直直相相盼盼盾盾省省眉眉看看真真眠眠眼眼眾众著著睜睁睛睛睡睡督督睦睦瞧瞧瞭了矛矛矢矢知知矩矩短短矮矮石石研研碎碎碗碗碟碟碧碧碩硕碰碰確确碼码磁磁磨磨磚砖示示社社祖祖神神祥祥票票祭祭禁禁祿禄福福禮礼禱祷秀秀私私秋秋科科秒秒秘秘租租秤秤秦秦秧秧秩秩積积稱称移移稅税程程稍稍種种稿稿穀谷穎颖穗穗穩稳穫获穴穴究究窮穷空空穿穿突突窗窗窯窑立立站站競竞章章童童端端竹竹笑笑筆笔笛笛符符第第等等筋筋策策答答簡简算算管管箭箭箱箱節节範范篇篇築筑篩筛簽签籌筹籍籍籃篮籠笼米米類类粉粉粒粒粗粗粘粘糧粮精精糊糊糕糕糖糖糟糟系系糾纠紀纪約约紅红納纳紐纽純纯紙纸級级紛粉素素索索紫紫紮扎累累細细紳绅紹绍絡络給给絨绒統统絲丝絹绢綁绑經经綜综綠绿維维綱网綴缀綵彩編编緩缓緬缅緯纬練练締缔緣缘縣县縫缝縮缩縱总績绩繁繁繃绷織织繞绕繪绘繳缴繼继續续羊羊美美羞羞群群義义羽羽翁翁翅翅翔翔翠翠耀耀老老考考者者而而耐耐耕耕耗耗耳耳聊聊聯联聘聘聚聚聞闻聰聪聲声職职聽听肅肃肉肉肖肖肚肚股股肥肥肩肩肯肯育育肺肺胃胃背背胎胎胖胖胞胞胡胡胸胸能能脆脆脈脉脊脊腦脑腳脚脫脱臉脸脾脾臘腊腐腐腕腕腥腥腫肿腰腰腹腹腿腿膏膏膚肤膜膜膝膝膠胶膨膨膩腻臣臣臥卧臨临自自臭臭至至致致臺台與兴舉举舊旧舌舌舍舍舒舒舞舞舟舟航航般般艦舰船船良良色色節节艾艾芝芝花花芳芳芽芽蒼苍蘇苏苑苑苗苗若若苦苦英英茂茂范范茄茄茅茅茶茶草草荒荒荷荷莊庄莫莫萊莱蓮莲獲获菜菜華华菱菱菲菲萌萌萍萍萎萎萬万落落葉叶著著葛葛葡葡董董葦苇葬葬蔥葱葵葵蒂蒂蒙蒙蒜蒜蓋盖蒸蒸蓄蓄蓉蓉蓬蓬蓰蓰藍蓝藏藏藝艺藥药藤藤蘋苹蘭兰虎虎處处虛虚號号虧亏蟲虫虹虹蚊蚊蛋蛋蛙蛙蜂蜂蛾蛾蜜蜜融融螺螺蟹蟹蟻蚁蠅蝇衛卫衝冲衣衣表表袋袋袍袍袖袖被被裁裁裂裂裝装裡里裔裔裕裕補补製制複复褲裤西西要要覆覆見见規规視视親亲覺觉覽览觀观角角解解觸触言言訂订計计訊讯討讨讓让訓训記记託托設设許许訴诉診诊註注證证評评詞词詢询試试詩诗話话該该詳详誇夸誌志認认誓誓誕诞誘诱語语誠诚誤误說说誰谁課课調调談谈請请諒谅論论諸诸諾诺謀谋謂谓講讲謝谢識识譜谱警警譯译議议護护譽誉讀读讚赞谷谷豆豆象象豪豪豬猪貌貌貝贝貞负財财貢贡貧贫貨货販贩貪贪貫贯責责貯贮貴贵貶贬買买貸贷費费貼贴賀贺資资賈贾賊贼賑赈賓宾賜赏賠赔賢贤賣卖賦赋質质賬账賭赌賴赖賺赚購购賽赞贈赠贏赢赤赤赫赫走走赴赴起起趁趁超超越越趨趋足足距距跟跟跡迹路路跳跳踏踏踐践踢踢踩踩躍跃身身車车軌轨軍军軒轩軟软較较載载輔辅輕轻輛辆輝辉輩辈輪轮輯辑輸输轉转轄辖轍辙辛辛辭辞辦办辨辩辯辩農农迅迅迎迎近近返还這这進进遠远違违連连追追退退送送適适逃逃選选遜逊遞递遙遥遭遭遮遮遲迟遷迁遺遗避避還还邁迈邀邀邊边邏逻那那邦邦邪邪郵邮郎郎部部郭郭都都鄉乡鄙鄙鄭郑鄰邻鄧邓酒酒配配酌酌醫医醬酱釀酿采采釋释里里重重野野量量金金針针釘钉釜釜鈣钙鈍钝鈔钞鐘钟鋼钢欽钦鈞钩鈕钮銀银銅铜銘铭銜衔銷销鋁铝鋒锋鋅锌銳锐錯错錫锡錄录錢钱錦锦錨锚鍋锅鍛锻鍵键鍾钟鎖锁鎮镇鏡镜鐵铁鑒鉴鑑鉴長长門门閃闪閉闭開开閏闰閑闲間间閘阁閱阅閹阉閻阎閾阈闊阔雙双雜杂雞鸡離离難难雨雨雪雪零零雷雷電电需需震震霧雾露露霸霸霹霹靂雳靈灵青青靜静非非靠靠面面革革鞋鞋鞏巩音音韻韵響响頁页頂顶頃项項项順顺須须預预頑顽頓顿頗颇領领頸颈頻频顆颗題题額额顏颜願愿類类顧顾顯显風风飄飘飛飞食食飯饭飲饮飾饰飽饱飼饲餅饼養养餐餐餘余館馆首首香香馬马駐驻駕驾駛驶駝驼駁驳驗验騎骑騙骗騷骚驅驱驕骄驚惊骨骨體体高高髮发鬆松鬥斗鬧闹鬱郁鬼鬼魂魂魅魔魚鱼魯鲁鮮鲜鯉鲤鯊鲨鯨鲸鳥鸟鳴鸣鳳凤鴉鸭鴨鸭鴻鸿鵝鹅鶴鹤鷹鹰鹿鹿麥麦麻麻黃黄黎黎黑黑默默點点鼓鼓鼠鼠鼻鼻齊齐齒齿齡龄龍龙龜龟'
T2S_MAP = str.maketrans({_T2S_PAIRS[i]: _T2S_PAIRS[i + 1] for i in range(0, len(_T2S_PAIRS), 2)})

PROVINCE_KEYWORDS = [
    ("北京", "北京"), ("上海", "上海"), ("天津", "天津"), ("重庆", "重庆"),
    ("广东", "广东"), ("深圳", "广东"), ("广州", "广东"), ("珠海", "广东"),
    ("佛山", "广东"), ("东莞", "广东"), ("惠州", "广东"), ("中山", "广东"),
    ("江苏", "江苏"), ("南京", "江苏"), ("苏州", "江苏"), ("无锡", "江苏"),
    ("常州", "江苏"), ("南通", "江苏"), ("扬州", "江苏"), ("徐州", "江苏"),
    ("浙江", "浙江"), ("杭州", "浙江"), ("宁波", "浙江"), ("温州", "浙江"),
    ("嘉兴", "浙江"), ("绍兴", "浙江"), ("台州", "浙江"), ("金华", "浙江"),
    ("山东", "山东"), ("青岛", "山东"), ("济南", "山东"), ("烟台", "山东"), ("威海", "山东"),
    ("四川", "四川"), ("成都", "四川"), ("绵阳", "四川"),
    ("湖北", "湖北"), ("武汉", "湖北"), ("宜昌", "湖北"),
    ("湖南", "湖南"), ("长沙", "湖南"), ("株洲", "湖南"),
    ("福建", "福建"), ("厦门", "福建"), ("福州", "福建"), ("泉州", "福建"), ("宁德", "福建"),
    ("安徽", "安徽"), ("合肥", "安徽"), ("芜湖", "安徽"),
    ("陕西", "陕西"), ("西安", "陕西"),
    ("河南", "河南"), ("郑州", "河南"), ("洛阳", "河南"),
    ("河北", "河北"), ("石家庄", "河北"), ("保定", "河北"), ("廊坊", "河北"),
    ("辽宁", "辽宁"), ("沈阳", "辽宁"), ("大连", "辽宁"),
    ("江西", "江西"), ("南昌", "江西"), ("赣州", "江西"),
    ("广西", "广西"), ("南宁", "广西"), ("柳州", "广西"),
    ("云南", "云南"), ("昆明", "云南"),
    ("贵州", "贵州"), ("贵阳", "贵州"),
    ("山西", "山西"), ("太原", "山西"),
    ("黑龙江", "黑龙江"), ("哈尔滨", "黑龙江"),
    ("吉林", "吉林"), ("长春", "吉林"),
    ("海南", "海南"), ("海口", "海南"), ("三亚", "海南"),
    ("内蒙古", "内蒙古"), ("新疆", "新疆"), ("宁夏", "宁夏"),
    ("青海", "青海"), ("西藏", "西藏"), ("甘肃", "甘肃"), ("兰州", "甘肃"),
]


def to_simplified(text: str) -> str:
    return (text or "").translate(T2S_MAP)


def normalize_company_key(name: str) -> str:
    s = to_simplified(name or "")
    s = re.sub(r"\s*[-－—]\s*[BWPCS]\s*$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"[（()）\[\]【】\s·.,，、\-—_/]", "", s)
    return s.lower()


def fetch_bytes(url: str, timeout: int = 25) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fetch_json(url: str, timeout: int = 25) -> Any:
    return json.loads(fetch_bytes(url, timeout=timeout).decode("utf-8", errors="ignore"))


def parse_hkex_date(d_str: str) -> str:
    s = (d_str or "").strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        day, mon, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{yr:04d}-{mon:02d}-{day:02d}"
    m2 = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if m2:
        return f"{int(m2.group(1)):04d}-{int(m2.group(2)):02d}-{int(m2.group(3)):02d}"
    return ""


def parse_excel_serial_date(val: str) -> str:
    s = str(val or "").strip()
    if not s:
        return ""
    if re.match(r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}$", s):
        return s.replace("/", "-")
    try:
        num = float(s)
        if 30000 <= num <= 65000:
            base = dt.date(1899, 12, 30)
            return (base + dt.timedelta(days=int(num))).strftime("%Y-%m-%d")
    except ValueError:
        pass
    return ""


def extract_tags_and_clean_name(raw_name: str) -> Tuple[str, List[str]]:
    name = (raw_name or "").strip()
    tags: List[str] = []
    # 港交所特殊标识后缀：- B (18A), - P (18C), - W (WVR), - S (二次上市)
    m = re.search(r"\s*[-－—]\s*([BWPCS])\s*$", name, flags=re.IGNORECASE)
    if m:
        code = m.group(1).upper()
        name = name[: m.start()].strip()
        if code == "B":
            tags.append("18A")
        elif code == "P":
            tags.append("18C")
        elif code == "W":
            tags.append("WVR")
        elif code == "S":
            tags.append("二次上市")
    return name, tags


def extract_hkex_docs_and_dates(item: Dict[str, Any]) -> Tuple[str, str, List[Dict[str, str]]]:
    all_dates: List[str] = []
    d_main = parse_hkex_date(item.get("d", ""))
    if d_main:
        all_dates.append(d_main)
    if item.get("rd"):
        rd = parse_hkex_date(item["rd"])
        if rd:
            all_dates.append(rd)

    docs: List[Dict[str, str]] = []
    seen_urls = set()
    for bucket in (item.get("ls") or []) + (item.get("ps") or []):
        if not isinstance(bucket, dict):
            continue
        bd = parse_hkex_date(bucket.get("d", ""))
        if bd:
            all_dates.append(bd)
        title_parts = [to_simplified(bucket.get("nF", "")), to_simplified(bucket.get("nS1", ""))]
        title = " · ".join([p for p in title_parts if p and p not in ("全文档案", "多档案")])
        if not title:
            title = to_simplified(bucket.get("nF") or bucket.get("nS1") or "申请文件")
        u = (bucket.get("u1") or "").strip()
        if u and u != "#":
            full_url = u if u.startswith("http") else (HKEX_APP_BASE + u.lstrip("/"))
            if full_url not in seen_urls:
                seen_urls.add(full_url)
                docs.append({"date": bd or d_main, "title": title, "url": full_url})

    if not all_dates:
        return "", "", docs[:8]
    all_dates.sort()
    return all_dates[0], all_dates[-1], docs[:8]


def fetch_hkex_records() -> List[Dict[str, Any]]:
    sources = [
        ("appactive_appphip_sehk_c.json", "主板", "已聆讯", 4),
        ("appactive_appphip_gem_c.json", "GEM", "已聆讯", 4),
        ("appactive_app_sehk_c.json", "主板", "处理中", 3),
        ("appactive_app_gem_c.json", "GEM", "处理中", 3),
        ("applisted_sehk_c.json", "主板", "已上市", 5),
        ("applisted_gem_c.json", "GEM", "已上市", 5),
        ("appinactive_sehk_c.json", "主板", None, 1),
        ("appinactive_gem_c.json", "GEM", None, 1),
        ("appreturned_sehk_c.json", "主板", "撤回/被拒", 2),
        ("appreturned_gem_c.json", "GEM", "撤回/被拒", 2),
    ]

    by_key: Dict[str, Dict[str, Any]] = {}
    for filename, board, fixed_status, base_prio in sources:
        try:
            payload = fetch_json(HKEX_BASE + filename)
            apps = payload.get("app", []) if isinstance(payload, dict) else []
        except Exception as exc:
            print(f"[WARN] 拉取 {filename} 失败: {exc}", file=sys.stderr)
            continue

        for item in apps:
            raw_name = (item.get("a") or "").strip()
            if not raw_name:
                continue
            clean_tc, tags = extract_tags_and_clean_name(raw_name)
            clean_sc = to_simplified(clean_tc)
            key = normalize_company_key(clean_sc)
            if not key:
                continue

            status = fixed_status
            prio = base_prio
            if status is None:
                s_code = (item.get("s") or "").upper()
                if s_code in ("W", "RJ"):
                    status = "撤回/被拒"
                    prio = 2
                elif s_code == "LT":
                    status = "已上市"
                    prio = 5
                else:
                    status = "失效"
                    prio = 1

            submit_date, update_date, docs = extract_hkex_docs_and_dates(item)
            stock_code = (item.get("st") or "").strip()
            sponsors: List[str] = []
            # appreturned 的 s 字段是保荐机构名称
            if filename.startswith("appreturned") and item.get("s"):
                sponsors = [to_simplified(str(item["s"]).strip())]

            cand = {
                "key": key,
                "company": clean_sc,
                "company_tc": clean_tc,
                "board": board,
                "tags": tags,
                "hkex_status": status,
                "prio": prio,
                "stock_code": stock_code,
                "submit_date": submit_date,
                "update_date": update_date or submit_date,
                "docs": docs,
                "sponsors": sponsors,
                "hkex_id": str(item.get("id") or ""),
                "attempt_count": 1,
            }

            existing = by_key.get(key)
            if not existing:
                by_key[key] = cand
            else:
                # 合并递表历史次数与最早期递表日期
                existing_attempts = existing.get("attempt_count", 1) + 1
                earliest_submit = min(
                    [d for d in (existing.get("submit_date"), submit_date) if d] or [""]
                )
                merged_tags = sorted(set(existing.get("tags", []) + tags))
                merged_sponsors = existing.get("sponsors") or sponsors

                if (prio > existing["prio"]) or (
                    prio == existing["prio"] and (cand["update_date"] >= existing["update_date"])
                ):
                    if not cand["docs"] and existing["docs"]:
                        cand["docs"] = existing["docs"]
                    cand["attempt_count"] = existing_attempts
                    cand["submit_date"] = earliest_submit or cand["submit_date"]
                    cand["tags"] = merged_tags
                    cand["sponsors"] = merged_sponsors or cand["sponsors"]
                    by_key[key] = cand
                else:
                    existing["attempt_count"] = existing_attempts
                    if earliest_submit:
                        existing["submit_date"] = earliest_submit
                    existing["tags"] = merged_tags
                    if not existing["sponsors"] and sponsors:
                        existing["sponsors"] = sponsors

    return list(by_key.values())


def parse_xlsx_rows(xls_bytes: bytes) -> List[List[str]]:
    with zipfile.ZipFile(io.BytesIO(xls_bytes)) as z:
        ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        sst: List[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("s:si", ns):
                sst.append(
                    "".join(
                        t.text or ""
                        for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
                    )
                )
        sheet_names = sorted(n for n in z.namelist() if n.startswith("xl/worksheets/sheet"))
        if not sheet_names:
            return []
        root = ET.fromstring(z.read(sheet_names[0]))
        out: List[List[str]] = []
        for row in root.findall(".//s:sheetData/s:row", ns):
            vals: List[str] = []
            for c in row.findall("s:c", ns):
                t = c.attrib.get("t")
                v = c.find("s:v", ns)
                if v is None:
                    is_el = c.find("s:is", ns)
                    if is_el is not None:
                        vals.append(
                            "".join(
                                x.text or ""
                                for x in is_el.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
                            )
                        )
                    else:
                        vals.append("")
                elif t == "s":
                    idx = int(v.text or 0)
                    vals.append(sst[idx] if idx < len(sst) else "")
                else:
                    vals.append(v.text or "")
            out.append(vals)
        return out


def fetch_csrc_overseas() -> Tuple[Dict[str, Dict[str, Any]], str]:
    """拉取证监会境外发行上市备案情况表 Excel 及近期备案通知书。"""
    csrc_map: Dict[str, Dict[str, Any]] = {}
    excel_url = ""
    excel_date = ""

    # 1. 在证监会频道检索最新备案情况表 Excel 与近期备案通知书
    for page in range(1, 5):
        try:
            d = fetch_json(CSRC_SEARCH_API.format(size=30, page=page))
            results = d.get("data", {}).get("results", []) or []
        except Exception as exc:
            print(f"[WARN] 拉取 CSRC 第 {page} 页失败: {exc}", file=sys.stderr)
            break

        for r in results:
            title = (r.get("title") or "").strip()
            pub_date = (r.get("publishedTimeStr") or "")[:10]
            if not excel_url and "境外发行证券和上市备案情况表" in title:
                for res in r.get("resList") or []:
                    fp = res.get("filePath") or ""
                    if fp.lower().endswith(".xlsx"):
                        excel_url = fp if fp.startswith("http") else ("https://www.csrc.gov.cn" + fp)
                        excel_date = pub_date
                        break
            if "境外发行上市" in title and "备案通知书" in title:
                m = re.search(r"关于(.+?)(?:境外发行上市|首次公开发行).*?备案通知书", title)
                if m:
                    comp = m.group(1).strip()
                    key = normalize_company_key(comp)
                    if key and key not in csrc_map:
                        csrc_map[key] = {
                            "company": comp,
                            "csrc_status": "备案同意",
                            "filing_type": "直接境外上市" if "股份有限公司" in comp else "间接境外上市",
                            "filing_entity": comp if "股份有限公司" in comp else "",
                            "sponsors": [],
                            "law_firms": [],
                            "receive_date": pub_date,
                        }

    # 2. 解析证监会最新每周备案情况表 Excel
    if excel_url:
        try:
            xls_bytes = fetch_bytes(excel_url, timeout=30)
            rows = parse_xlsx_rows(xls_bytes)
            for row in rows:
                if len(row) < 9:
                    continue
                seq = str(row[0] or "").strip()
                if not seq.isdigit():
                    continue
                comp_raw = str(row[1] or "").strip()
                filing_type = str(row[2] or "").strip()
                filing_entity = str(row[3] or "").strip()
                exchange = str(row[4] or "").strip()
                sponsors_raw = str(row[5] or "").strip()
                law_raw = str(row[6] or "").strip()
                recv_date = parse_excel_serial_date(row[7] if len(row) > 7 else "")
                status_raw = str(row[8] or "").strip()

                if exchange and ("香港" not in exchange and "联交所" not in exchange):
                    continue
                if filing_type == "全流通":
                    continue

                # 拆分中英文/括号名称，优先保留中文名
                comp_lines = [line.strip() for line in comp_raw.splitlines() if line.strip()]
                zh_name = comp_lines[-1].strip("（）() ") if len(comp_lines) > 1 and re.search(r"[\u4e00-\u9fff]", comp_lines[-1]) else comp_lines[0]

                if "补充材料" in status_raw or "反馈" in status_raw or "征求意见" in status_raw:
                    csrc_status = "备案反馈"
                elif "接收" in status_raw or "受理" in status_raw:
                    csrc_status = "备案受理"
                elif "通过" in status_raw or "同意" in status_raw or "通知书" in status_raw:
                    csrc_status = "备案同意"
                elif "终止" in status_raw:
                    csrc_status = "备案终止"
                else:
                    csrc_status = status_raw or "备案受理"

                sponsors = [s.strip() for s in re.split(r"[\n、；;]+", sponsors_raw) if s.strip()]
                law_firms = [s.strip() for s in re.split(r"[\n、；;]+", law_raw) if s.strip()]

                entry = {
                    "company": zh_name,
                    "csrc_status": csrc_status,
                    "filing_type": filing_type,
                    "filing_entity": filing_entity,
                    "sponsors": sponsors,
                    "law_firms": law_firms,
                    "receive_date": recv_date,
                }
                for cand_name in {zh_name, comp_lines[0], filing_entity}:
                    k = normalize_company_key(cand_name)
                    if k:
                        csrc_map[k] = entry
        except Exception as exc:
            print(f"[WARN] 解析 CSRC 备案 Excel 失败: {exc}", file=sys.stderr)

    return csrc_map, excel_date


def build_a_share_lookup() -> Tuple[Dict[str, str], Dict[str, str]]:
    """构建 A 股公司全称/简称与省份映射，用于识别 A+H 与总部省份。"""
    org_province: Dict[str, str] = {}
    a_share_keys: Dict[str, str] = {}

    if os.path.exists(A_SHARE_JSON):
        try:
            with open(A_SHARE_JSON, "r", encoding="utf-8") as f:
                ipo_list = json.load(f)
            for item in ipo_list:
                comp = item.get("company") or ""
                prov = item.get("province") or ""
                k = normalize_company_key(comp)
                if k:
                    a_share_keys[k] = comp
                    if prov and prov != "—":
                        org_province[k] = prov
        except Exception:
            pass

    # 从东财全量 A 股行情接口获取 5,400+ 家已上市 A 股公司名称/简称
    try:
        url = (
            "https://push2.eastmoney.com/api/qt/clist/get"
            "?pn=1&pz=6000&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14"
        )
        d = fetch_json(url, timeout=20)
        diff = (d.get("data") or {}).get("diff") or {}
        items = diff.values() if isinstance(diff, dict) else diff
        for row in items:
            abbr = str(row.get("f14") or "").strip()
            code = str(row.get("f12") or "").strip()
            if abbr:
                k = normalize_company_key(abbr)
                a_share_keys[k] = code
    except Exception as exc:
        print(f"[WARN] 拉取 A 股列表失败（仅使用本地库）: {exc}", file=sys.stderr)

    # 拉取东财前 3000 条 ORGINFO 补齐历史上市公司全称与省份
    for page in range(1, 4):
        try:
            u = (
                "https://datacenter-web.eastmoney.com/api/data/v1/get"
                f"?reportName=RPT_F10_BASIC_ORGINFO&columns=SECURITY_CODE,SECURITY_NAME_ABBR,ORG_NAME,PROVINCE"
                f"&pageNumber={page}&pageSize=500"
            )
            res = fetch_json(u, timeout=15).get("result") or {}
            for row in res.get("data") or []:
                org = (row.get("ORG_NAME") or "").strip()
                prov = (row.get("PROVINCE") or "").strip()
                if org:
                    k = normalize_company_key(org)
                    a_share_keys[k] = row.get("SECURITY_CODE") or org
                    if prov:
                        org_province[k] = prov
        except Exception:
            break

    return a_share_keys, org_province


def infer_geo_and_structure(
    rec: Dict[str, Any],
    csrc_info: Optional[Dict[str, Any]],
    a_share_keys: Dict[str, str],
    org_province: Dict[str, str],
) -> None:
    name = rec["company"]
    key = rec["key"]

    # 1. 检查是否 A+H（精准全称匹配或去掉“股份有限公司”前缀匹配）
    is_ah = key in a_share_keys
    if not is_ah and "股份有限公司" in name:
        short_key = normalize_company_key(name.replace("股份有限公司", ""))
        if short_key in a_share_keys and len(short_key) >= 3:
            is_ah = True

    # 2. 推断上市架构
    filing_type = (csrc_info or {}).get("filing_type") or ""
    if is_ah:
        structure = "A+H"
    elif "acquisition" in name.lower() or "spac" in name.lower() or "特殊目的并购" in name:
        structure = "SPAC"
    elif filing_type == "直接境外上市" or "股份有限公司" in name:
        structure = "H股架构"
    elif filing_type == "间接境外上市":
        structure = "红筹架构"
    else:
        # 境外注册控股主体，根据常见内地背景词区分红筹与境外企业
        structure = "境外企业"

    # 3. 推断注册地址与总部省份
    reg_place = "开曼群岛"
    hq = "香港"
    if structure in ("A+H", "H股架构"):
        reg_place = "中国境内"
        hq = org_province.get(key, "")
        if not hq:
            entity_name = (csrc_info or {}).get("filing_entity") or name
            for kw, prov in PROVINCE_KEYWORDS:
                if kw in entity_name:
                    hq = prov
                    break
        if not hq:
            hq = "中国内地"
    elif structure == "红筹架构":
        reg_place = "开曼群岛"
        entity_name = (csrc_info or {}).get("filing_entity") or name
        hq = ""
        for kw, prov in PROVINCE_KEYWORDS:
            if kw in entity_name:
                hq = prov
                break
        if not hq:
            hq = "中国内地"
    else:
        if "开放式基金" in name or "香港" in name:
            reg_place = "香港"
            hq = "香港"
        elif "新加坡" in name or "Pte" in name:
            reg_place = "新加坡"
            hq = "新加坡"
        elif "股份有限公司" not in name and re.search(r"[\u4e00-\u9fff]", name):
            # 可能是早期红筹（开曼注册、内地/香港运营）
            for kw, prov in PROVINCE_KEYWORDS:
                if kw in name:
                    hq = prov
                    break

    # 4. 证监会备案状态补齐
    if csrc_info:
        csrc_status = csrc_info["csrc_status"]
        if csrc_info.get("company"):
            rec["company"] = csrc_info["company"]
        if csrc_info.get("sponsors"):
            rec["sponsors"] = csrc_info["sponsors"]
        if csrc_info.get("law_firms"):
            rec["law_firms"] = csrc_info["law_firms"]
        if csrc_info.get("filing_entity"):
            rec["filing_entity"] = csrc_info["filing_entity"]
        if csrc_info.get("receive_date"):
            rec["csrc_receive_date"] = csrc_info["receive_date"]
    else:
        submit_date = rec.get("submit_date") or ""
        if structure == "境外企业":
            csrc_status = "不适用"
        elif rec["hkex_status"] == "已上市" and submit_date and submit_date < "2023-03-31":
            csrc_status = "新规前批复" if structure in ("A+H", "H股架构") else "新规前豁免"
        elif rec["hkex_status"] in ("失效", "撤回/被拒") and submit_date and submit_date < "2023-03-31":
            csrc_status = "不适用"
        elif rec["hkex_status"] in ("处理中", "已聆讯"):
            csrc_status = "尚未接收"
        else:
            csrc_status = "不适用"

    rec["structure"] = structure
    rec["reg_place"] = reg_place
    rec["headquarters"] = hq
    rec["csrc_status"] = csrc_status


def main() -> int:
    parser = argparse.ArgumentParser(description="采集港股 IPO 与证监会境外上市备案数据")
    parser.add_argument("--soft-fail", action="store_true", help="采集失败时保留旧快照并退出 0")
    args = parser.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)
    print("[1/3] 正在拉取港交所披露易（HKEXnews）主板与 GEM 全量申请/上市数据...")
    hkex_records = fetch_hkex_records()
    if not hkex_records:
        msg = "[ERR] 未能从港交所获取有效港股 IPO 数据"
        if args.soft_fail and os.path.exists(OUT_JSON):
            print(msg + "，已启用 --soft-fail 保留现有快照", file=sys.stderr)
            return 0
        print(msg, file=sys.stderr)
        return 1

    print(f"[2/3] 正在拉取证监会境外发行上市备案情况表 & 备案通知书（港交所去重后 {len(hkex_records)} 家）...")
    csrc_map, csrc_date = fetch_csrc_overseas()

    print("[3/3] 正在匹配 A+H 企业与境内总部省份...")
    a_share_keys, org_province = build_a_share_lookup()

    final_records: List[Dict[str, Any]] = []
    for rec in hkex_records:
        csrc_info = csrc_map.get(rec["key"])
        infer_geo_and_structure(rec, csrc_info, a_share_keys, org_province)
        rec.pop("key", None)
        rec.pop("prio", None)
        final_records.append(rec)

    # 按更新日期倒序排列
    final_records.sort(key=lambda x: (x.get("update_date") or "", x.get("submit_date") or ""), reverse=True)

    payload = {
        "updated_at": dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).strftime("%Y-%m-%d %H:%M"),
        "csrc_table_date": csrc_date,
        "total": len(final_records),
        "hkex_status_counts": dict(Counter(r["hkex_status"] for r in final_records)),
        "csrc_status_counts": dict(Counter(r["csrc_status"] for r in final_records)),
        "structure_counts": dict(Counter(r["structure"] for r in final_records)),
        "records": final_records,
    }

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("window.__HK_IPO_DATA__ = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    print(
        f"[OK] 已写入 {OUT_JSON}：共 {payload['total']} 家港股 IPO 企业 | "
        f"港交所状态={payload['hkex_status_counts']} | 证监会状态={payload['csrc_status_counts']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
