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

  // 逐笔明细（重点：带上每笔备注，让 AI 主要照备注分析）
  const itemLines = (data.items || [])
    .map((it) => `${it.date}　${it.note || "（无备注）"}　¥${it.amount}　[原分类:${it.category || "无"}]`)
    .join("\n");
  const moreNote = data.itemCount && data.items && data.itemCount > data.items.length
    ? `（共 ${data.itemCount} 笔，下面只列了最近 ${data.items.length} 笔）`
    : "";

  const facts =
    `周期：${data.period}\n` +
    `预算 ¥${data.budget}，已花 ¥${data.spent}，剩余 ¥${data.remain}，已用 ${data.pct}%。\n` +
    `已过 ${data.daysElapsed} 天，日均 ¥${data.dailyAvg}。` +
    (typeof data.daysLeftAtRate === "number" ? `照当前花法，剩余预算还能撑约 ${data.daysLeftAtRate} 天。\n` : "\n") +
    `（仅供参考的）自动分类构成：${cats}。\n` +
    `和上期比较：${prev}。\n\n` +
    `逐笔明细 ${moreNote}（格式：日期　备注　金额　[原分类]）：\n` +
    (itemLines || "（本周期还没有消费）");

  const prompt =
    "你是一个温暖、接地气的记账小助手，正在帮一个容易超支的大学生看清这段时间的花销、并鼓励 ta 别超预算。\n" +
    "下面是这名学生本资金周期的真实消费数据（金额单位都是人民币元）：\n\n" +
    facts +
    "\n\n【非常重要】分析时请【主要依据每笔的「备注」】来理解这钱到底花在了什么上——这名学生的备注通常写得比较具体、可信。" +
    "而每笔后面的「原分类」是程序自动归的，【可能不准】，不要盯着原分类下结论；当备注和原分类对不上时，以备注为准，必要时按备注把花销重新归纳成更合理的类别。\n" +
    "请写一份简短的中文消费报告，要求：\n" +
    "1. 口吻温暖、像朋友，别说教、别空话；多结合【具体备注和金额】说话，可以点名具体的花销（如「奶茶买了好几次」「电竞通宵 ¥35」），不要编造数据里没有的内容。\n" +
    "2. 用这几个带 emoji 的小标题分段（用 Markdown 的「## 」开头）：\n" +
    "   ## 📊 概况  ## 💸 钱花在哪  ## ⚠️ 要注意  ## 💡 省钱建议  ## 🎯 下期小目标\n" +
    "3. 「钱花在哪」请按备注归纳出真正的大头（不要照搬可能不准的原分类）。\n" +
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
