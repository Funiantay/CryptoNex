/* CryptoNex — API Layer (4-tier fallback, zero mandatory API keys)
   Tier 1 → CoinGecko     (most accurate: prices, 1h/7d/30d %, sparklines, ATH)
   Tier 2 → CryptoCompare (reliable backup market data)
   Tier 3 → CoinCap       (second backup)
   Tier 4 → Built-in demo (always works, never fails)
*/

const API = {
  _cache:       new Map(),
  _symbolCache: new Map(), // coinId → SYMBOL (e.g. 'bitcoin' → 'BTC')
  demoMode:     false,

  /* ── Core fetch: cache + timeout + auto-retry + 429 guard ── */
  async _fetch(url, ttl = 60000, retries = 2) {
    const hit = this._cache.get(url);
    if (hit && Date.now() - hit.t < ttl) return hit.d;
    for (let i = 0; i < retries; i++) {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (res.status === 429) throw new Error('Rate limited (429)');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        this._cache.set(url, { d, t: Date.now() });
        return d;
      } catch (e) {
        clearTimeout(timer);
        if (i === retries - 1) throw e;
        await new Promise(r => setTimeout(r, 800 * (i + 1)));
      }
    }
  },

  /* ── CryptoCompare symbol → CoinGecko coin id ── */
  _CC: {
    'BTC':'bitcoin','ETH':'ethereum','USDT':'tether','BNB':'binancecoin',
    'SOL':'solana','XRP':'ripple','USDC':'usd-coin','DOGE':'dogecoin',
    'ADA':'cardano','TRX':'tron','AVAX':'avalanche-2','SHIB':'shiba-inu',
    'LINK':'chainlink','DOT':'polkadot','BCH':'bitcoin-cash','NEAR':'near',
    'MATIC':'matic-network','LTC':'litecoin','UNI':'uniswap','ATOM':'cosmos',
    'XLM':'stellar','ETC':'ethereum-classic','TON':'the-open-network',
    'ICP':'internet-computer','APT':'aptos','OP':'optimism','ARB':'arbitrum',
    'HBAR':'hedera-hashgraph','FIL':'filecoin','MKR':'maker','PEPE':'pepe',
    'SUI':'sui','INJ':'injective-protocol','RNDR':'render-token','WIF':'dogwifhat',
    'BONK':'bonk','FET':'fetch-ai','TAO':'bittensor','WLD':'worldcoin-wld',
    'SEI':'sei-network','JTO':'jito-governance-token',
  },

  /* ── Normalise CoinGecko markets item → standard shape ── */
  _normCoinGecko(c) {
    if (!c.current_price || c.current_price <= 0) return null;
    this._symbolCache.set(c.id, (c.symbol || '').toUpperCase());
    return {
      id:     c.id,
      symbol: (c.symbol || '').toLowerCase(),
      name:   c.name || c.id,
      image:  c.image || '',
      current_price:    c.current_price,
      market_cap:       c.market_cap     || 0,
      market_cap_rank:  c.market_cap_rank || 0,
      total_volume:     c.total_volume   || 0,
      high_24h:         c.high_24h       ?? null,
      low_24h:          c.low_24h        ?? null,
      ath:              c.ath            ?? null,
      price_change_percentage_24h:             c.price_change_percentage_24h                      ?? 0,
      price_change_percentage_1h_in_currency:  c.price_change_percentage_1h_in_currency           ?? null,
      price_change_percentage_7d_in_currency:  c.price_change_percentage_7d_in_currency           ?? null,
      price_change_percentage_30d_in_currency: c.price_change_percentage_30d_in_currency          ?? null,
      sparkline_in_7d:  c.sparkline_in_7d
        ? { price: (c.sparkline_in_7d.price || []).filter(p => p != null) }
        : { price: [] },
    };
  },

  /* ── Normalise CryptoCompare top/mktcapfull item → standard shape ── */
  _normCryptoCompare(item, rank) {
    const info = item.CoinInfo || {};
    const raw  = item.RAW?.USD || {};
    if (!raw.PRICE || raw.PRICE <= 0) return null; // skip coins with no price data
    const sym  = info.Name || '';
    const id   = this._CC[sym] || sym.toLowerCase();
    this._symbolCache.set(id, sym);
    return {
      id, symbol: sym.toLowerCase(), name: info.FullName || sym,
      image: info.ImageUrl ? `https://www.cryptocompare.com${info.ImageUrl}` : '',
      current_price:    raw.PRICE             || 0,
      market_cap:       raw.MKTCAP            || 0,
      market_cap_rank:  rank + 1,
      total_volume:     raw.TOTALVOLUME24H    || 0,
      high_24h:         raw.HIGH24HOUR        || null,
      low_24h:          raw.LOW24HOUR         || null,
      ath: null,
      price_change_percentage_24h:             raw.CHANGEPCT24HOUR || 0,
      price_change_percentage_1h_in_currency:  null,
      price_change_percentage_7d_in_currency:  null,
      price_change_percentage_30d_in_currency: null,
      sparkline_in_7d: { price: [] },
    };
  },

  /* ── Normalise CoinCap asset → standard shape ── */
  _normCoinCap(c) {
    const price = parseFloat(c.priceUsd) || 0;
    if (!price || price <= 0) return null;
    this._symbolCache.set(c.id, c.symbol.toUpperCase());
    return {
      id: c.id, symbol: c.symbol.toLowerCase(), name: c.name,
      image: `https://assets.coincap.io/assets/icons/${c.symbol.toLowerCase()}@2x.png`,
      current_price:    price,
      market_cap:       parseFloat(c.marketCapUsd)      || 0,
      market_cap_rank:  parseInt(c.rank)                || 0,
      total_volume:     parseFloat(c.volumeUsd24Hr)     || 0,
      high_24h: null, low_24h: null, ath: null,
      price_change_percentage_24h:             parseFloat(c.changePercent24Hr) || 0,
      price_change_percentage_1h_in_currency:  null,
      price_change_percentage_7d_in_currency:  null,
      price_change_percentage_30d_in_currency: null,
      sparkline_in_7d: { price: [] },
    };
  },

  /* ── Built-in demo coins (Tier 4 — always works) ── */
  _demoCoins() {
    const raw = [
      {id:'bitcoin',           sym:'BTC',  name:'Bitcoin',           price:108500,    mcap:2.14e12, vol:38.2e9,  chg: 1.8,  chg1h: 0.4, chg7: 5.2,  chg30: 12.1},
      {id:'ethereum',          sym:'ETH',  name:'Ethereum',          price:2560,      mcap:3.08e11, vol:18.6e9,  chg: 2.4,  chg1h: 0.6, chg7: 7.1,  chg30: 15.3},
      {id:'tether',            sym:'USDT', name:'Tether',            price:1.000,     mcap:1.53e11, vol:68.4e9,  chg: 0.01, chg1h: 0.0, chg7: 0.02, chg30: 0.1 },
      {id:'binancecoin',       sym:'BNB',  name:'BNB',               price:645,       mcap:9.36e10, vol:2.1e9,   chg:-0.3,  chg1h:-0.1, chg7:-0.8,  chg30:-2.4 },
      {id:'solana',            sym:'SOL',  name:'Solana',            price:175,       mcap:9.02e10, vol:4.2e9,   chg: 3.1,  chg1h: 0.8, chg7: 9.4,  chg30: 22.6},
      {id:'ripple',            sym:'XRP',  name:'XRP',               price:2.43,      mcap:1.40e11, vol:5.8e9,   chg:-0.8,  chg1h:-0.2, chg7:-2.3,  chg30:-5.8 },
      {id:'usd-coin',          sym:'USDC', name:'USD Coin',          price:1.000,     mcap:6.09e10, vol:8.2e9,   chg: 0.01, chg1h: 0.0, chg7: 0.01, chg30: 0.05},
      {id:'dogecoin',          sym:'DOGE', name:'Dogecoin',          price:0.226,     mcap:3.38e10, vol:1.8e9,   chg: 2.9,  chg1h: 0.7, chg7: 8.1,  chg30: 18.4},
      {id:'cardano',           sym:'ADA',  name:'Cardano',           price:0.792,     mcap:2.79e10, vol:0.82e9,  chg:-1.1,  chg1h:-0.3, chg7:-3.2,  chg30:-7.6 },
      {id:'tron',              sym:'TRX',  name:'TRON',              price:0.276,     mcap:2.38e10, vol:1.2e9,   chg: 0.5,  chg1h: 0.1, chg7: 1.8,  chg30: 4.2 },
      {id:'avalanche-2',       sym:'AVAX', name:'Avalanche',         price:24.8,      mcap:1.02e10, vol:0.62e9,  chg: 1.7,  chg1h: 0.4, chg7: 4.9,  chg30: 11.2},
      {id:'shiba-inu',         sym:'SHIB', name:'Shiba Inu',         price:0.0000142, mcap:8.38e9,  vol:0.42e9,  chg: 3.2,  chg1h: 0.8, chg7: 9.5,  chg30: 21.3},
      {id:'bitcoin-cash',      sym:'BCH',  name:'Bitcoin Cash',      price:419,       mcap:8.31e9,  vol:0.38e9,  chg: 0.6,  chg1h: 0.1, chg7: 1.9,  chg30: 4.6 },
      {id:'chainlink',         sym:'LINK', name:'Chainlink',         price:15.8,      mcap:9.27e9,  vol:0.58e9,  chg: 1.2,  chg1h: 0.3, chg7: 3.6,  chg30: 8.4 },
      {id:'stellar',           sym:'XLM',  name:'Stellar',           price:0.297,     mcap:9.19e9,  vol:0.38e9,  chg: 0.8,  chg1h: 0.2, chg7: 2.4,  chg30: 5.8 },
      {id:'near',              sym:'NEAR', name:'NEAR Protocol',     price:2.95,      mcap:3.56e9,  vol:0.28e9,  chg: 2.1,  chg1h: 0.5, chg7: 6.2,  chg30: 14.3},
      {id:'litecoin',          sym:'LTC',  name:'Litecoin',          price:97.4,      mcap:7.29e9,  vol:0.48e9,  chg: 0.9,  chg1h: 0.2, chg7: 2.7,  chg30: 6.3 },
      {id:'uniswap',           sym:'UNI',  name:'Uniswap',           price:6.84,      mcap:4.13e9,  vol:0.19e9,  chg: 1.3,  chg1h: 0.3, chg7: 3.8,  chg30: 8.9 },
      {id:'internet-computer', sym:'ICP',  name:'Internet Computer', price:5.83,      mcap:2.74e9,  vol:0.14e9,  chg:-0.4,  chg1h:-0.1, chg7:-1.2,  chg30:-2.9 },
      {id:'pepe',              sym:'PEPE', name:'Pepe',              price:0.0000128, mcap:5.39e9,  vol:0.82e9,  chg: 5.4,  chg1h: 1.3, chg7:15.7,  chg30: 35.2},
      {id:'matic-network',     sym:'MATIC',name:'Polygon',           price:0.243,     mcap:2.41e9,  vol:0.24e9,  chg:-1.6,  chg1h:-0.4, chg7:-4.8,  chg30:-11.2},
      {id:'cosmos',            sym:'ATOM', name:'Cosmos Hub',        price:4.51,      mcap:1.76e9,  vol:0.12e9,  chg:-1.9,  chg1h:-0.5, chg7:-5.6,  chg30:-12.8},
      {id:'ethereum-classic',  sym:'ETC',  name:'Ethereum Classic',  price:19.6,      mcap:2.88e9,  vol:0.19e9,  chg:-0.6,  chg1h:-0.1, chg7:-1.8,  chg30:-4.3 },
      {id:'monero',            sym:'XMR',  name:'Monero',            price:312,       mcap:5.79e9,  vol:0.18e9,  chg: 0.7,  chg1h: 0.2, chg7: 2.1,  chg30: 4.9 },
      {id:'filecoin',          sym:'FIL',  name:'Filecoin',          price:3.08,      mcap:1.69e9,  vol:0.1e9,   chg:-1.4,  chg1h:-0.4, chg7:-4.2,  chg30:-9.8 },
      {id:'maker',             sym:'MKR',  name:'Maker',             price:1710,      mcap:1.59e9,  vol:0.07e9,  chg: 1.8,  chg1h: 0.4, chg7: 5.4,  chg30:12.6 },
      {id:'aave',              sym:'AAVE', name:'Aave',              price:218,       mcap:3.25e9,  vol:0.29e9,  chg: 2.9,  chg1h: 0.7, chg7: 8.6,  chg30:19.8 },
      {id:'aptos',             sym:'APT',  name:'Aptos',             price:5.71,      mcap:2.46e9,  vol:0.19e9,  chg: 0.9,  chg1h: 0.2, chg7: 2.8,  chg30: 6.5 },
      {id:'arbitrum',          sym:'ARB',  name:'Arbitrum',          price:0.421,     mcap:1.56e9,  vol:0.15e9,  chg:-0.8,  chg1h:-0.2, chg7:-2.4,  chg30:-5.7 },
      {id:'optimism',          sym:'OP',   name:'Optimism',          price:0.858,     mcap:1.15e9,  vol:0.12e9,  chg: 0.5,  chg1h: 0.1, chg7: 1.6,  chg30: 3.8 },
      {id:'injective-protocol',sym:'INJ',  name:'Injective',         price:12.8,      mcap:1.20e9,  vol:0.14e9,  chg: 3.6,  chg1h: 0.9, chg7:10.8,  chg30:24.6 },
      {id:'render-token',      sym:'RNDR', name:'Render',            price:4.28,      mcap:1.64e9,  vol:0.1e9,   chg: 2.1,  chg1h: 0.5, chg7: 6.3,  chg30:14.5 },
      {id:'sui',               sym:'SUI',  name:'Sui',               price:3.84,      mcap:1.12e10, vol:0.92e9,  chg: 4.2,  chg1h: 1.1, chg7:12.6,  chg30:28.8 },
      {id:'hedera-hashgraph',  sym:'HBAR', name:'Hedera',            price:0.184,     mcap:7.76e9,  vol:0.38e9,  chg: 1.4,  chg1h: 0.4, chg7: 4.2,  chg30: 9.7 },
    ];
    return raw.map((c, i) => {
      this._symbolCache.set(c.id, c.sym);
      return {
        id: c.id, symbol: c.sym.toLowerCase(), name: c.name,
        image: `https://assets.coincap.io/assets/icons/${c.sym.toLowerCase()}@2x.png`,
        current_price: c.price, market_cap: c.mcap, market_cap_rank: i + 1,
        total_volume:  c.vol,
        high_24h: c.price * 1.025, low_24h: c.price * 0.975,
        ath: c.price * 2.5,
        price_change_percentage_24h:             c.chg,
        price_change_percentage_1h_in_currency:  c.chg1h,
        price_change_percentage_7d_in_currency:  c.chg7,
        price_change_percentage_30d_in_currency: c.chg30,
        sparkline_in_7d: { price: this._walk(c.price * 0.92, 168) },
      };
    });
  },

  /* ── Random walk price generator ── */
  _walk(start, steps) {
    const out = []; let p = start;
    for (let i = 0; i < steps; i++) { p *= 1 + (Math.random() - 0.478) * 0.022; out.push(p); }
    return out;
  },

  /* ── Synthetic OHLC ── */
  _syntheticOHLC(basePrice, days, hourly = false) {
    const count = hourly ? 24 : days;
    const step  = hourly ? 3.6e6 : 8.64e7;
    const out   = [];
    let   p     = basePrice * (1 - Math.random() * 0.12);
    const now   = Date.now();
    for (let i = count - 1; i >= 0; i--) {
      const t    = now - i * step;
      const open = p;
      p = p * (1 + (Math.random() - 0.475) * 0.028);
      out.push([t, open, Math.max(open, p) * 1.005, Math.min(open, p) * 0.995, p]);
    }
    return out;
  },

  /* ── Get symbol for a coin id ── */
  async _symbol(coinId) {
    if (this._symbolCache.has(coinId)) return this._symbolCache.get(coinId);
    await this.getMarkets();
    return this._symbolCache.get(coinId) || coinId.replace(/-/g, '').toUpperCase().slice(0, 5);
  },

  /* ── Binance interval helper ── */
  _bInterval(days) {
    if (days <= 1)  return { iv:'1h',  lim:24  };
    if (days <= 7)  return { iv:'4h',  lim:42  };
    if (days <= 30) return { iv:'1d',  lim:30  };
    if (days <= 90) return { iv:'1d',  lim:91  };
    return                 { iv:'1d',  lim:366 };
  },

  /* ════════════════════════════════════════════════
     PUBLIC METHODS
  ════════════════════════════════════════════ */

  async getGlobal() {
    /* Tier 1 — CoinGecko global endpoint (real totals) */
    try {
      const d = await this._fetch('https://api.coingecko.com/api/v3/global', 120000);
      if (d?.data) {
        const g = d.data;
        return {
          data: {
            total_market_cap:    { usd: g.total_market_cap?.usd || 0 },
            total_volume:        { usd: g.total_volume?.usd      || 0 },
            market_cap_percentage: { btc: g.market_cap_percentage?.btc || 0 },
            active_cryptocurrencies: g.active_cryptocurrencies || 14000,
            market_cap_change_percentage_24h_usd: g.market_cap_change_percentage_24h_usd || 0,
          }
        };
      }
    } catch (_) {}

    /* Fallback — derive from market list */
    const coins    = await this.getMarkets();
    const totalMcap = coins.reduce((s, c) => s + c.market_cap, 0);
    const totalVol  = coins.reduce((s, c) => s + c.total_volume, 0);
    const btc       = coins.find(c => c.id === 'bitcoin' || c.symbol === 'btc');
    const btcDom    = btc && totalMcap ? (btc.market_cap / totalMcap) * 100 : 0;
    const avgChg    = coins.reduce((s, c) => s + (c.price_change_percentage_24h || 0), 0) / coins.length;
    return {
      data: {
        total_market_cap:    { usd: totalMcap },
        total_volume:        { usd: totalVol },
        market_cap_percentage: { btc: btcDom },
        active_cryptocurrencies: 14000,
        market_cap_change_percentage_24h_usd: avgChg,
      }
    };
  },

  async getMarkets(order = 'market_cap_desc', perPage = 100) {
    let coins = null;

    /* Tier 1 — CoinGecko (most accurate, includes 1h/7d/30d changes + sparklines) */
    try {
      const d = await this._fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=true&price_change_percentage=1h,24h,7d,30d`,
        60000
      );
      if (Array.isArray(d) && d.length > 5) {
        const mapped = d.map(c => this._normCoinGecko(c)).filter(Boolean);
        if (mapped.length > 5) { coins = mapped; this.demoMode = false; }
      }
    } catch (_) {}

    /* Tier 2 — CryptoCompare */
    if (!coins) {
      try {
        const d = await this._fetch(
          `https://min-api.cryptocompare.com/data/top/mktcapfull?limit=${perPage}&tsym=USD`, 60000
        );
        if (d?.Data?.length) {
          const mapped = d.Data.map((x, i) => this._normCryptoCompare(x, i)).filter(Boolean);
          if (mapped.length > 5) { coins = mapped; this.demoMode = false; }
        }
      } catch (_) {}
    }

    /* Tier 3 — CoinCap */
    if (!coins) {
      try {
        const d = await this._fetch(`https://api.coincap.io/v2/assets?limit=${perPage}`, 60000);
        if (d?.data?.length) {
          const mapped = d.data.map(c => this._normCoinCap(c)).filter(Boolean);
          if (mapped.length > 5) { coins = mapped; this.demoMode = false; }
        }
      } catch (_) {}
    }

    /* Tier 4 — Built-in demo data */
    if (!coins) { coins = this._demoCoins(); this.demoMode = true; }

    if (order === 'market_cap_asc')  coins.sort((a, b) => a.market_cap - b.market_cap);
    if (order === 'volume_desc')     coins.sort((a, b) => b.total_volume - a.total_volume);
    if (order === 'gecko_desc')      coins.sort((a, b) => Math.abs(b.price_change_percentage_24h) - Math.abs(a.price_change_percentage_24h));
    return coins;
  },

  async getTrending() {
    const coins = await this.getMarkets();
    return { coins: coins.slice(0, 7).map(c => ({ item: { id: c.id, name: c.name, symbol: c.symbol.toUpperCase(), small: c.image } })) };
  },

  async search(query) {
    const q     = query.toLowerCase();
    const coins = await this.getMarkets('market_cap_desc', 200);
    const hits  = coins.filter(c => c.id.includes(q) || c.symbol.includes(q) || c.name.toLowerCase().includes(q)).slice(0, 8);
    return { coins: hits.map(c => ({ id: c.id, name: c.name, symbol: c.symbol, thumb: c.image })) };
  },

  async getOHLC(coinId, days = 30) {
    /* Tier 1 — CoinGecko OHLC (most accurate candlestick data) */
    try {
      const d = await this._fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`,
        60000
      );
      if (Array.isArray(d) && d.length > 2) return d;
    } catch (_) {}

    /* Tier 2 — CryptoCompare histoday / histohour */
    try {
      const sym = await this._symbol(coinId);
      const hourly = days <= 1;
      const ep  = hourly ? 'histohour' : 'histoday';
      const lim = hourly ? 23 : days - 1;
      const d   = await this._fetch(
        `https://min-api.cryptocompare.com/data/v2/${ep}?fsym=${sym}&tsym=USD&limit=${lim}`, 60000
      );
      const arr = d?.Data?.Data;
      if (arr?.length) return arr.map(r => [r.time * 1000, r.open, r.high, r.low, r.close]);
    } catch (_) {}

    /* Tier 3 — Binance klines */
    try {
      const sym = await this._symbol(coinId);
      const { iv, lim } = this._bInterval(days);
      const d = await this._fetch(
        `https://api.binance.com/api/v3/klines?symbol=${sym}USDT&interval=${iv}&limit=${lim}`, 60000
      );
      if (Array.isArray(d) && d.length)
        return d.map(k => [k[0], parseFloat(k[1]), parseFloat(k[2]), parseFloat(k[3]), parseFloat(k[4])]);
    } catch (_) {}

    /* Tier 4 — Synthetic */
    const market = (await this.getMarkets()).find(c => c.id === coinId);
    return this._syntheticOHLC(market?.current_price || 1000, days, days <= 1);
  },

  async getMarketChart(coinId, days = 365) {
    /* Tier 1 — CoinGecko market chart (best time-series for prediction) */
    try {
      const d = await this._fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`,
        60000
      );
      if (d?.prices?.length > 2) return d;
    } catch (_) {}

    /* Tier 2 — CryptoCompare */
    try {
      const sym = await this._symbol(coinId);
      const hourly = days <= 1;
      const ep  = hourly ? 'histohour' : 'histoday';
      const lim = hourly ? 23 : days - 1;
      const d   = await this._fetch(
        `https://min-api.cryptocompare.com/data/v2/${ep}?fsym=${sym}&tsym=USD&limit=${lim}`, 60000
      );
      const arr = d?.Data?.Data;
      if (arr?.length) return {
        prices:        arr.map(r => [r.time * 1000, r.close]),
        total_volumes: arr.map(r => [r.time * 1000, r.volumeto]),
      };
    } catch (_) {}

    /* Tier 3 — Binance klines */
    try {
      const sym = await this._symbol(coinId);
      const { iv, lim } = this._bInterval(days);
      const d = await this._fetch(
        `https://api.binance.com/api/v3/klines?symbol=${sym}USDT&interval=${iv}&limit=${lim}`, 60000
      );
      if (Array.isArray(d) && d.length)
        return {
          prices:        d.map(k => [k[0], parseFloat(k[4])]),
          total_volumes: d.map(k => [k[0], parseFloat(k[5])]),
        };
    } catch (_) {}

    /* Tier 4 — Synthetic */
    const market = (await this.getMarkets()).find(c => c.id === coinId);
    const ohlc   = this._syntheticOHLC(market?.current_price || 1000, days, days <= 1);
    return { prices: ohlc.map(d => [d[0], d[4]]), total_volumes: ohlc.map(d => [d[0], 0]) };
  },

  getFearGreed() {
    return this._fetch('https://api.alternative.me/fng/?limit=1', 3600000)
      .catch(() => ({ data: [{ value:'50', value_classification:'Neutral', timestamp: String(Math.floor(Date.now()/1000)) }] }));
  },

  getNews() {
    return this._fetch(
      'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=BTC,ETH,Altcoin&excludeCategories=Sponsored',
      300000
    ).catch(() => ({ Data: [] }));
  },

  clearCache() { this._cache.clear(); }
};
