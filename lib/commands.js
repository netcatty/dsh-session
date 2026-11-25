// 会话命令的纯函数：id 前缀解析与单行列表文本。
// /session-trash、/session-restore、/session-purge 的执行留在 index.js，因为那需要 DSH 运行时服务。

/** 会话 id 的短形式：去掉 `session-` 前缀，最多 8 位。 */
export const shortSessionId = (id) => String(id ?? '').replace(/^session-/, '').slice(0, 8);

const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const formatWhen = (value) => {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** 一条会话 / 回收站记录的命令行摘要：短 id + 截断标题 + 时间。 */
export const sessionLine = (row) => {
  const title = oneLine(row?.title) || '(无标题)';
  const clipped = title.length > 24 ? `${title.slice(0, 23)}…` : title;
  const when = formatWhen(row?.updatedAt ?? row?.trashedAt);
  return `${shortSessionId(row?.id)} ${clipped}${when === '' ? '' : `（${when}）`}`;
};

/**
 * 渲染一条命令结果：标题行 + 每条记录一行 + 操作提示。命令结果按多行文本
 * 显示，所以每条会话单独占一行；超过一页时用 `page <n>` 翻页。
 */
export const renderSessionList = (label, records, { empty, hint, limit = 10, page = 1 } = {}) => {
  if (!Array.isArray(records) || records.length === 0) return empty ?? '没有条目。';
  const totalPages = Math.max(1, Math.ceil(records.length / limit));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (current - 1) * limit;
  const head = `${label}（共 ${records.length} 条，第 ${current}/${totalPages} 页）：`;
  const lines = records.slice(start, start + limit).map((record) => `  ${sessionLine(record)}`);
  const tail = hint === undefined || hint === '' ? [] : [hint];
  return [head, ...lines, ...tail].join('\n');
};

/** 解析 `page <n>`；不是分页参数时返回 undefined。 */
export const parsePageArg = (raw) => {
  const match = /^page\s+(\d+)$/i.exec(String(raw ?? '').trim());
  return match === null ? undefined : Math.max(1, Number(match[1]));
};

const idMatches = (id, text) => id === text
  || id.startsWith(text)
  || (id.startsWith('session-') && id.slice('session-'.length).startsWith(text));

/**
 * 用完整 id、短 id 前缀或标题关键词定位一条记录。
 * 返回 `{ record }`、`{ candidates }`（歧义）或 `{ error }`。
 */
export const resolveSessionTarget = (query, records) => {
  const text = oneLine(query);
  if (text === '') return { error: '缺少 id 前缀' };
  const list = Array.isArray(records) ? records : [];
  const exact = list.find((record) => record?.id === text);
  if (exact !== undefined) return { record: exact };
  const byId = list.filter((record) => idMatches(String(record?.id ?? ''), text));
  if (byId.length === 1) return { record: byId[0] };
  if (byId.length > 1) return { candidates: byId };
  const byTitle = list.filter((record) => typeof record?.title === 'string' && record.title.includes(text));
  if (byTitle.length === 1) return { record: byTitle[0] };
  if (byTitle.length > 1) return { candidates: byTitle };
  return { error: `没有匹配 “${text}” 的条目` };
};
