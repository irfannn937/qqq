import tls from "node:tls";

const UA = "Mozilla/5.0";
const REF = "https://quote.eastmoney.com/";
const TZ = "Asia/Shanghai";

const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const urls = {
  idx: "https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f14,f2,f3,f4,f5,f6&secids=1.000001,0.399001,0.399006,1.000688",
  in: "https://push2.eastmoney.com/api/qt/clist/get?fid=f62&po=1&pz=10&pn=1&np=1&fltt=2&invt=2&fs=m:90+t:2+f:!50&fields=f12,f14,f2,f3,f62,f184",
  out: "https://push2.eastmoney.com/api/qt/clist/get?fid=f62&po=0&pz=10&pn=1&np=1&fltt=2&invt=2&fs=m:90+t:2+f:!50&fields=f12,f14,f2,f3,f62,f184",
  cin: "https://push2.eastmoney.com/api/qt/clist/get?fid=f62&po=1&pz=10&pn=1&np=1&fltt=2&invt=2&fs=m:90+t:3+f:!50&fields=f12,f14,f2,f3,f62,f184",
  etf: "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=12&po=1&np=1&fltt=2&invt=2&fid=f6&fs=b:MK0021,b:MK0022,b:MK0023,b:MK0024&fields=f12,f14,f2,f3,f6,f5",
};

const keywordGroups = [
  {
    name: "AI算力/半导体/PCB",
    match: /半导体|芯片|集成电路|PCB|印制电路|电子元件|光模块|CPO|通信|算力|人工智能|AI|英伟达|NVIDIA/i,
    news: ["半导体", "芯片", "PCB", "光模块", "人工智能", "英伟达"],
  },
  {
    name: "新能源/电力设备",
    match: /新能源|光伏|风电|储能|锂电|电池|电力设备|特高压|充电桩|汽车|机器人/i,
    news: ["新能源", "光伏", "储能", "锂电池", "新能源汽车"],
  },
  {
    name: "有色金属/周期资源",
    match: /有色|铜|铝|锂|稀土|黄金|煤炭|石油|钢铁|化工|工业金属|小金属/i,
    news: ["有色金属", "铜价", "黄金", "稀土", "大宗商品"],
  },
  {
    name: "医药生物",
    match: /医药|创新药|生物|医疗|CXO|疫苗|中药/i,
    news: ["创新药", "医药", "医疗器械", "生物科技"],
  },
  {
    name: "军工/低空经济",
    match: /军工|航天|航空|卫星|低空经济|无人机/i,
    news: ["军工", "低空经济", "无人机", "商业航天"],
  },
  {
    name: "金融地产/消费",
    match: /银行|证券|保险|房地产|白酒|消费|食品饮料|旅游|零售/i,
    news: ["银行", "证券", "房地产", "消费", "白酒"],
  },
  {
    name: "计算机/软件/数据要素",
    match: /计算机|软件|数据要素|信创|云计算|网络安全|互联网/i,
    news: ["数据要素", "信创", "云计算", "网络安全"],
  },
];

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Referer: REF } });
  if (!r.ok) throw new Error(`fetch ${r.status}: ${url}`);
  return (await r.json()).data?.diff || [];
}

async function getText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`fetch ${r.status}: ${url}`);
  return r.text();
}

const yi = (n) => `${(Number(n || 0) / 1e8).toFixed(2)}亿元`;
const pct = (n) => `${Number(n || 0) >= 0 ? "+" : ""}${Number(n || 0).toFixed(2)}%`;
const clean = (s = "") =>
  s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const top = (arr, n = 5) =>
  arr
    .slice(0, n)
    .map((x, i) => `${i + 1}. ${x.f14}：${yi(x.f62)}，涨跌幅${pct(x.f3)}`)
    .join("\n");
const names = (arr, n = 5) => arr.slice(0, n).map((x) => x.f14).join("、");

function track(arr) {
  const text = names(arr, 6);
  const hit = keywordGroups.find((g) => g.match.test(text));
  return hit?.name || arr[0]?.f14 || "暂无明确赛道";
}

function newsKeywords(trackName, boards) {
  const text = `${trackName} ${names(boards, 10)}`;
  const picked = keywordGroups.filter((g) => g.match.test(text)).flatMap((g) => g.news);
  return [...new Set([...picked, ...boards.slice(0, 4).map((x) => x.f14)])].slice(0, 8);
}

function parseRss(xml, tag) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map((m) => {
      const item = m[0];
      const read = (name) => clean(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");
      return {
        title: read("title"),
        link: read("link"),
        source: clean(item.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || tag),
        date: read("pubDate"),
        desc: read("description"),
        tag,
      };
    })
    .filter((x) => x.title && x.link);
}

async function bingNews(query, tag) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS&mkt=zh-CN`;
  try {
    return parseRss(await getText(url), tag);
  } catch {
    return [];
  }
}

function scoreNews(item, keywords) {
  const text = `${item.title} ${item.desc}`;
  let score = 0;
  for (const k of keywords) {
    if (k && text.includes(k)) score += 3;
  }
  if (/政策|会议|监管|关税|制裁|订单|财报|指引|出口|进口|价格|涨价|降价|产能|禁令|美国|欧洲|日本|韩国|中东|美联储|汇率|利率|通胀/i.test(text)) {
    score += 2;
  }
  if (/今天|今日|最新|发布|宣布|报道|称/i.test(text)) score += 1;
  return score;
}

function impactLine(item) {
  const text = `${item.title} ${item.desc}`;
  if (/订单|涨价|需求|政策支持|补贴|突破|扩产|上调|创新高|增长|采购|投资/i.test(text)) {
    return "偏利好：可能强化相关赛道景气预期或订单预期";
  }
  if (/制裁|禁令|调查|下调|亏损|降价|过剩|风险|冲突|关税|限制|召回/i.test(text)) {
    return "偏利空/扰动：可能压制估值或加大短线波动";
  }
  return "中性观察：作为资金选择赛道时的外部变量跟踪";
}

const fundPools = [
  {
    match: /AI算力|半导体|PCB|通信|电子|芯片|光模块/i,
    funds: [
      ["512480", "半导体ETF", "弹性高，适合跟踪芯片/半导体主线强度"],
      ["159995", "芯片ETF", "更偏芯片产业链，观察成交额是否持续放大"],
      ["515880", "通信ETF", "受益于光模块、算力网络、运营商资本开支预期"],
      ["515070", "人工智能AIETF", "适合观察AI应用和算力催化共振"],
    ],
  },
  {
    match: /新能源|电力设备|光伏|储能|锂电|汽车|机器人/i,
    funds: [
      ["515790", "光伏ETF", "适合跟踪光伏政策、价格和装机预期"],
      ["515030", "新能源车ETF", "观察整车、锂电和智能驾驶是否共振"],
      ["159806", "新能源车ETF", "同类方向备选，重点看成交活跃度"],
      ["159819", "人工智能ETF", "若机器人/智能驾驶走强，可作为交叉方向观察"],
    ],
  },
  {
    match: /有色|周期|资源|铜|铝|锂|稀土|黄金|煤炭|石油|大宗/i,
    funds: [
      ["512400", "有色金属ETF", "适合跟踪工业金属价格和美元/汇率变化"],
      ["159980", "有色ETF", "周期资源方向备选，关注量价配合"],
      ["518880", "黄金ETF", "避险和实际利率变化时优先观察"],
      ["159985", "豆粕ETF", "商品方向备选，波动较大，适合小仓位观察"],
    ],
  },
  {
    match: /医药|创新药|医疗|生物/i,
    funds: [
      ["159992", "创新药ETF", "适合跟踪创新药政策、出海和临床数据催化"],
      ["512290", "生物医药ETF", "医药反弹时观察成交能否持续"],
      ["159828", "医疗ETF", "更偏医疗服务/器械，关注政策扰动"],
      ["515950", "医药龙头ETF", "偏龙头稳健方向，适合看持续性"],
    ],
  },
  {
    match: /军工|低空经济|航天|航空|卫星|无人机/i,
    funds: [
      ["512660", "军工ETF", "适合跟踪订单、装备周期和地缘事件催化"],
      ["512670", "国防ETF", "军工方向备选，重点看资金持续性"],
      ["159819", "人工智能ETF", "若低空经济叠加智能化，可作为交叉方向观察"],
    ],
  },
  {
    match: /计算机|软件|数据要素|信创|云计算|网络安全/i,
    funds: [
      ["159998", "计算机ETF", "适合跟踪信创、数据要素和AI应用扩散"],
      ["515000", "科技ETF", "偏大科技综合方向，波动相对分散"],
      ["515070", "人工智能AIETF", "AI应用催化增强时优先观察"],
      ["159538", "信创ETF", "信创政策或订单催化时重点观察"],
    ],
  },
  {
    match: /金融|银行|证券|保险|地产|消费|白酒|食品|旅游/i,
    funds: [
      ["512880", "证券ETF", "风险偏好回升、成交额放大时优先观察"],
      ["515020", "银行ETF华夏", "偏防守和红利方向，观察利率/政策变化"],
      ["512690", "酒ETF", "消费修复和北向/机构回流时观察"],
      ["159928", "消费ETF", "消费扩散行情中作为综合方向观察"],
    ],
  },
];

function buildFundWatchSection(inTrack, outTrack, inflow, concept, etf) {
  const hotText = `${inTrack} ${names([...inflow, ...concept], 10)}`;
  const candidates = fundPools
    .filter((pool) => pool.match.test(hotText))
    .flatMap((pool) => pool.funds);
  const fallback = [
    ["510300", "沪深300ETF", "市场偏强但主线不清时观察宽基"],
    ["159915", "创业板ETF", "成长风格占优时观察"],
    ["588000", "科创50ETF", "科技成长持续走强时观察"],
  ];
  const activeEtf = etf
    .slice(0, 4)
    .filter((x) => Number(x.f3) > 0)
    .map((x) => [x.f12, x.f14, `今日ETF成交活跃，涨跌幅${pct(x.f3)}，成交${yi(x.f6)}`]);
  const merged = [...activeEtf, ...(candidates.length ? candidates : fallback)];
  const seen = new Set();
  const picked = merged
    .filter(([code]) => {
      if (!code || seen.has(code)) return false;
      seen.add(code);
      return true;
    })
    .slice(0, 5);

  const condition =
    `未来三天只在“${inTrack}继续净流入、相关ETF成交额放大、指数不破短线支撑”时提高关注；` +
    `若${outTrack}继续扩大流出或指数冲高回落，则观察池降级。`;

  return [
    "五、未来三天基金观察池",
    `筛选逻辑：优先匹配今日资金流入赛道、ETF成交活跃度和外部事件催化。${condition}`,
    ...picked.map(
      ([code, name, reason], i) =>
        `${i + 1}. ${name}（${code}）\n- 关注理由：${reason}\n- 触发条件：对应赛道连续净流入，且成交额不明显缩量。\n- 风险点：若板块一日游、冲高回落或出现利空新闻，不追高。`,
    ),
    "- 提示：这里只是观察池，不是买入指令；场内ETF波动较大，场外联接基金还会有申赎和净值确认延迟。",
  ].join("\n");
}

async function buildEventSection(inTrack, outTrack, inflow, outflow, concept) {
  const inKeys = newsKeywords(inTrack, [...inflow, ...concept]);
  const outKeys = newsKeywords(outTrack, outflow);
  const broadKeys = ["A股 政策", "美联储 利率", "人民币 汇率", "大宗商品", "AI 芯片 国际"];
  const queries = [
    `${inKeys.slice(0, 4).join(" OR ")} A股 赛道`,
    `${outKeys.slice(0, 4).join(" OR ")} A股 资金`,
    ...broadKeys,
  ];

  const results = (await Promise.all(queries.map((q) => bingNews(q, q)))).flat();
  const seen = new Set();
  const keywords = [...new Set([...inKeys, ...outKeys, "A股", "政策", "美联储", "汇率", "AI", "芯片"])];
  const picked = results
    .filter((item) => {
      const key = item.title.replace(/\s+/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({ ...item, score: scoreNews(item, keywords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  if (!picked.length) {
    return [
      "五、相关事件/新闻/报告跟踪",
      "- 今日自动新闻源暂未抓到高相关条目，建议重点人工关注政策、汇率、美股科技股、大宗商品价格和相关产业订单变化。",
    ].join("\n");
  }

  return [
    "五、相关事件/新闻/报告跟踪",
    ...picked.map((item, i) =>
      [
        `${i + 1}. ${item.title}`,
        `- 摘要：${clean(item.desc).slice(0, 120) || "详见原文标题与出处。"}${item.desc.length > 120 ? "..." : ""}`,
        `- 影响：${impactLine(item)}`,
        `- 出处：${item.source} ${item.link}`,
      ].join("\n"),
    ),
    "- 提示：新闻由公开 RSS/新闻搜索自动筛选，存在延迟、重复或口径差异；更适合作为赛道催化跟踪，不单独作为买卖依据。",
  ].join("\n");
}

function b64(s) {
  return Buffer.from(s, "utf8").toString("base64");
}

function wrap(s) {
  return s.match(/.{1,76}/g)?.join("\r\n") || "";
}

function env(k, fallback = "") {
  const v = process.env[k] || fallback;
  if (!v) throw new Error(`Missing secret: ${k}`);
  return v;
}

function read(socket, buf) {
  return new Promise((resolve, reject) => {
    function onData(chunk) {
      buf.v += chunk.toString("utf8");
      const lines = buf.v.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1);
      if (last && /^\d{3} /.test(last)) {
        socket.off("data", onData);
        const out = lines.join("\n");
        buf.v = "";
        resolve(out);
      }
    }
    socket.on("data", onData);
    socket.once("error", reject);
  });
}

async function cmd(socket, buf, text, ok) {
  socket.write(`${text}\r\n`);
  const r = await read(socket, buf);
  if (!ok.some((x) => r.startsWith(x))) throw new Error(`SMTP failed after ${text}: ${r}`);
}

async function mail(subject, body) {
  const host = env("SMTP_HOST", "smtp.qq.com");
  const port = Number(env("SMTP_PORT", "465"));
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");
  const from = env("SMTP_FROM", user);
  const to = env("EMAIL_TO");
  const socket = tls.connect({ host, port, servername: host });
  const buf = { v: "" };
  await new Promise((res, rej) => {
    socket.once("secureConnect", res);
    socket.once("error", rej);
  });
  let r = await read(socket, buf);
  if (!r.startsWith("220")) throw new Error(r);
  await cmd(socket, buf, "EHLO github-actions", ["250"]);
  await cmd(socket, buf, "AUTH LOGIN", ["334"]);
  await cmd(socket, buf, b64(user), ["334"]);
  await cmd(socket, buf, b64(pass), ["235"]);
  await cmd(socket, buf, `MAIL FROM:<${from}>`, ["250"]);
  await cmd(socket, buf, `RCPT TO:<${to}>`, ["250", "251"]);
  await cmd(socket, buf, "DATA", ["354"]);
  const msg = [
    `From: <${from}>`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap(b64(body)),
    ".",
  ].join("\r\n");
  socket.write(`${msg}\r\n`);
  r = await read(socket, buf);
  if (!r.startsWith("250")) throw new Error(r);
  socket.write("QUIT\r\n");
  socket.end();
}

const [idx, inflow, outflow, concept, etf] = await Promise.all([
  get(urls.idx),
  get(urls.in),
  get(urls.out),
  get(urls.cin),
  get(urls.etf),
]);
if (!idx.length || !inflow.length || !outflow.length) throw new Error("market data incomplete");

const inTrack = track([...inflow, ...concept]);
const outTrack = track(outflow);
const positive = idx.filter((x) => Number(x.f3) > 0).length;
const trend = positive >= 3 && Math.abs(inflow[0].f62) > 8e9 ? "震荡偏强" : positive <= 1 ? "偏弱" : "震荡";
const fundWatchSection = buildFundWatchSection(inTrack, outTrack, inflow, concept, etf);
const eventSection = await buildEventSection(inTrack, outTrack, inflow, outflow, concept);

const report = `【A股资金动向简报｜${date}】
一句话结论：今日资金流入最大赛道为${inTrack}，流出最大赛道为${outTrack}；未来一周趋势判断为“${trend}”。

一、核心结论
1. 今日资金流入最大赛道：${inTrack}
- 依据：${inflow.slice(0, 3).map((x) => `${x.f14}${yi(x.f62)}`).join("；")}。
- 资金逻辑：资金偏向有明确景气度或事件催化的细分方向，重点看持续性。

2. 今日资金流出最大赛道：${outTrack}
- 依据：${outflow.slice(0, 3).map((x) => `${x.f14}${yi(x.f62)}`).join("；")}。
- 轮动解释：资金撤离说明短线分歧较大，基金持仓上不要只看单日涨跌。

3. 未来一周趋势判断：${trend}
- 若主线连续2-3日净流入且指数维持强势，趋势可继续观察；若成交缩量且热点快速轮动，容易转为震荡。

二、市场温度
${idx.map((x) => `- ${x.f14}：${x.f2}，${pct(x.f3)}`).join("\n")}
- 市场赚钱效应：${positive >= 3 ? "中性偏强" : "偏弱/分化"}。

三、资金流向排名
净流入Top5：
${top(inflow)}

净流出Top5：
${top(outflow)}

四、基金相关观察
- 今日偏强方向：${names([...inflow.slice(0, 5), ...concept.slice(0, 3)], 8)}。
- 今日偏弱方向：${names(outflow, 5)}。
- ETF成交活跃：${etf.slice(0, 8).map((x) => `${x.f14}(${x.f12}) ${pct(x.f3)} 成交${yi(x.f6)}`).join("；")}。

${fundWatchSection}

${eventSection}

七、未来一周观察信号
1. 成交额：若指数上涨但成交不能继续放大，反弹持续性需要打折。
2. 主线资金：重点看${inTrack}能否连续净流入。
3. 风格偏好：比较创业板、科创50、沪深300强弱。
4. ETF方向：观察宽基ETF与行业ETF成交额是否同步放大。
5. 外部变量：关注政策、汇率、海外科技股和大宗商品价格。

八、仓位参考框架
- 激进条件：主线连续2-3日净流入，成交额维持高位，指数不破短线支撑。
- 中性条件：指数上涨但资金每天快速换赛道，适合维持观察。
- 防守条件：成交明显缩量、主要赛道净流出扩大、指数冲高回落，应控制追涨冲动。

九、数据来源与提示
- 资金数据来源：东方财富行情/板块资金流公开接口。
- 事件数据来源：Bing News RSS 自动抓取的公开新闻标题、摘要与出处链接。
- 风险提示：公开资金流与新闻摘要存在口径差异和延迟，仅供个人观察，不构成投资建议。`;

await mail(`A股资金动向简报｜${date}`, report);
console.log(`sent ${date}`);
