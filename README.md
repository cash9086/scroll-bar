# cape-scroll-rail

Indicatore di scroll verticale per [The Cape Studio](https://thecapestudio.webflow.io),
in sostituzione della scrollbar nativa del browser.

Un filo di 1px, grigio chiaro, sul lato destro, che si allarga a 5px quando
il puntatore si avvicina al bordo. Il progresso lo riempie di nero dall'alto.

Su fondo chiaro il filo e' `#141416`, su fondo scuro `#ffffff`. Il filo si
puo' trascinare per scorrere.

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
<script defer src="https://cdn.jsdelivr.net/gh/cash9086/scroll-bar@810257c7e7b9890e61bb43681b4877485292f41e/cape-scroll-rail.js"></script>
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

**Accessibilita'.** L'asta e' `aria-hidden`: e' un doppione dello scroll, che
lo screen reader conosce gia'. `prefers-reduced-motion`
azzera le transizioni, non il binario.
