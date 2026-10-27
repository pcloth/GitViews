/* Runs only inside the VS Code webview. All repository text is rendered as text. */
(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  const zh = document.documentElement.lang.startsWith('zh');
  const t = (en, cn) => zh ? cn : en;
  const send = (type, data = {}) => vscode.postMessage({ type, ...data });
  const saved = vscode.getState() || {};
  const viewportPositions = new Map();
  let state = { commits: [], graph: [], repositories: [], refs: [] };
  let repositoryKey = '';
  let refKey = '';
  let filterTimer;
  let pendingFrame = false;
  const rowHeight = 54;
  const app = document.getElementById('app');
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const button = (text, action, className = '') => {
    const node = el('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node;
  };
  const select = label => { const node = el('select'); node.setAttribute('aria-label', label); node.title = label; return node; };
  const toolbar = el('div', 'toolbar');
  const repository = select(t('Repository', '仓库'));
  const refresh = button('↻', () => send('refresh'), 'icon-button'); refresh.title = t('Refresh', '刷新'); refresh.setAttribute('aria-label', refresh.title);
  const locate = button('#', () => send('locate'), 'icon-button'); locate.title = t('Go to commit', '定位提交'); locate.setAttribute('aria-label', locate.title);
  toolbar.append(repository, locate, refresh);
  const filters = el('div', 'filters');
  const branch = select(t('Branch or tag', '分支或标签'));
  const search = el('input'); search.type = 'search'; search.placeholder = t('Search commit message…', '搜索提交说明…'); search.setAttribute('aria-label', search.placeholder);
  const author = el('input'); author.type = 'search'; author.placeholder = t('Author…', '作者…'); author.setAttribute('aria-label', author.placeholder);
  filters.append(branch, search, author);
  const banner = el('div', 'banner');
  const feedback = el('div', 'feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  const history = el('div', 'history'); history.setAttribute('role', 'listbox'); history.setAttribute('aria-label', t('Commit history', '提交历史')); history.tabIndex = 0;
  const rows = el('div', 'rows'); history.append(rows);
  const more = button(t('Load more', '加载更多'), () => send('more'), 'more');
  const split = el('div', 'splitter'); split.tabIndex = 0; split.setAttribute('role', 'separator'); split.setAttribute('aria-orientation', 'horizontal'); split.setAttribute('aria-label', t('Resize commit details', '调整提交详情高度')); split.setAttribute('aria-valuemin', '20'); split.setAttribute('aria-valuemax', '70');
  const details = el('section', 'details'); details.setAttribute('aria-label', t('Commit details', '提交详情'));
  const detailsHeight = Math.min(70, Math.max(20, Number(saved.detailsHeight) || 38));
  details.style.flexBasis = `${detailsHeight}%`; split.setAttribute('aria-valuenow', String(detailsHeight));
  app.append(toolbar, filters, banner, feedback, history, more, split, details);

  function persist(extra = {}) { vscode.setState({ ...vscode.getState(), scrollTop: history.scrollTop, repositoryId: state.repositoryId, ...extra }); }
  repository.addEventListener('change', () => { history.scrollTop = 0; send('repository', { id: repository.value }); });
  const applyFilters = () => { history.scrollTop = 0; send('filter', { ref: branch.value, search: search.value, author: author.value }); };
  branch.addEventListener('change', applyFilters);
  for (const input of [search, author]) {
    input.addEventListener('input', () => { clearTimeout(filterTimer); filterTimer = setTimeout(applyFilters, 300); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { clearTimeout(filterTimer); applyFilters(); } });
  }
  history.addEventListener('scroll', () => {
    persist();
    if (!pendingFrame) requestAnimationFrame(() => { pendingFrame = false; renderRows(); });
    pendingFrame = true;
    if (!state.loading && state.more && history.scrollHeight - history.scrollTop - history.clientHeight < 120) send('more');
  });
  history.addEventListener('keydown', event => {
    const index = state.commits.findIndex(commit => commit.hash === state.selected);
    let next;
    if (event.key === 'ArrowDown') next = Math.min(state.commits.length - 1, index + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = state.commits.length - 1;
    if (next !== undefined && state.commits[next]) { event.preventDefault(); send('select', { hash: state.commits[next].hash }); }
  });
  rows.addEventListener('click', event => {
    const row = event.target.closest('[data-hash]'); if (row) send('select', { hash: row.dataset.hash });
  });
  rows.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      const row = event.target.closest('[data-hash]'); if (row) { event.preventDefault(); send('select', { hash: row.dataset.hash }); }
    }
  });

  function setDetailsHeight(value) {
    value = Math.min(70, Math.max(20, value)); details.style.flexBasis = `${value}%`;
    split.setAttribute('aria-valuenow', String(Math.round(value))); persist({ detailsHeight: value }); renderRows();
  }
  split.addEventListener('pointerdown', event => { split.setPointerCapture(event.pointerId); });
  split.addEventListener('pointermove', event => {
    if (split.hasPointerCapture(event.pointerId)) setDetailsHeight((app.clientHeight - event.clientY) / app.clientHeight * 100);
  });
  split.addEventListener('pointerup', event => { if (split.hasPointerCapture(event.pointerId)) split.releasePointerCapture(event.pointerId); });
  split.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setDetailsHeight(parseFloat(details.style.flexBasis) + (event.key === 'ArrowUp' ? 5 : -5)); }
  });
  new ResizeObserver(() => renderRows()).observe(history);

  function options(node, items, value) {
    node.replaceChildren(...items.map(item => { const option = el('option', '', item.label); option.value = item.value; option.title = item.title || item.label; return option; }));
    node.value = value || '';
  }

  function render() {
    const nextRepositoryKey = state.repositories.map(item => `${item.id}:${item.name}`).join('|');
    if (nextRepositoryKey !== repositoryKey) {
      options(repository, state.repositories.map(item => ({ value: item.id, label: item.name, title: item.path })), state.repositoryId);
      repositoryKey = nextRepositoryKey;
    }
    repository.value = state.repositoryId || '';
    const nextRefKey = JSON.stringify(state.refs);
    if (nextRefKey !== refKey) {
      options(branch, [{ value: '', label: t('All branches & tags', '全部分支与标签') }, ...state.refs.filter(ref => ref.name !== 'HEAD').map(ref => ({ value: ref.name, label: ref.name.replace(/^refs\/(heads|tags|remotes)\//, '') }))], state.ref);
      refKey = nextRefKey;
    }
    branch.value = state.ref || '';
    if (document.activeElement !== search) search.value = state.search || '';
    if (document.activeElement !== author) author.value = state.author || '';
    banner.replaceChildren(); banner.hidden = !state.contextHash;
    if (state.contextHash) banner.append(el('span', '', `${t('Commit & ancestors', '提交及祖先')} ${state.contextHash.slice(0, 8)}`), button(t('Back', '返回'), () => send('back')));
    feedback.textContent = state.error || (state.loading ? t('Loading…', '正在加载…') : !state.repositories.length ? t('No Git repositories. Open a folder containing a Git repository and ensure Git is enabled.', '没有 Git 仓库。请打开包含 Git 仓库的文件夹，并确保 Git 已启用。') : !state.commits.length ? t('No commits match. This repository may be empty.', '没有匹配的提交，或仓库尚无提交。') : state.search || state.author ? t('Filtered history: connections through hidden commits are omitted.', '已筛选历史：不显示经过隐藏提交的连线。') : '');
    feedback.classList.toggle('error', !!state.error); feedback.hidden = !feedback.textContent;
    repository.disabled = !state.repositories.length;
    for (const control of [branch, search, author, locate]) control.disabled = !state.repositoryId;
    more.hidden = !state.more; more.disabled = !!state.loading;
    history.setAttribute('aria-busy', String(!!state.loading));
    if (state.reveal && state.selected) {
      const index = state.commits.findIndex(commit => commit.hash === state.selected);
      if (index >= 0 && (index * rowHeight < history.scrollTop || (index + 1) * rowHeight > history.scrollTop + history.clientHeight)) history.scrollTop = Math.max(0, index * rowHeight - history.clientHeight / 3);
    }
    renderRows(); renderDetails();
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  function graphSvg(row) {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(row.width * 14 + 10)); svg.setAttribute('height', String(rowHeight)); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('graph');
    for (const column of row.incoming) {
      const path = document.createElementNS(svgNS, 'path');
      const x = column * 14 + 9; path.setAttribute('d', `M${x} 0 L${x} 27`);
      path.setAttribute('class', `lane lane-${column % 6}`); svg.append(path);
    }
    for (const edge of row.edges) {
      const from = edge.from * 14 + 9; const to = edge.to * 14 + 9;
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', `M${from} 27 C${from} 42 ${to} 40 ${to} 54`);
      path.setAttribute('class', `lane lane-${edge.color % 6}`); svg.append(path);
    }
    const node = document.createElementNS(svgNS, 'circle'); node.setAttribute('cx', String(row.column * 14 + 9)); node.setAttribute('cy', '27'); node.setAttribute('r', '3.5'); node.setAttribute('class', `node lane-${row.column % 6}`); svg.append(node);
    return svg;
  }

  function renderRows() {
    const focused = rows.contains(document.activeElement);
    const start = Math.max(0, Math.floor(history.scrollTop / rowHeight) - 10);
    const end = Math.min(state.commits.length, start + Math.ceil(history.clientHeight / rowHeight) + 22);
    const fragment = document.createDocumentFragment();
    const top = el('div'); top.style.height = `${start * rowHeight}px`; top.setAttribute('aria-hidden', 'true'); fragment.append(top);
    const refs = new Map();
    for (const ref of state.refs) { if (!refs.has(ref.hash)) refs.set(ref.hash, []); refs.get(ref.hash).push(ref.name.replace(/^refs\/(heads|tags|remotes)\//, '')); }
    for (let i = start; i < end; i++) {
      const commit = state.commits[i]; const graph = state.graph[i];
      const row = el('div', `commit${state.selected === commit.hash ? ' selected' : ''}`);
      row.dataset.hash = commit.hash; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(state.selected === commit.hash)); row.tabIndex = state.selected === commit.hash ? 0 : -1;
      row.setAttribute('aria-posinset', String(i + 1)); row.setAttribute('aria-setsize', state.more ? '-1' : String(state.commits.length));
      row.title = `${commit.message}\n${commit.author} · ${new Date(commit.authorDate).toLocaleString()}\n${commit.hash}`;
      if (graph) row.append(graphSvg(graph));
      const text = el('div', 'commit-text'); text.append(el('div', 'subject', commit.subject));
      const meta = el('div', 'meta');
      if (refs.has(commit.hash)) { const badge = el('span', 'ref', refs.get(commit.hash).join(', ')); badge.title = badge.textContent; meta.append(badge); }
      meta.append(el('span', 'sha', commit.hash.slice(0, 8)), el('span', 'author', commit.author));
      const date = el('time', '', new Date(commit.authorDate).toLocaleDateString()); date.dateTime = commit.authorDate; meta.append(date);
      text.append(meta); row.append(text); fragment.append(row);
    }
    const bottom = el('div'); bottom.style.height = `${(state.commits.length - end) * rowHeight}px`; bottom.setAttribute('aria-hidden', 'true'); fragment.append(bottom);
    rows.replaceChildren(fragment);
    if (focused) rows.querySelector('.selected')?.focus({ preventScroll: true });
  }

  let previousDetailKey = '';
  function renderDetails() {
    const detail = state.details;
    const key = detail ? `${detail.commit.hash}:${detail.parent || ''}` : '';
    const scroll = key === previousDetailKey ? details.scrollTop : 0;
    previousDetailKey = key;
    details.replaceChildren();
    if (!detail) { details.append(el('p', 'empty', state.selected ? t('Loading commit details…', '正在加载提交详情…') : t('Select a commit to inspect its changes.', '选择提交，查看修改内容。'))); return; }
    const commit = detail.commit;
    const heading = el('div', 'detail-heading'); heading.append(el('strong', '', state.comparison ? `${state.comparison.base.slice(0, 8)} ↔ ${state.comparison.target.slice(0, 8)}` : commit.hash.slice(0, 8)), button(t('Copy SHA', '复制 SHA'), () => send('copy')));
    const actions = el('div', 'detail-actions');
    actions.append(button(t('Set comparison base', '设为比较起点'), () => send('setBase')));
    if (state.comparisonBase) { const compare = button(`${t('Compare with', '与起点比较')} ${state.comparisonBase.slice(0, 8)}`, () => send('compare')); compare.disabled = state.comparisonBase === commit.hash; actions.append(compare); }
    details.append(heading, el('div', 'detail-meta', `${commit.author} <${commit.email}>\n${new Date(commit.authorDate).toLocaleString()}`), el('pre', 'message', commit.message), actions);
    if (!state.comparison && commit.parents.length > 1) {
      const label = el('label', 'parent-label', t('Compare parent ', '比较父提交 ')); const parent = select(t('Parent commit', '父提交'));
      options(parent, commit.parents.map((hash, i) => ({ label: `${i + 1}: ${hash.slice(0, 8)}`, value: hash })), detail.parent);
      parent.addEventListener('change', () => send('parent', { hash: parent.value })); label.append(parent); details.append(label);
    } else if (!state.comparison && commit.parents.length) details.append(el('div', 'parent-hash', `${t('Parent', '父提交')}: ${commit.parents.map(hash => hash.slice(0, 8)).join(', ')}`));
    details.append(el('h3', '', `${t('Changed files', '变更文件')} (${detail.files.length})`));
    if (!detail.files.length) details.append(el('p', 'empty', t('No file changes relative to this base.', '相对此起点没有文件变更。')));
    const files = el('div', 'files');
    detail.files.forEach((file, index) => {
      const entry = button('', () => send('file', { index }), 'file'); entry.title = file.status === 'R' ? `${file.oldPath} → ${file.path}` : file.path;
      entry.append(el('span', `status status-${file.status}`, file.status), el('span', 'file-path', file.status === 'R' ? `${file.oldPath} → ${file.path}` : file.path));
      const stats = el('span', 'file-stats');
      if (file.binary) stats.append(el('span', '', t('binary', '二进制')));
      else stats.append(el('span', 'additions', `+${file.additions}`), el('span', 'deletions', `−${file.deletions}`));
      entry.append(stats); files.append(entry);
    });
    details.append(files); details.scrollTop = scroll;
  }

  let firstMessage = true;
  window.addEventListener('message', event => {
    if (!event.data || event.data.type !== 'state') return;
    const previousKey = `${state.repositoryId || ''}:${state.contextHash || ''}`;
    const nextKey = `${event.data.repositoryId || ''}:${event.data.contextHash || ''}`;
    if (previousKey !== nextKey) viewportPositions.set(previousKey, history.scrollTop);
    state = event.data;
    render();
    if (previousKey !== nextKey && !state.reveal) {
      history.scrollTop = viewportPositions.get(nextKey) || 0; renderRows();
    }
    if (firstMessage && !state.loading && state.repositoryId) {
      if (saved.repositoryId === state.repositoryId && !state.reveal) { history.scrollTop = Number(saved.scrollTop) || 0; renderRows(); }
      firstMessage = false;
    }
  });
  render(); send('ready');
})();
