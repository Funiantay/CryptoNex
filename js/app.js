/* CryptoNex — Main Application Controller v2 */

const CSelect = {
  _instances: {},
  _globalBound: false,

  create(wrapperId, options, onChange, config = {}) {
    const wrap = document.getElementById(wrapperId);
    if (!wrap) return null;
    const searchHtml = config.searchable
      ? `<div class="csel-search-wrap"><input class="csel-search" placeholder="Search..." autocomplete="off" spellcheck="false"></div>`
      : '';
    wrap.innerHTML = `<div class="csel"><button type="button" class="csel-trigger"><span class="csel-label">Select...</span><svg class="csel-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></button><div class="csel-dropdown">${searchHtml}<div class="csel-list"></div></div></div>`;
    const el       = wrap.querySelector('.csel');
    const trigger  = wrap.querySelector('.csel-trigger');
    const dropdown = wrap.querySelector('.csel-dropdown');
    const list     = wrap.querySelector('.csel-list');
    const search   = wrap.querySelector('.csel-search');
    const inst = { id:wrapperId, options:[], value:null, open:false, onChange, config, _el:el, _trigger:trigger, _dropdown:dropdown, _list:list, _search:search };
    trigger.addEventListener('click', e => { e.stopPropagation(); this._toggle(wrapperId); });
    if (search) {
      search.addEventListener('click', e => e.stopPropagation());
      search.addEventListener('input', () => this._renderList(wrapperId, search.value));
    }
    if (!this._globalBound) {
      this._globalBound = true;
      document.addEventListener('click', () => Object.keys(this._instances).forEach(id => this._close(id)));
    }
    this._instances[wrapperId] = inst;
    if (options && options.length) this.update(wrapperId, options);
    return inst;
  },

  update(wrapperId, options) {
    const inst = this._instances[wrapperId];
    if (!inst) return;
    inst.options = options;
    if (!inst.value || !options.find(o => o.value === inst.value)) inst.value = options[0]?.value || null;
    this._renderLabel(wrapperId);
    if (inst.open) this._renderList(wrapperId, inst._search?.value || '');
  },

  _renderList(wrapperId, filter) {
    const inst = this._instances[wrapperId];
    const opts = filter ? inst.options.filter(o => o.label.toLowerCase().includes(filter.toLowerCase())) : inst.options;
    inst._list.innerHTML = opts.slice(0, 120).map((o, i) => {
      const active = o.value === inst.value ? 'active' : '';
      const img = o.img ? `<img src="${o.img}" alt="" class="csel-opt-img" onerror="this.style.display='none'">` : '';
      return `<div class="csel-option ${active}" data-value="${o.value}" style="animation-delay:${Math.min(i,40)*14}ms">${img}<span class="csel-opt-label">${o.label}</span></div>`;
    }).join('');
    inst._list.querySelectorAll('.csel-option').forEach(el => {
      el.addEventListener('click', e => { e.stopPropagation(); this._select(wrapperId, el.dataset.value); });
    });
  },

  _select(wrapperId, value) {
    const inst = this._instances[wrapperId];
    if (!inst) return;
    inst.value = value;
    this._renderLabel(wrapperId);
    this._close(wrapperId);
    if (inst.onChange) inst.onChange(value);
  },

  _renderLabel(wrapperId) {
    const inst = this._instances[wrapperId];
    const opt = inst.options.find(o => o.value === inst.value);
    if (!opt || !inst._trigger) return;
    const img = opt.img ? `<img src="${opt.img}" alt="" class="csel-opt-img" onerror="this.style.display='none'">` : '';
    inst._trigger.querySelector('.csel-label').innerHTML = `${img}<span>${opt.label}</span>`;
  },

  _toggle(wrapperId) {
    const inst = this._instances[wrapperId];
    if (!inst) return;
    if (inst.open) { this._close(wrapperId); } else {
      Object.keys(this._instances).forEach(id => { if (id !== wrapperId) this._close(id); });
      this._open(wrapperId);
    }
  },

  _open(wrapperId) {
    const inst = this._instances[wrapperId];
    if (!inst) return;
    inst.open = true;
    inst._el.classList.add('open');
    this._renderList(wrapperId, '');
    if (inst._search) { inst._search.value = ''; setTimeout(() => inst._search.focus(), 50); }
  },

  _close(wrapperId) {
    const inst = this._instances[wrapperId];
    if (!inst || !inst.open) return;
    inst.open = false;
    inst._el.classList.remove('open');
  },

  getValue(wrapperId) { return this._instances[wrapperId]?.value || null; },

  setValue(wrapperId, value) {
    const inst = this._instances[wrapperId];
    if (!inst) return;
    if (inst.options.find(o => o.value === value)) { inst.value = value; this._renderLabel(wrapperId); }
  }
};

const Alerts = {
  KEY: 'cryptonex_alerts',
  load()          { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  save(a)         { localStorage.setItem(this.KEY, JSON.stringify(a)); },
  add(alert)      { const a = this.load(); a.push({...alert, id:Date.now(), triggered:false}); this.save(a); },
  remove(id)      { this.save(this.load().filter(a => a.id !== id)); },
  markTriggered(id) { this.save(this.load().map(a => a.id === id ? {...a, triggered:true} : a)); }
};

const Watchlist = {
  KEY: 'cryptonex_watchlist',
  load()      { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  save(ids)   { localStorage.setItem(this.KEY, JSON.stringify(ids)); },
  has(id)     { return this.load().includes(id); },
  toggle(id)  {
    const ids = this.load();
    const idx = ids.indexOf(id);
    if (idx >= 0) ids.splice(idx, 1); else ids.push(id);
    this.save(ids);
    return ids.includes(id);
  }
};

const App = {
  markets: [],
  currentCoin: { id:'bitcoin', symbol:'btc', name:'Bitcoin', image:'' },
  chartType: 'candlestick',
  chartDays: 1,
  currentOHLC: [],
  currentMarketChart: null,
  activeTool: 'none',
  drawings: [],
  drawingState: null,
  _drawingsByCoin: {},   // per-coin drawing persistence
  _rafPending: false,    // deduplicate RAF redraws
  _heatmapMetric: '24h',
  _prevPrices: {},
  _alertCoinId: null,
  _drawerCoinId: null,
  _marketFilter: 'all',

  async init() {
    this._initNav();
    this._initScrollReveal();
    this._initSearch();
    this._initChartControls();
    this._initDrawingTools();
    this._initPortfolioModal();
    this._initAnnotationModal();
    this._initPrediction();
    this._initSidebarToggle();
    this._initCoinDrawer();
    this._initAlertModal();
    this._initConverter();
    this._initHeatmapControls();
    this._initThemeToggle();
    this._initMarketFilters();
    document.getElementById('view-all-markets').addEventListener('click', () => this.showView('markets'));
    document.getElementById('export-csv-btn').addEventListener('click', () => this._exportPortfolioCSV());

    try {
      await this._loadGlobal();
      await this._loadMarkets();
      this._hideLoader();
    } catch(e) {
      this._showLoadError(e.message);
      return;
    }

    this._initChartView();
    this._loadFearGreed();

    if (API.demoMode) {
      setTimeout(() => {
        this._showToast('Running in Demo Mode — live market data unavailable', 'warning', 6000);
        this._showDemoBadge();
      }, 1200);
    } else {
      setTimeout(() => this._showToast('Live market data connected', 'success', 3000), 1200);
    }

    setInterval(() => this._loadGlobal(), 60000);
    setInterval(() => this._loadMarkets(), 90000);
    setInterval(() => this._loadFearGreed(), 3600000);
    window.addEventListener('resize', () => Charts.resizeAll());
  },

  _hideLoader() {
    const loader = document.getElementById('loading-screen');
    const app    = document.getElementById('app');
    const dots   = loader.querySelectorAll('.step-dot');
    const pct    = document.getElementById('loader-pct');
    const lbl    = document.getElementById('loader-step-label');
    const steps  = ['Fetching markets...', 'Loading price data...', 'Calibrating indicators...', 'Ready!'];
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < dots.length) dots[step].classList.add('active');
      if (pct) pct.textContent = Math.min(100, step * 33 + 1) + '%';
      if (lbl && steps[step]) lbl.textContent = steps[step];
      if (step >= 3) clearInterval(interval);
    }, 200);
    setTimeout(() => {
      loader.classList.add('fade-out');
      app.classList.remove('hidden');
      setTimeout(() => {
        loader.remove();
        this._revealView('dashboard');
      }, 700);
    }, 900);
  },

  _showLoadError(detail) {
    const loader = document.getElementById('loading-screen');
    if (loader) {
      loader.innerHTML = `
        <div class="loader-wrap" style="max-width:440px;padding:0 20px">
          <div style="font-size:36px;margin-bottom:16px;opacity:.5">⚠</div>
          <div style="font-family:var(--font-d);font-size:28px;letter-spacing:.1em;color:var(--red);margin-bottom:10px">LOAD ERROR</div>
          <div style="font-family:var(--font-m);font-size:12px;color:var(--text-dim);margin-bottom:6px">${detail || 'An unexpected error occurred during startup.'}</div>
          <div style="font-family:var(--font-m);font-size:11px;color:var(--text-mute);margin-bottom:28px;line-height:1.8">
            The app should load even without internet.<br>
            Try refreshing. Check the browser console (F12)<br>
            for details if the issue persists.
          </div>
          <button onclick="location.reload()" style="background:linear-gradient(135deg,var(--magenta),#B01060);color:#fff;border:none;border-radius:24px;padding:10px 28px;font-family:var(--font-u);font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(247,37,133,.3)">
            Retry
          </button>
        </div>`;
    }
  },

  _showError(msg) {
    console.error(msg);
    this._showToast(msg, 'error');
  },

  _showDemoBadge() {
    const badge = document.createElement('div');
    badge.id = 'demo-badge';
    badge.title = 'Live API unavailable — showing built-in demo data. Prices are illustrative only.';
    badge.textContent = '⚡ DEMO MODE';
    document.body.appendChild(badge);
  },

  _showToast(msg, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success:'✓', error:'✕', info:'ℹ', warning:'⚠' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-msg">${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 350);
    }, duration);
  },

  // ── Navigation ──
  _initNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.showView(btn.dataset.view));
    });
    document.querySelectorAll('.footer-links a[data-nav]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        this.showView(link.dataset.nav);
        document.querySelector('.content-area').scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    this._initFooterReveal();
  },

  _initFooterReveal() {
    // Reveal handled directly in _revealView — no observer needed
  },

  _initScrollReveal() {
    const ca = document.querySelector('.content-area');
    this._scrollRevealObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        el.style.transition = 'opacity 0.58s cubic-bezier(0.25,0.46,0.45,0.94), transform 0.58s cubic-bezier(0.25,0.46,0.45,0.94)';
        el.style.opacity = '';
        el.style.transform = '';
        this._scrollRevealObserver.unobserve(el);
      });
    }, { root: ca, threshold: 0.08 });
  },

  _revealView(name) {
    const view = document.getElementById(`view-${name}`);
    if (!view) return;

    // Move footer (+ its spacer) to the bottom of the active view
    const footer = document.querySelector('.site-footer');
    if (!this._footerSpacer) {
      this._footerSpacer = document.createElement('div');
      this._footerSpacer.className = 'footer-spacer';
    }
    if (footer) {
      footer.classList.remove('footer--visible');
      view.appendChild(this._footerSpacer);
      view.appendChild(footer);
      setTimeout(() => footer.classList.add('footer--visible'), 350);
    }

    const SEL = '.view-header, .stat-card, .panel, .market-filter-bar, .heatmap-container';
    const items = Array.from(view.querySelectorAll(SEL));

    // Instantly hide everything (no transition flash)
    items.forEach(el => {
      el.style.transition = 'none';
      el.style.opacity = '0';
      el.style.transform = 'translateY(22px)';
    });

    // After one layout frame, split in-view vs below-fold
    requestAnimationFrame(() => {
      const ca = document.querySelector('.content-area');
      const caRect = ca ? ca.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const inView = [], belowFold = [];

      items.forEach(el => {
        const r = el.getBoundingClientRect();
        (r.top < caRect.bottom && r.bottom > caRect.top ? inView : belowFold).push(el);
      });

      // Stagger-reveal items already in viewport
      requestAnimationFrame(() => {
        inView.forEach((el, i) => {
          setTimeout(() => {
            el.style.transition = 'opacity 0.58s cubic-bezier(0.25,0.46,0.45,0.94), transform 0.58s cubic-bezier(0.25,0.46,0.45,0.94)';
            el.style.opacity = '';
            el.style.transform = '';
          }, i * 60);
        });
      });

      // Below-fold items: reveal when scrolled into view
      if (this._scrollRevealObserver) {
        belowFold.forEach(el => this._scrollRevealObserver.observe(el));
      }
    });
  },

  showView(name) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
    const ca = document.querySelector('.content-area');
    if (ca) ca.scrollTo({ top: 0, behavior: 'instant' });
    this._revealView(name); // moves footer into active view and reveals it
    if (name === 'charts')     setTimeout(() => { Charts.resizeAll(); this._loadChartCoin(this.currentCoin.id); }, 50);
    if (name === 'portfolio')  this._renderPortfolio();
    if (name === 'watchlist')  this._renderWatchlist();
    if (name === 'heatmap')    this._renderHeatmap();
    if (name === 'prediction') document.getElementById('run-prediction-btn').dispatchEvent(new Event('click'));
  },

  // ── Global Stats ──
  async _loadGlobal() {
    const data = await API.getGlobal();
    const g = data.data;
    const mcap   = g.total_market_cap.usd;
    const vol    = g.total_volume.usd;
    const btcD   = g.market_cap_percentage.btc;
    const coins  = g.active_cryptocurrencies;
    const change = g.market_cap_change_percentage_24h_usd;

    const fmt = n => n >= 1e12 ? '$' + (n/1e12).toFixed(2) + 'T' : '$' + (n/1e9).toFixed(1) + 'B';
    ['global-mcap','dash-mcap'].forEach(id => document.getElementById(id).textContent = fmt(mcap));
    ['global-vol','dash-vol'].forEach(id => document.getElementById(id).textContent = fmt(vol));
    ['global-btc-dom','dash-btc-dom'].forEach(id => document.getElementById(id).textContent = btcD.toFixed(1) + '%');
    ['global-coins','dash-coins'].forEach(id => document.getElementById(id).textContent = coins.toLocaleString());

    const chEl = document.getElementById('dash-mcap-change');
    chEl.innerHTML = this._fmtPct(change) + '<span style="color:var(--text-mute);font-size:10px;margin-left:4px">(24h)</span>';
    chEl.className = 'sc-change';
  },

  // ── Markets Data ──
  async _loadMarkets(order = 'market_cap_desc') {
    const data = await API.getMarkets(order);
    this._checkAlerts(data);
    this._flashPrices(data);
    this.markets = data;
    this._renderTopCoins(data.slice(0, 20));
    this._renderMarketsTable(data);
    this._renderGainers(data);
    this._renderMarketPulse(data);
    this._updateHoldingSelect(data);
    this._updatePredictionSelect(data);
    this._updateConverterCoins(data);
    this._initTicker(data);
    this._renderDominanceBar(data);
    try {
      const trending = await API.getTrending();
      this._renderTrending(trending.coins, data);
    } catch(e) {}
  },

  _fmtPrice(p) {
    if (!p || p <= 0) return '—';
    if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits:2 });
    if (p >= 1)    return '$' + p.toFixed(4);
    if (p >= 0.01) return '$' + p.toFixed(5);
    return '$' + p.toFixed(8);
  },
  _fmtLarge(n) {
    if (!n) return '—';
    if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
    if (n >= 1e9)  return '$' + (n/1e9).toFixed(2) + 'B';
    if (n >= 1e6)  return '$' + (n/1e6).toFixed(1) + 'M';
    return '$' + n.toLocaleString();
  },
  _fmtPct(v) {
    if (v === null || v === undefined) return '<span class="pct-badge neu">—</span>';
    const up  = v >= 0;
    const abs = Math.abs(v).toFixed(2);
    const arrow = up
      ? `<svg width="7" height="7" viewBox="0 0 10 10" fill="currentColor"><path d="M5 0L10 10H0z"/></svg>`
      : `<svg width="7" height="7" viewBox="0 0 10 10" fill="currentColor"><path d="M5 10L0 0H10z"/></svg>`;
    return `<span class="pct-badge ${up?'up':'down'}">${arrow}${up?'+':'-'}${abs}%</span>`;
  },
  _timeAgo(ts) {
    const s = Math.floor((Date.now()/1000) - ts);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  },

  // ── Ticker Strip ──
  _initTicker(coins) {
    const track = document.getElementById('ticker-track');
    if (!track || !coins || !coins.length) return;
    const items = coins.slice(0, 25).map(c => {
      const chg = c.price_change_percentage_24h;
      const cls  = chg >= 0 ? 'up' : 'down';
      const sign = chg >= 0 ? '+' : '';
      return `<div class="ticker-item" data-id="${c.id}">
        <img src="${c.image}" alt="" onerror="this.style.display='none'">
        <span class="ticker-name">${c.symbol.toUpperCase()}</span>
        <span class="ticker-price">${this._fmtPrice(c.current_price)}</span>
        <span class="ticker-change ${cls}">${sign}${(chg||0).toFixed(2)}%</span>
      </div>`;
    }).join('');
    track.innerHTML = items + items;
    track.querySelectorAll('.ticker-item').forEach(item => {
      item.addEventListener('click', () => { this.showView('charts'); this._loadChartCoin(item.dataset.id); });
    });
  },

  // ── Fear & Greed ──
  async _loadFearGreed() {
    try {
      const data = await API.getFearGreed();
      const entry = data?.data?.[0];
      if (!entry) return;
      const val = parseInt(entry.value);
      const label = entry.value_classification;

      document.getElementById('fg-value').textContent = val;
      document.getElementById('fg-label').textContent = label;
      document.getElementById('fg-updated').textContent = 'Updated ' + this._timeAgo(entry.timestamp);

      const colors = { 'Extreme Fear':'#EF233C', 'Fear':'#FF6B35', 'Neutral':'#FFB703', 'Greed':'#06D6A0', 'Extreme Greed':'#4CC9F0' };
      const color  = colors[label] || '#FFB703';
      document.getElementById('fg-value').style.color = color;
      document.getElementById('fg-badge').style.background = `${color}22`;
      document.getElementById('fg-badge').style.color = color;
      document.getElementById('fg-badge').style.borderColor = `${color}44`;

      const arc = document.getElementById('fg-arc');
      const needle = document.getElementById('fg-needle');
      if (arc) {
        const offset = 251.3 * (1 - val/100);
        setTimeout(() => { arc.style.strokeDashoffset = offset; }, 100);
      }
      if (needle) {
        const angle = (val/100 * 180) - 90;
        setTimeout(() => { needle.style.transform = `rotate(${angle}deg)`; }, 100);
      }
    } catch(e) {
      document.getElementById('fg-label').textContent = 'Data unavailable';
    }
  },

  // ── Market Pulse ──
  _renderMarketPulse(coins) {
    const gEl = document.getElementById('pulse-gainers');
    const lEl = document.getElementById('pulse-losers');
    if (!gEl || !lEl) return;
    const sorted = [...coins].filter(c => c.price_change_percentage_24h !== null && c.price_change_percentage_24h !== undefined);
    const gainers = [...sorted].sort((a,b) => b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0, 6);
    const losers  = [...sorted].sort((a,b) => a.price_change_percentage_24h - b.price_change_percentage_24h).slice(0, 6);
    const mkItem = c => `<div class="pulse-item" data-id="${c.id}">
      <div class="pulse-coin">
        <img src="${c.image}" alt="" onerror="this.style.display='none'">
        <div><div class="pulse-coin-name">${c.name}</div><div class="pulse-coin-sym">${c.symbol.toUpperCase()}</div></div>
      </div>
      <div class="pulse-right">
        <div class="pulse-price">${this._fmtPrice(c.current_price)}</div>
        ${this._fmtPct(c.price_change_percentage_24h)}
      </div>
    </div>`;
    gEl.innerHTML = gainers.map(mkItem).join('');
    lEl.innerHTML = losers.map(mkItem).join('');
    [gEl, lEl].forEach(el => el.querySelectorAll('.pulse-item').forEach(item => {
      item.addEventListener('click', () => { this.showView('charts'); this._loadChartCoin(item.dataset.id); });
    }));
  },

  // ── Theme Toggle ──
  _initThemeToggle() {
    const btn  = document.getElementById('theme-toggle');
    const moon = document.getElementById('theme-icon-moon');
    const sun  = document.getElementById('theme-icon-sun');
    if (!btn) return;
    const apply = (light) => {
      document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
      moon.classList.toggle('hidden-icon', light);
      sun.classList.toggle('hidden-icon', !light);
      localStorage.setItem('cryptonex_theme', light ? 'light' : 'dark');
    };
    const saved = localStorage.getItem('cryptonex_theme');
    if (saved === 'light') apply(true);
    btn.addEventListener('click', () => {
      apply(document.documentElement.getAttribute('data-theme') !== 'light');
    });
  },

  // ── Market Filters ──
  _initMarketFilters() {
    document.querySelectorAll('.mfilter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mfilter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._marketFilter = btn.dataset.filter;
        this._renderMarketsTable(this.markets);
      });
    });
  },

  _renderTopCoins(coins) {
    const tbody = document.getElementById('top-coins-body');
    tbody.innerHTML = coins.map((c, i) => {
      const spark = c.sparkline_in_7d?.price || [];
      const isUp  = (c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_24h ?? 0) >= 0;
      return `<tr data-id="${c.id}">
        <td><span style="color:var(--text-mute);font-family:var(--font-m)">${c.market_cap_rank}</span></td>
        <td><div class="coin-cell">
          <img src="${c.image}" alt="${c.name}" onerror="this.style.display='none'">
          <div><div class="coin-name">${c.name}</div><div class="coin-sym">${c.symbol.toUpperCase()}</div></div>
        </div></td>
        <td>${this._fmtPrice(c.current_price)}</td>
        <td>${this._fmtPct(c.price_change_percentage_24h)}</td>
        <td>${this._fmtPct(c.price_change_percentage_7d_in_currency)}</td>
        <td>${this._fmtLarge(c.market_cap)}</td>
        <td><div class="spark-wrap"><canvas width="80" height="28" data-spark="${c.id}" data-up="${isUp}"></canvas></div></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => { this.showView('charts'); this._loadChartCoin(tr.dataset.id); });
    });
    tbody.querySelectorAll('canvas[data-spark]').forEach(cv => {
      const coin = coins.find(c => c.id === cv.dataset.id);
      if (coin?.sparkline_in_7d?.price) Charts.drawSparkline(cv, coin.sparkline_in_7d.price, cv.dataset.up === 'true');
    });
  },

  _renderMarketsTable(coins) {
    const q = (document.getElementById('market-search')?.value || '').toLowerCase();
    let filtered = coins.filter(c => !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
    if (this._marketFilter === 'gainers')  filtered = [...filtered].sort((a,b) => (b.price_change_percentage_24h||0)-(a.price_change_percentage_24h||0)).filter(c => (c.price_change_percentage_24h||0) > 0);
    if (this._marketFilter === 'losers')   filtered = [...filtered].sort((a,b) => (a.price_change_percentage_24h||0)-(b.price_change_percentage_24h||0)).filter(c => (c.price_change_percentage_24h||0) < 0);
    if (this._marketFilter === 'top10')    filtered = filtered.slice(0, 10);
    if (this._marketFilter === 'volume')   filtered = [...filtered].sort((a,b) => (b.total_volume||0)-(a.total_volume||0));
    if (this._marketFilter === 'watchlist') filtered = filtered.filter(c => Watchlist.has(c.id));
    const tbody = document.getElementById('markets-body');
    if (!tbody) return;
    tbody.innerHTML = filtered.map(c => {
      const watched = Watchlist.has(c.id);
      return `<tr data-id="${c.id}">
        <td><span style="color:var(--text-mute)">${c.market_cap_rank || '—'}</span></td>
        <td><div class="coin-cell">
          <img src="${c.image}" alt="" onerror="this.style.display='none'">
          <div><div class="coin-name">${c.name}</div><div class="coin-sym">${c.symbol.toUpperCase()}</div></div>
        </div></td>
        <td>${this._fmtPrice(c.current_price)}</td>
        <td>${this._fmtPct(c.price_change_percentage_1h_in_currency)}</td>
        <td>${this._fmtPct(c.price_change_percentage_24h)}</td>
        <td>${this._fmtPct(c.price_change_percentage_7d_in_currency)}</td>
        <td>${this._fmtPct(c.price_change_percentage_30d_in_currency)}</td>
        <td>${this._fmtLarge(c.total_volume)}</td>
        <td>${this._fmtLarge(c.market_cap)}</td>
        <td><button class="btn-watch${watched?' watching':''}" data-id="${c.id}" title="${watched?'Unwatch':'Watch'}">${watched?'★':'☆'}</button></td>
        <td><button class="btn-chart" data-id="${c.id}">Chart</button></td>
        <td><button class="btn-detail" data-id="${c.id}" title="Coin details">ℹ</button></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-watch').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const isNow = Watchlist.toggle(btn.dataset.id);
        btn.textContent = isNow ? '★' : '☆';
        btn.classList.toggle('watching', isNow);
        const coin = this.markets.find(m => m.id === btn.dataset.id);
        this._showToast(isNow ? `${coin?.name || btn.dataset.id} added to watchlist` : `Removed from watchlist`, isNow ? 'success' : 'info');
      });
    });
    tbody.querySelectorAll('.btn-chart').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); this.showView('charts'); this._loadChartCoin(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-detail').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); this._openCoinDetail(btn.dataset.id); });
    });
    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => { this.showView('charts'); this._loadChartCoin(tr.dataset.id); });
    });
  },

  _renderTrending(trendCoins, markets) {
    const el = document.getElementById('trending-list');
    el.innerHTML = trendCoins.slice(0, 6).map(tc => {
      const c   = tc.item;
      const mkt = markets.find(m => m.id === c.id);
      const ch  = mkt?.price_change_percentage_24h;
      return `<div class="coin-list-item" data-id="${c.id}">
        <div class="cli-left">
          <img src="${c.small}" alt="" onerror="this.style.display='none'">
          <div><div class="cli-name">${c.name}</div><div class="cli-sym">${c.symbol.toUpperCase()}</div></div>
        </div>
        <div class="cli-right">
          <div class="cli-price">${mkt ? this._fmtPrice(mkt.current_price) : '—'}</div>
          <div class="cli-change">${ch !== undefined ? this._fmtPct(ch) : ''}</div>
        </div>
      </div>`;
    }).join('');
    el.querySelectorAll('.coin-list-item').forEach(item => {
      item.addEventListener('click', () => { this.showView('charts'); this._loadChartCoin(item.dataset.id); });
    });
  },

  _renderGainers(coins) {
    const sorted = [...coins].sort((a,b) => (b.price_change_percentage_24h||0) - (a.price_change_percentage_24h||0));
    const el = document.getElementById('gainers-list');
    el.innerHTML = sorted.slice(0, 5).map(c => `
      <div class="coin-list-item" data-id="${c.id}">
        <div class="cli-left">
          <img src="${c.image}" alt="" onerror="this.style.display='none'">
          <div><div class="cli-name">${c.name}</div><div class="cli-sym">${c.symbol.toUpperCase()}</div></div>
        </div>
        <div class="cli-right">
          <div class="cli-price">${this._fmtPrice(c.current_price)}</div>
          <div class="cli-change">${this._fmtPct(c.price_change_percentage_24h)}</div>
        </div>
      </div>`).join('');
    el.querySelectorAll('.coin-list-item').forEach(item => {
      item.addEventListener('click', () => { this.showView('charts'); this._loadChartCoin(item.dataset.id); });
    });
  },

  // ── Watchlist View ──
  _renderWatchlist() {
    const ids     = Watchlist.load();
    const emptyEl = document.getElementById('watchlist-empty');
    const panel   = document.getElementById('watchlist-panel');
    const tbody   = document.getElementById('watchlist-body');

    if (!ids.length) {
      emptyEl.style.display = '';
      panel.style.display   = 'none';
      return;
    }
    emptyEl.style.display = 'none';
    panel.style.display   = '';

    const watched = this.markets.filter(m => ids.includes(m.id));
    tbody.innerHTML = watched.map(c => {
      const isUp = (c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_24h ?? 0) >= 0;
      return `<tr data-id="${c.id}">
        <td><span style="color:var(--text-mute)">${c.market_cap_rank}</span></td>
        <td><div class="coin-cell">
          <img src="${c.image}" alt="" onerror="this.style.display='none'">
          <div><div class="coin-name">${c.name}</div><div class="coin-sym">${c.symbol.toUpperCase()}</div></div>
        </div></td>
        <td>${this._fmtPrice(c.current_price)}</td>
        <td>${this._fmtPct(c.price_change_percentage_1h_in_currency)}</td>
        <td>${this._fmtPct(c.price_change_percentage_24h)}</td>
        <td>${this._fmtPct(c.price_change_percentage_7d_in_currency)}</td>
        <td>${this._fmtLarge(c.market_cap)}</td>
        <td><div class="spark-wrap"><canvas width="80" height="28" data-spark="${c.id}" data-up="${isUp}"></canvas></div></td>
        <td><button class="btn-watch watching" data-id="${c.id}" title="Unwatch">★</button></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('canvas[data-spark]').forEach(cv => {
      const coin = watched.find(c => c.id === cv.dataset.id);
      if (coin?.sparkline_in_7d?.price) Charts.drawSparkline(cv, coin.sparkline_in_7d.price, cv.dataset.up === 'true');
    });
    tbody.querySelectorAll('.btn-watch').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        Watchlist.toggle(btn.dataset.id);
        this._renderWatchlist();
        this._showToast('Removed from watchlist', 'info');
      });
    });
    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => { this.showView('charts'); this._loadChartCoin(tr.dataset.id); });
    });
  },

  // ── Chart View ──
  // ── Drawing persistence helpers ──
  _saveDrawings() {
    this._drawingsByCoin[this.currentCoin.id] = [...this.drawings];
    try { localStorage.setItem('cryptonex_drawings', JSON.stringify(this._drawingsByCoin)); } catch(e) {}
  },

  _loadDrawingsFromStorage() {
    try {
      const raw = localStorage.getItem('cryptonex_drawings');
      if (raw) this._drawingsByCoin = JSON.parse(raw);
    } catch(e) {}
    this.drawings = this._drawingsByCoin[this.currentCoin.id] || [];
  },

  _initChartView() {
    // Load persisted drawings before anything else so they're ready when
    // the first coin loads (currentCoin.id is 'bitcoin' at this point)
    this._loadDrawingsFromStorage();

    Charts.initMain('main-chart-container');
    Charts.initVolume('volume-chart-container');
    Charts.initMACD('macd-chart-container');
    Charts.initRSI('rsi-chart-container');

    // Re-draw overlay on the NEXT animation frame so LightweightCharts has
    // finished updating its internal price-scale before we query coordinates.
    // A shared pending flag prevents duplicate RAF calls from firing twice
    // when both subscriptions trigger for the same user interaction.
    const scheduleRedraw = () => {
      if (this._rafPending) return;
      this._rafPending = true;
      requestAnimationFrame(() => { this._rafPending = false; this._redrawCanvas(); });
    };

    Charts.main.timeScale().subscribeVisibleLogicalRangeChange(scheduleRedraw);

    // Also listen to pointer/wheel events on the chart container so that
    // price-scale drag (which doesn't fire a time-scale event) also
    // re-positions drawings correctly.
    const chartEl = document.getElementById('main-chart-container');
    if (chartEl) {
      chartEl.addEventListener('wheel', scheduleRedraw, { passive: true });
      chartEl.addEventListener('pointermove', e => {
        if (e.buttons > 0) scheduleRedraw(); // only while dragging (price-scale drag)
      }, { passive: true, capture: true });
      chartEl.addEventListener('pointerup', scheduleRedraw, { passive: true });
    }

    // Build coin selector from loaded markets (markets are resolved before _initChartView is called)
    const coinOpts = this.markets.slice(0, 100).map(m => ({
      value: m.id,
      label: m.name + ' (' + m.symbol.toUpperCase() + ')',
    }));
    CSelect.create('chart-coin-select-wrap', coinOpts, val => {
      this._loadChartCoin(val);
    }, { searchable: true });
    CSelect.setValue('chart-coin-select-wrap', 'bitcoin');

    this._loadChartCoin('bitcoin');

    document.getElementById('market-search').addEventListener('input', () => this._renderMarketsTable(this.markets));
    CSelect.create('market-sort-wrap', [
      { value:'market_cap_desc', label:'Market Cap ↓' },
      { value:'market_cap_asc',  label:'Market Cap ↑' },
      { value:'gecko_desc',      label:'Trending' },
      { value:'volume_desc',     label:'Volume ↓' },
    ], async val => { try { await this._loadMarkets(val); } catch(e) {} });

    const _toggleSubPanel = (panelId, containerId, show) => {
      const panel = document.getElementById(panelId);
      if (!panel) return;
      if (show && panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        const container = document.getElementById(containerId);
        if (container) {
          container.classList.remove('chart-sub-draw-in');
          void container.offsetWidth;
          container.classList.add('chart-sub-draw-in');
          container.addEventListener('animationend', () => container.classList.remove('chart-sub-draw-in'), { once: true });
        }
      } else if (!show) {
        panel.classList.add('hidden');
      }
    };

    document.querySelectorAll('#toggle-sma20,#toggle-sma50,#toggle-ema20,#toggle-bb,#toggle-macd,#toggle-rsi').forEach(cb => {
      cb.addEventListener('change', () => {
        const macdOn = document.getElementById('toggle-macd').checked;
        const rsiOn  = document.getElementById('toggle-rsi').checked;
        _toggleSubPanel('macd-panel', 'macd-chart-container', macdOn);
        _toggleSubPanel('rsi-panel',  'rsi-chart-container',  rsiOn);
        if (this.currentOHLC.length) {
          Charts.setIndicators(this.currentOHLC, this._getIndicatorConfig());
          setTimeout(() => Charts.resizeAll(), 50);
        }
      });
    });
  },

  _getIndicatorConfig() {
    return {
      sma20: document.getElementById('toggle-sma20').checked,
      sma50: document.getElementById('toggle-sma50').checked,
      ema20: document.getElementById('toggle-ema20').checked,
      bb:    document.getElementById('toggle-bb').checked,
      macd:  document.getElementById('toggle-macd').checked,
      rsi:   document.getElementById('toggle-rsi').checked,
    };
  },

  async _loadChartCoin(id) {
    this._saveDrawings();
    const coin = this.markets.find(m => m.id === id);
    if (coin) this.currentCoin = { id:coin.id, symbol:coin.symbol, name:coin.name, image:coin.image };
    CSelect.setValue('chart-coin-select-wrap', id);
    this.drawings     = this._drawingsByCoin[id] ? [...this._drawingsByCoin[id]] : [];
    this.drawingState = null; // cancel any in-progress drawing
    this._updateChartHeader();

    const chartPanel = document.querySelector('.chart-panel');
    if (chartPanel) chartPanel.classList.add('chart-loading');

    try {
      const [ohlc, mChart] = await Promise.all([
        API.getOHLC(id, this.chartDays <= 1 ? 1 : this.chartDays),
        API.getMarketChart(id, this.chartDays <= 1 ? 1 : Math.max(this.chartDays, 30))
      ]);
      this.currentOHLC = ohlc;
      this.currentMarketChart = mChart;
      Charts.setChartData(ohlc, this.chartType);
      Charts.setVolumeData(mChart);
      Charts.setIndicators(ohlc, this._getIndicatorConfig());
      this._renderCoinStats(coin);
    } catch(e) {
      this._showError('Chart data unavailable: ' + e.message);
    }

    if (chartPanel) chartPanel.classList.remove('chart-loading');
  },

  _updateChartHeader() {
    const c = this.currentCoin;
    document.getElementById('chart-coin-name').textContent = c.name;
    document.getElementById('chart-coin-symbol').textContent = c.symbol.toUpperCase() + ' / USD';
    const img = document.getElementById('chart-coin-icon');
    if (c.image) { img.src = c.image; img.style.display = ''; }
    const mkt = this.markets.find(m => m.id === c.id);
    if (mkt) {
      document.getElementById('chart-current-price').textContent = this._fmtPrice(mkt.current_price);
      const chEl = document.getElementById('chart-price-change');
      chEl.innerHTML = this._fmtPct(mkt.price_change_percentage_24h) + ' (24h)';
    }
  },

  _renderCoinStats(coin) {
    if (!coin) return;
    const el = document.getElementById('coin-stats-content');
    const rows = [
      ['Market Cap',   this._fmtLarge(coin.market_cap)],
      ['Volume 24h',   this._fmtLarge(coin.total_volume)],
      ['High 24h',     this._fmtPrice(coin.high_24h)],
      ['Low 24h',      this._fmtPrice(coin.low_24h)],
      ['ATH',          this._fmtPrice(coin.ath)],
      ['Rank',         '#' + coin.market_cap_rank],
    ];
    el.innerHTML = rows.map(([l,v]) => `
      <div class="coin-stat-item">
        <div class="coin-stat-lbl">${l}</div>
        <div class="coin-stat-val">${v}</div>
      </div>`).join('');
  },

  // FIXED: was incorrectly using .btn-control instead of .btn-seg
  _initChartControls() {
    document.getElementById('chart-type-group').addEventListener('click', e => {
      const btn = e.target.closest('.btn-seg');
      if (!btn || !btn.dataset.type) return;
      document.querySelectorAll('#chart-type-group .btn-seg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.chartType = btn.dataset.type;
      if (this.currentOHLC.length) Charts.setChartData(this.currentOHLC, this.chartType);
    });

    document.getElementById('timeframe-group').addEventListener('click', e => {
      const btn = e.target.closest('.btn-seg');
      if (!btn || !btn.dataset.days) return;
      document.querySelectorAll('#timeframe-group .btn-seg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.chartDays = parseInt(btn.dataset.days);
      this._loadChartCoin(this.currentCoin.id);
    });
  },

  // ── Drawing Tools ──
  _initDrawingTools() {
    document.querySelectorAll('.draw-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.draw-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTool = btn.dataset.tool;
        const hint = document.getElementById('draw-hint');
        hint.classList.toggle('hidden', this.activeTool === 'none');
        if (this.activeTool === 'trendline')   hint.textContent = 'Click two points to draw a trend line';
        else if (this.activeTool === 'horizontal') hint.textContent = 'Click to place a horizontal line';
        else if (this.activeTool === 'annotation') hint.textContent = 'Click to add an annotation note';
      });
    });

    document.getElementById('clear-drawings').addEventListener('click', () => {
      this.drawings = [];
      this.drawingState = null;
      this._saveDrawings();
      this._redrawCanvas();
      this._showToast('Drawings cleared', 'info');
    });

    const panel = document.querySelector('.chart-panel');
    if (panel) panel.addEventListener('click', e => this._handleChartClick(e));
  },

  _handleChartClick(e) {
    if (this.activeTool === 'none') return;
    if (!Charts.mainSeries || !Charts.main) return;

    const panel = document.querySelector('.chart-panel');
    const rect  = panel.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert pixel position → chart data coordinates (price + time)
    const price = Charts.mainSeries.coordinateToPrice(y);
    if (price == null) return;

    if (this.activeTool === 'horizontal') {
      // Horizontal lines only need price (y-axis value); no time needed
      this.drawings.push({ type: 'horizontal', price });
      this._saveDrawings();
      this._redrawCanvas();

    } else if (this.activeTool === 'trendline') {
      const time = Charts.main.timeScale().coordinateToTime(x);
      if (time == null) return;

      if (!this.drawingState) {
        this.drawingState = { time, price };
        document.getElementById('draw-hint').textContent = 'Click second point to finish';
      } else {
        this.drawings.push({ type: 'trendline', t1: this.drawingState.time, p1: this.drawingState.price, t2: time, p2: price });
        this.drawingState = null;
        document.getElementById('draw-hint').textContent = 'Click two points to draw a trend line';
        this._saveDrawings();
        this._redrawCanvas();
      }

    } else if (this.activeTool === 'annotation') {
      const time = Charts.main.timeScale().coordinateToTime(x);
      if (time == null) return;
      this._pendingAnnotationPos = { time, price };
      document.getElementById('annotation-text').value = '';
      document.getElementById('annotation-modal').classList.remove('hidden');
    }
  },

  _redrawCanvas() {
    const panel = document.querySelector('.chart-panel');
    const cv    = document.getElementById('draw-overlay');
    if (!cv || !panel || !Charts.mainSeries || !Charts.main) return;
    cv.width  = panel.clientWidth;
    cv.height = panel.clientHeight;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);

    const ts = Charts.main.timeScale();

    this.drawings.forEach(d => {
      ctx.save();
      try {
        if (d.type === 'horizontal') {
          // Convert stored price → current pixel y (tracks chart pan/zoom)
          const yPx = Charts.mainSeries.priceToCoordinate(d.price);
          if (yPx == null) return;
          ctx.strokeStyle = 'rgba(255,183,3,0.75)';
          ctx.lineWidth   = 1.5;
          ctx.setLineDash([6, 3]);
          ctx.beginPath(); ctx.moveTo(0, yPx); ctx.lineTo(cv.width, yPx); ctx.stroke();
          ctx.fillStyle = 'rgba(255,183,3,0.9)';
          ctx.font      = '10px DM Mono, monospace';
          ctx.fillText('H', 5, yPx - 4);

        } else if (d.type === 'trendline') {
          // Convert stored (time, price) pairs → current pixel coords
          const x1 = ts.timeToCoordinate(d.t1);
          const y1 = Charts.mainSeries.priceToCoordinate(d.p1);
          const x2 = ts.timeToCoordinate(d.t2);
          const y2 = Charts.mainSeries.priceToCoordinate(d.p2);
          if (x1 == null || y1 == null || x2 == null || y2 == null) return;
          ctx.strokeStyle = 'rgba(76,201,240,0.8)';
          ctx.lineWidth   = 1.5;
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.fillStyle = 'rgba(76,201,240,0.9)';
          ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x2, y2, 3, 0, Math.PI * 2); ctx.fill();

        } else if (d.type === 'annotation') {
          const xPx = ts.timeToCoordinate(d.time);
          const yPx = Charts.mainSeries.priceToCoordinate(d.price);
          if (xPx == null || yPx == null) return;
          ctx.fillStyle = 'rgba(247,37,133,0.9)';
          ctx.font      = 'bold 11px DM Mono, monospace';
          ctx.fillText('✎ ' + d.text, xPx + 10, yPx - 6);
          ctx.beginPath(); ctx.arc(xPx, yPx, 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(247,37,133,0.8)'; ctx.fill();
        }
      } finally {
        ctx.restore();
      }
    });
  },

  _initAnnotationModal() {
    document.getElementById('close-annotation').addEventListener('click', () => {
      document.getElementById('annotation-modal').classList.add('hidden');
    });
    document.getElementById('annotation-overlay').addEventListener('click', () => {
      document.getElementById('annotation-modal').classList.add('hidden');
    });
    document.getElementById('confirm-annotation').addEventListener('click', () => {
      const text = document.getElementById('annotation-text').value.trim();
      if (!text) { this._showToast('Please enter a note', 'warning'); return; }
      const pos = this._pendingAnnotationPos;
      if (pos) {
        this.drawings.push({ type: 'annotation', time: pos.time, price: pos.price, text });
        this._saveDrawings();
        this._redrawCanvas();
        this._showToast('Note added to chart', 'success');
      }
      document.getElementById('annotation-modal').classList.add('hidden');
      this._pendingAnnotationPos = null;
    });
    document.getElementById('annotation-text').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('confirm-annotation').click();
    });
  },

  // ── Search ──
  _initSearch() {
    const input    = document.getElementById('search-input');
    const dropdown = document.getElementById('search-results');
    let timer;

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim().toLowerCase();
      if (!q) { dropdown.classList.add('hidden'); return; }
      timer = setTimeout(() => {
        const pool  = this.markets || [];
        const coins = pool.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
        ).slice(0, 8);
        if (!coins.length) { dropdown.classList.add('hidden'); return; }
        dropdown.innerHTML = coins.map(c => `
          <div class="search-item" data-id="${c.id}">
            <img src="${c.image}" alt="" onerror="this.style.display='none'">
            <div>
              <div class="search-item-name">${c.name}</div>
              <div class="search-item-sym">${c.symbol.toUpperCase()}</div>
            </div>
          </div>`).join('');
        dropdown.classList.remove('hidden');
        dropdown.querySelectorAll('.search-item').forEach(item => {
          item.addEventListener('click', () => {
            this.showView('charts');
            this._loadChartCoin(item.dataset.id);
            input.value = '';
            dropdown.classList.add('hidden');
          });
        });
      }, 200);
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { dropdown.classList.add('hidden'); input.value = ''; }
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrapper')) dropdown.classList.add('hidden');
    });
  },

  // ── Portfolio ──
  _initPortfolioModal() {
    document.getElementById('add-holding-btn').addEventListener('click', () => {
      document.getElementById('add-holding-modal').classList.remove('hidden');
      document.getElementById('holding-error').classList.add('hidden');
      document.getElementById('holding-amount').value = '';
      document.getElementById('holding-buy-price').value = '';
    });
    document.getElementById('close-modal').addEventListener('click', () => {
      document.getElementById('add-holding-modal').classList.add('hidden');
    });
    document.getElementById('modal-overlay').addEventListener('click', () => {
      document.getElementById('add-holding-modal').classList.add('hidden');
    });
    document.getElementById('confirm-add-holding').addEventListener('click', () => this._addHolding());
  },

  _updateHoldingSelect(coins) {
    if (!document.getElementById('holding-coin-wrap')) return;
    const opts = coins.map(c => ({ value:c.id, label:`${c.name} (${c.symbol.toUpperCase()})`, img:c.image, _coin:c }));
    if (!CSelect._instances['holding-coin-wrap']) {
      CSelect.create('holding-coin-wrap', opts, null, { searchable:true });
    } else {
      CSelect.update('holding-coin-wrap', opts);
    }
  },

  async _addHolding() {
    const errEl  = document.getElementById('holding-error');
    const coinId = CSelect.getValue('holding-coin-wrap');
    const amt    = parseFloat(document.getElementById('holding-amount').value);
    const buy    = parseFloat(document.getElementById('holding-buy-price').value);

    if (!amt || amt <= 0) {
      errEl.textContent = 'Enter a valid amount greater than 0.';
      errEl.classList.remove('hidden'); return;
    }
    if (!buy || buy <= 0) {
      errEl.textContent = 'Enter a valid buy price greater than 0.';
      errEl.classList.remove('hidden'); return;
    }

    const marketCoin = this.markets.find(m => m.id === coinId) || { id:coinId, symbol:coinId, name:coinId, image:'' };
    const coin = { id:marketCoin.id, symbol:marketCoin.symbol, name:marketCoin.name, image:marketCoin.image };
    Portfolio.add(coin, amt, buy);
    document.getElementById('add-holding-modal').classList.add('hidden');
    this._renderPortfolio();
    this._showToast(`${coin.name} added to portfolio`, 'success');
  },

  async _renderPortfolio() {
    const holdings = Portfolio.load();
    const emptyEl  = document.getElementById('portfolio-empty');

    if (!holdings.length) {
      emptyEl.style.display = '';
      document.getElementById('holdings-body').innerHTML = '';
      ['portfolio-total-value','portfolio-total-cost','portfolio-pnl'].forEach(id => document.getElementById(id).textContent = '$0.00');
      document.getElementById('portfolio-count').textContent = '0';
      document.getElementById('portfolio-pnl-pct').innerHTML = '';
      Charts.renderPortfolioPie([]);
      return;
    }
    emptyEl.style.display = 'none';

    const prices = {};
    this.markets.forEach(m => { prices[m.id] = m.current_price; });

    const { enriched, totalValue, totalCost, totalPnl, totalPnlPct } = Portfolio.calcStats(holdings, prices);

    document.getElementById('portfolio-total-value').textContent = '$' + totalValue.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
    document.getElementById('portfolio-total-cost').textContent  = '$' + totalCost.toLocaleString('en-US',  { minimumFractionDigits:2, maximumFractionDigits:2 });
    const pnlEl = document.getElementById('portfolio-pnl');
    const pnlSign = totalPnl >= 0;
    pnlEl.innerHTML = `<span class="pct-badge ${pnlSign?'up':'down'}" style="font-size:14px;padding:3px 10px">${pnlSign?'+':'-'}$${Math.abs(totalPnl).toLocaleString('en-US',{maximumFractionDigits:2})}</span>`;
    pnlEl.className = 'sc-value';
    document.getElementById('portfolio-pnl-pct').innerHTML = this._fmtPct(totalPnlPct);
    document.getElementById('portfolio-count').textContent = holdings.length;

    const tbody = document.getElementById('holdings-body');
    tbody.innerHTML = enriched.map(h => `
      <tr>
        <td><div class="coin-cell">
          <img src="${h.image}" alt="" onerror="this.style.display='none'">
          <div><div class="coin-name">${h.name}</div><div class="coin-sym">${h.symbol.toUpperCase()}</div></div>
        </div></td>
        <td>${h.amount.toLocaleString('en-US', { maximumFractionDigits:6 })}</td>
        <td>${this._fmtPrice(h.buyPrice)}</td>
        <td>${this._fmtPrice(h.cur)}</td>
        <td>$${h.value.toLocaleString('en-US', { maximumFractionDigits:2 })}</td>
        <td><span class="pct-badge ${h.pnl>=0?'up':'down'}">${h.pnl>=0?'+':'-'}$${Math.abs(h.pnl).toLocaleString('en-US',{maximumFractionDigits:2})}</span></td>
        <td>${this._fmtPct(h.pnlPct)}</td>
        <td><button class="btn-remove" data-id="${h.id}">✕</button></td>
      </tr>`).join('');

    tbody.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const h = enriched.find(x => x.id === btn.dataset.id);
        Portfolio.remove(btn.dataset.id);
        this._renderPortfolio();
        this._showToast(`${h?.name || btn.dataset.id} removed from portfolio`, 'info');
      });
    });

    Charts.renderPortfolioPie(enriched);
  },

  _exportPortfolioCSV() {
    const holdings = Portfolio.load();
    if (!holdings.length) { this._showToast('No holdings to export', 'warning'); return; }
    const prices = {};
    this.markets.forEach(m => { prices[m.id] = m.current_price; });
    const { enriched } = Portfolio.calcStats(holdings, prices);

    const headers = ['Coin','Symbol','Amount','Avg Buy Price (USD)','Current Price (USD)','Value (USD)','P&L (USD)','P&L %'];
    const rows = enriched.map(h => [
      h.name, h.symbol.toUpperCase(), h.amount,
      h.buyPrice.toFixed(8), h.cur.toFixed(8),
      h.value.toFixed(2), h.pnl.toFixed(2),
      h.pnlPct.toFixed(2) + '%'
    ]);

    const csv  = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `cryptonex_portfolio_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    this._showToast('Portfolio exported as CSV', 'success');
  },

  // ── Prediction ──
  _updatePredictionSelect(coins) {
    if (!document.getElementById('pred-coin-wrap')) return;
    const opts = coins.map(c => ({ value:c.id, label:`${c.name} (${c.symbol.toUpperCase()})`, img:c.image }));
    if (!CSelect._instances['pred-coin-wrap']) {
      CSelect.create('pred-coin-wrap', opts, null, {});
    } else {
      CSelect.update('pred-coin-wrap', opts);
    }
  },

  _initPrediction() {
    CSelect.create('pred-days-wrap', [
      { value:'7',  label:'7 Days ahead'  },
      { value:'14', label:'14 Days ahead' },
      { value:'30', label:'30 Days ahead' },
    ], null, {});
    document.getElementById('run-prediction-btn').addEventListener('click', () => this._runPrediction());
  },

  async _runPrediction() {
    const coinId = CSelect.getValue('pred-coin-wrap') || 'bitcoin';
    const days   = parseInt(CSelect.getValue('pred-days-wrap') || '7');
    const btn    = document.getElementById('run-prediction-btn');
    btn.textContent = 'Running...'; btn.disabled = true;

    try {
      const data = await API.getMarketChart(coinId, 90);
      const closes = data.prices.map(p => p[1]);
      const { future, r2, rmse, trend } = Prediction.forecast(closes, days);
      Charts.renderPrediction(data.prices, future, coinId);

      const lastPrice = closes[closes.length - 1];
      const predPrice = future[future.length - 1].price;
      const change    = ((predPrice - lastPrice) / lastPrice) * 100;

      document.getElementById('prediction-summary').innerHTML = `
        <div class="forecast-row"><span class="forecast-lbl">Current Price</span><span class="forecast-val">${this._fmtPrice(lastPrice)}</span></div>
        <div class="forecast-row"><span class="forecast-lbl">Forecast (${days}d)</span><span class="forecast-val ${predPrice >= lastPrice ? 'up' : 'down'}">${this._fmtPrice(predPrice)}</span></div>
        <div class="forecast-row"><span class="forecast-lbl">Expected Change</span><span class="forecast-val ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span></div>
        <div class="forecast-row"><span class="forecast-lbl">Trend Signal</span><span class="forecast-val ${trend === 'bullish' ? 'up' : 'down'}">${trend.toUpperCase()}</span></div>
        <div class="forecast-row"><span class="forecast-lbl">R² Score</span><span class="forecast-val">${r2}</span></div>
        <div class="forecast-row"><span class="forecast-lbl">RMSE</span><span class="forecast-val">$${parseFloat(rmse).toLocaleString('en-US', { maximumFractionDigits:2 })}</span></div>`;
    } catch(e) {
      this._showError('Prediction failed: ' + e.message);
    }
    btn.textContent = 'Run Prediction'; btn.disabled = false;
  },

  // ── Sidebar Toggle ──
  _initSidebarToggle() {
    const btn = document.getElementById('sidebar-toggle');
    if (!btn) return;
    const app = document.getElementById('app');
    if (localStorage.getItem('cryptonex_sidebar') === 'collapsed') app.classList.add('sidebar-collapsed');
    btn.addEventListener('click', () => {
      app.classList.toggle('sidebar-collapsed');
      localStorage.setItem('cryptonex_sidebar', app.classList.contains('sidebar-collapsed') ? 'collapsed' : 'expanded');
      setTimeout(() => Charts.resizeAll(), 320);
    });
  },

  // ── Heatmap ──
  _initHeatmapControls() {
    document.getElementById('heatmap-metric-group')?.addEventListener('click', e => {
      const btn = e.target.closest('.btn-seg');
      if (!btn || !btn.dataset.metric) return;
      document.querySelectorAll('#heatmap-metric-group .btn-seg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this._heatmapMetric = btn.dataset.metric;
      this._renderHeatmap();
    });
  },

  _renderHeatmap() {
    const container = document.getElementById('heatmap-container');
    if (!container || !this.markets.length) return;
    const legend = document.getElementById('heatmap-legend');
    if (legend) {
      const steps = [
        { pct: -10, label: '≤ −10%' },
        { pct: -5,  label: '−5%' },
        { pct: -2,  label: '−2%' },
        { pct: 0,   label: '0%' },
        { pct: 2,   label: '+2%' },
        { pct: 5,   label: '+5%' },
        { pct: 10,  label: '≥ +10%' },
      ];
      legend.innerHTML = `
        <span class="legend-label">Performance:</span>
        <div class="legend-track">
          ${steps.map(s => `
            <div class="legend-step">
              <div class="legend-swatch" style="background:${this._heatColor(s.pct)}"></div>
              <span class="legend-step-label">${s.label}</span>
            </div>`).join('')}
        </div>`;
    }
    const getChg = c => {
      if (this._heatmapMetric === '1h') return c.price_change_percentage_1h_in_currency;
      if (this._heatmapMetric === '7d') return c.price_change_percentage_7d_in_currency;
      return c.price_change_percentage_24h;
    };
    const sorted = [...this.markets].sort((a, b) => b.market_cap - a.market_cap).slice(0, 100);
    container.innerHTML = sorted.map(c => {
      const chg = getChg(c) ?? 0;
      const bg = this._heatColor(chg);
      return `<div class="heat-tile" data-id="${c.id}"
        style="background:${bg}"
        title="${c.name}: ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%">
        <div class="heat-sym">${c.symbol.toUpperCase()}</div>
        <div class="heat-chg ${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</div>
        <div class="heat-price-sm">${this._fmtPrice(c.current_price)}</div>
      </div>`;
    }).join('');
    container.querySelectorAll('.heat-tile').forEach(tile => {
      tile.addEventListener('click', () => this._openCoinDetail(tile.dataset.id));
    });
  },

  _heatColor(pct) {
    const abs = Math.min(Math.abs(pct), 10);
    const t   = abs / 10;
    if (pct >= 0) {
      const r = Math.round(3   + (5   - 3)   * t);
      const g = Math.round(50  + (214 - 50)  * t);
      const b = Math.round(35  + (160 - 35)  * t);
      return `rgba(${r},${g},${b},${(0.28 + t * 0.68).toFixed(2)})`;
    } else {
      const r = Math.round(50  + (239 - 50)  * t);
      const g = Math.round(15  + (35  - 15)  * t);
      const b = Math.round(20  + (60  - 20)  * t);
      return `rgba(${r},${g},${b},${(0.28 + t * 0.68).toFixed(2)})`;
    }
  },

  // ── Coin Detail Drawer ──
  _initCoinDrawer() {
    document.getElementById('drawer-close')?.addEventListener('click', () => this._closeCoinDetail());
    document.getElementById('coin-drawer-bg')?.addEventListener('click', () => this._closeCoinDetail());
    document.getElementById('drawer-btn-chart')?.addEventListener('click', () => {
      const coinId = this._drawerCoinId; // capture before _closeCoinDetail nulls it
      if (!coinId) return;
      const coin = this.markets.find(m => m.id === coinId);
      if (coin) this.currentCoin = { id: coin.id, symbol: coin.symbol, name: coin.name, image: coin.image };
      this._closeCoinDetail();
      this.showView('charts'); // showView timeout now reads the updated this.currentCoin.id
    });
    document.getElementById('drawer-btn-watch')?.addEventListener('click', () => {
      if (!this._drawerCoinId) return;
      const isNow = Watchlist.toggle(this._drawerCoinId);
      const btn = document.getElementById('drawer-btn-watch');
      btn.textContent = isNow ? '★ Watching' : '☆ Watch';
      btn.classList.toggle('active-watch', isNow);
      const coin = this.markets.find(m => m.id === this._drawerCoinId);
      this._showToast(isNow ? `${coin?.name || this._drawerCoinId} added to watchlist` : 'Removed from watchlist', isNow ? 'success' : 'info');
    });
    document.getElementById('drawer-btn-alert')?.addEventListener('click', () => {
      if (this._drawerCoinId) { this._closeCoinDetail(); this._openAlertModal(this._drawerCoinId); }
    });
  },

  _openCoinDetail(coinId) {
    const coin = this.markets.find(m => m.id === coinId);
    if (!coin) return;
    this._drawerCoinId = coinId;
    const img = document.getElementById('drawer-img');
    if (coin.image) { img.src = coin.image; img.style.display = ''; } else { img.style.display = 'none'; }
    document.getElementById('drawer-name').textContent = coin.name;
    document.getElementById('drawer-sym').textContent  = coin.symbol.toUpperCase() + ' / USD';
    document.getElementById('drawer-price').textContent = this._fmtPrice(coin.current_price);
    document.getElementById('drawer-change').innerHTML  = this._fmtPct(coin.price_change_percentage_24h) + ' (24h)';
    document.getElementById('drawer-stats').innerHTML = [
      ['Market Cap',  this._fmtLarge(coin.market_cap)],
      ['Rank',        '#' + coin.market_cap_rank],
      ['Volume 24h',  this._fmtLarge(coin.total_volume)],
      ['24h High',    this._fmtPrice(coin.high_24h)],
      ['24h Low',     this._fmtPrice(coin.low_24h)],
      ['ATH',         this._fmtPrice(coin.ath)],
      ['1h Change',   this._fmtPct(coin.price_change_percentage_1h_in_currency)],
      ['7d Change',   this._fmtPct(coin.price_change_percentage_7d_in_currency)],
    ].map(([l, v]) => `<div class="drawer-stat"><div class="drawer-stat-lbl">${l}</div><div class="drawer-stat-val">${v}</div></div>`).join('');
    const watched = Watchlist.has(coinId);
    const watchBtn = document.getElementById('drawer-btn-watch');
    watchBtn.textContent = watched ? '★ Watching' : '☆ Watch';
    watchBtn.classList.toggle('active-watch', watched);
    const descs = {
      'bitcoin':     'The first and largest cryptocurrency by market cap. A decentralized digital currency created in 2009 by Satoshi Nakamoto, running on a proof-of-work blockchain.',
      'ethereum':    'A programmable blockchain platform for smart contracts and decentralized apps (dApps). The foundation of the DeFi and NFT ecosystems.',
      'solana':      'A high-performance blockchain supporting thousands of TPS with low fees. Known for speed, low cost, and a rapidly growing developer ecosystem.',
      'binancecoin': 'Native cryptocurrency of the Binance ecosystem. Used for trading fee discounts, BNB Chain operations, and DeFi applications.',
      'ripple':      'Digital asset and payment protocol designed for fast, low-cost international money transfers between financial institutions.',
      'dogecoin':    'Started as a meme coin in 2013, DOGE has grown into a top-10 cryptocurrency by market cap with a passionate global community.',
      'cardano':     'A proof-of-stake blockchain built with peer-reviewed research and an evidence-based development methodology. Focused on scalability and sustainability.',
      'tether':      'The world\'s most traded stablecoin, pegged 1:1 to the US Dollar. Used as a safe-haven asset and for trading pairs across exchanges.',
      'pepe':        'A meme-inspired cryptocurrency based on the iconic Pepe the Frog internet meme. One of the fastest-growing tokens by market capitalization.',
      'shiba-inu':   'An Ethereum-based meme token that evolved into a full ecosystem including a DEX, NFT collection, and layer-2 blockchain Shibarium.',
    };
    document.getElementById('drawer-about').textContent = descs[coinId] || `${coin.name} (${coin.symbol.toUpperCase()}) is a digital asset ranked #${coin.market_cap_rank} by global market capitalization.`;
    document.getElementById('coin-drawer').classList.add('open');
    document.body.style.overflow = 'hidden';
  },

  _closeCoinDetail() {
    document.getElementById('coin-drawer')?.classList.remove('open');
    document.body.style.overflow = '';
    this._drawerCoinId = null;
  },

  // ── Price Alerts ──
  _initAlertModal() {
    document.getElementById('close-alert-modal')?.addEventListener('click', () => this._closeAlertModal());
    document.getElementById('alert-overlay')?.addEventListener('click', () => this._closeAlertModal());
    document.getElementById('alert-dir-group')?.addEventListener('click', e => {
      const btn = e.target.closest('.btn-seg');
      if (!btn) return;
      document.querySelectorAll('#alert-dir-group .btn-seg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    document.getElementById('confirm-alert-btn')?.addEventListener('click', () => this._addAlert());
  },

  _openAlertModal(coinId) {
    this._alertCoinId = coinId;
    const coin = this.markets.find(m => m.id === coinId);
    document.getElementById('alert-coin-info').innerHTML = coin ? `
      <div class="alert-coin-row">
        <img src="${coin.image}" alt="" onerror="this.style.display='none'">
        <strong>${coin.name}</strong>
        <span style="color:var(--text-dim)">${coin.symbol.toUpperCase()}</span>
        <span style="margin-left:auto;font-family:var(--font-m)">${this._fmtPrice(coin.current_price)}</span>
      </div>` : '';
    document.getElementById('alert-target-price').value = '';
    document.getElementById('alert-err').classList.add('hidden');
    document.querySelectorAll('#alert-dir-group .btn-seg').forEach(b => b.classList.toggle('active', b.dataset.dir === 'above'));
    this._renderAlertsList();
    document.getElementById('alert-modal').classList.remove('hidden');
  },

  _closeAlertModal() {
    document.getElementById('alert-modal')?.classList.add('hidden');
    this._alertCoinId = null;
  },

  _addAlert() {
    const price = parseFloat(document.getElementById('alert-target-price').value);
    const errEl = document.getElementById('alert-err');
    if (!price || price <= 0) { errEl.textContent = 'Enter a valid target price.'; errEl.classList.remove('hidden'); return; }
    const dir  = document.querySelector('#alert-dir-group .btn-seg.active')?.dataset.dir || 'above';
    const coin = this.markets.find(m => m.id === this._alertCoinId);
    Alerts.add({ coinId: this._alertCoinId, coinName: coin?.name || this._alertCoinId, symbol: coin?.symbol || '', targetPrice: price, direction: dir });
    this._renderAlertsList();
    document.getElementById('alert-target-price').value = '';
    errEl.classList.add('hidden');
    this._showToast(`Alert set: ${coin?.name} ${dir} $${price.toLocaleString('en-US')}`, 'success');
  },

  _renderAlertsList() {
    const list = document.getElementById('alerts-list');
    if (!list) return;
    const alerts = Alerts.load().filter(a => a.coinId === this._alertCoinId);
    if (!alerts.length) { list.innerHTML = '<div style="color:var(--text-dim);font-size:11px;font-family:var(--font-m)">No active alerts for this coin.</div>'; return; }
    list.innerHTML = alerts.map(a => `
      <div class="alert-item ${a.triggered ? 'triggered' : ''}">
        <div class="alert-item-info">
          <span class="alert-dir-badge ${a.direction}">${a.direction.toUpperCase()}</span>
          <span class="alert-price">$${a.targetPrice.toLocaleString('en-US')}</span>
          ${a.triggered ? '<span class="alert-triggered-badge">TRIGGERED</span>' : ''}
        </div>
        <button class="btn-remove" data-alert-id="${a.id}">✕</button>
      </div>`).join('');
    list.querySelectorAll('[data-alert-id]').forEach(btn => {
      btn.addEventListener('click', () => { Alerts.remove(parseInt(btn.dataset.alertId)); this._renderAlertsList(); });
    });
  },

  _checkAlerts(coins) {
    const active = Alerts.load().filter(a => !a.triggered);
    if (!active.length) return;
    active.forEach(a => {
      const coin = coins.find(c => c.id === a.coinId);
      if (!coin) return;
      const hit = (a.direction === 'above' && coin.current_price >= a.targetPrice) ||
                  (a.direction === 'below' && coin.current_price <= a.targetPrice);
      if (hit) {
        Alerts.markTriggered(a.id);
        this._showToast(`🔔 ${a.coinName} is ${a.direction} $${a.targetPrice.toLocaleString('en-US')} — now ${this._fmtPrice(coin.current_price)}`, 'warning', 9000);
      }
    });
  },

  // ── Converter ──
  _initConverter() {
    document.getElementById('conv-amount')?.addEventListener('input', () => this._updateConverter());
    CSelect.create('conv-coin-wrap', [], () => this._updateConverter(), { searchable: true });
  },

  _updateConverterCoins(coins) {
    const prev = CSelect.getValue('conv-coin-wrap');
    const opts = coins.slice(0, 50).map(c => ({ value: c.id, label: `${c.symbol.toUpperCase()} — ${c.name}`, img: c.image }));
    CSelect.update('conv-coin-wrap', opts);
    if (prev && coins.find(c => c.id === prev)) CSelect.setValue('conv-coin-wrap', prev);
    this._updateConverter();
  },

  _updateConverter() {
    const amt  = parseFloat(document.getElementById('conv-amount')?.value) || 0;
    const id   = CSelect.getValue('conv-coin-wrap');
    const coin = this.markets.find(m => m.id === id);
    const btc  = this.markets.find(m => m.id === 'bitcoin');
    const eth  = this.markets.find(m => m.id === 'ethereum');
    if (!coin) return;
    const usdVal = amt * coin.current_price;
    const fmt    = n => n >= 1 ? n.toLocaleString('en-US', { maximumFractionDigits:2 }) : n.toFixed(8);
    const usdEl = document.getElementById('conv-usd');
    const btcEl = document.getElementById('conv-btc');
    const ethEl = document.getElementById('conv-eth');
    if (usdEl) usdEl.textContent = '$' + (usdVal >= 1 ? usdVal.toLocaleString('en-US', { maximumFractionDigits:2 }) : usdVal.toFixed(6));
    if (btcEl) btcEl.textContent = btc ? fmt(usdVal / btc.current_price) + ' BTC' : '—';
    if (ethEl) ethEl.textContent = eth ? fmt(usdVal / eth.current_price) + ' ETH' : '—';
  },

  // ── Market Dominance Bar ──
  _renderDominanceBar(coins) {
    const wrap = document.getElementById('dominance-bar-wrap');
    if (!wrap || !coins.length) return;
    const totalMcap = coins.reduce((s, c) => s + (c.market_cap || 0), 0);
    if (!totalMcap) return;
    const top5   = coins.slice(0, 5);
    const othersPct = Math.max(0, 100 - top5.reduce((s, c) => s + (c.market_cap / totalMcap * 100), 0));
    const colors = ['var(--magenta)', 'var(--cyan)', 'var(--indigo)', 'var(--green)', 'var(--amber)', 'var(--text-mute)'];
    const segs   = [
      ...top5.map((c, i) => ({ sym:c.symbol.toUpperCase(), pct:c.market_cap/totalMcap*100, chg:c.price_change_percentage_24h, color:colors[i] })),
      { sym:'Others', pct:othersPct, chg:null, color:colors[5] }
    ];
    const fmtMcap = n => n >= 1e12 ? '$' + (n/1e12).toFixed(2)+'T' : '$' + (n/1e9).toFixed(0)+'B';
    wrap.innerHTML = `
      <div class="dom-bar">${segs.map(s => `<div class="dom-seg" style="width:${s.pct.toFixed(1)}%;background:${s.color}" title="${s.sym}: ${s.pct.toFixed(1)}%">${s.pct >= 7 ? s.sym : ''}</div>`).join('')}</div>
      <div class="dom-cards">${segs.slice(0,6).map(s => {
        const chgHtml = (s.chg !== null && s.chg !== undefined) ? this._fmtPct(s.chg) : '';
        return `<div class="dom-card" style="--card-accent:${s.color}"><div class="dom-card-sym">${s.sym}</div><div class="dom-card-pct">${s.pct.toFixed(1)}%</div>${chgHtml}</div>`;
      }).join('')}</div>
      <div class="dom-total">Total: ${fmtMcap(totalMcap)}</div>`;
  },

  // ── Price Flash ──
  _flashPrices(newCoins) {
    if (!Object.keys(this._prevPrices).length) {
      newCoins.forEach(c => { this._prevPrices[c.id] = c.current_price; });
      return;
    }
    newCoins.forEach(c => {
      const prev = this._prevPrices[c.id];
      if (prev === undefined) { this._prevPrices[c.id] = c.current_price; return; }
      if (Math.abs(c.current_price - prev) / (prev || 1) > 0.0001) {
        const cls = c.current_price > prev ? 'flash-up' : 'flash-down';
        document.querySelectorAll(`tr[data-id="${c.id}"] td:nth-child(3)`).forEach(el => {
          el.classList.remove('flash-up', 'flash-down');
          void el.offsetWidth;
          el.classList.add(cls);
          setTimeout(() => el.classList.remove(cls), 900);
        });
      }
      this._prevPrices[c.id] = c.current_price;
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
