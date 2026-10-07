# Hair Transplant Simulator (MVP)

A browser-based tool for hair transplant consultations:

1. **Photos** – upload front (required), top, back/crown, left and right profile photos.
2. **Graft plan** – pick the Norwood stage and graft count, then split grafts across the hairline/frontal, mid-scalp and crown regions. Shows estimated density (grafts/cm²) per region against typical targets.
3. **Hairline design** – shape each treatment zone on every photo. Use the hairline templates (rounded, straight, widow's peak, mature), drag the handles, set the hair direction and how soft the edge is, and pick the hair colour from the photo.
4. **Results** – before/after slider, growth timeline (3 / 6 / 9 / 12+ months), new random variations, and PNG export of a side-by-side comparison.

All processing happens in the browser. Photos are never uploaded, so the app can be hosted as a static site with no backend.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
```

Deploy: push to GitHub and import the repo in Vercel (no environment variables needed).

## How the simulation works

- `lib/planning.ts` – Norwood area estimates, graft allocation, density and rating maths.
- `lib/render.ts` – procedural hair renderer. The number of strands in each zone comes from the region's density × the zone's area (assuming the photo spans about 30 cm, adjustable with the per-view "Hair scale"). Edges are feathered irregularly, edge hairs are finer, frontal hair fans outward and crown hair grows in a whorl, and the scalp under the strands is tinted.
- `lib/geometry.ts` – smooth closed curves (Catmull-Rom splines), hit-testing and area.
- `components/` – wizard steps, the SVG zone editor and the before/after viewer.

## Known MVP limitations / next steps

- Zones are placed manually; automatic face and scalp landmark detection (e.g. MediaPipe Face Mesh) could place the hairline automatically.
- The same region drawn on several photos is styled separately for each photo.
- The rendering is procedural, not AI-generated. A diffusion inpainting pass could make results photorealistic.
- No saving or accounts yet; refreshing the page clears the session.
- HEIC photos only work in browsers that can decode them (Safari).
