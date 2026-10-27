// dsh-session browser half: session/trash/workspace manager, header actions
// and a settings tab. All colors come from the active DSH theme tokens so the
// UI follows light, dark and third-party themes.
window.__ModuleLoader__.load({
  id: '@netcatty/dsh-session',
  factory: (require) => {
    const React = require('react');
    const e = React.createElement;

    const PRESET_LABELS = { standard: '标准', minimal: '精简', ptc: 'PTC', cordis: 'Cordis', daily: '日常' };
    const VIEW_KEY = 'dsh-session.manager-view.v1';
    const VIEW_DEFAULTS = {
      tab: 'sessions', workspaceFilter: 'all', archiveFilter: 'all', favoriteFilter: 'all',
      reviewFilter: 'all', priorityFilter: 'all', tagFilter: 'all', sort: 'updated-desc',
      showEmpty: false, trashWorkspaceFilter: 'all',
    };
    function readStoredView() {
      try {
        const parsed = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...VIEW_DEFAULTS };
        const view = { ...VIEW_DEFAULTS, ...parsed };
        if (!['sessions', 'trash', 'workspaces'].includes(view.tab)) view.tab = 'sessions';
        view.showEmpty = view.showEmpty === true;
        return view;
      } catch {
        return { ...VIEW_DEFAULTS };
      }
    }
    const SCROLL_KEY = 'dsh-session.manager-scroll.v1';
    function readStoredScroll() {
      try {
        const parsed = JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? '{}');
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    function persistScroll(positions) {
      try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify(positions)); } catch { /* storage unavailable */ }
    }

    const C = {
      bg: 'var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, #fff))',
      base: 'var(--dsw-alias-bg-base, #fff)',
      layer1: 'var(--dsw-alias-bg-layer-1, #fff)',
      layer2: 'var(--dsw-alias-bg-layer-2, #f6f7f9)',
      border1: 'var(--dsw-alias-border-l1, #e5e7eb)',
      border2: 'var(--dsw-alias-border-l2, #d1d5db)',
      text: 'var(--dsw-alias-label-primary, #111827)',
      muted: 'var(--dsw-alias-label-secondary, #6b7280)',
      brand: 'var(--dsw-alias-brand-primary, #2563eb)',
      business: 'var(--dsw-alias-state-business-primary, #4176e6)',
      error: 'var(--dsw-alias-state-error-primary, #d93025)',
      warn: 'var(--dsw-alias-state-warn-primary, #b58900)',
      success: 'var(--dsw-alias-state-success-primary, #188038)',
    };

    function ensureStyles() {
      if (typeof document === 'undefined' || document.getElementById('dsh-session-style')) return;
      const style = document.createElement('style');
      style.id = 'dsh-session-style';
      style.textContent = `
.dshs-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}
.dshs-modal{background:${C.bg};color:${C.text};border:1px solid ${C.border1};border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.32);max-height:92vh;display:flex;flex-direction:column;overflow:hidden}
.dshs-modal-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid ${C.border1};font-size:15px;font-weight:650}
.dshs-modal-body{padding:16px 18px;overflow:auto}
.dshs-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid ${C.border1}}
.dshs-root{background:${C.bg};color:${C.text};display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px}
.dshs-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid ${C.border1};flex-wrap:wrap}
.dshs-title{font-size:17px;font-weight:650;white-space:nowrap;display:flex;align-items:center;gap:8px}
.dshs-tabs{display:flex;gap:4px;background:${C.layer2};border:1px solid ${C.border1};border-radius:9px;padding:3px}
.dshs-tab{border:0;background:transparent;color:${C.muted};border-radius:7px;padding:5px 11px;font-size:12px;cursor:pointer}
.dshs-tab.is-active{background:${C.layer1};color:${C.text};box-shadow:0 1px 2px rgba(0,0,0,.12)}
.dshs-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid ${C.border1};background:${C.base}}
.dshs-list{flex:1;overflow:auto;padding:8px 18px 18px;min-height:0}
.dshs-input,.dshs-select,.dshs-textarea{border:1px solid ${C.border2};border-radius:8px;background:${C.layer1};color:${C.text};padding:6px 9px;font-size:12px;outline:none;box-sizing:border-box}
.dshs-input:focus,.dshs-select:focus,.dshs-textarea:focus{border-color:${C.brand}}
.dshs-textarea{width:100%;min-height:92px;resize:vertical;font-family:inherit}
.dshs-input::placeholder,.dshs-textarea::placeholder{color:${C.muted}}
.dshs-btn{border:1px solid ${C.border2};border-radius:8px;background:${C.layer1};color:${C.text};padding:5px 10px;font-size:12px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}
.dshs-btn:hover:not(:disabled){border-color:${C.brand}}
.dshs-btn.primary{background:${C.brand};border-color:${C.brand};color:#fff}
.dshs-btn.danger{color:${C.error};border-color:${C.error}}
.dshs-btn.ghost{background:transparent;border-color:transparent;color:${C.muted};padding:4px 6px}
.dshs-btn.ghost:hover{background:${C.layer2};color:${C.text}}
.dshs-btn:disabled{opacity:.45;cursor:not-allowed}
.dshs-icon-btn{border:0;background:transparent;color:${C.muted};width:28px;height:28px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.dshs-icon-btn:hover{background:${C.layer2};color:${C.text}}
.dshs-icon-btn.is-on{color:${C.warn}}
.dshs-icon-btn.is-danger{color:${C.error}}
.dshs-icon-btn.is-danger:hover{background:color-mix(in srgb, ${C.error} 12%, transparent);color:${C.error}}
.dshs-group{margin-top:8px}
.dshs-group-head{display:flex;align-items:center;gap:8px;padding:7px 4px;color:${C.muted};font-size:12px;font-weight:600}
.dshs-group-body{border-left:2px solid ${C.border1};margin-left:8px;padding-left:12px}
.dshs-row{border:1px solid ${C.border1};border-radius:11px;padding:10px 12px;margin-bottom:8px;background:${C.layer1};content-visibility:auto;contain-intrinsic-size:auto 110px}
.dshs-row.is-nested{margin-left:26px;background:${C.base}}
.dshs-row-main{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dshs-row-title{font-size:13px;font-weight:650;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:52ch}
.dshs-meta{color:${C.muted};font-size:11px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dshs-preview{color:${C.muted};font-size:12px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshs-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:${C.muted};margin-top:3px;word-break:break-all}
.dshs-chip{font-size:10px;line-height:1.6;border-radius:999px;padding:0 7px;background:${C.layer2};color:${C.text};border:1px solid ${C.border1}}
.dshs-badge{font-size:10px;border-radius:999px;padding:1px 7px;border:1px solid transparent}
.dshs-badge.live{color:${C.success};border-color:${C.success}}
.dshs-badge.run{color:${C.warn};border-color:${C.warn}}
.dshs-badge.archived{color:${C.warn};border-color:${C.warn}}
.dshs-badge.warn{color:${C.error};border-color:${C.error}}
.dshs-badge.priority{color:${C.brand};border-color:${C.brand}}
.dshs-badge.sub{color:${C.business};border-color:${C.business};background:color-mix(in srgb, ${C.business} 10%, transparent)}
.dshs-actions{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:7px}
.dshs-empty{color:${C.muted};padding:32px 8px;text-align:center;font-size:13px}
.dshs-error{color:${C.error};background:color-mix(in srgb, ${C.error} 10%, transparent);border:1px solid ${C.error};border-radius:8px;padding:7px 10px;font-size:12px;margin:8px 0}
.dshs-footer{display:flex;align-items:center;gap:8px;padding:8px 18px;border-top:1px solid ${C.border1};color:${C.muted};font-size:11px;flex-wrap:wrap}
.dshs-footer-stat{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border:1px solid ${C.border1};border-radius:999px;background:${C.layer2};white-space:nowrap}
.dshs-footer-stat b{color:${C.text};font-weight:650}
.dshs-row-actions{display:flex;align-items:center;gap:4px;margin-left:auto}
.dshs-check{width:14px;height:14px;margin:0;accent-color:${C.brand};cursor:pointer}
.dshs-select.small{max-width:84px;padding:3px 5px;font-size:11px}
.dshs-result-group{border:1px solid ${C.border1};border-radius:9px;padding:9px 11px;margin-bottom:8px}
.dshs-result-group b{font-size:12px}
.dshs-result-item{font-size:11px;color:${C.muted};margin-top:3px;word-break:break-all}
.dshs-toasts{position:fixed;right:18px;bottom:18px;z-index:10050;display:flex;flex-direction:column;gap:8px;max-width:420px}
.dshs-progress{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:10055;width:min(360px,calc(100vw - 36px));box-sizing:border-box;padding:10px 12px;border:1px solid ${C.border1};border-radius:10px;background:${C.bg};box-shadow:0 10px 30px rgba(0,0,0,.22)}
.dshs-progress-label{font-size:12px;color:${C.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:7px}
.dshs-progress-track{height:5px;border-radius:999px;background:${C.layer2};overflow:hidden}
.dshs-progress-fill{height:100%;border-radius:999px;background:${C.business};transition:width .2s ease}
.dshs-menu{position:absolute;right:0;top:31px;z-index:10060;min-width:168px;padding:4px;border:1px solid ${C.border1};border-radius:9px;background:${C.bg};box-shadow:0 10px 30px rgba(0,0,0,.22)}
.dshs-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:${C.text};padding:7px 9px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap}
.dshs-menu button:hover{background:${C.layer2}}
.dshs-menu button:disabled{opacity:.45;cursor:not-allowed}
.dshs-toast{background:${C.bg};color:${C.text};border:1px solid ${C.border1};border-left:3px solid ${C.brand};border-radius:9px;padding:9px 12px;font-size:12px;box-shadow:0 10px 30px rgba(0,0,0,.22)}
.dshs-toast.error{border-left-color:${C.error}}
.dshs-toast.success{border-left-color:${C.success}}
.dshs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.dshs-card{border:1px solid ${C.border1};border-radius:10px;padding:12px;background:${C.layer1}}
.dshs-kv{font-size:11px;color:${C.muted};margin-top:4px;word-break:break-all}
.dshs-big{font-size:20px;font-weight:650;margin-top:2px}
.shub-footer-wide{flex:1 1 100%;display:flex;align-items:center;gap:8px;width:calc(100% + 8px);height:34px;margin:4px -4px;padding:6px 2px 6px 10px;box-sizing:border-box;border:none;border-radius:12px;cursor:pointer;overflow:hidden;font-size:14px;line-height:22px;color:${C.muted};background:transparent}
.shub-footer-wide:hover,.shub-footer-wide:focus-visible{color:${C.text};background:${C.layer2}}
.shub-footer-rail{width:36px;height:36px;padding:0;justify-content:center;border-radius:12px;color:${C.muted};cursor:pointer;background:transparent;border:0;display:inline-flex;align-items:center}
.shub-footer-rail:hover{background:${C.layer2};color:${C.text}}
[class*=footer]:has(.shub-footer-wide){flex-wrap:wrap;align-content:flex-start;height:auto}
.dshs-dir-list{display:flex;flex-direction:column;border:1px solid ${C.border1};border-radius:9px;max-height:280px;overflow:auto;background:${C.base};padding:2px 4px}
.dshs-dir-row{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;border:0;border-radius:6px;background:transparent;color:${C.text};text-align:left;padding:7px 8px;cursor:pointer;font-size:12px;box-sizing:border-box}
.dshs-dir-row:hover{background:${C.layer2}}
.dshs-dir-row + .dshs-dir-row{border-top:1px solid ${C.border1}}
.dshs-dir-row > span{min-width:0;display:flex;align-items:center;gap:8px}
.dshs-backdrop{background:color-mix(in srgb,#000 32%,transparent);backdrop-filter:blur(4px)}
.dshs-modal{border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.34),0 0 0 1px color-mix(in srgb,${C.border1} 75%,transparent)}
.dshs-root{background:radial-gradient(900px 360px at 8% -12%,color-mix(in srgb,${C.business} 14%,transparent),transparent 62%),radial-gradient(700px 300px at 100% 108%,color-mix(in srgb,${C.business} 7%,transparent),transparent 64%),linear-gradient(180deg,color-mix(in srgb,${C.layer2} 60%,${C.base}),${C.base} 38%)}
.dshs-head{background:color-mix(in srgb,${C.layer1} 78%,${C.base});border-bottom-color:color-mix(in srgb,${C.border1} 75%,transparent)}
.dshs-title{letter-spacing:-.01em}
.dshs-tabs{background:color-mix(in srgb,${C.layer2} 78%,${C.base});border-color:color-mix(in srgb,${C.border1} 80%,transparent)}
.dshs-tab.is-active{color:${C.business};background:${C.layer1};box-shadow:0 1px 3px rgba(0,0,0,.10)}
.dshs-toolbar{background:color-mix(in srgb,${C.layer2} 38%,${C.base});border-bottom-color:color-mix(in srgb,${C.border1} 70%,transparent)}
.dshs-list{padding:12px 18px 24px;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,${C.muted} 35%,transparent) transparent}
.dshs-input,.dshs-select,.dshs-textarea{border-color:color-mix(in srgb,${C.border1} 90%,${C.border2});background:color-mix(in srgb,${C.layer1} 92%,${C.base});box-shadow:0 1px 1px rgba(0,0,0,.03)}
.dshs-input:focus,.dshs-select:focus,.dshs-textarea:focus{border-color:${C.business};box-shadow:0 0 0 3px color-mix(in srgb,${C.business} 16%,transparent)}
.dshs-btn{border-color:color-mix(in srgb,${C.border1} 90%,${C.border2});background:color-mix(in srgb,${C.layer1} 94%,${C.base});box-shadow:0 1px 1px rgba(0,0,0,.03)}
.dshs-btn:hover:not(:disabled){border-color:color-mix(in srgb,${C.business} 45%,${C.border1});background:${C.layer1}}
.dshs-btn.primary{background:${C.business};border-color:${C.business};box-shadow:0 2px 8px color-mix(in srgb,${C.business} 28%,transparent)}
.dshs-btn.primary:hover:not(:disabled){filter:brightness(1.05)}
.dshs-btn.danger{background:color-mix(in srgb,${C.error} 5%,${C.layer1})}
.dshs-row{background:color-mix(in srgb,${C.layer1} 97%,${C.business} 3%);border-color:color-mix(in srgb,${C.border1} 82%,transparent);border-radius:14px;padding:12px 14px;margin-bottom:10px;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease}
.dshs-row:hover{border-color:color-mix(in srgb,${C.business} 38%,${C.border1});box-shadow:0 9px 24px rgba(0,0,0,.10);transform:translateY(-1px)}
.dshs-row:hover .dshs-row-title{color:${C.business}}
.dshs-row.is-nested{background:color-mix(in srgb,${C.layer2} 52%,${C.base});border-style:dashed}
.dshs-row-title{font-size:13.5px;letter-spacing:-.005em}
.dshs-group{margin-top:14px}
.dshs-group-head{padding:8px 4px;color:${C.text};font-weight:650}
.dshs-group-head::before{content:'';width:3px;height:14px;border-radius:999px;background:color-mix(in srgb,${C.business} 65%,transparent);flex:none}
.dshs-group-head .dshs-meta{color:${C.muted};background:${C.layer2};border:1px solid ${C.border1};border-radius:999px;padding:1px 7px;font-weight:500}
.dshs-group-body{border-left:1px dashed color-mix(in srgb,${C.border2} 70%,transparent);margin-left:10px;padding-left:14px}
.dshs-badge{background:${C.layer2};border-color:color-mix(in srgb,${C.border1} 85%,transparent);font-weight:600}
.dshs-badge.live{background:color-mix(in srgb,${C.success} 11%,transparent);border-color:color-mix(in srgb,${C.success} 42%,transparent)}
.dshs-badge.run{background:color-mix(in srgb,${C.warn} 12%,transparent);border-color:color-mix(in srgb,${C.warn} 42%,transparent)}
.dshs-badge.archived{background:color-mix(in srgb,${C.warn} 10%,transparent);border-color:color-mix(in srgb,${C.warn} 35%,transparent)}
.dshs-badge.sub{background:color-mix(in srgb,${C.business} 11%,transparent);border-color:color-mix(in srgb,${C.business} 42%,transparent)}
.dshs-chip{background:color-mix(in srgb,${C.business} 7%,${C.layer2});border-color:color-mix(in srgb,${C.business} 22%,${C.border1})}
.dshs-footer{background:color-mix(in srgb,${C.layer2} 42%,${C.base});border-top-color:color-mix(in srgb,${C.border1} 75%,transparent);padding:10px 18px}
.dshs-footer-stat{background:color-mix(in srgb,${C.layer1} 80%,${C.base});border-color:color-mix(in srgb,${C.border1} 80%,transparent)}
.dshs-card{background:color-mix(in srgb,${C.layer1} 96%,${C.business} 4%);border-color:color-mix(in srgb,${C.border1} 80%,transparent);box-shadow:0 1px 2px rgba(0,0,0,.035)}
.dshs-note{padding:10px 12px;border-radius:10px;border:1px solid color-mix(in srgb,${C.warn} 26%,${C.border1});background:color-mix(in srgb,${C.warn} 7%,${C.base});color:${C.muted};line-height:1.65;font-size:12px}
.dshs-modal{background:linear-gradient(180deg,color-mix(in srgb,${C.layer1} 96%,${C.business} 4%),${C.base});border-top:3px solid color-mix(in srgb,${C.business} 58%,transparent)}
.dshs-modal-head{background:color-mix(in srgb,${C.layer2} 42%,${C.base});position:relative}
.dshs-modal-head::before{content:'';width:3px;height:16px;border-radius:999px;background:${C.business};flex:none;margin-right:-4px}
.dshs-modal-body{background:color-mix(in srgb,${C.layer2} 18%,${C.base})}
.dshs-modal-foot{background:color-mix(in srgb,${C.layer2} 34%,${C.base})}
.dshs-menu{min-width:190px;padding:6px;border-color:color-mix(in srgb,${C.border1} 80%,transparent);border-radius:12px;background:color-mix(in srgb,${C.layer1} 96%,${C.business} 4%);box-shadow:0 18px 46px rgba(0,0,0,.18);backdrop-filter:blur(10px)}
.dshs-menu button{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;font-size:12px}
.dshs-menu button:hover{background:color-mix(in srgb,${C.business} 10%,${C.layer2});color:${C.business}}
.dshs-menu button:disabled:hover{background:transparent;color:${C.text}}
@media (max-width:760px){.dshs-head{padding:10px 12px}.dshs-toolbar{padding:8px 12px}.dshs-list{padding:6px 12px 14px}.dshs-row-title{max-width:34ch}}
`;
      document.head.appendChild(style);
    }
    ensureStyles();

    // ---------------------------------------------------------------- helpers
    async function api(path, body, options = {}) {
      const method = options.method ?? (body === undefined ? 'GET' : 'POST');
      const response = await fetch(`/api/session-hub${path}`, {
        method,
        headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        const error = new Error(data.error ?? `HTTP ${response.status}`);
        error.code = data.code;
        error.status = response.status;
        throw error;
      }
      return data;
    }

    function formatTime(value) {
      if (value === undefined || value === null) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      const now = Date.now();
      const diff = now - date.getTime();
      if (diff >= 0 && diff < 60_000) return '刚刚';
      if (diff >= 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
      if (diff >= 0 && diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
      return date.toLocaleString();
    }

    function formatBytes(bytes) {
      const value = Number(bytes) || 0;
      if (value < 1024) return `${value} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }

    function downloadBlob(blob, name) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function safeName(value, fallback) {
      return (String(value ?? fallback).replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80)) || fallback;
    }

    async function copyText(text) {
      try {
        if (navigator.clipboard?.writeText !== undefined) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch { /* fall through to execCommand */ }
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
      } catch {
        return false;
      }
    }

    function markOf(annotations, id) {
      return annotations[id] ?? { favorite: false, reviewLater: false, tags: [], note: '', priority: null, revision: 0 };
    }

    const bus = new EventTarget();
    let channel;
    try {
      channel = new BroadcastChannel('dsh-session');
      channel.onmessage = () => bus.dispatchEvent(new Event('change'));
    } catch { /* BroadcastChannel unavailable */ }
    function emitChange() {
      bus.dispatchEvent(new Event('change'));
      try { channel?.postMessage({ at: Date.now() }); } catch { /* ignore */ }
    }

    const toastStore = { items: [], listeners: new Set() };
    function emitToast() { for (const listener of toastStore.listeners) listener(); }
    function showToast(message, type = 'info') {
      const id = Math.random().toString(36).slice(2);
      toastStore.items = [...toastStore.items, { id, message, type }];
      emitToast();
      setTimeout(() => {
        toastStore.items = toastStore.items.filter((item) => item.id !== id);
        emitToast();
      }, 4200);
    }

    function Toasts() {
      const [, force] = React.useReducer((x) => x + 1, 0);
      React.useEffect(() => {
        toastStore.listeners.add(force);
        return () => toastStore.listeners.delete(force);
      }, []);
      return e('div', { className: 'dshs-toasts' }, toastStore.items.map((item) => e('div', {
        key: item.id, className: `dshs-toast ${item.type}`, role: 'status',
      }, item.message)));
    }

    const managerStore = {
      open: false,
      listeners: new Set(),
      set(open) {
        managerStore.open = open;
        for (const listener of managerStore.listeners) listener();
      },
      toggle() { managerStore.set(!managerStore.open); },
    };
    function useManagerOpen() {
      const [open, setOpen] = React.useState(managerStore.open);
      React.useEffect(() => {
        const listener = () => setOpen(managerStore.open);
        managerStore.listeners.add(listener);
        return () => managerStore.listeners.delete(listener);
      }, []);
      return open;
    }

    let openSessionRef = () => {};
    let startNewSessionRef = () => {};
    let refreshHostRef = async () => {};
    let pickDirectoryRef = async () => null;
    let listDirectoryRef = async () => null;
    let createDirectoryRef = async () => null;
    let officialFlowRef = () => null;
    let subscribeWorkspaceStateRef = () => () => {};

    const directoryFlowState = { open: false, busy: false, onPicked: null, onCancel: null, onError: null };
    const directoryFlowSubs = new Set();
    function setDirectoryFlow(patch) {
      Object.assign(directoryFlowState, patch);
      for (const fn of [...directoryFlowSubs]) fn();
    }
    function useDirectoryFlowState() {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const fn = () => force((value) => value + 1);
        directoryFlowSubs.add(fn);
        return () => directoryFlowSubs.delete(fn);
      }, []);
      return directoryFlowState;
    }
    function openOfficialDirectory(handlers) {
      const flow = officialFlowRef();
      if (flow === null || flow === undefined) return false;
      setDirectoryFlow({ open: true, busy: false, ...handlers });
      return true;
    }

    async function refreshHost() {
      try { await refreshHostRef(); } catch { /* ignore */ }
    }

    // ---------------------------------------------------------------- icons
    function Icon({ name, size = 15, rotate = 0 }) {
      const common = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', style: { display: 'block', transform: rotate ? `rotate(${rotate}deg)` : undefined, transition: 'transform .15s ease' } };
      if (name === 'caret-right') return e('svg', common, e('path', { d: 'M6 4l4 4-4 4z', fill: 'currentColor', stroke: 'none' }));
      if (name === 'caret-down') return e('svg', common, e('path', { d: 'M4 6l4 4 4-4z', fill: 'currentColor', stroke: 'none' }));
      if (name === 'caret-up') return e('svg', common, e('path', { d: 'M4 10l4-4 4 4z', fill: 'currentColor', stroke: 'none' }));
      if (name === 'folder') return e('svg', common, e('path', { d: 'M2.5 4.5h4l1.2 1.5h5.8v7.5h-11z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }));
      if (name === 'workspace') return e('svg', common, e('rect', { x: 2.5, y: 2.5, width: 11, height: 11, rx: 1.2, stroke: 'currentColor', strokeWidth: 1.3 }), e('path', { d: 'M6 8h4M8 6l2 2-2 2', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }));
      if (name === 'pin') return e('svg', common, e('path', { d: 'M9.5 2.5l4 4-2.2.6-2.3 2.3.4 2.6-1.1 1.1-3.9-3.9 1.1-1.1 2.6.4 2.3-2.3z', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }));
      if (name === 'list') return e('svg', common, e('path', { d: 'M3 4h10M3 8h10M3 12h6', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }));
      if (name === 'trash') return e('svg', common, e('path', { d: 'M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }));
      if (name === 'star') return e('svg', common, e('path', { d: 'M8 2.2l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11l-3.5 1.9.8-3.9L2.4 6.3l3.9-.5L8 2.2z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }));
      if (name === 'clock') return e('svg', common, e('circle', { cx: 8, cy: 8, r: 5.8, stroke: 'currentColor', strokeWidth: 1.4 }), e('path', { d: 'M8 4.8V8l2.2 1.4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }));
      if (name === 'archive') return e('svg', common, e('path', { d: 'M2.5 4.5h11v9h-11z', stroke: 'currentColor', strokeWidth: 1.4 }), e('path', { d: 'M2 2.5h12v2H2z', stroke: 'currentColor', strokeWidth: 1.4 }), e('path', { d: 'M6.5 7.5h3', stroke: 'currentColor', strokeWidth: 1.4 }));
      if (name === 'copy') return e('svg', common, e('rect', { x: 5, y: 5, width: 8, height: 8, rx: 1.5, stroke: 'currentColor', strokeWidth: 1.3 }), e('path', { d: 'M3 10.5V3h7', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }));
      if (name === 'tag') return e('svg', common, e('path', { d: 'M3 3h5l5 5-5 5-5-5V3z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }), e('circle', { cx: 5.5, cy: 5.5, r: 1, fill: 'currentColor' }));
      if (name === 'move') return e('svg', common, e('path', { d: 'M2.5 8h8M8.5 5l3 3-3 3', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }), e('path', { d: 'M3 3.5h6v2', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }));
      if (name === 'preset') return e('svg', common, e('path', { d: 'M3 5h8M9 3l2 2-2 2M13 11H5M7 9l-2 2 2 2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }));
      if (name === 'pencil') return e('svg', common, e('path', { d: 'M3 11.5l1-3.5 6.2-6.2 2.5 2.5L6.5 10.5 3 11.5zM9.5 3.2l2.5 2.5', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }));
      if (name === 'more') return e('svg', common, e('circle', { cx: 3, cy: 8, r: 1.2, fill: 'currentColor' }), e('circle', { cx: 8, cy: 8, r: 1.2, fill: 'currentColor' }), e('circle', { cx: 13, cy: 8, r: 1.2, fill: 'currentColor' }));
      if (name === 'download') return e('svg', common, e('path', { d: 'M8 2.5v7M5 7l3 3 3-3M3 12.5h10', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }));
      if (name === 'refresh') return e('svg', common, e('path', { d: 'M13 8a5 5 0 1 1-1.5-3.5M13 2.5V6h-3.5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }));
      if (name === 'close') return e('svg', common, e('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }));
      if (name === 'chevron') return e('svg', common, e('path', { d: 'M6 4l4 4-4 4', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }));
      if (name === 'open') return e('svg', common, e('path', { d: 'M6 3h7v7M13 3L7.5 8.5M4 5v7h7v-2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }));
      if (name === 'check') return e('svg', common, e('path', { d: 'M3 8.5l3.2 3L13 4.8', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }));
      return e('span', null);
    }

    function Button({ children, variant, onClick, disabled, title, style }) {
      return e('button', {
        type: 'button',
        className: `dshs-btn${variant === 'primary' ? ' primary' : variant === 'danger' ? ' danger' : variant === 'ghost' ? ' ghost' : ''}`,
        onClick,
        disabled,
        title,
        style,
      }, children);
    }

    function IconButton({ name, title, onClick, on, disabled, rotate, danger }) {
      return e('button', {
        type: 'button',
        className: `dshs-icon-btn${on ? ' is-on' : ''}${danger ? ' is-danger' : ''}`,
        title,
        'aria-label': title,
        onClick,
        disabled: disabled === true,
      }, e(Icon, { name, rotate }));
    }

    // ---------------------------------------------------------------- modal
    function Modal({ title, children, footer, onClose, width = 520 }) {
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape' && typeof onClose === 'function') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [onClose]);
      return e('div', {
        className: 'dshs-backdrop',
        onMouseDown: (event) => { if (event.target === event.currentTarget && typeof onClose === 'function') onClose(); },
      }, e('div', {
        className: 'dshs-modal',
        style: { width: `min(${width}px, 96vw)` },
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
      },
      e('div', { className: 'dshs-modal-head' }, title, e('span', { style: { marginLeft: 'auto' } }, e(IconButton, { name: 'close', title: '关闭', onClick: onClose }))),
      e('div', { className: 'dshs-modal-body' }, children),
      footer === undefined ? null : e('div', { className: 'dshs-modal-foot' }, footer)));
    }

    class ErrorBoundary extends React.Component {
      constructor(props) { super(props); this.state = { error: '' }; }
      static getDerivedStateFromError(error) { return { error: error instanceof Error ? error.message : String(error) }; }
      render() {
        if (this.state.error !== '') {
          return e('div', { className: 'dshs-error', style: { margin: 16 } }, `会话管理渲染失败：${this.state.error}`);
        }
        return this.props.children;
      }
    }

    // ---------------------------------------------------------------- annotation editor
    function AnnotationEditor({ id, title, preview, mark, onClose, onSaved }) {
      const [tags, setTags] = React.useState((mark.tags ?? []).join(', '));
      const [note, setNote] = React.useState(mark.note ?? '');
      const [priority, setPriority] = React.useState(mark.priority === null || mark.priority === undefined ? '' : String(mark.priority));
      const [revision, setRevision] = React.useState(mark.revision ?? 0);
      const [busy, setBusy] = React.useState(false);
      const [importing, setImporting] = React.useState(false);
      const [error, setError] = React.useState('');
      const save = async () => {
        setBusy(true);
        setError('');
        try {
          const parsedTags = tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
          const data = await api('/annotations', {
            id,
            patch: {
              tags: parsedTags,
              note,
              priority: priority === '' ? null : Number(priority),
            },
            expectedRevision: revision,
          });
          onSaved?.(data.annotation);
          emitChange();
          onClose();
        } catch (err) {
          setError(err.message ?? String(err));
        } finally {
          setBusy(false);
        }
      };
      const reload = async () => {
        try {
          const data = await api('/annotations');
          const latest = data.annotations?.[id] ?? {};
          setTags((latest.tags ?? []).join(', '));
          setNote(latest.note ?? '');
          setPriority(latest.priority === null || latest.priority === undefined ? '' : String(latest.priority));
          setRevision(latest.revision ?? 0);
          setError('');
        } catch (err) {
          setError(err.message ?? String(err));
        }
      };
      const buildPrompt = () => [
        '请整理下面的 DeepSeek Harness 会话，只输出一个 JSON 对象，不要解释：',
        '{"tags":["标签1","标签2"],"note":"一句话备注","priority":3}',
        '规则：tags 最多 20 个、每个不超过 32 字符；note 不超过 2000 字符；priority 为 1–5（1 最高，5 最低）。',
        `会话 ID：${id}`,
        `会话标题：${title ?? '（无标题）'}`,
        `会话预览：${preview ?? '（无预览）'}`,
        `现有标签：${(mark.tags ?? []).join(', ') || '（无）'}`,
        `现有备注：${mark.note || '（无）'}`,
      ].join('\n');

      const copyPrompt = async () => {
        const ok = await copyText(buildPrompt());
        showToast(ok ? '已复制整理 Prompt' : '复制失败，请手动复制', ok ? 'success' : 'error');
      };

      const applyImport = (text) => {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start < 0 || end < start) throw new Error('没有找到 JSON 对象');
        const data = JSON.parse(text.slice(start, end + 1));
        if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('JSON 必须是对象');
        let nextTags = data.tags;
        if (typeof nextTags === 'string') nextTags = nextTags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
        if (nextTags !== undefined && !Array.isArray(nextTags)) throw new Error('tags 必须是数组');
        if (Array.isArray(nextTags)) setTags(nextTags.filter((tag) => typeof tag === 'string').slice(0, 20).join(', '));
        if (data.note !== undefined) {
          if (typeof data.note !== 'string') throw new Error('note 必须是字符串');
          setNote(data.note.slice(0, 2000));
        }
        if (data.priority !== undefined) {
          if (data.priority !== null && (!Number.isInteger(data.priority) || data.priority < 1 || data.priority > 5)) {
            throw new Error('priority 必须是 1–5 的整数或 null');
          }
          setPriority(data.priority === null ? '' : String(data.priority));
        }
        showToast('已导入，检查后点保存', 'success');
      };

      return e(Modal, {
        title: `标签 / 备注 · ${title ?? id}`,
        onClose: busy ? undefined : onClose,
        width: 560,
        footer: e(React.Fragment, null,
          e(Button, { onClick: onClose, disabled: busy }, '取消'),
          e(Button, { variant: 'primary', onClick: save, disabled: busy }, busy ? '保存中…' : '保存')),
      },
      e('div', { className: 'dshs-actions', style: { marginBottom: 10 } },
        e(Button, { onClick: copyPrompt }, '复制整理 Prompt'),
        e(Button, { onClick: () => setImporting(true) }, '导入整理结果')),
      e('div', { className: 'dshs-meta', style: { marginBottom: 12 } }, '复制 Prompt 交给任意模型整理，再把返回的 JSON 导入；不会自动调用模型。'),
      e('div', { className: 'dshs-meta', style: { marginBottom: 6 } }, '标签（英文逗号或中文逗号分隔，最多 20 个）'),
      e('input', {
        className: 'dshs-input', style: { width: '100%', marginBottom: 12 }, value: tags,
        onChange: (event) => setTags(event.target.value), placeholder: '例如：工作, 待整理',
      }),
      e('div', { className: 'dshs-meta', style: { marginBottom: 6 } }, '优先级'),
      e('select', {
        className: 'dshs-select', style: { width: '100%', marginBottom: 12 }, value: priority,
        onChange: (event) => setPriority(event.target.value),
      },
      e('option', { value: '' }, '未设置'),
      [1, 2, 3, 4, 5].map((value) => e('option', { key: value, value: String(value) }, `${value} · ${['最高', '高', '普通', '低', '最低'][value - 1]}`))),
      e('div', { className: 'dshs-meta', style: { marginBottom: 6 } }, `备注（${note.length}/2000）`),
      e('textarea', {
        className: 'dshs-textarea', value: note,
        onChange: (event) => setNote(event.target.value.slice(0, 2000)), placeholder: '仅保存在本机',
      }),
      error === '' ? null : e('div', { className: 'dshs-error' }, error,
        e('button', { className: 'dshs-btn ghost', style: { marginLeft: 8 }, onClick: reload }, '载入最新内容')),
      importing ? e(JsonImportDialog, {
        onClose: () => setImporting(false),
        onImport: (text) => { applyImport(text); setImporting(false); },
      }) : null);
    }

    function JsonImportDialog({ onClose, onImport }) {
      const [text, setText] = React.useState('');
      const [error, setError] = React.useState('');
      const run = () => {
        try { onImport(text); }
        catch (err) { setError(err instanceof Error ? err.message : String(err)); }
      };
      return e(Modal, {
        title: '导入整理结果',
        onClose,
        width: 560,
        footer: e(React.Fragment, null,
          e(Button, { onClick: onClose }, '取消'),
          e(Button, { variant: 'primary', onClick: run, disabled: text.trim() === '' }, '导入')),
      },
      e('div', { className: 'dshs-meta', style: { marginBottom: 8 } }, '粘贴模型返回的 JSON（可包含 Markdown 代码块）：'),
      e('textarea', {
        className: 'dshs-textarea', style: { minHeight: 180 }, value: text,
        onChange: (event) => setText(event.target.value),
        placeholder: '{"tags":["工作"],"note":"待整理","priority":3}',
      }),
      error === '' ? null : e('div', { className: 'dshs-error' }, error));
    }

    // ---------------------------------------------------------------- move / preset dialogs
    function MoveDialog({ ids, titles, currentWorkspaceId, onClose, onDone }) {
      const [workspaces, setWorkspaces] = React.useState([]);
      const [target, setTarget] = React.useState('');
      const [includeChildren, setIncludeChildren] = React.useState(true);
      const [busy, setBusy] = React.useState(false);
      const [importing, setImporting] = React.useState(false);
      const [progress, setProgress] = React.useState(null);
      const [error, setError] = React.useState('');
      React.useEffect(() => {
        api('/workspaces').then((data) => {
          const list = (data.workspaces ?? []).filter((item) => item.id !== currentWorkspaceId);
          setWorkspaces(list);
          setTarget(list[0]?.id ?? '');
        }).catch((err) => setError(err.message ?? String(err)));
      }, [currentWorkspaceId]);
      const run = async () => {
        if (target === '') return;
        setBusy(true);
        setError('');
        try {
          if (ids.length === 1) {
            await api('/move', { id: ids[0], workspaceId: target, includeChildren });
          } else {
            const succeeded = [];
            const failed = [];
            for (let index = 0; index < ids.length; index += 1) {
              setProgress({ label: titles[index] ?? ids[index], current: index + 1, total: ids.length });
              try {
                await api('/move', { id: ids[index], workspaceId: target, includeChildren });
                succeeded.push(ids[index]);
              } catch (err) {
                failed.push({ id: ids[index], reason: err instanceof Error ? err.message : String(err) });
              }
            }
            if (failed.length > 0) {
              throw new Error(`已移动 ${succeeded.length} 个，失败 ${failed.length} 个：${failed.map((item) => item.reason).join('；')}`);
            }
          }
          emitChange();
          await refreshHost();
          showToast(`已移动 ${ids.length} 个会话`, 'success');
          onDone?.();
          onClose();
        } catch (err) {
          setError(err.message ?? String(err));
          if (ids.length > 1) onDone?.();
        } finally {
          setProgress(null);
          setBusy(false);
        }
      };
      return e(Modal, {
        title: ids.length === 1 ? `移动到工作区 · ${titles[0] ?? ids[0]}` : `移动 ${ids.length} 个会话`,
        onClose: busy ? undefined : onClose,
        footer: e(React.Fragment, null,
          e(Button, { onClick: onClose, disabled: busy }, '取消'),
          e(Button, { variant: 'primary', onClick: run, disabled: busy || target === '' }, busy ? '移动中…' : '移动')),
      },
      workspaces.length === 0
        ? e('div', { className: 'dshs-empty' }, '没有其他工作区')
        : e('select', {
          className: 'dshs-select', style: { width: '100%', marginBottom: 12 }, value: target,
          onChange: (event) => setTarget(event.target.value),
        }, workspaces.map((workspace) => e('option', { key: workspace.id, value: workspace.id }, `${workspace.title ?? workspace.path} · ${workspace.path}`))),
      ids.length > 1 ? e('div', { className: 'dshs-meta', style: { marginBottom: 8 } },
        `将移动：${titles.slice(0, 5).join('、')}${titles.length > 5 ? ' 等' : ''}`) : null,
      progress === null ? null : e('div', { style: { marginBottom: 10 } },
        e('div', { className: 'dshs-meta' }, `${progress.label} · ${progress.current}/${progress.total}`),
        e('div', { className: 'dshs-progress-track' },
          e('div', { className: 'dshs-progress-fill', style: { width: `${Math.max(4, Math.round((progress.current / Math.max(1, progress.total)) * 100))}%` } }))),
      e('label', { className: 'dshs-meta', style: { display: 'flex', alignItems: 'center', gap: 6 } },
        e('input', { type: 'checkbox', className: 'dshs-check', checked: includeChildren, onChange: (event) => setIncludeChildren(event.target.checked) }),
        '同时移动子会话'),
      e('div', { className: 'dshs-meta', style: { marginTop: 10 } }, '移动会重写会话头里的 cwd，并同步工作区归属；已打开的会话会先停止并关闭，然后移动。'),
      error === '' ? null : e('div', { className: 'dshs-error' }, error));
    }

    function PresetDialog({ ids, titles, onClose, onDone }) {
      const [presets, setPresets] = React.useState([]);
      const [target, setTarget] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [importing, setImporting] = React.useState(false);
      const [progress, setProgress] = React.useState(null);
      const [error, setError] = React.useState('');
      React.useEffect(() => {
        api('/presets').then((data) => {
          const list = (data.presets ?? []).filter((item) => item.broken === undefined);
          setPresets(list);
          setTarget(list[0]?.id ?? '');
        }).catch((err) => setError(err.message ?? String(err)));
      }, []);
      const run = async () => {
        if (target === '') return;
        setBusy(true);
        setError('');
        try {
          if (ids.length === 1) await api('/preset-migrate', { id: ids[0], toPreset: target });
          else {
            const succeeded = [];
            const failed = [];
            for (let index = 0; index < ids.length; index += 1) {
              setProgress({ label: titles[index] ?? ids[index], current: index + 1, total: ids.length });
              try {
                await api('/preset-migrate', { id: ids[index], toPreset: target });
                succeeded.push(ids[index]);
              } catch (err) {
                failed.push({ id: ids[index], reason: err instanceof Error ? err.message : String(err) });
              }
            }
            if (failed.length > 0) {
              throw new Error(`已迁移 ${succeeded.length} 个，失败 ${failed.length} 个：${failed.map((item) => item.reason).join('；')}`);
            }
          }
          emitChange();
          showToast(`已迁移 ${ids.length} 个会话的 Agent 预设`, 'success');
          onDone?.();
          onClose();
        } catch (err) {
          setError(err.message ?? String(err));
          if (ids.length > 1) onDone?.();
        } finally {
          setProgress(null);
          setBusy(false);
        }
      };
      return e(Modal, {
        title: ids.length === 1 ? `迁移 Agent 预设 · ${titles[0] ?? ids[0]}` : `迁移 ${ids.length} 个会话的预设`,
        onClose: busy ? undefined : onClose,
        footer: e(React.Fragment, null,
          e(Button, { onClick: onClose, disabled: busy }, '取消'),
          e(Button, { variant: 'primary', onClick: run, disabled: busy || target === '' }, busy ? '迁移中…' : '迁移')),
      },
      presets.length === 0
        ? e('div', { className: 'dshs-empty' }, '没有可用预设')
        : e('select', {
          className: 'dshs-select', style: { width: '100%', marginBottom: 12 }, value: target,
          onChange: (event) => setTarget(event.target.value),
        }, presets.map((preset) => e('option', { key: preset.id, value: preset.id }, `${preset.name ?? PRESET_LABELS[preset.id] ?? preset.id} · ${preset.id}`))),
      ids.length > 1 ? e('div', { className: 'dshs-meta', style: { marginBottom: 8 } },
        `将迁移：${titles.slice(0, 5).join('、')}${titles.length > 5 ? ' 等' : ''}`) : null,
      progress === null ? null : e('div', { style: { marginBottom: 10 } },
        e('div', { className: 'dshs-meta' }, `${progress.label} · ${progress.current}/${progress.total}`),
        e('div', { className: 'dshs-progress-track' },
          e('div', { className: 'dshs-progress-fill', style: { width: `${Math.max(4, Math.round((progress.current / Math.max(1, progress.total)) * 100))}%` } }))),
      e('div', { className: 'dshs-meta' }, '冷会话会重写最后一条 agent-preset/selected；已打开的会话会追加一条新事件并立即刷新。'),
      error === '' ? null : e('div', { className: 'dshs-error' }, error));
    }

    function BatchTagsDialog({ count, onClose, onRun }) {
      const [value, setValue] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const tags = () => value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
      const run = async (mode) => {
        setBusy(true);
        try { await onRun(mode === 'clear' ? [] : tags(), mode); onClose(); }
        finally { setBusy(false); }
      };
      return e(Modal, {
        title: `批量标签 · ${count} 个会话`,
        onClose: busy ? undefined : onClose,
        footer: e(React.Fragment, null,
          e(Button, { onClick: onClose, disabled: busy }, '取消'),
          e(Button, { onClick: () => run('clear'), disabled: busy }, '清空标签'),
          e(Button, { onClick: () => run('append'), disabled: busy || value.trim() === '' }, '追加'),
          e(Button, { variant: 'primary', onClick: () => run('replace'), disabled: busy || value.trim() === '' }, '替换')),
      },
      e('input', {
        className: 'dshs-input', style: { width: '100%' }, value,
        onChange: (event) => setValue(event.target.value), placeholder: '标签，用逗号分隔',
      }),
      e('div', { className: 'dshs-meta', style: { marginTop: 8 } }, '追加会保留每个会话已有标签；替换会用输入内容覆盖。'));
    }

    function TextPromptDialog({ title, label, initial, placeholder, onClose, onSave }) {
      const [value, setValue] = React.useState(initial ?? '');
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const submit = async () => {
        const next = value.trim();
        if (next === '') { setError('不能为空'); return; }
        setBusy(true);
        setError('');
        try {
          await onSave(next);
          onClose();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      };
      return e(Modal, {
        title,
        onClose: busy ? undefined : onClose,
        width: 460,
        footer: e(React.Fragment, null,
          e(Button, { onClick: onClose, disabled: busy }, '取消'),
          e(Button, { variant: 'primary', onClick: submit, disabled: busy || value.trim() === '' }, busy ? '保存中…' : '保存')),
      },
      e('div', { className: 'dshs-meta', style: { marginBottom: 6 } }, label),
      e('input', {
        className: 'dshs-input', style: { width: '100%' }, value, autoFocus: true,
        placeholder: placeholder ?? '', onChange: (event) => setValue(event.target.value),
        onKeyDown: (event) => { if (event.key === 'Enter') submit(); },
      }),
      error === '' ? null : e('div', { className: 'dshs-error' }, error));
    }

    function WorkspaceCreateDialog({ onClose, onCreated }) {
      const [path, setPath] = React.useState('');
      const [listing, setListing] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [loading, setLoading] = React.useState(false);
      const [showHidden, setShowHidden] = React.useState(false);
      const [creatingFolder, setCreatingFolder] = React.useState(false);
      const [folderName, setFolderName] = React.useState('');
      const [folderBusy, setFolderBusy] = React.useState(false);
      const [error, setError] = React.useState('');

      const browse = async (target) => {
        setLoading(true);
        setError('');
        try {
          const next = await listDirectoryRef(target ?? (path.trim() === '' ? undefined : path.trim()));
          if (next === null || next === undefined) throw new Error('目录浏览不可用，可直接输入绝对路径');
          setListing(next);
          setCreatingFolder(false);
          setFolderName('');
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setLoading(false);
        }
      };

      const createFolder = async () => {
        const name = folderName.trim();
        if (name === '' || listing === null) return;
        setFolderBusy(true);
        setError('');
        try {
          const created = await createDirectoryRef(listing.path, name);
          if (created === null || created === undefined) throw new Error('无法新建文件夹');
          setCreatingFolder(false);
          setFolderName('');
          await browse(listing.path);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setFolderBusy(false);
        }
      };

      const create = async () => {
        const candidate = path.trim();
        if (candidate === '') return;
        setBusy(true);
        setError('');
        try {
          await api('/workspace-create', { path: candidate });
          await refreshHost();
          onCreated?.();
          onClose();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      };

      const openOfficial = () => {
        const opened = openOfficialDirectory({
          onPicked: (picked) => { setDirectoryFlow({ open: false }); setPath(picked); },
          onCancel: () => setDirectoryFlow({ open: false }),
          onError: (message) => { setDirectoryFlow({ open: false }); setError(message); },
        });
        if (!opened) {
          setError('官方目录选择器不可用，已切换到内置浏览');
          browse(undefined);
        }
      };
      const closeListing = () => { setListing(null); setCreatingFolder(false); setFolderName(''); };
      const footer = listing === null
        ? e(React.Fragment, null,
          e(Button, { onClick: onClose, disabled: busy }, '取消'),
          e(Button, { variant: 'primary', onClick: create, disabled: busy || path.trim() === '' }, busy ? '创建中…' : '创建'))
        : e(React.Fragment, null,
          e(Button, { onClick: onClose, disabled: loading }, '取消'),
          e(Button, {
            variant: 'primary',
            onClick: () => { setPath(listing.path); closeListing(); },
            disabled: loading,
          }, '打开'));

      const entries = listing === null ? [] : listing.entries.filter((entry) => showHidden || !entry.hidden);

      return e(Modal, {
        title: listing === null ? '新建工作区' : '选择工作区目录',
        onClose: busy ? undefined : onClose,
        width: 620,
        footer,
      },
      listing === null
        ? e(React.Fragment, null,
          e('div', { className: 'dshs-meta', style: { marginBottom: 8 } }, '直接输入绝对路径，或浏览目录后选择。'),
          e('div', { style: { display: 'flex', gap: 8 } },
            e('input', {
              className: 'dshs-input', style: { flex: 1 }, value: path, autoFocus: true,
              placeholder: '/home/neo/projects/example',
              onChange: (event) => setPath(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter') create(); },
            }),
            e(Button, { onClick: openOfficial, disabled: busy || loading }, loading ? '读取中…' : '浏览目录')))
        : e(React.Fragment, null,
          e('button', {
            type: 'button', className: 'dshs-dir-row', style: { marginBottom: 4 },
            onClick: () => browse(listing.home),
          },
          e('span', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, e(Icon, { name: 'folder', size: 15 }), '主目录'),
          e(Icon, { name: 'chevron', size: 13 })),
          e('div', { className: 'dshs-kv', style: { margin: '6px 0 8px' } }, listing.path),
          e('div', { className: 'dshs-actions', style: { marginBottom: 8 } },
            e(Button, {
              onClick: () => browse(listing.crumbs.length > 1 ? listing.crumbs[listing.crumbs.length - 2].path : listing.home),
              disabled: loading || listing.crumbs.length < 2,
            }, '上一级'),
            e(Button, { onClick: closeListing, disabled: loading }, '返回'),
            e(Button, { onClick: () => setCreatingFolder(true), disabled: loading || folderBusy }, '新建文件夹'),
            e('label', { className: 'dshs-meta', style: { display: 'flex', alignItems: 'center', gap: 5 } },
              e('input', { type: 'checkbox', className: 'dshs-check', checked: showHidden, onChange: (event) => setShowHidden(event.target.checked) }),
              '显示隐藏文件')),
          creatingFolder
            ? e('div', { style: { display: 'flex', gap: 8, marginBottom: 8 } },
              e('input', {
                className: 'dshs-input', style: { flex: 1 }, value: folderName, autoFocus: true,
                placeholder: '新文件夹名称',
                onChange: (event) => setFolderName(event.target.value),
                onKeyDown: (event) => { if (event.key === 'Enter') createFolder(); },
              }),
              e(Button, { variant: 'primary', onClick: createFolder, disabled: folderBusy || folderName.trim() === '' }, folderBusy ? '创建中…' : '创建'),
              e(Button, { onClick: () => { setCreatingFolder(false); setFolderName(''); }, disabled: folderBusy }, '取消'))
            : null,
          e('div', { className: 'dshs-dir-list' },
            entries.length === 0
              ? e('div', { className: 'dshs-empty', style: { padding: 16 } }, '没有子目录')
              : entries.map((entry) => e('button', {
                type: 'button', key: entry.path, className: 'dshs-dir-row',
                title: entry.path, onClick: () => browse(entry.path),
                style: entry.hidden ? { opacity: 0.65 } : undefined,
              },
              e('span', { style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 } },
                e(Icon, { name: 'folder', size: 15 }),
                e('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.name)),
              e(Icon, { name: 'chevron', size: 13 }))),
          listing.truncated ? e('div', { className: 'dshs-meta', style: { marginTop: 6 } }, '目录过多，仅显示前一部分') : null)),
      error === '' ? null : e('div', { className: 'dshs-error' }, error));
    }

    function WorkspaceRemoveDialog({ workspace, onClose, onRemoved }) {
      const [trashSessions, setTrashSessions] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const count = Number(workspace.sessionCount) || 0;
      const remove = async () => {
        setBusy(true);
        setError('');
        try {
          const data = await api('/workspace-remove', { workspaceId: workspace.id, trashSessions });
          await refreshHost();
          onRemoved?.(data);
          onClose();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      };
      return e(Modal, {
        title: '移除工作区',
        onClose: busy ? undefined : onClose,
        width: 520,
        footer: e(React.Fragment, null,
          e(Button, { onClick: onClose, disabled: busy }, '取消'),
          e(Button, { variant: 'danger', onClick: remove, disabled: busy }, busy ? '移除中…' : '移除')),
      },
      e('div', { style: { lineHeight: 1.6 } }, `移除「${workspace.title ?? workspace.path}」的注册？`),
      e('div', { className: 'dshs-kv', style: { marginTop: 6 } }, workspace.path),
      e('label', { className: 'dshs-meta', style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 } },
        e('input', { type: 'checkbox', className: 'dshs-check', checked: trashSessions, onChange: (event) => setTrashSessions(event.target.checked) }),
        `同时把该工作区的 ${count} 个会话移到回收站`),
      e('div', { className: 'dshs-meta', style: { marginTop: 8 } }, '目录和会话日志不会立即删除；清空回收站可回收磁盘空间。'),
      trashSessions && count > 0 ? e('div', { className: 'dshs-meta', style: { marginTop: 4, color: C.warn } }, '运行中的会话会先停止。') : null,
      error === '' ? null : e('div', { className: 'dshs-error' }, error));
    }

    // ---------------------------------------------------------------- session row
    function SessionRow(props) {
      const { row, mark, nested, childCount, expanded, batchMode, selected, presetName } = props;
      const label = row.title ?? row.preview ?? '（空会话）';
      const presetText = presetName || row.lastPreset || row.agentPreset;
      const tags = mark.tags ?? [];
      const priority = mark.priority;
      return e('div', { className: `dshs-row${nested ? ' is-nested' : ''}` },
        e('div', { className: 'dshs-row-main' },
          batchMode && row.isSubagent !== true
            ? e('input', { type: 'checkbox', className: 'dshs-check', checked: selected, onChange: (event) => props.onSelect(event.target.checked), 'aria-label': '选择会话' })
            : null,
          childCount > 0
            ? e(IconButton, { name: 'chevron', rotate: expanded ? 90 : 0, title: expanded ? '收起子会话' : '展开子会话', onClick: props.onToggle })
            : null,
          mark.favorite === true ? e('span', { title: '已收藏', style: { color: C.warn } }, e(Icon, { name: 'star', size: 13 })) : null,
          e('span', { className: 'dshs-row-title', title: label }, label),
          childCount > 0 ? e('span', { className: 'dshs-badge sub', title: `${childCount} 个子会话` }, `子会话 ${childCount}`) : null,
          row.pinned === true ? e('span', { className: 'dshs-badge', style: { color: C.brand, borderColor: C.brand } }, '置顶') : null,
          row.archived === true ? e('span', { className: 'dshs-badge archived' }, '已归档') : null,
          row.isLive === true ? e('span', { className: 'dshs-badge live' }, row.running ? '运行中' : '已打开') : null,
          row.running === true ? e('span', { className: 'dshs-badge run' }, '回合进行中') : null,
          row.formatStatus === 'migration-required' ? e('span', { className: 'dshs-badge warn', title: '会话需要 DSH 迁移' }, '待迁移') : null,
          priority !== null && priority !== undefined ? e('span', { className: 'dshs-badge priority', title: `优先级 ${priority}` }, `P${priority}`) : null,
          tags.map((tag) => e('span', { key: tag, className: 'dshs-chip' }, tag)),
          e('span', { className: 'dshs-row-actions' },
            e(IconButton, { name: 'open', title: '打开会话', onClick: props.onOpen }),
            e('span', { className: 'dshs-meta', style: { marginLeft: 4 } }, formatTime(row.updatedAt)))),
        row.preview !== undefined && row.title !== undefined ? e('div', { className: 'dshs-preview' }, row.preview) : null,
        e('div', { className: 'dshs-meta', style: { marginTop: 4 } },
          e('span', { title: row.cwd ?? row.project }, row.workspaceTitle ?? row.cwd ?? row.project),
          row.isSubagent ? e('span', null, '子会话') : null,
          presetText !== undefined ? e('span', null, `预设 ${presetText}`) : null,
          e('span', null, row.eventCount === undefined ? '' : `${row.eventCount} 事件`),
          e('span', null, formatBytes(row.sizeBytes)),
          row.error !== undefined ? e('span', { style: { color: C.error } }, row.error) : null),
        e('div', { className: 'dshs-id' }, row.id),
        e('div', { className: 'dshs-actions' },
          e(IconButton, { name: 'pin', title: row.pinned ? '取消置顶' : '置顶', on: row.pinned === true, onClick: props.onPin }),
          e(IconButton, { name: 'pencil', title: '重命名会话', onClick: props.onRename }),
          e(IconButton, { name: 'star', title: mark.favorite ? '取消收藏' : '收藏', on: mark.favorite === true, onClick: props.onFavorite }),
          e(IconButton, { name: 'clock', title: mark.reviewLater ? '取消待回看' : '待回看', on: mark.reviewLater === true, onClick: props.onReview }),
          e(IconButton, { name: 'tag', title: '标签 / 备注', onClick: props.onEdit }),
          e('select', {
            className: 'dshs-select small', value: priority === null || priority === undefined ? '' : String(priority),
            title: '优先级', onChange: (event) => props.onPriority(event.target.value === '' ? null : Number(event.target.value)),
          },
          e('option', { value: '' }, 'P-'),
          [1, 2, 3, 4, 5].map((value) => e('option', { key: value, value: String(value) }, `P${value}`))),
          row.isSubagent !== true
            ? e(IconButton, { name: 'archive', title: row.archived ? '取消归档' : '归档', on: row.archived === true, onClick: props.onArchive, disabled: row.running === true })
            : null,
          row.isSubagent !== true
            ? e(IconButton, { name: 'workspace', title: '移动到工作区', onClick: props.onMove })
            : null,
          e(IconButton, { name: 'preset', title: '迁移 Agent 预设', onClick: props.onPreset }),
          e(IconButton, { name: 'download', title: '导出 Markdown', onClick: props.onExport }),
          e(IconButton, { name: 'copy', title: '复制 Session ID', onClick: props.onCopy }),
          row.isSubagent !== true
            ? e(IconButton, { name: 'trash', title: '删除到回收站', onClick: props.onDelete, disabled: row.running === true, danger: true })
            : e('span', { className: 'dshs-meta' }, '随主会话删除')));
    }

    function TrashRow({ row, mark, selected, onSelect, onRestore, onPurge, busy, nested, childCount, expanded, onToggle }) {
      const label = row.title ?? row.preview ?? '（空会话）';
      const isChild = row.parentSession !== undefined;
      return e('div', { className: `dshs-row${nested ? ' is-nested' : ''}` },
        e('div', { className: 'dshs-row-main' },
          isChild ? null : e('input', { type: 'checkbox', className: 'dshs-check', checked: selected, onChange: (event) => onSelect(event.target.checked), 'aria-label': '选择回收站条目' }),
          childCount > 0
            ? e(IconButton, { name: 'chevron', rotate: expanded ? 90 : 0, title: expanded ? '收起子会话' : '展开子会话', onClick: onToggle })
            : null,
          mark.favorite === true ? e('span', { style: { color: C.warn } }, e(Icon, { name: 'star', size: 13 })) : null,
          e('span', { className: 'dshs-row-title' }, label),
          mark.priority !== null && mark.priority !== undefined ? e('span', { className: 'dshs-badge priority' }, `P${mark.priority}`) : null,
          (mark.tags ?? []).map((tag) => e('span', { key: tag, className: 'dshs-chip' }, tag)),
          e('span', { className: 'dshs-meta', style: { marginLeft: 'auto' } }, `删除于 ${formatTime(row.trashedAt)}`)),
        e('div', { className: 'dshs-meta', style: { marginTop: 4 } },
          e('span', null, row.project ?? ''),
          e('span', null, formatBytes(row.size)),
          e('span', { title: row.origin }, row.origin)),
        e('div', { className: 'dshs-id' }, row.id),
        e('div', { className: 'dshs-actions' },
          isChild
            ? e('span', { className: 'dshs-meta' }, '随主会话恢复和删除')
            : e(React.Fragment, null,
              e(Button, { onClick: onRestore, disabled: busy }, '恢复'),
              e(Button, { variant: 'danger', onClick: onPurge, disabled: busy }, '彻底删除'))));
    }

    function MaintenanceDialog({ onClose, onChanged, dataDir }) {
      const [pendingImport, setPendingImport] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const fileRef = React.useRef(null);

      const exportAnnotations = async () => {
        try {
          const data = await api('/annotations');
          const body = `${JSON.stringify({ version: 1, sessions: data.annotations ?? {} }, null, 2)}\n`;
          downloadBlob(new Blob([body], { type: 'application/json' }), 'session-annotations.json');
          showToast('已导出标记', 'success');
        } catch (err) {
          setError(err.message ?? String(err));
        }
      };

      const onImportFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file === undefined) return;
        try {
          const parsed = JSON.parse(await file.text());
          const sessions = parsed?.sessions ?? parsed?.annotations ?? parsed;
          if (sessions === null || typeof sessions !== 'object' || Array.isArray(sessions)) {
            throw new Error('JSON 里没有有效的标记对象');
          }
          setError('');
          setPendingImport({ sessions, count: Object.keys(sessions).length, fileName: file.name });
        } catch (err) {
          setError(err.message ?? String(err));
        }
      };

      const importAnnotations = async () => {
        if (pendingImport === null) return;
        setBusy(true);
        setError('');
        try {
          const result = await api('/annotations-import', { sessions: pendingImport.sessions });
          setPendingImport(null);
          showToast(`已导入 ${result.count ?? 0} 条标记`, 'success');
          onChanged?.();
        } catch (err) {
          setError(err.message ?? String(err));
        } finally {
          setBusy(false);
        }
      };

      const clearCache = async () => {
        setBusy(true);
        setError('');
        try {
          await api('/cache-clear', {});
          showToast('已清理列表缓存', 'success');
          onChanged?.();
        } catch (err) {
          setError(err.message ?? String(err));
        } finally {
          setBusy(false);
        }
      };

      return e(React.Fragment, null,
        e(Modal, {
          title: '数据维护', onClose: busy ? undefined : onClose, width: 520,
          footer: e(Button, { onClick: onClose, disabled: busy }, '关闭'),
        },
        e('div', { className: 'dshs-note' }, '标记与列表缓存维护。导入会覆盖当前全部标记，请先导出备份。'),
        e('div', { className: 'dshs-actions', style: { marginTop: 12 } },
          e(Button, { onClick: exportAnnotations, disabled: busy }, e(Icon, { name: 'download', size: 13 }), '导出标记'),
          e(Button, { onClick: () => fileRef.current?.click(), disabled: busy }, e(Icon, { name: 'download', size: 13, rotate: 180 }), '导入标记'),
          e(Button, { onClick: clearCache, disabled: busy }, e(Icon, { name: 'refresh', size: 13 }), busy ? '处理中…' : '清理列表缓存'),
          e(Button, {
            onClick: async () => {
              const ok = await copyText(dataDir);
              showToast(ok ? '已复制数据目录' : '复制失败，请手动复制', ok ? 'success' : 'error');
            },
            disabled: busy || dataDir === undefined,
          }, e(Icon, { name: 'copy', size: 13 }), '复制数据目录')),
        e('input', {
          ref: fileRef, type: 'file', accept: '.json,application/json',
          style: { display: 'none' }, onChange: onImportFile,
        }),
        error === '' ? null : e('div', { className: 'dshs-error' }, error)),
        pendingImport === null ? null : e(Modal, {
          title: '导入标记',
          onClose: () => { if (!busy) setPendingImport(null); },
          width: 460,
          footer: e(React.Fragment, null,
            e(Button, { onClick: () => setPendingImport(null), disabled: busy }, '取消'),
            e(Button, { variant: 'danger', onClick: importAnnotations, disabled: busy }, busy ? '导入中…' : '覆盖导入')),
        }, e('div', { style: { lineHeight: 1.6 } },
          `将用「${pendingImport.fileName}」中的 ${pendingImport.count} 条标记覆盖当前全部标记，确定继续？`)));
    }

    // ---------------------------------------------------------------- manager page
    function Page({ onClose }) {
      const [initialView] = React.useState(readStoredView);
      const [tab, setTab] = React.useState(initialView.tab);
      const [sessions, setSessions] = React.useState([]);
      const [trash, setTrash] = React.useState([]);
      const [workspaces, setWorkspaces] = React.useState([]);
      const [annotations, setAnnotations] = React.useState({});
      const [stats, setStats] = React.useState(null);
      const [presets, setPresets] = React.useState([]);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState('');
      const [search, setSearch] = React.useState('');
      const [workspaceFilter, setWorkspaceFilter] = React.useState(initialView.workspaceFilter);
      const [archiveFilter, setArchiveFilter] = React.useState(initialView.archiveFilter);
      const [favoriteFilter, setFavoriteFilter] = React.useState(initialView.favoriteFilter);
      const [reviewFilter, setReviewFilter] = React.useState(initialView.reviewFilter);
      const [priorityFilter, setPriorityFilter] = React.useState(initialView.priorityFilter);
      const [tagFilter, setTagFilter] = React.useState(initialView.tagFilter);
      const [sort, setSort] = React.useState(initialView.sort);
      const [showEmpty, setShowEmpty] = React.useState(initialView.showEmpty);
      const [trashWorkspaceFilter, setTrashWorkspaceFilter] = React.useState(initialView.trashWorkspaceFilter);
      const [collapsed, setCollapsed] = React.useState(new Set());
      const [expanded, setExpanded] = React.useState(new Set());
      const [collapsedTrash, setCollapsedTrash] = React.useState(new Set());
      const [expandedTrash, setExpandedTrash] = React.useState(new Set());
      const [batchMode, setBatchMode] = React.useState(false);
      const [selected, setSelected] = React.useState(new Set());
      const [selectedTrash, setSelectedTrash] = React.useState(new Set());
      const [editing, setEditing] = React.useState(null);
      const [renamingSession, setRenamingSession] = React.useState(null);
      const [moving, setMoving] = React.useState(null);
      const [preset, setPreset] = React.useState(null);
      const [renaming, setRenaming] = React.useState(null);
      const [creatingWorkspace, setCreatingWorkspace] = React.useState(false);
      const [showMaintenance, setShowMaintenance] = React.useState(false);
      const [removingWorkspace, setRemovingWorkspace] = React.useState(null);
      const [batchTags, setBatchTags] = React.useState(false);
      const [confirm, setConfirm] = React.useState(null);
      const [result, setResult] = React.useState(null);
      const [progress, setProgress] = React.useState(null);
      const [busy, setBusy] = React.useState('');
      const listRef = React.useRef(null);
      const scrollPositions = React.useRef(readStoredScroll());
      const pendingScrollTab = React.useRef(initialView.tab);
      const loadedTabRef = React.useRef(null);

      React.useEffect(() => {
        const view = { tab, workspaceFilter, archiveFilter, favoriteFilter, reviewFilter, priorityFilter, tagFilter, sort, showEmpty, trashWorkspaceFilter };
        try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* storage unavailable */ }
      }, [tab, workspaceFilter, archiveFilter, favoriteFilter, reviewFilter, priorityFilter, tagFilter, sort, showEmpty, trashWorkspaceFilter]);

      const resetView = () => {
        setSearch('');
        setWorkspaceFilter('all');
        setArchiveFilter('all');
        setFavoriteFilter('all');
        setReviewFilter('all');
        setPriorityFilter('all');
        setTagFilter('all');
        setSort('updated-desc');
        setShowEmpty(false);
        setTrashWorkspaceFilter('all');
      };
      const changeTab = (next) => {
        if (next === tab) return;
        pendingScrollTab.current = next;
        setTab(next);
      };

      React.useEffect(() => {
        persistScroll(scrollPositions.current);
      }, [tab]);
      React.useEffect(() => {
        if (loading || pendingScrollTab.current !== tab || loadedTabRef.current !== tab) return undefined;
        const frame = requestAnimationFrame(() => {
          const list = listRef.current;
          if (list !== null) list.scrollTop = Number(scrollPositions.current[tab]) || 0;
          pendingScrollTab.current = null;
        });
        return () => cancelAnimationFrame(frame);
      }, [tab, loading]);
      React.useEffect(() => () => { persistScroll(scrollPositions.current); }, []);

      const load = React.useCallback(async () => {
        setLoading(true);
        setError('');
        try {
          const statsPromise = api('/stats').then((data) => setStats(data)).catch(() => {});
          const presetsPromise = api('/presets').then((data) => setPresets(data.presets ?? [])).catch(() => {});
          const marks = await api('/annotations');
          setAnnotations(marks.annotations ?? {});
          if (tab === 'sessions') {
            const data = await api('/list');
            setSessions(data.sessions ?? []);
          } else if (tab === 'trash') {
            const data = await api('/trash');
            setTrash(data.entries ?? []);
          } else {
            const data = await api('/workspaces');
            setWorkspaces(data.workspaces ?? []);
          }
          await Promise.all([statsPromise, presetsPromise]);
          loadedTabRef.current = tab;
        } catch (err) {
          setError(err.message ?? String(err));
        } finally {
          setLoading(false);
        }
      }, [tab]);

      React.useEffect(() => { load(); }, [load]);
      React.useEffect(() => {
        const listener = () => load();
        bus.addEventListener('change', listener);
        let off = () => {};
        try { off = subscribeWorkspaceStateRef(listener); } catch { /* polling only */ }
        const timer = setInterval(listener, 3000);
        return () => {
          bus.removeEventListener('change', listener);
          off();
          clearInterval(timer);
        };
      }, [load]);
      React.useEffect(() => {
        if (workspaces.length > 0) return;
        api('/workspaces').then((data) => setWorkspaces(data.workspaces ?? [])).catch(() => {});
      }, [workspaces.length]);

      const allTags = React.useMemo(() => {
        const set = new Set();
        for (const value of Object.values(annotations)) for (const tag of value?.tags ?? []) set.add(tag);
        return [...set].sort((a, b) => a.localeCompare(b));
      }, [annotations]);

      const childCount = React.useMemo(() => {
        const map = new Map();
        for (const row of sessions) {
          if (row.isSubagent === true && row.parentSession) map.set(row.parentSession, (map.get(row.parentSession) ?? 0) + 1);
        }
        return map;
      }, [sessions]);

      const presetLabel = React.useCallback((id) => {
        if (id === undefined || id === null || id === '') return undefined;
        const found = presets.find((item) => item.id === id);
        return found?.name ?? PRESET_LABELS[id] ?? id;
      }, [presets]);

      const matches = React.useCallback((row) => {
        const mark = markOf(annotations, row.id);
        const text = `${row.title ?? ''} ${row.preview ?? ''} ${row.id} ${row.cwd ?? ''} ${row.workspaceTitle ?? ''} ${(mark.tags ?? []).join(' ')} ${mark.note ?? ''}`.toLowerCase();
        if (search !== '' && !text.includes(search.toLowerCase())) return false;
        if (showEmpty === false && row.title === undefined && row.preview === undefined) return false;
        if (workspaceFilter === 'ungrouped' && row.workspaceId !== undefined) return false;
        if (workspaceFilter !== 'all' && workspaceFilter !== 'ungrouped' && row.workspaceId !== workspaceFilter) return false;
        if (archiveFilter === 'archived' && row.archived !== true) return false;
        if (archiveFilter === 'active' && row.archived === true) return false;
        if (favoriteFilter === 'favorite' && mark.favorite !== true) return false;
        if (favoriteFilter === 'not-favorite' && mark.favorite === true) return false;
        if (reviewFilter === 'review' && mark.reviewLater !== true) return false;
        if (reviewFilter === 'not-review' && mark.reviewLater === true) return false;
        if (priorityFilter === 'none' && mark.priority !== null && mark.priority !== undefined) return false;
        if (priorityFilter !== 'all' && priorityFilter !== 'none' && mark.priority !== Number(priorityFilter)) return false;
        if (tagFilter !== 'all' && !(mark.tags ?? []).includes(tagFilter)) return false;
        return true;
      }, [annotations, archiveFilter, favoriteFilter, priorityFilter, reviewFilter, search, showEmpty, tagFilter, workspaceFilter]);

      const trashMatches = React.useCallback((row) => {
        const mark = markOf(annotations, row.id);
        const text = `${row.id} ${row.title ?? ''} ${row.preview ?? ''} ${row.origin ?? ''} ${(mark.tags ?? []).join(' ')}`.toLowerCase();
        if (search !== '' && !text.includes(search.toLowerCase())) return false;
        if (trashWorkspaceFilter === 'ungrouped') return row.workspaceId === undefined && row.workspacePath === undefined;
        if (trashWorkspaceFilter !== 'all') {
          if (row.workspaceId === trashWorkspaceFilter) return true;
          const workspace = workspaces.find((item) => item.id === trashWorkspaceFilter);
          return workspace !== undefined && row.workspacePath === workspace.path;
        }
        return true;
      }, [annotations, search, trashWorkspaceFilter, workspaces]);

      const sortRows = React.useCallback((rows) => {
        const priorityOf = (row) => markOf(annotations, row.id).priority ?? 3;
        const copy = [...rows];
        copy.sort((a, b) => {
          if ((a.pinned === true) !== (b.pinned === true)) return a.pinned === true ? -1 : 1;
          if (sort === 'updated-asc') return String(a.updatedAt).localeCompare(String(b.updatedAt));
          if (sort === 'created-desc') return String(b.createdAt).localeCompare(String(a.createdAt));
          if (sort === 'created-asc') return String(a.createdAt).localeCompare(String(b.createdAt));
          if (sort === 'title-asc') return String(a.title ?? a.preview ?? a.id).localeCompare(String(b.title ?? b.preview ?? b.id));
          if (sort === 'title-desc') return String(b.title ?? b.preview ?? b.id).localeCompare(String(a.title ?? a.preview ?? a.id));
          if (sort === 'priority-asc') return priorityOf(a) - priorityOf(b);
          if (sort === 'priority-desc') return priorityOf(b) - priorityOf(a);
          if (sort === 'size-desc') return (Number(b.sizeBytes) || 0) - (Number(a.sizeBytes) || 0);
          return String(b.updatedAt).localeCompare(String(a.updatedAt));
        });
        return copy;
      }, [annotations, sort]);

      const visible = React.useMemo(() => {
        if (tab !== 'sessions') return [];
        const rows = [];
        const top = sortRows(sessions.filter((row) => row.isSubagent !== true && matches(row)));
        for (const row of top) {
          rows.push(row);
          const children = sessions.filter((child) => child.isSubagent === true && child.parentSession === row.id && matches(child));
          if (expanded.has(row.id) || (search !== '' && children.length > 0)) rows.push(...sortRows(children));
        }
        return rows;
      }, [expanded, matches, search, sessions, sortRows, tab]);

      const groups = React.useMemo(() => {
        const map = new Map();
        const topById = new Map();
        for (const row of visible) if (row.isSubagent !== true) topById.set(row.id, row);
        for (const row of visible) {
          const owner = row.isSubagent === true ? (topById.get(row.parentSession) ?? row) : row;
          const key = owner.workspaceId ?? owner.workspaceTitle ?? owner.cwd ?? owner.project ?? '未分组';
          const label = owner.workspaceTitle ?? owner.cwd ?? owner.project ?? '未分组';
          if (!map.has(key)) map.set(key, { key, label, rows: [] });
          map.get(key).rows.push(row);
        }
        return [...map.values()];
      }, [visible]);

      const run = async (label, fn) => {
        setBusy(label);
        setError('');
        try {
          const value = await fn();
          emitChange();
          await load();
          return value;
        } catch (err) {
          setError(err.message ?? String(err));
          return undefined;
        } finally {
          setBusy('');
        }
      };

      const updateMark = async (id, patch) => {
        const mark = markOf(annotations, id);
        try {
          const data = await api('/annotations', { id, patch, expectedRevision: mark.revision });
          setAnnotations((current) => ({ ...current, [id]: data.annotation }));
          emitChange();
        } catch (err) {
          setError(err.message ?? String(err));
          await load();
        }
      };

      const batchIds = [...selected].filter((id) => id !== undefined);
      const batchTitles = batchIds.map((id) => sessions.find((row) => row.id === id)?.title ?? id);
      const currentWorkspaceId = (() => {
        const row = sessions.find((item) => item.id === batchIds[0]);
        return row?.workspaceId;
      })();
      const requireBatch = () => {
        if (batchIds.length > 0) return true;
        showToast('请先选择至少一个会话', 'info');
        return false;
      };

      const deleteOne = (row) => {
        setConfirm({
          title: '删除到回收站',
          message: `确定把「${row.title ?? row.preview ?? row.id}」移到回收站吗？${childCount.get(row.id) ? ` 其 ${childCount.get(row.id)} 个子会话会一并移动。` : ''}${row.isLive ? ' 当前会话会被关闭并切到新会话。' : ''}`,
          danger: true,
          onConfirm: async () => {
            setConfirm(null);
            const current = row.isLive === true;
            await run(row.id, async () => {
              await api('/move-to-trash', { id: row.id, includeChildren: (childCount.get(row.id) ?? 0) > 0 });
              await refreshHost();
              if (current) startNewSessionRef();
              showToast('已移到回收站', 'success');
            });
          },
        });
      };

      const titleOf = (id) => {
        const row = sessions.find((item) => item.id === id);
        return row?.title ?? row?.preview ?? '（空会话）';
      };
      const deleteBatch = (ids = batchIds) => {
        if (ids.length === 0) { showToast('请先选择至少一个会话', 'info'); return; }
        const preview = ids.slice(0, 8).map(titleOf).join('、');
        setConfirm({
          title: '批量删除到回收站',
          message: `确定把 ${ids.length} 个会话移到回收站吗？${preview}${ids.length > 8 ? ' 等' : ''}。子会话会随主会话一并移动。`,
          danger: true,
          onConfirm: async () => {
            setConfirm(null);
            setBusy('batch-trash');
            setError('');
            setProgress({ label: '准备删除', current: 0, total: ids.length });
            const succeeded = [];
            const failed = [];
            try {
              for (let index = 0; index < ids.length; index += 1) {
                const id = ids[index];
                setProgress({ label: titleOf(id), current: index + 1, total: ids.length });
                try {
                  await api('/move-to-trash', { id, includeChildren: true });
                  succeeded.push(id);
                } catch (err) {
                  failed.push({ id, reason: err instanceof Error ? err.message : String(err) });
                }
              }
              await refreshHost();
              emitChange();
              await load();
              const failedIds = failed.map((item) => item.id);
              setResult({
                title: '批量删除结果', succeeded, failed,
                retry: failedIds.length > 0 ? () => deleteBatch(failedIds) : undefined,
              });
              setSelected(new Set());
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setProgress(null);
              setBusy('');
            }
          },
        });
      };

      const batchPatch = async (patch, ids = batchIds) => {
        if (ids === batchIds && !requireBatch()) return;
        const resultValue = await run('batch-patch', async () => api('/batch-annotations', { ids, patch }));
        if (resultValue !== undefined) {
          const failedIds = (resultValue.items ?? []).filter((item) => item.status === 'failed').map((item) => item.sessionId);
          setResult({
            title: '批量标记结果', items: resultValue.items, summary: resultValue.summary,
            retry: failedIds.length > 0 ? () => batchPatch(patch, failedIds) : undefined,
          });
          emitChange();
        }
      };

      const batchArchive = async (archived, ids = batchIds) => {
        if (ids === batchIds && !requireBatch()) return;
        const resultValue = await run('batch-archive', async () => api('/batch-archive', { ids, archived }));
        if (resultValue !== undefined) {
          await refreshHost();
          const failedIds = (resultValue.failed ?? []).map((item) => item.id);
          setResult({
            title: archived ? '批量归档结果' : '批量取消归档结果',
            succeeded: resultValue.succeeded, failed: resultValue.failed,
            retry: failedIds.length > 0 ? () => batchArchive(archived, failedIds) : undefined,
          });
          emitChange();
        }
      };

      const batchPin = async (pinned, ids = batchIds) => {
        if (ids === batchIds && !requireBatch()) return;
        const resultValue = await run('batch-pin', async () => api('/batch-pin', { ids, pinned }));
        if (resultValue !== undefined) {
          const failedIds = (resultValue.failed ?? []).map((item) => item.id);
          setResult({
            title: pinned ? '批量置顶结果' : '批量取消置顶结果',
            succeeded: resultValue.succeeded, failed: resultValue.failed,
            retry: failedIds.length > 0 ? () => batchPin(pinned, failedIds) : undefined,
          });
        }
      };

      const exportOne = async (row) => {
        try {
          const data = await api(`/export?id=${encodeURIComponent(row.id)}`);
          downloadBlob(new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' }), `${safeName(row.title, row.id)}.md`);
        } catch (err) {
          showToast(err.message ?? String(err), 'error');
        }
      };

      const exportSelected = async () => {
        if (!requireBatch()) return;
        try {
          const response = await fetch('/api/session-hub/export-zip', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids: batchIds }),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error ?? `HTTP ${response.status}`);
          }
          downloadBlob(await response.blob(), 'sessions.zip');
        } catch (err) {
          setError(err.message ?? String(err));
        }
      };

      const trashTitleOf = (id) => {
        const row = trash.find((item) => item.id === id);
        return row?.title ?? row?.preview ?? '（空会话）';
      };
      const trashPreview = (ids) => `${ids.slice(0, 8).map(trashTitleOf).join('、')}${ids.length > 8 ? ' 等' : ''}`;

      const runRestore = async (ids) => {
        const targets = ids.filter((id) => trash.find((row) => row.id === id)?.parentSession === undefined);
        if (targets.length === 0) { showToast('子会话请随主会话恢复', 'info'); return; }
        setBusy('batch-restore');
        setError('');
        setProgress({ label: '准备恢复', current: 0, total: targets.length });
        const restored = [];
        const failed = [];
        try {
          for (let index = 0; index < targets.length; index += 1) {
            const id = targets[index];
            setProgress({ label: trashTitleOf(id), current: index + 1, total: targets.length });
            try {
              await api('/restore', { id });
              restored.push(id);
            } catch (err) {
              failed.push({ id, reason: err instanceof Error ? err.message : String(err) });
            }
          }
          await refreshHost();
          emitChange();
          await load();
          setSelectedTrash(new Set());
          setResult({
            title: '批量恢复结果', restored, failed,
            retry: failed.length > 0 ? () => runRestore(failed.map((item) => item.id)) : undefined,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setProgress(null);
          setBusy('');
        }
      };

      const restoreBatch = (ids) => {
        const targets = ids.filter((id) => trash.find((row) => row.id === id)?.parentSession === undefined);
        if (targets.length === 0) { showToast('子会话请随主会话恢复', 'info'); return; }
        setConfirm({
          title: '批量恢复',
          message: `恢复 ${targets.length} 个条目？${trashPreview(targets)}。子会话会随主会话一并恢复。`,
          onConfirm: async () => { setConfirm(null); await runRestore(targets); },
        });
      };

      const runPurge = async (ids) => {
        setBusy('batch-purge');
        setError('');
        setProgress({ label: '准备彻底删除', current: 0, total: ids.length });
        const purged = [];
        const failed = [];
        try {
          for (let index = 0; index < ids.length; index += 1) {
            const id = ids[index];
            setProgress({ label: trashTitleOf(id), current: index + 1, total: ids.length });
            try {
              const data = await api('/purge', { id });
              purged.push(...(Array.isArray(data.purged) ? data.purged : [id]));
            } catch (err) {
              failed.push({ id, reason: err instanceof Error ? err.message : String(err) });
            }
          }
          emitChange();
          await load();
          setSelectedTrash(new Set());
          setResult({
            title: '批量彻底删除结果', purged, failed,
            retry: failed.length > 0 ? () => runPurge(failed.map((item) => item.id)) : undefined,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setProgress(null);
          setBusy('');
        }
      };

      const purgeBatch = (ids) => {
        if (ids.length === 0) return;
        setConfirm({
          title: '批量彻底删除',
          message: `彻底删除 ${ids.length} 个条目？${trashPreview(ids)}。子会话会一并彻底删除，无法恢复。`,
          danger: true,
          onConfirm: async () => { setConfirm(null); await runPurge(ids); },
        });
      };

      const selectAllVisible = () => {
        setSelected(new Set(visible.filter((row) => row.isSubagent !== true).map((row) => row.id)));
      };

      const header = e('div', { className: 'dshs-head' },
        e('div', { className: 'dshs-title' }, e(Icon, { name: 'list', size: 17 }), '会话管理'),
        e('div', { className: 'dshs-tabs' },
          [['sessions', '会话'], ['trash', '回收站'], ['workspaces', '工作区']].map(([key, label]) => e('button', {
            key, type: 'button', className: `dshs-tab${tab === key ? ' is-active' : ''}`, onClick: () => changeTab(key),
          }, label))),
        e('span', { style: { marginLeft: 'auto' } }),
        e(Button, { onClick: resetView, title: '清空搜索与筛选' }, '重置筛选'),
        e(Button, { onClick: () => setShowMaintenance(true) }, '维护'),
        e(Button, { onClick: load, disabled: loading }, e(Icon, { name: 'refresh', size: 13 }), loading ? '刷新中' : '刷新'),
        e(IconButton, { name: 'close', title: '关闭', onClick: onClose }));

      const toolbar = e('div', { className: 'dshs-toolbar' },
        e('input', {
          className: 'dshs-input', style: { minWidth: 210, flex: '1 1 210px' },
          placeholder: '搜索标题 / ID / 路径 / 标签 / 备注', value: search,
          onChange: (event) => setSearch(event.target.value),
          onKeyDown: (event) => { if (event.key === 'Escape') setSearch(''); },
        }),
        tab === 'sessions'
          ? e(React.Fragment, null,
            e('select', { className: 'dshs-select', value: workspaceFilter, onChange: (event) => setWorkspaceFilter(event.target.value), title: '工作区' },
            e('option', { value: 'all' }, '全部工作区'),
            e('option', { value: 'ungrouped' }, '未分组'),
            workspaces.map((workspace) => e('option', { key: workspace.id, value: workspace.id }, workspace.title ?? workspace.path))),
            e('select', { className: 'dshs-select', value: archiveFilter, onChange: (event) => setArchiveFilter(event.target.value), title: '归档状态' },
            e('option', { value: 'all' }, '全部状态'),
            e('option', { value: 'active' }, '未归档'),
            e('option', { value: 'archived' }, '已归档')),
            e('select', { className: 'dshs-select', value: favoriteFilter, onChange: (event) => setFavoriteFilter(event.target.value), title: '收藏筛选' },
            e('option', { value: 'all' }, '全部收藏'),
            e('option', { value: 'favorite' }, '已收藏'),
            e('option', { value: 'not-favorite' }, '未收藏')),
            e('select', { className: 'dshs-select', value: reviewFilter, onChange: (event) => setReviewFilter(event.target.value), title: '回看筛选' },
            e('option', { value: 'all' }, '全部回看'),
            e('option', { value: 'review' }, '待回看'),
            e('option', { value: 'not-review' }, '未待回看')),
            e('select', { className: 'dshs-select', value: priorityFilter, onChange: (event) => setPriorityFilter(event.target.value), title: '优先级' },
            e('option', { value: 'all' }, '全部优先级'),
            e('option', { value: 'none' }, '未设置'),
            [1, 2, 3, 4, 5].map((value) => e('option', { key: value, value: String(value) }, `P${value}`))),
            allTags.length > 0
              ? e('select', { className: 'dshs-select', value: tagFilter, onChange: (event) => setTagFilter(event.target.value), title: '标签' },
              e('option', { value: 'all' }, '全部标签'),
              allTags.map((tag) => e('option', { key: tag, value: tag }, tag)))
              : null,
            e('select', { className: 'dshs-select', value: sort, onChange: (event) => setSort(event.target.value), title: '排序' },
            e('option', { value: 'updated-desc' }, '最近更新'),
            e('option', { value: 'updated-asc' }, '最早更新'),
            e('option', { value: 'created-desc' }, '最新创建'),
            e('option', { value: 'created-asc' }, '最早创建'),
            e('option', { value: 'title-asc' }, '名称 A → Z'),
            e('option', { value: 'title-desc' }, '名称 Z → A'),
            e('option', { value: 'priority-asc' }, '优先级 1 → 5'),
            e('option', { value: 'priority-desc' }, '优先级 5 → 1'),
            e('option', { value: 'size-desc' }, '体积从大到小')),
            e('label', { className: 'dshs-meta', style: { display: 'flex', alignItems: 'center', gap: 5 } },
              e('input', { type: 'checkbox', className: 'dshs-check', checked: showEmpty, onChange: (event) => setShowEmpty(event.target.checked) }),
              '显示空会话'))
          : null,
        tab === 'sessions'
          ? e(React.Fragment, null,
            e(Button, { onClick: () => { setBatchMode(!batchMode); setSelected(new Set()); } }, batchMode ? '退出批量' : '批量处理'),
            e(Button, { onClick: () => setConfirm({
              title: '清理空会话', message: '把所有未打开、无标题且无消息的会话移到回收站？', danger: true,
              onConfirm: async () => {
                setConfirm(null);
                const value = await run('cleanup', async () => api('/cleanup-empty', {}));
                if (value === undefined) return;
                const moved = Array.isArray(value.moved) ? value.moved.length : 0;
                const skipped = Array.isArray(value.skipped) ? value.skipped.length : 0;
                if (moved === 0 && skipped === 0) showToast('没有可清理的空会话', 'info');
                else if (moved === 0) showToast(`没有可清理的空会话（跳过 ${skipped} 个已打开会话）`, 'info');
                else showToast(`已清理 ${moved} 个空会话`, 'success');
                await refreshHost();
                if (moved > 0 || skipped > 0) {
                  setResult({ title: '清理空会话', moved: value.moved ?? [], skipped: value.skipped ?? [] });
                }
              },
            }) }, '清理空会话'))
          : null,
        tab === 'trash'
          ? e(React.Fragment, null,
            e('select', {
              className: 'dshs-select', value: trashWorkspaceFilter, title: '回收站工作区',
              onChange: (event) => { setTrashWorkspaceFilter(event.target.value); setSelectedTrash(new Set()); },
            },
            e('option', { value: 'all' }, '全部工作区'),
            e('option', { value: 'ungrouped' }, '未分组'),
            workspaces.map((workspace) => e('option', { key: workspace.id, value: workspace.id }, workspace.title ?? workspace.path))),
            e(Button, {
              onClick: () => setSelectedTrash(new Set(trash.filter(trashMatches).filter((row) => row.parentSession === undefined).map((row) => row.id))),
              disabled: trash.length === 0,
            }, '全选当前'),
            e(Button, { onClick: () => setSelectedTrash(new Set()), disabled: selectedTrash.size === 0 }, '清空选择'),
            e(Button, { onClick: () => setConfirm({
              title: '清空回收站', message: '回收站中的所有条目都会被彻底删除，无法恢复。', danger: true,
              onConfirm: async () => { setConfirm(null); await run('empty-trash', async () => api('/empty-trash', {})); },
            }) }, '清空回收站'),
            e(Button, { onClick: () => restoreBatch([...selectedTrash]), disabled: selectedTrash.size === 0 }, `批量恢复 (${selectedTrash.size})`),
            e(Button, { variant: 'danger', onClick: () => purgeBatch([...selectedTrash]), disabled: selectedTrash.size === 0 }, `批量彻底删除 (${selectedTrash.size})`))
          : null,
        tab === 'workspaces'
          ? e(Button, { onClick: () => setCreatingWorkspace(true) }, '新建工作区')
          : null);

      const batchBar = batchMode && tab === 'sessions'
        ? e('div', { className: 'dshs-toolbar' },
          e('span', { className: 'dshs-meta' }, batchIds.length === 0 ? '请先选择会话' : `已选 ${batchIds.length}`),
          e(Button, { onClick: selectAllVisible }, '全选筛选'),
          e(Button, { onClick: () => setSelected(new Set()) }, '清空选择'),
          e(Button, { onClick: () => batchPatch({ favorite: true }) }, '收藏'),
          e(Button, { onClick: () => batchPatch({ favorite: false }) }, '取消收藏'),
          e(Button, { onClick: () => batchPatch({ reviewLater: true }) }, '待回看'),
          e(Button, { onClick: () => batchPatch({ reviewLater: false }) }, '取消待看'),
          e(Button, { onClick: () => batchArchive(true) }, '归档'),
          e(Button, { onClick: () => batchArchive(false) }, '取消归档'),
          e(Button, { onClick: () => batchPin(true) }, '置顶'),
          e(Button, { onClick: () => batchPin(false) }, '取消置顶'),
          e(Button, { onClick: () => { if (requireBatch()) setBatchTags(true); } }, '标签'),
          e('select', {
            className: 'dshs-select', value: '', onChange: (event) => { if (event.target.value !== '') batchPatch({ priority: event.target.value === 'none' ? null : Number(event.target.value) }); },
          },
          e('option', { value: '' }, '设置优先级'),
          e('option', { value: 'none' }, '清除优先级'),
          [1, 2, 3, 4, 5].map((value) => e('option', { key: value, value: String(value) }, `P${value}`))),
          e(Button, { onClick: () => { if (requireBatch()) setMoving({ ids: batchIds, titles: batchTitles, currentWorkspaceId }); } }, '移动至工作区'),
          e(Button, { onClick: () => { if (requireBatch()) setPreset({ ids: batchIds, titles: batchTitles }); } }, '迁移预设'),
          e(Button, { onClick: exportSelected }, `导出选中 (${batchIds.length})`),
          e(Button, { variant: 'danger', onClick: () => deleteBatch() }, '删除会话'))
        : null;

      const renderRow = (row) => e(SessionRow, {
        key: row.id,
        row,
        presetName: presetLabel(row.lastPreset ?? row.agentPreset),
        mark: markOf(annotations, row.id),
        nested: row.isSubagent === true,
        childCount: childCount.get(row.id) ?? 0,
        expanded: expanded.has(row.id),
        batchMode,
        selected: selected.has(row.id),
        onSelect: (checked) => setSelected((current) => {
          const next = new Set(current);
          if (checked) next.add(row.id); else next.delete(row.id);
          return next;
        }),
        onToggle: () => setExpanded((current) => {
          const next = new Set(current);
          if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
          return next;
        }),
        onOpen: () => { openSessionRef(row); onClose(); },
        onPin: () => run('pin', async () => api('/pin', { id: row.id, pinned: !(row.pinned === true) })),
        onRename: () => setRenamingSession({ id: row.id, title: row.title ?? row.preview ?? '' }),
        onCopy: async () => {
          const ok = await copyText(row.id);
          showToast(ok ? '已复制 Session ID' : '复制失败，请手动复制', ok ? 'success' : 'error');
        },
        onFavorite: () => updateMark(row.id, { favorite: !(markOf(annotations, row.id).favorite === true) }),
        onReview: () => updateMark(row.id, { reviewLater: !(markOf(annotations, row.id).reviewLater === true) }),
        onEdit: () => setEditing({ id: row.id, title: row.title ?? row.preview, preview: row.preview, mark: markOf(annotations, row.id) }),
        onPriority: (value) => updateMark(row.id, { priority: value }),
        onArchive: () => run(row.id, async () => {
          await api('/archive', { id: row.id, archived: !(row.archived === true) });
          showToast(row.archived ? '已取消归档' : '已归档', 'success');
          emitChange();
        }),
        onMove: () => setMoving({ ids: [row.id], titles: [row.title ?? row.preview ?? row.id], currentWorkspaceId: row.workspaceId }),
        onPreset: () => setPreset({ ids: [row.id], titles: [row.title ?? row.preview ?? row.id] }),
        onExport: () => exportOne(row),
        onDelete: () => deleteOne(row),
      });

      let body;
      if (tab === 'sessions') {
        if (visible.length === 0) {
          body = e('div', { className: 'dshs-empty' }, loading ? '加载中…' : '没有匹配的会话',
            e('div', { style: { marginTop: 10 } }, e(Button, { onClick: resetView }, '清空筛选')));
        } else if (workspaceFilter !== 'all') {
          // The workspace filter already narrows the list to one group, so a
          // second workspace header and its indent would be redundant.
          body = e('div', null, visible.map(renderRow));
        } else {
          body = groups.map((group) => {
            const key = String(group.key);
            const isCollapsed = collapsed.has(key);
            return e('div', { key, className: 'dshs-group' },
              e('div', { className: 'dshs-group-head' },
                e(IconButton, {
                  name: isCollapsed ? 'caret-right' : 'caret-down',
                  title: isCollapsed ? '展开工作区' : '收起工作区',
                  onClick: () => setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  }),
                }),
                e('span', null, group.label),
                e('span', { className: 'dshs-meta' }, `${group.rows.length} 个会话`)),
              isCollapsed ? null : e('div', { className: 'dshs-group-body' }, group.rows.map(renderRow)));
          });
        }
      } else if (tab === 'trash') {
        const rows = [...trash]
          .filter(trashMatches)
          .sort((a, b) => String(b.trashedAt).localeCompare(String(a.trashedAt)));
        const byId = new Map(rows.map((row) => [row.id, row]));
        const childrenOf = new Map();
        const top = [];
        for (const row of rows) {
          if (row.parentSession !== undefined && byId.has(row.parentSession)) {
            if (!childrenOf.has(row.parentSession)) childrenOf.set(row.parentSession, []);
            childrenOf.get(row.parentSession).push(row);
          } else {
            top.push(row);
          }
        }
        const flattened = [];
        const pushTree = (row, depth) => {
          flattened.push({ row, depth });
          if (!expandedTrash.has(row.id)) return;
          for (const child of childrenOf.get(row.id) ?? []) pushTree(child, depth + 1);
        };
        for (const row of top) pushTree(row, 0);

        const fallbackProject = (row) => {
          if (typeof row.project !== 'string' || row.project === '') return '未分组';
          const text = row.project.replace(/^--+|-+$/g, '').replace(/-/g, '/');
          return text === '' ? '未分组' : `/${text}`;
        };
        const groupLabel = (row) => {
          const workspace = workspaces.find((item) => item.id === row.workspaceId
            || (typeof row.workspacePath === 'string' && item.path === row.workspacePath));
          return workspace?.title ?? row.workspacePath ?? fallbackProject(row);
        };
        const groups = new Map();
        for (const item of flattened) {
          const key = item.row.workspaceId ?? item.row.workspacePath ?? item.row.project ?? '未分组';
          if (!groups.has(key)) groups.set(key, { key, label: groupLabel(item.row), items: [] });
          groups.get(key).items.push(item);
        }
        body = rows.length === 0
          ? e('div', { className: 'dshs-empty' }, loading ? '加载中…' : '回收站为空')
          : [...groups.values()].map((group) => {
            const key = String(group.key);
            const isCollapsed = collapsedTrash.has(key);
            return e('div', { key, className: 'dshs-group' },
              e('div', { className: 'dshs-group-head' },
                e(IconButton, {
                  name: isCollapsed ? 'caret-right' : 'caret-down',
                  title: isCollapsed ? '展开工作区' : '收起工作区',
                  onClick: () => setCollapsedTrash((current) => {
                    const next = new Set(current);
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  }),
                }),
                e('span', null, group.label),
                e('span', { className: 'dshs-meta' }, `${group.items.length} 个条目`)),
              isCollapsed ? null : e('div', { className: 'dshs-group-body' }, group.items.map(({ row, depth }) => e(TrashRow, {
                key: row.id,
                row,
                mark: markOf(annotations, row.id),
                selected: selectedTrash.has(row.id),
                busy: busy === row.id,
                nested: depth > 0,
                childCount: (childrenOf.get(row.id) ?? []).length,
                expanded: expandedTrash.has(row.id),
                onToggle: () => setExpandedTrash((current) => {
                  const next = new Set(current);
                  if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                  return next;
                }),
                onSelect: (checked) => setSelectedTrash((current) => {
                  const next = new Set(current);
                  if (checked) next.add(row.id); else next.delete(row.id);
                  return next;
                }),
                onRestore: () => run(row.id, async () => {
                  const data = await api('/restore', { id: row.id });
                  await refreshHost();
                  const count = 1 + (Array.isArray(data.children) ? data.children.length : 0);
                  showToast(count > 1 ? `已恢复 ${count} 个条目（含子会话）` : '已恢复', 'success');
                  emitChange();
                }),
                onPurge: () => {
                  const descendants = trash.filter((item) => item.parentSession === row.id).length;
                  setConfirm({
                    title: '彻底删除',
                    message: `彻底删除「${row.title ?? row.preview ?? '（空会话）'}」？${descendants > 0 ? ` 其 ${descendants} 个子会话也会一并彻底删除。` : ''}无法恢复。`,
                    danger: true,
                    onConfirm: async () => {
                      setConfirm(null);
                      await run(row.id, async () => {
                        const data = await api('/purge', { id: row.id });
                        const count = Array.isArray(data.purged) ? data.purged.length : 1;
                        showToast(count > 1 ? `已彻底删除 ${count} 个条目` : '已彻底删除', 'success');
                      });
                    },
                  });
                },
              }))));
          });
      } else {
        const rows = workspaces.filter((row) => {
          const text = `${row.title ?? ''} ${row.path ?? ''}`.toLowerCase();
          return search === '' || text.includes(search.toLowerCase());
        });
        body = rows.length === 0
          ? e('div', { className: 'dshs-empty' }, loading ? '加载中…' : '没有工作区')
          : e('div', null, rows.map((workspace, index) => {
            const position = workspaces.findIndex((item) => item.id === workspace.id);
            const move = (direction) => {
              const next = position;
              const anchor = direction < 0 ? workspaces[next - 1] : workspaces[next + 2];
              if (direction < 0 && anchor === undefined) return;
              if (direction > 0 && workspaces[next + 1] === undefined) return;
              run('workspace-order', async () => {
                await api('/workspace-order', { workspaceId: workspace.id, beforeId: anchor?.id });
              });
            };
            return e('div', { key: workspace.id, className: 'dshs-row' },
            e('div', { className: 'dshs-row-main' },
              e('span', { className: 'dshs-row-title' }, workspace.title ?? workspace.path),
              e('span', { className: `dshs-badge ${workspace.status === 'missing-dir' ? 'warn' : 'live'}` }, workspace.status === 'missing-dir' ? '目录缺失' : '正常')),
            e('div', { className: 'dshs-kv' }, workspace.path),
            e('div', { className: 'dshs-meta', style: { marginTop: 8 } },
              e('span', null, `${workspace.sessionCount ?? 0} 个会话`),
              e('span', null, workspace.updatedAt === undefined ? '' : `更新于 ${formatTime(workspace.updatedAt)}`)),
            e('div', { className: 'dshs-actions' },
              e('span', { className: 'dshs-meta' }, '排序'),
              e(Button, { onClick: () => move(-1), disabled: position <= 0 }, '上移'),
              e(Button, { onClick: () => move(1), disabled: position < 0 || position >= workspaces.length - 1 }, '下移'),
              e(Button, { onClick: () => { setTab('sessions'); setWorkspaceFilter(workspace.id); } }, '查看会话'),
              e(Button, { onClick: () => setRenaming(workspace) }, '重命名'),
              e(Button, { onClick: async () => {
                const ok = await copyText(workspace.path);
                showToast(ok ? '已复制路径' : '复制失败，请手动复制', ok ? 'success' : 'error');
              } }, '复制路径'),
              e(Button, { variant: 'danger', onClick: () => setRemovingWorkspace(workspace) }, '移除')));
          }));
      }

      const activeTotal = Number(stats?.sessions ?? sessions.length) || 0;
      const activeSub = Number(stats?.subagents ?? 0) || 0;
      const activeMain = Number(stats?.mainSessions ?? Math.max(0, activeTotal - activeSub)) || 0;
      const trashTotal = Number(stats?.trash ?? trash.length) || 0;
      const trashSub = Number(stats?.trashSubagents ?? trash.filter((row) => row.parentSession !== undefined).length) || 0;
      const trashMain = Number(stats?.trashMain ?? Math.max(0, trashTotal - trashSub)) || 0;

      return e('div', { className: 'dshs-root', style: { height: 'min(86vh, 900px)', width: 'min(1180px, 96vw)' } },
        header,
        toolbar,
        batchBar,
        error === '' ? null : e('div', { className: 'dshs-error', style: { margin: '8px 18px 0' } }, error),
        e('div', {
          ref: listRef, className: 'dshs-list',
          onScroll: (event) => { scrollPositions.current[tab] = event.currentTarget.scrollTop; },
        }, body),
        e('div', { className: 'dshs-footer' },
          e('span', { className: 'dshs-footer-stat', title: '全部会话：主会话 + 子会话' },
            '会话 ', e('b', null, String(activeMain)), ' 主 · ', e('b', null, String(activeSub)), ' 子'),
          e('span', { className: 'dshs-footer-stat', title: '没有标题和消息的会话' },
            '空会话 ', e('b', null, String(stats?.blank ?? 0))),
          e('span', { className: 'dshs-footer-stat', title: '当前正在执行的会话' },
            '运行中 ', e('b', null, String(stats?.running ?? 0))),
          e('span', { className: 'dshs-footer-stat', title: '已打开、可快速切换的会话' },
            '已打开 ', e('b', null, String(stats?.live ?? 0))),
          e('span', { className: 'dshs-footer-stat', title: '已归档的会话' },
            '已归档 ', e('b', null, String(stats?.archived ?? 0))),
          e('span', { className: 'dshs-footer-stat', title: '回收站：主会话 + 子会话' },
            '回收站 ', e('b', null, String(trashMain)), ' 主 · ', e('b', null, String(trashSub)), ' 子'),
          e('span', { className: 'dshs-footer-stat', title: '已注册工作区' },
            e('b', null, String(stats?.workspaces ?? workspaces.length)), '工作区'),
          e('span', { className: 'dshs-footer-stat', title: '有本地标记的会话' },
            e('b', null, String(stats?.annotations ?? 0)), '已标记会话'),
          e('span', { className: 'dshs-footer-stat', title: '会话日志总大小' },
            e('b', null, formatBytes(stats?.datasize)), '数据'),
          e('span', { style: { marginLeft: 'auto' } }, 'dsh-session · 本地标记')),
        showMaintenance ? e(MaintenanceDialog, {
          onClose: () => setShowMaintenance(false),
          onChanged: () => { load(); emitChange(); },
          dataDir: stats?.dataDir,
        }) : null,
        removingWorkspace === null ? null : e(WorkspaceRemoveDialog, {
          workspace: removingWorkspace,
          onClose: () => setRemovingWorkspace(null),
          onRemoved: async (data) => {
            emitChange();
            await load();
            const trashed = Array.isArray(data?.trashed) ? data.trashed.length : 0;
            const skipped = Array.isArray(data?.skipped) ? data.skipped.length : 0;
            if (trashed > 0 && skipped > 0) showToast(`已移除工作区，${trashed} 个会话移到回收站，${skipped} 个跳过`, 'info');
            else if (trashed > 0) showToast(`已移除工作区，${trashed} 个会话移到回收站`, 'success');
            else showToast('已移除工作区注册', 'success');
          },
        }),
        creatingWorkspace ? e(WorkspaceCreateDialog, {
          onClose: () => setCreatingWorkspace(false),
          onCreated: async () => {
            emitChange();
            await load();
            showToast('已添加工作区', 'success');
          },
        }) : null,
        renaming === null ? null : e(TextPromptDialog, {
          title: '重命名工作区',
          label: '工作区名称',
          initial: renaming.title ?? renaming.path,
          placeholder: '请输入新的工作区名称',
          onClose: () => setRenaming(null),
          onSave: async (name) => {
            await api('/workspace-rename', { workspaceId: renaming.id, title: name });
            await refreshHost();
            emitChange();
            await load();
          },
        }),
        renamingSession === null ? null : e(TextPromptDialog, {
          title: '重命名会话',
          label: '会话名称',
          initial: renamingSession.title,
          placeholder: '请输入新的会话名称',
          onClose: () => setRenamingSession(null),
          onSave: async (name) => {
            await api('/rename', { id: renamingSession.id, title: name });
            await refreshHost();
            emitChange();
            await load();
            showToast('已重命名', 'success');
          },
        }),
        editing === null ? null : e(AnnotationEditor, {
          id: editing.id, title: editing.title, preview: editing.preview, mark: editing.mark, onClose: () => setEditing(null), onSaved: () => load(),
        }),
        moving === null ? null : e(MoveDialog, {
          ids: moving.ids, titles: moving.titles, currentWorkspaceId: moving.currentWorkspaceId,
          onClose: () => setMoving(null), onDone: load,
        }),
        preset === null ? null : e(PresetDialog, {
          ids: preset.ids, titles: preset.titles, onClose: () => setPreset(null), onDone: load,
        }),
        batchTags ? e(BatchTagsDialog, {
          count: batchIds.length,
          onClose: () => setBatchTags(false),
          onRun: async (tags, mode) => {
            if (mode === 'append') {
              const resultValue = await run('batch-tags-append', async () => {
                const succeeded = [];
                const failed = [];
                for (const id of batchIds) {
                  const mark = markOf(annotations, id);
                  const next = [...new Set([...(mark.tags ?? []), ...tags])].slice(0, 20);
                  try {
                    await api('/annotations', { id, patch: { tags: next }, expectedRevision: mark.revision });
                    succeeded.push(id);
                  } catch (err) {
                    failed.push({ id, reason: err instanceof Error ? err.message : String(err) });
                  }
                }
                return { succeeded, failed };
              });
              if (resultValue !== undefined) setResult({ title: '批量追加标签结果', ...resultValue });
              return;
            }
            const resultValue = await run('batch-tags', async () => api('/batch-annotations', { ids: batchIds, patch: { tags } }));
            if (resultValue !== undefined) setResult({ title: mode === 'clear' ? '批量清空标签结果' : '批量替换标签结果', items: resultValue.items, summary: resultValue.summary });
          },
        }) : null,
        confirm === null ? null : e(Modal, {
          title: confirm.title, onClose: () => setConfirm(null), width: 440,
          footer: e(React.Fragment, null,
            e(Button, { onClick: () => setConfirm(null) }, '取消'),
            e(Button, { variant: confirm.danger ? 'danger' : 'primary', onClick: confirm.onConfirm }, '确定')),
        }, e('div', { style: { lineHeight: 1.6 } }, confirm.message)),
        result === null ? null : e(Modal, {
          title: result.title ?? '操作结果', onClose: () => setResult(null), width: 520,
          footer: e(React.Fragment, null,
            result.retry ? e(Button, {
              onClick: async () => { const retry = result.retry; setResult(null); await retry(); },
            }, '重试失败') : null,
            e(Button, { onClick: () => setResult(null) }, '关闭')),
        }, e(ResultView, { result })),
        progress === null ? null : e('div', { className: 'dshs-progress' },
          e('div', { className: 'dshs-progress-label' }, `${progress.label} · ${progress.current}/${progress.total}`),
          e('div', { className: 'dshs-progress-track' },
            e('div', { className: 'dshs-progress-fill', style: { width: `${Math.max(4, Math.round((progress.current / Math.max(1, progress.total)) * 100))}%` } }))),
        e(Toasts));
    }

    function reasonText(reason) {
      if (reason === 'live') return '已打开';
      if (reason === 'running') return '运行中';
      if (reason === 'subagent') return '子会话';
      return reason ?? '';
    }

    function ResultView({ result }) {
      const groups = [];
      if (Array.isArray(result.items)) {
        for (const item of result.items) {
          const key = item.status === 'success' ? '成功' : item.status === 'failed' ? '失败' : '跳过';
          groups.push({ key, text: `${item.sessionId}${item.error ? `：${item.error}` : item.unchanged ? '：无变化' : ''}` });
        }
      }
      if (Array.isArray(result.succeeded)) for (const id of result.succeeded) groups.push({ key: '成功', text: id });
      if (Array.isArray(result.failed)) for (const item of result.failed) groups.push({ key: '失败', text: `${item.id}：${reasonText(item.reason ?? item.error)}` });
      if (Array.isArray(result.moved)) for (const id of result.moved) groups.push({ key: '成功', text: typeof id === 'string' ? id : id.id });
      if (Array.isArray(result.skipped)) for (const item of result.skipped) groups.push({ key: '跳过', text: `${item.id}：${reasonText(item.reason)}` });
      if (Array.isArray(result.purged)) for (const id of result.purged) groups.push({ key: '已删除', text: id });
      if (Array.isArray(result.restored)) for (const item of result.restored) groups.push({ key: '已恢复', text: typeof item === 'string' ? item : item.id });
      const byKey = new Map();
      for (const group of groups) {
        if (!byKey.has(group.key)) byKey.set(group.key, []);
        byKey.get(group.key).push(group.text);
      }
      if (byKey.size === 0) return e('div', { className: 'dshs-empty' }, '操作完成');
      return e('div', null, [...byKey.entries()].map(([key, texts]) => e('div', { key, className: 'dshs-result-group' },
        e('b', null, `${key} (${texts.length})`),
        texts.slice(0, 50).map((text, index) => e('div', { key: `${key}-${index}`, className: 'dshs-result-item' }, text)),
        texts.length > 50 ? e('div', { className: 'dshs-result-item' }, `…还有 ${texts.length - 50} 条`) : null)));
    }

    function ManagerOverlay() {
      const open = useManagerOpen();
      if (!open) return null;
      return e('div', { className: 'dshs-backdrop', onMouseDown: (event) => { if (event.target === event.currentTarget) managerStore.set(false); } },
        e('div', { className: 'dshs-modal', style: { width: 'min(1180px, 96vw)', height: 'min(86vh, 900px)' } },
          e(ErrorBoundary, null, e(Page, { onClose: () => managerStore.set(false) }))));
    }

    function ManagerButton(props) {
      const open = useManagerOpen();
      const wide = props?.wide === true;
      return e(React.Fragment, null,
        e('button', {
          type: 'button',
          className: wide ? 'shub-footer-wide' : 'shub-footer-rail',
          title: '会话管理',
          'aria-label': '会话管理',
          'aria-pressed': open,
          onClick: () => managerStore.toggle(),
        }, wide ? e(React.Fragment, null, e(Icon, { name: 'list', size: 14 }), ' 会话与工作区') : e(Icon, { name: 'list', size: 16 })));
    }

    // ---------------------------------------------------------------- settings tab
    function SettingsTab() {
      const [stats, setStats] = React.useState(null);
      const [error, setError] = React.useState('');
      const [confirmCleanup, setConfirmCleanup] = React.useState(false);
      const [cleanupBusy, setCleanupBusy] = React.useState(false);
      const [pendingImport, setPendingImport] = React.useState(null);
      const [importBusy, setImportBusy] = React.useState(false);
      const annotationFileRef = React.useRef(null);
      const load = React.useCallback(() => {
        api('/stats').then(setStats).catch((err) => setError(err.message ?? String(err)));
      }, []);
      React.useEffect(() => { load(); }, [load]);

      const cleanup = async () => {
        setCleanupBusy(true);
        setError('');
        try {
          const value = await api('/cleanup-empty', {});
          const moved = Array.isArray(value.moved) ? value.moved.length : 0;
          const skipped = Array.isArray(value.skipped) ? value.skipped.length : 0;
          if (moved > 0) showToast(`已清理 ${moved} 个空会话`, 'success');
          else if (skipped > 0) showToast(`没有可清理的空会话（跳过 ${skipped} 个已打开会话）`, 'info');
          else showToast('没有可清理的空会话', 'info');
          await refreshHost();
          setConfirmCleanup(false);
          load();
        } catch (err) {
          setError(err.message ?? String(err));
        } finally {
          setCleanupBusy(false);
        }
      };

      const exportAnnotations = async () => {
        try {
          const data = await api('/annotations');
          const body = `${JSON.stringify({ version: 1, sessions: data.annotations ?? {} }, null, 2)}\n`;
          downloadBlob(new Blob([body], { type: 'application/json' }), 'session-annotations.json');
          showToast('已导出标记', 'success');
        } catch (err) {
          setError(err.message ?? String(err));
        }
      };

      const onImportFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file === undefined) return;
        try {
          const parsed = JSON.parse(await file.text());
          const sessions = parsed?.sessions ?? parsed?.annotations ?? parsed;
          if (sessions === null || typeof sessions !== 'object' || Array.isArray(sessions)) {
            throw new Error('JSON 里没有有效的标记对象');
          }
          setError('');
          setPendingImport({ sessions, count: Object.keys(sessions).length, fileName: file.name });
        } catch (err) {
          setError(err.message ?? String(err));
        }
      };

      const importAnnotations = async () => {
        if (pendingImport === null) return;
        setImportBusy(true);
        setError('');
        try {
          const result = await api('/annotations-import', { sessions: pendingImport.sessions });
          setPendingImport(null);
          showToast(`已导入 ${result.count ?? 0} 条标记`, 'success');
          load();
        } catch (err) {
          setError(err.message ?? String(err));
        } finally {
          setImportBusy(false);
        }
      };

      const clearMetadataCache = async () => {
        try {
          await api('/cache-clear', {});
          showToast('已清理列表缓存', 'success');
          load();
        } catch (err) {
          setError(err.message ?? String(err));
        }
      };

      return e('div', { className: 'dshs-root', style: { height: 'auto', padding: 4 } },
        e('div', { className: 'dshs-head', style: { border: 0, padding: '4px 0 12px' } },
          e('div', { className: 'dshs-title' }, e(Icon, { name: 'list', size: 17 }), 'dsh-session'),
          e('span', { style: { marginLeft: 'auto' } }, e(Button, { onClick: load }, '刷新'))),
        error === '' ? null : e('div', { className: 'dshs-error' }, error),
        stats === null
          ? e('div', { className: 'dshs-empty' }, '读取中…')
          : e(React.Fragment, null,
            e('div', { className: 'dshs-grid' },
              e('div', { className: 'dshs-card' }, e('div', { className: 'dshs-meta' }, '版本'), e('div', { className: 'dshs-big' }, stats.version ?? 'unknown')),
              e('div', { className: 'dshs-card' }, e('div', { className: 'dshs-meta' }, '会话'), e('div', { className: 'dshs-big' }, String(stats.sessions ?? 0)), e('div', { className: 'dshs-kv' }, `运行中 ${stats.running ?? 0} · 已打开 ${stats.live ?? 0} · 已归档 ${stats.archived ?? 0}`)),
              e('div', { className: 'dshs-card' }, e('div', { className: 'dshs-meta' }, '回收站'), e('div', { className: 'dshs-big' }, String(stats.trash ?? 0)), e('div', { className: 'dshs-kv' }, `已标记会话 ${stats.annotations ?? 0} 个`)),
              e('div', { className: 'dshs-card' }, e('div', { className: 'dshs-meta' }, '数据量'), e('div', { className: 'dshs-big' }, formatBytes(stats.datasize)))),
            e('div', { className: 'dshs-card', style: { marginTop: 10 } },
              e('div', { className: 'dshs-meta' }, '会话目录'),
              e('div', { className: 'dshs-kv' }, stats.root),
              e('div', { className: 'dshs-meta', style: { marginTop: 8 } }, '回收站 / 标记'),
              e('div', { className: 'dshs-kv' }, stats.trashRoot),
              e('div', { className: 'dshs-kv' }, stats.dataDir)),
            e('div', { className: 'dshs-card', style: { marginTop: 10 } },
              e('div', { className: 'dshs-meta' }, '数据维护'),
              e('div', { className: 'dshs-kv' }, `已标记会话 ${stats.annotations ?? 0} 个 · 列表缓存用于标题/预览`),
              e('div', { className: 'dshs-actions', style: { marginTop: 8 } },
                e(Button, { onClick: exportAnnotations }, '导出标记'),
                e(Button, { onClick: () => annotationFileRef.current?.click() }, '导入标记'),
                e(Button, { onClick: clearMetadataCache }, '清理列表缓存')),
              e('input', {
                ref: annotationFileRef, type: 'file', accept: '.json,application/json',
                style: { display: 'none' }, onChange: onImportFile,
              })),
            e('div', { className: 'dshs-actions', style: { marginTop: 12 } },
              e(Button, { variant: 'primary', onClick: () => managerStore.set(true) }, '打开会话管理'),
              e(Button, { onClick: () => setConfirmCleanup(true) }, '清理空会话'))),
        confirmCleanup ? e(Modal, {
          title: '清理空会话',
          onClose: () => { if (!cleanupBusy) setConfirmCleanup(false); },
          width: 430,
          footer: e(React.Fragment, null,
            e(Button, { onClick: () => setConfirmCleanup(false), disabled: cleanupBusy }, '取消'),
            e(Button, { variant: 'danger', onClick: cleanup, disabled: cleanupBusy }, cleanupBusy ? '清理中…' : '确定')),
        }, e('div', { style: { lineHeight: 1.6 } }, '把所有未打开、无标题且无消息的会话移到回收站？')) : null,
        pendingImport === null ? null : e(Modal, {
          title: '导入标记',
          onClose: () => { if (!importBusy) setPendingImport(null); },
          width: 460,
          footer: e(React.Fragment, null,
            e(Button, { onClick: () => setPendingImport(null), disabled: importBusy }, '取消'),
            e(Button, { variant: 'danger', onClick: importAnnotations, disabled: importBusy }, importBusy ? '导入中…' : '覆盖导入')),
        }, e('div', { style: { lineHeight: 1.6 } },
          `将用「${pendingImport.fileName}」中的 ${pendingImport.count} 条标记覆盖当前全部标记，确定继续？`)));
    }

    // ---------------------------------------------------------------- header actions
    function HeaderActions({ sessionId }) {
      const [row, setRow] = React.useState(undefined);
      const [mark, setMark] = React.useState({});
      const [busy, setBusy] = React.useState(false);
      const [editing, setEditing] = React.useState(false);
      const [renaming, setRenaming] = React.useState(false);
      const [menuOpen, setMenuOpen] = React.useState(false);
      const menuRef = React.useRef(null);
      const [moving, setMoving] = React.useState(false);
      const [preset, setPreset] = React.useState(false);
      const [confirmDelete, setConfirmDelete] = React.useState(false);
      const [error, setError] = React.useState('');
      const load = React.useCallback(async () => {
        if (!sessionId) return;
        try {
          const [list, annotations] = await Promise.all([api('/list'), api('/annotations')]);
          setRow((list.sessions ?? []).find((item) => item.id === sessionId));
          setMark(annotations.annotations?.[sessionId] ?? {});
        } catch (err) {
          setError(err.message ?? String(err));
        }
      }, [sessionId]);
      React.useEffect(() => { load(); }, [load]);
      React.useEffect(() => {
        const listener = () => load();
        bus.addEventListener('change', listener);
        let off = () => {};
        try { off = subscribeWorkspaceStateRef(listener); } catch { /* polling only */ }
        const timer = setInterval(listener, 3000);
        return () => {
          bus.removeEventListener('change', listener);
          off();
          clearInterval(timer);
        };
      }, [load]);

      React.useEffect(() => {
        if (!menuOpen) return undefined;
        const close = (event) => {
          if (menuRef.current !== null && !menuRef.current.contains(event.target)) setMenuOpen(false);
        };
        const escape = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', escape);
        return () => {
          document.removeEventListener('mousedown', close);
          document.removeEventListener('keydown', escape);
        };
      }, [menuOpen]);

      const toggle = async (patch) => {
        setBusy(true);
        setError('');
        try {
          const data = await api('/annotations', { id: sessionId, patch, expectedRevision: mark.revision });
          setMark(data.annotation);
          emitChange();
        } catch (err) {
          setError(err.message ?? String(err));
        } finally {
          setBusy(false);
        }
      };
      const pin = async () => {
        setBusy(true);
        setError('');
        try {
          await api('/pin', { id: sessionId, pinned: !(row?.pinned === true) });
          await refreshHost();
          emitChange();
          await load();
          showToast(row?.pinned ? '已取消置顶' : '已置顶', 'success');
        } catch (err) {
          setError(err.message ?? String(err));
        } finally {
          setBusy(false);
        }
      };
      const archive = async () => {
        setBusy(true);
        setError('');
        try {
          await api('/archive', { id: sessionId, archived: !(row?.archived === true) });
          await refreshHost();
          emitChange();
          await load();
          showToast(row?.archived ? '已取消归档' : '已归档', 'success');
        } catch (err) {
          setError(err.message ?? String(err));
        } finally {
          setBusy(false);
        }
      };
      const exportOne = async () => {
        setBusy(true);
        setError('');
        try {
          const data = await api(`/export?id=${encodeURIComponent(sessionId)}`);
          downloadBlob(new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' }), `${safeName(row?.title, sessionId)}.md`);
          showToast('已导出 Markdown', 'success');
        } catch (err) {
          setError(err.message ?? String(err));
        } finally {
          setBusy(false);
        }
      };
      const remove = async () => {
        setConfirmDelete(false);
        setBusy(true);
        setError('');
        try {
          await api('/move-to-trash', { id: sessionId, includeChildren: true });
          emitChange();
          await refreshHost();
          startNewSessionRef();
          showToast('已移到回收站', 'success');
        } catch (err) {
          setError(err.message ?? String(err));
        } finally {
          setBusy(false);
        }
      };

      return e('div', { style: { display: 'inline-flex', alignItems: 'center', gap: 2, height: 28, position: 'relative' } },
        e(IconButton, { name: 'pin', title: row?.pinned ? '取消置顶' : '置顶', on: row?.pinned === true, onClick: pin, disabled: busy }),
        e(IconButton, { name: 'pencil', title: '重命名会话', onClick: () => setRenaming(true), disabled: busy }),
        e(IconButton, { name: 'star', title: mark.favorite ? '取消收藏' : '收藏', on: mark.favorite === true, onClick: () => toggle({ favorite: !(mark.favorite === true) }), disabled: busy }),
        e(IconButton, { name: 'clock', title: mark.reviewLater ? '取消待回看' : '待回看', on: mark.reviewLater === true, onClick: () => toggle({ reviewLater: !(mark.reviewLater === true) }), disabled: busy }),
        e(IconButton, { name: 'tag', title: '标签 / 备注', onClick: () => setEditing(true), disabled: busy }),
        e('select', {
          className: 'dshs-select small', value: mark.priority === null || mark.priority === undefined ? '' : String(mark.priority),
          title: '优先级', disabled: busy,
          onChange: (event) => toggle({ priority: event.target.value === '' ? null : Number(event.target.value) }),
        },
        e('option', { value: '' }, 'P-'),
        [1, 2, 3, 4, 5].map((value) => e('option', { key: value, value: String(value) }, `P${value}`))),
        e(IconButton, { name: 'archive', title: row?.archived ? '取消归档' : '归档', on: row?.archived === true, onClick: archive, disabled: busy || row?.running === true }),
        e(IconButton, { name: 'download', title: '导出 Markdown', onClick: exportOne, disabled: busy }),
        e(IconButton, { name: 'copy', title: '复制 Session ID', onClick: async () => {
          const ok = await copyText(sessionId);
          showToast(ok ? '已复制 Session ID' : '复制失败，请手动复制', ok ? 'success' : 'error');
        } }),
        e('div', { ref: menuRef, style: { position: 'relative' } },
          e(IconButton, { name: 'more', title: '更多操作', on: menuOpen, onClick: () => setMenuOpen((value) => !value), disabled: busy }),
          menuOpen ? e('div', { className: 'dshs-menu' },
            e('button', {
              type: 'button', disabled: row?.cwd === undefined,
              onClick: async () => {
                setMenuOpen(false);
                const ok = await copyText(row.cwd);
                showToast(ok ? '已复制工作目录' : '复制失败，请手动复制', ok ? 'success' : 'error');
              },
            }, e(Icon, { name: 'copy', size: 13 }), '复制工作目录'),
            e('button', { type: 'button', onClick: () => { setMenuOpen(false); setMoving(true); } },
              e(Icon, { name: 'workspace', size: 13 }), '移动到工作区'),
            e('button', { type: 'button', onClick: () => { setMenuOpen(false); setPreset(true); } },
              e(Icon, { name: 'preset', size: 13 }), '迁移 Agent 预设')) : null),
        e(IconButton, { name: 'trash', title: '删除会话', onClick: () => setConfirmDelete(true), disabled: busy, danger: true }),
        error === '' ? null : e('div', {
          style: { position: 'fixed', top: 64, right: 16, zIndex: 10060, background: C.bg, border: `1px solid ${C.error}`, color: C.error, borderRadius: 8, padding: '8px 12px', fontSize: 12, maxWidth: 360, boxShadow: '0 6px 20px rgba(0,0,0,.18)' },
        }, error, e('button', { className: 'dshs-btn ghost', style: { marginLeft: 8 }, onClick: () => setError('') }, '知道了')),
        renaming ? e(TextPromptDialog, {
          title: '重命名会话',
          label: '会话名称',
          initial: row?.title ?? row?.preview ?? '',
          placeholder: '请输入新的会话名称',
          onClose: () => setRenaming(false),
          onSave: async (name) => {
            await api('/rename', { id: sessionId, title: name });
            await refreshHost();
            emitChange();
            await load();
            showToast('已重命名', 'success');
          },
        }) : null,
        editing ? e(AnnotationEditor, {
          id: sessionId, title: row?.title ?? row?.preview ?? sessionId, preview: row?.preview, mark,
          onClose: () => setEditing(false), onSaved: (annotation) => { setMark(annotation); emitChange(); },
        }) : null,
        confirmDelete ? e(Modal, {
          title: '删除会话', onClose: () => setConfirmDelete(false), width: 430,
          footer: e(React.Fragment, null,
            e(Button, { onClick: () => setConfirmDelete(false) }, '取消'),
            e(Button, { variant: 'danger', onClick: remove }, row?.running ? '停止并删除' : '删除')),
        }, e('div', { style: { lineHeight: 1.6 } },
          '确定把当前会话移到回收站吗？子会话会一并移动。',
          row?.running ? ' 当前回合仍在运行，删除会先停止它。' : ' 删除后会自动切换到新会话。')) : null,
        moving ? e(MoveDialog, {
          ids: [sessionId], titles: [row?.title ?? sessionId], currentWorkspaceId: row?.workspaceId,
          onClose: () => setMoving(false), onDone: load,
        }) : null,
        preset ? e(PresetDialog, {
          ids: [sessionId], titles: [row?.title ?? sessionId],
          onClose: () => setPreset(false), onDone: load,
        }) : null);
    }

    const SafeSettingsTab = (props) => e(ErrorBoundary, null, e(SettingsTab, props));
    const SafeHeaderActions = (props) => e(ErrorBoundary, null, e(HeaderActions, props));

    function DirectoryFlowOverlay() {
      const state = useDirectoryFlowState();
      const [flow, setFlow] = React.useState(null);
      React.useEffect(() => {
        if (state.open) setFlow(officialFlowRef());
        else setFlow(null);
      }, [state.open]);
      if (!state.open || flow === null || flow === undefined) return null;
      return e('div', { style: { position: 'fixed', inset: 0, zIndex: 10060, pointerEvents: 'auto' } },
        e(flow.component, {
          ...flow.inject,
          open: true,
          busy: state.busy === true,
          onPicked: state.onPicked ?? (() => {}),
          onCancel: state.onCancel ?? (() => {}),
          onError: state.onError ?? (() => {}),
        }));
    }

    // ---------------------------------------------------------------- apply
    function apply(ctx) {
      const applyHostRefs = () => {
        openSessionRef = (row) => {
          const workspace = ctx.get?.('uiWorkspace') ?? ctx.uiWorkspace;
          if (workspace?.openSession === undefined) return;
          if (row.isSubagent === true && row.parentSession !== undefined) {
            workspace.openSession({ parentSessionId: row.parentSession, childSessionId: row.id, mode: 'continuable' });
          } else {
            workspace.openSession(row.id);
          }
        };
        startNewSessionRef = () => {
          const workspace = ctx.get?.('uiWorkspace') ?? ctx.uiWorkspace;
          try { workspace?.startSession?.(); } catch { /* no ui workspace */ }
        };
        pickDirectoryRef = async () => {
          const workspace = ctx.get?.('uiWorkspace') ?? ctx.uiWorkspace;
          try { return await workspace?.pickDirectory?.() ?? null; } catch { return null; }
        };
        listDirectoryRef = async (path) => {
          const workspace = ctx.get?.('uiWorkspace') ?? ctx.uiWorkspace;
          try { return await workspace?.listDirectory?.(path) ?? null; } catch { return null; }
        };
        createDirectoryRef = async (path, name) => {
          const workspace = ctx.get?.('uiWorkspace') ?? ctx.uiWorkspace;
          try { return await workspace?.createDirectory?.(path, name) ?? null; } catch { return null; }
        };
        subscribeWorkspaceStateRef = (listener) => {
          try {
            const workspace = ctx.get?.('workspaces') ?? ctx.workspaces;
            const list = workspace?.list;
            if (typeof list?.subscribe === 'function') return list.subscribe(listener);
          } catch { /* fallback to polling */ }
          return () => {};
        };
        officialFlowRef = () => {
          try {
            const entries = ctx.slots?.entries?.('sidebar.workspaces.directoryFlow') ?? [];
            const entry = entries.find((item) => typeof item.component === 'function');
            if (entry === undefined) return null;
            const workspace = ctx.get?.('uiWorkspace') ?? ctx.uiWorkspace;
            const locale = ctx.get?.('locale') ?? ctx.locale;
            const t = typeof locale?.bind === 'function' ? locale.bind('directory-browser') : ((key) => key);
            const injected = typeof entry.inject === 'function' ? entry.inject() : {};
            return {
              component: entry.component,
              inject: {
                listDirectory: (path, signal) => workspace.listDirectory(path, signal),
                createDirectory: (path, name) => workspace.createDirectory(path, name),
                t,
                ...injected,
              },
            };
          } catch { return null; }
        };
        refreshHostRef = async () => {
          const sessions = ctx.get?.('sessions') ?? ctx.sessions;
          const workspaces = ctx.get?.('workspaces') ?? ctx.workspaces;
          try { await sessions?.refresh?.(); } catch { /* best effort */ }
          try { await workspaces?.refresh?.(); } catch { /* best effort */ }
          setTimeout(() => {
            try { sessions?.refresh?.(); } catch { /* best effort */ }
            try { workspaces?.refresh?.(); } catch { /* best effort */ }
          }, 300);
        };
      };
      applyHostRefs();

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'session-hub-overlay',
        order: 60,
      }, ManagerOverlay));
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'session-hub-directory-flow',
        order: 61,
      }, DirectoryFlowOverlay));
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'session-hub-footer',
        order: 30,
      }, ManagerButton));
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'session-hub-header-actions',
        order: 45,
      }, SafeHeaderActions));
      ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab',
        id: 'dsh-session',
        order: 70,
        label: '会话管理',
      }, SafeSettingsTab));
    }

    const module = { exports: { name: 'dsh-session', inject: ['slots'], apply } };
    return module.exports;
  },
});
