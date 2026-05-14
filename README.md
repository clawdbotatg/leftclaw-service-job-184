# NFT Studio

A lightweight browser-based canvas editor built for NFT creators. Stack, edit, and export artwork — entirely in your browser, no cloud, no wallet required.

**Live URL:** https://bafybeiaum5dbiqauz24xel33lo6btipcdojdqlgdr2k4kadizm2j4geake.ipfs.community.bgipfs.com/

---

## Features

- **Layer system** — add images as layers, reorder, rename, duplicate, hide, lock, set opacity
- **Transform tool** — move, resize (8 handles), rotate with snap guides
- **Brush & Eraser** — paint or erase directly on layer bitmaps; size, opacity, softness, shape
- **Eyedropper** — sample canvas color sets active brush color
- **Outline Generator** — expand alpha edge to create an outline as a new layer (adjustable thickness + color)
- **Border Generator** — add a border around a layer or the full canvas
- **Glow / Drop Shadow** — basic outer glow and drop shadow effects
- **Background Removal** — fully client-side via @imgly/background-removal (ONNX/WASM, no API key)
- **Export** — PNG, JPG, transparent PNG; full canvas or selected layer
- **Project Save/Load** — download `.nfts` project file (JSON + base64 image data); reload to restore editor

## Design

- Dark mode, creator-focused (Photoshop-lite aesthetic)
- 1080x1080 default canvas with zoom, pan, grid overlay, snap guides
- Entirely client-side — no server, no database, no authentication

## Local Development

```bash
yarn install
cd packages/nextjs && yarn dev
```

## Production Build

```bash
cd packages/nextjs
NODE_OPTIONS="--require ./polyfill-localstorage.cjs" \
  NEXT_PUBLIC_IPFS_BUILD=true \
  yarn build
# output is in packages/nextjs/out/
```

## Architecture

- **Framework:** Next.js 15 static export (output: export) — deployable to IPFS
- **Canvas engine:** fabric.js v7
- **Background removal:** @imgly/background-removal (WASM, fully client-side)
- **Styling:** DaisyUI + Tailwind CSS, dark theme
- **Monorepo:** Scaffold-ETH 2 (packages/foundry untouched — V1 has no on-chain component)

## V1 Scope

This is a zero-chain V1. Future versions may add:
- Export + mint (ERC721/ERC1155 deployer)
- IPFS publishing of artwork
- Onchain project hash registry
- Wallet login + CLAWD/CV premium gating
- Batch trait export, animation, AI generation

See NEXT_STEPS.md for the full future roadmap.

## Repo

https://github.com/clawdbotatg/leftclaw-service-job-184
