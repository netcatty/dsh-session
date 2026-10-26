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

    function SessionRow({ item, onTrash, busy, childCount, selectable, checked, onSelect, expanded, onToggleExpand, nested, onOpen, favorite, onFavorite, onTags, onArchive, onExport, tags, reviewLater }) {
      const label = item.title ?? item.preview ?? '（空会话）';
      return e('div', { style: { ...s.card, marginLeft: nested ? 28 : 0 } },
        e('div', { style: s.row },
          selectable ? e('input', { type: 'checkbox', checked, onChange: (ev) => onSelect(ev.target.checked), style: { margin: 0, width: 14, height: 14 } }) : null,
          childCount > 0 ? e('button', {
            style: { ...s.btn, padding: '2px 8px' },
            onClick: onToggleExpand,
            'aria-label': expanded ? '收起子会话' : '展开子会话',
          }, expanded ? `收起 (${childCount})` : `展开 (${childCount})`) : null,
          e('button', { style: { ...s.btn, padding: '0 6px', color: favorite ? '#b58900' : '#9ca3af' }, onClick: onFavorite, title: favorite ? '取消收藏' : '收藏' }, favorite ? '★' : '☆'),
          e('span', { style: s.name }, label),
          (tags ?? []).map((tag) => e('span', { key: tag, style: { fontSize: 11, background: '#eef2ff', borderRadius: 999, padding: '1px 8px' } }, tag)),
          e('span', { style: s.hint }, item.project),
          childCount > 0 ? e('span', { style: s.hint }, `子会话 ${childCount}`) : null,
          item.archived === true ? e('span', { style: { ...s.hint, color: '#8a5a00' } }, '已归档') : null,
          reviewLater ? e('span', { style: { ...s.hint, color: '#8a5a00' } }, '待回看') : null,
          e('span', { style: { ...s.hint, marginLeft: 'auto' } }, new Date(item.updatedAt).toLocaleString())),
        item.title !== undefined && item.preview !== undefined
          ? e('div', { style: { ...s.hint, marginTop: 4 } }, item.preview)
          : null,
        e('div', { style: { ...s.mono, marginTop: 4 } }, item.id),
        e('div', { style: { marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' } },
          e('button', { style: s.btn, disabled: busy, onClick: onOpen }, '打开'),
          e('button', { style: s.btn, disabled: busy, onClick: onTags }, '标签/备注'),
          e('button', { style: s.btn, disabled: busy, onClick: onExport }, '导出'),
          item.parentSession === undefined
            ? e('button', { style: s.btn, disabled: busy, onClick: onArchive }, item.archived === true ? '取消归档' : '归档')
            : null,
          item.parentSession !== undefined
            ? e('span', { style: s.hint }, '子会话随主会话一起删除')
            : e('button', { style: { ...s.btn, ...s.danger }, disabled: busy, onClick: onTrash }, busy ? '处理中…' : '删除到回收站')));
    }

    function TrashRow({ item, onRestore, onPurge, busy, checked, onSelect, favorite }) {
      const label = item.title ?? item.preview ?? item.id;
      return e('div', { style: s.card },
        e('div', { style: s.row },
          e('input', { type: 'checkbox', checked, onChange: (ev) => onSelect(ev.target.checked), style: { margin: 0, width: 14, height: 14 } }),
          favorite ? e('span', { style: { color: '#b58900' }, title: '已收藏' }, '★') : null,
          e('span', { style: s.name }, label),
          e('span', { style: s.hint }, item.project ?? ''),
          e('span', { style: { ...s.hint, marginLeft: 'auto' } }, `删除于 ${new Date(item.trashedAt).toLocaleString()}`)),
        item.title !== undefined && item.preview !== undefined ? e('div', { style: { ...s.hint, marginTop: 4 } }, item.preview) : null,
        e('div', { style: { ...s.mono, marginTop: 4 } }, item.id),
        e('div', { style: { marginTop: 8, display: 'flex', gap: 8 } },
          e('button', { style: s.btn, disabled: busy, onClick: onRestore }, '恢复'),
          e('button', { style: { ...s.btn, ...s.danger }, disabled: busy, onClick: onPurge }, '彻底删除')));
    }

    class Boundary extends React.Component {
      constructor(props) { super(props); this.state = { error: '' }; }
      static getDerivedStateFromError(error) { return { error: error instanceof Error ? error.message : String(error) }; }
      render() {
        if (this.state.error !== '') return e('div', { style: { color: '#b3261e', padding: 16, fontSize: 13 } }, `会话页面渲染失败：${this.state.error}`);
        return this.props.children;
      }
    }

    function Page({ open }) {
      const [tab, setTab] = React.useState('sessions');
      const [sessions, setSessions] = React.useState([]);
      const [trash, setTrash] = React.useState([]);
      const [annotations, setAnnotations] = React.useState({});
      const [favoriteOnly, setFavoriteOnly] = React.useState(false);
      const [showEmpty, setShowEmpty] = React.useState(false);
      const [editing, setEditing] = React.useState(null);
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
          if (tab === 'sessions') {
            const [list, marks] = await Promise.all([api('/api/session-hub/list'), api('/api/session-hub/annotations')]);
            setSessions(list.sessions ?? []);
            setAnnotations(marks.annotations ?? {});
          } else {
            const [list, marks] = await Promise.all([api('/api/session-hub/trash'), api('/api/session-hub/annotations')]);
            setTrash(list.entries ?? []);
            setAnnotations(marks.annotations ?? {});
          }
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
      const matches = (item) => (showEmpty || item.title !== undefined || item.preview !== undefined)
        && `${item.title ?? ''} ${item.preview ?? ''} ${item.id} ${item.project} ${(annotations[item.id]?.tags ?? []).join(' ')} ${annotations[item.id]?.note ?? ''}`.toLowerCase().includes(search.toLowerCase())
        && (!favoriteOnly || annotations[item.id]?.favorite === true);
      const childrenOf = (id) => sessions.filter((item) => item.parentSession === id && matches(item));
      const visible = [];
      for (const item of sessions.filter((session) => session.parentSession === undefined && matches(session))) {
        visible.push(item);
        if (expanded.has(item.id) || (search !== '' && childrenOf(item.id).length > 0)) visible.push(...childrenOf(item.id));
      }

      const editorFor = (id) => {
      const mark = annotations[id] ?? {};
      return e('div', { key: 'editor', style: { ...s.card, borderColor: '#93c5fd', background: '#f8fbff' } },
      e('div', { style: { fontWeight: 600, marginBottom: 8 } }, `标签/备注：${id}`),
      e('input', {
      defaultValue: (mark.tags ?? []).join(', '),
      placeholder: '标签，用逗号分隔',
      id: 'session-tags-input',
      style: { ...s.input, width: '100%', boxSizing: 'border-box', marginBottom: 8 },
      }),
      e('textarea', {
      defaultValue: mark.note ?? '',
      placeholder: '备注',
      id: 'session-note-input',
      style: { ...s.input, width: '100%', minHeight: 60, boxSizing: 'border-box', marginBottom: 8 },
      }),
      e('div', { style: { display: 'flex', gap: 8 } },
      e('button', { style: s.btn, onClick: async () => {
      const tagsValue = document.getElementById('session-tags-input')?.value ?? '';
      const noteValue = document.getElementById('session-note-input')?.value ?? '';
      const tags = tagsValue.split(',').map((tag) => tag.trim()).filter(Boolean);
      await api('/api/session-hub/annotations', { id, patch: { tags, note: noteValue } });
      setEditing(null);
      await load();
      } }, '保存'),
      e('button', { style: s.btn, onClick: () => setEditing(null) }, '取消')));
      };

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
          tab === 'sessions'
            ? e('label', { style: { ...s.hint, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' } },
              e('input', { type: 'checkbox', checked: favoriteOnly, onChange: (ev) => setFavoriteOnly(ev.target.checked) }),
              '仅收藏')
            : null,
          tab === 'sessions'
            ? e('label', { style: { ...s.hint, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' } },
              e('input', { type: 'checkbox', checked: showEmpty, onChange: (ev) => setShowEmpty(ev.target.checked) }),
              '显示空会话')
            : null,
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
            : null,
          tab === 'sessions'
            ? e('button', {
              style: { ...s.btn, opacity: selected.size === 0 ? 0.45 : 1 },
              disabled: selected.size === 0,
              onClick: async () => {
                try {
                  const response = await fetch('/api/session-hub/export-zip', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ ids: [...selected] }),
                  });
                  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `HTTP ${response.status}`);
                  const blob = await response.blob();
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = 'sessions.zip';
                  link.click();
                  URL.revokeObjectURL(link.href);
                } catch (error) {
                  setError(`导出失败：${error instanceof Error ? error.message : String(error)}`);
                }
              },
            }, `导出选中 (${selected.size})`)
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
            selectable: item.parentSession === undefined,
            checked: selected.has(item.id),
            expanded: expanded.has(item.id),
            nested: item.parentSession !== undefined,
            favorite: annotations[item.id]?.favorite === true,
            tags: annotations[item.id]?.tags ?? [],
            reviewLater: annotations[item.id]?.reviewLater === true,
            onFavorite: () => act(item.id, async () => {
              const next = !(annotations[item.id]?.favorite === true);
              await api('/api/session-hub/annotations', { id: item.id, patch: { favorite: next } });
            }),
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
            onTags: () => setEditing(item.id),
            onExport: async () => {
              try {
                const data = await api(`/api/session-hub/export?id=${encodeURIComponent(item.id)}`);
                const blob = new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                const safe = (item.title ?? item.id).replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || item.id;
                link.download = `${safe}.md`;
                link.click();
                URL.revokeObjectURL(link.href);
              } catch (error) {
                setError(`导出失败：${error instanceof Error ? error.message : String(error)}`);
              }
            },
            onArchive: () => act(item.id, async () => {
              await api('/api/session-hub/archive', { id: item.id, archived: !(item.archived === true) });
            }),
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
          if (item.id === editing) groupCards.push(editorFor(item.id));
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
            favorite: annotations[item.id]?.favorite === true,
            tags: annotations[item.id]?.tags ?? [],
            reviewLater: annotations[item.id]?.reviewLater === true,
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

    function ArchiveIcon({ size = 16 }) {
      return e('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', style: { display: 'block' } },
        e('path', { d: 'M2.5 4.5h11v9h-11z', stroke: 'currentColor', strokeWidth: 1.3 }),
        e('path', { d: 'M2 2.5h12v2H2z', stroke: 'currentColor', strokeWidth: 1.3 }),
        e('path', { d: 'M6.5 7.5h3', stroke: 'currentColor', strokeWidth: 1.3 }));
    }

    function ListIcon({ size = 16 }) {
      return e('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', style: { display: 'block' } },
        e('path', { d: 'M3 4h10M3 8h10M3 12h6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }));
    }

    function TrashIcon({ size = 15 }) {
      return e('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', style: { display: 'block' } },
        e('path', { d: 'M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function HeaderActions({ sessionId }) {
      const [confirmDelete, setConfirmDelete] = React.useState(false);
      const [mark, setMark] = React.useState({});
      const [archived, setArchived] = React.useState(false);
      React.useEffect(() => {
        if (!sessionId) return;
        fetch('/api/session-hub/annotations').then((r) => r.json()).then((data) => {
          setMark(data.annotations?.[sessionId] ?? {});
        }).catch(() => {});
        fetch('/api/session-hub/list').then((r) => r.json()).then((data) => {
          setArchived((data.sessions ?? []).find((item) => item.id === sessionId)?.archived === true);
        }).catch(() => {});
      }, [sessionId]);
      const archive = async () => {
        try {
          const next = !archived;
          const response = await fetch('/api/session-hub/archive', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: sessionId, archived: next }),
          });
          if (!response.ok) throw new Error((await response.json()).error);
          setArchived(next);
        } catch (error) { console.warn('dsh-session: archive failed', error); }
      };
      const toggle = async (patch) => {
        try {
          const response = await fetch('/api/session-hub/annotations', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: sessionId, patch }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? response.status);
          setMark(data.annotation ?? {});
        } catch (error) {
          console.warn('dsh-session: annotation failed', error);
        }
      };
      const button = (content, title, onClick, color) => e('button', {
        type: 'button',
        style: { border: 0, background: 'transparent', cursor: 'pointer', padding: '0 6px', margin: 0, minWidth: 28, height: 28, minHeight: 28, fontSize: 12, lineHeight: '18px', color: color ?? 'var(--dsw-alias-label-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', flexShrink: 0, borderRadius: 6 },
        title,
        'aria-label': title,
        onClick,
      }, content);
      return e('div', { style: { display: 'inline-flex', alignItems: 'center', gap: 2, height: 28 } },
        button(mark.favorite ? '★' : '☆', mark.favorite ? '取消收藏' : '收藏', () => toggle({ favorite: !mark.favorite }), mark.favorite ? '#b58900' : undefined),
        button(e(ArchiveIcon, { size: 14 }), archived ? '取消归档' : '归档', archive),
        button(mark.reviewLater ? '◉' : '◷', mark.reviewLater ? '取消待回看' : '待回看', () => toggle({ reviewLater: !mark.reviewLater })),
        button(e(ListIcon, { size: 14 }), '会话管理', () => setManagerOpen(true)),
        button(e(TrashIcon, { size: 14 }), '删除会话', () => setConfirmDelete(true)),
        confirmDelete
          ? e('div', { style: { position: 'fixed', inset: 0, zIndex: 9995, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
            e('div', { style: { background: '#fff', borderRadius: 12, padding: 20, width: 380 } },
              e('div', { style: { fontSize: 14, marginBottom: 16 } }, '删除当前会话到回收站？'),
              e('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
                e('button', { style: s.btn, onClick: () => setConfirmDelete(false) }, '取消'),
                e('button', {
                  style: { ...s.btn, ...s.danger },
                  onClick: async () => {
                    setConfirmDelete(false);
                    try {
                      const response = await fetch('/api/session-hub/move-to-trash', {
                        method: 'POST', headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ id: sessionId, includeChildren: true }),
                      });
                      if (!response.ok) throw new Error((await response.json()).error);
                      window.location.reload();
                    } catch (error) {
                      console.warn('dsh-session: delete failed', error);
                    }
                  },
                }, '确定'))))
          : null);
    }

    let managerOpen = false;
    const listeners = new Set();
    let openSessionRef = () => {};
    const setManagerOpen = (value) => {
      managerOpen = value;
      for (const listener of listeners) listener();
    };

    function ManagerButton(props) {
      const [, force] = React.useReducer((x) => x + 1, 0);
      React.useEffect(() => {
        listeners.add(force);
        return () => listeners.delete(force);
      }, []);
      const wide = props?.wide === true;
      const button = e('button', {
        type: 'button',
        className: wide ? 'shub-footer-wide' : 'shub-footer-rail',
        title: '会话管理',
        'aria-label': '会话管理',
        onClick: () => setManagerOpen(!managerOpen),
      }, wide ? e(React.Fragment, null, e(ListIcon, { size: 14 }), ' 会话与工作区') : e(ListIcon, { size: 16 }));
      const overlay = managerOpen
        ? e('div', {
          style: { position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
        },
        e('div', { style: { background: '#fff', borderRadius: 12, width: 'min(1100px, 94vw)', height: '82vh', overflow: 'auto', padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.3)' } },
          e('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 8 } },
            e('button', { style: s.btn, onClick: () => setManagerOpen(false) }, '关闭')),
          e(Page, { open: openSessionRef })))
        : null;
      return e(React.Fragment, null, button, overlay);
    }

    function apply(ctx) {
      const open = (item) => {
        const workspace = ctx.get?.('uiWorkspace');
        if (workspace?.openSession === undefined) return;
        if (item.parentSession !== undefined) workspace.openSession({ parentSessionId: item.parentSession, childSessionId: item.id, mode: 'continuable' });
        else workspace.openSession(item.id);
      };
      openSessionRef = open;
      try {
        const style = document.createElement('style');
        style.textContent = [
          '.shub-footer-wide{flex:1 1 100%;display:flex;align-items:center;gap:8px;width:calc(100% + 8px);height:34px;margin:4px -4px 4px;padding:6px 2px 6px 10px;box-sizing:border-box;border:none;border-radius:12px;cursor:pointer;overflow:hidden;font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary);background:transparent}',
          '.shub-footer-wide:hover,.shub-footer-wide:focus-visible{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
          '.shub-footer-rail{width:36px;height:36px;padding:0;justify-content:center;border-radius:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:0;display:inline-flex;align-items:center}',
          '[class*=footer]:has(.shub-footer-wide){flex-wrap:wrap;align-content:flex-start;height:auto}',
        ].join('\n');
        document.head.appendChild(style);
        ctx.effect?.(() => () => style.remove());
      } catch {
        // styling is cosmetic
      }
      const injected = () => ({ open });
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'session-hub-header-actions',
        order: 45,
        locale: 'sessions',
        inject: (sessionId) => ({ sessionId }),
      }, HeaderActions));
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'session-hub-footer',
        order: 30,
        locale: 'sessions',
      }, ManagerButton));
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'sessions', order: 72, label: () => '会话', locale: 'sessions', inject: injected,
      }, (props) => e(Boundary, null, e(Page, props))));
      ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab', id: 'sessions', order: 42, label: () => '会话', locale: 'sessions', inject: injected,
      }, (props) => e(Boundary, null, e(Page, props))));
    }

    const module = { exports: { name: 'dsh-session', inject: ['slots'], apply } };
    return module.exports;
  },
});
