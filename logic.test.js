// logic.test.js —— 给核心逻辑写的测试
// 怎么跑：在项目文件夹打开终端，运行   node --test
// 全绿就说明算钱逻辑没问题；有红色就说明哪里被改坏了。

const test = require("node:test");
const assert = require("node:assert");
const {
  formatDateTime, monthKey, isValidAmount,
  sumByMonth, sumAll, sumByCategory, budgetStatus,
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
