# NFT Studio — V2+ Roadmap

## On-Chain Features
- Export + mint: integrate ERC721/ERC1155 deployer
- IPFS publishing of artwork directly from the editor
- Onchain project hash registry (commit artwork fingerprints)
- Wallet login (RainbowKit)
- CLAWD/CV token gating for premium features

## Editor Features
- Batch trait export (layer combinator for NFT collections)
- Animation timeline support
- AI generation integration (text-to-layer via API)
- PSD import
- Keyboard shortcuts panel
- Layer masking
- Blend modes (multiply, screen, overlay, etc.)
- Adjustment layers (brightness, contrast, hue/saturation)
- Mobile support / responsive layout
- Undo/redo history (Ctrl+Z)
- Text tool
- Shape tool (rectangle, circle, polygon)

## Technical Improvements
- True per-layer bitmap eraser (rasterize layer before erase pass)
- Gradient brush (true soft edge, not shadow approximation)
- Per-layer-edge snap in addition to canvas-edge snap
- Offline-first: cache ONNX model in IndexedDB for background removal without CDN dependency
- WebWorker for background removal to avoid main thread block
