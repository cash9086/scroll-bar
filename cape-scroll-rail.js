/*! cape-scroll-rail — The Cape Studio
 *  Indicatore di scroll verticale sul lato destro, in sostituzione della
 *  scrollbar nativa del browser.
 *
 *  Un filo di 1px, grigio chiaro, che si allarga a 5px quando il puntatore
 *  si avvicina al bordo. Il progresso lo riempie di nero dall'alto. Il
 *  numero in percentuale sta dritto, orizzontale, centrato sul filo, subito
 *  sotto l'orlo del nero: scorrendo, il nero cresce e se lo spinge davanti
 *  verso il basso; risalendo, il nero si ritira e il numero torna su.
 *
 *  Il filo si interrompe dove passa il numero. Non e' il numero ad avere un
 *  fondo che copre il filo — quello funzionerebbe solo su un colore noto, e
 *  qui sotto ci passano bianco, notte e fotografie. E' il filo ad avere un
 *  buco vero, ritagliato con una maschera: nel buco non c'e' niente, e il
 *  numero si legge su qualunque cosa ci sia sotto.
 *
 *  Su fondo chiaro filo e numero sono #141416, su fondo scuro #ffffff.
 *
 *  Si aggancia a Lenis se c'e', se no allo scroll nativo.
 *  Rileva il fondo con la stessa logica dell'header (elementsFromPoint +
 *  luminanza WCAG + isteresi), quindi rispetta anche gli override data-hdr.
 *
 *  Uso:  <script defer src=".../cape-scroll-rail.js"></script>
 *  API:  window.capeRail.refresh()  ricalcola geometria e altezza documento
 *        window.capeRail.destroy()  rimuove tutto, riaccende la scrollbar
 *        window.capeRail.cfg        la configurazione in uso
 */
(function () {
  'use strict';

  if (window.capeRail) return;          /* gia' montato: non raddoppiare */

  /* ====================================================================
     CONFIGURAZIONE
     Si puo' sovrascrivere PRIMA di caricare lo script:
       <script>window.CAPE_RAIL = { x: 30, mobile: false };</script>
     ==================================================================== */
  var CFG = {
    x         : 26,        /* px dal bordo destro, misurati sul filo.
                              Il numero e' centrato sul filo, quindi deborda
                              di meta' larghezza verso il bordo: sotto i 22
                              comincia a toccarlo.                          */
    inset     : '14vh',    /* aria sopra e sotto il filo                    */
    w         : 1,         /* px, spessore a riposo                         */
    wHover    : 5,         /* px, spessore col puntatore vicino             */
    num       : 10,        /* px, corpo del numero a riposo                 */
    numHover  : 13,        /* px, corpo del numero in hover                 */
    pad       : 6,         /* px, aria fra l'orlo del nero e il numero, e
                              altrettanta sotto il numero prima che il filo
                              ricominci                                     */
    zone      : 30,        /* px, larghezza della zona sensibile dal bordo  */
    z         : 2147483000,/* sotto #capecur (2147483647)                   */
    mobile    : true,      /* mostrarlo anche sotto i 992px                 */
    drag      : true,      /* trascinare il filo per scorrere               */

    ink       : '#141416', /* filo e numero su fondo chiaro                 */
    snow      : '#ffffff', /* filo e numero su fondo scuro                  */
    trkLight  : 'rgba(20,20,22,.16)',    /* filo vuoto su fondo chiaro      */
    trkDark   : 'rgba(255,255,255,.22)', /* filo vuoto su fondo scuro       */

    font      : "'Jost', system-ui, -apple-system, 'Segoe UI', sans-serif",
    track     : '.10em',   /* letter-spacing del numero                     */

    toLight   : 0.45,      /* isteresi: sotto questa luminanza -> inverti   */
    toDark    : 0.60,      /* sopra questa -> torna normale                 */

    fade      : '.45s cubic-bezier(.16,1,.3,1)',  /* colore, come l'header  */
    snap      : '.34s cubic-bezier(.16,1,.3,1)'   /* spessore e corpo       */
  };
  if (window.CAPE_RAIL) {
    for (var k in window.CAPE_RAIL) {
      if (Object.prototype.hasOwnProperty.call(window.CAPE_RAIL, k)) CFG[k] = window.CAPE_RAIL[k];
    }
  }

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fade = reduced ? '.01ms linear' : CFG.fade;
  var snap = reduced ? '.01ms linear' : CFG.snap;

  /* ====================================================================
     FOGLIO DI STILE
     ==================================================================== */
  var css = [
    /* la scrollbar nativa sparisce. Su html, non su body: il sito ha gia'
       overflow-y:visible !important sul body e li' la regola non morderebbe */
    'html{scrollbar-width:none;-ms-overflow-style:none}',
    'html::-webkit-scrollbar{width:0;height:0;display:none}',
    'body::-webkit-scrollbar{width:0;height:0;display:none}',

    '.cape-rail{',
      'position:fixed;left:0;top:0;width:0;height:0;',
      'z-index:' + CFG.z + ';pointer-events:none;',
      'opacity:0;transition:opacity .4s ease;',
      '--x:' + CFG.x + 'px;--in:' + CFG.inset + ';',
      '--w:' + CFG.w + 'px;--n:' + CFG.num + 'px;--numW:30px;',
      '--trk:' + CFG.trkLight + ';--fil:' + CFG.ink + ';',
    '}',
    '.cape-rail.is-ready{opacity:1}',

    /* fondo scuro: filo e numero diventano bianchi */
    '.cape-rail.is-inv{--trk:' + CFG.trkDark + ';--fil:' + CFG.snow + '}',

    /* puntatore vicino: il filo si allarga e il numero cresce */
    '.cape-rail.is-near{--w:' + CFG.wHover + 'px;--n:' + CFG.numHover + 'px}',

    /* la zona sensibile e' trasparente ai click finche' il puntatore non
       entra davvero nei pochi px di bordo: cosi' non ruba mai un click a
       quello che ci sta sotto */
    '.cape-rail__zone{position:fixed;right:0;top:0;bottom:0;width:' + CFG.zone + 'px;pointer-events:none;touch-action:none}',
    '.cape-rail.is-near .cape-rail__zone{pointer-events:auto}',

    /* Il filo. La maschera ci apre il buco in cui passa il numero: la
       scrive paint() a ogni frame e vale per il grigio e per il nero
       insieme, perche' il nero e' dentro questo elemento. */
    '.cape-rail__trk{',
      'position:fixed;right:var(--x);top:var(--in);bottom:var(--in);',
      'width:var(--w);background:var(--trk);overflow:hidden;',
      '-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;',
      '-webkit-mask-size:100% 100%;mask-size:100% 100%;',
      'transition:width ' + snap + ',background-color ' + fade + ';',
    '}',

    /* il nero. Niente transizione sull'altezza: deve stare incollato allo
       scroll, non inseguirlo */
    '.cape-rail__fil{',
      'position:absolute;left:0;top:0;width:100%;height:0;',
      'background:var(--fil);transition:background-color ' + fade + ';',
    '}',

    /* Il numero: dritto, centrato sul filo. Larghezza fissa su quella di
       "100%", cosi' passando da 9% a 10% non si sposta di mezzo carattere. */
    '.cape-rail__num{',
      'position:fixed;top:0;',
      'right:calc(var(--x) + var(--w) / 2);',
      'transform:translateX(50%);',
      'width:var(--numW);text-align:center;',
      'font-family:' + CFG.font + ';font-weight:400;',
      'font-size:var(--n);line-height:1;',
      'letter-spacing:' + CFG.track + ';font-variant-numeric:tabular-nums;',
      'color:var(--fil);white-space:nowrap;',
      'transition:color ' + fade + ',font-size ' + snap + ',right ' + snap + ',width ' + snap + ';',
    '}'
  ].join('');

  if (!CFG.mobile) {
    css += '@media (max-width:991px){.cape-rail{display:none}' +
           'html{scrollbar-width:auto;-ms-overflow-style:auto}' +
           'html::-webkit-scrollbar,body::-webkit-scrollbar{width:initial;height:initial;display:block}}';
  }

  var sheet = document.createElement('style');
  sheet.id = 'cape-rail-css';
  sheet.textContent = css;
  (document.head || document.documentElement).appendChild(sheet);

  /* ====================================================================
     STRUTTURA
     ==================================================================== */
  var rail = document.createElement('div');
  rail.className = 'cape-rail';
  rail.setAttribute('aria-hidden', 'true');   /* la percentuale e' un doppione
                                                 dello scroll, che lo screen
                                                 reader conosce gia' */
  rail.innerHTML =
    '<div class="cape-rail__zone"></div>' +
    '<div class="cape-rail__trk"><div class="cape-rail__fil"></div></div>' +
    '<div class="cape-rail__num">0%</div>';

  var zone  = rail.querySelector('.cape-rail__zone');
  var track = rail.querySelector('.cape-rail__trk');
  var fill  = rail.querySelector('.cape-rail__fil');
  var num   = rail.querySelector('.cape-rail__num');

  function mount() {
    document.body.appendChild(rail);
    relayout();
    requestAnimationFrame(function () { rail.classList.add('is-ready'); });
  }

  /* ====================================================================
     GEOMETRIA
     ==================================================================== */
  var geo  = { top: 0, len: 1, x: 0 };
  var numH = 12;   /* altezza della riga del numero */
  var numW = 30;   /* larghezza fissata su "100%"   */

  function measure() {
    var r = track.getBoundingClientRect();
    geo.top = r.top;
    geo.len = r.height || 1;
    geo.x   = r.left + r.width / 2;
  }

  /* La larghezza del numero e' fissata sulla stringa piu' lunga che puo'
     capitare, "100%". Se la lasciassimo libera, il box cambierebbe misura
     passando da "9%" a "10%" e il numero, essendo centrato, scivolerebbe di
     mezzo carattere a ogni decina. */
  function measureNum() {
    var prev = num.textContent;
    num.style.width = 'auto';
    num.textContent = '100%';
    var r = num.getBoundingClientRect();
    numW = Math.ceil(r.width) || 30;
    numH = Math.ceil(r.height) || 12;
    num.style.width = '';
    num.textContent = prev;
    rail.style.setProperty('--numW', numW + 'px');
  }

  function maxScroll() {
    return Math.max(0, document.documentElement.scrollHeight - innerHeight);
  }
  function progress() {
    var m = maxScroll();
    if (m <= 0) return 0;
    var p = (window.scrollY || window.pageYOffset) / m;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  /* ====================================================================
     CHIARO O SCURO
     Stessa identica logica dell'header: tre sonde lungo il filo, luminanza
     WCAG, isteresi per non far sfarfallare il colore nella zona di mezzo.
     Vale anche l'override data-hdr="dark" | "light" sulle sezioni.
     ==================================================================== */
  var inv = null;

  function lum(r, g, b) {
    var a = [r, g, b].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }

  function probe(x, y) {
    var stack = document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (rail === el || rail.contains(el)) continue;
      var m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (!m) continue;
      if (m.length > 3 && parseFloat(m[3]) < 0.5) continue;   /* trasparente: guarda sotto */
      return lum(+m[0], +m[1], +m[2]);
    }
    return 1;
  }

  function forced(y) {
    var hit = null, list = document.querySelectorAll('[data-hdr]');
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (r.height && r.top <= y && r.bottom >= y) hit = list[i];
    }
    return hit;
  }

  function contrast() {
    var x = Math.min(Math.max(geo.x, 1), innerWidth - 1);
    var a = geo.top + geo.len * 0.10;
    var b = geo.top + geo.len * 0.50;
    var c = geo.top + geo.len * 0.90;

    var next, tag = forced(b);
    if (tag) {
      next = tag.getAttribute('data-hdr') === 'dark';
    } else {
      var L = (probe(x, a) + probe(x, b) + probe(x, c)) / 3;
      next = inv;
      if (L < CFG.toLight)      next = true;
      else if (L > CFG.toDark)  next = false;
      else if (inv === null)    next = L < 0.5;
    }
    if (next !== inv) { inv = next; rail.classList.toggle('is-inv', !!next); }
  }

  /* ====================================================================
     DISEGNO
     Il buco nel filo comincia esattamente dove finisce il nero: il nero
     scende, si ferma, e subito sotto c'e' il numero. Quando il buco
     arriverebbe a sporgere dal fondo si blocca li', e il nero da quel punto
     in poi continua a crescere sotto il numero — dove pero' la maschera lo
     cancella, quindi il numero resta leggibile fino al 100%.
     ==================================================================== */
  var shown = -1;
  var lastProbe = 0;

  function paint() {
    var p  = progress();
    var L  = geo.len;
    var fh = p * L;

    fill.style.height = fh + 'px';

    var gapH = numH + CFG.pad * 2;
    var top  = fh;
    var lim  = L - gapH;
    if (lim < 0) lim = 0;               /* filo piu' corto del numero */
    if (top > lim) top = lim;
    if (top < 0)   top = 0;
    var bot = top + gapH;

    var g = 'linear-gradient(to bottom,' +
            '#000 0,#000 ' + top + 'px,' +
            'rgba(0,0,0,0) ' + top + 'px,rgba(0,0,0,0) ' + bot + 'px,' +
            '#000 ' + bot + 'px,#000 100%)';
    track.style.webkitMaskImage = g;
    track.style.maskImage = g;

    num.style.top = (geo.top + top + CFG.pad) + 'px';

    var pc = Math.round(p * 100);
    if (pc !== shown) { num.textContent = pc + '%'; shown = pc; }

    /* La sonda del fondo costa tre hit-test: a 60fps, su una pagina che sta
       gia' animando il rig orizzontale e il ponte, si sente. La transizione
       di colore dura 450ms, quindi campionare ogni 100ms e' comunque cinque
       volte piu' fitto di quanto l'occhio possa distinguere. */
    var now = Date.now();
    if (now - lastProbe >= 100) { lastProbe = now; contrast(); }
  }

  var queued = false;
  function tick() {
    if (queued || document.hidden) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; paint(); });
  }

  /* ====================================================================
     SORGENTI DELLO SCROLL
     Lenis quando c'e' (emette 'scroll' a ogni frame del suo rAF), piu' lo
     scroll nativo come rete di sicurezza. I due tick si fondono nel rAF.
     ==================================================================== */
  var lenisBound = null;
  function bindLenis(tries) {
    if (window.lenis && typeof window.lenis.on === 'function') {
      window.lenis.on('scroll', tick);
      lenisBound = window.lenis;
      return;
    }
    if (tries < 40) setTimeout(function () { bindLenis(tries + 1); }, 200);
  }

  /* ====================================================================
     TRASCINAMENTO
     ==================================================================== */
  function seek(clientY) {
    var p = (clientY - geo.top) / geo.len;
    p = p < 0 ? 0 : p > 1 ? 1 : p;
    var y = p * maxScroll();
    if (window.lenis && window.lenis.scrollTo) {
      try { window.lenis.scrollTo(y, { immediate: true, force: true }); return; }
      catch (e) { /* cade sul nativo */ }
    }
    window.scrollTo(0, y);
  }

  var dragging = false;

  function onDown(e) {
    if (!CFG.drag) return;
    dragging = true;
    try { zone.setPointerCapture(e.pointerId); } catch (err) {}
    measure(); seek(e.clientY); tick();
    e.preventDefault();
  }
  function onMove(e) { if (dragging) { seek(e.clientY); tick(); } }
  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    try { zone.releasePointerCapture(e.pointerId); } catch (err) {}
  }

  zone.addEventListener('pointerdown',   onDown);
  zone.addEventListener('pointermove',   onMove);
  zone.addEventListener('pointerup',     onUp);
  zone.addEventListener('pointercancel', onUp);

  /* ====================================================================
     HOVER PER PROSSIMITA'
     Non si usa :hover sul filo: un capello di 1px non si azzecca col mouse.
     Si guarda la distanza dal bordo destro, e solo allora la zona diventa
     cliccabile.
     ==================================================================== */
  var near = false;

  function onPointer(e) {
    var n = (innerWidth - e.clientX) <= CFG.zone;
    if (n === near) return;
    near = n;
    rail.classList.toggle('is-near', n);
    /* il corpo del numero cambia con l'hover, quindi cambiano anche le sue
       misure: vanno riprese, se no il buco nel filo non gli sta piu' dietro */
    requestAnimationFrame(function () { measure(); measureNum(); paint(); });
  }
  function onLeave() {
    if (!near) return;
    near = false; rail.classList.remove('is-near');
  }

  addEventListener('mousemove', onPointer, { passive: true });
  /* su documentElement, non su window: window non emette mouseleave */
  document.documentElement.addEventListener('mouseleave', onLeave, { passive: true });

  /* ====================================================================
     RICALCOLI
     Il documento cambia altezza da solo: rig orizzontale, ponte, ink-pin.
     Un ResizeObserver se ne accorge senza doverlo interrogare.
     ==================================================================== */
  var rT = null;
  function relayout() {
    measure(); measureNum(); paint();
  }
  function debounced() {
    clearTimeout(rT);
    rT = setTimeout(relayout, 120);
  }

  addEventListener('scroll', tick, { passive: true });
  addEventListener('resize', debounced, { passive: true });
  addEventListener('load', relayout);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });

  if (window.ResizeObserver) {
    try { new ResizeObserver(debounced).observe(document.documentElement); } catch (e) {}
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout, function () {});

  /* ====================================================================
     AVVIO
     ==================================================================== */
  window.capeRail = {
    cfg: CFG,
    refresh: relayout,
    destroy: function () {
      removeEventListener('scroll', tick);
      removeEventListener('resize', debounced);
      removeEventListener('mousemove', onPointer);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      if (lenisBound && lenisBound.off) { try { lenisBound.off('scroll', tick); } catch (e) {} }
      if (rail.parentNode)  rail.parentNode.removeChild(rail);
      if (sheet.parentNode) sheet.parentNode.removeChild(sheet);
      delete window.capeRail;
    }
  };

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  bindLenis(0);
})();
