/**
 * Cloudflare Pages Function — 方案 B 零成本按需实时透传接口
 * 路由：GET /api/project-detail?company=<公司全称>&exchange=<上交所|深交所|北交所>&code=<证券代码>
 *
 * 支持三大交易所 100% 官网直连：
 * - 上交所：query.sse.com.cn/statusAction.do + GP_GPZCZ_SHXXPL（兼容全半角括号）
 * - 深交所：listing.szse.cn/api/ras/projectrends/query + details（兼容全半角括号）
 * - 北交所：www.bse.cn/projectNewsController/infoResult.do + infoDetailResult.do（自动获取 C3VK Cookie）
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=1800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\(/g, "（")
    .replace(/\)/g, "）")
    .replace(/\s+/g, "");
}

function searchKeyword(company) {
  const clean = String(company || "").replace(/[（()）]/g, "").trim();
  return clean.length > 8 ? clean.slice(0, 8) : clean;
}

function uniqueNonEmpty(arr) {
  return [...new Set(arr.filter(Boolean))];
}

async function fetchJson(url, headers = {}, init = {}) {
  const resp = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      ...headers,
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  let text = (await resp.text()).trim();
  const m = text.match(/^[a-zA-Z0-9_]+\(([\s\S]*)\);?$/);
  if (m) text = m[1];
  return JSON.parse(text);
}

function fmtDate(raw) {
  if (!raw) return "";
  if (typeof raw === "object" && raw.time) {
    const d = new Date(Number(raw.time) + 8 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (s.length >= 10 && s[4] === "-") return s.slice(0, 10);
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return s.slice(0, 10);
}

function cleanPeople(raw) {
  if (!raw) return "";
  const arr = Array.isArray(raw) ? raw : String(raw).split(/[,，、;；]+/);
  return [...new Set(arr.map((x) => String(x || "").trim()).filter(Boolean))].join("、");
}

async function fetchSzseDetail(company) {
  const normTarget = normalizeName(company);
  const search = await fetchJson("https://listing.szse.cn/api/ras/projectrends/query?bizType=1&pageIndex=0&pageSize=2000", {
    Referer: "https://listing.szse.cn/",
  });
  const rows = search.data || [];
  let matched = rows.filter((r) => normalizeName(r.cmpnm) === normTarget);
  if (!matched.length) {
    matched = rows.filter((r) => {
      const n = normalizeName(r.cmpnm);
      return n && (normTarget.includes(n) || n.includes(normTarget));
    });
  }
  if (!matched.length) return null;
  matched.sort((a, b) => String(b.updtdt || "").localeCompare(String(a.updtdt || "")));
  const target = matched[0];

  const prjid = target.prjid;
  const detailResp = await fetchJson(`https://listing.szse.cn/api/ras/projectrends/details?id=${prjid}`, {
    Referer: `https://listing.szse.cn/projectdynamic/ipo/detail/index.html?id=${prjid}`,
  });
  const d = detailResp.data || detailResp;

  let pjdot = {};
  try {
    pjdot = typeof d.pjdot === "string" ? JSON.parse(d.pjdot) : d.pjdot || {};
  } catch (_) {}

  const stepDefs = [
    ["0", "受理", "已受理"],
    ["1", "问询", "已问询"],
    ["2", "上市委", "上市委会议"],
    ["3", "提交注册", "提交注册"],
    ["4", "注册结果", "注册结果"],
  ];
  const timeline = stepDefs.map(([k, key, label]) => {
    const node = pjdot[k] || {};
    const dt = fmtDate(node.startTime);
    return { key, label: node.name || label, date: dt, done: Boolean(dt) };
  });

  const docs = [];
  const docFields = [
    ["disclosureMaterials", "招股及申报文件"],
    ["enquiryResponseAttachment", "问询与回复"],
    ["meetingConclusionAttachment", "上市委会议"],
    ["registrationResultAttachment", "注册结果"],
    ["terminationNoticeAttachment", "终止公告"],
  ];
  for (const [field, cat] of docFields) {
    const items = Array.isArray(d[field]) ? d[field] : [];
    for (const item of items) {
      const path = item.dfpth || item.filePath || "";
      if (!path) continue;
      docs.push({
        title: item.dfnm || item.fileName || item.title || "审核公告文件",
        category: cat,
        date: fmtDate(item.ddt || item.pubDate),
        url: path.startsWith("http") ? path : `https://reportdocs.static.szse.cn${path}`,
      });
    }
  }
  docs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const sponsors = [d.sprinst, d.jsprinst].filter(Boolean);
  const sponsorReps = [d.sprrep, d.jsprrep].filter(Boolean);

  return {
    ok: true,
    live_source: "深交所官网实时直连",
    company: d.cmpnm || company,
    exchange: "深交所",
    board: d.boardName || "",
    status: d.prjst || "",
    industry: d.csrcind || "",
    province: d.regloc || "",
    plan_raise_yi: d.maramt ? `${Number(d.maramt).toFixed(2)} 亿元` : "暂无数据",
    issue_ratio: "暂无数据",
    listing_standard: d.issueTargetName || "—",
    board_position: d.approveProcessTypeName || d.boardName || "—",
    sponsor: sponsors.join("、") || "—",
    sponsor_reps: cleanPeople(sponsorReps.join("、")) || "—",
    accounting_firm: d.acctfm || "—",
    accountants: cleanPeople(d.acctsgnt) || "—",
    law_firm: d.lawfm || "—",
    lawyers: cleanPeople(d.lglsgnt) || "—",
    source_url: "https://www.szse.cn/listing/",
    timeline,
    documents: docs.slice(0, 30),
  };
}

async function fetchSseDetail(company) {
  const normTarget = normalizeName(company);
  let rows = [];
  for (const kw of uniqueNonEmpty([normTarget, searchKeyword(company), company])) {
    const q = new URLSearchParams({
      isPagination: "true",
      sqlId: "SH_XM_LB",
      issueMarketType: "1,2",
      stockAuditName: kw,
      "pageHelp.pageSize": "20",
      "pageHelp.pageNo": "1",
      "pageHelp.beginPage": "1",
      "pageHelp.endPage": "1",
    });
    const resp = await fetchJson(`https://query.sse.com.cn/statusAction.do?${q}`, {
      Referer: "https://listing.sse.com.cn/",
    });
    rows = (resp.pageHelp && resp.pageHelp.data) || [];
    if (rows.length) break;
  }

  let matched = rows.filter((r) => normalizeName(r.stockAuditName) === normTarget);
  if (!matched.length) {
    matched = rows.filter((r) => {
      const n = normalizeName(r.stockAuditName);
      return n && (normTarget.includes(n) || n.includes(normTarget));
    });
  }
  if (!matched.length) return null;
  matched.sort((a, b) => String(b.updateDate || "").localeCompare(String(a.updateDate || "")));
  const d = matched[0];

  const auditNum = String(d.stockAuditNum || "");
  const sponsors = [];
  const sponsorReps = [];
  const accFirms = [];
  const accountants = [];
  const lawFirms = [];
  const lawyers = [];

  for (const item of d.intermediary || []) {
    const itype = item.i_intermediaryType;
    const name = (item.i_intermediaryName || item.i_intermediaryAbbrName || "").trim();
    const persons = item.i_person || [];
    if (itype === 1) {
      if (name) sponsors.push(name);
      for (const p of persons) {
        if ((p.i_p_jobTitle || "").includes("保荐代表人") && p.i_p_personName) sponsorReps.push(p.i_p_personName);
      }
    } else if (itype === 2) {
      if (name) accFirms.push(name);
      for (const p of persons) {
        if ((p.i_p_jobTitle || "").includes("签字会计师") && p.i_p_personName) accountants.push(p.i_p_personName);
      }
    } else if (itype === 3) {
      if (name) lawFirms.push(name);
      for (const p of persons) {
        if ((p.i_p_jobTitle || "").includes("签字律师") && p.i_p_personName) lawyers.push(p.i_p_personName);
      }
    }
  }

  const docs = [];
  if (auditNum) {
    try {
      const fq = new URLSearchParams({
        isPagination: "false",
        sqlId: "GP_GPZCZ_SHXXPL",
        issueMarketType: "1,2",
        stockAuditNum: auditNum,
      });
      const fresp = await fetchJson(`https://query.sse.com.cn/commonSoaQuery.do?${fq}`, {
        Referer: "https://listing.sse.com.cn/",
      });
      for (const f of (fresp.pageHelp && fresp.pageHelp.data) || []) {
        if (!f.filePath) continue;
        docs.push({
          title: f.fileTitle || f.filename || "审核公告文件",
          category: f.fileTypeDesc || "信息披露",
          date: fmtDate(f.fileUpdateTime || f.publishDate),
          url: f.filePath.startsWith("http") ? f.filePath : `https://static.sse.com.cn/stock${f.filePath}`,
        });
      }
    } catch (_) {}
  }
  docs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const curr = Number(d.currStatus || 0);
  const statusMap = { 1: "已受理", 2: "已问询", 3: "上市委会议", 4: "提交注册", 5: "注册生效", 7: "中止", 8: "终止" };
  const level = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 7: 2, 8: 2 }[curr] || 1;
  const acceptDt = fmtDate(d.auditApplyDate);
  const updateDt = fmtDate(d.updateDate);
  const issuer = Array.isArray(d.stockIssuer) && d.stockIssuer[0] ? d.stockIssuer[0] : {};
  const isStar = String(d.issueMarketType) === "1";

  return {
    ok: true,
    live_source: "上交所官网实时直连",
    company: d.stockAuditName || company,
    exchange: "上交所",
    board: isStar ? "科创板" : "沪主板",
    status: statusMap[curr] || String(curr),
    industry: issuer.s_csrcCodeDesc || "—",
    province: issuer.s_province || "—",
    plan_raise_yi: d.planIssueCapital ? `${Number(d.planIssueCapital).toFixed(2)} 亿元` : "暂无数据",
    issue_ratio: "暂无数据",
    listing_standard: "—",
    board_position: isStar ? "科创板" : "沪市主板",
    sponsor: [...new Set(sponsors)].join("、") || "—",
    sponsor_reps: cleanPeople(sponsorReps) || "—",
    accounting_firm: [...new Set(accFirms)].join("、") || "—",
    accountants: cleanPeople(accountants) || "—",
    law_firm: [...new Set(lawFirms)].join("、") || "—",
    lawyers: cleanPeople(lawyers) || "—",
    source_url: `https://www.sse.com.cn/listing/renewal/ipo/index_listing_detail.shtml?auditId=${auditNum}`,
    timeline: [
      { key: "受理", label: "已受理", date: acceptDt, done: level >= 1 },
      { key: "问询", label: "已问询", date: level === 2 ? updateDt : "", done: level >= 2 },
      { key: "上市委", label: "上市委会议", date: level === 3 ? updateDt : "", done: level >= 3 },
      { key: "提交注册", label: "提交注册", date: level === 4 ? updateDt : "", done: level >= 4 },
      { key: "注册结果", label: "注册结果", date: level === 5 ? updateDt : "", done: level >= 5 },
    ],
    documents: docs.slice(0, 30),
  };
}

async function getBseCookie() {
  const r = await fetch("https://www.bse.cn/audit/project_news.html", {
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  const sc = r.headers.get("set-cookie") || "";
  const m = sc.match(/C3VK=[^;]+/);
  return m ? m[0] : "";
}

async function fetchBseDetail(company, securityCode = "") {
  const cookie = await getBseCookie();
  const baseHdr = {
    Referer: "https://www.bse.cn/audit/project_news.html",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    ...(cookie ? { Cookie: cookie } : {}),
  };

  const normTarget = normalizeName(company);
  let items = [];
  for (const kw of uniqueNonEmpty([normTarget, searchKeyword(company), securityCode])) {
    const res = await fetchJson(
      "https://www.bse.cn/projectNewsController/infoResult.do",
      baseHdr,
      { method: "POST", body: new URLSearchParams({ page: "0", type: "[1]", keyword: kw }).toString() }
    );
    if (Array.isArray(res) && res[0] && res[0].listInfo) {
      items = res[0].listInfo.content || [];
    }
    if (items.length) break;
  }

  const target = items.find((r) => normalizeName(r.companyName) === normTarget) || items[0];
  if (!target) return null;

  const pid = target.id;
  const detRes = await fetchJson(
    "https://www.bse.cn/projectNewsController/infoDetailResult.do",
    { ...baseHdr, Referer: `https://www.bse.cn/audit/project_news_detail.html?id=${pid}` },
    { method: "POST", body: new URLSearchParams({ id: String(pid) }).toString() }
  );
  const det = Array.isArray(detRes) && detRes[0] ? detRes[0] : {};
  const pn = det.projectNews || target;
  const ps = det.projectStatus || {};

  const statusMap = {
    P01: "已受理", P02: "已问询", P03: "上市委会议通过", P04: "提交注册",
    P05: "注册生效", P06: "中止", P07: "终止", P08: "不予注册", P09: "上市委暂缓",
  };

  const tReceive = fmtDate(ps.receiveDate || pn.receiveDate);
  const tInquiry = fmtDate(ps.inquiryDate);
  const tMeeting = fmtDate(ps.listingCommitteeResultDate || ps.listingCommitteeDate);
  const tSubmit = fmtDate(ps.rePassDate || ps.submitRegisterDate);
  const tResult = fmtDate(ps.approveResultDate);

  const docs = [];
  const catLabels = {
    ZGSMS: "招股说明书", GPFXBJS: "发行保荐书", SJBG: "审计报告",
    FYYJS: "法律意见书", GPZJXCGPTJS: "上市保荐书", QT: "其他申报文件",
  };
  const xxgk = det.xxgkInfo || {};
  for (const [catKey, stageMap] of Object.entries(xxgk)) {
    if (!stageMap || typeof stageMap !== "object") continue;
    for (const arr of Object.values(stageMap)) {
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        const fp = item.destFilePath || item.filePath || "";
        if (!fp) continue;
        docs.push({
          title: item.disclosureTitle || "申报文件",
          category: catLabels[catKey] || "申报文件",
          date: fmtDate(item.publishDate || item.pubDate),
          url: fp.startsWith("http") ? fp : `https://www.bse.cn${fp}`,
        });
      }
    }
  }
  for (const [listKey, catName] of [["wxhfhInfo", "问询与回复"], ["hyggjgInfo", "上市委会议"], ["zmInfo", "注册结果"]]) {
    for (const item of Array.isArray(det[listKey]) ? det[listKey] : []) {
      const fp = item.destFilePath || item.filePath || "";
      if (!fp) continue;
      docs.push({
        title: item.disclosureTitle || catName,
        category: catName,
        date: fmtDate(item.publishDate || item.pubDate),
        url: fp.startsWith("http") ? fp : `https://www.bse.cn${fp}`,
      });
    }
  }
  docs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return {
    ok: true,
    live_source: "北交所官网实时直连",
    company: pn.companyName || company,
    exchange: "北交所",
    board: "北证",
    status: statusMap[String(pn.status || "")] || String(pn.status || "—"),
    industry: pn.industry || "—",
    province: pn.registerAddress || "—",
    plan_raise_yi: "详见下方招股说明书",
    issue_ratio: "详见招股说明书",
    listing_standard: "—",
    board_position: "符合创新特征",
    sponsor: pn.sponsorOrg || "—",
    sponsor_reps: cleanPeople(pn.sponsorRepresent) || "—",
    accounting_firm: pn.accountingOrg || "—",
    accountants: cleanPeople(pn.accountant) || "—",
    law_firm: pn.lawyerOrg || "—",
    lawyers: cleanPeople(pn.lawyer) || "—",
    source_url: `https://www.bse.cn/audit/project_news_detail.html?id=${pid}`,
    timeline: [
      { key: "受理", label: "已受理", date: tReceive, done: Boolean(tReceive) },
      { key: "问询", label: "已问询", date: tInquiry, done: Boolean(tInquiry) },
      { key: "上市委", label: "上市委会议", date: tMeeting, done: Boolean(tMeeting) },
      { key: "提交注册", label: "提交注册", date: tSubmit, done: Boolean(tSubmit) },
      { key: "注册结果", label: "注册结果", date: tResult, done: Boolean(tResult) },
    ],
    documents: docs.slice(0, 30),
  };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const company = (url.searchParams.get("company") || "").trim();
  const exchange = (url.searchParams.get("exchange") || "").trim();
  const code = (url.searchParams.get("code") || "").trim();

  if (!company) {
    return jsonResp({ ok: false, error: "缺少 company 参数" }, 400);
  }

  try {
    let result = null;
    if (exchange === "深交所") result = await fetchSzseDetail(company);
    else if (exchange === "上交所") result = await fetchSseDetail(company);
    else if (exchange === "北交所") result = await fetchBseDetail(company, code);

    if (!result) return jsonResp({ ok: false, error: `未在 ${exchange || "目标交易所"} 查询到该项目实时详情` }, 404);
    return jsonResp(result, 200);
  } catch (err) {
    return jsonResp({ ok: false, error: `实时透传失败: ${err.message}` }, 502);
  }
}
