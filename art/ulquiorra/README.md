# Ulquiorra Cifer — PFP & Banners

Fan art for Ulquiorra Cifer (Bleach), all drawn as SVG in [`src/art.html`](src/art.html).

| | PFP (1024×1024) | Banner (1500×500) |
|---|---|---|
| 1 | `pfp-1-hollow-moon.png`: classic portrait under a crescent moon | `banner-1-hueco-mundo.png`: alone in the Hueco Mundo desert |
| 2 | `pfp-2-cero.png`: close-up, green Cero | `banner-2-cero.png`: Cero fired across the banner |
| 3 | `pfp-3-murcielago.png`: Resurrección, black wings | `banner-3-segunda-etapa.png`: Segunda Etapa + Lanza del Relámpago |
| 4 | `pfp-4-cuarta.png`: minimal emblem, 心 + Cuarta Espada | `banner-4-kokoro.png`: 「これが、心か」 dissolving into ash |
| 5 | **`pfp-5-oscuras.png`: the dark, mysterious one** | **`banner-5-void.png`: the dark, mysterious one** |

## Segunda Etapa set (`segunda-etapa/`)

Darker, grittier take on his Segunda Etapa form (long hair, horns, ragged wings), drawn in [`src/etapa.html`](src/etapa.html).

| | PFP (1024×1024) | Banner (1500×500) |
|---|---|---|
| 1 | `pfp-1-segunda-etapa.png`: wings spread, light behind | `banner-1-segunda-etapa.png`: full wingspan |
| 2 | `pfp-2-gaze.png`: close-up, amber eyes through the hair | `banner-2-gaze.png`: the gaze + name |
| 3 | `pfp-3-lanza.png`: green eyes, Lanza del Relámpago | `banner-3-lanza.png`: Lanza thrown across the banner |
| 4 | `pfp-4-luna.png`: in front of the moon | `banner-4-luna.png`: moonlit wings, "nothing exists here" |
| 5 | **`pfp-5-abismo.png`: the darkest** | **`banner-5-abismo.png`: the darkest** |

To re-render after an edit (needs Playwright):

```bash
cd art/ulquiorra/src && node render.mjs        # first set
cd art/ulquiorra/src && node render.mjs etapa  # Segunda Etapa set
```

Fonts: Cinzel and Shippori Mincho (subset), both under the SIL Open Font License (see `src/fonts/`).
