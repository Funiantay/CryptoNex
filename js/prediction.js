const Prediction = {
  linearRegression(prices) {
    const n = prices.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    prices.forEach((y, x) => { sumX += x; sumY += y; sumXY += x * y; sumXX += x * x; });
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const meanY = sumY / n;
    let sse = 0, sst = 0;
    prices.forEach((y, x) => {
      sse += (y - (slope * x + intercept)) ** 2;
      sst += (y - meanY) ** 2;
    });
    const r2 = 1 - sse / sst;
    const rmse = Math.sqrt(sse / n);
    return { slope, intercept, r2, rmse };
  },

  forecast(prices, futureDays) {
    const { slope, intercept, r2, rmse } = this.linearRegression(prices);
    const n = prices.length;
    const ci = rmse * 1.96;
    const future = Array.from({ length: futureDays }, (_, i) => {
      const price = Math.max(0, slope * (n + i) + intercept);
      return { price, upper: price + ci, lower: Math.max(0, price - ci) };
    });
    return {
      future,
      r2: r2.toFixed(4),
      rmse: rmse.toFixed(2),
      trend: slope > 0 ? 'bullish' : 'bearish',
      slope
    };
  }
};
