(function(){
  // --- State ---
  const els = {
    time: document.getElementById('time'),
    earned: document.getElementById('earned'),
    rateView: document.getElementById('rateView'),
    rateInput: document.getElementById('rate'),
    ccy: document.getElementById('ccy'),
    currency: document.getElementById('currency'),
    toggle: document.getElementById('toggle'),
    reset: document.getElementById('reset'),
  };

  const store = {
    get rate(){ return parseFloat(localStorage.getItem('wage.rate')||'25') || 25 },
    set rate(v){ localStorage.setItem('wage.rate', String(v)) },
    get currency(){ return localStorage.getItem('wage.currency') || 'EUR' },
    set currency(v){ localStorage.setItem('wage.currency', v) },
    get isRunning(){ return localStorage.getItem('wage.running') === '1' },
    set isRunning(v){ localStorage.setItem('wage.running', v ? '1' : '0') },
    get offsetMs(){ return parseInt(localStorage.getItem('wage.offsetMs')||'0',10) || 0 },
    set offsetMs(v){ localStorage.setItem('wage.offsetMs', String(v|0)) },
    get startAt(){ const v = localStorage.getItem('wage.startAt'); return v? parseInt(v,10): null },
    set startAt(v){ v==null ? localStorage.removeItem('wage.startAt') : localStorage.setItem('wage.startAt', String(v)) },
  };

  let hourlyRate = store.rate;    // Hauptwährungseinheiten pro Stunde
  let currency = store.currency;
  let isRunning = false;
  let offsetMs = 0;      // akkumulierte Zeit
  let startMs = null;    // performance.now() bei Start
  let startAt = null;    // Date.now() bei Start (Persistenz/Tab-Schlaf)
  let intervalId = null;

  // --- Utils ---
  const moneyFmt = () => new Intl.NumberFormat(undefined, { style:'currency', currency });

  function pad(n){ return String(n).padStart(2,'0') }
  function formatTime(ms){
    const total = Math.max(0, Math.floor(ms/1000));
    const h = Math.floor(total/3600);
    const m = Math.floor((total%3600)/60);
    const s = total%60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  // robustes Zahlen-Parsing (akzeptiert 1.234,56 / 1,234.56 / 1234.56 / 1234,56)
  function parseNumber(input){
    if(typeof input !== 'string') return 0;
    let s = input.trim().replace(/[\s\u00A0]/g,'');
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if(hasComma && hasDot){
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      const decSep = lastComma > lastDot ? ',' : '.';
      s = s.replace(/[.,]/g, (m, idx) => (idx === (decSep === ',' ? lastComma : lastDot)) ? '.' : '');
    } else {
      s = s.replace(',', '.');
    }
    const n = Number(s);
    return Number.isFinite(n) && n>=0 ? n : 0;
  }

  function secondsElapsed(ms){ return Math.floor(ms/1000); }

  // --- Rendering ---
  function computeElapsedMs(){
    if(!isRunning || startMs==null) return offsetMs;
    const nowPerf = performance.now();
    const base = offsetMs + (nowPerf - startMs);
    if(startAt!=null){
      const realElapsed = Date.now() - startAt;
      return Math.max(base, offsetMs + realElapsed);
    }
    return base;
  }

  function updateDisplay(){
    const elapsed = computeElapsedMs();
    const roundedMs = Math.floor(elapsed/1000)*1000; // sekundengenau
    els.time.textContent = formatTime(roundedMs);
    els.time.classList.remove('pulse'); void els.time.offsetWidth; els.time.classList.add('pulse');

    // Exakte Cents-Berechnung
    const secs = secondsElapsed(roundedMs);
    const hourlyCents = Math.round(hourlyRate * 100);
    const totalCents = Math.round(secs * hourlyCents / 3600);
    const earned = totalCents / 100;

    els.earned.textContent = moneyFmt().format(earned);
    els.earned.classList.remove('pulse'); void els.earned.offsetWidth; els.earned.classList.add('pulse');

    els.rateView.textContent = moneyFmt().format(hourlyRate||0);
    els.ccy.textContent = currency;
  }

  function start(){
    if(isRunning) return;
    isRunning = true;
    startMs = performance.now();
    startAt = Date.now();
    store.isRunning = true;
    store.startAt = startAt;
    clearInterval(intervalId);
    intervalId = setInterval(updateDisplay, 1000);
    updateDisplay();
    els.toggle.textContent = 'Pause';
    els.toggle.classList.add('secondary');
  }

  function pause(){
    if(!isRunning) return;
    isRunning = false;
    if(startMs!=null){
      offsetMs += (performance.now() - startMs);
      store.offsetMs = offsetMs;
      startMs = null;
    }
    store.isRunning = false;
    store.startAt = null;
    clearInterval(intervalId); intervalId = null;
    updateDisplay();
    els.toggle.textContent = 'Start';
    els.toggle.classList.remove('secondary');
  }

  function reset(){
    pause();
    offsetMs = 0; startMs = null; startAt = null;
    store.offsetMs = 0;
    store.startAt = null;
    updateDisplay();
  }

  function toggle(){ isRunning ? pause() : start(); }

  // --- Wire up ---
  // Zustand aus Storage rekonstruieren
  hourlyRate = store.rate;
  currency = store.currency;
  offsetMs = store.offsetMs;

  if(store.isRunning){
    isRunning = true;
    startMs = performance.now();
    startAt = store.startAt || Date.now();
    intervalId = setInterval(updateDisplay, 1000);
  }

  els.rateInput.value = String(hourlyRate);
  els.currency.value = currency;
  updateDisplay();

  els.toggle.addEventListener('click', toggle);
  els.reset.addEventListener('click', reset);

  els.rateInput.addEventListener('input', () => {
    hourlyRate = parseNumber(els.rateInput.value);
    store.rate = hourlyRate;
    updateDisplay();
  });

  els.currency.addEventListener('change', () => {
    currency = els.currency.value;
    store.currency = currency;
    updateDisplay();
  });

  // Tastatur: Space = Start/Pause, R = Reset – nicht in editierbaren Feldern
  function isEditableTarget(t){
    return t && (
      t.tagName === 'INPUT' ||
      t.tagName === 'SELECT' ||
      t.tagName === 'TEXTAREA' ||
      t.isContentEditable
    );
  }

  window.addEventListener('keydown', (e) => {
    if(isEditableTarget(e.target)) return;
    if(e.code === 'Space') { e.preventDefault(); toggle(); }
    else if((e.key||'').toLowerCase()==='r') { e.preventDefault(); reset(); }
  });

  // Aufräumen
  window.addEventListener('beforeunload', () => { clearInterval(intervalId); });
})();
