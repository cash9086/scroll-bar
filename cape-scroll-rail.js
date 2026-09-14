/*! cape-scroll-rail — The Cape Studio
 *  Indicatore di scroll verticale sul lato destro, in sostituzione della
 *  scrollbar nativa del browser.
 *
 *  Una colonna stretta di grigio chiaro. Il progresso la riempie di nero
 *  dall'alto, e il numero in percentuale sta DENTRO la colonna, appoggiato
 *  al bordo inferiore del nero: mentre scorri il nero cresce e se lo spinge
 *  davanti, verso il basso; risalendo, il nero si ritira e il numero torna
 *  su. Negli ultimi punti percentuali il numero non ha piu' spazio sotto,
 *  quindi si ferma sul fondo e il nero gli passa sopra: dove lo copre, le
 *  cifre si stampano in negativo, una colonna di pixel alla volta.
 *
 *  Su fondo chiaro la colonna e' #141416, su fondo scuro diventa #ffffff.
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
       <script>window.CAPE_RAIL = { w: 16, mobile: false };</script>
     ==================================================================== */
  var CFG = {
    x         : 22,        /* px dal bordo destro                          */
    inset     : '14vh',    /* aria sopra e sotto la colonna                 */
    w         : 13,        /* px, larghezza della colonna a riposo.
                              Sotto i ~12px il numero ruotato non ci sta.   */
    wHover    : 20,        /* px, larghezza col puntatore vicino            */
    num       : 10,        /* px, corpo del numero a riposo                 */
    numHover  : 13,        /* px, corpo del numero in hover                 */
    pad       : 5,         /* px, aria fra l'orlo del nero e il numero      */
    zone      : 30,        /* px, larghezza della zona sensibile dal bordo  */
    z         : 2147483000,/* sotto #capecur (2147483647)                   */
    mobile    : true,      /* mostrarla anche sotto i 992px                 */
    drag      : true,      /* trascinare la colonna per scorrere            */

    ink       : '#141416', /* il pieno su fondo chiaro                      */
    snow      : '#ffffff', /* il pieno su fondo scuro                       */
    trkLight  : 'rgba(20,20,22,.13)',    /* colonna vuota su fondo chiaro   */
    trkDark   : 'rgba(255,255,255,.18)', /* colonna vuota su fondo scuro    */

    font      : "'Jost', system-ui, -apple-system, 'Segoe UI', sans-serif",
    track     : '.12em',   /* letter-spacing del numero                     */

    toLight   : 0.45,      /* isteresi: sotto questa luminanza -> inverti   */
    toDark    : 0.60,      /* sopra questa -> torna normale                 */

    fade      : '.45s cubic-bezier(.16,1,.3,1)',  /* colore, come l'header  */
    snap      : '.34s cubic-bezier(.16,1,.3,1)'   /* larghezza e corpo      */
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
      '--w:' + CFG.w + 'px;--n:' + CFG.num + 'px;--numH:34px;',
      '--trk:' + CFG.trkLight + ';--fil:' + CFG.ink + ';--neg:' + CFG.snow + ';',
    '}',
    '.cape-rail.is-ready{opacity:1}',

    /* fondo scuro: il pieno diventa bianco e il negativo diventa scuro */
    '.cape-rail.is-inv{--trk:' + CFG.trkDark + ';--fil:' + CFG.snow + ';--neg:' + CFG.ink + '}',

    /* puntatore vicino: la colonna si allarga e il numero cresce con lei */
    '.cape-rail.is-near{--w:' + CFG.wHover + 'px;--n:' + CFG.numHover + 'px}',

    /* la zona sensibile e' trasparente ai click finche' il puntatore non
       entra davvero nei pochi px di bordo: cosi' non ruba mai un click a
       quello che ci sta sotto */
    '.cape-rail__zone{position:fixed;right:0;top:0;bottom:0;width:' + CFG.zone + 'px;pointer-events:none;touch-action:none}',
    '.cape-rail.is-near .cape-rail__zone{pointer-events:auto}',

    '.cape-rail__trk{',
      'position:fixed;right:var(--x);top:var(--in);bottom:var(--in);',
      'width:var(--w);background:var(--trk);overflow:hidden;',
      'transition:width ' + snap + ',background-color ' + fade + ';',
    '}',

    /* il pieno. Niente transizione sull'altezza: deve stare incollato allo
       scroll, non inseguirlo */
    '.cape-rail__fil{',
      'position:absolute;left:0;top:0;width:100%;height:0;',
      'background:var(--fil);transition:background-color ' + fade + ';',
    '}',

    /* Due corsie sovrapposte, identiche, con lo stesso numero nello stesso
       punto. Quella di sotto e' scritta nel colore del pieno e si legge sul
       grigio; quella di sopra e' nel colore opposto ed e' ritagliata
       esattamente sull'altezza del pieno. Dove il nero copre le cifre si
       vede la seconda, dove non arriva si vede la prima. Il passaggio
       avviene per colonne di pixel mentre l'orlo scorre sopra il numero:
       un solo elemento con un colore solo dovrebbe scattare di netto a
       meta' strada, e si vedrebbe. */
    '.cape-rail__lane{position:absolute;inset:0;pointer-events:none}',
    '.cape-rail__lane--neg{clip-path:inset(0 0 100% 0)}',

    '.cape-rail__num{',
      'position:absolute;left:0;top:0;width:100%;height:var(--numH);',
      'font-family:' + CFG.font + ';font-weight:400;',
      'font-size:var(--n);line-height:var(--w);',   /* in verticale la
                                                        line-height e' la
                                                        larghezza: pari a
                                                        quella della colonna,
                                                        il numero ci si
                                                        centra da solo */
      'letter-spacing:' + CFG.track + ';font-variant-numeric:tabular-nums;',
      'text-align:center;white-space:nowrap;',
      'writing-mode:vertical-rl;text-orientation:mixed;',
      'transform:rotate(180deg);transform-origin:center;',
      'color:var(--fil);',
      'transition:color ' + fade + ',font-size ' + snap + ',line-height ' + snap + ';',
    '}',
    '.cape-rail__lane--neg .cape-rail__num{color:var(--neg)}'
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
    '<div class="cape-rail__trk">' +
      '<div class="cape-rail__fil"></div>' +
      '<div class="cape-rail__lane"><div class="cape-rail__num">0%</div></div>' +
      '<div class="cape-rail__lane cape-rail__lane--neg"><div class="cape-rail__num">0%</div></div>' +
    '</div>';

  var zone  = rail.querySelector('.cape-rail__zone');
  var track = rail.querySelector('.cape-rail__trk');
  var fill  = rail.querySelector('.cape-rail__fil');
  var laneN = rail.querySelector('.cape-rail__lane--neg');
  var numA  = rail.querySelectorAll('.cape-rail__num')[0];
  var numB  = rail.querySelectorAll('.cape-rail__num')[1];

  function mount() {
    document.body.appendChild(rail);
    relayout();
    requestAnimationFrame(function () { rail.classList.add('is-ready'); });
  }

  /* ====================================================================
     GEOMETRIA
     ==================================================================== */
  var geo  = { top: 0, len: 1, x: 0 };
  var numH = 34;

  function measure() {
    var r = track.getBoundingClientRect();
    geo.top = r.top;
    geo.len = r.height || 1;
    geo.x   = r.left + r.width / 2;
  }

  /* L'altezza del numero e' fissata sulla stringa piu' lunga che puo'
     capitare, "100%". Se la lasciassimo libera, il box cambierebbe misura
     passando da "9%" a "10%" e il numero sobbalzerebbe a ogni decina. */
  function measureNum() {
    var prev = numA.textContent;
    numA.style.height = 'auto';
    numA.textContent = '100%';
    var h = Math.ceil(numA.getBoundingClientRect().height) || 34;
    numA.style.height = '';
    numA.textContent = prev;
    numH = h;
    rail.style.setProperty('--numH', h + 'px');
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
     Stessa identica logica dell'header: tre sonde lungo la colonna,
     luminanza WCAG, isteresi per non far sfarfallare il colore nella zona
     di mezzo. Vale anche l'override data-hdr="dark" | "light".
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
     Il numero si appoggia all'orlo inferiore del pieno e da li' viene
     spinto in giu'. Quando sotto non resta piu' spazio si ferma sul fondo
     della colonna e il pieno gli scorre sopra.
     ==================================================================== */
  var shown = -1;
  var lastProbe = 0;

  function paint() {
    var p  = progress();
    var L  = geo.len;
    var fh = p * L;

    fill.style.height = fh + 'px';

    var pad = CFG.pad;
    var top = fh + pad;
    var lim = L - numH - pad;           /* oltre questo, il numero uscirebbe */
    if (lim < pad) lim = pad;           /* colonna piu' corta del numero     */
    if (top > lim) top = lim;
    if (top < pad) top = pad;

    numA.style.top = top + 'px';
    numB.style.top = top + 'px';

    /* la corsia in negativo tenuta esattamente sull'altezza del pieno */
    laneN.style.clipPath = 'inset(0 0 ' + Math.max(0, L - fh) + 'px 0)';

    var pc = Math.round(p * 100);
    if (pc !== shown) {
      numA.textContent = numB.textContent = pc + '%';
      shown = pc;
    }

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
     Non si usa :hover sulla colonna: e' stretta e la si manca. Si guarda
     la distanza dal bordo destro, e solo allora la zona diventa cliccabile.
     ==================================================================== */
  var near = false;

  function onPointer(e) {
    var n = (innerWidth - e.clientX) <= CFG.zone;
    if (n === near) return;
    near = n;
    rail.classList.toggle('is-near', n);
    /* il corpo del numero cambia con l'hover, quindi cambia anche la sua
       altezza: va rimisurata, se no il fondo colonna sballa di qualche px */
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
