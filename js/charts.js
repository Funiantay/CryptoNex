/* CryptoNex — Charts Module v2 */

const Charts = {
  main: null,
  mainSeries: null,
  volChart: null,
  volSeries: null,
  macdChart: null,
  rsiChart: null,
  rsiSeries: null,
  overlays: {},
  portfolioPie: null,
  predChart: null,

  COLORS: {
    magenta: '#F72585',
    cyan:    '#4CC9F0',
    indigo:  '#4361EE',
    green:   '#06D6A0',
    red:     '#EF233C',
    amber:   '#FFB703',
    bg:      '#03030D',
    surface: '#07071A',
    border:  'rgba(255,255,255,0.08)',
    text:    '#7A7A9D',
  },

  _lwOpts(height) {
    return {
      width: 0,
      height,
      layout: {
        background:  { color:'transparent' },
        textColor:   this.COLORS.text,
        fontFamily:  "'DM Mono', monospace",
        fontSize:    11,
      },
      grid: {
        vertLines: { color:'rgba(255,255,255,0.04)' },
        horzLines: { color:'rgba(255,255,255,0.04)' },
      },
      crosshair:       { mode: LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: { borderColor:'rgba(255,255,255,0.07)' },
      timeScale:       { borderColor:'rgba(255,255,255,0.07)', timeVisible:true, secondsVisible:false },
      handleScroll:    true,
      handleScale:     true,
    };
  },

  _destroy(chart) { try { chart && chart.remove(); } catch(e){} },

  initMain(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    this._destroy(this.main);
    const opts = this._lwOpts(el.offsetHeight || 430);
    opts.width = el.offsetWidth || el.clientWidth;
    this.main = LightweightCharts.createChart(el, opts);
    this.main.timeScale().fitContent();
    return this.main;
  },

  initVolume(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    this._destroy(this.volChart);
    const opts = this._lwOpts(el.offsetHeight || 110);
    opts.width = el.offsetWidth;
    opts.timeScale = { ...opts.timeScale, visible:false };
    opts.rightPriceScale = { scaleMargins:{ top:0.1, bottom:0 }, borderVisible:false };
    this.volChart  = LightweightCharts.createChart(el, opts);
    this.volSeries = this.volChart.addHistogramSeries({ color:'rgba(76,201,240,0.4)', priceFormat:{ type:'volume' } });
    return this.volChart;
  },

  initMACD(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    this._destroy(this.macdChart);
    const opts = this._lwOpts(el.offsetHeight || 110);
    opts.width = el.offsetWidth;
    opts.timeScale = { ...opts.timeScale, visible:false };
    this.macdChart = LightweightCharts.createChart(el, opts);
    return this.macdChart;
  },

  initRSI(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    this._destroy(this.rsiChart);
    const opts = this._lwOpts(el.offsetHeight || 110);
    opts.width = el.offsetWidth;
    opts.timeScale = { ...opts.timeScale, visible:false };
    opts.rightPriceScale = { scaleMargins:{ top:0.1, bottom:0.1 } };
    this.rsiChart = LightweightCharts.createChart(el, opts);
    const rsiLine = this.rsiChart.addLineSeries({ color:this.COLORS.red,  lineWidth:1 });
    const ob      = this.rsiChart.addLineSeries({ color:'rgba(255,61,87,0.3)',  lineWidth:1, lineStyle:2 });
    const os      = this.rsiChart.addLineSeries({ color:'rgba(0,230,118,0.3)', lineWidth:1, lineStyle:2 });
    this.rsiSeries = { line:rsiLine, ob, os };
    return this.rsiChart;
  },

  setChartData(ohlcData, chartType) {
    if (!this.main) return;

    Object.values(this.overlays).forEach(s => { try { this.main.removeSeries(s); } catch(e){} });
    this.overlays = {};
    if (this.mainSeries) { try { this.main.removeSeries(this.mainSeries); } catch(e){} }

    if (chartType === 'candlestick') {
      this.mainSeries = this.main.addCandlestickSeries({
        upColor:        this.COLORS.green, downColor:       this.COLORS.red,
        borderUpColor:  this.COLORS.green, borderDownColor: this.COLORS.red,
        wickUpColor:    this.COLORS.green, wickDownColor:   this.COLORS.red,
      });
    } else if (chartType === 'area') {
      this.mainSeries = this.main.addAreaSeries({
        lineColor:   this.COLORS.magenta,
        topColor:    'rgba(247,37,133,0.22)',
        bottomColor: 'rgba(247,37,133,0.0)',
        lineWidth:   2,
      });
    } else {
      this.mainSeries = this.main.addLineSeries({ color:this.COLORS.cyan, lineWidth:2 });
    }

    const formatted = ohlcData.map(d => {
      if (chartType === 'candlestick') {
        return { time:Math.floor(d[0]/1000), open:d[1], high:d[2], low:d[3], close:d[4] };
      }
      return { time:Math.floor(d[0]/1000), value:d[4] };
    });

    this.mainSeries.setData(formatted);
    this.main.timeScale().fitContent();
    this._lastOHLC  = ohlcData;
    this._chartType = chartType;

    requestAnimationFrame(() => {
      const el = document.getElementById('main-chart-container');
      if (el) {
        el.classList.remove('chart-draw-in');
        void el.offsetWidth;
        el.classList.add('chart-draw-in');
        el.addEventListener('animationend', () => el.classList.remove('chart-draw-in'), { once: true });
      }
    });

    return formatted;
  },

  setVolumeData(chartData) {
    if (!this.volSeries) return;
    const vol    = chartData.total_volumes || [];
    const prices = chartData.prices || [];
    const data   = vol.map((v, i) => {
      const prevP = i > 0 ? prices[i-1]?.[1] : 0;
      const curP  = prices[i]?.[1] || 0;
      return { time:Math.floor(v[0]/1000), value:v[1], color: curP >= prevP ? 'rgba(6,214,160,0.45)' : 'rgba(239,35,60,0.45)' };
    });
    this.volSeries.setData(data);

    requestAnimationFrame(() => {
      const el = document.getElementById('volume-chart-container');
      if (el) {
        el.classList.remove('chart-sub-draw-in');
        void el.offsetWidth;
        el.classList.add('chart-sub-draw-in');
        el.addEventListener('animationend', () => el.classList.remove('chart-sub-draw-in'), { once: true });
      }
    });
  },

  setIndicators(ohlcData, config) {
    Object.values(this.overlays).forEach(s => { try { this.main.removeSeries(s); } catch(e){} });
    this.overlays = {};

    const closes = ohlcData.map(d => d[4]);
    const times  = ohlcData.map(d => Math.floor(d[0]/1000));
    const toSeries = vals => vals.map((v,i) => v !== null ? { time:times[i], value:v } : null).filter(Boolean);

    if (config.sma20) {
      const s = this.main.addLineSeries({ color:'rgba(247,37,133,0.85)', lineWidth:1, title:'SMA20' });
      s.setData(toSeries(Indicators.sma(closes, 20)));
      this.overlays.sma20 = s;
    }
    if (config.sma50 && closes.length >= 50) {
      const s = this.main.addLineSeries({ color:'rgba(76,201,240,0.85)', lineWidth:1, title:'SMA50' });
      s.setData(toSeries(Indicators.sma(closes, 50)));
      this.overlays.sma50 = s;
    }
    if (config.ema20) {
      const s = this.main.addLineSeries({ color:'rgba(67,97,238,0.85)', lineWidth:1, title:'EMA20' });
      s.setData(toSeries(Indicators.ema(closes, 20)));
      this.overlays.ema20 = s;
    }
    if (config.bb) {
      const bb = Indicators.bollingerBands(closes, 20);
      ['upper','middle','lower'].forEach((k, i) => {
        const s = this.main.addLineSeries({ color:'rgba(114,9,183,0.65)', lineWidth:1, lineStyle:i === 1 ? 2 : 0 });
        s.setData(toSeries(bb[k]));
        this.overlays['bb' + k] = s;
      });
    }
    if (config.macd && this.macdChart) {
      const { macdLine, signalLine, histogram } = Indicators.macd(closes);
      const macdS = this.macdChart.addLineSeries({ color:this.COLORS.cyan,   lineWidth:1 });
      const sigS  = this.macdChart.addLineSeries({ color:this.COLORS.amber,  lineWidth:1 });
      const histS = this.macdChart.addHistogramSeries({ color:this.COLORS.green });
      macdS.setData(toSeries(macdLine));
      sigS.setData(toSeries(signalLine));
      histS.setData(histogram.map((v,i) => v !== null ? { time:times[i], value:v, color: v >= 0 ? 'rgba(6,214,160,0.6)' : 'rgba(239,35,60,0.6)' } : null).filter(Boolean));
    }
    if (config.rsi && this.rsiSeries) {
      const rsiVals = Indicators.rsi(closes);
      this.rsiSeries.line.setData(toSeries(rsiVals));
      this.rsiSeries.ob.setData(times.map(t => ({ time:t, value:70 })));
      this.rsiSeries.os.setData(times.map(t => ({ time:t, value:30 })));
    }
  },

  drawSparkline(canvas, prices, isUp) {
    if (!canvas || !prices || prices.length < 2) return;
    const ctx  = canvas.getContext('2d');
    const w    = canvas.width;
    const h    = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const min   = Math.min(...prices);
    const max   = Math.max(...prices);
    const range = max - min || 1;
    const pad   = h * 0.1;

    const pts = prices.map((p, i) => ({
      x: (i / (prices.length - 1)) * w,
      y: h - pad - ((p - min) / range) * (h - pad * 2)
    }));

    const color = isUp ? '#06D6A0' : '#EF233C';

    // Gradient fill area
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, isUp ? 'rgba(6,214,160,0.28)' : 'rgba(239,35,60,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length-1].x, h);
    ctx.lineTo(pts[0].x, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.stroke();
  },

  renderPortfolioPie(holdings) {
    const canvas = document.getElementById('portfolio-pie-chart');
    if (!canvas) return;
    if (this.portfolioPie) { this.portfolioPie.destroy(); this.portfolioPie = null; }
    if (!holdings.length) return;

    const pieWrap = canvas.parentElement;
    if (pieWrap) {
      pieWrap.style.opacity = '0';
      pieWrap.style.transform = 'scale(0.88) rotate(-10deg)';
      pieWrap.style.transition = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        pieWrap.style.transition = 'opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)';
        pieWrap.style.opacity = '1';
        pieWrap.style.transform = 'scale(1) rotate(0deg)';
      }));
    }

    const PALETTE = ['#F72585','#4CC9F0','#06D6A0','#4361EE','#FFB703','#7209B7','#EF233C','#00E5FF'];
    this.portfolioPie = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: holdings.map(h => h.symbol.toUpperCase()),
        datasets: [{
          data: holdings.map(h => h.value),
          backgroundColor: PALETTE.slice(0, holdings.length).map(c => c + 'BB'),
          borderColor:     PALETTE.slice(0, holdings.length),
          borderWidth: 2,
          hoverOffset: 8,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: { animateRotate:true, duration:800, easing:'easeOutQuart' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color:'#7A7A9D', font:{ family:'DM Mono', size:11 }, padding:12, boxWidth:12 }
          },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.label}: $${ctx.raw.toLocaleString('en-US', { maximumFractionDigits:2 })}` },
            backgroundColor: '#0C0C1A',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#F0F0FF',
            bodyColor:  '#8888AA',
          }
        }
      }
    });
  },

  renderPrediction(historical, futureArr, coin) {
    const canvas = document.getElementById('prediction-chart');
    if (!canvas) return;
    if (this.predChart) { this.predChart.destroy(); this.predChart = null; }

    const histPrices = historical.map(p => p[1]);
    const histLabels = historical.map(p => new Date(p[0]).toLocaleDateString('en-US', { month:'short', day:'numeric' }));
    const futureLabels = futureArr.map((_, i) => {
      const d = new Date(historical[historical.length - 1][0]);
      d.setDate(d.getDate() + i + 1);
      return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    });

    const allLabels   = [...histLabels, ...futureLabels];
    const histDs      = [...histPrices, ...new Array(futureArr.length).fill(null)];
    const predDs      = [...new Array(histPrices.length - 1).fill(null), histPrices[histPrices.length-1], ...futureArr.map(f => f.price)];
    const upperDs     = [...new Array(histPrices.length - 1).fill(null), histPrices[histPrices.length-1], ...futureArr.map(f => f.upper)];
    const lowerDs     = [...new Array(histPrices.length - 1).fill(null), histPrices[histPrices.length-1], ...futureArr.map(f => f.lower)];

    const wrap = canvas.parentElement;
    if (wrap) {
      wrap.style.opacity = '0';
      wrap.style.transform = 'translateY(18px) scale(0.985)';
      wrap.style.transition = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        wrap.style.transition = 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)';
        wrap.style.opacity = '1';
        wrap.style.transform = 'translateY(0) scale(1)';
      }));
    }

    this.predChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: allLabels,
        datasets: [
          { label:'Historical', data:histDs,  borderColor:'#F72585', backgroundColor:'transparent',          borderWidth:2, pointRadius:0, tension:0.3 },
          { label:'Predicted',  data:predDs,  borderColor:'#4CC9F0', backgroundColor:'transparent',          borderWidth:2, pointRadius:0, tension:0.3 },
          { label:'Upper 95%',  data:upperDs, borderColor:'rgba(76,201,240,0.25)', backgroundColor:'rgba(76,201,240,0.07)', borderWidth:1, borderDash:[4,4], pointRadius:0, tension:0.3, fill:'+1' },
          { label:'Lower 95%',  data:lowerDs, borderColor:'rgba(76,201,240,0.25)', backgroundColor:'rgba(76,201,240,0.07)', borderWidth:1, borderDash:[4,4], pointRadius:0, tension:0.3, fill:false },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration:1100, easing:'easeOutQuart' },
        interaction: { mode:'index', intersect:false },
        plugins: {
          legend: { labels:{ color:'#7A7A9D', font:{ family:'DM Mono', size:11 }, padding:14, boxWidth:20 } },
          tooltip: {
            backgroundColor: '#0C0C1A',
            borderColor:     'rgba(255,255,255,0.1)',
            borderWidth:     1,
            titleColor:      '#F0F0FF',
            bodyColor:       '#8888AA',
            callbacks:       { label: ctx => ` ${ctx.dataset.label}: $${(ctx.raw||0).toLocaleString('en-US', { maximumFractionDigits:2 })}` }
          }
        },
        scales: {
          x: { ticks:{ color:'#8888AA', font:{ family:'DM Mono', size:10 }, maxTicksLimit:12, maxRotation:0 }, grid:{ color:'rgba(255,255,255,0.04)' } },
          y: { ticks:{ color:'#8888AA', font:{ family:'DM Mono', size:10 }, callback: v => '$' + v.toLocaleString('en-US', { maximumFractionDigits:0 }) }, grid:{ color:'rgba(255,255,255,0.04)' } }
        }
      }
    });
  },

  resizeAll() {
    const pairs = [
      [this.main,      'main-chart-container'],
      [this.volChart,  'volume-chart-container'],
      [this.macdChart, 'macd-chart-container'],
      [this.rsiChart,  'rsi-chart-container'],
    ];
    pairs.forEach(([chart, id]) => {
      if (!chart) return;
      const el = document.getElementById(id);
      if (el) chart.resize(el.clientWidth, el.clientHeight);
    });
  }
};
