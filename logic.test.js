// logic.test.js —— 给核心逻辑写的测试
// 怎么跑：在项目文件夹打开终端，运行   node --test
// 全绿就说明算钱逻辑没问题；有红色就说明哪里被改坏了。

const test = require("node:test");
const assert = require("node:assert");
const {
  formatDateTime, monthKey, isValidAmount,
  sumByMonth, sumAll, sumByCategory, budgetStatus,
  dateOf, inCycle, openCycle, sumByCycle,
  addDays, daysBetween, dailyTotals, pacing, topExpenses,
} = require("./logic.js");

// 金额是小数，相加可能有微小的浮点误差，所以用「足够接近」来判断
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9,
    `期望约 ${expected}，实际 ${actual}`);
}

// 一份测试用的假数据：4 笔在 2026-06，1 笔在 2026-05（上个月）
const sample = [
  { amount: 35.5, category: "餐饮", note: "午饭",   time: "2026-06-02 00:17" },
  { amount: 20.0, category: "交通", note: "",       time: "2026-06-02 00:17" },
  { amount: 100.0, category: "购物", note: "买书",  time: "2026-06-02 00:17" },
  { amount: 25.9, category: "餐饮", note: "塔斯汀", time: "2026-06-02 00:30" },
  { amount: 9.9,  category: "餐饮", note: "上月",   time: "2026-05-20 12:00" },
];

test("isValidAmount：只接受大于 0 的数字", () => {
  assert.strictEqual(isValidAmount("35.5"), true);
  assert.strictEqual(isValidAmount("0"), false);
  assert.strictEqual(isValidAmount("-5"), false);
  assert.strictEqual(isValidAmount("abc"), false);
  assert.strictEqual(isValidAmount(""), false);
});

test("monthKey：把日期变成 年-月", () => {
  // 注意：JS 里月份从 0 开始，5 表示六月
  assert.strictEqual(monthKey(new Date(2026, 5, 2)), "2026-06");
  assert.strictEqual(monthKey(new Date(2026, 11, 31)), "2026-12");
});

test("formatDateTime：格式化成 年-月-日 时:分（个位数补 0）", () => {
  assert.strictEqual(formatDateTime(new Date(2026, 5, 2, 9, 5)), "2026-06-02 09:05");
});

test("sumAll：所有时间的总额", () => {
  close(sumAll(sample), 191.3); // 35.5+20+100+25.9+9.9
  assert.strictEqual(sumAll([]), 0); // 空账本是 0
});

test("sumByMonth：只统计当月，排除其它月份", () => {
  close(sumByMonth(sample, "2026-06"), 181.4); // 不含 5 月那笔 9.9
  close(sumByMonth(sample, "2026-05"), 9.9);
  close(sumByMonth(sample, "2026-01"), 0);     // 没有该月记录
});

test("sumByCategory：按分类汇总并从高到低排序", () => {
  const result = sumByCategory(sample);
  // 餐饮 35.5+25.9+9.9=71.3，购物 100，交通 20 → 购物最多排第一
  assert.strictEqual(result[0][0], "购物");
  close(result[0][1], 100);
  assert.strictEqual(result[1][0], "餐饮");
  close(result[1][1], 71.3);
  assert.strictEqual(result[2][0], "交通");
  close(result[2][1], 20);
});

test("budgetStatus：三档状态的临界点", () => {
  // 79% → 还安全（ok）
  assert.strictEqual(budgetStatus(79, 100).state, "ok");
  // 正好 80% → 开始警告（warn）
  assert.strictEqual(budgetStatus(80, 100).state, "warn");
  // 99.9% → 仍是警告
  assert.strictEqual(budgetStatus(99.9, 100).state, "warn");
  // 正好 100% → 算超支（over）
  assert.strictEqual(budgetStatus(100, 100).state, "over");
  // 超过 → over
  assert.strictEqual(budgetStatus(120, 100).state, "over");
});

test("budgetStatus：剩余金额与百分比算得对", () => {
  const s = budgetStatus(181.4, 220);
  close(s.remain, 38.6);                 // 还剩
  assert.ok(Math.abs(s.pct - 82.45) < 0.1);
  // 超支时 remain 是负数
  close(budgetStatus(150, 100).remain, -50);
  // 预算为 0 时不报错，百分比按 0 处理
  assert.strictEqual(budgetStatus(50, 0).pct, 0);
});

test("dateOf：取出记录的日期部分", () => {
  assert.strictEqual(dateOf({ time: "2026-06-02 00:30" }), "2026-06-02");
  assert.strictEqual(dateOf({}), ""); // 没有 time 不报错
});

test("inCycle：判断一笔账是否落在周期里", () => {
  // 进行中的周期（没结束）：6-01 起，往后都算
  const open = { start_date: "2026-06-01", end_date: null };
  assert.strictEqual(inCycle({ time: "2026-06-02 00:17" }, open), true);
  assert.strictEqual(inCycle({ time: "2026-06-01 09:00" }, open), true); // 开始当天算
  assert.strictEqual(inCycle({ time: "2026-05-31 09:00" }, open), false); // 早于开始不算
  // 已结束的周期：5-01 到 5-31
  const closed = { start_date: "2026-05-01", end_date: "2026-05-31" };
  assert.strictEqual(inCycle({ time: "2026-05-20 12:00" }, closed), true);
  assert.strictEqual(inCycle({ time: "2026-05-31 23:00" }, closed), true); // 结束当天算
  assert.strictEqual(inCycle({ time: "2026-06-01 00:00" }, closed), false); // 结束之后不算
  // 没有周期时一律 false
  assert.strictEqual(inCycle({ time: "2026-06-02 00:17" }, null), false);
});

test("openCycle：从一堆周期里找出进行中的那个", () => {
  const cycles = [
    { id: 1, start_date: "2026-05-01", end_date: "2026-05-31" }, // 已结束
    { id: 2, start_date: "2026-06-01", end_date: null },         // 进行中
  ];
  assert.strictEqual(openCycle(cycles).id, 2);
  // 全部已结束 → 没有进行中的
  assert.strictEqual(openCycle([{ id: 1, start_date: "2026-05-01", end_date: "2026-05-31" }]), null);
  // 空列表 / 没传 → null，不报错
  assert.strictEqual(openCycle([]), null);
  assert.strictEqual(openCycle(undefined), null);
});

test("sumByCycle：只统计落在本周期里的金额", () => {
  const open = { start_date: "2026-06-01", end_date: null };
  close(sumByCycle(sample, open), 181.4);  // 4 笔 6 月的，排除 5 月那笔 9.9
  const may = { start_date: "2026-05-01", end_date: "2026-05-31" };
  close(sumByCycle(sample, may), 9.9);
  close(sumByCycle(sample, null), 0);      // 没有周期 → 0
});

test("addDays：日期前后挪天", () => {
  assert.strictEqual(addDays("2026-06-01", 1), "2026-06-02");
  assert.strictEqual(addDays("2026-06-01", -1), "2026-05-31"); // 跨月
  assert.strictEqual(addDays("2026-12-31", 1), "2027-01-01");  // 跨年
});

test("daysBetween：算两个日期相差几天", () => {
  assert.strictEqual(daysBetween("2026-06-01", "2026-06-03"), 2);
  assert.strictEqual(daysBetween("2026-06-01", "2026-06-01"), 0);
  assert.strictEqual(daysBetween("2026-05-31", "2026-06-01"), 1); // 跨月
});

test("dailyTotals：逐天求和、没消费的天补 0", () => {
  const recs = [
    { amount: 10, time: "2026-06-01 09:00" },
    { amount: 5,  time: "2026-06-01 20:00" },
    { amount: 8,  time: "2026-06-03 12:00" },
  ];
  const out = dailyTotals(recs, "2026-06-01", "2026-06-03");
  assert.strictEqual(out.length, 3);            // 1、2、3 三天都在
  assert.strictEqual(out[0].date, "2026-06-01"); close(out[0].amount, 15); // 同一天两笔合并
  assert.strictEqual(out[1].date, "2026-06-02"); close(out[1].amount, 0);  // 没消费补 0
  assert.strictEqual(out[2].date, "2026-06-03"); close(out[2].amount, 8);
});

test("topExpenses：本周期最大的几笔，按金额从高到低", () => {
  const cyc = { start_date: "2026-06-01", end_date: null };
  const recs = [
    { amount: 35.5, category: "餐饮", note: "午饭", time: "2026-06-02 12:00" },
    { amount: 100, category: "购物", note: "买书", time: "2026-06-03 12:00" },
    { amount: 20, category: "交通", note: "", time: "2026-06-04 12:00" },
    { amount: 9.9, category: "餐饮", note: "上月", time: "2026-05-20 12:00" }, // 不在周期内
  ];
  const top = topExpenses(recs, cyc, 2);
  assert.strictEqual(top.length, 2);
  assert.strictEqual(top[0].category, "购物"); close(top[0].amount, 100);
  assert.strictEqual(top[1].category, "餐饮"); close(top[1].amount, 35.5);
  assert.strictEqual(top[0].date, "2026-06-03"); // 带日期
});

test("pacing：日均与「还能撑几天」", () => {
  // 已花 300，预算 1000，已过 3 天 → 日均 100，剩 700，还能撑 7 天
  const p = pacing(300, 1000, 3);
  close(p.dailyAvg, 100);
  close(p.remain, 700);
  close(p.daysLeftAtRate, 7);
  // 还没消费：日均 0，能撑「无限久」
  const p2 = pacing(0, 1000, 5);
  assert.strictEqual(p2.dailyAvg, 0);
  assert.strictEqual(p2.daysLeftAtRate, Infinity);
});
