# Credits

Every asset the repo holds or the game ships, with its source and terms.

## Shipped in the game

The game is at the samples stage; these are used by the sample pages.

| Asset | Source | Terms |
| --- | --- | --- |
| Three.js r186 | [three.js](https://threejs.org/), npm `three@0.186.1` | MIT |
| `public/models/hero-stylised.glb`, `public/models/hero-painted.glb` | Generated on fal with `tripo3d/h3.1/multiview-to-3d` on 2026-11-08 from the views in `samples/views-*.jpg` (requests `01a1b9c0-f45b-7720-9073-f28ff28fe2a7` and `01a1b9c4-4f0f-7be2-9e53-4db48e495961`, 0.60 USD each), then simplified by `tools/simplify.sh`, rigged and animated by `tools/rig_hero.py`, and compressed with `gltf-transform optimize` | Tripo's and fal's output terms; our part is CC0 1.0 |
| `public/textures/grey_roof_tiles`, `painted_plaster_wall`, `dark_planks`, `japanese_stone_wall`, `mossy_cobblestone` | [Poly Haven](https://polyhaven.com/textures), 1k, fetched by `tools/polyhaven.ts` | CC0 1.0 |

## Reference only, not shipped

| Asset | Source | Terms |
| --- | --- | --- |
| `samples/mood-*.jpg` | Generated on fal with `fal-ai/nano-banana-pro/edit` on 2026-11-08 (requests `01a1b9b5-001c-7230-a05d-cf0eca770c6a` and `01a1b9b5-001d-7630-963f-5ddab13fdb53`, 0.60 USD for 4 images), with `ref/concept-frame.jpg` as the style reference; prompts in [prompts/](prompts); scaled to 1280 px | fal's and Google's output terms; our part is CC0 1.0 |
| `samples/sheet-*.jpg` and `samples/views-*.jpg` | Generated on fal with `fal-ai/nano-banana-pro/edit` on 2026-11-08 from `mood-stylised-2` and `mood-painted-2` (0.30 USD for 2 images; request ids in [fal-log.json](fal-log.json)), prompts in [prompts/](prompts); the views are cut from the sheets by `tools/cut_views.py`, with the right side mirrored from the left | fal's and Google's output terms; our part is CC0 1.0 |
| `ref/concept-frame.jpg` | One frame (at 4.6 s) of Lantern River's concept video, generated on fal with `minimax/h3-max/text-to-video` on 2026-11-07 ([its credits](https://github.com/imDev2023/lantern-river/blob/main/CREDITS.md)) | fal's and MiniMax's output terms; our part is CC0 1.0 |

Raw generator outputs are kept out of git in `raw/` on the build machine; [fal-log.json](fal-log.json) lists every call with its arguments and billing headers.
