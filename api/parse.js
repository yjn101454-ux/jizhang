// api/parse.js —— Vercel 后端小函数（serverless function）
// 作用：把用户的一句话（如「今天星巴克 38」）交给 DeepSeek，解析成 {amount, category, note}。
// 安全：DeepSeek 的 key 从环境变量 DEEPSEEK_API_KEY 读取，绝不写进代码、不进 git。
// 它会自动变成线上接口 /api/parse（只在 Vercel 上生效，GitHub Pages 跑不了后端）。

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

  // 取出用户输入的文本（兼容 body 是字符串或已解析对象两种情况）
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const text = body && body.text ? String(body.text).trim() : "";
  if (!text) { res.status(400).json({ error: "没有输入内容" }); return; }

  const today = new Date().toISOString().slice(0, 10);
  const prompt =
    "你是记账助手。从用户的一句话里提取一笔消费，只返回严格 JSON：\n" +
    '{"amount": 数字, "category": "分类", "note": "备注"}\n' +
    "规则：\n" +
    "- amount：金额（人民币元，大于 0）；判断不出就返回 0。\n" +
    "- category：按常识归入这几类之一——餐饮、交通、购物、娱乐、居住、医疗、学习、其它。" +
    "例：星巴克/瑞幸/吃饭/外卖/奶茶/水果→餐饮；打车/滴滴/地铁/公交/加油→交通；买衣服/超市/日用品→购物；" +
    "电影/游戏/唱歌/网吧/电竞→娱乐；" +
    "房租/水电/物业，以及话费/网费/流量/宽带/中国移动/中国联通/中国电信→居住（这些每月固定开销都算居住）；" +
    "看病/买药→医疗；书/网课/文具/打印/网盘续费→学习。\n" +
    "- 拿不准就归「其它」。\n" +
    "- note：把这句话里的店名或事项填进去（如「星巴克」「打车」「房租」）；没有就用空字符串。\n" +
    "- 只返回 JSON，不要任何多余文字。\n" +
    "示例：\n" +
    '「今天星巴克 38」→ {"amount":38,"category":"餐饮","note":"星巴克"}\n' +
    '「打车回家 25」→ {"amount":25,"category":"交通","note":"打车"}\n' +
    '「买了本书 45」→ {"amount":45,"category":"学习","note":"买书"}\n' +
    "今天是 " + today + "。用户输入：" + text;

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
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      res.status(502).json({ error: "调用 DeepSeek 失败（" + r.status + "）", detail: t.slice(0, 200) });
      return;
    }

    const data = await r.json();
    const content =
      data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";

    let parsed;
    try { parsed = JSON.parse(content); }
    catch (e) { res.status(502).json({ error: "AI 返回的不是有效 JSON", raw: String(content).slice(0, 200) }); return; }

    const amount = Number(parsed.amount);
    res.status(200).json({
      amount: isFinite(amount) && amount > 0 ? amount : 0,
      category: parsed.category ? String(parsed.category) : "",
      note: parsed.note ? String(parsed.note) : "",
    });
  } catch (e) {
    res.status(500).json({ error: "服务器出错：" + (e.message || e) });
  }
};
