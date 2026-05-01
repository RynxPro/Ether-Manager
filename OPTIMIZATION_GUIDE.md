# Aether Manager: High-Fidelity Rendering & GPU Optimization

This document outlines the rendering strategy and hardware acceleration techniques used to ensure Aether Manager remains sharp and fluid across all display densities (from 1080p to 4K).

## 1. The Core Problem: Sub-Pixel Shimmering
On standard resolution displays (1080p), CSS transforms like `scale()` and `translate()` can cause images to appear pixelated or "shimmer" during animations. This happens because the browser's CPU renderer sometimes miscalculates pixel boundaries, leading to sub-pixel misalignment.

## 2. The Solution: GPU Layer Promotion
To resolve this, we have implemented **Hardware Acceleration** across all primary UI surfaces. This offloads the rendering from the CPU to the GPU.

### Key CSS Properties Used:
*   `transform: translateZ(0)` / `transform-gpu`: Forces the element into its own "Compositing Layer" on the graphics card.
*   `will-change: transform`: Hints to the browser that an animation is coming, allowing it to pre-calculate the layer.
*   `backface-visibility: hidden`: Prevents "flicker" in Chromium-based engines (Electron) during 3D-accelerated moves.
*   `-webkit-font-smoothing: antialiased`: Ensures text remains sharp when its parent layer is being transformed.

---

## 3. Implementation Map

### Global Containers (`index.css`)
We promote the main structural layers to ensure scrolling and backdrop-blurs don't impact the main thread:
```css
aside, main, .custom-scrollbar {
  will-change: transform;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
}
```

### Content Components
*   **Mod Cards**: All card variants (`CharacterCard`, `GbModCard`, `LibraryModCard`) use GPU transforms to keep portraits sharp during hover scales.
*   **View Shells**: `AppViewShell` and `PageStackRenderer` use these hints to ensure "Push/Pop" transitions are 144Hz smooth.
*   **Image Gallery**: The `ImageLightbox` and `ModDetailPage` hero grid are accelerated to handle high-resolution assets without stutter.

---

## 4. Performance Standard for Future Components
When adding new interactive elements (especially those with `scale` or `blur`), follow this standard:

1.  **Add the Utility Classes**:
    Use `will-change-transform transform-gpu backface-hidden antialiased`.
    
2.  **Use the Dev Monitor**:
    Check the **Engine Performance** panel (bottom-left) to ensure:
    *   **FPS** stays near your monitor's refresh rate (60/120/144) during interaction.
    *   **RAM** usage doesn't spike significantly (VRAM usage isn't visible here, but excessive layers will eventually impact JS heap).

3.  **Test on 1080p**:
    Always verify that scaling images doesn't result in "jagged" edges on standard DPI screens.
