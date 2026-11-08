#!/usr/bin/env bash
# Cut a single-atlas generated model (a Tripo output) to a phone budget, keeping its own
# UVs and textures: weld, simplify with meshoptimizer, and resize the textures.
#
#   tools/simplify.sh in.glb out.glb [ratio=0.0125] [texture px=2048]
#
# For a Tripo hero this kept the face as generated, where tools/lowpoly_bake.py's fresh
# unwrap and selected-to-active bake left seams and dark blotches (its 2% cage reaches the
# hair from the forehead). Use the bake tool for models with several materials or
# overlapping UVs. Free: gltf-transform runs locally.
set -euo pipefail
in="$1"; out="$2"; ratio="${3:-0.0125}"; px="${4:-2048}"
tmp="$(mktemp -d)"
trap 'rm -r "$tmp"' EXIT
g() { npx -y @gltf-transform/cli "$@"; }
g weld "$in" "$tmp/weld.glb"
g simplify "$tmp/weld.glb" "$tmp/simple.glb" --ratio "$ratio" --error 0.004
g resize "$tmp/simple.glb" "$out" --width "$px" --height "$px"
g inspect "$out" --format md | grep -E "TRIANGLES|^\| [0-9]+ .*image/" || true
