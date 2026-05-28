const Portfolio = {
  KEY: 'cryptonex_portfolio',

  load() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; }
    catch { return []; }
  },

  save(holdings) {
    localStorage.setItem(this.KEY, JSON.stringify(holdings));
  },

  add(coin, amount, buyPrice) {
    const holdings = this.load();
    const idx = holdings.findIndex(h => h.id === coin.id);
    if (idx >= 0) {
      const h = holdings[idx];
      const newAmt = h.amount + amount;
      h.buyPrice = (h.amount * h.buyPrice + amount * buyPrice) / newAmt;
      h.amount = newAmt;
    } else {
      holdings.push({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        image: coin.image,
        amount,
        buyPrice,
        addedAt: Date.now()
      });
    }
    this.save(holdings);
    return holdings;
  },

  remove(id) {
    const holdings = this.load().filter(h => h.id !== id);
    this.save(holdings);
    return holdings;
  },

  calcStats(holdings, prices) {
    let totalValue = 0, totalCost = 0;
    const enriched = holdings.map(h => {
      const cur = prices[h.id] || 0;
      const value = h.amount * cur;
      const cost  = h.amount * h.buyPrice;
      const pnl   = value - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      totalValue += value;
      totalCost  += cost;
      return { ...h, cur, value, cost, pnl, pnlPct };
    });
    const totalPnl    = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    return { enriched, totalValue, totalCost, totalPnl, totalPnlPct };
  }
};
