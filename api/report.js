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

  // 逐笔明细（原始数据，分组/计数/求和全交给 AI 自己算）
  const fmtItems = (arr) => (arr || [])
    .map((it) => `${it.date}　${it.note || "（无备注）"}　¥${it.amount}　[自动分类:${it.category || "无"}]`)
    .join("\n") || "（无）";
  const itemLines = fmtItems(data.items);
  const moreNote = data.itemCount && data.items && data.itemCount > data.items.length
    ? `（共 ${data.itemCount} 笔，下面列了最近 ${data.items.length} 笔）`
    : "";

  let prevBlock = "（没有上一周期可对比）";
  if (data.prev && data.prev.exists) {
    prevBlock = `上一周期（${data.prev.period}），预算 ¥${data.prev.budget}，逐笔明细：\n` + fmtItems(data.prev.items);
  }

  const facts =
    `周期：${data.period}\n` +
    `本期预算：¥${data.budget}\n` +
    `已过天数：${data.daysElapsed} 天\n\n` +
    `本周期逐笔明细 ${moreNote}（格式：日期　备注　¥金额　[自动分类]）：\n` +
    itemLines +
    `\n\n上一周期数据（用于对比）：\n` + prevBlock;

  const prompt =
    "你是一个温暖、接地气、又心思缜密的记账小助手，正在帮一个容易超支的大学生看清这段时间的花销、并鼓励 ta 别超预算。\n" +
    "下面是这名学生的真实消费流水（金额单位都是人民币元）：\n\n" +
    facts +
    "\n\n请你【自己动手算】并写出报告。分析时请注意：\n" +
    "A. 理解每笔钱花在啥上时【以「备注」为准】；后面的「自动分类」是程序猜的、可能不准，别照搬；把明显是同一处/同一类的备注（如「震天电竞」和「震天」、「蜜雪」和「蜜雪冰城」）合并到一起看。\n" +
    "B. 【算账要稳，务必算准】：先按备注把消费归成几组，每组【先逐笔列出包含哪些金额、再相加】得到该组合计与次数；" +
    "本期总花费 = 各组合计之和；剩余 = 预算 − 总花费；日均 = 总花费 ÷ 已过天数。" +
    "算完后【自检一遍】：各组合计相加是否等于总花费？金额有没有抄错？不放心就重算一次，确认无误再写进报告。\n" +
    "C. 数字要忠于流水，不要编造没有的消费。\n\n" +
    "然后写一份简短的中文消费报告，要求：\n" +
    "1. 口吻温暖、像朋友，别说教、别空话；多结合具体备注说话，点名真实的大头花销（如「震天电竞去了 3 次共 ¥125」）。\n" +
    "2. 用这几个带 emoji 的小标题分段（用 Markdown 的「## 」开头）：\n" +
    "   ## 📊 概况  ## 💸 钱花在哪  ## ⚠️ 要注意  ## 💡 省钱建议  ## 🎯 下期小目标\n" +
    "3. 「概况」点明本期总花费 / 预算 / 还剩多少 / 在不在轨道上；有上一周期就和它对比一句。\n" +
    "4. 「钱花在哪」按备注归纳出真正的大头（带金额和次数）。\n" +
    "5. 「省钱建议」给 2~3 条具体、可执行的（结合最花钱的项来提）。\n" +
    "6. 「下期小目标」给一个可量化的小目标（如某类花销控制在多少元内）。\n" +
    "7. 报告正文控制在 300~400 字，要点用「- 」列出，重点可用 **加粗**，金额带 ¥；" +
    "不要在报告里展示你的计算草稿，只给最终结论。\n";

  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key,
      },
      body: JSON.stringify({
        // deepseek-v4-pro：更强的模型，分析与算账更稳；思考模式默认开启（先推理再写）。
        model: "deepseek-v4-pro",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
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
