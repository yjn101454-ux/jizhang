// api/report.js —— Vercel 后端小函数（serverless function）
// 作用：把前端算好的「本周期消费汇总」交给 DeepSeek，让它写一份温暖、接地气的消费报告。
// 安全：DeepSeek 的 key 从环境变量 DEEPSEEK_API_KEY 读取，绝不写进代码、不进 git。
// 接口 /api/report（只在 Vercel 上生效）。

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "只支持 POST" });
    return;
  }

  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    res.status(500).json({ error: "服务器还没配置 DEEPSEEK_API_KEY（请在 Vercel 环境变量里设置）" });
    return;
  }

  // 取出前端传来的汇总数据（兼容 body 是字符串或对象）
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const data = body && body.data ? body.data : null;
  if (!data) { res.status(400).json({ error: "没有汇总数据" }); return; }

  // 把数据整理成给模型看的文字（只用这些真实数字，别让它瞎编）
  const cats = (data.categories || [])
    .map((c) => `${c.name} ¥${c.amount}（${c.pct}%）`).join("、") || "暂无";
  const prev = data.prev && data.prev.exists
    ? `上一周期花了 ¥${data.prev.spent}（预算 ¥${data.prev.budget}）`
    : "没有上一周期可比";

  // 按备注精确合计（次数+金额，代码算准——AI 直接引用，别自己加）
  const byNoteLines = (data.byNote || [])
    .map((n) => `${n.note}：${n.count} 次，合计 ¥${n.sum}`)
    .join("\n") || "暂无";
  // 花得最多的几天（每天精确合计）
  const topDaysLines = (data.topDays || [])
    .map((d) => `${d.date}：¥${d.amount}`)
    .join("；") || "暂无";
  // 逐笔明细（只供 AI 理解每笔是什么，不要拿来求和）
  const itemLines = (data.items || [])
    .map((it) => `${it.date}　${it.note || "（无备注）"}　¥${it.amount}`)
    .join("\n");
  const moreNote = data.itemCount && data.items && data.itemCount > data.items.length
    ? `（共 ${data.itemCount} 笔，下面只列了最近 ${data.items.length} 笔）`
    : "";

  const facts =
    `周期：${data.period}\n` +
    `预算 ¥${data.budget}，已花 ¥${data.spent}，剩余 ¥${data.remain}，已用 ${data.pct}%。\n` +
    `已过 ${data.daysElapsed} 天，日均 ¥${data.dailyAvg}。` +
    (typeof data.daysLeftAtRate === "number" ? `照当前花法，剩余预算还能撑约 ${data.daysLeftAtRate} 天。\n` : "\n") +
    `和上期比较：${prev}。\n\n` +
    `【按备注合计（精确，已替你算好次数和金额，直接引用即可）】：\n${byNoteLines}\n\n` +
    `【花得最多的几天（精确）】：${topDaysLines}\n\n` +
    `【仅供参考的自动分类构成（可能不准）】：${cats}\n\n` +
    `【逐笔明细 ${moreNote}，只用来理解每笔是什么、不要拿来加总】：\n` +
    (itemLines || "（本周期还没有消费）");

  const prompt =
    "你是一个温暖、接地气的记账小助手，正在帮一个容易超支的大学生看清这段时间的花销、并鼓励 ta 别超预算。\n" +
    "下面是这名学生本资金周期的真实消费数据（金额单位都是人民币元）：\n\n" +
    facts +
    "\n\n【最重要的两条铁律，必须遵守】\n" +
    "一、报告里的【金额、次数、占比、天数】都要基于上面我已经算好的数字（总览、按备注合计、花得最多的几天、分类构成）。" +
    "【不要回到「逐笔明细」自己一笔笔重新加总】——那样容易数错、加错。" +
    "但如果你发现「按备注合计」里有几条其实是同一个地方/同一件事（例如「震天电竞」和「震天」、「蜜雪」和「蜜雪冰城」），" +
    "你可以把它们的小计【相加合并】成一项，并简单说明你把哪几条合并了（只允许对我给的小计做这种少量相加）。\n" +
    "二、理解每笔钱花在啥上时，【以「备注」为准】；自动分类可能不准，别照搬。归纳大头时优先用「按备注合计」里的数字。\n\n" +
    "请写一份简短的中文消费报告，要求：\n" +
    "1. 口吻温暖、像朋友，别说教、别空话；多结合具体备注说话，可以点名具体花销（如「震天电竞去了 3 次共 ¥125」），但数字一律照搬上面给的。\n" +
    "2. 用这几个带 emoji 的小标题分段（用 Markdown 的「## 」开头）：\n" +
    "   ## 📊 概况  ## 💸 钱花在哪  ## ⚠️ 要注意  ## 💡 省钱建议  ## 🎯 下期小目标\n" +
    "3. 「钱花在哪」按「按备注合计」归纳真正的大头。\n" +
    "4. 「省钱建议」给 2~3 条具体、可执行的（结合最花钱的备注项来提）。\n" +
    "5. 「下期小目标」给一个可量化的小目标（如某类花销控制在多少元内）。\n" +
    "6. 全文控制在 300~400 字，要点用「- 」列出，重点可用 **加粗**。金额带 ¥。\n";

  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key,
      },
      body: JSON.stringify({
        // deepseek-v4-flash：当前模型（旧名 deepseek-chat 即将停用）。
        // 思考模式默认开启 —— 让它先推理再写，合计/合并更准。
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      res.status(502).json({ error: "调用 DeepSeek 失败（" + r.status + "）", detail: t.slice(0, 200) });
      return;
    }

    const json = await r.json();
    const content =
      json.choices && json.choices[0] && json.choices[0].message
        ? json.choices[0].message.content
        : "";
    if (!content) { res.status(502).json({ error: "AI 没有返回内容" }); return; }

    res.status(200).json({ report: String(content).trim() });
  } catch (e) {
    res.status(500).json({ error: "服务器出错：" + (e.message || e) });
  }
};
