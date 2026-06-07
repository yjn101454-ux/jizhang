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

  // 预算状态：用代码算好的 remain 直接判定方向，做成一句话，AI 必须照搬，不能算反
  const over = Number(data.remain) < 0;
  const statusLine = over
    ? `已超支 ¥${Math.abs(data.remain).toFixed(2)}（已用 ${data.pct}%）`
    : `还剩 ¥${Number(data.remain).toFixed(2)}（已用 ${data.pct}%）`;

  // 按备注合计（精确，已替你算好次数和金额）
  const byNoteLines = (data.byNote || [])
    .map((n) => `${n.note}：${n.count} 次，合计 ¥${n.sum}`).join("\n") || "暂无";
  // 分类合计（精确）
  const catLines = (data.categories || [])
    .map((c) => `${c.name} ¥${c.amount}（${c.pct}%）`).join("、") || "暂无";
  // 花得最多的几天（精确）
  const topDaysLines = (data.topDays || [])
    .map((d) => `${d.date}：¥${d.amount}`).join("；") || "暂无";
  const prev = data.prev && data.prev.exists
    ? `上一周期花了 ¥${data.prev.spent}（预算 ¥${data.prev.budget}）`
    : "没有上一周期可比";

  // 这些数字全部由网页用代码算准（和 App 首页同一套），AI 只许引用、不许自行改算。
  const facts =
    `周期：${data.period}\n` +
    `本期预算：¥${data.budget}\n` +
    `本期总花费：¥${data.spent}\n` +
    `预算状态：${statusLine}\n` +
    `已过 ${data.daysElapsed} 天，日均 ¥${data.dailyAvg}。` +
    (typeof data.daysLeftAtRate === "number" ? `照当前花法，剩余预算还能撑约 ${data.daysLeftAtRate} 天。\n` : "\n") +
    `\n【按备注合计（精确，已替你算好次数和金额）】：\n${byNoteLines}\n\n` +
    `【分类合计（精确）】：${catLines}\n\n` +
    `【花得最多的几天（精确）】：${topDaysLines}\n\n` +
    `【和上一周期比较】：${prev}`;

  const prompt =
    "你是一个温暖、接地气的记账小助手，正在帮一个容易超支的大学生看清这段时间的花销、并鼓励 ta 别超预算。\n" +
    "下面这些数字【已经由程序精确算好了】（和这名学生 App 首页看到的完全一致，单位都是人民币元）：\n\n" +
    facts +
    "\n\n【必须遵守的铁律】\n" +
    "一、报告里的【本期总花费、预算、剩余/超支、百分比、日均、天数、还能撑几天】，" +
    "【必须原样引用上面给的数字，严禁你自己再加、再算或改动】。尤其「预算状态」那一行——是超支还是有剩余，必须和它完全一致，绝不能说反。\n" +
    "二、归纳「钱花在哪」时，用上面的【按备注合计】；理解每笔花在啥上以「备注」为准。" +
    "如果你发现有几条备注其实是同一个地方/同一件事（如「震天电竞」和「震天」、「蜜雪」和「蜜雪冰城」），" +
    "可以把它们的小计【相加合并】成一项并说明（只允许对我给的精确小计做这种少量相加，不要去推测我没给的数）。\n\n" +
    "请写一份简短的中文消费报告，要求：\n" +
    "1. 口吻温暖、像朋友，别说教、别空话；多结合具体备注说话，点名真实的大头花销（如「震天电竞去了 5 次共 ¥165」）。\n" +
    "2. 用这几个带 emoji 的小标题分段（用 Markdown 的「## 」开头）：\n" +
    "   ## 📊 概况  ## 💸 钱花在哪  ## ⚠️ 要注意  ## 💡 省钱建议  ## 🎯 下期小目标\n" +
    "3. 「概况」如实说明 总花费 / 预算 / 预算状态（超支或剩余，照搬上面）/ 日均；有上一周期就对比一句。\n" +
    "4. 「钱花在哪」按「按备注合计」归纳真正的大头（带金额和次数）。\n" +
    "5. 「省钱建议」给 2~3 条具体、可执行的（结合最花钱的项来提）。\n" +
    "6. 「下期小目标」给一个可量化的小目标（如某类花销控制在多少元内）。\n" +
    "7. 报告正文控制在 300~400 字，要点用「- 」列出，重点可用 **加粗**，金额带 ¥。\n";

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
