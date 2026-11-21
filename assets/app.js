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

  const state = {
    meta: null,
    records: [],        // 全量审核记录（含注册同意/终止）
    activeRecords: [],  // 当前在审记录（全景图统计口径）
    activeTab: "全景图",
    previousTab: "审核动态",
    mapMode: "heatmap",
    rightOrgType: "law",
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

  async function loadData() {
    try {
      const resp = await fetch("./data/ipo_data.json", { cache: "no-cache" });
      if (resp.ok) return await resp.json();
    } catch (_) {}
    if (window.__IPO_DATA__) return window.__IPO_DATA__;
    throw new Error("无法加载 data/ipo_data.json 或 data/ipo_data.js");
  }

  async function ensureChinaGeoJson() {
    if (state.chinaMapLoaded) return true;
    if (state.chinaMapFailed) return false;
    const urls = [
      "./data/china.json",
      "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json",
    ];
    for (const url of urls) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const geoJson = await resp.json();
        if (window.echarts && geoJson && geoJson.features) {
          window.echarts.registerMap("china", geoJson);
          state.chinaMapLoaded = true;
          return true;
        }
      } catch (_) {}
    }
    state.chinaMapFailed = true;
    return false;
  }

  function updateHeaderMeta() {
    const meta = state.meta || {};
    const activeTotal = state.activeRecords.length;
    const allTotal = state.records.length;
    $("overview-date-text").textContent = `截止：${meta.update_date || "-"}  A股IPO在审`;
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

  function getOrgStats(field, topN = 15) {
    const map = {};
    for (const r of state.activeRecords) {
      for (const org of r[field] || []) {
        if (!org) continue;
        map[org] = (map[org] || 0) + 1;
      }
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, topN);
  }

  function renderMatrix() {
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
        html += val > 0
          ? `<td><span class="matrix-num clickable" data-board="${bd}" data-stage="${st}" title="查看 ${bd} · ${st}">${val}</span></td>`
          : `<td><span class="matrix-num zero">0</span></td>`;
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
      totalHtml += `<td><span class="matrix-num clickable" data-board="${bd}" data-stage="在审汇总" title="查看 ${bd} 全部在审">${colTotals[bd]}</span></td>`;
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
          jumpToDynamics({ exchange: "全部", board: "全部", stage: "在审汇总", province: prov, keyword: "" });
        }
      });
    }

    const stats = getProvinceStats(state.activeRecords);

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
            return `<div style="font-weight:600;margin-bottom:2px;">${p.name}</div>在审企业：<b style="color:#9e2235">${val}</b> 家<br/><span style="font-size:11px;color:#888">点击查看明细</span>`;
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
          textStyle: { color: "#8f959e", fontSize: 12 },
          seriesIndex: 0,
          pieces: [
            { gt: 50, color: "#c99679" },
            { gt: 20, lte: 50, color: "#dfb89c" },
            { gt: 10, lte: 20, color: "#ecd2be" },
            { gt: 3, lte: 10, color: "#f4e4d5" },
            { gt: 0, lte: 3, color: "#faf1e6" },
            { value: 0, color: "#fbf7f2" },
          ],
        },
        geo: {
          map: "china",
          roam: false,
          zoom: 1.22,
          center: [104.5, 35.8],
          itemStyle: { areaColor: "#fbf7f2", borderColor: "#d9c9bd", borderWidth: 0.8 },
          emphasis: { label: { show: false }, itemStyle: { areaColor: "#f2d6c9" } },
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
            itemStyle: { color: "#9e2235", shadowBlur: 6, shadowColor: "rgba(158,34,53,0.28)" },
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
        formatter: (arr) => `${arr[0].name}：<b style="color:#9e2235">${arr[0].value}</b> 家`,
      },
      grid: { left: 16, right: 24, top: 20, bottom: 52, containLabel: true },
      xAxis: {
        type: "category",
        data: top15.map((x) => x.name.replace(/省|市|维吾尔自治区|壮族自治区|回族自治区|自治区/g, "")),
        axisLabel: { color: "#5c626b", fontSize: 12, interval: 0, rotate: 32 },
        axisLine: { lineStyle: { color: "#e8e0dc" } },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#f3ece9", type: "dashed" } },
        axisLabel: { color: "#8f959e", fontSize: 12 },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 22,
          data: top15.map((x) => ({ value: x.value, name: x.name })),
          itemStyle: { color: "#9e2235", borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: "top", color: "#9e2235", fontSize: 11, fontWeight: 600 },
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
          `${arr[0].name}<br/>在审家数：<b style="color:#9e2235">${arr[0].value}</b> 家<br/><span style="font-size:11px;color:#888">点击筛选该机构在审企业</span>`,
      },
      grid: { left: 10, right: 36, top: 8, bottom: 10, containLabel: true },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#f4eeec", type: "dashed" } },
        axisLabel: { color: "#8f959e", fontSize: 11 },
      },
      yAxis: {
        type: "category",
        data: reversed.map((x) => x.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#3d424a", fontSize: 12, width: 130, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          barWidth: 14,
          data: reversed.map((x) => x.value),
          itemStyle: { color: "#9e2235", borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: "right", color: "#9e2235", fontSize: 12, fontWeight: 600 },
        },
      ],
    });
    return chart;
  }

  function renderOrgCharts() {
    sponsorChart = renderRankChart(sponsorChart, "sponsor-chart", getOrgStats("sponsors", 15), (org) => {
      jumpToDynamics({ exchange: "全部", board: "全部", stage: "在审汇总", province: "全部", keyword: org });
    });
    const rightField = state.rightOrgType === "law" ? "law_firms" : "accounting_firms";
    rightOrgChart = renderRankChart(rightOrgChart, "right-org-chart", getOrgStats(rightField, 15), (org) => {
      jumpToDynamics({ exchange: "全部", board: "全部", stage: "在审汇总", province: "全部", keyword: org });
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
        const hay = [
          r.company,
          r.industry,
          r.province,
          r.exchange,
          r.board,
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

    $("dynamics-count").innerHTML = `为您找到 <b style="color:#9e2235;font-size:15px;">${total.toLocaleString()}</b> 条相关结果`;

    const tbody = $("dynamics-tbody");
    if (!pageRows.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:36px;color:#8f959e;">未找到符合筛选条件的企业，请尝试放宽筛选条件</td></tr>`;
    } else {
      tbody.innerHTML = pageRows
        .map(
          (r, idx) => `
          <tr class="clickable-row" data-rec-idx="${idx}">
            <td style="color:#8f959e;">${start + idx + 1}</td>
            <td>
              <span class="company-link">${escapeHtml(r.company)}</span>
              <div style="font-size:11px;color:#8f959e;margin-top:2px;">${escapeHtml(r.industry || "")}</div>
            </td>
            <td style="white-space:nowrap;">${escapeHtml(r.exchange)}</td>
            <td><span class="board-tag">${escapeHtml(r.board)}</span></td>
            <td><span class="stage-tag stage-${escapeHtml(r.stage)}">${escapeHtml(r.raw_status || r.stage)}</span></td>
            <td style="white-space:nowrap;">${escapeHtml(r.province.replace(/省|市|维吾尔自治区|壮族自治区|回族自治区|自治区/g, ""))}</td>
            <td>${escapeHtml((r.sponsors || []).join("、") || "-")}</td>
            <td>${escapeHtml((r.law_firms || []).join("、") || "-")}</td>
            <td>${escapeHtml((r.accounting_firms || []).join("、") || "-")}</td>
            <td style="white-space:nowrap;color:#5c626b;">${escapeHtml(r.update_date || "-")}</td>
            <td style="white-space:nowrap;color:#5c626b;">${escapeHtml(r.accept_date || "-")}</td>
          </tr>`
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
          <div class="timeline-circle">✓</div>
        </div>`
      )
      .join("");
  }

  function renderDetailInfo(info) {
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
      [
        "官方审核页",
        info.source_url
          ? `<a href="${escapeHtml(info.source_url)}" target="_blank" rel="noopener noreferrer">前往 ${escapeHtml(info.exchange)} 官网查看原页 ↗</a>`
          : "—",
        false,
        true,
      ],
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

  function switchDetailTab(dtab) {
    document.querySelectorAll(".detail-tab").forEach((b) => b.classList.toggle("active", b.dataset.dtab === dtab));
    $("dtab-info").classList.toggle("hidden", dtab !== "info");
    $("dtab-docs").classList.toggle("hidden", dtab !== "docs");
    const isFuture = dtab === "fundamental" || dtab === "issue";
    $("dtab-future").classList.toggle("hidden", !isFuture);
    if (dtab === "fundamental") {
      $("dtab-future-title").textContent = "企业基本面（二期规划）";
      $("dtab-future-desc").textContent = "后续将按需接入新三板/北交所公开财报接口，以及招股书财务摘要解析。";
    } else if (dtab === "issue") {
      $("dtab-future-title").textContent = "发行动态（二期规划）";
      $("dtab-future-desc").textContent = "后续将接入东方财富新股发行接口，展示发行价、市盈率、网上申购日与中签率。";
    }
  }

  async function openProjectDetail(rec) {
    state.previousTab = state.activeTab;
    $("view-overview").classList.add("hidden");
    $("view-dynamics").classList.add("hidden");
    $("view-placeholder").classList.add("hidden");
    $("view-detail").classList.remove("hidden");
    switchDetailTab("info");
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
      sponsor: (rec.sponsors || []).join("、") || "—",
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

    // 2. 命中前端会话缓存直接渲染
    const cacheKey = `${rec.exchange}::${rec.company}`;
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

      renderDetailInfo({
        ...baseInfo,
        plan_raise_yi: "需启动 server.py 或部署 Cloudflare Pages 实时获取",
        sponsor_reps: "需实时透传获取",
        accountants: "需实时透传获取",
        lawyers: "需实时透传获取",
      });
      renderDocuments([]);
    }
  }

  function applyLiveDetail(live, rec) {
    $("detail-live-dot").className = "source-dot";
    $("detail-live-text").textContent = live.live_source || "交易所实时透传成功";
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
      sponsor: live.sponsor && live.sponsor !== "—" ? live.sponsor : (rec.sponsors || []).join("、"),
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

  function switchSubTab(tabName) {
    state.activeTab = tabName;
    $("view-detail").classList.add("hidden");
    document.querySelectorAll(".sub-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    $("view-overview").classList.toggle("hidden", tabName !== "全景图");
    $("view-dynamics").classList.toggle("hidden", tabName !== "审核动态");

    const placeholder = $("view-placeholder");
    if (tabName !== "全景图" && tabName !== "审核动态") {
      const info = FUTURE_TAB_INFO[tabName] || { title: tabName, desc: "MVP 二期规划接入", source: "" };
      $("placeholder-title").textContent = info.title;
      $("placeholder-desc").textContent = info.desc;
      $("placeholder-source").textContent = info.source;
      placeholder.classList.remove("hidden");
    } else {
      placeholder.classList.add("hidden");
    }

    if (tabName === "全景图") {
      setTimeout(() => {
        if (mapChart) mapChart.resize();
        if (sponsorChart) sponsorChart.resize();
        if (rightOrgChart) rightOrgChart.resize();
      }, 50);
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
      renderDynamicsTable();
    });

    $("filter-sort").addEventListener("change", (e) => {
      state.filters.sortBy = e.target.value;
      state.filters.page = 1;
      renderDynamicsTable();
    });

    $("btn-reset-filters").addEventListener("click", () => {
      state.filters = { exchange: "全部", board: "全部", stage: "全部", province: "全部", keyword: "", sortBy: "update_date", page: 1, pageSize: 20 };
      syncDynamicsFilterUI();
      renderDynamicsTable();
    });

    $("btn-export-excel").addEventListener("click", exportFilteredExcel);

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

    window.addEventListener("resize", () => {
      if (mapChart) mapChart.resize();
      if (sponsorChart) sponsorChart.resize();
      if (rightOrgChart) rightOrgChart.resize();
    });
  }

  async function init() {
    bindEvents();
    try {
      const payload = await loadData();
      state.meta = payload.meta || {};
      state.records = payload.records || [];
      // 兼容旧版未带 is_active 的数据
      state.activeRecords = state.records.filter((r) => r.is_active !== false);

      updateHeaderMeta();
      renderMatrix();
      updateFilterChipCounts();
      populateProvinceSelect();
      renderDynamicsTable();
      renderOrgCharts();
      await renderMapOrBar();
    } catch (err) {
      console.error(err);
      $("overview-date-text").textContent = "数据加载失败，请先运行数据脚本";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
