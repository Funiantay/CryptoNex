const Indicators = {
  sma(prices, period) {
    return prices.map((_, i) => {
      if (i < period - 1) return null;
      const slice = prices.slice(i - period + 1, i + 1);
      return slice.reduce((a, b) => a + b, 0) / period;
    });
  },

  ema(prices, period) {
    const k = 2 / (period + 1);
    const result = [];
    let prev = prices[0];
    for (let i = 0; i < prices.length; i++) {
      if (i === 0) { result.push(prices[0]); continue; }
      prev = prices[i] * k + prev * (1 - k);
      result.push(prev);
    }
    return result;
  },

  rsi(prices, period = 14) {
    const changes = prices.slice(1).map((v, i) => v - prices[i]);
    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? -c : 0);

    const result = new Array(period).fill(null);
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(100 - 100 / (1 + avgGain / (avgLoss || 1e-10)));

    for (let i = period; i < changes.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      result.push(100 - 100 / (1 + avgGain / (avgLoss || 1e-10)));
    }
    return result;
  },

  macd(prices, fast = 12, slow = 26, signal = 9) {
    const emaFast = this.ema(prices, fast);
    const emaSlow = this.ema(prices, slow);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const sigSlice = macdLine.slice(slow - 1);
    const sigEma = this.ema(sigSlice, signal);
    const pad = new Array(slow - 1).fill(null);
    const signalLine = [...pad, ...sigEma];
    const histogram = signalLine.map((v, i) => v !== null ? macdLine[i] - v : null);
    return { macdLine, signalLine, histogram };
  },

  bollingerBands(prices, period = 20, mult = 2) {
    const mid = this.sma(prices, period);
    const upper = [], lower = [];
    prices.forEach((_, i) => {
      if (i < period - 1) { upper.push(null); lower.push(null); return; }
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = mid[i];
      const sd = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
      upper.push(mean + mult * sd);
      lower.push(mean - mult * sd);
    });
    return { upper, middle: mid, lower };
  }
};
