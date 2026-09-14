/*! cape-scroll-rail — The Cape Studio
 *  Indicatore di scroll verticale sul lato destro, in sostituzione della
 *  scrollbar nativa del browser.
 *
 *  Filo di 1px che si allarga a 5px quando il puntatore si avvicina al bordo.
 *  Progresso pieno su binario grigio chiaro. All'orlo del riempimento un
 *  numero in percentuale, ruotato sul fianco, che dice la posizione di scroll.
 *  Su fondo chiaro e' #141416, su fondo scuro diventa #ffffff.
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
    x         : 22,        /* px dal bordo destro                          */
    inset     : '14vh',    /* aria sopra e sotto l'asta                     */
    w         : 1,         /* px, spessore a riposo                         */
    wHover    : 5,         /* px, spessore col puntatore vicino             */
    num       : 10,        /* px, corpo del numero a riposo                 */
    numHover  : 13,        /* px, corpo del numero in hover                 */
    gap       : 11,        /* px, distanza numero <-> filo a riposo         */
    gapHover  : 15,        /* px, distanza in hover                         */
    zone      : 30,        /* px, larghezza della zona sensibile dal bordo  */
    z         : 2147483000,/* sotto #capecur (2147483647)                   */
    mobile    : true,      /* mostrarla anche sotto i 992px                 */
    drag      : true,      /* trascinare l'asta per scorrere                */

    ink       : '#141416', /* il filo su fondo chiaro                       */
    snow      : '#ffffff', /* il filo su fondo scuro                        */
    trkLight  : 'rgba(20,20,22,.16)',    /* binario su fondo chiaro         */
    trkDark   : 'rgba(255,255,255,.20)', /* binario su fondo scuro          */
    numLight  : 'rgba(20,20,22,.62)',    /* numero a riposo, fondo chiaro   */
    numDark   : 'rgba(255,255,255,.68)', /* numero a riposo, fondo scuro    */

    font      : "'Jost', system-ui, -apple-system, 'Segoe UI', sans-serif",
    track     : '.14em',   /* letter-spacing del numero                     */

    toLight   : 0.45,      /* isteresi: sotto questa luminanza -> inverti   */
    toDark    : 0.60,      /* sopra questa -> torna normale                 */

    fade      : '.45s cubic-bezier(.16,1,.3,1)',  /* colore, come l'header  */
    snap      : '.34s cubic-bezier(.16,1,.3,1)'   /* spessore e posizione   */
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
     Iniettato in testa, cosi' una regola del sito con la stessa specificita'
     scritta dopo vince: se un domani vuoi correggere qualcosa dal custom
     code di pagina, ti basta riscrivere la classe.
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
      '--w:' + CFG.w + 'px;--n:' + CFG.num + 'px;--g:' + CFG.gap + 'px;',
      '--trk:' + CFG.trkLight + ';--fil:' + CFG.ink + ';--txt:' + CFG.numLight + ';',
    '}',
    '.cape-rail.is-ready{opacity:1}',

    /* fondo scuro: filo bianco, binario bianco trasparente */
    '.cape-rail.is-inv{--trk:' + CFG.trkDark + ';--fil:' + CFG.snow + ';--txt:' + CFG.numDark + '}',

    /* puntatore vicino: si allarga e il numero cresce */
    '.cape-rail.is-near{--w:' + CFG.wHover + 'px;--n:' + CFG.numHover + 'px;--g:' + CFG.gapHover + 'px}',
    '.cape-rail.is-near{--txt:var(--fil)}',

    /* la zona sensibile e' trasparente ai click finche' il puntatore non
       entra davvero nei pochi px di bordo: cosi' non ruba mai un click a
       quello che ci sta sotto */
    '.cape-rail__zone{position:fixed;right:0;top:0;bottom:0;width:' + CFG.zone + 'px;pointer-events:none;touch-action:none}',
    '.cape-rail.is-near .cape-rail__zone{pointer-events:auto}',

    '.cape-rail__trk{',
      'position:fixed;right:var(--x);top:var(--in);bottom:var(--in);',
      'width:var(--w);background:var(--trk);',
      'transition:width ' + snap + ',background-color ' + fade + ';',
    '}',
    '.cape-rail__fil{',
      'position:absolute;right:0;top:0;width:100%;height:0;',
      'background:var(--fil);transition:background-color ' + fade + ';',
    '}',
    '.cape-rail__num{',
      'position:fixed;right:calc(var(--x) + var(--w) + var(--g));top:0;',
      'font-family:' + CFG.font + ';font-weight:400;font-size:var(--n);line-height:1;',
      'letter-spacing:' + CFG.track + ';font-variant-numeric:tabular-nums;',
      'color:var(--txt);white-space:nowrap;',
      'writing-mode:vertical-rl;text-orientation:mixed;',
      'transform:translateY(-50%) rotate(180deg);transform-origin:center;',
      'transition:color ' + fade + ',font-size ' + snap + ',right ' + snap + ';',
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
                                                 dello scroll: lo screen reader
                                                 lo conosce gia' */
  rail.innerHTML =
    '<div class="cape-rail__zone"></div>' +
    '<div class="cape-rail__trk"><div class="cape-rail__fil"></div></div>' +
    '<div class="cape-rail__num">0%</div>';

  function mount() {
    document.body.appendChild(rail);
    relayout();
    requestAnimationFrame(function () { rail.classList.add('is-ready'); });
  }

  var zone  = rail.querySelector('.cape-rail__zone');
  var track = rail.querySelector('.cape-rail__trk');
  var fill  = rail.querySelector('.cape-rail__fil');
  var num   = rail.querySelector('.cape-rail__num');

  /* ====================================================================
     GEOMETRIA
     Misurata una volta per relayout, non a ogni frame: il rettangolo
     dell'asta cambia solo se cambia la finestra.
     ==================================================================== */
  var geo = { top: 0, len: 1, x: 0 };
  function measure() {
    var r = track.getBoundingClientRect();
    geo.top = r.top;
    geo.len = r.height || 1;
    geo.x   = r.left + r.width / 2;
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
     Stessa identica logica dell'header: tre sonde lungo l'asta, luminanza
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
     Due scritture per frame, nessuna lettura di layout: niente reflow.
     ==================================================================== */
  var shown = -1;
  var lastProbe = 0;

  function paint() {
    var p = progress();
    fill.style.height = (p * 100) + '%';

    var y = geo.top + geo.len * p;
    num.style.top = y + 'px';

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
     Non si usa :hover sull'asta: un filo di 1px non si azzecca col mouse.
     Si guarda la distanza dal bordo destro, e solo allora la zona diventa
     cliccabile.
     ==================================================================== */
  var near = false;
  function onPointer(e) {
    var n = (innerWidth - e.clientX) <= CFG.zone;
    if (n === near) return;
    near = n;
    rail.classList.toggle('is-near', n);
    requestAnimationFrame(function () { measure(); tick(); });
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
     Un ResizeObserver sul body se ne accorge senza doverlo interrogare.
     ==================================================================== */
  var rT = null;
  function relayout() {
    measure(); paint();
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
