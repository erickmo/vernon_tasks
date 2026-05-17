/* Vernon Tasks Docs — shared layout injector (topbar + sidebar + on-this-page) */
(function () {
  'use strict';

  const root = document.body.dataset.root || './';
  const currentPath = window.location.pathname.split('/').slice(-2).join('/');
  const currentFile = window.location.pathname.split('/').pop() || 'index.html';

  // Audience: all | dev | user | admin
  const AUDIENCE_KEY = 'vernon-docs-audience';
  const NAV = [
    {
      title: 'Getting Started',
      audience: ['all'],
      items: [
        { label: 'Documentation Home', href: 'index.html' },
        { label: 'System Overview (PRD)', href: 'prd/overview.html' },
        { label: 'ERD Diagram', href: 'erd.html' }
      ]
    },
    {
      title: 'All Docs',
      audience: ['all'],
      items: [
        { label: 'Index', href: 'index.html' },
        { label: 'PRD', href: 'prd/index.html' },
        { label: 'TRD', href: 'trd/index.html' },
        { label: 'ADR', href: 'adr/index.html' },
        { label: 'ERD', href: 'erd.html' },
        { label: 'Implementation Tracker', href: 'implementation-tracker.html' }
      ]
    },
    {
      title: 'For Developers',
      audience: ['dev'],
      badge: { cls: 'nb-dev', text: 'Dev' },
      items: [
        { label: 'PRD Index', href: 'prd/index.html' },
        { label: '↳ Domain Model', href: 'prd/domain.html', child: true },
        { label: '↳ Features & APIs', href: 'prd/features.html', child: true },
        { label: 'TRD Index', href: 'trd/index.html' },
        { label: '↳ Architecture', href: 'trd/architecture.html', child: true },
        { label: '↳ Contracts', href: 'trd/contracts.html', child: true },
        { label: '↳ Quality', href: 'trd/quality.html', child: true },
        { label: 'ADR Log', href: 'adr/index.html' },
        { label: '↳ Foundation', href: 'adr/foundation.html', child: true },
        { label: '↳ Data', href: 'adr/data.html', child: true },
        { label: '↳ UI / Mobile', href: 'adr/ui-mobile.html', child: true },
        { label: '↳ Operations', href: 'adr/operations.html', child: true },
        { label: 'Developer Guide', href: 'DEVELOPER_GUIDE.md' },
        { label: 'API Reference', href: 'API_REFERENCE.md' }
      ]
    },
    {
      title: 'For Users',
      audience: ['user'],
      badge: { cls: 'nb-user', text: 'User' },
      items: [
        { label: 'PRD Overview', href: 'prd/overview.html' },
        { label: 'Features Walkthrough', href: 'prd/features.html' }
      ]
    },
    {
      title: 'For Admins',
      audience: ['admin'],
      badge: { cls: 'nb-admin', text: 'Admin' },
      items: [
        { label: 'Operations & Rollout', href: 'prd/ops.html' },
        { label: 'Infrastructure', href: 'trd/infrastructure.html' },
        { label: 'PWA Pilot Checklist', href: 'rollout/pwa-pilot.md' }
      ]
    },
    {
      title: 'Changelog',
      audience: ['all'],
      items: [
        { label: 'PRD.html (legacy)', href: 'PRD.html' },
        { label: 'ADR.html (legacy)', href: 'ADR.html' },
        { label: 'TRD.html (legacy)', href: 'TRD.html' }
      ]
    }
  ];

  function getAudience() {
    try { return localStorage.getItem(AUDIENCE_KEY) || 'all'; }
    catch (e) { return 'all'; }
  }
  function setAudience(a) {
    try { localStorage.setItem(AUDIENCE_KEY, a); } catch (e) {}
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    for (const c of children) {
      if (c == null) continue;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  function isActive(href) {
    const target = href.replace(/^\.\.\//, '').replace(/^\.\//, '');
    return currentPath === target || currentPath.endsWith('/' + target) || currentFile === target;
  }

  function buildTopbar(onAudienceChange) {
    const bar = el('header', { class: 'topbar' });
    const brand = el('a', { class: 'topbar-brand', href: root + 'index.html' },
      el('div', { class: 'brand-logo' }, 'V'),
      el('span', { class: 'brand-name' }, 'Vernon Tasks')
    );

    const current = getAudience();
    const switcher = el('nav', { class: 'audience-switcher' });
    const audiences = [
      { key: 'all', label: 'All' },
      { key: 'dev', label: 'Developer' },
      { key: 'user', label: 'User' },
      { key: 'admin', label: 'Admin' }
    ];
    const btns = [];
    audiences.forEach(a => {
      const b = el('button', {
        class: 'aud-btn' + (current === a.key ? ' active' : ''),
        type: 'button',
        'data-aud': a.key
      }, a.label);
      b.addEventListener('click', () => {
        setAudience(a.key);
        btns.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        onAudienceChange(a.key);
      });
      btns.push(b);
      switcher.appendChild(b);
    });

    const meta = el('div', { class: 'topbar-meta' },
      el('span', { class: 'doc-version' }, 'v1.0'),
      el('span', { class: 'doc-updated' }, 'Updated 2026-05-16')
    );

    bar.appendChild(brand);
    bar.appendChild(switcher);
    bar.appendChild(meta);
    return bar;
  }

  function buildSidebar() {
    const aside = el('aside', { class: 'sidebar' });
    const search = el('input', {
      class: 'sidebar-search',
      placeholder: 'Search docs…',
      type: 'search'
    });
    aside.appendChild(search);

    const sectionEls = [];
    for (const section of NAV) {
      const secNode = el('div', { class: 'nav-section' });
      secNode.dataset.audience = (section.audience || ['all']).join(',');
      const title = el('div', { class: 'nav-section-title' }, section.title);
      if (section.badge) {
        title.appendChild(el('span', { class: 'nav-badge ' + section.badge.cls }, section.badge.text));
      }
      secNode.appendChild(title);
      for (const item of section.items) {
        const cls = 'nav-item' + (item.child ? ' nav-item-child' : '') + (isActive(item.href) ? ' active' : '');
        secNode.appendChild(el('a', { class: cls, href: root + item.href }, item.label));
      }
      sectionEls.push(secNode);
      aside.appendChild(secNode);
    }

    function applyAudience(aud) {
      sectionEls.forEach(sec => {
        const tags = (sec.dataset.audience || 'all').split(',');
        const show = aud === 'all' || tags.includes('all') || tags.includes(aud);
        sec.style.display = show ? '' : 'none';
      });
    }
    aside._applyAudience = applyAudience;
    applyAudience(getAudience());

    search.addEventListener('input', () => {
      const q = search.value.toLowerCase();
      for (const sec of sectionEls) {
        let anyVisible = false;
        sec.querySelectorAll('.nav-item').forEach((it) => {
          const match = it.textContent.toLowerCase().includes(q);
          it.style.display = match ? '' : 'none';
          if (match) anyVisible = true;
        });
        sec.style.display = anyVisible || q === '' ? '' : 'none';
      }
    });

    return aside;
  }

  function buildOnThisPage(contentNode) {
    const heads = contentNode.querySelectorAll('h2, h3');
    if (heads.length < 2) return null;

    const aside = el('aside', { class: 'on-this-page' });
    aside.appendChild(el('div', { class: 'otp-title' }, 'On this page'));

    let idx = 0;
    heads.forEach((h) => {
      if (!h.id) {
        const slug = (h.textContent || 'sec')
          .toLowerCase().trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || ('sec-' + (++idx));
        h.id = slug;
      }
      h.classList.add('anchor');
      const cls = 'otp-link' + (h.tagName === 'H3' ? ' otp-link-sub' : '');
      aside.appendChild(el('a', { class: cls, href: '#' + h.id }, h.textContent));
    });

    return aside;
  }

  function init() {
    let contentInner;
    const existingShell = document.body.querySelector('.shell');
    if (existingShell) {
      contentInner = existingShell;
      contentInner.classList.add('content');
      // detach from current parent
      if (contentInner.parentNode) contentInner.parentNode.removeChild(contentInner);
    } else {
      contentInner = el('div', { class: 'content' });
      while (document.body.firstChild) {
        contentInner.appendChild(document.body.firstChild);
      }
    }

    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }

    const sidebar = buildSidebar();
    const topbar = buildTopbar((aud) => {
      if (sidebar._applyAudience) sidebar._applyAudience(aud);
      // Audience banner on content if page is tagged
      const pageAud = (document.body.dataset.audience || 'all').split(',');
      const banner = document.getElementById('audience-banner');
      if (aud !== 'all' && !pageAud.includes('all') && !pageAud.includes(aud)) {
        if (!banner) {
          const b = el('div', { id: 'audience-banner', class: 'audience-banner' },
            'This page is for ' + (pageAud[0] || 'developer') + ' audience.');
          contentInner.insertBefore(b, contentInner.firstChild);
        }
      } else if (banner) {
        banner.remove();
      }
    });
    document.body.appendChild(topbar);

    const layout = el('div', { class: 'layout' });
    layout.appendChild(sidebar);

    const contentWrap = el('main', { class: 'content-wrap' });
    contentWrap.appendChild(contentInner);
    layout.appendChild(contentWrap);

    const otp = buildOnThisPage(contentInner);
    if (otp) layout.appendChild(otp);

    document.body.appendChild(layout);

    if (otp) {
      const links = otp.querySelectorAll('.otp-link');
      const ids = Array.from(links).map(a => a.getAttribute('href').slice(1));
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            links.forEach(l => l.classList.remove('active'));
            const active = otp.querySelector('a[href="#' + e.target.id + '"]');
            if (active) active.classList.add('active');
          }
        });
      }, { rootMargin: '-80px 0px -70% 0px' });
      ids.forEach(id => {
        const node = document.getElementById(id);
        if (node) observer.observe(node);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
