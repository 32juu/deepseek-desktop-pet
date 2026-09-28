/**
 * AI 服务：DeepSeek 直连（对话 / 翻译 / 笔记总结）+ 未配置 Key 时的本地降级
 *
 * 后续里程碑会把这里扩展为「后端代理优先、直连兜底」，接口保持不变。
 */
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const REQUEST_TIMEOUT_MS = 60000;

const CHAT_SYSTEM_PROMPT =
  '你是桌宠"蓝色大肥鱼"，一只热爱帮助主人的蓝色大肥鱼女仆。' +
  '回答要简洁、可爱、口语化，一般不超过 120 字，可以适当使用颜文字或 emoji。';

function createAiService({ getConfig }) {
  function requireApiKey() {
    const config = getConfig();
    if (!config.apiKey) throw new Error('未配置 DeepSeek API Key，请打开插件面板 ->「设置」填写');
  }

  async function chat(messages, opts = {}) {
    requireApiKey();
    const config = getConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const body = {
      model: config.model || 'deepseek-chat',
      messages,
      max_tokens: opts.maxTokens || 1024
    };
    if (config.model === 'deepseek-reasoner') {
      // reasoner 不支持 temperature / response_format
    } else {
      body.temperature = opts.temperature != null ? opts.temperature : 1.3;
      if (opts.json) body.response_format = { type: 'json_object' };
    }
    try {
      const res = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + config.apiKey
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('DeepSeek 接口错误 ' + res.status + ': ' + txt.slice(0, 160));
      }
      const data = await res.json();
      const content =
        data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
      return (content || '').trim();
    } finally {
      clearTimeout(timer);
    }
  }

  function isZh(text) {
    return /[\u4e00-\u9fff]/.test(text);
  }

  async function translate(text) {
    const config = getConfig();
    if (config.apiKey) {
      const out = await chat(
        [
          {
            role: 'system',
            content:
              '你是中英翻译引擎。中文译成英文，英文译成中文；保持原文语气，只输出译文，不要任何解释或前缀。'
          },
          { role: 'user', content: text.slice(0, 4000) }
        ],
        { temperature: 1.3 }
      );
      return { text: out, engine: 'DeepSeek' };
    }
    // 未配置 Key 时的免费兜底引擎
    const pair = isZh(text) ? 'zh-CN|en-US' : 'en-US|zh-CN';
    const res = await fetch(
      'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text.slice(0, 480)) + '&langpair=' + pair
    );
    if (!res.ok) throw new Error('翻译服务暂时不可用 (' + res.status + ')');
    const data = await res.json();
    const out = data && data.responseData && data.responseData.translatedText;
    if (!out) throw new Error('翻译失败，请稍后再试');
    return { text: out, engine: 'MyMemory(免费兜底)' };
  }

  /** 未配置 Key 时的本地总结：分句 + 关键词词频 + 关键词分类 */
  function localSummary(text) {
    const sentences = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[。！？!?；;])/)
      .map((s) => s.trim())
      .filter(Boolean);
    let summary = sentences.slice(0, 2).join('');
    if (summary.length > 80) summary = summary.slice(0, 77) + '...';
    const cats = {
      工作: ['会议', '项目', '需求', '上线', 'bug', '排期', '客户', '汇报', '周报', '评审'],
      学习: ['考试', '复习', '课程', '作业', '论文', '单词', '看书', '笔记', '网课'],
      生活: ['买菜', '快递', '运动', '做饭', '家务', '理发', '看病', '聚会'],
      灵感: ['想法', '点子', '创意', '灵感', '设计', '方案']
    };
    let category = '其他';
    for (const [c, kws] of Object.entries(cats)) {
      if (kws.some((k) => text.includes(k))) {
        category = c;
        break;
      }
    }
    const stop = new Set([
      '我们',
      '你们',
      '他们',
      '这个',
      '那个',
      '一个',
      '已经',
      '所以',
      '但是',
      '可以',
      '就是',
      '还有',
      '现在',
      '时候',
      '因为',
      '如果'
    ]);
    const freq = {};
    (text.match(/[\u4e00-\u9fff]{2,4}/g) || []).forEach((w) => {
      if (!stop.has(w)) freq[w] = (freq[w] || 0) + 1;
    });
    const keywords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((e) => e[0]);
    return { summary: summary || text.slice(0, 50), category, keywords };
  }

  async function summarize(text) {
    const config = getConfig();
    if (config.apiKey) {
      const out = await chat(
        [
          {
            role: 'system',
            content:
              '你是笔记整理助手。对用户给出的笔记做总结并分类。只输出 JSON，格式：' +
              '{"summary":"80字以内的总结","category":"工作|学习|生活|灵感 之一","keywords":["关键词1","关键词2","关键词3"]}'
          },
          { role: 'user', content: text.slice(0, 6000) }
        ],
        { temperature: 1.3, json: true }
      );
      let obj = null;
      try {
        obj = JSON.parse(out);
      } catch {
        const m = out.match(/\{[\s\S]*\}/);
        if (m) obj = JSON.parse(m[0]);
      }
      if (!obj || !obj.summary) throw new Error('AI 返回格式异常，请重试');
      const category = ['工作', '学习', '生活', '灵感'].includes(obj.category) ? obj.category : '其他';
      return {
        summary: String(obj.summary),
        category,
        keywords: (obj.keywords || []).slice(0, 3).map(String)
      };
    }
    return Object.assign({ engine: '本地(未配置Key)' }, localSummary(text));
  }

  return { CHAT_SYSTEM_PROMPT, chat, translate, summarize, localSummary, isZh };
}

module.exports = { createAiService, CHAT_SYSTEM_PROMPT };
