# Lamplighter

On festival night a young lamplighter races over a canal town's rooftops, quays and bridges, lighting every lantern in passing before the fireworks start.
A daily run of 30 to 90 s, the same for everyone, with a score a server can replay.

It is built for [x-gaming#7](https://github.com/imDev2023/x-gaming/issues/7) and replaces [Lantern River](https://github.com/imDev2023/lantern-river), whose rules, chunk generator and replay check it will reuse.

## Status: samples first

No game code is written until the owner approves the samples, judged against Kensei's Small Hours level and Sumiro's look.

1. **Mood stills** (done, waiting for the owner's pick): two styles from the gameplay camera, in [samples/](samples).
   ![The four mood stills: two stylised night, two painted](samples/mood-sheet.jpg)
2. The hero's 4-view sheet, made from the approved still.
3. The hero lifted to 3D, cut to a phone budget, rigged and running.
4. The hero running on one textured, dressed stretch of rooftop in Three.js at 390 x 844.

## Tools

- `node tools/fal.ts <name> <endpoint> <arguments.json>`: one paid fal call, raw outputs to the gitignored `raw/`, logged in [fal-log.json](fal-log.json).
- `node tools/fal-usage.ts <endpoint> <start> <end>`: fal's exact charge for a time window.
- `node tools/fal-upload.ts <file>`: upload one of our own files to fal's storage as a reference image (free).
- `tools/lowpoly_bake.py`: cut a generated model to a phone budget in headless Blender (usage in its docstring).

## Licence

Use it however you want: copy it, change it, sell it or build your own game from it, with no credit required.

- **Code:** MIT No Attribution, in [LICENSE](LICENSE).
- **Our images, video and other assets:** dedicated to the public domain under CC0 1.0, in [LICENSE-ASSETS](LICENSE-ASSETS).
- Generated assets may also carry their generator's output terms; see [CREDITS.md](CREDITS.md).
