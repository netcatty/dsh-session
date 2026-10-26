// dsh-session browser half: a "会话" settings section with list and trash.
window.__ModuleLoader__.load({
  id: '@netcatty/dsh-session',
  factory: (require) => {
    const React = require('react');
    const e = React.createElement;

    const s = {
      wrap: { padding: '4px 2px', fontFamily: 'inherit' },
      head: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
      title: { fontSize: 18, fontWeight: 600, whiteSpace: 'nowrap' },
      hint: { color: '#6b7280', fontSize: 12 },
      input: { border: '1px solid #d1d5db', borderRadius: 8, padding: '5px 10px', fontSize: 12 },
      card: { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 10 },
      row: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
      name: { fontWeight: 600, fontSize: 14 },
      mono: { fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#6b7280' },
      btn: { border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', padding: '4px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
      danger: { color: '#b3261e', borderColor: '#f0b8b4' },
    };

    async function api(path, body) {
      const response = await fetch(path, body === undefined ? { headers: { accept: 'application/json' } } : {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      return data;
    }

    function SessionRow({ item, onTrash, busy, childCount, selectable, checked, onSelect, expanded, onToggleExpand }) {
      const label = item.title ?? item.preview ?? '（空会话）';
      return e('div', { style: s.card },
        e('div', { style: s.row },
          selectable ? e('input', { type: 'checkbox', checked, onChange: (ev) => onSelect(ev.target.checked) }) : null,
          childCount > 0 ? e('button', {
            style: { ...s.btn, padding: '0 6px' },
            onClick: onToggleExpand,
            'aria-label': expanded ? '收起子会话' : '展开子会话',
          }, expanded ? '▾' : '▸') : null,
          e('span', { style: s.name }, label),
          e('span', { style: s.hint }, item.project),
          childCount > 0 ? e('span', { style: s.hint }, `子会话 ${childCount}`) : null,
          e('span', { style: { ...s.hint, marginLeft: 'auto' } }, new Date(item.updatedAt).toLocaleString())),
        item.title !== undefined && item.preview !== undefined
          ? e('div', { style: { ...s.hint, marginTop: 4 } }, item.preview)
          : null,
        e('div', { style: { ...s.mono, marginTop: 4 } }, item.id),
        e('div', { style: { marginTop: 8, display: 'flex', gap: 8 } },
          e('button', { style: { ...s.btn, ...s.danger }, disabled: busy, onClick: onTrash }, busy ? '处理中…' : '删除到回收站')));
    }

    function TrashRow({ item, onRestore, onPurge, busy }) {
      const label = item.title ?? item.preview ?? item.id;
      return e('div', { style: s.card },
        e('div', { style: s.row },
          e('span', { style: s.name }, label),
          e('span', { style: s.hint }, item.project ?? ''),
          e('span', { style: { ...s.hint, marginLeft: 'auto' } }, `删除于 ${new Date(item.trashedAt).toLocaleString()}`)),
        item.title !== undefined && item.preview !== undefined ? e('div', { style: { ...s.hint, marginTop: 4 } }, item.preview) : null,
        e('div', { style: { ...s.mono, marginTop: 4 } }, item.id),
        e('div', { style: { marginTop: 8, display: 'flex', gap: 8 } },
          e('button', { style: s.btn, disabled: busy, onClick: onRestore }, '恢复'),
          e('button', { style: { ...s.btn, ...s.danger }, disabled: busy, onClick: onPurge }, '彻底删除')));
    }

    function Page() {
      const [tab, setTab] = React.useState('sessions');
      const [sessions, setSessions] = React.useState([]);
      const [trash, setTrash] = React.useState([]);
      const [search, setSearch] = React.useState('');
      const [expanded, setExpanded] = React.useState(new Set());
      const [selected, setSelected] = React.useState(new Set());
      const [busy, setBusy] = React.useState('');
      const [error, setError] = React.useState('');

      const load = React.useCallback(async () => {
        setError('');
        try {
          if (tab === 'sessions') setSessions((await api('/api/session-hub/list')).sessions ?? []);
          else setTrash((await api('/api/session-hub/trash')).entries ?? []);
        } catch (err) {
          setError(String(err instanceof Error ? err.message : err));
        }
      }, [tab]);
      React.useEffect(() => { setSelected(new Set()); load(); }, [load]);

      const act = async (label, fn) => {
        setBusy(label);
        try {
          await fn();
          await load();
        } catch (err) {
          setError(String(err instanceof Error ? err.message : err));
        } finally {
          setBusy('');
        }
      };

      const childCount = new Map();
      for (const item of sessions) {
        if (item.parentSession) childCount.set(item.parentSession, (childCount.get(item.parentSession) ?? 0) + 1);
      }
      const matches = (item) => `${item.title ?? ''} ${item.preview ?? ''} ${item.id} ${item.project}`.toLowerCase().includes(search.toLowerCase());
      const childrenOf = (id) => sessions.filter((item) => item.parentSession === id && matches(item));
      const visible = [];
      for (const item of sessions.filter((session) => session.parentSession === undefined && matches(session))) {
        visible.push(item);
        if (expanded.has(item.id) || (search !== '' && childrenOf(item.id).length > 0)) visible.push(...childrenOf(item.id));
      }

      return e('div', { style: s.wrap },
        e('div', { style: s.head },
          e('span', { style: s.title }, '会话管理'),
          e('div', { style: { display: 'flex', gap: 4 } },
            ['sessions', 'trash'].map((key) => e('button', {
              key,
              style: { ...s.btn, background: tab === key ? '#eef2ff' : '#fff', borderColor: tab === key ? '#93c5fd' : '#d1d5db' },
              onClick: () => setTab(key),
            }, key === 'sessions' ? '会话' : '回收站')),
          e('input', { style: s.input, placeholder: '搜索标题 / ID / 项目', value: search, onChange: (ev) => setSearch(ev.target.value) }),
          e('button', { style: s.btn, onClick: load }, '刷新'),

          tab === 'sessions'
            ? e('button', { style: s.btn, onClick: () => { if (confirm('清理所有空会话到回收站？')) act('cleanup', () => api('/api/session-hub/cleanup-empty')); } }, '清理空会话')
            : e('button', { style: { ...s.btn, ...s.danger }, onClick: () => { if (confirm('清空回收站？所有条目将被彻底删除')) act('empty-trash', () => api('/api/session-hub/empty-trash')); } }, '清空回收站'),
          tab === 'sessions' && selected.size > 0
            ? e('button', { style: { ...s.btn, ...s.danger }, onClick: () => {
              if (!confirm(`批量删除 ${selected.size} 个会话到回收站？`)) return;
              act('batch', async () => {
                const result = await api('/api/session-hub/batch-trash', { ids: [...selected] });
                if (Array.isArray(result.skipped) && result.skipped.length > 0) alert(`跳过 ${result.skipped.length} 个：${result.skipped.map((item) => item.id).join(', ')}`);
              });
            } }, `批量删除 (${selected.size})`)
            : null)),
        error !== '' ? e('div', { style: { color: '#b3261e', fontSize: 12, marginBottom: 10 } }, error) : null,
        tab === 'sessions'
          ? visible.map((item) => e(SessionRow, {
            key: item.id,
            item,
            busy: busy === item.id,
            childCount: childCount.get(item.id) ?? 0,
            selectable: true,
            checked: selected.has(item.id),
            expanded: expanded.has(item.id),
            onToggleExpand: () => setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
              return next;
            }),
            onSelect: (checked) => setSelected((prev) => {
              const next = new Set(prev);
              if (checked) next.add(item.id); else next.delete(item.id);
              return next;
            }),
            onTrash: () => {
              const count = childCount.get(item.id) ?? 0;
              if (count > 0 && !confirm(`会话 ${item.id} 有 ${count} 个子会话，一并删除？`)) return;
              act(item.id, () => api('/api/session-hub/move-to-trash', { id: item.id, includeChildren: count > 0 }));
            },
          }))
          : trash.filter((item) => `${item.id} ${item.origin}`.toLowerCase().includes(search.toLowerCase())).map((item) => e(TrashRow, {
            key: item.id,
            item,
            busy: busy === item.id,
            onRestore: () => act(item.id, () => api('/api/session-hub/restore', { id: item.id })),
            onPurge: () => {
              if (!confirm(`彻底删除会话 ${item.id}？不可恢复`)) return;
              act(item.id, () => api('/api/session-hub/purge', { id: item.id }));
            },
          })),
        tab === 'sessions' && visible.length === 0 ? e('div', { style: s.hint }, '没有匹配的会话') : null,
        tab === 'trash' && trash.length === 0 ? e('div', { style: s.hint }, '回收站为空') : null);
    }

    function apply(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'sessions', order: 72, label: () => '会话', locale: 'sessions', inject: () => ({}),
      }, Page));
      ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab', id: 'sessions', order: 42, label: () => '会话', locale: 'sessions', inject: () => ({}),
      }, Page));
    }

    const module = { exports: { name: 'dsh-session', inject: ['slots'], apply } };
    return module.exports;
  },
});
