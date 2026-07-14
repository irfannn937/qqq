import tls from "node:tls";

const UA = "Mozilla/5.0";
const REF = "http://quote.eastmoney.com/";
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const urls = {
  idx: "http://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f14,f2,f3,f4,f5,f6&secids=1.000001,0.399001,0.399006,1.000688",
  in: "http://push2.eastmoney.com/api/qt/clist/get?fid=f62&po=1&pz=10&pn=1&np=1&fltt=2&invt=2&fs=m:90+t:2+f:!50&fields=f12,f14,f2,f3,f62,f184",
  out: "http://push2.eastmoney.com/api/qt/clist/get?fid=f62&po=0&pz=10&pn=1&np=1&fltt=2&invt=2&fs=m:90+t:2+f:!50&fields=f12,f14,f2,f3,f62,f184",
  cin: "http://push2.eastmoney.com/api/qt/clist/get?fid=f62&po=1&pz=10&pn=1&np=1&fltt=2&invt=2&fs=m:90+t:3+f:!50&fields=f12,f14,f2,f3,f62,f184",
  etf: "http://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=12&po=1&np=1&fltt=2&invt=2&fid=f6&fs=b:MK0021,b:MK0022,b:MK0023,b:MK0024&fields=f12,f14,f2,f3,f6,f5",
};

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Referer: REF } });
  if (!r.ok) throw new Error(`fetch ${r.status}: ${url}`);
  return (await r.json()).data?.diff || [];
}

const yi = (n) => `${(Number(n || 0) / 1e8).toFixed(2)}亿元`;
const pct = (n) => `${Number(n || 0) >= 0 ? "+" : ""}${Number(n || 0).toFixed(2)}%`;
const top = (arr, n = 5) =>
  arr.slice(0, n).map((x, i) => `${i + 1}. ${x.f14}：${yi(x.f62)}，涨跌幅${pct(x.f3)}`).join("\n");
const names = (arr, n = 5) => arr.slice(0, n).map((x) => x.f14).join("、");

function track(arr) {
  const s = names(arr, 3);
  if (/元件|印制电路板|PCB|通信/.test(s)) return "PCB/电子元件、通信设备";
  if (/有色|铜|铝|工业金属/.test(s)) return "有色金属/周期资源";
  if (/半导体|芯片/.test(s)) return "半导体";
  if (/军工/.test(s)) return "军工";
  if (/医药|创新药/.test(s)) return "医药生物";
  return arr[0]?.f14 || "暂无明确赛道";
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

五、未来一周观察信号
1. 成交额：若指数上涨但成交不能继续放大，反弹持续性需要打折。
2. 主线资金：重点看${inTrack}能否连续净流入。
3. 风格偏好：比较创业板、科创50、沪深300强弱。
4. ETF方向：观察宽基ETF与行业ETF成交额是否同步放大。
5. 外部变量：关注政策、汇率、海外科技股和大宗商品价格。

六、仓位参考框架
- 激进条件：主线连续2-3日净流入，成交额维持高位，指数不破短线支撑。
- 中性条件：指数上涨但资金每天快速换赛道，适合维持观察。
- 防守条件：成交明显缩量、主要赛道净流出扩大、指数冲高回落，应控制追涨冲动。

七、数据来源与提示
- 数据来源：东方财富行情/板块资金流公开接口。
- 风险提示：公开资金流数据存在口径差异，仅供个人观察，不构成投资建议。
`;

await mail(`A股资金动向简报｜${date}`, report);
console.log(`sent ${date}`);
