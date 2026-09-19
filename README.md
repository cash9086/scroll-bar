# cape-scroll-rail

Indicatore di scroll verticale per [The Cape Studio](https://thecapestudio.webflow.io),
in sostituzione della scrollbar nativa del browser.

Un filo di 1px, grigio chiaro, sul lato destro, che si allarga a 5px quando
il puntatore si avvicina al bordo. Il progresso lo riempie di nero dall'alto.

Quando il documento si accorcia di colpo — la intro della Home che collassa —
il nero non salta: percorre la strada che ha perso, e mentre la percorre le
quattro lettere di CAPE compaiono in verticale sotto il suo orlo, una dopo
l'altra, e si spengono quando si posa. Fuori dal ritiro non esistono: niente
lettere, nessun buco nel filo, il binario e' un filo e basta.

Su fondo chiaro filo e lettere sono `#141416`, su fondo scuro `#ffffff`. Il
filo si puo' trascinare per scorrere.

## Uso

Due pezzi. Il CSS va nella head, non dentro lo script: su Windows e Linux
la scrollbar occupa larghezza vera, quindi se la togliesse il JS dopo il
primo paint la pagina salterebbe di ~15px.

```html
<!-- Site settings > Custom code > Head code -->
<style>
  html{ scrollbar-width:none; -ms-overflow-style:none; }
  html::-webkit-scrollbar,
  body::-webkit-scrollbar{ width:0; height:0; display:none; }
</style>
```

```html
<!-- Site settings > Custom code > Footer code -->
<script defer src="https://cdn.jsdelivr.net/gh/cash9086/scroll-bar@274524f83b4185385e33189139495bcf1e729d8f/cape-scroll-rail.js"></script>
```

Pinnare l'URL a un commit invece che a `@main` lo rende immutabile, quindi
jsDelivr lo cacha per sempre.

## Configurazione

Opzionale, va dichiarata **prima** dello script. Basta elencare le chiavi
che cambi.

```html
<script>
  window.CAPE_RAIL = {
    x        : 26,      // px dal bordo destro
    inset    : '14vh',  // aria sopra e sotto il filo
    w        : 1,       // spessore del filo a riposo, px
    wHover   : 5,       // spessore col puntatore vicino, px
    zone     : 30,      // larghezza della zona sensibile, px
    lettere  : 'CAPE',  // la parola del ritiro; '' per non averla
    num      : 10,      // corpo delle lettere, px
    pad      : 6,       // aria fra l'orlo del nero e la prima lettera, px
    salto    : 620,     // durata del riassorbimento, ms
    stagger  : 55,      // ritardo fra una lettera e l'altra, ms
    sogliaDoc: 0.5,     // schermate: sotto, il documento si e' solo
                        // assestato e il valore si scrive e basta
    sogliaP  : 0.02,    // progresso: sotto, non vale la pena animare
    mobile   : true,    // false: niente binario sotto i 992px,
                        // e li' torna la scrollbar nativa
    drag     : true     // false: niente trascinamento dell'asta
  };
</script>
```

## API

```js
capeRail.cfg        // la configurazione in uso
capeRail.refresh()  // ricalcola geometria e altezza del documento
capeRail.destroy()  // toglie tutto e riaccende la scrollbar nativa
```

## Note

**Il ritiro.** Il binario legge gia' l'altezza del documento a ogni fotogramma
— gli serve per il progresso — quindi il salto se lo accorge da solo: nessun
accordo da tenere in piedi con `section-intro`. Un cambio d'altezza oltre
`sogliaDoc` apre una finestra di 250ms, e dentro quella finestra lo scarto fra
dov'era il nero e dov'e' finito diventa l'animazione. La finestra serve perche'
chi collassa una sezione fa due cose di fila — accorcia il documento e rimette
in riga lo scroll — e fra le due puo' passare un fotogramma.

Quello che si conserva e' lo **scarto**, non il valore: si scioglie lungo la
curva del sito mentre il progresso vero continua a rispondere allo scroll, cosi'
chi scorre durante il ritiro non se lo sente bloccare sotto le mani.

Non scatta col trascinamento dell'asta, ne' entro 400ms da un ridimensionamento
della finestra, ne' nei primi 1200ms di vita della pagina: li' l'altezza cambia
per altri motivi. Con `prefers-reduced-motion` non scatta affatto e il valore si
scrive diretto.

**Lenis.** Il sito gira su Lenis sopra i 992px, fuori da Firefox e senza
`prefers-reduced-motion`. Il binario si aggancia a `lenis.on('scroll')`,
che scatta a ogni frame del suo rAF, con lo scroll nativo come rete di
sicurezza. Aspetta `window.lenis` fino a 8 secondi, quindi l'ordine fra
codice di sito e codice di pagina non conta.

**Chiaro o scuro.** Stessa logica dell'header del sito: tre sonde
`elementsFromPoint` lungo l'asta, luminanza WCAG, isteresi 0.45 / 0.60 per
non far sfarfallare il colore quando il fondo sta in mezzo. Vale anche
l'override `data-hdr="dark" | "light"` sulle sezioni. La sonda gira ogni
100ms e non a ogni frame: tre hit-test per frame si sentono su una pagina
che sta gia' animando, e la transizione di colore dura comunque 450ms.

**Non ruba i click.** La zona sensibile a destra e' `pointer-events:none`
finche' il puntatore non entra davvero nei 30px di bordo.

**Cursore custom.** Il binario sta a `z-index:2147483000`, sotto `#capecur`
(2147483647), e non imposta nessun `cursor`: il sito forza `cursor:none` su
desktop e verrebbe comunque annullato.

**Le lettere.** Il box di ogni lettera e' fissato sulla piu' larga della parola,
misurata a runtime: essendo centrate sul filo, con la larghezza libera
scivolerebbero di mezzo carattere l'una rispetto all'altra. Il buco nel filo si
apre solo dove una lettera si vede davvero, e si richiude con lei.

**Accessibilita'.** L'asta e' `aria-hidden`: e' un doppione dello scroll, che
lo screen reader conosce gia'. `prefers-reduced-motion`
azzera le transizioni, non il binario.
