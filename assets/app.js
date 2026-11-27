(function () {
  "use strict";

  const BOARDS = ["沪主板", "科创板", "深主板", "创业板", "北证"];
  const STAGES = ["受理", "问询", "上市委", "提交注册", "中止"];

  const PROVINCE_COORDS = {
    "北京市": [116.40, 39.90],
    "天津市": [117.20, 39.12],
    "上海市": [121.47, 31.23],
    "重庆市": [106.55, 29.56],
    "河北省": [114.51, 38.04],
    "山西省": [112.55, 37.87],
    "辽宁省": [123.43, 41.80],
    "吉林省": [125.32, 43.82],
    "黑龙江省": [126.64, 45.75],
    "江苏省": [119.40, 32.85],
    "浙江省": [120.15, 29.20],
    "安徽省": [117.28, 31.86],
    "福建省": [118.30, 26.08],
    "江西省": [115.89, 27.68],
    "山东省": [118.00, 36.40],
    "河南省": [113.65, 34.00],
    "湖北省": [112.30, 31.00],
    "湖南省": [111.70, 27.60],
    "广东省": [113.26, 23.13],
    "海南省": [109.85, 19.20],
    "四川省": [103.00, 30.65],
    "贵州省": [106.71, 26.57],
    "云南省": [101.50, 24.50],
    "陕西省": [108.95, 34.27],
    "甘肃省": [103.82, 36.06],
    "青海省": [96.80, 35.60],
    "内蒙古自治区": [111.65, 41.20],
    "广西壮族自治区": [108.32, 23.60],
    "西藏自治区": [89.10, 31.20],
    "宁夏回族自治区": [106.23, 37.48],
    "新疆维吾尔自治区": [85.62, 41.80],
  };

  const FUTURE_TAB_INFO = {
    "上市委审议": {
      title: "上市委审议（MVP 二期规划）",
      desc: "展示沪深北交易所上市委会议排期、上会企业名单、审议结果（通过 / 暂缓 / 否决）及过会率统计。",
      source: "数据源：上交所 / 深交所 / 北交所上市委会议公告接口",
    },
    "发行动态": {
      title: "发行动态（MVP 二期规划）",
      desc: "追踪已获注册批文企业的招股、询价、定价、申购及上市首日表现数据。",
      source: "数据源：证监会注册批文 + 沪深北新股发行公告",
    },
    "现场检查": {
      title: "现场检查（MVP 二期规划）",
      desc: "汇总中证协首发企业信息披露质量抽查名单、抽中后撤回率及检查进度。",
      source: "数据源：中国证券业协会（SAC）抽签公示",
    },
    "监管措施": {
      title: "监管措施（MVP 二期规划）",
      desc: "归集 IPO 审核过程中的监管警示、通报批评、纪律处分及涉事中介机构统计。",
      source: "数据源：三大交易所监管措施栏目 + 证监会行政监管措施",
    },
    "辅导备案": {
      title: "辅导备案（MVP 二期规划）",
      desc: "追踪全国拟上市企业辅导备案登记、辅导进展报告及辅导验收情况。",
      source: "数据源：证监会公开发行辅导监管系统（eid.csrc.gov.cn）",
    },
    "新三板挂牌": {
      title: "新三板挂牌（MVP 二期规划）",
      desc: "监控新三板申报挂牌企业审核进度、主办券商排名及创新层/基础层动态。",
      source: "数据源：全国股转系统官网（neeq.com.cn）",
    },
    "港股IPO": {
      title: "港股IPO（MVP 二期规划）",
      desc: "追踪港交所主板/GEM 递表（A1）、聆讯通过、招股及上市全流程动态。",
      source: "数据源：港交所披露易（HKEXnews）申请版本及聆讯后资料集",
    },
  };

  const TAB_ROUTES = {
    "全景图": "/ipo-review/kanban",
    "审核动态": "/ipo-review/a-stock",
    "上市委审议": "/ipo-review/stock-review",
    "发行动态": "/ipo-review/new-stock",
    "现场检查": "/ipo-review/onsite-inspection",
    "监管措施": "/ipo-review/regulatory-measures",
    "辅导备案": "/ipo-review/guidance",
    "新三板挂牌": "/ipo-review/new-third-board",
    "港股IPO": "/ipo-review/oversea-stock",
  };
  const ROUTE_TO_TAB = Object.fromEntries(Object.entries(TAB_ROUTES).map(([k, v]) => [v, k]));

  const DATASET_META = {
    ipo: ["data/ipo_data.json", "data/ipo_data.js", "__IPO_DATA__"],
    ipoActive: ["data/ipo_active.json", "data/ipo_data.js", "__IPO_DATA__"],
    committee: ["data/committee_data.json", "data/committee_data.js", "__COMMITTEE_DATA__"],
    issuance: ["data/issuance_data.json", "data/issuance_data.js", "__ISSUANCE_DATA__"],
    inspection: ["data/inspection_data.json", "data/inspection_data.js", "__INSPECTION_DATA__"],
    regulatory: ["data/regulatory_data.json", "data/regulatory_data.js", "__REGULATORY_DATA__"],
    tutoring: ["data/tutoring_data.json", "data/tutoring_data.js", "__TUTORING_DATA__"],
    neeq: ["data/neeq_data.json", "data/neeq_data.js", "__NEEQ_DATA__"],
    hk: ["data/hk_ipo_data.json", "data/hk_ipo_data.js", "__HK_IPO_DATA__"],
  };

  const state = {
    meta: null,
    records: [],        // 全量审核记录（含注册同意/终止）
    activeRecords: [],  // 当前在审记录（全景图统计口径）
    committeeRecords: [], // 二期：上市委审议记录
    issuanceRecords: [],  // 二期：新股发行动态记录
    inspectionRecords: [], // 三期：现场检查抽查名单
    regulatoryRecords: [], // 三期：IPO监管措施清单
    tutoringRecords: [],  // 二期第2周：辅导备案公告
    neeqRecords: [],      // 二期第2周：新三板挂牌企业
    hkRecords: [],        // 三期：港股IPO与境外备案
    hkMeta: null,
    loaded: {},
    loading: {},
    currentDetailRec: null,
    activeTab: "全景图",
    previousTab: "审核动态",
    overviewBoard: "全部",
    mapMode: "heatmap",
    rightOrgType: "law",
    mergeOrgHQ: true,     // 全景图口径优化：默认合并分所至总所
    chinaMapLoaded: false,
    chinaMapFailed: false,
    detailCache: {},
    filters: {
      exchange: "全部",
      board: "全部",
      stage: "全部",
      province: "全部",
      keyword: "",
      sortBy: "update_date",
      page: 1,
      pageSize: 30,
    },
    cmFilters: {
      board: "全部",
      result: "全部",
      year: "全部",
      keyword: "",
      page: 1,
      pageSize: 30,
    },
    issFilters: {
      board: "全部",
      status: "全部",
      year: "全部",
      keyword: "",
      page: 1,
      pageSize: 30,
    },
    inspFilters: {
      year: "全部",
      board: "全部",
      stage: "全部",
      batch: "全部",
      keyword: "",
      page: 1,
      pageSize: 30,
    },
    regFilters: {
      year: "全部",
      regulator: "全部",
      stage: "全部",
      category: "全部",
      keyword: "",
      page: 1,
      pageSize: 30,
    },
    tutFilters: {
      board: "全部",
      stage: "全部",
      bureau: "全部",
      keyword: "",
      sortBy: "update_date",
      sortDir: "desc",
      page: 1,
      pageSize: 30,
    },
    tutBureauExpanded: false,
    currentTutRec: null,
    tutDetailCache: {},
    tutReportShardCache: {},
    neeqFilters: {
      tier: "全部",
      trade: "全部",
      year: "全部",
      keyword: "",
      page: 1,
      pageSize: 30,
    },
    hkFilters: {
      structure: "全部",
      hkexStatus: "全部",
      csrcStatus: "全部",
      keyword: "",
      sortBy: "update_date",
      sortDir: "desc",
      page: 1,
      pageSize: 20,
    },
  };

  let mapChart = null;
  let sponsorChart = null;
  let rightOrgChart = null;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const BROKER_ALIAS_MAP = {
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
  };

  function normalizeBrokerName(raw) {
    const txt = String(raw || "").trim();
    if (!txt || txt === "—" || txt === "-" || txt === "--" || txt === "无") return txt || "—";
    const parts = txt.split(/[,，、;；]+/).map((p) => p.trim()).filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const part of parts) {
      let s = part.replace(/[（(]以下.*?[）)]/g, "").replace(/\s+/g, "").replace(/\(/g, "（").replace(/\)/g, "）");
      s = s.replace(/证券承销保荐(?:有限责任公司|有限公司)?/g, "证券");
      s = s.replace(/(?:保荐有限责任公司|股份有限公司|有限责任公司|有限公司)$/g, "");
      s = s.replace(/[（(](?:中国|亚洲|上海|深圳|北京)[）)]$/g, "").trim();
      let mapped = BROKER_ALIAS_MAP[s] || s;
      if (mapped.length === 6 && mapped.endsWith("证券") && mapped !== "太平洋证券") {
        const core = mapped.slice(0, -2);
        mapped = BROKER_ALIAS_MAP[core] || core;
      }
      if (mapped && !seen.has(mapped)) {
        seen.add(mapped);
        out.push(mapped);
      }
    }
    return out.length ? out.join("、") : txt;
  }

  function buildPageRange(current, total) {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 4) {
      return [1, 2, 3, 4, 5, "...", total];
    }
    if (current >= total - 3) {
      return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
    }
    return [1, "...", current - 1, current, current + 1, "...", total];
  }

  function renderPageNumbers(prevBtnId, currentPage, totalPages, onSelectPage) {
    const prevBtn = $(prevBtnId);
    if (!prevBtn || !prevBtn.parentNode) return;
    let wrap = prevBtn.parentNode.querySelector(".page-numbers");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "page-numbers";
      prevBtn.insertAdjacentElement("afterend", wrap);
    }
    if (totalPages <= 1) {
      wrap.innerHTML = "";
      wrap.classList.add("hidden");
      return;
    }
    wrap.classList.remove("hidden");
    const items = buildPageRange(currentPage, totalPages);
    wrap.innerHTML = items
      .map((item) =>
        item === "..."
          ? `<span class="page-ellipsis" aria-hidden="true">···</span>`
          : `<button type="button" class="page-num-btn${item === currentPage ? " active" : ""}" data-page="${item}" aria-label="第 ${item} 页">${item}</button>`
      )
      .join("");
    wrap.querySelectorAll(".page-num-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = Number(btn.dataset.page);
        if (p && p !== currentPage) {
          onSelectPage(p);
        }
      });
    });
  }

  const _scriptPromises = {};

  function getBasePrefix() {
    const p = window.location.pathname || "/";
    return p === "/ipoflow" || p.startsWith("/ipoflow/") ? "/ipoflow" : "";
  }

  function assetUrl(relPath) {
    const clean = String(relPath || "").replace(/^\.\//, "").replace(/^\/+/, "");
    if (window.location.protocol === "file:") return `./${clean}`;
    return `${getBasePrefix()}/${clean}`;
  }

  function loadScriptOnce(relPath) {
    const url = assetUrl(relPath);
    if (_scriptPromises[url]) return _scriptPromises[url];
    _scriptPromises[url] = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
    return _scriptPromises[url];
  }

  async function ensureEcharts() {
    if (window.echarts) return true;
    await loadScriptOnce("assets/vendor/echarts.min.js");
    return Boolean(window.echarts);
  }

  async function loadJsonWithFallback(jsonRelPath, jsRelPath, globalVar) {
    if (window.location.protocol !== "file:") {
      try {
        const resp = await fetch(assetUrl(jsonRelPath));
        if (resp.ok) return await resp.json();
      } catch (_) {}
    }
    if (globalVar && window[globalVar]) return window[globalVar];
    if (jsRelPath) {
      await loadScriptOnce(jsRelPath);
      if (globalVar && window[globalVar]) return window[globalVar];
    }
    return { meta: {}, records: [] };
  }

  async function ensureDataset(key) {
    if (key === "ipoActive" && state.loaded.ipo) return true;
    if (state.loaded[key]) return true;
    if (state.loading[key]) return state.loading[key];
    const spec = DATASET_META[key];
    if (!spec) return false;

    const promise = (async () => {
      const [jsonPath, jsPath, globalVar] = spec;
      const payload = await loadJsonWithFallback(jsonPath, jsPath, globalVar);
      const recs = (payload && payload.records) || [];

      if (key === "ipoActive") {
        state.meta = (payload && payload.meta) || {};
        state.activeRecords = recs.filter((r) => r.is_active !== false);
        updateOverviewBoardCounts();
        updateHeaderMeta();
      } else if (key === "ipo") {
        state.meta = (payload && payload.meta) || {};
        state.records = recs;
        state.activeRecords = recs.filter((r) => r.is_active !== false);
        state.loaded.ipoActive = true;
        updateOverviewBoardCounts();
        updateHeaderMeta();
        updateFilterChipCounts();
        populateProvinceSelect();
      } else if (key === "committee") {
        state.committeeRecords = recs;
        updateCommitteeChipCounts();
      } else if (key === "issuance") {
        state.issuanceRecords = recs;
        updateIssuanceChipCounts();
      } else if (key === "inspection") {
        state.inspectionRecords = recs;
        updateInspectionChipCounts();
      } else if (key === "regulatory") {
        state.regulatoryRecords = recs;
        updateRegulatoryChipCounts();
      } else if (key === "tutoring") {
        state.tutoringRecords = recs;
        updateTutoringChipCounts();
      } else if (key === "neeq") {
        state.neeqRecords = recs;
        updateNeeqChipCounts();
      } else if (key === "hk") {
        state.hkRecords = recs;
        state.hkMeta = payload || {};
        updateHkChipCounts();
      }

      state.loaded[key] = true;
      return true;
    })().finally(() => {
      delete state.loading[key];
    });

    state.loading[key] = promise;
    return promise;
  }

  let _chinaGeoPromise = null;
  function prefetchChinaGeoJson() {
    if (state.chinaMapLoaded) return Promise.resolve(true);
    if (_chinaGeoPromise) return _chinaGeoPromise;
    _chinaGeoPromise = (async () => {
      const urls = [
        assetUrl("data/china.json"),
        "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json",
      ];
      for (const url of urls) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const geoJson = await resp.json();
          if (geoJson && geoJson.features) {
            state._chinaGeoJson = geoJson;
            return true;
          }
        } catch (_) {}
      }
      state.chinaMapFailed = true;
      return false;
    })();
    return _chinaGeoPromise;
  }

  async function ensureChinaGeoJson() {
    if (state.chinaMapLoaded) return true;
    if (state.chinaMapFailed) return false;
    const ok = await prefetchChinaGeoJson();
    if (ok && window.echarts && state._chinaGeoJson) {
      window.echarts.registerMap("china", state._chinaGeoJson);
      state.chinaMapLoaded = true;
      return true;
    }
    return false;
  }

  function getOverviewActiveRecords() {
    if (state.overviewBoard === "全部") return state.activeRecords;
    return state.activeRecords.filter((r) => r.board === state.overviewBoard);
  }

  function updateOverviewBoardCounts() {
    const counts = {};
    for (const r of state.activeRecords) {
      counts[r.board] = (counts[r.board] || 0) + 1;
    }
    document.querySelectorAll("#overview-board-switch .chip-btn").forEach((btn) => {
      const v = btn.dataset.val;
      if (v === "全部") {
        btn.innerHTML = `全部<span class="chip-count">(${state.activeRecords.length})</span>`;
      } else {
        btn.innerHTML = `${v}<span class="chip-count">(${counts[v] || 0})</span>`;
      }
    });
  }

  function updateHeaderMeta() {
    const meta = state.meta || {};
    const activeTotal = state.activeRecords.length || meta.active_total || 0;
    const allTotal = meta.total || state.records.length || activeTotal;
    const bd = state.overviewBoard;
    const scopedTotal = getOverviewActiveRecords().length;

    $("overview-date-text").textContent = bd === "全部"
      ? "A股IPO在审"
      : `A股IPO在审 · ${bd}（${scopedTotal} 家）`;
    if ($("overview-sponsor-title")) {
      $("overview-sponsor-title").textContent = bd === "全部"
        ? "A股IPO在审（保荐机构）"
        : `${bd}在审（保荐机构）`;
    }
    if ($("overview-right-org-title")) {
      $("overview-right-org-title").textContent = bd === "全部"
        ? "A股IPO在审"
        : `${bd}在审`;
    }

    const isDemo = meta.data_source === "demo_snapshot";
    $("source-dot").className = isDemo ? "source-dot demo" : "source-dot";
    $("source-text").textContent = isDemo
      ? `演示快照 · 在审 ${activeTotal} 家`
      : `实时数据 · 在审 ${activeTotal} / 全量 ${allTotal}`;
  }

  // ==================== 全景图聚合与渲染（仅统计当前在审） ====================
  function getProvinceStats(list) {
    const map = {};
    for (const r of list) {
      const p = r.province || "其他";
      map[p] = (map[p] || 0) + 1;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }

  // 总所归并口径：统一分所与行政区划前缀
  function normalizeOrgToHQ(name) {
    if (!name) return "";
    let s = String(name).trim();
    // 1. 去掉括号中的分所城市/组织形式（如 国浩律师（上海）事务所 -> 国浩律师事务所）
    s = s.replace(/（[^）]*）|\([^)]*\)/g, "").trim();
    // 2. 去掉末尾分所字样
    s = s.replace(/(?:上海|北京|深圳|广州|杭州|南京|成都|武汉|苏州|重庆|天津|西安|长沙|福州|厦门|济南|青岛|合肥|郑州|昆明|大连|沈阳|宁波|无锡)?分所$/g, "").trim();
    // 3. 对律师/会计师事务所去掉开头的省市前缀（避免误伤“上海证券/南京证券”）
    if (s.includes("律师") || s.includes("会计师")) {
      s = s.replace(/^(?:北京市|上海市|广东省|浙江省|江苏省|四川省|湖南省|福建省|山东省|安徽省|湖北省|陕西省|河南省|河北省|辽宁省|江西省|重庆市|天津市|深圳市|广州市|杭州市|南京市|成都市|苏州市|北京|上海|广东|浙江|江苏|四川|湖南|福建|山东|安徽|湖北|陕西|河南|河北|辽宁|江西|深圳|广州|杭州|南京|成都|苏州)/, "").trim();
    }
    return s || String(name).trim();
  }

  function extractOrgSearchKeyword(org) {
    if (!state.mergeOrgHQ) return org;
    const core = String(org || "").replace(/律师事务所$|会计师事务所$|事务所$/, "").trim();
    return core.length >= 2 ? core : org;
  }

  function getOrgStats(field, topN = 15) {
    const map = {};
    for (const r of getOverviewActiveRecords()) {
      const seenInRecord = new Set();
      for (const rawOrg of r[field] || []) {
        if (!rawOrg) continue;
        const org = state.mergeOrgHQ ? normalizeOrgToHQ(rawOrg) : rawOrg;
        if (!org || seenInRecord.has(org)) continue;
        seenInRecord.add(org);
        map[org] = (map[org] || 0) + 1;
      }
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, topN);
  }

  function renderMatrix() {
    document.querySelectorAll(".matrix-board-th").forEach((th) => {
      th.classList.toggle("matrix-col-active", th.dataset.board === state.overviewBoard);
    });

    const counts = {};
    for (const st of STAGES) {
      counts[st] = {};
      for (const bd of BOARDS) counts[st][bd] = 0;
    }
    for (const r of state.activeRecords) {
      if (counts[r.stage] && counts[r.stage][r.board] !== undefined) {
        counts[r.stage][r.board] += 1;
      }
    }

    const tbody = $("matrix-tbody");
    tbody.innerHTML = "";

    const colTotals = {};
    for (const bd of BOARDS) colTotals[bd] = 0;
    let grandTotal = 0;

    for (const st of STAGES) {
      const tr = document.createElement("tr");
      let rowSum = 0;
      let html = `<td>${st}</td>`;
      for (const bd of BOARDS) {
        const val = counts[st][bd];
        rowSum += val;
        colTotals[bd] += val;
        grandTotal += val;
        const colCls = bd === state.overviewBoard ? ` class="matrix-col-active"` : "";
        html += val > 0
          ? `<td${colCls}><span class="matrix-num clickable" data-board="${bd}" data-stage="${st}" title="查看 ${bd} · ${st}">${val}</span></td>`
          : `<td${colCls}><span class="matrix-num zero">0</span></td>`;
      }
      html += rowSum > 0
        ? `<td><span class="matrix-num clickable" data-board="全部" data-stage="${st}" title="查看全部 ${st}">${rowSum}</span></td>`
        : `<td><span class="matrix-num zero">0</span></td>`;
      tr.innerHTML = html;
      tbody.appendChild(tr);
    }

    const totalTr = document.createElement("tr");
    let totalHtml = `<td>合计</td>`;
    for (const bd of BOARDS) {
      const colCls = bd === state.overviewBoard ? ` class="matrix-col-active"` : "";
      totalHtml += `<td${colCls}><span class="matrix-num clickable" data-board="${bd}" data-stage="在审汇总" title="查看 ${bd} 全部在审">${colTotals[bd]}</span></td>`;
    }
    totalHtml += `<td><span class="matrix-num clickable" data-board="全部" data-stage="在审汇总" title="查看全部在审企业">${grandTotal}</span></td>`;
    totalTr.innerHTML = totalHtml;
    tbody.appendChild(totalTr);

    tbody.querySelectorAll(".matrix-num.clickable").forEach((el) => {
      el.addEventListener("click", () => {
        jumpToDynamics({
          exchange: "全部",
          board: el.dataset.board,
          stage: el.dataset.stage,
          province: "全部",
          keyword: "",
        });
      });
    });
  }

  async function renderMapOrBar() {
    if (!window.echarts) {
      $("map-fallback-tip").textContent = "ECharts 资源未加载，请检查网络";
      $("map-fallback-tip").classList.remove("hidden");
      return;
    }

    if (!mapChart) {
      mapChart = window.echarts.init($("map-chart"));
      mapChart.on("click", (params) => {
        const prov = params.name;
        if (prov && PROVINCE_COORDS[prov]) {
          jumpToDynamics({ exchange: "全部", board: state.overviewBoard, stage: "在审汇总", province: prov, keyword: "" });
        }
      });
    }

    const stats = getProvinceStats(getOverviewActiveRecords());

    if (state.mapMode === "heatmap") {
      const ok = await ensureChinaGeoJson();
      if (!ok) {
        $("map-fallback-tip").textContent = "当前离线无法加载中国地图边界，已自动切换为省份柱状图";
        $("map-fallback-tip").classList.remove("hidden");
        renderProvinceBar(stats);
        return;
      }
      $("map-fallback-tip").classList.add("hidden");

      const scatterData = stats
        .filter((item) => PROVINCE_COORDS[item.name] && item.value > 0)
        .map((item) => ({ name: item.name, value: [...PROVINCE_COORDS[item.name], item.value] }));

      mapChart.clear();
      mapChart.setOption({
        tooltip: {
          trigger: "item",
          formatter: (p) => {
            const val = Array.isArray(p.value) ? p.value[2] : (p.value || 0);
            return `<div style="font-weight:600;margin-bottom:2px;">${p.name}</div>在审企业：<b style="color:#1a73e8">${val}</b> 家<br/><span style="font-size:11px;color:#70757a">点击查看明细</span>`;
          },
        },
        visualMap: {
          type: "piecewise",
          orient: "horizontal",
          left: 12,
          bottom: 6,
          itemWidth: 14,
          itemHeight: 10,
          itemGap: 4,
          text: ["多", "少"],
          textStyle: { color: "#70757a", fontSize: 12 },
          seriesIndex: 0,
          pieces: [
            { gt: 50, color: "#669df6" },
            { gt: 20, lte: 50, color: "#8ab4f8" },
            { gt: 10, lte: 20, color: "#aecbfa" },
            { gt: 3, lte: 10, color: "#d2e3fc" },
            { gt: 0, lte: 3, color: "#e8f0fe" },
            { value: 0, color: "#f8f9fa" },
          ],
        },
        geo: {
          map: "china",
          roam: false,
          zoom: 1.22,
          center: [104.5, 35.8],
          itemStyle: { areaColor: "#f8f9fa", borderColor: "#dadce0", borderWidth: 0.8 },
          emphasis: { label: { show: false }, itemStyle: { areaColor: "#d2e3fc" } },
        },
        series: [
          { name: "省份热力", type: "map", geoIndex: 0, data: stats },
          {
            name: "在审家数",
            type: "scatter",
            coordinateSystem: "geo",
            symbol: "circle",
            symbolSize: (val) => {
              const v = val[2] || 1;
              if (v >= 50) return 30;
              if (v >= 20) return 26;
              if (v >= 10) return 23;
              return 20;
            },
            itemStyle: { color: "#1a73e8", shadowBlur: 8, shadowColor: "rgba(26,115,232,0.32)" },
            label: { show: true, formatter: (p) => String(p.value[2]), color: "#fff", fontSize: 11, fontWeight: 600 },
            data: scatterData,
            zlevel: 2,
          },
        ],
      });
    } else {
      $("map-fallback-tip").classList.add("hidden");
      renderProvinceBar(stats);
    }
  }

  function renderProvinceBar(stats) {
    const top15 = stats.slice(0, 15);
    mapChart.clear();
    mapChart.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (arr) => `${arr[0].name}：<b style="color:#1a73e8">${arr[0].value}</b> 家`,
      },
      grid: { left: 16, right: 24, top: 20, bottom: 52, containLabel: true },
      xAxis: {
        type: "category",
        data: top15.map((x) => x.name.replace(/省|市|维吾尔自治区|壮族自治区|回族自治区|自治区/g, "")),
        axisLabel: { color: "#5f6368", fontSize: 12, interval: 0, rotate: 32 },
        axisLine: { lineStyle: { color: "#dadce0" } },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#f1f3f4", type: "dashed" } },
        axisLabel: { color: "#70757a", fontSize: 12 },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 22,
          data: top15.map((x) => ({ value: x.value, name: x.name })),
          itemStyle: { color: "#1a73e8", borderRadius: [6, 6, 0, 0] },
          label: { show: true, position: "top", color: "#1a73e8", fontSize: 11, fontWeight: 600 },
        },
      ],
    });
  }

  function renderRankChart(chartInstance, elId, data, onClickOrg) {
    if (!window.echarts) return chartInstance;
    const chart = chartInstance || window.echarts.init($(elId));
    if (!chartInstance) {
      chart.on("click", (params) => {
        if (params.name) onClickOrg(params.name);
      });
    }
    const reversed = [...data].reverse();
    chart.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (arr) =>
          `${arr[0].name}<br/>在审家数：<b style="color:#1a73e8">${arr[0].value}</b> 家<br/><span style="font-size:11px;color:#70757a">点击筛选该机构在审企业</span>`,
      },
      grid: { left: 10, right: 36, top: 8, bottom: 10, containLabel: true },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#f1f3f4", type: "dashed" } },
        axisLabel: { color: "#70757a", fontSize: 11 },
      },
      yAxis: {
        type: "category",
        data: reversed.map((x) => x.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#202124", fontSize: 12, width: 130, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          barWidth: 14,
          data: reversed.map((x) => x.value),
          itemStyle: { color: "#1a73e8", borderRadius: [0, 6, 6, 0] },
          label: { show: true, position: "right", color: "#1a73e8", fontSize: 12, fontWeight: 600 },
        },
      ],
    });
    return chart;
  }

  function renderOrgCharts() {
    sponsorChart = renderRankChart(sponsorChart, "sponsor-chart", getOrgStats("sponsors", 15), (org) => {
      jumpToDynamics({ exchange: "全部", board: state.overviewBoard, stage: "在审汇总", province: "全部", keyword: extractOrgSearchKeyword(org) });
    });
    const rightField = state.rightOrgType === "law" ? "law_firms" : "accounting_firms";
    rightOrgChart = renderRankChart(rightOrgChart, "right-org-chart", getOrgStats(rightField, 15), (org) => {
      jumpToDynamics({ exchange: "全部", board: state.overviewBoard, stage: "在审汇总", province: "全部", keyword: extractOrgSearchKeyword(org) });
    });
  }

  // ==================== 审核动态（全量筛选 + 点击进详情） ====================
  function updateFilterChipCounts() {
    const exCounts = {};
    const bdCounts = {};
    const stCounts = {};
    for (const r of state.records) {
      exCounts[r.exchange] = (exCounts[r.exchange] || 0) + 1;
      bdCounts[r.board] = (bdCounts[r.board] || 0) + 1;
      stCounts[r.stage] = (stCounts[r.stage] || 0) + 1;
    }

    document.querySelectorAll("#filter-exchange-chips .chip-btn").forEach((btn) => {
      const v = btn.dataset.val;
      if (v !== "全部") btn.innerHTML = `${v}<span class="chip-count">(${exCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#filter-board-chips .chip-btn").forEach((btn) => {
      const v = btn.dataset.val;
      if (v !== "全部") btn.innerHTML = `${v}<span class="chip-count">(${bdCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#filter-stage-chips .chip-btn").forEach((btn) => {
      const v = btn.dataset.val;
      if (v === "在审汇总") {
        btn.innerHTML = `仅看在审<span class="chip-count">(${state.activeRecords.length})</span>`;
      } else if (v !== "全部") {
        btn.innerHTML = `${v}<span class="chip-count">(${stCounts[v] || 0})</span>`;
      }
    });
  }

  function populateProvinceSelect() {
    const select = $("filter-province");
    const stats = getProvinceStats(state.records);
    select.innerHTML = `<option value="全部">全部省份（${state.records.length}）</option>`;
    for (const item of stats) {
      const opt = document.createElement("option");
      opt.value = item.name;
      opt.textContent = `${item.name}（${item.value}）`;
      select.appendChild(opt);
    }
  }

  function syncDynamicsFilterUI() {
    document.querySelectorAll("#filter-exchange-chips .chip-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.val === state.filters.exchange);
    });
    document.querySelectorAll("#filter-board-chips .chip-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.val === state.filters.board);
    });
    document.querySelectorAll("#filter-stage-chips .chip-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.val === state.filters.stage);
    });
    $("filter-province").value = state.filters.province;
    $("filter-keyword").value = state.filters.keyword;
    $("filter-sort").value = state.filters.sortBy;
    $("btn-clear-search").classList.toggle("hidden", !state.filters.keyword);

    // 若选中了省份或非默认排序，高亮高级筛选按钮并在跳转时自动展开
    const hasAdv = state.filters.province !== "全部" || state.filters.sortBy !== "update_date";
    if ($("btn-toggle-advanced")) {
      $("btn-toggle-advanced").classList.toggle("active-toggle", hasAdv || ($("advanced-drawer") && !$("advanced-drawer").classList.contains("hidden")));
    }
  }

  function normalizeCompanyKey(name) {
    return String(name || "").replace(/[（()）\s\u3000]/g, "");
  }

  function getInspectionForCompany(companyName) {
    const key = normalizeCompanyKey(companyName);
    if (!key || !state.inspectionRecords.length) return [];
    return state.inspectionRecords.filter((x) => normalizeCompanyKey(x.company) === key);
  }

  function getRegulatoryForCompany(companyName) {
    const key = normalizeCompanyKey(companyName);
    if (!key || !state.regulatoryRecords.length) return [];
    return state.regulatoryRecords.filter((x) => normalizeCompanyKey(x.company) === key);
  }

  function getFilteredRecords() {
    const { exchange, board, stage, province, keyword, sortBy } = state.filters;
    const kw = keyword.trim().toLowerCase();

    const list = state.records.filter((r) => {
      if (exchange !== "全部" && r.exchange !== exchange) return false;
      if (board !== "全部" && r.board !== board) return false;
      if (stage === "在审汇总") {
        if (!r.is_active) return false;
      } else if (stage !== "全部" && r.stage !== stage) {
        return false;
      }
      if (province !== "全部" && r.province !== province) return false;
      if (kw) {
        const inspList = getInspectionForCompany(r.company);
        const inspText = inspList.length ? `现场检查 ${inspList.map((x) => x.batch || "").join(" ")}` : "";
        const hay = [
          r.company,
          r.industry,
          r.province,
          r.exchange,
          r.board,
          inspText,
          ...(r.sponsors || []),
          ...(r.law_firms || []),
          ...(r.accounting_firms || []),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });

    list.sort((a, b) => (b[sortBy] || "").localeCompare(a[sortBy] || ""));
    return list;
  }

  function renderDynamicsTable() {
    const filtered = getFilteredRecords();
    const total = filtered.length;
    const { pageSize } = state.filters;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.filters.page > totalPages) state.filters.page = totalPages;

    const start = (state.filters.page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    $("dynamics-count").innerHTML = `为您找到 <b style="color:#1a73e8;font-size:15px;">${total.toLocaleString()}</b> 条相关结果`;

    const tbody = $("dynamics-tbody");
    if (!pageRows.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:36px;color:#8f959e;">未找到符合筛选条件的企业，请尝试放宽筛选条件</td></tr>`;
    } else {
      tbody.innerHTML = pageRows
        .map(
          (r, idx) => {
            const inspHits = getInspectionForCompany(r.company);
            const inspBadge = inspHits.length
              ? `<span class="tut-inline-badge inspection" title="${escapeHtml(inspHits.map((x) => `${x.lottery_date || ""} ${x.batch || ""}`).join("；"))}">现场检查${inspHits[0].batch ? " · " + escapeHtml(inspHits[0].batch) : ""}</span>`
              : "";
            return `
          <tr class="clickable-row" data-rec-idx="${idx}">
            <td><span class="row-index-badge">${start + idx + 1}</span></td>
            <td>
              <span class="company-link">${escapeHtml(r.company)}</span>${inspBadge}
              <div class="company-industry">${escapeHtml(r.industry || "")}</div>
            </td>
            <td style="white-space:nowrap;color:#5f6368;font-weight:500;">${escapeHtml(r.exchange)}</td>
            <td><span class="board-tag board-${escapeHtml(r.board)}">${escapeHtml(r.board)}</span></td>
            <td><span class="stage-tag stage-${escapeHtml(r.stage)}"><span class="status-dot"></span>${escapeHtml(r.raw_status || r.stage)}</span></td>
            <td style="white-space:nowrap;color:#3c4043;">${escapeHtml(r.province.replace(/省|市|维吾尔自治区|壮族自治区|回族自治区|自治区/g, ""))}</td>
            <td style="color:#3c4043;">${escapeHtml((r.sponsors || []).join("、") || "-")}</td>
            <td style="color:#5f6368;">${escapeHtml((r.law_firms || []).join("、") || "-")}</td>
            <td style="color:#5f6368;">${escapeHtml((r.accounting_firms || []).join("、") || "-")}</td>
            <td class="date-cell">${escapeHtml(r.update_date || "-")}</td>
            <td class="date-cell muted">${escapeHtml(r.accept_date || "-")}</td>
          </tr>`;
          }
        )
        .join("");

      tbody.querySelectorAll("tr.clickable-row").forEach((tr) => {
        tr.addEventListener("click", () => {
          const rec = pageRows[Number(tr.dataset.recIdx)];
          if (rec) openProjectDetail(rec);
        });
      });
    }

    $("page-info").textContent = `第 ${state.filters.page} / ${totalPages} 页`;
    $("btn-prev-page").disabled = state.filters.page <= 1;
    $("btn-next-page").disabled = state.filters.page >= totalPages;
    renderPageNumbers("btn-prev-page", state.filters.page, totalPages, (p) => {
      state.filters.page = p;
      renderDynamicsTable();
    });
  }

  // ==================== 项目详情页（方案 B 实时透传） ====================
  function buildFallbackTimeline(rec) {
    const levelMap = { "受理": 1, "问询": 2, "上市委": 3, "提交注册": 4, "注册同意": 5, "中止": 2, "终止": 2 };
    const lv = levelMap[rec.stage] || 1;
    return [
      { key: "受理", label: "已受理", date: rec.accept_date || "", done: lv >= 1 },
      { key: "问询", label: "已问询", date: lv === 2 ? (rec.update_date || "") : "", done: lv >= 2 },
      { key: "上市委", label: "上市委会议", date: lv === 3 ? (rec.update_date || "") : "", done: lv >= 3 },
      { key: "提交注册", label: "提交注册", date: lv === 4 ? (rec.update_date || "") : "", done: lv >= 4 },
      { key: "注册结果", label: "注册结果", date: lv === 5 ? (rec.update_date || "") : "", done: lv >= 5 },
    ];
  }

  function renderTimeline(steps) {
    $("detail-timeline").innerHTML = steps
      .map(
        (s) => `
        <div class="timeline-step ${s.done ? "done" : ""}">
          <div class="timeline-label">${escapeHtml(s.label)}</div>
          <div class="timeline-date">${escapeHtml(s.date || "")}</div>
          <div class="timeline-track">
            <div class="timeline-circle">✓</div>
          </div>
        </div>`
      )
      .join("");
  }

  function formatDetailInspectionInfo(companyName) {
    if (!state.loaded.inspection) return { text: "加载中...", isHighlight: false };
    const hits = getInspectionForCompany(companyName);
    if (!hits.length) return { text: "无", isHighlight: false };
    const text = hits
      .map((x) => {
        const parts = [];
        if (x.batch) parts.push(x.batch);
        const sub = [];
        if (x.lottery_date) sub.push(`抽签日期 ${x.lottery_date}`);
        if (x.ratio) sub.push(`抽签比例 ${x.ratio}`);
        return sub.length ? `${parts.join("")}（${sub.join("，")}）` : parts.join("");
      })
      .join("；");
    return { text: text || "是", isHighlight: true };
  }

  function formatDetailRegulatoryHtml(companyName) {
    if (!state.loaded.regulatory) return "加载中...";
    const hits = getRegulatoryForCompany(companyName);
    if (!hits.length) return "无";
    return `<div class="detail-reg-list">${hits
      .map((r) => {
        const prefix = [r.announce_date, r.regulator, r.category].filter(Boolean).join(" · ");
        const title = escapeHtml(r.title || "监管措施决定书");
        const docEl = r.pdf_url
          ? `<a href="${escapeHtml(r.pdf_url)}" target="_blank" rel="noopener noreferrer" title="打开官方原文 PDF">${title} ↗</a>`
          : `<span>${title}</span>`;
        return `<div class="detail-reg-item">${prefix ? `<span style="color:#5f6368;">[${escapeHtml(prefix)}]</span> ` : ""}${docEl}</div>`;
      })
      .join("")}</div>`;
  }

  function renderDetailInfo(info) {
    const inspMeta = formatDetailInspectionInfo(info.company);
    const regHtml = formatDetailRegulatoryHtml(info.company);
    const fields = [
      ["公司全称", info.company, false],
      ["行业类别", info.industry || "—", false],
      ["当前审核状态", info.status || "—", true],
      ["计划募集资金", info.plan_raise_yi || "正在实时获取...", true],
      ["保荐机构", info.sponsor || "—", false],
      ["保荐代表人", info.sponsor_reps || "正在实时获取...", false],
      ["会计师事务所", info.accounting_firm || "—", false],
      ["签字会计师", info.accountants || "正在实时获取...", false],
      ["律师事务所", info.law_firm || "—", false],
      ["签字律师", info.lawyers || "正在实时获取...", false],
      ["受理日期", info.accept_date || "—", false],
      ["板块定位", info.board_position || "—", false],
      ["注册地", info.province || "—", false],
      ["现场检查", inspMeta.text, inspMeta.isHighlight],
      [
        "官方审核页",
        info.source_url
          ? `<a href="${escapeHtml(info.source_url)}" target="_blank" rel="noopener noreferrer">前往 ${escapeHtml(info.exchange)} 官网查看原页 ↗</a>`
          : "—",
        false,
        true,
      ],
      ["监管措施", regHtml, false, true],
    ];

    $("detail-info-grid").innerHTML = fields
      .map(
        ([label, val, isHighlight, isHtml]) => `
        <div class="info-item">
          <span class="info-label">${label}</span>
          <span class="info-value ${isHighlight ? "highlight" : ""}">${isHtml ? val : escapeHtml(val)}</span>
        </div>`
      )
      .join("");
  }

  function renderDocuments(docs) {
    const countText = docs && docs.length ? ` (${docs.length})` : "";
    $("detail-docs-count").textContent = countText;

    const buildListHtml = (items) => {
      if (!items || !items.length) {
        return `<div style="color:#8f959e;font-size:13px;padding:10px 0;">暂无实时信披文件（可点击上方“官方审核页”直达交易所查看）</div>`;
      }
      return items
        .map(
          (doc) => `
          <div class="doc-row">
            <div class="doc-left">
              <span class="doc-cat">${escapeHtml(doc.category || "公告")}</span>
              <a class="doc-link" href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(doc.title)}">${escapeHtml(doc.title)}</a>
            </div>
            <span class="doc-date">${escapeHtml(doc.date || "")}</span>
          </div>`
        )
        .join("");
    };

    $("detail-docs-preview").innerHTML = buildListHtml((docs || []).slice(0, 6));
    $("detail-docs-full").innerHTML = buildListHtml(docs || []);
  }

  async function switchDetailTab(dtab) {
    const safeTab = dtab === "docs" ? "docs" : "info";
    document.querySelectorAll(".detail-tab").forEach((b) => b.classList.toggle("active", b.dataset.dtab === safeTab));
    $("dtab-info").classList.toggle("hidden", safeTab !== "info");
    $("dtab-docs").classList.toggle("hidden", safeTab !== "docs");
  }

  async function openProjectDetail(rec, defaultDetailTab = "info", options = {}) {
    if (state.activeTab) state.previousTab = state.activeTab;
    state.currentDetailRec = rec;
    if (!options.skipHistory) {
      const qs = new URLSearchParams({ company: rec.company || "" });
      if (rec.exchange) qs.set("exchange", rec.exchange);
      updateBrowserUrl(`/ipo-review/a-stock/detail?${qs.toString()}`, `${rec.company} · 项目详情`, Boolean(options.replaceHistory));
    }
    $("view-overview").classList.add("hidden");
    $("view-dynamics").classList.add("hidden");
    $("view-committee").classList.add("hidden");
    $("view-issuance").classList.add("hidden");
    if ($("view-inspection")) $("view-inspection").classList.add("hidden");
    if ($("view-regulatory")) $("view-regulatory").classList.add("hidden");
    if ($("view-hk")) $("view-hk").classList.add("hidden");
    $("view-tutoring").classList.add("hidden");
    $("view-tutoring-detail").classList.add("hidden");
    $("view-neeq").classList.add("hidden");
    $("view-placeholder").classList.add("hidden");
    $("view-detail").classList.remove("hidden");
    switchDetailTab(defaultDetailTab);
    window.scrollTo({ top: 0, behavior: "smooth" });

    // 1. 先用本地列表数据瞬开骨架，零白屏
    $("detail-company-name").textContent = rec.company;
    $("detail-exchange-badge").textContent = rec.exchange;
    $("detail-board-badge").textContent = rec.board;
    $("detail-fallback-notice").classList.add("hidden");
    $("detail-live-dot").className = "source-dot demo";
    $("detail-live-text").textContent = "正在通过方案 B 实时透传交易所详情...";

    const baseInfo = {
      company: rec.company,
      exchange: rec.exchange,
      board: rec.board,
      status: rec.raw_status || rec.stage,
      industry: rec.industry,
      province: rec.province,
      plan_raise_yi: "实时获取中...",
      sponsor: normalizeBrokerName((rec.sponsors || []).join("、")) || "—",
      sponsor_reps: "实时获取中...",
      accounting_firm: (rec.accounting_firms || []).join("、") || "—",
      accountants: "实时获取中...",
      law_firm: (rec.law_firms || []).join("、") || "—",
      lawyers: "实时获取中...",
      accept_date: rec.accept_date || "—",
      board_position: rec.board,
      source_url: rec.source_url,
    };
    renderTimeline(buildFallbackTimeline(rec));
    renderDetailInfo(baseInfo);
    $("detail-docs-preview").innerHTML = `<div style="color:#8f959e;font-size:13px;">正在实时拉取官方信披 PDF 列表...</div>`;

    const cacheKey = `${rec.exchange}::${rec.company}`;
    let activeInfo = baseInfo;
    if (!state.loaded.inspection || !state.loaded.regulatory) {
      Promise.all([ensureDataset("inspection"), ensureDataset("regulatory")]).then(() => {
        if (state.currentDetailRec === rec) {
          if (state.detailCache[cacheKey]) {
            applyLiveDetail(state.detailCache[cacheKey], rec);
          } else {
            renderDetailInfo(activeInfo);
          }
        }
      });
    }

    // 2. 命中前端会话缓存直接渲染
    if (state.detailCache[cacheKey]) {
      applyLiveDetail(state.detailCache[cacheKey], rec);
      return;
    }

    // 3. 调用方案 B 实时透传接口（本地 server.py 或 Cloudflare Pages Function）
    try {
      const qs = new URLSearchParams({
        company: rec.company,
        exchange: rec.exchange,
        board: rec.board,
        code: rec.security_code || "",
      });
      const resp = await fetch(`/api/project-detail?${qs.toString()}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const live = await resp.json();
      if (!live || !live.ok) throw new Error((live && live.error) || "接口未返回有效数据");
      state.detailCache[cacheKey] = live;
      applyLiveDetail(live, rec);
    } catch (err) {
      // 优雅降级（例如直接双击 file:// 打开未启动 server.py）
      $("detail-live-dot").className = "source-dot demo";
      $("detail-live-text").textContent = "本地基础模式（未连接实时透传接口）";
      $("detail-fallback-notice").innerHTML =
        `当前未检测到 <code>/api/project-detail</code> 实时透传服务，已展示本地快照基础信息。如需实时获取<b>计划募集资金、保代/签字律师/签字会计师、精确时间轴与招股书 PDF</b>，请在项目目录运行 <code>python3 server.py</code> 后访问 <code>http://127.0.0.1:8080</code>，或直接部署至 Cloudflare Pages。`;
      $("detail-fallback-notice").classList.remove("hidden");

      activeInfo = {
        ...baseInfo,
        plan_raise_yi: "需启动 server.py 或部署 Cloudflare Pages 实时获取",
        sponsor_reps: "需实时透传获取",
        accountants: "需实时透传获取",
        lawyers: "需实时透传获取",
      };
      renderDetailInfo(activeInfo);
      renderDocuments([]);
    }
  }

  function applyLiveDetail(live, rec) {
    $("detail-live-dot").className = "source-dot";
    const cleanSource = String(live.live_source || "交易所实时直连").replace(/（[^）]*）|\([^)]*\)/g, "").trim();
    $("detail-live-text").textContent = cleanSource || "交易所实时直连";
    $("detail-fallback-notice").classList.add("hidden");
    if (live.timeline && live.timeline.length) {
      renderTimeline(live.timeline);
    }
    renderDetailInfo({
      company: live.company || rec.company,
      exchange: live.exchange || rec.exchange,
      board: live.board || rec.board,
      status: live.status || rec.raw_status || rec.stage,
      industry: live.industry && live.industry !== "—" ? live.industry : rec.industry,
      province: live.province && live.province !== "—" ? live.province : rec.province,
      plan_raise_yi: live.plan_raise_yi || "暂无数据",
      sponsor: normalizeBrokerName(live.sponsor && live.sponsor !== "—" ? live.sponsor : (rec.sponsors || []).join("、")),
      sponsor_reps: live.sponsor_reps || "—",
      accounting_firm: live.accounting_firm && live.accounting_firm !== "—" ? live.accounting_firm : (rec.accounting_firms || []).join("、"),
      accountants: live.accountants || "—",
      law_firm: live.law_firm && live.law_firm !== "—" ? live.law_firm : (rec.law_firms || []).join("、"),
      lawyers: live.lawyers || "—",
      accept_date: (live.timeline && live.timeline[0] && live.timeline[0].date) || rec.accept_date || "—",
      board_position: live.board_position || rec.board,
      source_url: live.source_url || rec.source_url,
    });
    renderDocuments(live.documents || []);
  }

  function jumpToDynamics(nextFilters) {
    Object.assign(state.filters, nextFilters, { page: 1 });
    switchSubTab("审核动态");
    syncDynamicsFilterUI();
    renderDynamicsTable();
  }

  function exportFilteredExcel() {
    const filtered = getFilteredRecords();
    const headers = ["序号", "发行人全称", "场所", "板块", "审核状态", "注册地", "所属行业", "保荐机构", "律师事务所", "会计师事务所", "更新日期", "受理日期"];
    const rows = filtered.map((r, idx) => [
      idx + 1,
      r.company,
      r.exchange,
      r.board,
      r.raw_status || r.stage,
      r.province,
      r.industry,
      (r.sponsors || []).join("、"),
      (r.law_firms || []).join("、"),
      (r.accounting_firms || []).join("、"),
      r.update_date,
      r.accept_date,
    ]);
    const dateTag = (state.meta && state.meta.update_date) || "export";

    // 优先使用 SheetJS 导出标准 .xlsx 文件
    if (window.XLSX) {
      const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = [
        { wch: 6 }, { wch: 34 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
        { wch: 12 }, { wch: 26 }, { wch: 22 }, { wch: 24 }, { wch: 24 },
        { wch: 13 }, { wch: 13 },
      ];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "A股IPO审核动态");
      window.XLSX.writeFile(wb, `A股IPO审核动态_${dateTag}.xlsx`);
      return;
    }

    // 离线兜底：导出 Excel 可直接打开的 HTML 表格 .xls
    const tableHtml =
      `<html><head><meta charset="UTF-8"></head><body><table>` +
      `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>` +
      rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("") +
      `</table></body></html>`;
    const blob = new Blob(["\uFEFF" + tableHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `A股IPO审核动态_${dateTag}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ==================== 二期：上市委审议 ====================
  function updateCommitteeChipCounts() {
    const bdCounts = {};
    const resCounts = {};
    const yrCounts = {};
    for (const r of state.committeeRecords) {
      bdCounts[r.board] = (bdCounts[r.board] || 0) + 1;
      resCounts[r.result] = (resCounts[r.result] || 0) + 1;
      const yr = (r.review_date || "").slice(0, 4);
      if (yr) yrCounts[yr] = (yrCounts[yr] || 0) + 1;
    }
    document.querySelectorAll("#cm-board-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}<span class="chip-count">(${bdCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#cm-result-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}<span class="chip-count">(${resCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#cm-year-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}年<span class="chip-count">(${yrCounts[v] || 0})</span>`;
    });
  }

  function getFilteredCommittee() {
    const { board, result, year, keyword } = state.cmFilters;
    const kw = keyword.trim().toLowerCase();
    return state.committeeRecords.filter((r) => {
      if (board !== "全部" && r.board !== board) return false;
      if (result !== "全部" && r.result !== result) return false;
      if (year !== "全部" && !(r.review_date || "").startsWith(year)) return false;
      if (kw) {
        const hay = [r.company, r.abbr, r.sponsor, ...(r.members || [])].join(" ").toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }

  function renderCommitteeKPI(filtered) {
    const total = filtered.length;
    const passed = filtered.filter((r) => r.result === "上会通过").length;
    const deferred = filtered.filter((r) => r.result === "暂缓表决").length;
    const rejected = filtered.filter((r) => r.result === "未通过" || r.result === "取消审核").length;
    const decided = passed + deferred + rejected;
    const passRate = decided > 0 ? ((passed / decided) * 100).toFixed(1) : "0.0";

    $("committee-kpi-grid").innerHTML = `
      <div class="kpi-card kpi-blue">
        <div class="kpi-label">当前筛选上会家数</div>
        <div class="kpi-value">${total.toLocaleString()}</div>
        <div class="kpi-sub">全面注册制（2023年至今）</div>
      </div>
      <div class="kpi-card kpi-green">
        <div class="kpi-label">审议通过 / 综合过会率</div>
        <div class="kpi-value">${passRate}%</div>
        <div class="kpi-sub">上会通过 ${passed} 家</div>
      </div>
      <div class="kpi-card kpi-amber">
        <div class="kpi-label">暂缓表决</div>
        <div class="kpi-value">${deferred}</div>
        <div class="kpi-sub">占比 ${total ? ((deferred / total) * 100).toFixed(1) : "0.0"}%</div>
      </div>
      <div class="kpi-card kpi-red">
        <div class="kpi-label">未通过 / 取消审核</div>
        <div class="kpi-value">${rejected}</div>
        <div class="kpi-sub">占比 ${total ? ((rejected / total) * 100).toFixed(1) : "0.0"}%</div>
      </div>
    `;
  }

  function renderCommitteeTable() {
    const filtered = getFilteredCommittee();
    renderCommitteeKPI(filtered);

    const total = filtered.length;
    const { pageSize } = state.cmFilters;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.cmFilters.page > totalPages) state.cmFilters.page = totalPages;

    const start = (state.cmFilters.page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    $("cm-count").innerHTML = `为您找到 <b style="color:#1a73e8;font-size:15px;">${total.toLocaleString()}</b> 条审议记录`;

    const tbody = $("cm-tbody");
    if (!pageRows.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:36px;color:#80868b;">未找到符合条件的上市委审议记录</td></tr>`;
    } else {
      tbody.innerHTML = pageRows
        .map(
          (r, idx) => `
          <tr class="clickable-row" data-cm-idx="${idx}">
            <td><span class="row-index-badge">${start + idx + 1}</span></td>
            <td><span class="company-link">${escapeHtml(r.company)}</span></td>
            <td><span class="board-tag board-${escapeHtml(r.board)}">${escapeHtml(r.board)}</span></td>
            <td class="date-cell">${escapeHtml(r.review_date || "-")}</td>
            <td><span class="stage-tag res-${escapeHtml(r.result)}"><span class="status-dot"></span>${escapeHtml(r.result)}</span></td>
            <td class="num-cell">${r.plan_raise_yi !== null && r.plan_raise_yi !== undefined ? r.plan_raise_yi.toFixed(2) : "—"}</td>
            <td class="num-cell">${r.issue_ratio_pct !== null && r.issue_ratio_pct !== undefined ? r.issue_ratio_pct.toFixed(2) + "%" : "—"}</td>
            <td style="color:#3c4043;">${escapeHtml(r.sponsor || "—")}</td>
            <td class="member-cell">${escapeHtml((r.members || []).join("、") || "—")}</td>
            <td class="date-cell muted">${escapeHtml(r.listing_date || "—")}</td>
          </tr>`
        )
        .join("");

      tbody.querySelectorAll("tr.clickable-row").forEach((tr) => {
        tr.addEventListener("click", async () => {
          const item = pageRows[Number(tr.dataset.cmIdx)];
          if (!item) return;
          if (!state.loaded.ipo) await ensureDataset("ipo");
          const norm = String(item.company || "").replace(/[（()）\s]/g, "");
          const matched = state.records.find((x) => String(x.company || "").replace(/[（()）\s]/g, "") === norm);
          openProjectDetail(
            matched || {
              company: item.company,
              exchange: item.exchange,
              board: item.board,
              stage: item.result === "上会通过" ? "上市委" : "中止",
              raw_status: item.result,
              security_code: item.security_code || "",
              province: "—",
              industry: "—",
              sponsors: item.sponsor ? [item.sponsor] : [],
              law_firms: [],
              accounting_firms: [],
              accept_date: "",
              update_date: item.review_date,
              source_url: "",
            }
          );
        });
      });
    }

    $("cm-page-info").textContent = `第 ${state.cmFilters.page} / ${totalPages} 页`;
    $("cm-prev-page").disabled = state.cmFilters.page <= 1;
    $("cm-next-page").disabled = state.cmFilters.page >= totalPages;
    renderPageNumbers("cm-prev-page", state.cmFilters.page, totalPages, (p) => {
      state.cmFilters.page = p;
      renderCommitteeTable();
    });
  }

  function exportCommitteeExcel() {
    const filtered = getFilteredCommittee();
    const headers = ["序号", "发行人全称", "板块", "上会日期", "审议结果", "拟融资(亿元)", "发行比例(%)", "保荐机构", "参会委员", "上市日期"];
    const rows = filtered.map((r, idx) => [
      idx + 1,
      r.company,
      r.board,
      r.review_date,
      r.result,
      r.plan_raise_yi ?? "",
      r.issue_ratio_pct ?? "",
      r.sponsor,
      (r.members || []).join("、"),
      r.listing_date,
    ]);
    exportGenericExcel(headers, rows, "上市委审议", `A股IPO上市委审议_${(state.meta && state.meta.update_date) || "export"}`);
  }

  // ==================== 二期：发行动态 ====================
  function updateIssuanceChipCounts() {
    const bdCounts = {};
    const stCounts = {};
    const yrCounts = {};
    for (const r of state.issuanceRecords) {
      bdCounts[r.board] = (bdCounts[r.board] || 0) + 1;
      stCounts[r.status] = (stCounts[r.status] || 0) + 1;
      const yr = (r.apply_date || "").slice(0, 4);
      if (yr) yrCounts[yr] = (yrCounts[yr] || 0) + 1;
    }
    document.querySelectorAll("#iss-board-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}<span class="chip-count">(${bdCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#iss-status-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}<span class="chip-count">(${stCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#iss-year-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}年<span class="chip-count">(${yrCounts[v] || 0})</span>`;
    });
  }

  function getFilteredIssuance() {
    const { board, status, year, keyword } = state.issFilters;
    const kw = keyword.trim().toLowerCase();
    return state.issuanceRecords.filter((r) => {
      if (board !== "全部" && r.board !== board) return false;
      if (status !== "全部" && r.status !== status) return false;
      if (year !== "全部" && !(r.apply_date || "").startsWith(year)) return false;
      if (kw) {
        const hay = [r.security_code, r.abbr, r.company, r.underwriter, r.industry].join(" ").toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }

  function renderIssuanceKPI(filtered) {
    const total = filtered.length;
    const upcoming = filtered.filter((r) => r.status === "待申购" || r.status === "申购中" || r.status === "待上市").length;
    const totalRaise = filtered.reduce((acc, r) => acc + (r.raise_yi || 0), 0);
    const chgList = filtered.map((r) => r.first_day_chg).filter((v) => v !== null && v !== undefined);
    const avgChg = chgList.length ? chgList.reduce((a, b) => a + b, 0) / chgList.length : null;

    $("issuance-kpi-grid").innerHTML = `
      <div class="kpi-card kpi-blue">
        <div class="kpi-label">新股发行家数</div>
        <div class="kpi-value">${total.toLocaleString()}</div>
        <div class="kpi-sub">全面注册制（2023年至今）</div>
      </div>
      <div class="kpi-card kpi-amber">
        <div class="kpi-label">待申购 / 待上市</div>
        <div class="kpi-value">${upcoming}</div>
        <div class="kpi-sub">近期活跃新股排期</div>
      </div>
      <div class="kpi-card kpi-green">
        <div class="kpi-label">已披露累计募资（亿元）</div>
        <div class="kpi-value">${totalRaise.toFixed(1)}</div>
        <div class="kpi-sub">覆盖沪深北各板块</div>
      </div>
      <div class="kpi-card ${avgChg !== null && avgChg >= 0 ? "kpi-red" : "kpi-green"}">
        <div class="kpi-label">已上市平均首日涨跌幅</div>
        <div class="kpi-value">${avgChg !== null ? (avgChg >= 0 ? "+" : "") + avgChg.toFixed(1) + "%" : "—"}</div>
        <div class="kpi-sub">样本 ${chgList.length} 家已上市新股</div>
      </div>
    `;
  }

  function renderIssuanceTable() {
    const filtered = getFilteredIssuance();
    renderIssuanceKPI(filtered);

    const total = filtered.length;
    const { pageSize } = state.issFilters;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.issFilters.page > totalPages) state.issFilters.page = totalPages;

    const start = (state.issFilters.page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    $("iss-count").innerHTML = `为您找到 <b style="color:#1a73e8;font-size:15px;">${total.toLocaleString()}</b> 条新股发行记录`;

    const tbody = $("iss-tbody");
    if (!pageRows.length) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:36px;color:#80868b;">未找到符合条件的新股发行记录</td></tr>`;
    } else {
      tbody.innerHTML = pageRows
        .map((r, idx) => {
          const peText =
            r.issue_pe !== null
              ? `${r.issue_pe.toFixed(2)} / ${r.industry_pe !== null ? r.industry_pe.toFixed(2) : "—"}`
              : "—";
          const chgHtml =
            r.first_day_chg !== null
              ? `<span class="${r.first_day_chg >= 0 ? "chg-up" : "chg-down"}">${r.first_day_chg >= 0 ? "+" : ""}${r.first_day_chg.toFixed(2)}%</span>`
              : `<span style="color:#94a3b8;">—</span>`;
          return `
            <tr class="clickable-row" data-iss-idx="${idx}">
              <td><span class="row-index-badge">${start + idx + 1}</span></td>
              <td>
                <div><span class="stock-code-pill">${escapeHtml(r.security_code)}</span><span class="company-link">${escapeHtml(r.abbr)}</span></div>
                <div class="company-industry">${escapeHtml(r.company)}</div>
              </td>
              <td><span class="board-tag board-${escapeHtml(r.board)}">${escapeHtml(r.board)}</span></td>
              <td><span class="stage-tag iss-${escapeHtml(r.status)}"><span class="status-dot"></span>${escapeHtml(r.status)}</span></td>
              <td class="date-cell">${escapeHtml(r.apply_date || "—")}</td>
              <td class="date-cell muted">${escapeHtml(r.listing_date || "待定")}</td>
              <td class="num-cell">${r.issue_price !== null ? r.issue_price.toFixed(2) : "待定"}</td>
              <td class="num-cell">${peText}</td>
              <td class="num-cell">${r.lwr_pct !== null ? r.lwr_pct.toFixed(4) + "%" : "—"}</td>
              <td class="num-cell">${r.raise_yi !== null ? r.raise_yi.toFixed(2) : "—"}</td>
              <td>${chgHtml}</td>
              <td style="color:#3c4043;">${escapeHtml(r.underwriter || "—")}</td>
            </tr>`;
        })
        .join("");

      tbody.querySelectorAll("tr.clickable-row").forEach((tr) => {
        tr.addEventListener("click", async () => {
          const item = pageRows[Number(tr.dataset.issIdx)];
          if (!item) return;
          if (!state.loaded.ipo) await ensureDataset("ipo");
          const norm = String(item.company || "").replace(/[（()）\s]/g, "");
          const matched = state.records.find(
            (x) =>
              (item.security_code && x.security_code === item.security_code) ||
              (norm && String(x.company || "").replace(/[（()）\s]/g, "") === norm)
          );
          openProjectDetail(
            matched || {
              company: item.company || item.abbr,
              exchange: item.exchange,
              board: item.board,
              stage: "注册同意",
              raw_status: item.status,
              security_code: item.security_code,
              province: "—",
              industry: item.industry || "—",
              sponsors: item.underwriter ? [item.underwriter] : [],
              law_firms: [],
              accounting_firms: [],
              accept_date: "",
              update_date: item.listing_date || item.apply_date,
              source_url: "",
            },
            "info"
          );
        });
      });
    }

    $("iss-page-info").textContent = `第 ${state.issFilters.page} / ${totalPages} 页`;
    $("iss-prev-page").disabled = state.issFilters.page <= 1;
    $("iss-next-page").disabled = state.issFilters.page >= totalPages;
    renderPageNumbers("iss-prev-page", state.issFilters.page, totalPages, (p) => {
      state.issFilters.page = p;
      renderIssuanceTable();
    });
  }

  function exportIssuanceExcel() {
    const filtered = getFilteredIssuance();
    const headers = ["序号", "股票代码", "股票简称", "公司全称", "板块", "发行状态", "申购日期", "上市日期", "发行价(元)", "发行PE", "行业PE", "网上中签率(%)", "募资(亿元)", "首日涨跌幅(%)", "主承销商"];
    const rows = filtered.map((r, idx) => [
      idx + 1,
      r.security_code,
      r.abbr,
      r.company,
      r.board,
      r.status,
      r.apply_date,
      r.listing_date,
      r.issue_price ?? "",
      r.issue_pe ?? "",
      r.industry_pe ?? "",
      r.lwr_pct ?? "",
      r.raise_yi ?? "",
      r.first_day_chg ?? "",
      r.underwriter,
    ]);
    exportGenericExcel(headers, rows, "新股发行动态", `A股IPO发行动态_${(state.meta && state.meta.update_date) || "export"}`);
  }

  function exportGenericExcel(headers, rows, sheetName, filenameBase) {
    if (window.XLSX) {
      const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
      window.XLSX.writeFile(wb, `${filenameBase}.xlsx`);
      return;
    }
    const tableHtml =
      `<html><head><meta charset="UTF-8"></head><body><table>` +
      `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>` +
      rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("") +
      `</table></body></html>`;
    const blob = new Blob(["\uFEFF" + tableHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameBase}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ==================== 全市场辅导备案（图 1 概览页 + 图 2/3 详情页） ====================
  function updateTutoringChipCounts() {
    const stageCounts = {
      "辅导备案": 0,
      "辅导中期": 0,
      "辅导验收": 0,
      "未受理": 0,
      "已受理": 0,
      "撤回后重新报辅导": 0,
      "辅导终止": 0,
    };
    const brCounts = {};

    for (const r of state.tutoringRecords) {
      const st = r.stage || r.status || "辅导备案";
      if (st === "辅导备案") stageCounts["辅导备案"] += 1;
      else if (st === "辅导中期") stageCounts["辅导中期"] += 1;
      else if (st === "辅导验收") {
        stageCounts["辅导验收"] += 1;
        if (!r.ipo_accepted) stageCounts["未受理"] += 1;
      } else if (st === "辅导终止") {
        stageCounts["辅导终止"] += 1;
      }
      if (r.ipo_accepted) stageCounts["已受理"] += 1;
      if (r.re_tutoring) stageCounts["撤回后重新报辅导"] += 1;
      if (r.bureau && r.bureau !== "—") {
        brCounts[r.bureau] = (brCounts[r.bureau] || 0) + 1;
      }
    }

    document.querySelectorAll("#tut-stage-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") {
        b.innerHTML = `${v}<span class="chip-count">(${stageCounts[v] || 0})</span>`;
      }
    });

    const sortedBureaus = Object.entries(brCounts).sort((a, b) => b[1] - a[1]);
    const top6 = sortedBureaus.slice(0, 6);
    const rest = sortedBureaus.slice(6);

    const mainWrap = $("tut-bureau-chips");
    const moreWrap = $("tut-bureau-more");
    if (mainWrap && moreWrap) {
      let mainHtml = `<button class="chip-btn${state.tutFilters.bureau === "全部" ? " active" : ""}" data-val="全部">全部</button>`;
      for (const [bName, cnt] of top6) {
        const activeCls = state.tutFilters.bureau === bName ? " active" : "";
        mainHtml += `<button class="chip-btn${activeCls}" data-val="${escapeHtml(bName)}">${escapeHtml(bName)}<span class="chip-count">(${cnt})</span></button>`;
      }
      if (rest.length > 0) {
        const arrow = state.tutBureauExpanded ? "∧" : "∨";
        const label = state.tutBureauExpanded ? "收起" : `展开更多 (${rest.length})`;
        mainHtml += `<button id="tut-bureau-toggle" class="chip-expand-btn" type="button">${label} ${arrow}</button>`;
      }
      mainWrap.innerHTML = mainHtml;

      moreWrap.innerHTML = rest
        .map(([bName, cnt]) => {
          const activeCls = state.tutFilters.bureau === bName ? " active" : "";
          return `<button class="chip-btn${activeCls}" data-val="${escapeHtml(bName)}">${escapeHtml(bName)}<span class="chip-count">(${cnt})</span></button>`;
        })
        .join("");
      moreWrap.classList.toggle("hidden", !state.tutBureauExpanded || !rest.length);
    }
  }

  function getFilteredTutoring() {
    const { board, stage, bureau, keyword } = state.tutFilters;
    const kw = keyword.trim().toLowerCase();
    const list = state.tutoringRecords.filter((r) => {
      if (board !== "全部" && (r.board || "沪深") !== board) return false;
      if (stage !== "全部") {
        const st = r.stage || "辅导备案";
        if (stage === "未受理") {
          if (!(st === "辅导验收" && !r.ipo_accepted)) return false;
        } else if (stage === "已受理") {
          if (!r.ipo_accepted) return false;
        } else if (stage === "撤回后重新报辅导") {
          if (!r.re_tutoring) return false;
        } else if (st !== stage) {
          return false;
        }
      }
      if (bureau !== "全部" && r.bureau !== bureau) return false;
      if (kw) {
        const hay = [
          r.company,
          r.board,
          r.stage,
          r.status,
          r.sponsor,
          r.sponsor_full,
          r.law_firm,
          r.law_firm_short,
          r.acct_firm,
          r.acct_firm_short,
          r.bureau,
          r.industry,
          r.report_title,
          r.prev_filing,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      const va = a.update_date && a.update_date !== "—" ? a.update_date : "";
      const vb = b.update_date && b.update_date !== "—" ? b.update_date : "";
      if (va !== vb) {
        if (!va) return 1;
        if (!vb) return -1;
        return vb.localeCompare(va);
      }
      const ra = a.record_date && a.record_date !== "—" ? a.record_date : "";
      const rb = b.record_date && b.record_date !== "—" ? b.record_date : "";
      return rb.localeCompare(ra);
    });
    return list;
  }

  function renderTutoringTable() {
    const filtered = getFilteredTutoring();

    const total = filtered.length;
    const { pageSize } = state.tutFilters;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.tutFilters.page > totalPages) state.tutFilters.page = totalPages;

    const start = (state.tutFilters.page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    $("tut-count").innerHTML = `为您找到 <b style="color:#1a73e8;font-size:15px;">${total.toLocaleString()}</b> 条相关结果`;

    const tbody = $("tut-tbody");
    if (!pageRows.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:36px;color:#80868b;">未找到符合条件的辅导备案企业</td></tr>`;
    } else {
      tbody.innerHTML = pageRows
        .map((r, idx) => {
          const st = r.stage || "辅导备案";
          const stClass = `tut-${escapeHtml(st)}`;
          const board = r.board || "沪深";
          let statusInlineBadge = "";
          if (r.ipo_accepted) {
            statusInlineBadge += `<span class="tut-inline-badge accepted">已受理</span>`;
          } else if (st === "辅导验收") {
            statusInlineBadge += `<span class="tut-inline-badge">尚未受理</span>`;
          }
          if (r.re_tutoring) {
            statusInlineBadge += `<span class="tut-inline-badge retutor">撤回后重新报辅导</span>`;
          }
          const lawShort = r.law_firm_short && r.law_firm_short !== "—" ? r.law_firm_short : "—";
          const acctShort = r.acct_firm_short && r.acct_firm_short !== "—" ? r.acct_firm_short : "—";

          return `
            <tr class="clickable-row" data-tut-company="${escapeHtml(r.company)}">
              <td><span class="row-index-badge">${start + idx + 1}</span></td>
              <td>
                <span class="company-link">${escapeHtml(r.company)}</span>${statusInlineBadge}
              </td>
              <td><span class="board-tag board-${escapeHtml(board)}">${escapeHtml(board)}</span></td>
              <td><span class="stage-tag ${stClass}"><span class="status-dot"></span>${escapeHtml(st)}</span></td>
              <td style="color:#3c4043;">${escapeHtml(r.sponsor || "—")}</td>
              <td style="color:#3c4043;">${escapeHtml(lawShort)}</td>
              <td style="color:#3c4043;">${escapeHtml(acctShort)}</td>
              <td><span class="bureau-pill">${escapeHtml(r.bureau || "—")}</span></td>
              <td class="date-cell">${escapeHtml(r.update_date || "—")}</td>
              <td class="date-cell muted">${escapeHtml(r.record_date || "—")}</td>
            </tr>`;
        })
        .join("");

      tbody.querySelectorAll("tr[data-tut-company]").forEach((tr) => {
        tr.addEventListener("click", () => {
          const comp = tr.dataset.tutCompany;
          const hit = state.tutoringRecords.find((x) => x.company === comp);
          if (hit) openTutoringDetail(hit);
        });
      });
    }

    $("tut-page-info").textContent = `第 ${state.tutFilters.page} / ${totalPages} 页`;
    $("tut-prev-page").disabled = state.tutFilters.page <= 1;
    $("tut-next-page").disabled = state.tutFilters.page >= totalPages;
    renderPageNumbers("tut-prev-page", state.tutFilters.page, totalPages, (p) => {
      state.tutFilters.page = p;
      renderTutoringTable();
    });
  }

  function renderTutTimeline(rec) {
    const ms = rec.milestones || {};
    const st = rec.stage || "辅导备案";
    const isTerminated = st === "辅导终止";
    const isAccepted = st === "辅导验收";
    const isMid = st === "辅导中期";

    const steps = [
      {
        label: "辅导备案",
        date: ms.filing_date || (rec.record_date !== "—" ? rec.record_date : "") || "",
        done: true,
        partial: st === "辅导备案",
        terminated: false,
      },
      {
        label: "辅导中期",
        date: ms.mid_date || "",
        done: isMid || isAccepted,
        partial: isMid,
        terminated: false,
      },
      {
        label: isTerminated ? "辅导终止" : "辅导验收",
        date: ms.accept_date || (isTerminated && rec.update_date !== "—" ? rec.update_date : ""),
        done: isAccepted,
        partial: false,
        terminated: isTerminated,
      },
    ];

    $("tut-detail-timeline").innerHTML = steps
      .map((s) => {
        const cls = [
          "timeline-step",
          s.done ? "done" : "",
          s.partial ? "partial" : "",
          s.terminated ? "terminated" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const icon = s.terminated ? "✕" : "✓";
        return `
          <div class="${cls}">
            <div class="timeline-label">${escapeHtml(s.label)}</div>
            <div class="timeline-date">${escapeHtml(s.date)}</div>
            <div class="timeline-track">
              <div class="timeline-circle">${icon}</div>
            </div>
          </div>`;
      })
      .join("");
  }

  function renderTutInfoGrid(rec) {
    const hasPdf = Boolean(rec.filing_pdf_url || rec.pdf_url);
    const fallbackText = hasPdf ? "详见下方辅导备案报告" : "—";

    const valOrFallback = (v, defaultEmpty) => {
      if (v && v !== "—") return v;
      return defaultEmpty;
    };

    const items = [
      ["成立时间", valOrFallback(rec.founded_date, fallbackText)],
      ["辅导券商", normalizeBrokerName(rec.sponsor || rec.sponsor_full) || "—"],
      ["注册地址", valOrFallback(rec.reg_address, fallbackText)],
      ["律师事务所", valOrFallback(rec.law_firm, fallbackText)],
      ["注册资本", valOrFallback(rec.reg_capital, fallbackText)],
      ["会计师事务所", valOrFallback(rec.acct_firm, fallbackText)],
      ["控股股东", valOrFallback(rec.controlling_shareholder, fallbackText)],
      ["前次申报", rec.prev_filing || (rec.pdf_parsed ? "无" : fallbackText)],
      ["行业分类", valOrFallback(rec.industry, fallbackText)],
      ["挂牌情况", valOrFallback(rec.neeq_status, rec.pdf_parsed ? "无" : fallbackText)],
    ];

    $("tut-detail-info-grid").innerHTML = items
      .map(([label, val]) => {
        const isMuted = val === fallbackText && val !== "—";
        return `
          <div class="info-item">
            <span class="info-label">${label}</span>
            <span class="info-value${isMuted ? " muted" : ""}" style="${isMuted ? "color:#80868b;" : ""}">${escapeHtml(val)}</span>
          </div>`;
      })
      .join("");
  }

  function renderTutDisclosures(rec) {
    const reports = Array.isArray(rec.reports) && rec.reports.length
      ? rec.reports
      : rec.pdf_url
      ? [{
          category: rec.report_type && rec.report_type.includes("进展") ? "中期进展报告" : rec.report_type && (rec.report_type.includes("验收") || rec.report_type.includes("完成")) ? "辅导验收报告" : "辅导备案报告",
          title: rec.report_title || rec.report_type || "辅导报告",
          date: rec.update_date || rec.record_date || "",
          pdf_url: rec.pdf_url,
        }]
      : [];

    const categories = ["辅导备案报告", "中期进展报告", "辅导验收报告"];
    let seq = 1;
    const rowsHtml = [];

    for (const cat of categories) {
      const catRows = reports
        .filter((r) => (r.category || "辅导备案报告") === cat)
        .slice()
        .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

      if (!catRows.length) {
        rowsHtml.push(`
          <tr>
            <td class="cat-cell">${cat}</td>
            <td class="idx-cell">${seq++}</td>
            <td><span class="tut-doc-empty"></span></td>
            <td class="dt-cell"></td>
          </tr>`);
      } else {
        catRows.forEach((rep, i) => {
          const catCell = i === 0 ? `<td class="cat-cell" rowspan="${catRows.length}">${cat}</td>` : "";
          const nameCell = rep.pdf_url
            ? `<a class="tut-doc-link" href="${escapeHtml(rep.pdf_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(rep.title)}</a>`
            : `<span>${escapeHtml(rep.title)}</span>`;
          rowsHtml.push(`
            <tr>
              ${catCell}
              <td class="idx-cell">${seq++}</td>
              <td>${nameCell}</td>
              <td class="dt-cell">${escapeHtml(rep.date || "")}</td>
            </tr>`);
        });
      }
    }

    $("tut-detail-docs-wrap").innerHTML = `
      <table class="tut-disclosure-table">
        <thead>
          <tr>
            <th>披露文件</th>
            <th>序号</th>
            <th>文件名称</th>
            <th>日期</th>
          </tr>
        </thead>
        <tbody>${rowsHtml.join("")}</tbody>
      </table>`;
  }

  function restoreCsrcPdfUrl(pathOrUrl) {
    const p = String(pathOrUrl || "").trim();
    if (!p) return "";
    if (p.startsWith("http")) return p;
    const encoded = p.split("/").map((seg) => encodeURIComponent(seg)).join("/");
    return `http://eid.csrc.gov.cn/mnt/storage/stock/pre_ipo/${encoded}`;
  }

  async function loadTutShardReports(rec) {
    if (!rec || !rec.r_shard || rec._reportsLoaded) return;
    const shard = rec.r_shard;
    let shardData = state.tutReportShardCache[shard];
    if (!shardData) {
      const resp = await fetch(assetUrl(`data/tutoring_reports/${shard}.json`));
      if (!resp.ok) return;
      shardData = await resp.json();
      state.tutReportShardCache[shard] = shardData || {};
    }
    const rawList = (shardData && shardData[rec.company]) || [];
    if (rawList.length) {
      rec.reports = rawList.map((item) => ({
        category: item.c || "辅导备案报告",
        title: item.t || item.c || "辅导报告",
        date: item.d || "",
        pdf_url: restoreCsrcPdfUrl(item.p || ""),
      }));
    }
    rec._reportsLoaded = true;
  }

  async function openTutoringDetail(rec, options = {}) {
    state.previousTab = "辅导备案";
    state.currentTutRec = rec;
    if (!options.skipHistory) {
      const qs = new URLSearchParams({ company: rec.company || "" });
      updateBrowserUrl(`/ipo-review/guidance/detail?${qs.toString()}`, `${rec.company} · 辅导详情`, Boolean(options.replaceHistory));
    }
    $("view-overview").classList.add("hidden");
    $("view-dynamics").classList.add("hidden");
    $("view-committee").classList.add("hidden");
    $("view-issuance").classList.add("hidden");
    if ($("view-inspection")) $("view-inspection").classList.add("hidden");
    if ($("view-regulatory")) $("view-regulatory").classList.add("hidden");
    if ($("view-hk")) $("view-hk").classList.add("hidden");
    $("view-tutoring").classList.add("hidden");
    $("view-neeq").classList.add("hidden");
    $("view-placeholder").classList.add("hidden");
    $("view-detail").classList.add("hidden");
    $("view-tutoring-detail").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });

    $("tut-detail-company").textContent = rec.company;
    $("tut-detail-board-badge").textContent = rec.board || "沪深";

    const st = rec.stage || "辅导备案";
    const stageBadge = $("tut-detail-stage-badge");
    stageBadge.className = "detail-badge detail-badge-stage";
    if (st === "辅导终止") {
      stageBadge.textContent = "辅导终止";
      stageBadge.classList.add("terminated");
    } else if (rec.ipo_accepted) {
      stageBadge.textContent = "已受理";
      stageBadge.classList.add("accepted");
    } else if (st === "辅导验收") {
      stageBadge.textContent = "尚未受理";
    } else {
      stageBadge.textContent = "尚未验收";
    }
    if ($("tut-detail-retutor-badge")) {
      $("tut-detail-retutor-badge").classList.toggle("hidden", !rec.re_tutoring);
    }

    $("tut-detail-source-text").textContent = `${rec.bureau || "证监会"} · 辅导公示直连`;
    $("tut-detail-notice").classList.add("hidden");

    renderTutTimeline(rec);
    renderTutInfoGrid(rec);
    renderTutDisclosures(rec);

    // 按需加载对应的 16 分片历史报告清单
    if (rec.r_shard && !rec._reportsLoaded) {
      try {
        await loadTutShardReports(rec);
        if (state.currentTutRec === rec) {
          renderTutDisclosures(rec);
        }
      } catch (_) {}
    }

    // 若该企业未预解析且当前托管于支持 /api/tutoring-detail 的环境，按需请求一次 PDF 实时解析
    const targetPdf = rec.filing_pdf_url || rec.pdf_url;
    if (!rec.pdf_parsed && targetPdf && window.location.protocol.startsWith("http")) {
      const cached = state.tutDetailCache[targetPdf];
      if (cached) {
        Object.assign(rec, cached);
        $("tut-detail-board-badge").textContent = rec.board || "沪深";
        renderTutInfoGrid(rec);
        return;
      }
      try {
        const resp = await fetch(`/api/tutoring-detail?pdf_url=${encodeURIComponent(targetPdf)}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.ok && data.profile && data.has_text) {
            const prof = { ...data.profile, pdf_parsed: true };
            state.tutDetailCache[targetPdf] = prof;
            Object.assign(rec, prof);
            $("tut-detail-board-badge").textContent = rec.board || "沪深";
            renderTutInfoGrid(rec);
          }
        }
      } catch (_) {}
    }
  }

  function exportTutoringExcel() {
    const filtered = getFilteredTutoring();
    const headers = [
      "序号", "企业全称", "受理标记", "申报板块", "辅导状态",
      "辅导券商", "律师事务所", "会计师事务所", "证监局",
      "更新日期", "备案日期", "成立时间", "注册资本", "注册地址", "行业分类", "挂牌情况", "最新报告链接",
    ];
    const rows = filtered.map((r, idx) => [
      idx + 1,
      r.company,
      [
        r.ipo_accepted ? "已受理" : (r.stage === "辅导验收" ? "尚未受理" : "未受理"),
        r.re_tutoring ? "撤回后重新报辅导" : "",
      ].filter(Boolean).join(" / "),
      r.board || "沪深",
      r.stage || r.status,
      r.sponsor,
      r.law_firm_short || "—",
      r.acct_firm_short || "—",
      r.bureau,
      r.update_date,
      r.record_date,
      r.founded_date || "",
      r.reg_capital || "",
      r.reg_address || "",
      r.industry || "",
      r.neeq_status || "",
      r.pdf_url || "",
    ]);
    exportGenericExcel(headers, rows, "全市场IPO辅导备案", `全市场A股IPO辅导备案_${(state.meta && state.meta.update_date) || "export"}`);
  }

  // ==================== 二期第2周：新三板挂牌 ====================
  function updateNeeqChipCounts() {
    const tierCounts = {};
    const tradeCounts = {};
    const yrCounts = {};
    for (const r of state.neeqRecords) {
      tierCounts[r.tier] = (tierCounts[r.tier] || 0) + 1;
      tradeCounts[r.trade_type] = (tradeCounts[r.trade_type] || 0) + 1;
      const yr = (r.list_date || "").slice(0, 4);
      if (yr) yrCounts[yr] = (yrCounts[yr] || 0) + 1;
    }
    document.querySelectorAll("#neeq-tier-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}<span class="chip-count">(${tierCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#neeq-trade-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}<span class="chip-count">(${tradeCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#neeq-year-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}年<span class="chip-count">(${yrCounts[v] || 0})</span>`;
    });
  }

  function getFilteredNeeq() {
    const { tier, trade, year, keyword } = state.neeqFilters;
    const kw = keyword.trim().toLowerCase();
    return state.neeqRecords.filter((r) => {
      if (tier !== "全部" && r.tier !== tier) return false;
      if (trade !== "全部" && r.trade_type !== trade) return false;
      if (year !== "全部" && !(r.list_date || "").startsWith(year)) return false;
      if (kw) {
        const hay = [r.code, r.abbr, r.broker, r.industry, r.province].join(" ").toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }

  function renderNeeqKPI(filtered) {
    const total = filtered.length;
    const innov = filtered.filter((r) => r.tier === "创新层").length;
    const base = filtered.filter((r) => r.tier === "基础层").length;
    const provs = new Set(filtered.map((r) => r.province).filter((p) => p && p !== "—")).size;

    $("neeq-kpi-grid").innerHTML = `
      <div class="kpi-card kpi-blue">
        <div class="kpi-label">新挂牌企业数</div>
        <div class="kpi-value">${total.toLocaleString()}</div>
        <div class="kpi-sub">全国股转系统（2023年至今）</div>
      </div>
      <div class="kpi-card kpi-green">
        <div class="kpi-label">创新层企业</div>
        <div class="kpi-value">${innov}</div>
        <div class="kpi-sub">占比 ${total ? ((innov / total) * 100).toFixed(1) : "0.0"}%（北交所后备主力）</div>
      </div>
      <div class="kpi-card kpi-amber">
        <div class="kpi-label">基础层企业</div>
        <div class="kpi-value">${base}</div>
        <div class="kpi-sub">占比 ${total ? ((base / total) * 100).toFixed(1) : "0.0"}%</div>
      </div>
      <div class="kpi-card kpi-blue">
        <div class="kpi-label">覆盖省市自治区</div>
        <div class="kpi-value">${provs}</div>
        <div class="kpi-sub">全国股转直连实时汇总</div>
      </div>
    `;
  }

  function openNeeqDetailModal(rec) {
    const old = document.getElementById("neeq-detail-modal");
    if (old) old.remove();

    const sharesText =
      rec.total_shares_wan !== null && rec.total_shares_wan !== undefined
        ? `${rec.total_shares_wan.toLocaleString()} 万股`
        : "—";
    const epsText =
      rec.eps !== null && rec.eps !== undefined ? `${rec.eps.toFixed(2)} 元` : "—";

    const modal = document.createElement("div");
    modal.id = "neeq-detail-modal";
    modal.className = "hk-modal-backdrop";
    modal.innerHTML = `
      <div class="hk-modal-card" role="dialog" aria-modal="true">
        <div class="hk-modal-header">
          <div>
            <div style="font-size:17px;font-weight:700;color:#111827;">
              <span class="hk-code-pill">${escapeHtml(rec.code)}</span>${escapeHtml(rec.abbr)}
            </div>
            <div style="font-size:12.5px;color:#6b7280;margin-top:4px;">
              市场分层：${escapeHtml(rec.tier || "—")} · 交易方式：${escapeHtml(rec.trade_type || "—")} · 挂牌日期：${escapeHtml(rec.list_date || "—")}
            </div>
          </div>
          <button id="neeq-modal-close-btn" class="hk-modal-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="info-grid" style="margin-bottom:16px;">
          <div class="info-item"><span class="info-label">证券代码</span><span class="info-value">${escapeHtml(rec.code || "—")}</span></div>
          <div class="info-item"><span class="info-label">证券简称</span><span class="info-value">${escapeHtml(rec.abbr || "—")}</span></div>
          <div class="info-item"><span class="info-label">市场分层</span><span class="info-value">${escapeHtml(rec.tier || "—")}</span></div>
          <div class="info-item"><span class="info-label">挂牌日期</span><span class="info-value">${escapeHtml(rec.list_date || "—")}</span></div>
          <div class="info-item"><span class="info-label">所属地区</span><span class="info-value">${escapeHtml(rec.province || "—")}</span></div>
          <div class="info-item"><span class="info-label">所属行业</span><span class="info-value">${escapeHtml(rec.industry || "—")}</span></div>
          <div class="info-item"><span class="info-label">主办券商</span><span class="info-value">${escapeHtml(rec.broker || "—")}</span></div>
          <div class="info-item"><span class="info-label">交易方式</span><span class="info-value">${escapeHtml(rec.trade_type || "—")}</span></div>
          <div class="info-item"><span class="info-label">总股本</span><span class="info-value">${sharesText}</span></div>
          <div class="info-item"><span class="info-label">每股收益</span><span class="info-value">${epsText}</span></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <a class="action-btn sm" href="https://www.neeq.com.cn/" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">前往全国股转系统官网 ↗</a>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.id === "neeq-modal-close-btn") modal.remove();
    });
  }

  function renderNeeqTable() {
    const filtered = getFilteredNeeq();
    renderNeeqKPI(filtered);

    const total = filtered.length;
    const { pageSize } = state.neeqFilters;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.neeqFilters.page > totalPages) state.neeqFilters.page = totalPages;

    const start = (state.neeqFilters.page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    $("neeq-count").innerHTML = `为您找到 <b style="color:#1a73e8;font-size:15px;">${total.toLocaleString()}</b> 家新三板挂牌企业`;

    const tbody = $("neeq-tbody");
    if (!pageRows.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:36px;color:#80868b;">未找到符合条件的新三板挂牌企业</td></tr>`;
    } else {
      tbody.innerHTML = pageRows
        .map(
          (r, idx) => `
          <tr class="clickable-row" data-neeq-idx="${idx}">
            <td><span class="row-index-badge">${start + idx + 1}</span></td>
            <td style="white-space:nowrap;"><span class="stock-code-pill">${escapeHtml(r.code)}</span><span class="company-link">${escapeHtml(r.abbr)}</span></td>
            <td><span class="board-tag tier-${escapeHtml(r.tier)}">${escapeHtml(r.tier)}</span></td>
            <td class="date-cell">${escapeHtml(r.list_date || "—")}</td>
            <td style="white-space:nowrap;color:#3c4043;">${escapeHtml((r.province || "—").replace(/省|市|维吾尔自治区|壮族自治区|回族自治区|自治区/g, ""))}</td>
            <td style="color:#5f6368;">${escapeHtml(r.industry || "—")}</td>
            <td style="color:#3c4043;white-space:nowrap;">${escapeHtml(r.broker || "—")}</td>
            <td style="white-space:nowrap;color:#5f6368;">${escapeHtml(r.trade_type || "—")}</td>
            <td class="num-cell">${r.total_shares_wan !== null && r.total_shares_wan !== undefined ? r.total_shares_wan.toLocaleString() : "—"}</td>
            <td class="num-cell">${r.eps !== null && r.eps !== undefined ? r.eps.toFixed(2) : "—"}</td>
          </tr>`
        )
        .join("");

      tbody.querySelectorAll("tr[data-neeq-idx]").forEach((tr) => {
        tr.addEventListener("click", () => {
          const item = pageRows[Number(tr.dataset.neeqIdx)];
          if (item) openNeeqDetailModal(item);
        });
      });
    }

    $("neeq-page-info").textContent = `第 ${state.neeqFilters.page} / ${totalPages} 页`;
    $("neeq-prev-page").disabled = state.neeqFilters.page <= 1;
    $("neeq-next-page").disabled = state.neeqFilters.page >= totalPages;
    renderPageNumbers("neeq-prev-page", state.neeqFilters.page, totalPages, (p) => {
      state.neeqFilters.page = p;
      renderNeeqTable();
    });
  }

  function exportNeeqExcel() {
    const filtered = getFilteredNeeq();
    const headers = ["序号", "证券代码", "证券简称", "市场分层", "挂牌日期", "所属地区", "所属行业", "主办券商", "交易方式", "总股本(万股)", "每股收益(元)"];
    const rows = filtered.map((r, idx) => [
      idx + 1,
      r.code,
      r.abbr,
      r.tier,
      r.list_date,
      r.province,
      r.industry,
      r.broker,
      r.trade_type,
      r.total_shares_wan ?? "",
      r.eps ?? "",
    ]);
    exportGenericExcel(headers, rows, "新三板挂牌", `新三板挂牌清单_${(state.meta && state.meta.update_date) || "export"}`);
  }

  // ==================== 三期：现场检查 & 监管措施 ====================
  async function openCompanyDetailByName(companyName, fallback = {}) {
    if (!companyName || companyName === "—") return;
    if (!state.loaded.ipo) await ensureDataset("ipo");
    const norm = String(companyName || "").replace(/[（()）\s]/g, "");
    const matched = state.records.find(
      (x) => String(x.company || "").replace(/[（()）\s]/g, "") === norm
    );
    openProjectDetail(
      matched || {
        company: companyName,
        exchange: fallback.exchange || "上交所",
        board: fallback.board || "科创板",
        stage: fallback.stage || "问询",
        raw_status: fallback.raw_status || fallback.stage || "—",
        security_code: "",
        province: "—",
        industry: "—",
        sponsors: fallback.sponsor && fallback.sponsor !== "—" ? [fallback.sponsor] : [],
        law_firms: [],
        accounting_firms: [],
        accept_date: fallback.accept_date || "",
        update_date: fallback.update_date || "",
        source_url: fallback.source_url || "",
      }
    );
  }

  function normalizeInspBoard(board) {
    const b = String(board || "");
    if (b === "沪主板" || b === "深主板" || b === "主板") return "主板";
    return b || "主板";
  }

  function extractBatchSuffix(batchText) {
    const m = String(batchText || "").match(/第\s*\d+\s*批/);
    return m ? m[0].replace(/\s+/g, "") : "";
  }

  function updateInspectionChipCounts() {
    const yrCounts = {};
    const bdCounts = {};
    const stCounts = {};
    const btCounts = {};
    for (const r of state.inspectionRecords) {
      const yr = (r.lottery_date || "").slice(0, 4);
      if (yr) yrCounts[yr] = (yrCounts[yr] || 0) + 1;
      const nb = normalizeInspBoard(r.board);
      bdCounts[nb] = (bdCounts[nb] || 0) + 1;
      const st = r.stage || "终止";
      stCounts[st] = (stCounts[st] || 0) + 1;
      const bt = extractBatchSuffix(r.batch);
      if (bt) btCounts[bt] = (btCounts[bt] || 0) + 1;
    }
    document.querySelectorAll("#insp-year-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}年<span class="chip-count">(${yrCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#insp-board-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}<span class="chip-count">(${bdCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#insp-stage-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}<span class="chip-count">(${stCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#insp-batch-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}<span class="chip-count">(${btCounts[v] || 0})</span>`;
    });
  }

  function getFilteredInspection() {
    const { year, board, stage, batch, keyword } = state.inspFilters;
    const kw = keyword.trim().toLowerCase();
    return state.inspectionRecords.filter((r) => {
      if (year !== "全部" && !(r.lottery_date || "").startsWith(year)) return false;
      if (board !== "全部" && normalizeInspBoard(r.board) !== board) return false;
      if (stage !== "全部" && (r.stage || "") !== stage) return false;
      if (batch !== "全部" && extractBatchSuffix(r.batch) !== batch) return false;
      if (kw) {
        const hay = [r.company, r.sponsor, r.batch, r.exchange, r.board, r.raw_status].join(" ").toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }

  function renderInspectionKPI(filtered) {
    const total = filtered.length;
    const terminated = filtered.filter((r) => r.stage === "终止").length;
    const active = filtered.filter((r) => ["受理", "问询", "上市委", "提交注册", "中止"].includes(r.stage)).length;
    const registered = filtered.filter((r) => r.stage === "注册同意").length;
    const withdrawRate = total ? ((terminated / total) * 100).toFixed(1) : "0.0";

    $("insp-kpi-grid").innerHTML = `
      <div class="kpi-card kpi-blue">
        <div class="kpi-label">累计抽查企业</div>
        <div class="kpi-value">${total.toLocaleString()}</div>
        <div class="kpi-sub">中证协 / 证监会首发信息披露抽查</div>
      </div>
      <div class="kpi-card kpi-red">
        <div class="kpi-label">抽查后终止 / 撤回</div>
        <div class="kpi-value">${terminated.toLocaleString()}</div>
        <div class="kpi-sub">抽查后终止/撤回率 ${withdrawRate}%</div>
      </div>
      <div class="kpi-card kpi-amber">
        <div class="kpi-label">当前在审（含中止）</div>
        <div class="kpi-value">${active.toLocaleString()}</div>
        <div class="kpi-sub">仍在交易所审核/注册推进中</div>
      </div>
      <div class="kpi-card kpi-green">
        <div class="kpi-label">已注册同意</div>
        <div class="kpi-value">${registered.toLocaleString()}</div>
        <div class="kpi-sub">通过检查并获证监会注册批文</div>
      </div>
    `;
  }

  function renderInspectionTable() {
    const filtered = getFilteredInspection();
    renderInspectionKPI(filtered);

    const total = filtered.length;
    const { pageSize } = state.inspFilters;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.inspFilters.page > totalPages) state.inspFilters.page = totalPages;

    const start = (state.inspFilters.page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    $("insp-count").innerHTML = `为您找到 <b style="color:#1a73e8;font-size:15px;">${total.toLocaleString()}</b> 条相关结果`;

    const tbody = $("insp-tbody");
    if (!pageRows.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:36px;color:#80868b;">未找到符合条件的现场检查记录</td></tr>`;
    } else {
      tbody.innerHTML = pageRows
        .map((r, idx) => {
          const st = r.stage || "终止";
          const stLabel = r.raw_status || st;
          const dispBoard = r.board || "—";
          return `
            <tr class="clickable-row" data-insp-idx="${idx}">
              <td><span class="row-index-badge">${start + idx + 1}</span></td>
              <td class="date-cell">${escapeHtml(r.lottery_date || "—")}</td>
              <td><span class="company-link">${escapeHtml(r.company)}</span></td>
              <td style="color:#3c4043;white-space:nowrap;">${escapeHtml(r.batch || "—")}</td>
              <td class="num-cell">${escapeHtml(r.ratio || "—")}</td>
              <td><span class="stage-tag stage-${escapeHtml(st)}"><span class="status-dot"></span>${escapeHtml(stLabel)}</span></td>
              <td style="white-space:nowrap;color:#5f6368;font-weight:500;">${escapeHtml(r.exchange || "—")}</td>
              <td><span class="board-tag board-${escapeHtml(dispBoard)}">${escapeHtml(dispBoard)}</span></td>
              <td style="color:#3c4043;white-space:nowrap;">${escapeHtml(normalizeBrokerName(r.sponsor) || "—")}</td>
              <td class="date-cell muted">${escapeHtml(r.accept_date || "—")}</td>
            </tr>`;
        })
        .join("");

      tbody.querySelectorAll("tr.clickable-row").forEach((tr) => {
        tr.addEventListener("click", () => {
          const item = pageRows[Number(tr.dataset.inspIdx)];
          if (!item) return;
          openCompanyDetailByName(item.company, {
            exchange: item.exchange,
            board: item.board,
            stage: item.stage,
            raw_status: item.raw_status,
            sponsor: item.sponsor,
            accept_date: item.accept_date,
            update_date: item.lottery_date,
            source_url: item.source_url,
          });
        });
      });
    }

    $("insp-page-info").textContent = `第 ${state.inspFilters.page} / ${totalPages} 页`;
    $("insp-prev-page").disabled = state.inspFilters.page <= 1;
    $("insp-next-page").disabled = state.inspFilters.page >= totalPages;
    renderPageNumbers("insp-prev-page", state.inspFilters.page, totalPages, (p) => {
      state.inspFilters.page = p;
      renderInspectionTable();
    });
  }

  function updateRegulatoryChipCounts() {
    const yrCounts = { older: 0 };
    const orgCounts = {};
    const stCounts = {};
    const catCounts = {};
    for (const r of state.regulatoryRecords) {
      const yr = (r.announce_date || "").slice(0, 4);
      if (yr) {
        if (yr >= "2023") yrCounts[yr] = (yrCounts[yr] || 0) + 1;
        else yrCounts.older += 1;
      }
      const reg = r.regulator || "";
      if (reg) orgCounts[reg] = (orgCounts[reg] || 0) + 1;
      const st = r.stage || "";
      if (st) stCounts[st] = (stCounts[st] || 0) + 1;
      const cat = r.category || "";
      if (cat) catCounts[cat] = (catCounts[cat] || 0) + 1;
    }
    document.querySelectorAll("#reg-year-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v === "older") b.innerHTML = `2022及以前<span class="chip-count">(${yrCounts.older || 0})</span>`;
      else if (v !== "全部") b.innerHTML = `${v}年<span class="chip-count">(${yrCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#reg-org-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}<span class="chip-count">(${orgCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#reg-stage-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}<span class="chip-count">(${stCounts[v] || 0})</span>`;
    });
    document.querySelectorAll("#reg-cat-chips .chip-btn").forEach((b) => {
      const v = b.dataset.val;
      if (v !== "全部") b.innerHTML = `${v}<span class="chip-count">(${catCounts[v] || 0})</span>`;
    });
  }

  function getFilteredRegulatory() {
    const { year, regulator, stage, category, keyword } = state.regFilters;
    const kw = keyword.trim().toLowerCase();
    return state.regulatoryRecords.filter((r) => {
      if (year !== "全部") {
        const yr = (r.announce_date || "").slice(0, 4);
        if (year === "older") {
          if (!yr || yr >= "2023") return false;
        } else if (yr !== year) {
          return false;
        }
      }
      if (regulator !== "全部" && (r.regulator || "") !== regulator) return false;
      if (stage !== "全部" && (r.stage || "") !== stage) return false;
      if (category !== "全部" && (r.category || "") !== category) return false;
      if (kw) {
        const hay = [r.title, r.company, r.regulator, r.category, r.raw_status].join(" ").toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }

  function renderRegulatoryKPI(filtered) {
    const total = filtered.length;
    const discipline = filtered.filter((r) => (r.category || "").includes("纪律")).length;
    const warning = filtered.filter((r) => !(r.category || "").includes("纪律")).length;
    const terminatedProj = filtered.filter((r) => r.stage === "终止").length;

    $("reg-kpi-grid").innerHTML = `
      <div class="kpi-card kpi-blue">
        <div class="kpi-label">累计 IPO 监管措施</div>
        <div class="kpi-value">${total.toLocaleString()}</div>
        <div class="kpi-sub">证监会及沪深北交易所公开汇总</div>
      </div>
      <div class="kpi-card kpi-red">
        <div class="kpi-label">纪律处分</div>
        <div class="kpi-value">${discipline.toLocaleString()}</div>
        <div class="kpi-sub">含通报批评、公开谴责等</div>
      </div>
      <div class="kpi-card kpi-amber">
        <div class="kpi-label">监管警示 / 监管函</div>
        <div class="kpi-value">${warning.toLocaleString()}</div>
        <div class="kpi-sub">含书面警示、监管谈话、出具警示函</div>
      </div>
      <div class="kpi-card kpi-green">
        <div class="kpi-label">涉及已终止 IPO 项目</div>
        <div class="kpi-value">${terminatedProj.toLocaleString()}</div>
        <div class="kpi-sub">占比 ${total ? ((terminatedProj / total) * 100).toFixed(1) : "0.0"}%</div>
      </div>
    `;
  }

  function renderRegulatoryTable() {
    const filtered = getFilteredRegulatory();
    renderRegulatoryKPI(filtered);

    const total = filtered.length;
    const { pageSize } = state.regFilters;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.regFilters.page > totalPages) state.regFilters.page = totalPages;

    const start = (state.regFilters.page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    $("reg-count").innerHTML = `为您找到 <b style="color:#1a73e8;font-size:15px;">${total.toLocaleString()}</b> 条相关结果`;

    const tbody = $("reg-tbody");
    if (!pageRows.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:36px;color:#80868b;">未找到符合条件的监管措施记录</td></tr>`;
    } else {
      tbody.innerHTML = pageRows
        .map((r, idx) => {
          const isPdf = String(r.pdf_url || "").toLowerCase().includes(".pdf");
          const docHtml = r.pdf_url
            ? `<a class="reg-doc-link" href="${escapeHtml(r.pdf_url)}" target="_blank" rel="noopener noreferrer" title="查看官方原文">${escapeHtml(r.title)}${isPdf ? '<span class="pdf-pill">PDF</span>' : ""}</a>`
            : `<span>${escapeHtml(r.title)}</span>`;
          const compHtml = r.company && r.company !== "—"
            ? `<span class="company-link reg-proj-link" data-reg-idx="${idx}" style="cursor:pointer;">${escapeHtml(r.company)}</span>`
            : `<span style="color:#80868b;">—</span>`;
          const st = r.stage || "";
          const stHtml = st
            ? `<span class="stage-tag stage-${escapeHtml(st)}"><span class="status-dot"></span>${escapeHtml(r.raw_status || st)}</span>`
            : `<span style="color:#80868b;">${escapeHtml(r.raw_status || "—")}</span>`;
          const regOrg = r.regulator || "证监会";
          const cat = r.category || "监管措施";
          return `
            <tr class="clickable-row" data-reg-idx="${idx}">
              <td><span class="row-index-badge">${start + idx + 1}</span></td>
              <td>${docHtml}</td>
              <td>${compHtml}</td>
              <td>${stHtml}</td>
              <td><span class="regulator-pill regulator-${escapeHtml(regOrg)}">${escapeHtml(regOrg)}</span></td>
              <td><span class="stage-tag reg-cat-${escapeHtml(cat)}">${escapeHtml(cat)}</span></td>
              <td class="date-cell">${escapeHtml(r.announce_date || "—")}</td>
            </tr>`;
        })
        .join("");

      tbody.querySelectorAll("tr[data-reg-idx]").forEach((tr) => {
        tr.addEventListener("click", (e) => {
          if (e.target.closest("a.reg-doc-link")) return;
          const item = pageRows[Number(tr.dataset.regIdx)];
          if (!item || !item.company || item.company === "—") return;
          openCompanyDetailByName(item.company, {
            exchange: item.regulator === "上交所" || item.regulator === "深交所" || item.regulator === "北交所" ? item.regulator : "上交所",
            stage: item.stage,
            raw_status: item.raw_status,
            update_date: item.announce_date,
          });
        });
      });
    }

    $("reg-page-info").textContent = `第 ${state.regFilters.page} / ${totalPages} 页`;
    $("reg-prev-page").disabled = state.regFilters.page <= 1;
    $("reg-next-page").disabled = state.regFilters.page >= totalPages;
    renderPageNumbers("reg-prev-page", state.regFilters.page, totalPages, (p) => {
      state.regFilters.page = p;
      renderRegulatoryTable();
    });
  }

  // ==================== 港股 IPO 视图 ====================
  function updateHkChipCounts() {
    const statusMap = {};
    const csrcMap = {};
    for (const r of state.hkRecords) {
      statusMap[r.hkex_status] = (statusMap[r.hkex_status] || 0) + 1;
      csrcMap[r.csrc_status] = (csrcMap[r.csrc_status] || 0) + 1;
    }
    document.querySelectorAll("#hk-status-chips .chip-btn").forEach((btn) => {
      const val = btn.dataset.val;
      if (val === "全部") return;
      btn.textContent = `${val} (${statusMap[val] || 0})`;
    });
    document.querySelectorAll("#hk-csrc-chips .chip-btn").forEach((btn) => {
      const val = btn.dataset.val;
      if (val === "全部") return;
      btn.textContent = `${val} (${csrcMap[val] || 0})`;
    });
  }

  function renderHkKpis() {
    const el = $("hk-kpi-grid");
    if (!el) return;
    const all = state.hkRecords;
    const processing = all.filter((r) => r.hkex_status === "处理中").length;
    const heard = all.filter((r) => r.hkex_status === "已聆讯").length;
    const listed = all.filter((r) => r.hkex_status === "已上市").length;
    const ahCount = all.filter((r) => r.structure === "A+H").length;
    const csrcActive = all.filter((r) => ["备案受理", "备案反馈", "备案同意"].includes(r.csrc_status)).length;
    const csrcDate = (state.hkMeta && state.hkMeta.csrc_table_date) || "每周更新";
    el.innerHTML = `
      <div class="kpi-card kpi-blue">
        <div class="kpi-label">港股 IPO 全量库</div>
        <div class="kpi-value">${all.length.toLocaleString()}</div>
        <div class="kpi-sub">港交所披露易主板 + GEM（含 A+H ${ahCount} 家）</div>
      </div>
      <div class="kpi-card kpi-amber">
        <div class="kpi-label">当前排队中（处理中 / 已聆讯）</div>
        <div class="kpi-value">${(processing + heard).toLocaleString()}</div>
        <div class="kpi-sub">处理中 ${processing} 家 · 已聆讯 ${heard} 家</div>
      </div>
      <div class="kpi-card kpi-green">
        <div class="kpi-label">港股已上市</div>
        <div class="kpi-value">${listed.toLocaleString()}</div>
        <div class="kpi-sub">披露易申请后成功挂牌汇总</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">证监会境外备案推进中</div>
        <div class="kpi-value">${csrcActive.toLocaleString()}</div>
        <div class="kpi-sub">证监会备案表截至 ${escapeHtml(csrcDate)}</div>
      </div>
    `;
  }

  function getFilteredHk() {
    const { structure, hkexStatus, csrcStatus, keyword } = state.hkFilters;
    const kw = keyword.trim().toLowerCase();
    const list = state.hkRecords.filter((r) => {
      if (structure !== "全部" && r.structure !== structure) return false;
      if (hkexStatus !== "全部" && r.hkex_status !== hkexStatus) return false;
      if (csrcStatus !== "全部" && r.csrc_status !== csrcStatus) return false;
      if (kw) {
        const hay = `${r.company} ${r.company_tc || ""} ${r.stock_code || ""} ${r.headquarters || ""} ${r.reg_place || ""} ${(r.sponsors || []).join(" ")} ${r.filing_entity || ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      const ua = a.update_date || "";
      const ub = b.update_date || "";
      if (ua !== ub) return ub > ua ? 1 : -1;
      return (b.submit_date || "") > (a.submit_date || "") ? 1 : -1;
    });
    return list;
  }

  function openHkDetailModal(rec) {
    const old = document.getElementById("hk-detail-modal");
    if (old) old.remove();

    const tagsHtml = (rec.tags || [])
      .map((t) => `<span class="hk-badge-tag hk-tag-${escapeHtml(t)}">${escapeHtml(t)}</span>`)
      .join("");
    const sponsorsText = (rec.sponsors && rec.sponsors.length) ? rec.sponsors.map((s) => escapeHtml(s)).join("、") : "—";
    const lawyersText = (rec.law_firms && rec.law_firms.length) ? rec.law_firms.map((s) => escapeHtml(s)).join("、") : "—";
    const docsHtml = (rec.docs && rec.docs.length)
      ? rec.docs.map((d) => `
          <a class="doc-item" href="${escapeHtml(d.url)}" target="_blank" rel="noopener noreferrer" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid #eef0f3;border-radius:8px;margin-bottom:8px;text-decoration:none;color:#1f2937;">
            <span>${escapeHtml(d.title || "申请版本文件")}</span>
            <span style="color:#6b7280;font-size:12px;margin-left:12px;white-space:nowrap;">${escapeHtml(d.date || "")} ↗</span>
          </a>`).join("")
      : `<div style="color:#8f959e;font-size:13px;padding:8px 0;">暂无公开可直链的申请版本/聆讯后资料集文件（或已归档）</div>`;

    const modal = document.createElement("div");
    modal.id = "hk-detail-modal";
    modal.className = "hk-modal-backdrop";
    modal.innerHTML = `
      <div class="hk-modal-card" role="dialog" aria-modal="true">
        <div class="hk-modal-header">
          <div>
            <div style="font-size:17px;font-weight:700;color:#111827;">
              ${rec.stock_code ? `<span class="hk-code-pill">${escapeHtml(rec.stock_code)}</span>` : ""}
              ${escapeHtml(rec.company)}${tagsHtml}
            </div>
            <div style="font-size:12.5px;color:#6b7280;margin-top:4px;">
              申报板块：${escapeHtml(rec.board)} · 上市架构：${escapeHtml(rec.structure)} · 累计递表：${rec.attempt_count || 1} 次
            </div>
          </div>
          <button id="hk-modal-close-btn" class="hk-modal-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="info-grid" style="margin-bottom:16px;">
          <div class="info-item"><span class="info-label">港交所审核状态</span><span class="info-value">${escapeHtml(rec.hkex_status)}</span></div>
          <div class="info-item"><span class="info-label">证监会备案状态</span><span class="info-value">${escapeHtml(rec.csrc_status)}</span></div>
          <div class="info-item"><span class="info-label">注册地址 / 总部</span><span class="info-value">${escapeHtml(rec.reg_place || "—")} / ${escapeHtml(rec.headquarters || "—")}</span></div>
          <div class="info-item"><span class="info-label">递表 / 最新更新</span><span class="info-value">${escapeHtml(rec.submit_date || "—")} / ${escapeHtml(rec.update_date || "—")}</span></div>
          <div class="info-item"><span class="info-label">保荐人/主承销商</span><span class="info-value">${sponsorsText}</span></div>
          <div class="info-item"><span class="info-label">境内律师</span><span class="info-value">${lawyersText}</span></div>
          ${rec.filing_entity ? `<div class="info-item"><span class="info-label">境内申报主体</span><span class="info-value">${escapeHtml(rec.filing_entity)}</span></div>` : ""}
          ${rec.csrc_receive_date ? `<div class="info-item"><span class="info-label">证监会接收日期</span><span class="info-value">${escapeHtml(rec.csrc_receive_date)}</span></div>` : ""}
        </div>
        <div style="font-size:13.5px;font-weight:600;color:#111827;margin-bottom:8px;">港交所披露易公开文件</div>
        <div>${docsHtml}</div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.id === "hk-modal-close-btn") modal.remove();
    });
  }

  function renderHkTable() {
    renderHkKpis();
    const filtered = getFilteredHk();
    const total = filtered.length;
    const { pageSize } = state.hkFilters;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.hkFilters.page > totalPages) state.hkFilters.page = totalPages;

    const start = (state.hkFilters.page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    $("hk-count").innerHTML = `为您找到 <b style="color:#d93025;font-size:15px;">${total.toLocaleString()}</b> 条港股 IPO 记录`;

    const tbody = $("hk-tbody");
    if (!pageRows.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:36px;color:#80868b;">未找到符合条件的港股 IPO 记录</td></tr>`;
    } else {
      tbody.innerHTML = pageRows
        .map((r, idx) => {
          const hkStatusClass = "hk-status-" + (r.hkex_status || "").replace("/", "");
          const csrcStatusClass = "csrc-status-" + (r.csrc_status || "不适用").replace("/", "");
          const tagsHtml = (r.tags || [])
            .map((t) => `<span class="hk-badge-tag hk-tag-${escapeHtml(t)}">${escapeHtml(t)}</span>`)
            .join("");
          const codeHtml = r.stock_code ? `<span class="hk-code-pill">${escapeHtml(r.stock_code)}</span>` : "";
          const sponsorsHtml = (r.sponsors && r.sponsors.length)
            ? `<div class="hk-sponsors-col">${r.sponsors.map((s) => `<div>${escapeHtml(s)}</div>`).join("")}</div>`
            : `<span style="color:#94a3b8;">—</span>`;

          return `
            <tr class="clickable-row" data-hk-idx="${idx}">
              <td><span class="row-index-badge">${start + idx + 1}</span></td>
              <td>
                <div class="company-link">${codeHtml}${escapeHtml(r.company)}${tagsHtml}</div>
              </td>
              <td>${escapeHtml(r.board || "主板")}</td>
              <td>${escapeHtml(r.structure || "—")}</td>
              <td><span class="stage-tag ${escapeHtml(hkStatusClass)}">${escapeHtml(r.hkex_status)}</span></td>
              <td><span class="stage-tag ${escapeHtml(csrcStatusClass)}">${escapeHtml(r.csrc_status)}</span></td>
              <td>${escapeHtml(r.reg_place || "—")}</td>
              <td>${escapeHtml(r.headquarters || "—")}</td>
              <td>${sponsorsHtml}</td>
              <td class="date-cell">${escapeHtml(r.update_date || "—")}</td>
              <td class="date-cell">${escapeHtml(r.submit_date || "—")}</td>
            </tr>
          `;
        })
        .join("");

      tbody.querySelectorAll("tr[data-hk-idx]").forEach((tr) => {
        tr.addEventListener("click", () => {
          const item = pageRows[Number(tr.dataset.hkIdx)];
          if (item) openHkDetailModal(item);
        });
      });
    }

    $("hk-page-info").textContent = `第 ${state.hkFilters.page} / ${totalPages} 页`;
    $("hk-prev-page").disabled = state.hkFilters.page <= 1;
    $("hk-next-page").disabled = state.hkFilters.page >= totalPages;
    renderPageNumbers("hk-prev-page", state.hkFilters.page, totalPages, (p) => {
      state.hkFilters.page = p;
      renderHkTable();
    });
  }

  // ==================== 路由与按需懒加载控制 ====================
  function updateBrowserUrl(routePath, titleText, replace = false) {
    const cleanTitle = titleText ? `${titleText} · IPO 智览` : "IPO 智览 · 首发上市全景看板";
    document.title = cleanTitle;
    try {
      if (window.location.protocol === "file:") {
        const nextHash = `#${routePath}`;
        if (window.location.hash !== nextHash) {
          if (replace) window.history.replaceState(null, cleanTitle, nextHash);
          else window.location.hash = nextHash;
        }
        return;
      }
      const targetUrl = `${getBasePrefix()}${routePath}`;
      const currentFull = `${window.location.pathname}${window.location.search}`;
      if (currentFull !== targetUrl) {
        if (replace) window.history.replaceState({ routePath }, cleanTitle, targetUrl);
        else window.history.pushState({ routePath }, cleanTitle, targetUrl);
      }
    } catch (_) {}
  }

  function parseRouteFromLocation() {
    let raw = "";
    if (window.location.protocol === "file:" && window.location.hash.startsWith("#/")) {
      raw = window.location.hash.slice(1);
    } else {
      const sp = new URLSearchParams(window.location.search);
      const pParam = sp.get("p");
      if (pParam && pParam.startsWith("/")) {
        raw = pParam;
      } else {
        let p = window.location.pathname || "/";
        const prefix = getBasePrefix();
        if (prefix && p.startsWith(prefix)) p = p.slice(prefix.length) || "/";
        raw = p + (window.location.search || "");
      }
    }

    const qIdx = raw.indexOf("?");
    const pathPart = (qIdx >= 0 ? raw.slice(0, qIdx) : raw).replace(/\/+$/, "") || "/";
    const queryPart = qIdx >= 0 ? raw.slice(qIdx + 1) : "";
    const qs = new URLSearchParams(queryPart);

    if (pathPart === "/ipo-review/a-stock/detail") {
      return { kind: "detail", company: qs.get("company") || "", exchange: qs.get("exchange") || "" };
    }
    if (pathPart === "/ipo-review/guidance/detail") {
      return { kind: "tutoring-detail", company: qs.get("company") || "" };
    }
    if (ROUTE_TO_TAB[pathPart]) {
      return { kind: "tab", tab: ROUTE_TO_TAB[pathPart] };
    }
    return { kind: "tab", tab: "全景图" };
  }

  async function switchSubTab(tabName, options = {}) {
    state.activeTab = tabName;
    if ($("active-subtab-pill")) $("active-subtab-pill").textContent = tabName;

    if (!options.skipHistory) {
      const routePath = TAB_ROUTES[tabName] || "/ipo-review/kanban";
      updateBrowserUrl(routePath, tabName, Boolean(options.replaceHistory));
    }

    $("view-detail").classList.add("hidden");
    $("view-tutoring-detail").classList.add("hidden");
    document.querySelectorAll(".sub-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    $("view-overview").classList.toggle("hidden", tabName !== "全景图");
    $("view-dynamics").classList.toggle("hidden", tabName !== "审核动态");
    $("view-committee").classList.toggle("hidden", tabName !== "上市委审议");
    $("view-issuance").classList.toggle("hidden", tabName !== "发行动态");
    if ($("view-inspection")) $("view-inspection").classList.toggle("hidden", tabName !== "现场检查");
    if ($("view-regulatory")) $("view-regulatory").classList.toggle("hidden", tabName !== "监管措施");
    if ($("view-hk")) $("view-hk").classList.toggle("hidden", tabName !== "港股IPO");
    $("view-tutoring").classList.toggle("hidden", tabName !== "辅导备案");
    $("view-neeq").classList.toggle("hidden", tabName !== "新三板挂牌");

    const builtTabs = new Set(["全景图", "审核动态", "上市委审议", "发行动态", "现场检查", "监管措施", "辅导备案", "新三板挂牌", "港股IPO"]);
    const placeholder = $("view-placeholder");
    if (!builtTabs.has(tabName)) {
      const info = FUTURE_TAB_INFO[tabName] || { title: tabName, desc: "后续规划接入", source: "" };
      $("placeholder-title").textContent = info.title;
      $("placeholder-desc").textContent = info.desc;
      $("placeholder-source").textContent = info.source;
      placeholder.classList.remove("hidden");
    } else {
      placeholder.classList.add("hidden");
    }

    if (tabName === "全景图") {
      const pData = ensureDataset("ipoActive");
      const pEcharts = ensureEcharts();
      const pGeo = prefetchChinaGeoJson();

      await pData;
      renderMatrix();

      await pEcharts;
      renderOrgCharts();

      await pGeo;
      await renderMapOrBar();
      setTimeout(() => {
        if (mapChart) mapChart.resize();
        if (sponsorChart) sponsorChart.resize();
        if (rightOrgChart) rightOrgChart.resize();
      }, 50);
    } else if (tabName === "审核动态") {
      if (!state.loaded.ipo || !state.loaded.inspection) {
        $("dynamics-tbody").innerHTML = `<tr><td colspan="11" style="text-align:center;padding:36px;color:#80868b;">正在按需加载 A股IPO 审核动态数据...</td></tr>`;
        await Promise.all([ensureDataset("ipo"), ensureDataset("inspection")]);
      }
      renderDynamicsTable();
    } else if (tabName === "上市委审议") {
      if (!state.loaded.committee) {
        $("cm-tbody").innerHTML = `<tr><td colspan="10" style="text-align:center;padding:36px;color:#80868b;">正在按需加载上市委审议数据...</td></tr>`;
        await ensureDataset("committee");
      }
      renderCommitteeTable();
    } else if (tabName === "发行动态") {
      if (!state.loaded.issuance) {
        $("iss-tbody").innerHTML = `<tr><td colspan="12" style="text-align:center;padding:36px;color:#80868b;">正在按需加载新股发行动态数据...</td></tr>`;
        await ensureDataset("issuance");
      }
      renderIssuanceTable();
    } else if (tabName === "现场检查") {
      if (!state.loaded.inspection) {
        $("insp-tbody").innerHTML = `<tr><td colspan="10" style="text-align:center;padding:36px;color:#80868b;">正在按需加载首发企业现场检查数据...</td></tr>`;
        await ensureDataset("inspection");
      }
      renderInspectionTable();
    } else if (tabName === "监管措施") {
      if (!state.loaded.regulatory) {
        $("reg-tbody").innerHTML = `<tr><td colspan="7" style="text-align:center;padding:36px;color:#80868b;">正在按需加载 IPO 监管措施数据...</td></tr>`;
        await ensureDataset("regulatory");
      }
      renderRegulatoryTable();
    } else if (tabName === "辅导备案") {
      if (!state.loaded.tutoring) {
        $("tut-tbody").innerHTML = `<tr><td colspan="10" style="text-align:center;padding:36px;color:#80868b;">正在按需加载全国证监会辅导备案数据...</td></tr>`;
        await ensureDataset("tutoring");
      }
      renderTutoringTable();
    } else if (tabName === "新三板挂牌") {
      if (!state.loaded.neeq) {
        $("neeq-tbody").innerHTML = `<tr><td colspan="10" style="text-align:center;padding:36px;color:#80868b;">正在按需加载新三板挂牌数据...</td></tr>`;
        await ensureDataset("neeq");
      }
      renderNeeqTable();
    } else if (tabName === "港股IPO") {
      if (!state.loaded.hk) {
        $("hk-tbody").innerHTML = `<tr><td colspan="11" style="text-align:center;padding:36px;color:#80868b;">正在按需加载港股 IPO 与证监会境外备案数据...</td></tr>`;
        await ensureDataset("hk");
      }
      renderHkTable();
    }
  }

  function bindEvents() {
    document.querySelectorAll(".sub-tab").forEach((btn) => {
      btn.addEventListener("click", () => switchSubTab(btn.dataset.tab));
    });

    $("btn-back-list").addEventListener("click", () => {
      switchSubTab(state.previousTab || "审核动态");
    });

    document.querySelectorAll(".detail-tab").forEach((btn) => {
      btn.addEventListener("click", () => switchDetailTab(btn.dataset.dtab));
    });

    document.querySelectorAll("#market-switch .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const market = btn.dataset.market;
        document.querySelectorAll("#market-switch .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
        const isAshare = market === "A股IPO";
        $("ashare-overview-content").classList.toggle("hidden", !isAshare);
        $("market-placeholder").classList.toggle("hidden", isAshare);
        if (!isAshare) $("market-placeholder-title").textContent = `${market} 全景看板（MVP 二期规划）`;
      });
    });

    const setOverviewBoard = (board) => {
      state.overviewBoard = board || "全部";
      document.querySelectorAll("#overview-board-switch .chip-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.val === state.overviewBoard);
      });
      updateHeaderMeta();
      renderMatrix();
      renderOrgCharts();
      renderMapOrBar();
    };

    document.querySelectorAll("#overview-board-switch .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        setOverviewBoard(btn.dataset.val);
      });
    });

    document.querySelectorAll(".matrix-board-th").forEach((th) => {
      th.addEventListener("click", () => {
        const bd = th.dataset.board;
        setOverviewBoard(state.overviewBoard === bd ? "全部" : bd);
      });
    });

    document.querySelectorAll("#map-mode-switch .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.mapMode = btn.dataset.mode;
        document.querySelectorAll("#map-mode-switch .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderMapOrBar();
      });
    });

    document.querySelectorAll('input[name="rightOrgType"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        state.rightOrgType = e.target.value;
        renderOrgCharts();
      });
    });

    const hqToggle = $("toggle-hq-merge");
    if (hqToggle) {
      hqToggle.addEventListener("change", (e) => {
        state.mergeOrgHQ = e.target.checked;
        renderOrgCharts();
      });
    }

    document.querySelectorAll("#filter-exchange-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filters.exchange = btn.dataset.val;
        state.filters.page = 1;
        syncDynamicsFilterUI();
        renderDynamicsTable();
      });
    });

    document.querySelectorAll("#filter-board-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filters.board = btn.dataset.val;
        state.filters.page = 1;
        syncDynamicsFilterUI();
        renderDynamicsTable();
      });
    });

    document.querySelectorAll("#filter-stage-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filters.stage = btn.dataset.val;
        state.filters.page = 1;
        syncDynamicsFilterUI();
        renderDynamicsTable();
      });
    });

    $("filter-province").addEventListener("change", (e) => {
      state.filters.province = e.target.value;
      state.filters.page = 1;
      renderDynamicsTable();
    });

    $("filter-keyword").addEventListener("input", (e) => {
      state.filters.keyword = e.target.value;
      state.filters.page = 1;
      $("btn-clear-search").classList.toggle("hidden", !state.filters.keyword);
      renderDynamicsTable();
    });

    $("btn-clear-search").addEventListener("click", () => {
      state.filters.keyword = "";
      state.filters.page = 1;
      syncDynamicsFilterUI();
      renderDynamicsTable();
      $("filter-keyword").focus();
    });

    if ($("btn-toggle-advanced")) {
      $("btn-toggle-advanced").addEventListener("click", () => {
        const drawer = $("advanced-drawer");
        if (drawer) drawer.classList.toggle("hidden");
        syncDynamicsFilterUI();
      });
    }

    $("filter-sort").addEventListener("change", (e) => {
      state.filters.sortBy = e.target.value;
      state.filters.page = 1;
      renderDynamicsTable();
    });

    $("btn-reset-filters").addEventListener("click", () => {
      const keepSize = state.filters.pageSize;
      state.filters = { exchange: "全部", board: "全部", stage: "全部", province: "全部", keyword: "", sortBy: "update_date", page: 1, pageSize: keepSize };
      syncDynamicsFilterUI();
      renderDynamicsTable();
    });

    $("filter-page-size").addEventListener("change", (e) => {
      state.filters.pageSize = Number(e.target.value) || 30;
      state.filters.page = 1;
      renderDynamicsTable();
    });

    if ($("btn-export-excel")) $("btn-export-excel").addEventListener("click", exportFilteredExcel);

    $("btn-prev-page").addEventListener("click", () => {
      if (state.filters.page > 1) {
        state.filters.page -= 1;
        renderDynamicsTable();
      }
    });

    $("btn-next-page").addEventListener("click", () => {
      state.filters.page += 1;
      renderDynamicsTable();
    });

    // ==================== 二期：上市委审议事件绑定 ====================
    const syncCmUI = () => {
      document.querySelectorAll("#cm-board-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.cmFilters.board));
      document.querySelectorAll("#cm-result-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.cmFilters.result));
      document.querySelectorAll("#cm-year-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.cmFilters.year));
      $("cm-keyword").value = state.cmFilters.keyword;
      $("cm-clear-search").classList.toggle("hidden", !state.cmFilters.keyword);
    };

    document.querySelectorAll("#cm-board-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.cmFilters.board = btn.dataset.val; state.cmFilters.page = 1; syncCmUI(); renderCommitteeTable(); });
    });
    document.querySelectorAll("#cm-result-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.cmFilters.result = btn.dataset.val; state.cmFilters.page = 1; syncCmUI(); renderCommitteeTable(); });
    });
    document.querySelectorAll("#cm-year-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.cmFilters.year = btn.dataset.val; state.cmFilters.page = 1; syncCmUI(); renderCommitteeTable(); });
    });
    $("cm-keyword").addEventListener("input", (e) => {
      state.cmFilters.keyword = e.target.value; state.cmFilters.page = 1;
      $("cm-clear-search").classList.toggle("hidden", !state.cmFilters.keyword);
      renderCommitteeTable();
    });
    $("cm-clear-search").addEventListener("click", () => {
      state.cmFilters.keyword = ""; state.cmFilters.page = 1; syncCmUI(); renderCommitteeTable(); $("cm-keyword").focus();
    });
    $("cm-reset").addEventListener("click", () => {
      const sz = state.cmFilters.pageSize;
      state.cmFilters = { board: "全部", result: "全部", year: "全部", keyword: "", page: 1, pageSize: sz };
      syncCmUI(); renderCommitteeTable();
    });
    if ($("cm-export-excel")) $("cm-export-excel").addEventListener("click", exportCommitteeExcel);
    $("cm-page-size").addEventListener("change", (e) => { state.cmFilters.pageSize = Number(e.target.value) || 30; state.cmFilters.page = 1; renderCommitteeTable(); });
    $("cm-prev-page").addEventListener("click", () => { if (state.cmFilters.page > 1) { state.cmFilters.page -= 1; renderCommitteeTable(); } });
    $("cm-next-page").addEventListener("click", () => { state.cmFilters.page += 1; renderCommitteeTable(); });

    // ==================== 二期：发行动态事件绑定 ====================
    const syncIssUI = () => {
      document.querySelectorAll("#iss-board-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.issFilters.board));
      document.querySelectorAll("#iss-status-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.issFilters.status));
      document.querySelectorAll("#iss-year-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.issFilters.year));
      $("iss-keyword").value = state.issFilters.keyword;
      $("iss-clear-search").classList.toggle("hidden", !state.issFilters.keyword);
    };

    document.querySelectorAll("#iss-board-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.issFilters.board = btn.dataset.val; state.issFilters.page = 1; syncIssUI(); renderIssuanceTable(); });
    });
    document.querySelectorAll("#iss-status-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.issFilters.status = btn.dataset.val; state.issFilters.page = 1; syncIssUI(); renderIssuanceTable(); });
    });
    document.querySelectorAll("#iss-year-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.issFilters.year = btn.dataset.val; state.issFilters.page = 1; syncIssUI(); renderIssuanceTable(); });
    });
    $("iss-keyword").addEventListener("input", (e) => {
      state.issFilters.keyword = e.target.value; state.issFilters.page = 1;
      $("iss-clear-search").classList.toggle("hidden", !state.issFilters.keyword);
      renderIssuanceTable();
    });
    $("iss-clear-search").addEventListener("click", () => {
      state.issFilters.keyword = ""; state.issFilters.page = 1; syncIssUI(); renderIssuanceTable(); $("iss-keyword").focus();
    });
    $("iss-reset").addEventListener("click", () => {
      const sz = state.issFilters.pageSize;
      state.issFilters = { board: "全部", status: "全部", year: "全部", keyword: "", page: 1, pageSize: sz };
      syncIssUI(); renderIssuanceTable();
    });
    if ($("iss-export-excel")) $("iss-export-excel").addEventListener("click", exportIssuanceExcel);
    $("iss-page-size").addEventListener("change", (e) => { state.issFilters.pageSize = Number(e.target.value) || 30; state.issFilters.page = 1; renderIssuanceTable(); });
    $("iss-prev-page").addEventListener("click", () => { if (state.issFilters.page > 1) { state.issFilters.page -= 1; renderIssuanceTable(); } });
    $("iss-next-page").addEventListener("click", () => { state.issFilters.page += 1; renderIssuanceTable(); });

    // ==================== 全市场辅导备案事件绑定 ====================
    const syncTutUI = () => {
      document.querySelectorAll("#tut-board-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.tutFilters.board));
      document.querySelectorAll("#tut-stage-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.tutFilters.stage));
      document.querySelectorAll("#tut-bureau-chips .chip-btn, #tut-bureau-more .chip-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.val === state.tutFilters.bureau);
      });
      $("tut-keyword").value = state.tutFilters.keyword;
      $("tut-clear-search").classList.toggle("hidden", !state.tutFilters.keyword);
    };

    document.querySelectorAll("#tut-board-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tutFilters.board = btn.dataset.val;
        state.tutFilters.page = 1;
        syncTutUI();
        renderTutoringTable();
      });
    });

    document.querySelectorAll("#tut-stage-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tutFilters.stage = btn.dataset.val;
        state.tutFilters.page = 1;
        syncTutUI();
        renderTutoringTable();
      });
    });

    const handleBureauContainerClick = (e) => {
      const toggleBtn = e.target.closest("#tut-bureau-toggle");
      if (toggleBtn) {
        state.tutBureauExpanded = !state.tutBureauExpanded;
        updateTutoringChipCounts();
        syncTutUI();
        return;
      }
      const chip = e.target.closest(".chip-btn[data-val]");
      if (chip) {
        state.tutFilters.bureau = chip.dataset.val;
        state.tutFilters.page = 1;
        syncTutUI();
        renderTutoringTable();
      }
    };
    if ($("tut-bureau-chips")) $("tut-bureau-chips").addEventListener("click", handleBureauContainerClick);
    if ($("tut-bureau-more")) $("tut-bureau-more").addEventListener("click", handleBureauContainerClick);

    if ($("btn-tut-back")) {
      $("btn-tut-back").addEventListener("click", () => {
        switchSubTab("辅导备案");
      });
    }

    $("tut-keyword").addEventListener("input", (e) => {
      state.tutFilters.keyword = e.target.value; state.tutFilters.page = 1;
      $("tut-clear-search").classList.toggle("hidden", !state.tutFilters.keyword);
      renderTutoringTable();
    });
    $("tut-clear-search").addEventListener("click", () => {
      state.tutFilters.keyword = ""; state.tutFilters.page = 1; syncTutUI(); renderTutoringTable(); $("tut-keyword").focus();
    });
    $("tut-reset").addEventListener("click", () => {
      const sz = state.tutFilters.pageSize;
      state.tutFilters = {
        board: "全部",
        stage: "全部",
        bureau: "全部",
        keyword: "",
        sortBy: "update_date",
        sortDir: "desc",
        page: 1,
        pageSize: sz,
      };
      syncTutUI(); renderTutoringTable();
    });
    if ($("tut-export-excel")) $("tut-export-excel").addEventListener("click", exportTutoringExcel);
    $("tut-page-size").addEventListener("change", (e) => { state.tutFilters.pageSize = Number(e.target.value) || 30; state.tutFilters.page = 1; renderTutoringTable(); });
    $("tut-prev-page").addEventListener("click", () => { if (state.tutFilters.page > 1) { state.tutFilters.page -= 1; renderTutoringTable(); } });
    $("tut-next-page").addEventListener("click", () => { state.tutFilters.page += 1; renderTutoringTable(); });

    // ==================== 二期第2周：新三板挂牌事件绑定 ====================
    const syncNeeqUI = () => {
      document.querySelectorAll("#neeq-tier-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.neeqFilters.tier));
      document.querySelectorAll("#neeq-trade-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.neeqFilters.trade));
      document.querySelectorAll("#neeq-year-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.neeqFilters.year));
      $("neeq-keyword").value = state.neeqFilters.keyword;
      $("neeq-clear-search").classList.toggle("hidden", !state.neeqFilters.keyword);
    };

    document.querySelectorAll("#neeq-tier-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.neeqFilters.tier = btn.dataset.val; state.neeqFilters.page = 1; syncNeeqUI(); renderNeeqTable(); });
    });
    document.querySelectorAll("#neeq-trade-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.neeqFilters.trade = btn.dataset.val; state.neeqFilters.page = 1; syncNeeqUI(); renderNeeqTable(); });
    });
    document.querySelectorAll("#neeq-year-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.neeqFilters.year = btn.dataset.val; state.neeqFilters.page = 1; syncNeeqUI(); renderNeeqTable(); });
    });
    $("neeq-keyword").addEventListener("input", (e) => {
      state.neeqFilters.keyword = e.target.value; state.neeqFilters.page = 1;
      $("neeq-clear-search").classList.toggle("hidden", !state.neeqFilters.keyword);
      renderNeeqTable();
    });
    $("neeq-clear-search").addEventListener("click", () => {
      state.neeqFilters.keyword = ""; state.neeqFilters.page = 1; syncNeeqUI(); renderNeeqTable(); $("neeq-keyword").focus();
    });
    $("neeq-reset").addEventListener("click", () => {
      const sz = state.neeqFilters.pageSize;
      state.neeqFilters = { tier: "全部", trade: "全部", year: "全部", keyword: "", page: 1, pageSize: sz };
      syncNeeqUI(); renderNeeqTable();
    });
    if ($("neeq-export-excel")) $("neeq-export-excel").addEventListener("click", exportNeeqExcel);
    $("neeq-page-size").addEventListener("change", (e) => { state.neeqFilters.pageSize = Number(e.target.value) || 30; state.neeqFilters.page = 1; renderNeeqTable(); });
    $("neeq-prev-page").addEventListener("click", () => { if (state.neeqFilters.page > 1) { state.neeqFilters.page -= 1; renderNeeqTable(); } });
    $("neeq-next-page").addEventListener("click", () => { state.neeqFilters.page += 1; renderNeeqTable(); });

    // ==================== 三期：现场检查 & 监管措施事件绑定 ====================
    const syncInspUI = () => {
      document.querySelectorAll("#insp-year-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.inspFilters.year));
      document.querySelectorAll("#insp-board-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.inspFilters.board));
      document.querySelectorAll("#insp-stage-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.inspFilters.stage));
      document.querySelectorAll("#insp-batch-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.inspFilters.batch));
      if ($("insp-keyword")) $("insp-keyword").value = state.inspFilters.keyword;
      if ($("insp-clear-search")) $("insp-clear-search").classList.toggle("hidden", !state.inspFilters.keyword);
    };
    document.querySelectorAll("#insp-year-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.inspFilters.year = btn.dataset.val; state.inspFilters.page = 1; syncInspUI(); renderInspectionTable(); });
    });
    document.querySelectorAll("#insp-board-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.inspFilters.board = btn.dataset.val; state.inspFilters.page = 1; syncInspUI(); renderInspectionTable(); });
    });
    document.querySelectorAll("#insp-stage-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.inspFilters.stage = btn.dataset.val; state.inspFilters.page = 1; syncInspUI(); renderInspectionTable(); });
    });
    document.querySelectorAll("#insp-batch-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.inspFilters.batch = btn.dataset.val; state.inspFilters.page = 1; syncInspUI(); renderInspectionTable(); });
    });
    if ($("insp-keyword")) {
      $("insp-keyword").addEventListener("input", (e) => {
        state.inspFilters.keyword = e.target.value; state.inspFilters.page = 1;
        $("insp-clear-search").classList.toggle("hidden", !state.inspFilters.keyword);
        renderInspectionTable();
      });
    }
    if ($("insp-clear-search")) {
      $("insp-clear-search").addEventListener("click", () => {
        state.inspFilters.keyword = ""; state.inspFilters.page = 1; syncInspUI(); renderInspectionTable(); $("insp-keyword").focus();
      });
    }
    if ($("insp-reset")) {
      $("insp-reset").addEventListener("click", () => {
        const sz = state.inspFilters.pageSize;
        state.inspFilters = { year: "全部", board: "全部", stage: "全部", batch: "全部", keyword: "", page: 1, pageSize: sz };
        syncInspUI(); renderInspectionTable();
      });
    }
    if ($("insp-page-size")) $("insp-page-size").addEventListener("change", (e) => { state.inspFilters.pageSize = Number(e.target.value) || 30; state.inspFilters.page = 1; renderInspectionTable(); });
    if ($("insp-prev-page")) $("insp-prev-page").addEventListener("click", () => { if (state.inspFilters.page > 1) { state.inspFilters.page -= 1; renderInspectionTable(); } });
    if ($("insp-next-page")) $("insp-next-page").addEventListener("click", () => { state.inspFilters.page += 1; renderInspectionTable(); });

    const syncRegUI = () => {
      document.querySelectorAll("#reg-year-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.regFilters.year));
      document.querySelectorAll("#reg-org-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.regFilters.regulator));
      document.querySelectorAll("#reg-stage-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.regFilters.stage));
      document.querySelectorAll("#reg-cat-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.regFilters.category));
      if ($("reg-keyword")) $("reg-keyword").value = state.regFilters.keyword;
      if ($("reg-clear-search")) $("reg-clear-search").classList.toggle("hidden", !state.regFilters.keyword);
    };
    document.querySelectorAll("#reg-year-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.regFilters.year = btn.dataset.val; state.regFilters.page = 1; syncRegUI(); renderRegulatoryTable(); });
    });
    document.querySelectorAll("#reg-org-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.regFilters.regulator = btn.dataset.val; state.regFilters.page = 1; syncRegUI(); renderRegulatoryTable(); });
    });
    document.querySelectorAll("#reg-stage-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.regFilters.stage = btn.dataset.val; state.regFilters.page = 1; syncRegUI(); renderRegulatoryTable(); });
    });
    document.querySelectorAll("#reg-cat-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.regFilters.category = btn.dataset.val; state.regFilters.page = 1; syncRegUI(); renderRegulatoryTable(); });
    });
    if ($("reg-keyword")) {
      $("reg-keyword").addEventListener("input", (e) => {
        state.regFilters.keyword = e.target.value; state.regFilters.page = 1;
        $("reg-clear-search").classList.toggle("hidden", !state.regFilters.keyword);
        renderRegulatoryTable();
      });
    }
    if ($("reg-clear-search")) {
      $("reg-clear-search").addEventListener("click", () => {
        state.regFilters.keyword = ""; state.regFilters.page = 1; syncRegUI(); renderRegulatoryTable(); $("reg-keyword").focus();
      });
    }
    if ($("reg-reset")) {
      $("reg-reset").addEventListener("click", () => {
        const sz = state.regFilters.pageSize;
        state.regFilters = { year: "全部", regulator: "全部", stage: "全部", category: "全部", keyword: "", page: 1, pageSize: sz };
        syncRegUI(); renderRegulatoryTable();
      });
    }
    if ($("reg-page-size")) $("reg-page-size").addEventListener("change", (e) => { state.regFilters.pageSize = Number(e.target.value) || 30; state.regFilters.page = 1; renderRegulatoryTable(); });
    if ($("reg-prev-page")) $("reg-prev-page").addEventListener("click", () => { if (state.regFilters.page > 1) { state.regFilters.page -= 1; renderRegulatoryTable(); } });
    if ($("reg-next-page")) $("reg-next-page").addEventListener("click", () => { state.regFilters.page += 1; renderRegulatoryTable(); });

    const syncHkUI = () => {
      document.querySelectorAll("#hk-structure-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.hkFilters.structure));
      document.querySelectorAll("#hk-status-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.hkFilters.hkexStatus));
      document.querySelectorAll("#hk-csrc-chips .chip-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === state.hkFilters.csrcStatus));
      if ($("hk-keyword")) $("hk-keyword").value = state.hkFilters.keyword;
      if ($("hk-clear-search")) $("hk-clear-search").classList.toggle("hidden", !state.hkFilters.keyword);
    };
    document.querySelectorAll("#hk-structure-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.hkFilters.structure = btn.dataset.val; state.hkFilters.page = 1; syncHkUI(); renderHkTable(); });
    });
    document.querySelectorAll("#hk-status-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.hkFilters.hkexStatus = btn.dataset.val; state.hkFilters.page = 1; syncHkUI(); renderHkTable(); });
    });
    document.querySelectorAll("#hk-csrc-chips .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => { state.hkFilters.csrcStatus = btn.dataset.val; state.hkFilters.page = 1; syncHkUI(); renderHkTable(); });
    });
    if ($("hk-keyword")) {
      $("hk-keyword").addEventListener("input", (e) => {
        state.hkFilters.keyword = e.target.value; state.hkFilters.page = 1;
        $("hk-clear-search").classList.toggle("hidden", !state.hkFilters.keyword);
        renderHkTable();
      });
    }
    if ($("hk-clear-search")) {
      $("hk-clear-search").addEventListener("click", () => {
        state.hkFilters.keyword = ""; state.hkFilters.page = 1; syncHkUI(); renderHkTable(); $("hk-keyword").focus();
      });
    }
    if ($("hk-reset")) {
      $("hk-reset").addEventListener("click", () => {
        const sz = state.hkFilters.pageSize;
        state.hkFilters = { structure: "全部", hkexStatus: "全部", csrcStatus: "全部", keyword: "", page: 1, pageSize: sz };
        syncHkUI(); renderHkTable();
      });
    }
    if ($("hk-page-size")) $("hk-page-size").addEventListener("change", (e) => { state.hkFilters.pageSize = Number(e.target.value) || 20; state.hkFilters.page = 1; renderHkTable(); });
    if ($("hk-prev-page")) $("hk-prev-page").addEventListener("click", () => { if (state.hkFilters.page > 1) { state.hkFilters.page -= 1; renderHkTable(); } });
    if ($("hk-next-page")) $("hk-next-page").addEventListener("click", () => { state.hkFilters.page += 1; renderHkTable(); });

    const handleRouteRestore = async () => {
      const route = parseRouteFromLocation();
      if (route.kind === "detail" && route.company) {
        await openCompanyDetailByName(route.company, { exchange: route.exchange });
      } else if (route.kind === "tutoring-detail" && route.company) {
        await ensureDataset("tutoring");
        const norm = route.company.replace(/[（()）\s]/g, "");
        const hit = state.tutoringRecords.find((x) => String(x.company || "").replace(/[（()）\s]/g, "") === norm);
        if (hit) openTutoringDetail(hit, { skipHistory: true });
        else await switchSubTab("辅导备案", { skipHistory: true });
      } else {
        await switchSubTab(route.tab || "全景图", { skipHistory: true });
      }
    };

    window.addEventListener("popstate", handleRouteRestore);
    window.addEventListener("hashchange", () => {
      if (window.location.protocol === "file:") handleRouteRestore();
    });

    window.addEventListener("resize", () => {
      if (mapChart) mapChart.resize();
      if (sponsorChart) sponsorChart.resize();
      if (rightOrgChart) rightOrgChart.resize();
    });

    initMobileFilterCollapsers();
  }

  function initMobileFilterCollapsers() {
    document.querySelectorAll(".filter-minimal").forEach((box) => {
      if (box.previousElementSibling && box.previousElementSibling.classList.contains("mobile-filter-toggle")) {
        return;
      }
      box.classList.add("mobile-collapsed");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mobile-filter-toggle";
      btn.setAttribute("aria-expanded", "false");
      btn.innerHTML = `
        <span class="mobile-filter-toggle-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
          <span>筛选条件</span>
        </span>
        <span class="mobile-filter-summary">
          <span class="mobile-filter-summary-text">默认全部</span>
          <span class="mobile-filter-arrow">展开 ∨</span>
        </span>`;

      const summaryEl = btn.querySelector(".mobile-filter-summary-text");
      const arrowEl = btn.querySelector(".mobile-filter-arrow");

      const refreshSummary = () => {
        const picked = [];
        box.querySelectorAll(".chip-btn.active").forEach((chip) => {
          const val = chip.dataset.val;
          if (val && val !== "全部") {
            const label = val === "older" ? "2022及以前" : val;
            picked.push(label);
          }
        });
        summaryEl.textContent = picked.length ? `已选 ${picked.length} 项 · ${picked.join("、")}` : "默认全部";
      };

      btn.addEventListener("click", () => {
        const collapsed = box.classList.toggle("mobile-collapsed");
        btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
        arrowEl.textContent = collapsed ? "展开 ∨" : "收起 ∧";
      });

      const observer = new MutationObserver(refreshSummary);
      observer.observe(box, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
      refreshSummary();

      box.parentNode.insertBefore(btn, box);
    });
  }

  async function init() {
    const setupScrollFadeAndSticky = () => {
      const subBar = $("sub-tabs-sticky-bar");
      const topHeader = document.querySelector(".top-header");
      const titleRow = document.querySelector(".page-title-row");

      const updateStickyH = () => {
        if (subBar) {
          document.documentElement.style.setProperty("--sticky-subtabs-h", `${subBar.offsetHeight}px`);
        }
      };

      const updateFade = () => {
        const y = window.scrollY || window.pageYOffset || 0;
        // 顶部导航与「首发上市」标题随页面上滑逐渐淡出（10px -> 95px）
        const headerOpacity = y <= 10 ? 1 : y >= 95 ? 0 : Math.max(0, 1 - (y - 10) / 85);
        if (topHeader) {
          topHeader.style.opacity = String(headerOpacity);
          topHeader.style.pointerEvents = headerOpacity < 0.05 ? "none" : "";
        }
        if (titleRow) {
          titleRow.style.opacity = String(headerOpacity);
          titleRow.style.pointerEvents = headerOpacity < 0.05 ? "none" : "";
        }
        // 筛选区随页面上滑接近标签栏时逐渐淡出
        const subBottom = subBar ? subBar.getBoundingClientRect().bottom : 60;
        document.querySelectorAll(".filter-minimal").forEach((el) => {
          if (el.closest(".hidden")) return;
          const rect = el.getBoundingClientRect();
          // 当筛选区顶部进入吸顶标签栏下方 90px 范围内逐渐淡出至消失
          const dist = rect.bottom - subBottom;
          let op = 1;
          if (y > 40 && dist < 110) {
            op = dist <= 15 ? 0 : Math.max(0, Math.min(1, (dist - 15) / 95));
          }
          el.style.opacity = String(op);
          el.style.pointerEvents = op < 0.05 ? "none" : "";
        });
      };

      let ticking = false;
      const onScroll = () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(() => {
            updateFade();
            ticking = false;
          });
        }
      };

      updateStickyH();
      updateFade();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", () => {
        updateStickyH();
        updateFade();
      });
    };

    setupScrollFadeAndSticky();
    bindEvents();
    initAiAssistant();
    try {
      if ($("source-dot")) $("source-dot").className = "source-dot";
      if ($("source-text")) $("source-text").textContent = "实时数据 · IPOFlow";

      const route = parseRouteFromLocation();
      // 若通过 404.html ?p=... 跳回根路径，立即使用 replaceState 还原为干净路径
      if (window.location.protocol !== "file:" && new URLSearchParams(window.location.search).has("p")) {
        const prefix = getBasePrefix();
        const rawP = new URLSearchParams(window.location.search).get("p") || "/ipo-review/kanban";
        window.history.replaceState({ routePath: rawP }, document.title, `${prefix}${rawP}`);
      }

      if (route.kind === "detail" && route.company) {
        state.activeTab = "审核动态";
        if ($("active-subtab-pill")) $("active-subtab-pill").textContent = "审核动态";
        await ensureDataset("ipo");
        const norm = route.company.replace(/[（()）\s]/g, "");
        const matched = state.records.find((x) => String(x.company || "").replace(/[（()）\s]/g, "") === norm);
        await openProjectDetail(
          matched || {
            company: route.company,
            exchange: route.exchange || "上交所",
            board: "科创板",
            stage: "问询",
            raw_status: "—",
            sponsors: [],
            law_firms: [],
            accounting_firms: [],
          },
          "info",
          { skipHistory: true }
        );
      } else if (route.kind === "tutoring-detail" && route.company) {
        state.activeTab = "辅导备案";
        if ($("active-subtab-pill")) $("active-subtab-pill").textContent = "辅导备案";
        await ensureDataset("tutoring");
        const norm = route.company.replace(/[（()）\s]/g, "");
        const hit = state.tutoringRecords.find((x) => String(x.company || "").replace(/[（()）\s]/g, "") === norm);
        if (hit) await openTutoringDetail(hit, { skipHistory: true });
        else await switchSubTab("辅导备案", { replaceHistory: true });
      } else {
        const targetTab = route.tab || "全景图";
        await switchSubTab(targetTab, { replaceHistory: true });
      }
    } catch (err) {
      console.error(err);
      if ($("overview-date-text")) $("overview-date-text").textContent = "数据加载失败，请先运行数据脚本";
    }
  }

  // ==================== AI 模式助手（智谱 GLM-4-Flash 免费版） ====================
  function initAiAssistant() {
    const drawer = $("ai-drawer");
    const backdrop = $("ai-drawer-backdrop");
    const msgBox = $("ai-messages");
    const inputEl = $("ai-input");
    const sendBtn = $("ai-send-btn");
    const keyPanel = $("ai-key-panel");
    const keyInput = $("ai-key-input");
    const ctxBar = $("ai-context-bar");
    if (!drawer || !msgBox) return;

    const STORAGE_KEY = "ipoflow_zhipu_key";
    let chatHistory = [];
    let isBusy = false;

    if (keyInput) keyInput.value = localStorage.getItem(STORAGE_KEY) || "";

    const countBy = (arr, fn) => {
      const m = {};
      for (const item of arr) {
        const k = fn(item) || "其他";
        m[k] = (m[k] || 0) + 1;
      }
      return Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, v]) => `${k}:${v}`)
        .join("，");
    };

    const buildAiContext = () => {
      if (state.currentDetailRec && !$("view-detail").classList.contains("hidden")) {
        const r = state.currentDetailRec;
        const insp = getInspectionForCompany(r.company);
        const regs = getRegulatoryForCompany(r.company);
        ctxBar.textContent = `📌 当前上下文：项目详情 · ${r.company}`;
        return [
          `当前正在查看项目详情：${r.company}（${r.exchange} · ${r.board}，当前状态：${r.raw_status || r.stage}）`,
          `行业：${r.industry || "—"}；注册地：${r.province || "—"}；保荐机构：${(r.sponsors || []).join("、") || "—"}`,
          `律师：${(r.law_firms || []).join("、") || "—"}；会计师：${(r.accounting_firms || []).join("、") || "—"}`,
          `受理日期：${r.accept_date || "—"}；更新日期：${r.update_date || "—"}`,
          insp ? `现场检查记录：${insp.batch || "抽中"}（${insp.draw_date || ""}）` : "现场检查记录：无",
          regs.length ? `监管措施记录：${regs.length}条（最新：${regs[0].title}）` : "监管措施记录：无",
        ].join("\n");
      }

      if (state.activeTab === "港股IPO" && state.hkRecords.length) {
        const list = getFilteredHk();
        ctxBar.textContent = `📌 当前上下文：港股IPO（匹配 ${list.length} / 总计 ${state.hkRecords.length} 家）`;
        return [
          `当前视图：港股IPO，总库 ${state.hkRecords.length} 家，当前筛选匹配 ${list.length} 家。`,
          `上市架构分布：${countBy(list, (x) => x.structure)}`,
          `港交所状态分布：${countBy(list, (x) => x.hkex_status)}`,
          `证监会备案分布：${countBy(list, (x) => x.csrc_status)}`,
          `前8条样本：${list.slice(0, 8).map((x) => `${x.company}(${x.structure}/${x.hkex_status}/${x.csrc_status})`).join("；")}`,
        ].join("\n");
      }

      if (state.activeTab === "现场检查" && state.inspectionRecords.length) {
        const list = getFilteredInspection();
        ctxBar.textContent = `📌 当前上下文：现场检查（匹配 ${list.length} / 总计 ${state.inspectionRecords.length} 家）`;
        return [
          `当前视图：现场检查，总计 ${state.inspectionRecords.length} 家，当前筛选 ${list.length} 家。`,
          `板块分布：${countBy(list, (x) => x.board)}`,
          `状态分布：${countBy(list, (x) => x.stage)}`,
          `保荐机构Top：${countBy(list, (x) => normalizeBrokerName((x.sponsors || []).join("、") || x.sponsor))}`,
        ].join("\n");
      }

      if (state.activeTab === "监管措施" && state.regulatoryRecords.length) {
        const list = getFilteredRegulatory();
        ctxBar.textContent = `📌 当前上下文：监管措施（匹配 ${list.length} / 总计 ${state.regulatoryRecords.length} 条）`;
        return [
          `当前视图：监管措施，总计 ${state.regulatoryRecords.length} 条，当前筛选 ${list.length} 条。`,
          `监管机构：${countBy(list, (x) => x.regulator)}；处罚类别：${countBy(list, (x) => x.category)}`,
          `涉及审核状态：${countBy(list, (x) => x.stage)}`,
        ].join("\n");
      }

      const sourceList = state.records.length ? getFilteredRecords() : state.activeRecords;
      const totalAll = state.records.length || state.activeRecords.length;
      ctxBar.textContent = `📌 当前上下文：A股IPO ${state.activeTab}（匹配 ${sourceList.length} / 库内 ${totalAll} 家）`;
      return [
        `当前视图：${state.activeTab}，库内 ${totalAll} 家，当前筛选结果 ${sourceList.length} 家。`,
        `交易所分布：${countBy(sourceList, (x) => x.exchange)}`,
        `板块分布：${countBy(sourceList, (x) => x.board)}`,
        `审核阶段分布：${countBy(sourceList, (x) => x.stage)}`,
        `注册地Top省份：${countBy(sourceList, (x) => x.province)}`,
        `保荐机构Top：${countBy(sourceList, (x) => normalizeBrokerName((x.sponsors || []).join("、")))}`,
        `最新样本(前10条)：${sourceList.slice(0, 10).map((x) => `${x.company}[${x.board}/${x.raw_status || x.stage}/${(x.sponsors || [])[0] || "—"}]`).join("；")}`,
      ].join("\n");
    };

    const applyAiFilter = async (spec) => {
      if (!spec || typeof spec !== "object") return;
      const tab = spec.tab || "审核动态";
      if (tab === "港股IPO") {
        if (spec.structure) state.hkFilters.structure = spec.structure;
        if (spec.hkexStatus) state.hkFilters.hkexStatus = spec.hkexStatus;
        if (spec.csrcStatus) state.hkFilters.csrcStatus = spec.csrcStatus;
        if (spec.keyword !== undefined) state.hkFilters.keyword = spec.keyword;
        state.hkFilters.page = 1;
        await switchSubTab("港股IPO");
        renderHkTable();
      } else {
        await switchSubTab("审核动态");
        if (spec.exchange) state.filters.exchange = spec.exchange;
        if (spec.board) state.filters.board = spec.board;
        if (spec.stage) state.filters.stage = spec.stage;
        if (spec.province) state.filters.province = spec.province;
        if (spec.keyword !== undefined) state.filters.keyword = spec.keyword;
        state.filters.page = 1;
        syncDynamicsFilterUI();
        renderDynamicsTable();
      }
      closeDrawer();
    };

    const renderAiMarkdown = (rawText) => {
      let filterSpec = null;
      const cleanText = String(rawText || "").replace(/\[\[FILTER:(\{.*?\})\]\]/g, (_, jsonStr) => {
        try {
          filterSpec = JSON.parse(jsonStr);
        } catch (_) {}
        return "";
      }).trim();

      let html = escapeHtml(cleanText)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
        .replace(/^###\s+(.+)$/gm, "<div style='font-weight:700;margin:8px 0 4px;color:#111827;'>$1</div>")
        .replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");
      html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>").replace(/<\/ul>\s*<ul>/g, "");
      html = html.replace(/\n/g, "<br>");
      return { html, filterSpec };
    };

    const appendMsg = (role, text, isHtml = false) => {
      const div = document.createElement("div");
      div.className = `ai-msg ai-msg-${role}`;
      if (isHtml) {
        div.innerHTML = text;
      } else if (role === "assistant") {
        const { html, filterSpec } = renderAiMarkdown(text);
        div.innerHTML = html;
        if (filterSpec) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "ai-apply-filter-btn";
          btn.textContent = "🎯 一键应用筛选条件到列表";
          btn.addEventListener("click", () => applyAiFilter(filterSpec));
          div.appendChild(btn);
        }
      } else {
        div.textContent = text;
      }
      msgBox.appendChild(div);
      msgBox.scrollTop = msgBox.scrollHeight;
      return div;
    };

    const showWelcome = () => {
      if (msgBox.children.length > 0) return;
      appendMsg(
        "assistant",
        "你好！我是基于 **智谱 GLM-4-Flash（免费版）** 的 IPO 智览 AI 助手。你可以直接向我提问：\n- **AI 查找**：如「找科创板中信建投保荐的已问询企业」\n- **AI 分析**：如「分析当前排队结构与现场检查撤回风险」\n- **AI 统计简报**：点击上方快捷指令一键生成专业简报"
      );
    };

    const openDrawer = () => {
      buildAiContext();
      showWelcome();
      backdrop.classList.remove("hidden");
      drawer.classList.remove("hidden");
      setTimeout(() => inputEl && inputEl.focus(), 80);
    };

    const closeDrawer = () => {
      backdrop.classList.add("hidden");
      drawer.classList.add("hidden");
    };

    const sendMessage = async (customText) => {
      if (isBusy) return;
      const text = (customText !== undefined ? customText : inputEl.value).trim();
      if (!text) return;
      if (customText === undefined) inputEl.value = "";

      appendMsg("user", text);
      const loadingEl = appendMsg("assistant", "正在连接 GLM-4-Flash 思考分析中...", true);
      isBusy = true;
      sendBtn.disabled = true;

      const ctxData = buildAiContext();
      const systemPrompt = [
        "你是「IPO 智览」专业投行与资本市场研究助手，基于真实实时看板数据用简体中文回答。",
        "严格约束：所有数量、比例、机构名称只能依据下方【实时看板上下文】作答，严禁编造具体公司名称或统计数字。",
        "当用户希望查找/筛选/列出符合特定条件（交易所、板块、审核阶段、省份、保荐机构、关键词或港股IPO）的项目时，请在回答最末尾附加一行结构化筛选标记，格式严格如下：",
        '[[FILTER:{"tab":"审核动态","exchange":"全部","board":"科创板","stage":"问询","province":"全部","keyword":"中信建投"}]]',
        "其中 stage 可选值：全部、仅看在审、受理、问询、上市委、提交注册、注册同意、中止、终止；board 可选：全部、沪主板、科创板、深主板、创业板、北证；exchange 可选：全部、上交所、深交所、北交所。",
        "\n【实时看板上下文】\n" + ctxData,
      ].join("\n");

      chatHistory.push({ role: "user", content: text });
      const apiMessages = [{ role: "system", content: systemPrompt }, ...chatHistory.slice(-8)];

      try {
        const resp = await fetch("/api/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            apiKey: localStorage.getItem(STORAGE_KEY) || "",
          }),
        });
        const data = await resp.json();
        loadingEl.remove();
        if (!resp.ok || !data.ok) {
          if (data && data.needKey && keyPanel) {
            keyPanel.classList.remove("hidden");
          }
          appendMsg("assistant", `⚠️ ${data.error || "调用 GLM-4-Flash 失败，请检查配置。"}`);
          chatHistory.pop();
          return;
        }
        const reply = data.reply || "（未返回有效内容）";
        chatHistory.push({ role: "assistant", content: reply });
        appendMsg("assistant", reply);
      } catch (err) {
        loadingEl.remove();
        chatHistory.pop();
        appendMsg("assistant", `⚠️ 无法连接 AI 透传接口（${err.message || "网络异常"}）。若为本地直接双击打开，请运行 \`python3 server.py\` 访问。`);
      } finally {
        isBusy = false;
        sendBtn.disabled = false;
      }
    };

    if ($("btn-ai-mode")) $("btn-ai-mode").addEventListener("click", openDrawer);
    if ($("ai-btn-close")) $("ai-btn-close").addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);
    if ($("ai-btn-clear")) {
      $("ai-btn-clear").addEventListener("click", () => {
        chatHistory = [];
        msgBox.innerHTML = "";
        showWelcome();
      });
    }
    if ($("ai-btn-key") && keyPanel) {
      $("ai-btn-key").addEventListener("click", () => keyPanel.classList.toggle("hidden"));
    }
    if ($("ai-key-save") && keyInput) {
      $("ai-key-save").addEventListener("click", () => {
        const val = keyInput.value.trim();
        if (val) localStorage.setItem(STORAGE_KEY, val);
        else localStorage.removeItem(STORAGE_KEY);
        keyPanel.classList.add("hidden");
        appendMsg("assistant", val ? "✅ 已保存智谱免费 API Key（仅存于当前浏览器），现在可直接提问！" : "已清空本地 API Key。");
      });
    }
    document.querySelectorAll(".ai-quick-chip").forEach((chip) => {
      chip.addEventListener("click", () => sendMessage(chip.dataset.prompt || chip.textContent));
    });
    if (sendBtn) sendBtn.addEventListener("click", () => sendMessage());
    if (inputEl) {
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
