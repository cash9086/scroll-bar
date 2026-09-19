/*! cape-scroll-rail — The Cape Studio
 *  Indicatore di scroll verticale sul lato destro, in sostituzione della
 *  scrollbar nativa del browser.
 *
 *  Un filo di 1px, grigio chiaro, che si allarga a 5px quando il puntatore
 *  si avvicina al bordo. Il progresso lo riempie di nero dall'alto.
 *
 *  Quando il documento si accorcia di colpo — la intro che collassa — il nero
 *  non salta: percorre la strada che ha perso, e mentre la percorre le quattro
 *  lettere di CAPE compaiono sotto il suo orlo, una dopo l'altra, e si
 *  spengono quando si posa. Fuori dal ritiro non esistono e il filo e' intero.
 *
 *  Su fondo chiaro il filo e' #141416, su fondo scuro #ffffff.
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
    x         : 26,        /* px dal bordo destro                           */
    inset     : '14vh',    /* aria sopra e sotto il filo                    */
    w         : 1,         /* px, spessore a riposo                         */
    wHover    : 5,         /* px, spessore col puntatore vicino             */
    zone      : 30,        /* px, larghezza della zona sensibile dal bordo  */

    lettere   : 'CAPE',    /* la parola che compare durante il ritiro       */
    num       : 10,        /* px, corpo delle lettere                       */
    pad       : 6,         /* px, aria fra l'orlo del nero e la prima       */
    salto     : 620,       /* ms, quanto dura il riassorbimento             */
    stagger   : 55,        /* ms, ritardo fra una lettera e l'altra         */
    sogliaDoc : 0.5,       /* schermate: sotto, non e' un salto ma un       */
                           /* assestamento, e si scrive e basta             */
    sogliaP   : 0.02,      /* progresso: sotto, non vale la pena animare    */

    z         : 2147483000,/* sotto #capecur (2147483647)                   */
    mobile    : true,      /* mostrarlo anche sotto i 992px                 */
    drag      : true,      /* trascinare il filo per scorrere               */

    ink       : '#141416', /* filo su fondo chiaro                          */
    snow      : '#ffffff', /* filo su fondo scuro                           */
    trkLight  : 'rgba(20,20,22,.16)',    /* filo vuoto su fondo chiaro      */
    trkDark   : 'rgba(255,255,255,.22)', /* filo vuoto su fondo scuro       */

    font      : "'Jost', system-ui, -apple-system, 'Segoe UI', sans-serif",
    track     : '.10em',   /* letter-spacing delle lettere                  */

    toLight   : 0.45,      /* isteresi: sotto questa luminanza -> inverti   */
    toDark    : 0.60,      /* sopra questa -> torna normale                 */

    fade      : '.45s cubic-bezier(.16,1,.3,1)',  /* colore, come l'header  */
    snap      : '.34s cubic-bezier(.16,1,.3,1)'   /* spessore               */
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
      '--w:' + CFG.w + 'px;--chW:10px;',
      '--trk:' + CFG.trkLight + ';--fil:' + CFG.ink + ';',
    '}',
    '.cape-rail.is-ready{opacity:1}',

    /* fondo scuro: il filo diventa bianco */
    '.cape-rail.is-inv{--trk:' + CFG.trkDark + ';--fil:' + CFG.snow + '}',

    /* puntatore vicino: il filo si allarga */
    '.cape-rail.is-near{--w:' + CFG.wHover + 'px}',

    /* la zona sensibile e' trasparente ai click finche' il puntatore non
       entra davvero nei pochi px di bordo: cosi' non ruba mai un click a
       quello che ci sta sotto */
    '.cape-rail__zone{position:fixed;right:0;top:0;bottom:0;width:' + CFG.zone + 'px;pointer-events:none;touch-action:none}',
    '.cape-rail.is-near .cape-rail__zone{pointer-events:auto}',

    /* Il filo */
    '.cape-rail__trk{',
      'position:fixed;right:var(--x);top:var(--in);bottom:var(--in);',
      'width:var(--w);background:var(--trk);overflow:hidden;',
      'transition:width ' + snap + ',background-color ' + fade + ';',
    '}',

    /* il nero. Niente transizione sull'altezza: deve stare incollato allo
       scroll, non inseguirlo */
    '.cape-rail__fil{',
      'position:absolute;left:0;top:0;width:100%;height:0;',
      'background:var(--fil);transition:background-color ' + fade + ';',
    '}',

    /* Le lettere. Vivono solo durante il ritiro: a riposo stanno a zero e
       la maschera del filo non c'e' proprio. Posizione e opacita' le scrive
       il JS a ogni fotogramma, quindi qui non c'e' nessuna transizione —
       tranne quella del colore, che segue il fondo come il filo. */
    '.cape-rail__ch{',
      'position:fixed;top:0;opacity:0;',
      'right:calc(var(--x) + var(--w) / 2);',
      'transform:translateX(50%);',
      'width:var(--chW);text-align:center;',
      'font-family:' + CFG.font + ';font-weight:400;',
      'font-size:' + CFG.num + 'px;line-height:1;',
      'letter-spacing:' + CFG.track + ';',
      'color:var(--fil);white-space:pre;pointer-events:none;',
      'transition:color ' + fade + ';',
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
  rail.setAttribute('aria-hidden', 'true');   /* e' un doppione dello scroll,
                                                 che lo screen reader conosce
                                                 gia' */
  var PAROLA = String(CFG.lettere || '');

  rail.innerHTML =
    '<div class="cape-rail__zone"></div>' +
    '<div class="cape-rail__trk"><div class="cape-rail__fil"></div></div>' +
    new Array(PAROLA.length + 1).join('<span class="cape-rail__ch"></span>');

  var zone  = rail.querySelector('.cape-rail__zone');
  var track = rail.querySelector('.cape-rail__trk');
  var fill  = rail.querySelector('.cape-rail__fil');
  var segni = rail.querySelectorAll('.cape-rail__ch');

  for (var ci = 0; ci < segni.length; ci++) segni[ci].textContent = PAROLA[ci];

  function mount() {
    document.body.appendChild(rail);
    relayout();
    requestAnimationFrame(function () { rail.classList.add('is-ready'); });
  }

  /* ====================================================================
     GEOMETRIA
     ==================================================================== */
  var geo = { top: 0, len: 1, x: 0 };
  var chW = 10;    /* larghezza della lettera piu' larga */
  var passo = 11;  /* da una lettera alla successiva     */

  function measure() {
    var r = track.getBoundingClientRect();
    geo.top = r.top;
    geo.len = r.height || 1;
    geo.x   = r.left + r.width / 2;
  }

  /* Le lettere hanno larghezze diverse: il box si fissa sulla piu' larga,
     cosi' stanno tutte sullo stesso asse invece di ballare di mezzo
     carattere l'una rispetto all'altra. */
  function misuraLettere() {
    if (!segni.length) return;
    var w = 0, h = 0, i, r;
    for (i = 0; i < segni.length; i++) {
      segni[i].style.width = 'auto';
      r = segni[i].getBoundingClientRect();
      if (r.width  > w) w = r.width;
      if (r.height > h) h = r.height;
      segni[i].style.width = '';
    }
    chW = Math.ceil(w) || 10;
    passo = Math.ceil(h) + 1 || 11;
    rail.style.setProperty('--chW', chW + 'px');
  }

  function maxScroll() {
    return Math.max(0, document.documentElement.scrollHeight - innerHeight);
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
     IL RITIRO
     Quando la intro collassa, il documento si accorcia di tre schermate in
     un fotogramma. Il progresso e' scrollY diviso quanto resta da scorrere:
     cambiano numeratore e denominatore insieme, e il nero si accorcia di
     scatto.

     Quello che si conserva non e' il valore ma lo SCARTO fra dov'era il nero
     e dov'e' finito. Lo scarto poi si scioglie da solo lungo la curva del
     sito, e intanto il progresso vero continua a rispondere allo scroll:
     chi scorre mentre il ritiro e' in corso non se lo vede bloccare sotto
     le mani.

     Le lettere vivono dentro questa finestra e nient'altro: si accendono
     una dopo l'altra sotto l'orlo del nero, lo seguono, e si spengono
     quando si posa. A riposo la maschera non c'e' e il filo e' intero.
     ==================================================================== */

  /* La stessa curva che usano le transizioni del sito, risolta a mano:
     serve fotogramma per fotogramma, e il CSS qui non arriva. */
  function molla(x1, y1, x2, y2) {
    function A(a, b) { return 1 - 3 * b + 3 * a; }
    function B(a, b) { return 3 * b - 6 * a; }
    function C(a)    { return 3 * a; }
    function val(t, a, b)   { return ((A(a, b) * t + B(a, b)) * t + C(a)) * t; }
    function pend(t, a, b)  { return 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a); }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x, i, d;
      for (i = 0; i < 6; i++) {
        d = pend(t, x1, x2);
        if (!d) break;
        t -= (val(t, x1, x2) - x) / d;
      }
      return val(t, y1, y2);
    };
  }
  var curva = molla(.16, 1, .3, 1);

  /* La lettera entra in fretta e se ne va con calma: cosi' il gruppo si
     accende insieme al movimento e sfuma dopo che il nero si e' fermato. */
  function busta(t) {
    if (t <= 0 || t >= 1) return 0;
    return Math.min(1, t / 0.18, (1 - t) / 0.30);
  }

  var ritiro = null;      /* { scarto, t0 } finche' dura, poi null   */
  var pMostrato = 0;      /* il progresso disegnato, scarto compreso */
  var mUlt = -1, pUlt = -1;
  var sospetto = 0;       /* quando il documento e' cambiato di colpo */
  var nato = Date.now(), vpT0 = 0;
  var giroChiesto = false;
  var mascheraUlt = '';

  function avviaRitiro(scarto) {
    ritiro = { scarto: scarto, t0: Date.now() };
    if (giroChiesto) return;
    giroChiesto = true;
    requestAnimationFrame(giro);
  }

  /* Il ritiro ha bisogno di fotogrammi suoi: lo scroll puo' essersi fermato
     nello stesso istante in cui la sezione e' sparita, e allora nessun altro
     chiamerebbe paint(). */
  function giro() {
    giroChiesto = false;
    if (!ritiro) return;
    paint();
    if (ritiro) { giroChiesto = true; requestAnimationFrame(giro); }
  }

  function maschera(g) {
    if (g === mascheraUlt) return;
    mascheraUlt = g;
    track.style.webkitMaskImage = g;
    track.style.maskImage = g;
  }

  function spegniLettere() {
    for (var i = 0; i < segni.length; i++) segni[i].style.opacity = '0';
    maschera('');
  }

  /* Ogni lettera ha il suo orologio, sfalsato di CFG.stagger: il suo scarto
     si scioglie piu' tardi di quello della lettera prima, quindi durante la
     corsa la parola si stira e all'arrivo si ricompone. */
  function lettere(t, p) {
    var n = segni.length;
    if (!n) return;

    var lim = geo.len - n * passo - CFG.pad;
    if (lim < 0) lim = 0;

    var g = 'linear-gradient(to bottom,#000 0', aperto = false, i;

    for (i = 0; i < n; i++) {
      var ti = (t - i * CFG.stagger) / CFG.salto;
      if (ti < 0) ti = 0; else if (ti > 1) ti = 1;

      var pi = p + ritiro.scarto * (1 - curva(ti));
      if (pi < 0) pi = 0; else if (pi > 1) pi = 1;

      var y = pi * geo.len + CFG.pad;
      if (y > lim) y = lim;
      y += i * passo;

      var op = busta(ti);
      var el = segni[i];
      el.style.top = (geo.top + y).toFixed(2) + 'px';
      el.style.opacity = op.toFixed(3);

      /* il buco nel filo si apre solo dove una lettera si vede davvero */
      if (op > 0.06) {
        aperto = true;
        var da = y - 2, a = y + passo - 1;
        if (da < 0) da = 0;
        if (a > geo.len) a = geo.len;
        g += ',#000 ' + da.toFixed(1) + 'px,rgba(0,0,0,0) ' + da.toFixed(1) + 'px' +
             ',rgba(0,0,0,0) ' + a.toFixed(1) + 'px,#000 ' + a.toFixed(1) + 'px';
      }
    }

    maschera(aperto ? (g + ',#000 100%)') : '');
  }

  /* ====================================================================
     DISEGNO
     ==================================================================== */
  var lastProbe = 0;

  function paint() {
    var m = maxScroll();
    var p = m > 0 ? (window.scrollY || window.pageYOffset) / m : 0;
    if (p < 0) p = 0; else if (p > 1) p = 1;

    /* Il salto si riconosce dal documento, non dal progresso: solo un
       cambio d'altezza vero puo' spostare il nero senza che nessuno abbia
       scrollato. Il trascinamento e il ridimensionamento della finestra
       sono esclusi apposta — li' il movimento e' gia' in mano a qualcuno.

       Fra l'altezza che cambia e lo scroll che viene rimesso in riga puo'
       passare un fotogramma — chi collassa la sezione fa le due cose una
       dopo l'altra — quindi il cambio d'altezza apre una finestra e lo
       scarto si prende quando il progresso si muove davvero. */
    var ora = Date.now();
    var attivo = !reduced && !dragging &&
                 ora - vpT0 > 400 && ora - nato > 1200;

    if (mUlt >= 0 && attivo &&
        Math.abs(m - mUlt) > CFG.sogliaDoc * innerHeight) sospetto = ora;

    if (attivo && sospetto && ora - sospetto < 250 &&
        Math.abs(p - pUlt) > CFG.sogliaP) {
      var scarto = (ritiro ? pMostrato : pUlt) - p;
      if (scarto > 1) scarto = 1; else if (scarto < -1) scarto = -1;
      avviaRitiro(scarto);
    }
    mUlt = m;
    pUlt = p;

    if (ritiro) {
      var t = ora - ritiro.t0;
      var fine = CFG.salto + CFG.stagger * Math.max(0, segni.length - 1);

      p += ritiro.scarto * (1 - curva(t / CFG.salto));
      if (p < 0) p = 0; else if (p > 1) p = 1;

      if (t < fine) {
        lettere(t, pUlt);
      } else {
        ritiro = null;
        spegniLettere();
        p = pUlt;
      }
    }

    pMostrato = p;
    fill.style.height = (p * geo.len) + 'px';

    /* La sonda del fondo costa tre hit-test: a 60fps, su una pagina che sta
       gia' animando il rig orizzontale e il ponte, si sente. La transizione
       di colore dura 450ms, quindi campionare ogni 100ms e' comunque cinque
       volte piu' fitto di quanto l'occhio possa distinguere. */
    if (ora - lastProbe >= 100) { lastProbe = ora; contrast(); }
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
    /* il filo si allarga, quindi il suo centro si sposta: le sonde del fondo
       partono da li' e vanno riprese */
    requestAnimationFrame(function () { measure(); paint(); });
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
    measure(); misuraLettere(); paint();
  }
  function debounced() {
    clearTimeout(rT);
    rT = setTimeout(relayout, 120);
  }

  addEventListener('scroll', tick, { passive: true });
  addEventListener('resize', function () {
    /* la finestra che cambia misura cambia anche l'altezza del documento:
       e' un'altra cosa dal collasso di una sezione, e non si anima */
    vpT0 = Date.now();
    debounced();
  }, { passive: true });
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
      ritiro = null;
      if (rail.parentNode)  rail.parentNode.removeChild(rail);
      if (sheet.parentNode) sheet.parentNode.removeChild(sheet);
      delete window.capeRail;
    }
  };

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  bindLenis(0);
})();
