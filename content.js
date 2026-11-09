(() => {
  const TOPIC = location.pathname.match(/^\/t\/(\d+)/)?.[1];
  const KEY = 'v2e:' + TOPIC;
  // #楼层 | 疑似 base64
  const RE = /#(\d+)|(?<![\w+/=])[A-Za-z0-9+/]{8,}={0,2}(?![\w+/=])/g;

  // 离开话题即清空缓存：删掉不属于当前话题的 key（关 tab 时 sessionStorage 自动清）
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const k = sessionStorage.key(i);
    if (k.startsWith('v2e:') && k !== KEY) sessionStorage.removeItem(k);
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  const annotate = s => s.replace(RE, (m, floor) => {
    const d = floor ? null : tryDecode(m);
    return d ?? m;
  });
  const apiError = r => new Error(r.status === 429 ? 'API 限流，稍后再试' : 'HTTP ' + r.status);
  const once = (map, k, fn) => {
    if (!map.has(k)) map.set(k, fn().catch(e => { map.delete(k); throw e; }));
    return map.get(k);
  };

  // ---------- 回复数据：当前页取 DOM，其它页一次性拉 v1 API（全部回复、不分页），存 sessionStorage ----------
  let dom;
  function domRows() {
    return dom ??= [...document.querySelectorAll('div.cell[id^="r_"]')].map(c => {
      const t = c.querySelector('.reply_content').cloneNode(true);
      t.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
      return [+c.querySelector('.no').textContent, c.querySelector('strong a[href^="/member/"]').textContent, t.textContent.trim()];
    });
  }

  const cache = new Map();
  const allReplies = () => once(cache, KEY, async () => {
    const saved = JSON.parse(sessionStorage.getItem(KEY));
    if (saved?.rows) return saved;
    const r = await fetch(`/api/replies/show.json?topic_id=${TOPIC}`);
    if (!r.ok) throw apiError(r);
    const list = await r.json();
    const data = {
      rows: list.map(x => [x.member.username, x.content]), // 楼层 = 下标 + 1
      // 回复里自带回帖人资料，存下来给头像卡片用，省掉 members 接口调用
      mem: Object.fromEntries(list.map(({ member: m }) => [m.username.toLowerCase(), {
        status: 'found', id: m.id, username: m.username, created: m.created, avatar_large: m.avatar_large, pro: m.pro,
        tagline: m.tagline, bio: m.bio, location: m.location, website: m.website, github: m.github, twitter: m.twitter,
      }])),
    };
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch {}
    return data;
  });
  const repliesLoaded = () => TOPIC && (cache.has(KEY) || sessionStorage.getItem(KEY));

  // 楼层 < before 的全部回复
  async function rowsBefore(before) {
    const cur = domRows();
    const min = cur[0]?.[0] ?? before;
    const prev = min > 1 ? (await allReplies()).rows.slice(0, min - 1).map((r, i) => [i + 1, ...r]) : [];
    return prev.concat(cur).filter(r => r[0] < before);
  }

  async function reply(floor) {
    const hit = domRows().find(r => r[0] === floor);
    if (hit) return hit;
    const r = (await allReplies()).rows[floor - 1];
    return r && [floor, ...r];
  }

  const replyHtml = ([floor, user, text]) =>
    `<div class="v2e-reply"><span class="v2e-meta">#${floor} ${esc(user)}</span><div class="v2e-text">${esc(annotate(text))}</div></div>`;

  // ---------- 用户信息 ----------
  const members = new Map();
  const member = u => once(members, u.toLowerCase(), async () => {
    // 话题回复已加载过就直接用里面的资料；没加载过不为了头像去拉整个话题
    const m = repliesLoaded() && (await allReplies().catch(() => null))?.mem[u.toLowerCase()];
    if (m) return m;
    const r = await fetch(`/api/members/show.json?username=${encodeURIComponent(u)}`);
    if (!r.ok) throw apiError(r);
    return r.json();
  });

  async function memberHtml(u) {
    const m = await member(u);
    if (m.status !== 'found') return '用户不存在';
    const days = Math.floor((Date.now() / 1000 - m.created) / 86400);
    const extra = [
      ['签名', m.tagline], ['简介', m.bio], ['所在地', m.location], ['网站', m.website],
      ['GitHub', m.github], ['Twitter', m.twitter],
    ].filter(([, v]) => v).map(([k, v]) => `<div><span class="v2e-meta">${k}：</span>${esc(v)}</div>`).join('');
    return `<div class="v2e-member"><img src="${esc(m.avatar_large)}"><div>
      <a href="/member/${encodeURIComponent(m.username)}"><b>${esc(m.username)}</b></a>${m.pro ? ' <span class="v2e-meta">PRO</span>' : ''}
      <div class="v2e-meta">V2EX 第 ${m.id} 号会员，加入于 ${new Date(m.created * 1000).toLocaleDateString('zh-CN')}（${days} 天）</div>
      ${extra}</div></div>`;
  }

  // ---------- 正文处理：#N 包成 span，base64 后面插入解码 ----------
  function decorate(root, floors) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentElement.closest('a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) {
      const s = n.data, frag = document.createDocumentFragment();
      let last = 0;
      for (const m of s.matchAll(RE)) {
        const end = m.index + m[0].length, span = document.createElement('span');
        if (m[1]) {
          if (!floors || +m[1] < 1) continue;
          span.className = 'v2e-floor';
          span.textContent = m[0];
          frag.append(s.slice(last, m.index), span);
        } else {
          const d = tryDecode(m[0]);
          if (d == null) continue;
          // 原文替换成解码结果，悬停看原文
          span.className = 'v2e-b64';
          span.title = 'base64 原文：' + m[0];
          // 解码文本里的 http(s) 链接变成可点击（只认 http(s)，挡掉 javascript: 之类；遇到空白/中文/括号截断）
          span.append(...d.split(/(https?:\/\/[^\s()　-鿿＀-￯]+)/i).map((p, i) => i % 2
            ? Object.assign(document.createElement('a'), { href: p, target: '_blank', rel: 'noopener noreferrer', textContent: p })
            : p));
          frag.append(s.slice(last, m.index), span);
        }
        last = end;
      }
      if (last) {
        frag.append(s.slice(last));
        n.replaceWith(frag);
      }
    }
  }
  if (TOPIC) domRows(); // 先取干净文本，再改 DOM
  document.querySelectorAll('.reply_content, .topic_content').forEach(el => decorate(el, !!TOPIC));

  // ---------- 悬浮层：全局一个委托监听 + 一个复用的浮层 ----------
  const tip = document.createElement('div');
  tip.className = 'v2e-tip';
  tip.hidden = true;
  document.body.append(tip);
  let showTimer, hideTimer, seq = 0;

  function target(t) {
    if (!TOPIC) return;
    const floorOf = () => +t.closest('div.cell[id^="r_"]')?.querySelector('.no')?.textContent || Infinity;
    if (t.classList.contains('v2e-floor')) {
      const f = +t.textContent.slice(1);
      return async () => {
        const r = await reply(f);
        return r ? replyHtml(r) : `未找到 #${f} 楼`;
      };
    }
    if (t.matches('.reply_content a[href^="/member/"]') && t.previousSibling?.textContent?.endsWith('@')) {
      const u = t.textContent.toLowerCase(), before = floorOf();
      return async () => {
        const rows = (await rowsBefore(before)).filter(r => r[1].toLowerCase() === u);
        return rows.length ? rows.map(replyHtml).join('') : `${esc(t.textContent)} 在此楼之前没有回复`;
      };
    }
  }

  // 默认放下方；下方放不下且上方更宽敞时放上方（贴着目标向上长）
  function place(el) {
    const r = el.getBoundingClientRect(), vh = document.documentElement.clientHeight;
    const up = vh - r.bottom < 330 && r.top > vh - r.bottom; // 330 = 最大高度 320 + 间距
    tip.style.maxHeight = `${Math.min(320, (up ? r.top : vh - r.bottom) - 12)}px`;
    tip.style.top = `${(up ? r.top - tip.offsetHeight - 6 : r.bottom + 6) + scrollY}px`;
    tip.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 504)) + scrollX}px`;
  }

  function show(el, render) {
    const id = ++seq;
    const fill = h => {
      if (id !== seq) return;
      tip.innerHTML = h;
      place(el); // 内容高度变了，重新定位
    };
    tip.classList.toggle('v2e-dark', !!document.querySelector('#Wrapper.Night'));
    tip.hidden = false;
    fill('加载中…');
    render().then(fill, e => fill(esc('加载失败：' + e.message)));
  }

  document.addEventListener('mouseover', e => {
    if (tip.contains(e.target)) return clearTimeout(hideTimer);
    const render = target(e.target);
    if (!render) return;
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    showTimer = setTimeout(() => show(e.target, render), 250);
  });
  // 头像：点击才查（不是悬浮），Ctrl/Shift/中键点击保持原本跳转主页
  document.addEventListener('click', e => {
    const img = e.target;
    if (!img.matches?.('img.avatar') || tip.contains(img) || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const u = img.alt || img.closest('a[href^="/member/"]')?.pathname.split('/')[2];
    if (!u) return;
    e.preventDefault();
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    show(img, () => memberHtml(u));
  });
  document.addEventListener('mouseout', () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer); // 只保留一个计时器，否则进入浮层时取消不掉早先的，浮层会被关掉
    hideTimer = setTimeout(() => { seq++; tip.hidden = true; }, 200);
  });
})();
