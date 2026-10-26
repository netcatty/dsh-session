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

    function SessionRow({ item, onTrash, busy, childCount, selectable, checked, onSelect, expanded, onToggleExpand, nested, onOpen }) {
      const label = item.title ?? item.preview ?? '（空会话）';
      return e('div', { style: { ...s.card, marginLeft: nested ? 28 : 0 } },
        e('div', { style: s.row },
          selectable ? e('input', { type: 'checkbox', checked, onChange: (ev) => onSelect(ev.target.checked), style: { margin: 0, width: 14, height: 14 } }) : null,
          childCount > 0 ? e('button', {
            style: { ...s.btn, padding: '2px 8px' },
            onClick: onToggleExpand,
            'aria-label': expanded ? '收起子会话' : '展开子会话',
          }, expanded ? `收起 (${childCount})` : `展开 (${childCount})`) : null,
          e('span', { style: s.name }, label),
          e('span', { style: s.hint }, item.project),
          childCount > 0 ? e('span', { style: s.hint }, `子会话 ${childCount}`) : null,
          e('span', { style: { ...s.hint, marginLeft: 'auto' } }, new Date(item.updatedAt).toLocaleString())),
        item.title !== undefined && item.preview !== undefined
          ? e('div', { style: { ...s.hint, marginTop: 4 } }, item.preview)
          : null,
        e('div', { style: { ...s.mono, marginTop: 4 } }, item.id),
        e('div', { style: { marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' } },
          e('button', { style: s.btn, disabled: busy, onClick: onOpen }, '打开'),
          item.parentSession !== undefined
            ? e('span', { style: s.hint }, '子会话随主会话一起删除')
            : e('button', { style: { ...s.btn, ...s.danger }, disabled: busy, onClick: onTrash }, busy ? '处理中…' : '删除到回收站')));
    }

    function TrashRow({ item, onRestore, onPurge, busy, checked, onSelect }) {
      const label = item.title ?? item.preview ?? item.id;
      return e('div', { style: s.card },
        e('div', { style: s.row },
          e('input', { type: 'checkbox', checked, onChange: (ev) => onSelect(ev.target.checked), style: { margin: 0, width: 14, height: 14 } }),
          e('span', { style: s.name }, label),
          e('span', { style: s.hint }, item.project ?? ''),
          e('span', { style: { ...s.hint, marginLeft: 'auto' } }, `删除于 ${new Date(item.trashedAt).toLocaleString()}`)),
        item.title !== undefined && item.preview !== undefined ? e('div', { style: { ...s.hint, marginTop: 4 } }, item.preview) : null,
        e('div', { style: { ...s.mono, marginTop: 4 } }, item.id),
        e('div', { style: { marginTop: 8, display: 'flex', gap: 8 } },
          e('button', { style: s.btn, disabled: busy, onClick: onRestore }, '恢复'),
          e('button', { style: { ...s.btn, ...s.danger }, disabled: busy, onClick: onPurge }, '彻底删除')));
    }

    function Page({ open }) {
      const [tab, setTab] = React.useState('sessions');
      const [sessions, setSessions] = React.useState([]);
      const [trash, setTrash] = React.useState([]);
      const [search, setSearch] = React.useState('');
      const [expanded, setExpanded] = React.useState(new Set());
      const [collapsedProjects, setCollapsedProjects] = React.useState(new Set());
      const [selected, setSelected] = React.useState(new Set());
      const [selectedTrash, setSelectedTrash] = React.useState(new Set());
      const [busy, setBusy] = React.useState('');
      const [error, setError] = React.useState('');
      const [dialog, setDialog] = React.useState(null);
      const ask = (message, action) => setDialog({ message, action });

      const load = React.useCallback(async () => {
        setError('');
        try {
          if (tab === 'sessions') setSessions((await api('/api/session-hub/list')).sessions ?? []);
          else setTrash((await api('/api/session-hub/trash')).entries ?? []);
        } catch (err) {
          setError(String(err instanceof Error ? err.message : err));
        }
      }, [tab]);
      React.useEffect(() => { setSelected(new Set()); setSelectedTrash(new Set()); load(); }, [load]);

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

      const children = [];
      children.push(e('div', { style: { ...s.head, flexDirection: 'column', alignItems: 'stretch' } },
        e('span', { style: s.title }, '会话'),
        e('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          e('div', { style: { display: 'flex', gap: 4 } },
            ['sessions', 'trash'].map((key) => e('button', {
              key,
              style: { ...s.btn, background: tab === key ? '#eef2ff' : '#fff', borderColor: tab === key ? '#93c5fd' : '#d1d5db' },
              onClick: () => setTab(key),
            }, key === 'sessions' ? '会话' : '回收站'))),
          e('input', { style: { ...s.input, minWidth: 220 }, placeholder: '搜索标题 / ID / 项目', value: search, onChange: (ev) => setSearch(ev.target.value) }),
          e('button', { style: s.btn, onClick: load }, '刷新'),
          tab === 'sessions'
            ? e('button', { style: s.btn, onClick: () => ask('清理所有空会话到回收站？', () => act('cleanup', () => api('/api/session-hub/cleanup-empty'))) }, '清理空会话')
            : e('button', { style: { ...s.btn, ...s.danger }, onClick: () => ask('清空回收站？所有条目将被彻底删除', () => act('empty-trash', () => api('/api/session-hub/empty-trash'))) }, '清空回收站'),
          tab === 'trash'
            ? e('button', {
              style: { ...s.btn, opacity: selectedTrash.size === 0 ? 0.45 : 1 },
              disabled: selectedTrash.size === 0,
              onClick: () => ask(`批量恢复 ${selectedTrash.size} 个会话？`, () => act('batch-restore', async () => {
                  const result = await api('/api/session-hub/batch-restore', { ids: [...selectedTrash] });
                  setSelectedTrash(new Set());
                  if (Array.isArray(result.skipped) && result.skipped.length > 0) alert(`跳过 ${result.skipped.length} 个`);
                })),
            }, `批量恢复 (${selectedTrash.size})`)
            : null,
          tab === 'trash'
            ? e('button', {
              style: { ...s.btn, ...s.danger, opacity: selectedTrash.size === 0 ? 0.45 : 1 },
              disabled: selectedTrash.size === 0,
              onClick: () => ask(`彻底删除 ${selectedTrash.size} 个条目？不可恢复`, () => act('batch-purge', async () => {
                await api('/api/session-hub/batch-purge', { ids: [...selectedTrash] });
                setSelectedTrash(new Set());
              })),
            }, `批量彻底删除 (${selectedTrash.size})`)
            : null,
          tab === 'sessions'
            ? e('button', {
              style: { ...s.btn, ...s.danger, opacity: selected.size === 0 ? 0.45 : 1 },
              disabled: selected.size === 0,
              onClick: () => ask(`批量删除 ${selected.size} 个会话到回收站？`, () => act('batch', async () => {
                  const result = await api('/api/session-hub/batch-trash', { ids: [...selected] });
                  setSelected(new Set());
                  if (Array.isArray(result.skipped) && result.skipped.length > 0) {
                    alert(`跳过 ${result.skipped.length} 个：${result.skipped.map((item) => item.id).join(', ')}`);
                  }
                })),
            }, `批量删除 (${selected.size})`)
            : null)));
      if (error !== '') children.push(e('div', { key: 'error', style: { color: '#b3261e', fontSize: 12, marginBottom: 10 } }, error));

      if (tab === 'sessions') {
        const groups = new Map();
        for (const item of visible) {
          if (!groups.has(item.project)) groups.set(item.project, []);
          groups.get(item.project).push(item);
        }
        for (const [project, items] of groups) {
          const collapsed = collapsedProjects.has(project);
          children.push(e('div', {
            key: `project-${project}`,
            style: { display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 6px', color: '#6b7280', fontSize: 12 },
          },
          e('button', {
            style: { ...s.btn, padding: '0 6px' },
            onClick: () => setCollapsedProjects((prev) => {
              const next = new Set(prev);
              if (next.has(project)) next.delete(project); else next.add(project);
              return next;
            }),
          }, collapsed ? '▸' : '▾'),
          e('span', { style: { fontWeight: 600 } }, project.replace(/^--|--$/g, '').replace(/-/g, '/').replace(/\/\/+/g, '/')),
          e('span', null, `${items.length} 个会话`)));
          if (collapsed) continue;
          const groupCards = [];
          for (const item of items) {
          groupCards.push(e(SessionRow, {
            key: item.id,
            item,
            busy: busy === item.id,
            childCount: childCount.get(item.id) ?? 0,
            selectable: true,
            checked: selected.has(item.id),
            expanded: expanded.has(item.id),
            nested: item.parentSession !== undefined,
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
            onOpen: () => open?.(item),
            onTrash: () => {
              const count = childCount.get(item.id) ?? 0;
              const remove = () => act(item.id, async () => {
                await api('/api/session-hub/move-to-trash', { id: item.id, includeChildren: count > 0 });
                setSelected((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
              });
              if (count > 0) ask(`「${label}」有 ${count} 个子会话，一并删除？`, remove);
              else remove();
            },
          }));
          }
          children.push(e('div', { key: `cards-${project}`, style: { borderLeft: '2px solid #e5e7eb', marginLeft: 10, paddingLeft: 12 } }, groupCards));
        }
        if (visible.length === 0) children.push(e('div', { key: 'empty', style: s.hint }, '没有匹配的会话'));
      } else {
        const rows = trash.filter((item) => `${item.id} ${item.origin} ${item.title ?? ''}`.toLowerCase().includes(search.toLowerCase()));
        const trashGroups = new Map();
        for (const item of rows) {
          const key = item.project ?? '（未知工作区）';
          if (!trashGroups.has(key)) trashGroups.set(key, []);
          trashGroups.get(key).push(item);
        }
        for (const [project, items] of trashGroups) {
          const collapsed = collapsedProjects.has(`trash:${project}`);
          children.push(e('div', {
            key: `trash-project-${project}`,
            style: { display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 6px', color: '#6b7280', fontSize: 12 },
          },
          e('button', {
            style: { ...s.btn, padding: '0 6px' },
            onClick: () => setCollapsedProjects((prev) => {
              const next = new Set(prev);
              const key = `trash:${project}`;
              if (next.has(key)) next.delete(key); else next.add(key);
              return next;
            }),
          }, collapsed ? '▸' : '▾'),
          e('span', { style: { fontWeight: 600 } }, project.replace(/^--|--$/g, '').replace(/-/g, '/')),
          e('span', null, `${items.length} 个条目`)));
          if (collapsed) continue;
          const groupCards = [];
          for (const item of items) {
          groupCards.push(e(TrashRow, {
            key: item.id,
            item,
            busy: busy === item.id,
            checked: selectedTrash.has(item.id),
            onSelect: (checked) => setSelectedTrash((prev) => {
              const next = new Set(prev);
              if (checked) next.add(item.id); else next.delete(item.id);
              return next;
            }),
            onRestore: () => act(item.id, async () => {
              await api('/api/session-hub/restore', { id: item.id });
              setSelectedTrash((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
            }),
            onPurge: () => ask(`彻底删除「${label}」？不可恢复`, () => act(item.id, async () => {
              await api('/api/session-hub/purge', { id: item.id });
              setSelectedTrash((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
            })),
          }));
          }
          children.push(e('div', { key: `trash-cards-${project}`, style: { borderLeft: '2px solid #e5e7eb', marginLeft: 10, paddingLeft: 12 } }, groupCards));
        }
        if (rows.length === 0) children.push(e('div', { key: 'empty', style: s.hint }, '回收站为空'));
      }

      if (dialog !== null) {
        children.push(e('div', {
          key: 'dialog',
          style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        },
        e('div', { style: { background: '#fff', borderRadius: 12, padding: 20, width: 380, boxShadow: '0 12px 40px rgba(0,0,0,.25)' } },
          e('div', { style: { fontSize: 14, lineHeight: 1.5, marginBottom: 16, color: '#111827' } }, dialog.message),
          e('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
            e('button', { style: s.btn, onClick: () => setDialog(null) }, '取消'),
            e('button', { style: { ...s.btn, ...s.danger }, onClick: () => { const action = dialog.action; setDialog(null); action(); } }, '确定')))));
      }
      return e('div', { style: s.wrap }, children);
    }

    function apply(ctx) {
      const open = (item) => {
        const workspace = ctx.get?.('uiWorkspace');
        if (workspace?.openSession === undefined) return;
        if (item.parentSession !== undefined) workspace.openSession({ parentSessionId: item.parentSession, childSessionId: item.id, mode: 'continuable' });
        else workspace.openSession(item.id);
      };
      const injected = () => ({ open });
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'sessions', order: 72, label: () => '会话', locale: 'sessions', inject: injected,
      }, Page));
      ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab', id: 'sessions', order: 42, label: () => '会话', locale: 'sessions', inject: injected,
      }, Page));
    }

    const module = { exports: { name: 'dsh-session', inject: ['slots'], apply } };
    return module.exports;
  },
});
