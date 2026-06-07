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
  const tops = (data.topExpenses || [])
    .map((t) => `${t.date} ${t.category}${t.note ? "（" + t.note + "）" : ""} ¥${t.amount}`).join("；") || "暂无";
  const prev = data.prev && data.prev.exists
    ? `上一周期花了 ¥${data.prev.spent}（预算 ¥${data.prev.budget}）`
    : "没有上一周期可比";

  const facts =
    `周期：${data.period}\n` +
    `预算 ¥${data.budget}，已花 ¥${data.spent}，剩余 ¥${data.remain}，已用 ${data.pct}%。\n` +
    `已过 ${data.daysElapsed} 天，日均 ¥${data.dailyAvg}。` +
    (typeof data.daysLeftAtRate === "number" ? `照当前花法，剩余预算还能撑约 ${data.daysLeftAtRate} 天。\n` : "\n") +
    `分类构成：${cats}。\n` +
    `最大的几笔：${tops}。\n` +
    `和上期比较：${prev}。`;

  const prompt =
    "你是一个温暖、接地气的记账小助手，正在帮一个容易超支的大学生看清这段时间的花销、并鼓励 ta 别超预算。\n" +
    "下面是这名学生本资金周期的真实消费数据（金额单位都是人民币元）：\n\n" +
    facts +
    "\n\n请基于【上面这些真实数字】写一份简短的中文消费报告，要求：\n" +
    "1. 口吻温暖、像朋友，别说教、别空话；多用具体数字说话，不要编造数据里没有的内容。\n" +
    "2. 用这几个带 emoji 的小标题分段（用 Markdown 的「## 」开头）：\n" +
    "   ## 📊 概况  ## 💸 钱花在哪  ## ⚠️ 要注意  ## 💡 省钱建议  ## 🎯 下期小目标\n" +
    "3. 「省钱建议」给 2~3 条具体、可执行的（结合占比最大的分类或最大的几笔来提）。\n" +
    "4. 「下期小目标」给一个可量化的小目标（如某分类控制在多少元内）。\n" +
    "5. 全文控制在 300 字左右，要点用「- 」列出，重点可用 **加粗**。金额带 ¥。\n";

  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
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
