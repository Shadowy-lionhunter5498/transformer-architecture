# Development

## App

Serve `dist/` over HTTP, as shown in the README. There is no bundler or dependency installation. The import map in `dist/index.html` resolves Three.js to the checked-in vendor files.

The app loads `spatial-original.glb`, `spatial-deepseek.glb`, `detail_kit.glb` and `spatial-data.json`. Earlier design experiments are not required by the runtime.

## Blender

Open `blender/architectures.blend` in Blender. It was authored with Blender 5.2.1 LTS. The `spatial_original` and `spatial_deepseek` roots contain the browser models; the file also retains the detail kit and earlier model layouts. Text labels remain editable in the Blender file; the web app draws its own labels.

To rebuild the two spatial models from `blender/diagram-data.json`:

```bash
blender --background --python scripts/build_spatial_architecture.py
```

This updates the spatial GLBs and graph in `dist/assets/` and saves the Blender scene. Commit or back up your scene edits first. The prebuilt detail kit is included; rebuilding is optional for running or editing the web app.

## Checks

With Node.js 22 or later installed:

```bash
npm test
```

No `npm install` is needed. The checks cover architecture facts against the frozen configuration, KV/index producer schedules, causal masks, graph-to-GLB consistency, cache accounting, story timing, playback and camera continuity. They do not execute the neural models or benchmark inference.

For visual changes, inspect the populated app at both wide and narrow widths, and play the story through to completion. Mobile uses one model at a time in Explore and keeps both models visible in Story mode.

## Hosting

Upload the contents of `dist/` to any static host. Keep the directory structure intact so the import map, modules and assets resolve. The live demo uses GPT Sites; account-specific deployment configuration is deliberately not included in this repository.
