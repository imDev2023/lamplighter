# Lamplighter

A daily character runner in Three.js, built for x-gaming#7 (github.com/imDev2023/x-gaming): a lamplighter racing over a canal town's rooftops, lighting lanterns before the fireworks.
The operator chose it on 2026-11-08 to replace Lantern River (`../lantern-river`), in this new public repo.
Where the work stands and what is next lives in issue #7's Status section and its open questions.

## The samples gate

- No game code past the samples until the owner approves them (owner, 2026-11-08).
  The samples are: mood stills, the hero's 4-view sheet, the hero in 3D, and the hero running on one dressed stretch of rooftop in Three.js at 390 x 844.
- The quality bar is Kensei's Small Hours level (x-gaming's `sources/2026-11-07-kensei-opus-blender-unity.md`), with Sumiro's look as the other reference.
- Both styles go forward until the owner picks one on #7: stylised, and painted (watercolour and ink, a screen pass in `src/sample/inkwash.ts`).

## Rules

- Follow x-gaming's WORKFLOW.md for the asset pipeline: mood stills, sheets edited from the approved still, multiview image-to-3D, the Blender asset loop and its done checks, then the ship check.
- Generation calls (fal and the like) are paid and need the owner's approval each time.
  Run them through `node tools/fal.ts`, one at a time: it reads and rewrites `fal-log.json`, so two runs at once can lose a log entry.
  Then read the exact charge with `node tools/fal-usage.ts` (needs `FAL_BILLING_KEY`) and log that in the spend ledger and CREDITS.md.
- Reference images go to fal through `node tools/fal-upload.ts`, which makes them public URLs: upload only our own files.
- The hero's sheet leaves out the pole, a flame or anything held: the generator welds held things into the hand, and the game draws the pole as its own model.
  Keep the hair tied back and the clothes fitted, since generators handle loose hair and cloth badly.
- Check which way each profile on a sheet faces before cutting it with `tools/cut_views.py`: a left view faces the image's left edge.
  Both of the first sheets drew the left profile twice although the prompt spelled out both sides, so the right view is the left one mirrored.
- Cut a single-atlas generated model (every Tripo output so far) with `tools/simplify.sh`, which keeps its own UVs and textures; `tools/lowpoly_bake.py` left seams and dark blotches on the hero's face (2026-11-08), since its cage reaches 2% of the model's size and hits the hair from the forehead.
  Use the bake tool only for models with several materials or overlapping UVs, then `gltf-transform optimize --simplify false` for both.
- Rig with `tools/rig_hero.py`: bone heat weighted nothing on the generated mesh's layered cloth, so it solves on a watertight voxel copy and transfers the weights.
  Check every rig in `check.html` with `&bones`, from the side at several `t`, and up close on the face.
- Look at every sample at 390 x 844 through `agent-browser` with `?t=` to hold a moment, and for a close look use `&cam=x,y,z,tx,ty,tz` (relative to the hero).
  To find which surface is which, tint a material a flat colour in the live page through `window.__sample.scene`: that is how a roof drawn facing down (culled) showed up as the plaster wall tops beneath it.
- The owner asked on 2026-11-08 for early evening, not night ("too dark"), and a jump that is not hasty; the sample now has a sunset sky (`src/sample/fx.ts`), a second-long jump with a crouch, a tuck and a landing dip, and a low, level chase camera, because a camera pitched down from high up saw the next roof slide up into the frame at every alley.
- A portrait chase camera sees only about 34 degrees across, and only what lies ahead: lanterns lit beside or behind the hero are never on screen, so the lit line runs forward from each post like a fuse (2026-11-08).
- Record clips with `node tools/record.mjs` (the page's `&record` mode steps a fixed clock), into the gitignored `media/`.
- When the game is built, carry over Lantern River's rules: integers only in `src/sim/`, no clock, no `Math.random`, chunks from the seed and their index, stages as data, `replay(stage, record)` as the server's check, and `?debug` checking that drawing never writes into the rules' state.
- Nothing touches a chain until the game is built.
- Licence (owner, 2026-11-07, same as Dockstack and Lantern River): code MIT No Attribution, our assets CC0.
- The repo is public: no keys, no raw paid outputs (they live in the gitignored `raw/`, the only copy, never delete it), and no copied text or screenshots of other people's work.
  Reviewed samples go in `samples/` scaled to 1280 px.

## Issues

Issues are tracked on github.com/imDev2023/x-gaming: #7 is this game.

## Multica dashboard

This project is mirrored on the owner's Multica dashboard (workspace Pandora) under the x-gaming project `5e65d424-8653-4e40-8aca-449c8e90891c`.
GitHub Issues on `imDev2023/x-gaming` stay the source of truth; Multica only mirrors them, and each Multica ticket title starts with its issue number.
At the end of every session, after the issues are updated, run the `multica-sync` skill for that project: mirror ticket statuses, add any new tickets, and refresh the project's "Current step" section.
Every status and assignment write passes `--no-start` (`issue create` rejects the flag), and no ticket is ever assigned to an agent, so the sync never starts an agent run.
If the `multica` CLI is not signed in, say so in the session summary and stop anyway; the sync never blocks the work.
