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
  };
}
