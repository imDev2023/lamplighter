# Credits

Every asset the repo holds or the game ships, with its source and terms.

## Shipped in the game

Nothing yet: the game is at the samples stage.

## Reference only, not shipped

| Asset | Source | Terms |
| --- | --- | --- |
| `samples/mood-*.jpg` | Generated on fal with `fal-ai/nano-banana-pro/edit` on 2026-11-08 (requests `01a1b9b5-001c-7230-a05d-cf0eca770c6a` and `01a1b9b5-001d-7630-963f-5ddab13fdb53`, 0.60 USD for 4 images), with `ref/concept-frame.jpg` as the style reference; prompts in [prompts/](prompts); scaled to 1280 px | fal's and Google's output terms; our part is CC0 1.0 |
| `ref/concept-frame.jpg` | One frame (at 4.6 s) of Lantern River's concept video, generated on fal with `minimax/h3-max/text-to-video` on 2026-11-07 ([its credits](https://github.com/imDev2023/lantern-river/blob/main/CREDITS.md)) | fal's and MiniMax's output terms; our part is CC0 1.0 |

Raw generator outputs are kept out of git in `raw/` on the build machine; [fal-log.json](fal-log.json) lists every call with its arguments and billing headers.
