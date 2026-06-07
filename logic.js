// logic.js —— 记账工具的「核心计算逻辑」
// 这里只放纯计算（不碰网页界面），所以既能被 index.html 用，也能被测试调用。
// 怎么测试：在项目文件夹运行  node --test

// 把一个时间 Date 格式化成 "YYYY-MM-DD HH:MM"
function formatDateTime(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 把一个时间 Date 转成「月份键」，例如 "2026-06"
function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 校验金额：必须能解析成「大于 0 的数字」。返回 true / false
function isValidAmount(value) {
  const n = parseFloat(value);
  return !isNaN(n) && n > 0;
}

// 本月已花：把 time 以 month（"YYYY-MM"）开头的那些记录金额加起来
function sumByMonth(records, month) {
  return records
    .filter((r) => typeof r.time === "string" && r.time.startsWith(month))
    .reduce((sum, r) => sum + r.amount, 0);
}

// 总额（所有时间累计）
function sumAll(records) {
  return records.reduce((sum, r) => sum + r.amount, 0);
}

// 按分类汇总，返回按金额从高到低排好序的数组：[[分类, 金额], ...]
function sumByCategory(records) {
  const map = {};
  for (const r of records) {
    map[r.category] = (map[r.category] || 0) + r.amount;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

// 取一笔记录的「日期」部分（"YYYY-MM-DD"）。time 形如 "2026-06-07 12:30"
function dateOf(record) {
  return typeof record.time === "string" ? record.time.slice(0, 10) : "";
}

// 判断一笔记录是否落在某个周期里。
// 周期 cycle = { start_date: "YYYY-MM-DD", end_date: "YYYY-MM-DD" 或 null/空 }
// 规则：记录日期 >= 开始日期，且（周期还没结束，或 记录日期 <= 结束日期）。
// ISO 日期字符串可以直接比大小，所以用字符串比较即可。
function inCycle(record, cycle) {
  if (!cycle) return false;
  const d = dateOf(record);
  if (!d || !cycle.start_date) return false;
  if (d < cycle.start_date) return false;
  if (cycle.end_date && d > cycle.end_date) return false;
  return true;
}

// 从一堆周期里找出「当前进行中」的那个（end_date 为空）。
// 万一有多个开着的（理论上不该发生），取开始日期最新的那个。返回该周期或 null。
function openCycle(cycles) {
  const open = (cycles || []).filter((c) => !c.end_date);
  if (open.length === 0) return null;
  return open.reduce((a, b) => (a.start_date >= b.start_date ? a : b));
}

// 本周期已花：把落在该周期里的记录金额加起来
function sumByCycle(records, cycle) {
  return records
    .filter((r) => inCycle(r, cycle))
    .reduce((sum, r) => sum + r.amount, 0);
}

// 把某个日期往后挪 n 天（n 为负就是往前），返回 "YYYY-MM-DD"
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 两个日期相差多少天（b - a）。例：("2026-06-01","2026-06-03") = 2
function daysBetween(a, b) {
  const ms = new Date(b + "T00:00:00") - new Date(a + "T00:00:00");
  return Math.round(ms / 86400000);
}

// 每日合计：从 startStr 到 endStr（含两端）逐天求和，没消费的天补 0。
// 返回 [{ date:"YYYY-MM-DD", amount }, ...]（用于「每日消费」柱状图）
function dailyTotals(records, startStr, endStr) {
  const map = {};
  for (const r of records) {
    const d = typeof r.time === "string" ? r.time.slice(0, 10) : "";
    if (d >= startStr && d <= endStr) map[d] = (map[d] || 0) + r.amount;
  }
  const out = [];
  const n = daysBetween(startStr, endStr);
  for (let i = 0; i <= n; i++) {
    const day = addDays(startStr, i);
    out.push({ date: day, amount: map[day] || 0 });
  }
  return out;
}

// 按「备注」精确合计本周期消费：相同备注的归一组，算出次数和总额。
// 返回 [{ note, count, sum }]，按总额从高到低。给 AI 报告用——次数和金额都由代码算准，
// 避免让 AI 自己做加法（模型算数不可靠）。
function sumByNote(records, cycle) {
  const map = {};
  for (const r of records) {
    if (!inCycle(r, cycle)) continue;
    const note = (r.note || "").trim() || "（无备注）";
    if (!map[note]) map[note] = { note, count: 0, sum: 0 };
    map[note].count += 1;
    map[note].sum += r.amount;
  }
  return Object.values(map).sort((a, b) => b.sum - a.sum);
}

// 本周期里最大的 n 笔消费（按金额从高到低），用于报告里点名「大头开销」。
// 返回精简对象数组：[{ amount, category, note, date }]
function topExpenses(records, cycle, n) {
  return records
    .filter((r) => inCycle(r, cycle))
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n)
    .map((r) => ({ amount: r.amount, category: r.category, note: r.note || "", date: dateOf(r) }));
}

// 花钱节奏：传入已花、预算、已过天数，算出日均、剩余、按当前速度还能撑几天。
//   dailyAvg        日均消费
//   remain          剩余预算（负数=已超支）
//   daysLeftAtRate  照当前日均，剩余预算还能撑几天（没消费时为 Infinity）
function pacing(spent, budget, daysElapsed) {
  const dailyAvg = daysElapsed > 0 ? spent / daysElapsed : 0;
  const remain = budget - spent;
  const daysLeftAtRate = dailyAvg > 0 ? remain / dailyAvg : Infinity;
  return { dailyAvg, remain, daysLeftAtRate };
}

// 预算状态：传入「已花」和「预算」，返回 { pct, remain, state }
//   pct    用掉的百分比
//   remain 还剩多少（负数表示超支）
//   state  "ok"（<80%）/ "warn"（80%~100%）/ "over"（>=100%，超支）
function budgetStatus(spent, budget) {
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  const remain = budget - spent;
  let state = "ok";
  if (pct >= 100) state = "over";
  else if (pct >= 80) state = "warn";
  return { pct, remain, state };
}

// 让上面这些函数在两种环境都能用：
// - 网页里：用 <script src="logic.js">，函数自动变成全局可用
// - Node 测试里：用 require('./logic.js') 拿到它们
// （typeof 检查保证在浏览器里不会因为没有 module 这个东西而报错）
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    formatDateTime, monthKey, isValidAmount,
    sumByMonth, sumAll, sumByCategory, budgetStatus,
    dateOf, inCycle, openCycle, sumByCycle,
    addDays, daysBetween, dailyTotals, pacing, topExpenses, sumByNote,
  };
}
