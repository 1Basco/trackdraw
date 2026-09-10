# Whoop PVC Frames

TrackDraw's obstacle model was shaped around outdoor 5-inch racing: MultiGP-style gates, ladders, towers, and banners measured in feet. Indoor whoop (65–75 mm) racing builds its course from a very different kit: 20 mm PVC electrical conduit cut to 60 cm, joined with socket fittings (elbows, tees, crosses, 5-ways). A whole gate weighs a few hundred grams and a club kit is a bag of tubes and a box of fittings, so the interesting questions become "how many tubes and which fittings" and "what can I snap onto what I already built" rather than "which official gate is this".

This document records the product direction and the model that shipped as the `pvcframe` track item, ported from the RaceGoW Track Maker prototype (a Godot sandbox built around the same kit).

## Product Shape

- One PVC frame is one TrackDraw shape. A frame is a set of tubes on a cubic lattice; the shape position is the centre of its ground footprint and it rotates, snaps, groups, numbers, and exports like every other item.
- Frames are catalog-backed. Nine starter templates (arch gate, square gate, tall arch, double arch, dive gate, turn post, flag post, tower, slalom pair) live in the element catalog under the PVC Frame tool, and the type picker switches between them in place.
- Snap-on build: with a single frame selected, the 2D canvas shows handles around every joint of the active build level. Green `+` adds a horizontal tube into an empty socket direction, blue `↑` stands a tube on the joint, red `×` removes the tube it sits on. The build level lives in the inspector so stacked structures can be edited row by row. A frame edited this way drops its template identity and becomes a generic PVC Frame.
- Frames snap joint-to-joint. Dragging a frame near another frame with a compatible lattice (same pitch, rotation differing by a multiple of 90°) snaps one of its joints onto the other frame's joint instead of the 1 m field grid; frames ignore the grid and centre snapping entirely, and Alt/Shift still drags freely. Dropping a frame while snapped onto a shared joint merges the two into one frame (one undo step), so a structure can grow by placing templates against each other.
- Grid snapping is a separate switch. The 1 m field grid is useless at whoop scale, so the status bar (and mobile View panel) expose a Grid toggle next to Snap: with grid off, path clicks and drags stay free but still snap to object centres, route points, and PVC joints.
- A design carries a track class (`standard` or `whoop`, stored as `trackClass`). The whoop profile in `src/lib/track/track-class.ts` shrinks every metre-scale editor distance: pointer snap radius (1 m → 0.2 m), loop-close radius (0.9 m → 0.25 m), close-point and rhythm review thresholds, generated-route approach distances, default race line width and arrow spacing, the minimum field size, the 3D grips and selection marker, the 2D waypoint pucks, arrows, and draft-route strokes (pucks also stop growing with zoom), and the closest orbit-camera distance. Switching to whoop also drops the grid to 0.5 m.
- Exports of whoop designs include obstacle spacing: `getObstacleSpacing` walks the numbered obstacles along the primary route (closing the loop for closed routes) and reports centre-to-centre distances, drawn as dashed dimension lines on the SVG/PNG map and tabulated in the Race Pack build sheet. Standard designs can opt in through the `includeObstacleSpacing` export option.
- Materials are always derived from the tubes, never authored. The inspector shows tubes, fittings by class, and feet for the selected frame; the project layout view sums them across the whole track.

## Kit Geometry

Tube and fitting dimensions are stored per frame so a club with 25 mm conduit or 50 cm cuts can still use the same model. Defaults follow the common 20 mm kit:

| Value                         | Default |
| ----------------------------- | ------- |
| Tube length                   | 600 mm  |
| Pipe outer diameter           | 20 mm   |
| Socket depth                  | 21 mm   |
| Fitting centre to socket face | 26 mm   |

The lattice pitch is derived, not invented. A tube disappears into the fitting socket, so the node-to-node spacing is `tube + 2 × (centreToFace − socketDepth)` = 610 mm, not `tube + fitting size`. The visible tube between two fittings is 558 mm, and the clear opening of a one-cell window is also 558 mm (about 22 in). The inspector shows the opening because it is the number a pilot cares about; a 24 in "nominal" gate would fail a tape measure.

## Lattice And Joints

An edge is `{ x, y, z, axis }`: the lower lattice node plus the axis the tube runs along. `x` runs across the frame, `y` into the depth (canvas down at rotation 0), `z` up. Edges below ground are rejected and the frame always keeps at least one tube.

Fittings are never authored. Each node collects the six socket directions its tubes occupy, and rotating the 64 possible masks through the 24 cube rotations leaves exactly ten joint classes, identified by (socket count, full-axis count):

| Sockets | Full axes | Class       | Common part            |
| ------- | --------- | ----------- | ---------------------- |
| 0       | –         | empty       | –                      |
| 1       | –         | stub        | free end (foot or tip) |
| 2       | 1         | straight    | coupling               |
| 2       | 0         | elbow       | 90° elbow              |
| 3       | 1         | tee         | tee                    |
| 3       | 0         | corner      | 3-way corner           |
| 4       | 2         | cross       | cross                  |
| 4       | 1         | side outlet | side-outlet tee        |
| 5       | –         | five-way    | 5-way                  |
| 6       | –         | six-way     | not buildable          |

A stub on the ground is a foot. Only the six-way joint is flagged as unbuildable; the inspector warns when a frame needs one.

## Whoop Pack Export

Race Pack was written for a 5-inch club race day: obstacle stock, timing points, and a setup sequence. A whoop crew asks different questions — where does the lap start, how far apart are the frames, and how many tubes and fittings does the bag need — so the whoop course gets its own export next to it (`src/lib/export/exportWhoopPack.ts`).

One action produces one ZIP, entirely in the browser and without an account. There is no PDF: a phone in a gym opens a PNG faster than a document, and a parts list is more useful as text that can be pasted into a shopping list.

| Entry                                                                                            | What it is                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route-map.png`                                                                                  | A print-resolution route map of the track: obstacle numbers, route-order spacing, structure gaps, and the lap-start marker (`src/lib/export/svg/lap-start.ts`).                                      |
| `view-top-left-route.png`, `view-top-right-route.png`, `view-bottom-right-route.png`             | Three corner renders with the race line and direction arrows.                                                                                                                                        |
| `view-top-left-obstacles.png`, `view-top-right-obstacles.png`, `view-bottom-right-obstacles.png` | The same three corners with the route hidden, for the build crew.                                                                                                                                    |
| `route-flythrough.gif`                                                                           | A looping animation of a whoop flying the lap through the obstacles.                                                                                                                                 |
| `bill-of-materials.md`                                                                           | Overview, tubes by cut length, fittings by class, feet, the six-socket warning, the obstacle stock check, the route-order spacing table, the structure-gap table, an archive index, and build notes. |
| `bill-of-materials.csv`                                                                          | The same rows in a fixed `section, item, quantity, available, missing, distance, edge gap` layout.                                                                                                   |

The lap-start marker stays opt-in for the field export too, through `designToSvg`’s `includeLapStart` option, so the ordinary 2D exports are unchanged. A design without a race line simply gets the map, the three obstacle-only views, and the bill of materials, and the export returns a warning explaining what is missing.

### The ZIP Writer

There is no archive dependency in the project, so `src/lib/export/zip/` writes ZIP files directly. Every entry uses the STORE method: PNG and GIF are already compressed, and the two text files are a few kilobytes, so a DEFLATE implementation would add code for no useful saving. That leaves three record types — local file header, central directory header, end-of-central-directory — plus a CRC-32 table (`crc32.ts`). Filenames are UTF-8 with general-purpose bit 11 set. The unit tests parse the produced bytes back with an independent reader and a table-free CRC, so a passing test means the archive is a real ZIP rather than merely self-consistent.

### Framing: The Track, Not The Field

A whoop course is often a small loop in one corner of a hall, so framing the whole field wastes most of every image on empty floor. `src/lib/export/whoop-pack/track-extent.ts` boxes what is actually placed — item footprints plus every race-line waypoint, labels excluded as annotation — adds a 10% margin, grows a degenerate box to a usable minimum, and clamps the result to the field. It also reports the height of the tallest item, which the cameras need. Everything in the pack fits that box: the corner cameras, the animation camera, and the 2D map.

### The Route Map

The map is **not** the field export cropped. `designToSvg` renders at the design's own pixels-per-metre, which is tuned for the editor canvas: at 20 px/m a 5 x 8 m whoop track crops to roughly 140 x 180 px, and every badge, pill and caption (sized in fixed pixels) ends up covering the obstacles. `src/lib/export/whoop-pack/render-map.ts` inverts that. The output size is chosen first (1600 px on the long side, capped at 2000), the scale follows from it (`ppm = (longSide - 2 x padding) / extent`, with 7% padding), and every annotation is a share of the image: badges at ~1.2% of the long side, pill text at ~1.1%, grid and dimension strokes in proportion. The race line's stroke is treated as annotation rather than as its 0.2 m design width, which would otherwise become a 30 px band at the map's much higher scale.

Shapes and annotations still come from the shared renderers (`shapeToSvg`, `obstacleNumbersToSvg`, `obstacleSpacingToSvg`, `structureGapsToSvg`, `lapStartToSvg`), each of which now takes an optional `scale` that defaults to 1, so the standard SVG/PNG exports and Race Pack render exactly as before. The title, field size and date sit in their own band **below** the drawing area rather than over the track, with a scale bar in the bottom-left padding, and the lap-start caption is placed in the padding band above the track with a leader line back to the marker, so it can never cover an obstacle.

### Camera Fit

`src/lib/export/whoop-pack/corner-views.ts` keeps the camera maths free of three.js so it can be unit tested. A bounding-sphere fit is easy but loose: a sphere wastes the space in its corners, and for a long, low track that is most of the picture. Instead the eight corners of the extent box (floor to tallest item) are projected through a pinhole model and the distance is bisected until the box fills 90% of the frame. For a 6.8 x 4.5 m track that is 10.1 m instead of the 12.2 m a sphere fit with an 8% margin would give, so the track reads about 20% larger. Each pose reports its `distance`, which is what sizes the drone.

Three of the four corners (top-left, top-right, bottom-right) sit at that distance on a 27° elevation, all aimed at the extent centre. The animation uses the same helper at a 36° elevation and a fixed 45° azimuth.

The renders themselves (`render-views.ts`) reuse `createFlythroughSurface` and `addFlythroughShapes`, so the pack shows exactly the materials, textures and PVC frames the fly-through video and 3D preview show. The race line lives in its own group, which is toggled between the two passes instead of rebuilding the scene.

### Structure Gaps

Route-order obstacle spacing answers "how far apart are consecutive obstacles along the lap". A build crew asks a different question: "how far apart do these two things stand" — and two unconnected structures that are never consecutive on the route would otherwise carry no measurement at all.

`src/lib/track/structure-gaps.ts` answers it. Every shape except polylines and labels is one structure (a merged PVC frame is a single shape, so a single structure), and the gaps are the edges of a minimum spanning tree over the structure centres: `n - 1` lines, every structure connected to its nearest neighbours, no `n²` clutter. Each edge reports the centre-to-centre distance and the edge-to-edge gap — the closest approach between the two rotated footprint rectangles, zero when they touch. Footprints come from `getPvcFrameLocalFootprint` for frames and from the `shape2d` helpers for everything else, measured at a high pixel density so their minimum-pixel clamps become negligible and the result is effectively metres.

The gaps are drawn in a cool second colour so they never read as the amber route spacing: dashed dimension lines with a label pill on the 2D map (`src/lib/export/svg/structure-gaps.ts`, opt-in through `includeStructureGaps`), and dotted ground lines with billboard sprite labels in both 3D passes (`src/lib/export/whoop-pack/structure-gap-overlay.ts`). Both label the edge gap, falling back to the centre distance where a footprint is unknown. `bill-of-materials.md` and `.csv` list them with both numbers, naming each end by its obstacle number when it has one and by kind plus a short id when it does not.

### Lap Animation And The GIF Encoder

The animation (`render-gif.ts`) shows the obstacles the drone flies through — the same `addFlythroughShapes` renderers as the 3D views — over a faint ground grid, with the smoothed race line from `getPolylineCurve3Derived` and a few direction arrows kept subtle. A procedural whoop (four ducted props, a small frame, a bright nose) flies the line, drawn oversize so it stays visible. Its size is 2.5% of the frame width at the camera’s target distance, so tightening the camera shrinks the model by the same proportion; on a layout with PVC frames it is additionally capped at 60% of a 558 mm opening, and it rides above the race line, so it can never swallow the frame it is flying through. The loop is 6–10 s at 12 fps at 720x450 from a fixed three-quarter camera.

There is no GIF dependency in the project either, so `src/lib/export/gif/` implements GIF89a directly: a median-cut quantiser over a 5-bit colour cube, the classic variable-code LZW compressor, and a writer that emits a Netscape loop block. Two decisions keep the file shareable:

- **One global palette** for the whole animation, built from a handful of sampled frames. The renderer then indexes each frame as it is captured, so only 8-bit index buffers are held in memory instead of every RGBA frame.
- **Changed-rectangle frames**: after the first frame, only the bounding box of the pixels that differ is encoded, with disposal method 1. Everything but the drone is static — obstacles included — so later frames still cost a few kilobytes each.

## Ported From RaceGoW

Ideas kept from the prototype:

- Derived pitch and opening instead of nominal sizes.
- Edge-list templates whose cost is always computed, so a card can never advertise the wrong tube count.
- The ten-class joint table and the rule that empty/stub nodes consume no part.
- Building only from tubes that already exist, the way a kit is assembled on the floor.
- Never renormalising lattice coordinates: extending a frame towards −x keeps every existing tube in place by compensating the shape origin.

Deliberately not ported yet:

- Kit stock allocation (Hall-theorem shortfall reporting, substitutions such as a tee standing in for a coupling). TrackDraw's inventory currently counts obstacles per kind; a tube/fitting stock profile would need a design schema addition.
- Whoop-specific validation (minimum flyable opening, path and frame clearance) and stability checks.
- Named room walls and tape-measure setup sheets. TrackDraw's field, map reference, and Race Pack already cover placement handoff.

## Boundaries

- Keep saved frames meter-based and lattice-integer; do not store derived pitch or fitting lists in the design.
- Do not turn individual tubes into separate shapes. Cross-shape fitting derivation and rigid multi-shape transforms would reintroduce the problems the composite model solves.
- Keep official MultiGP catalog behaviour untouched; PVC frames are a TrackDraw-provided generic family with editable kit dimensions.
