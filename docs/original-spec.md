# sobosuba (Godot 4.7.2) - original game spec

## 1. Scope, method and conventions

This document describes the ORIGINAL sobosuba game, version 1.2.3, from the GDRE-recovered Godot project (`project.godot`, `config/version`).
It is written so a web recreation can match the original.
Every fact names the source file it came from, in backticks, relative to the recovered project root.
Where both a script default and a scene value exist, the scene (.tscn) value is the one that applies, and the text says which was used.
Units are stated on every number: px are Godot 2D world units, s is seconds, px/s is speed, px/s2 is acceleration, and "N" means the value passed to `apply_force`.
Every sobo body (suba) has mass 1.0 kg, so a force of N on a suba is an acceleration of N px/s2 (`game_elements/sobo/suba/suba.tscn`, mass not overridden, RigidBody2D default 1.0).
GDScript is not copied.
Behaviour, constants and formulas are given instead.
Y grows downward, as in Godot 2D.
All coordinates are world coordinates of the mode scene root, whose origin is the middle of the play field, unless stated.
Anything that cannot be known from the source is listed in section 18.
Section 19 is intentionally empty for the orchestrator.

### 1.1 Vocabulary

A "suba" is one small circular physics body (RigidBody2D) (`game_elements/sobo/suba/suba.gd`).
A "sobo" is one blob: a closed ring of subas plus one heavy centre body called the extra mass ball (`game_elements/sobo/sobo.gd`).
"size tier" n is an integer 0 to 19.
"doubling tier" (the number printed on the blob) is 2^n (`game_elements/sobo/sobo_manager.gd`, `precompute_sobo_datas`).
"the bar" is the float bar, a horizontal spring line at y = -240 px (section 8).
"stack" is every sobo that is not on the bar.

## 2. Project and physics settings

Source for this section: `project.godot` unless stated.

Physics engine is the Godot default 2D engine (no `physics/2d/physics_engine` override in `project.godot`).
Physics ticks per second is not set in `project.godot`, so it is the engine default 60 ticks/s.
`application/run/max_fps` is 60 fps.
VSync mode is 0 (disabled), `display/window/vsync/vsync_mode`.
Default 2D gravity is 0.0 px/s2 (`physics/2d/default_gravity`).
So there is NO global gravity.
Gravity comes only from the classic mode's GravityArea, section 2.2.
Default linear damp is 0.2 per second (`physics/2d/default_linear_damp`), applied to every RigidBody2D that does not override it.
Default angular damp is not set (engine default).
It does not matter because every suba has `lock_rotation = true` (`game_elements/sobo/suba/suba.tscn`).
Solver iterations, contact bias, sleep thresholds and similar are not set in `project.godot`, so engine defaults apply and they are not knowable from this source.
Renderer is "mobile" (`rendering/renderer/rendering_method`), MSAA 2D quality value 1.
Display viewport is 512 x 720 px, window override 1280 x 720 px, stretch mode `canvas_items`, aspect `keep_height`, and on mobile aspect `expand` (`display/window/size/*`, `display/window/stretch/*`).
Handheld orientation value is 1 (portrait).

### 2.1 Physics bodies

Suba (`game_elements/sobo/suba/suba.tscn`, `suba_circle.tres`):
- Shape is a circle of radius 12.0 px (`suba_circle.tres`).
- Mass 1.0 (default, not overridden).
- Physics material friction 0.0; bounce is the default 0.0.
- `lock_rotation = true`.
- `contact_monitor = true`, `max_contacts_reported = 8`.
- Collision layer value 1026 (layers 2 "suba" and 11 "gravity_suba") and mask value 99 (layers 1 "structure", 2 "suba", 6 "entering_suba", 7 "danger_bumper").
- Linear damp is the project default 0.2 per second.

Extra mass ball (`game_elements/sobo/sobo.tscn`):
- RigidBody2D with a circle of radius 16.0 px.
- Collision layer 1152 (layers 8 "extra_mass_ball" and 11 "gravity_suba"), collision mask 0 (collides with nothing).
- Mass set per tier at creation (table in 5.2).
- Linear damp default 0.2 per second.

Structure walls (`game_elements/structure/structure_inverted_poly.gd`, `structure_inverted_poly.tscn`, `structure_phys_mat.tres`):
- Static body with collision layer 1 (default), collision mask 0.
- Physics material friction 0.1.
- One infinite half-plane `WorldBoundaryShape2D` per polygon edge, placed at the edge midpoint, so the playfield is the exact polygon interior.
- The visual polygon is expanded by the style's `collider_gap` (2.0 px for every built-in style) but the collision is at the exact polygon edge.

How friction and bounce combine in contact is engine behaviour and is not in the source.
Suba to suba contact has friction 0.0 on both sides.
Suba to wall contact is 0.0 on the suba side and 0.1 on the wall side.

### 2.2 Gravity

The classic mode contains a GravityArea (`game_mode/mode_classic/mode_classic.tscn`, `game_elements/gravity/gravity_area.tscn`).
It is an Area2D with a 2048 x 2048 px rectangle centred on the mode origin.
Gravity value is 150.0 px/s2 (scene value).
Gravity direction is the default (0, 1), straight down.
`gravity_space_override = 3` which is Replace, and priority is 1.
The classic scene overrides its collision mask to 1024 (layer 11 "gravity_suba"), scene value used.
The script-scene default mask was 130; the mode scene overrides it.
Every suba and every extra mass ball has layer 11, so all of them feel 150.0 px/s2 downward.
Danger bumpers (layer 7) do not.
The area is hidden (`visible = false`) but still active.

## 3. World, camera and layouts

### 3.1 Classic desktop layout

Source: `game_mode/mode_classic/mode_classic.tscn`.

Play field polygon (the StructureInvertedPoly `polygon`, scene value): (-296,-320), (296,-320), (296,256), (232,320), (-232,320), (-296,256), all px.
That is a 592 px wide, 640 px tall rectangle centred at the origin with 64 px bevels on both bottom corners.
The `Layout` node says size (592, 640) px and bevel 64 px, which agrees (`mode_classic_layout.gd` only edits geometry in the editor; at runtime the baked polygon is used).
The outline (cosmetic) is a closed Line2D of width 24 px in the structure colour, offset outward.
World play area used by the camera is a rectangle from (-328,-360) to (328,360), so 656 x 720 px.

Float bar: a Node2D at (0, -240) px.
It is a pure force field along the horizontal line y = -240 px (section 8).

Sides.
Left side root is at (0,0).
Right side root is at (0,0).
Each side holds a ray detector, a collision reenabler, a danger bumper, gauges and a portal line.
Positions (local to side root, which is the origin on desktop):

| thing | left | right | source |
|---|---|---|---|
| spawn point / RayDetector | (-360,-240) px | (360,-240) px | `mode_classic.tscn` |
| ray target_position | (808, 0) px | (-808, 0) px | `mode_classic.tscn` |
| detection marker | (280, 0) px from the detector, so world x = -80 px | (-280, 0) px, so world x = 80 px | `mode_classic.tscn` |
| collision reenabler position | (-360,-240) px | (360,-240) px | `mode_classic.tscn` |
| reenabler shape | rectangle 184 x 592 px, offset (-28, 232) px from the reenabler, so it covers x -480 to -296 px, y -304 to 288 px | rectangle 152 x 592 px, offset (12, 232) px, so it covers x 296 to 448 px, y -304 to 288 px | `mode_classic.tscn` |
| reenabler collision mask | 32 (layer 6 "entering_suba") | 32 | `mode_classic.tscn` |
| portal line | x = -296 px, y -304 to -176 px (points (0,-64) to (0,64) at (-296,-240)) | x = 296 px | `mode_classic.tscn` |
| danger bumper | (-328,-112) px | (328,-112) px | `mode_classic.tscn` |
| danger gauge | (-308,-112) px, rotated 90 degrees | (308,-112) px | `mode_classic.tscn` |
| ray gauge | (-232,-332) px | (232,-332) px | `mode_classic.tscn` |

The spawn points are 64 px OUTSIDE the field walls (walls are at x = -296 and 296 px).
Ray detector details (`game_elements/ray_detector/ray_detector.tscn`, `ray_detector.gd`): the detector has two RayCast2D nodes with the same target.
The first has collision mask 2 (all subas) and `hit_from_inside = true`.
The second ("BarRayCast2D") has mask 256 (layer 9 "bar_suba") and `hit_from_inside = true`.
Both are disabled in the scene and are updated manually once per physics tick with `force_raycast_update`.
The ray therefore runs along the line y = -240 px, horizontally, from outside the wall across the whole field.
Detection distance is the straight distance from the detector to the detection marker, 280 px on desktop.

Clutterer (optional start clutter, `game_elements/clutterer/clutterer.tscn`): at (0,256) px with a 592 x 256 px rectangle offset (0,-64) px, so it covers x -296 to 296 px, y 64 to 320 px.

Active sobo markers: small circles drawn at y = -320 px (the top wall) under each selectable sobo's x (section 9.5).

One-way structures: the project has a OneWayStructure scene (`game_elements/structure/structure_pieces/one_way_structure.tscn`) but no classic layout instance uses it.
The classic mode has no one-way structures, no other internal walls, and no pegs.
The only solid world geometry in classic is the six-sided polygon above.

DangerBumperStaticBody: a StaticBody2D at (0,-80) px with collision layer 0 and mask 0, used only as the second body of the bumper groove joints (`mode_classic.tscn`).

### 3.2 Classic mobile layout

Source: `game_mode/mode_classic_mobile/mode_classic_mobile.tscn`, which inherits the desktop scene and overrides these values.

Play field polygon (scene value): (-196,-320), (196,-320), (196,240), (148,288), (-148,288), (-196,240) px.
That is 392 px wide, 608 px tall, bevel 48 px (`Layout` node: size (392, 608), bevel 48).
World play area is from (-218,-344) to (218,311), so 436 x 655 px.
Left side root is at (-16, 0) px and right side root at (16, 0) px, so world positions below include that offset.

| thing | left (world) | right (world) |
|---|---|---|
| spawn point / RayDetector | (-260,-240) px | (260,-240) px |
| ray target_position | (488, 0) px, so the ray ends at world x = 228 px | NOT overridden, so it stays (-808, 0) px, ending at world x = -548 px |
| detection marker | (196, 0) px from the detector, world x = -64 px | (-196, 0) px, world x = 64 px |
| reenabler position | (-260,-240) px | (260,-240) px |
| reenabler shapes | same rectangles as desktop (184 x 592 px left, 152 x 592 px right), now covering x -380 to -196 px (left) and 196 to 348 px (right) | |
| portal line x | -196 px | 196 px |
| danger bumper | (-228,-112) px | (228,-112) px |
| danger gauge | (-208,-112) px | (208,-112) px |
| ray gauge | (-132,-332) px | (132,-332) px |

The float bar is still at (0,-240) px on mobile (not overridden).
Clutterer is at (0,272) px on mobile.
The spawn pool unlock list is shorter on mobile (section 7.2).
Mobile has no other differences in physics constants (the inherited scene values apply).

### 3.3 Camera

Source: `main/cam.gd`, `main/main.tscn`, `ui/ui.gd`.

The camera is a Camera2D with a critically-damped spring feel.
Initial scene zoom is 2.395 (`main.tscn`).
At game start the manager sets zoom to 3.0 and angular velocity to +-20 rad/s (random sign), then the spring brings it to the target (`game_mode/game_mode_manager.gd`).
Target zoom = min(UiPlayArea width / world play area width, UiPlayArea height / world play area height) (`cam.gd`, `refresh_play_area_fit`).
The target position centres the world play area in the UI play area frame.
Position spring: acceleration 150.0 per second squared times offset, velocity damping 12.0 per second.
Rotation spring: stiffness 150.0, damping 12.0, target 0 rad or pi rad when "flipped camera" is on.
Zoom spring: stiffness 100.0, damping 10.0.
The frame delta used is clamped to 1/15 s.
Vibration decays at 8.0 per second and is applied as a random circle offset.
Feel events (all scaled by the user's "screen push" and "screen shake" settings, default 1.0 each):
- Merge: vibrate by 0.0001 times the old sobo's outer area (`sobo_manager.gd`).
- Shockwave: zoom velocity push of -0.3 times shockwave life, and a position push of 300 times life toward the camera (`game_elements/shockwave/shockwave.gd`).
- Launch: position push of 8.0 times total sobo mass in the launch direction (`mode_classic.gd`).
- While aiming: continuous push of -1.0 times total mass along the aim vector and vibration of 0.02 times arrow length per second (`mode_classic.gd`, `launch_arrow.gd`).
- Pre-game-over: vibrate 20.0 (`mode_classic.gd`).

### 3.4 Screen layout on desktop and mobile

Source: `ui/ui.tscn`, `ui/ui.gd`.

The UI is a CanvasLayer with a MainHBox: LeftSidePanel, MainVBox (min width 512 px), RightSidePanel.
MainVBox holds, top to bottom: MobileTopPanel (min height 128 px, mobile only), UiPlayArea (expands), Menu, MobileBottomPanel (min height 48 px, mobile only).
UiPlayArea's minimum size is the mode's world play area size, 656 x 720 px on desktop and 436 x 655 px on mobile.
At a 1280 x 720 px window the desktop camera zoom is therefore 1.0.
Side panels share the leftover width equally.
Details of side panels and menus are in section 14.

## 4. Collision layers

Source: `project.godot` `[layer_names]`, `main/layer.gd`.

| layer | bit value | name | used for |
|---|---|---|---|
| 1 | 1 | structure | walls |
| 2 | 2 | suba | every suba |
| 3 | 4 | queue_wall | unused in classic |
| 4 | 8 | viscous_suba | heave mode |
| 5 | 16 | danger_suba | unused in classic |
| 6 | 32 | entering_suba | a suba that is still outside the wall, entering the field |
| 7 | 64 | danger_bumper | the two bumpers |
| 8 | 128 | extra_mass_ball | the heavy centre bodies |
| 9 | 256 | bar_suba | subas of sobos currently on the bar |
| 10 | 512 | sobotris_fallen_suba | sobotris |
| 11 | 1024 | gravity_suba | subas and extra mass balls, selects what gravity affects |

Danger bumper rigid body: layer 64, mask 34 (layers 2 and 6) (`game_elements/danger_bumper/danger_bumper.tscn`).
So bumpers collide with ordinary subas and with entering subas, and nothing else.

## 5. The sobo model

Source: `game_elements/sobo/sobo.gd`, `sobo_manager.gd`, `sobo.tscn`, `suba/*`, `sobo_label.gd`, `sobo_outline/sobo_outline.gd`, `main/background`.

A sobo is NOT built from joints or springs between bodies, and it is not a single rigid body.
It is a closed ring of free circular rigid bodies (subas) held together by two force models that run every physics tick: skin preservation and area preservation.
A heavy invisible-collision centre body (the extra mass ball) is tied to the ring centre by a spring and carries most of the mass.

### 5.1 Size tiers and geometry

Rules (`sobo_manager.gd`, `precompute_sobo_datas`; 20 tiers, n = 0 to 19):
- Value shown = 2^n.
- Target outer area = 3700 px2 times 1.26^n.
- Target outer radius = sqrt(area / pi).
- Target inner radius = target outer radius minus the suba radius 12.0 px.
- Rest spacing between neighbouring subas: `dist_between_subas` = (2 x 12.0 px) x (1 - 0.333333) = 16.000008 px (`SUBA_OVERLAP` = 0.333333).
- Inner circumference = 2 x pi x inner radius, then snapped to the nearest multiple of 16.000008 px (snappedf).
- Inner radius is then recomputed from the snapped circumference; outer radius = inner radius + 12.0 px.
- Suba count = round(snapped circumference / 16.000008).
- Subas start evenly spaced on a circle of the inner radius, first suba at angle 0 (pointing +x), stepping by 2 x pi / count.
- Target total mass = outer area / 350.
- Extra mass ball mass = target total mass minus suba count (so every suba is 1.0 and the ball makes up the rest).
- Flash duration = ln(100) x outer area / 60000 s (`flash_decay_rate` = 60000, from `sobo_manager.tscn` default).
- `total_merged_score` = value x (n + 1) exists in the data but is never read anywhere (unused).

### 5.2 Computed tier table

Computed from the rules above (not stored in the source).

| tier | value | outer radius (px) | inner radius (px) | suba count | outer area (px2) | inner area (px2) | total mass | extra ball mass | flash (s) |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 1 | 34.92 | 22.92 | 9 | 3831 | 1650 | 10.94 | 1.94 | 0.294 |
| 1 | 2 | 37.46 | 25.46 | 10 | 4410 | 2037 | 12.60 | 2.60 | 0.338 |
| 2 | 4 | 42.56 | 30.56 | 12 | 5690 | 2934 | 16.26 | 4.26 | 0.437 |
| 3 | 8 | 47.65 | 35.65 | 14 | 7133 | 3993 | 20.38 | 6.38 | 0.547 |
| 4 | 16 | 55.29 | 43.29 | 17 | 9604 | 5887 | 27.44 | 10.44 | 0.737 |
| 5 | 32 | 60.38 | 48.38 | 19 | 11455 | 7354 | 32.73 | 13.73 | 0.879 |
| 6 | 64 | 68.02 | 56.02 | 22 | 14536 | 9860 | 41.53 | 19.53 | 1.116 |
| 7 | 128 | 78.21 | 66.21 | 26 | 19216 | 13771 | 54.90 | 28.90 | 1.475 |
| 8 | 256 | 85.85 | 73.85 | 29 | 23153 | 17133 | 66.15 | 37.15 | 1.777 |
| 9 | 512 | 96.03 | 84.03 | 33 | 28973 | 22185 | 82.78 | 49.78 | 2.224 |
| 10 | 1024 | 108.77 | 96.77 | 38 | 37165 | 29417 | 106.19 | 68.19 | 2.853 |
| 11 | 2048 | 121.50 | 109.50 | 43 | 46376 | 37668 | 132.50 | 89.50 | 3.559 |
| 12 | 4096 | 136.78 | 124.78 | 49 | 58773 | 48913 | 167.92 | 118.92 | 4.511 |
| 13 | 8192 | 154.60 | 142.60 | 56 | 75091 | 63886 | 214.54 | 158.54 | 5.763 |
| 14 | 16384 | 172.43 | 160.43 | 63 | 93404 | 80856 | 266.87 | 203.87 | 7.169 |
| 15 | 32768 | 195.35 | 183.35 | 72 | 119884 | 105608 | 342.53 | 270.53 | 9.201 |
| 16 | 65536 | 218.26 | 206.26 | 81 | 149664 | 133660 | 427.61 | 346.61 | 11.487 |
| 17 | 131072 | 243.73 | 231.73 | 91 | 186624 | 168699 | 533.21 | 442.21 | 14.324 |
| 18 | 262144 | 274.29 | 262.29 | 103 | 236353 | 216125 | 675.30 | 572.30 | 18.141 |
| 19 | 524288 | 307.39 | 295.39 | 116 | 296848 | 274124 | 848.14 | 732.14 | 22.784 |

On the desktop field (592 px wide) a tier 14 blob (diameter about 345 px) already spans over half the width; larger tiers are not reachable in normal play but exist in the data.

### 5.3 Forces applied every physics tick

All of these run in `Sobo._physics_process` and only when the sobo is not frozen.
If the sobo is "blown up" (5.4) the shape is reset instead and no forces are applied that tick.

Skin preservation (`sobo.gd`, constants in the function body):
- Runs over every neighbouring pair (suba k-1, suba k) around the ring.
- Only acts when the pair is STRETCHED beyond 16.000008 px; it never pushes a compressed pair apart.
- Stretch = distance minus 16.000008 px.
- Force magnitude = (2300.0 x stretch + 9.0 x relative speed along the edge) x suba mass, where relative speed is the dot product of the velocity difference with the edge direction.
- Clamped to +-50000.0 N (`SKIN_FORCE_MAX`).
- Applied as equal and opposite forces along the edge on both subas (pulls them together).

Area preservation (`sobo.gd`):
- Signed polygon area of the ring (shoelace formula over the suba centres) is compared to the tier's rest inner area (table 5.2).
- Difference d = rest inner area minus current area (px2).
- Each suba gets a force of 0.75 x d x its outward unit normal x suba mass.
- The per-suba force vector is clamped to length 8000.0 N (`AREA_FORCE_MAX`).
- The average of all the per-suba forces is subtracted from every suba so the net force on the sobo is zero.
- Outward normal of a suba = spherical interpolation at 0.5 between the normals of its two adjacent edges; an edge normal is the edge direction rotated by -90 degrees.
- This acts like internal gas pressure: squashed blobs push outward on their whole ring, over-inflated blobs pull in.

Extra mass ball centering (`sobo.gd`):
- Force on the ball = (200.0 x (ring centre - ball position) + 15.0 x (ring average velocity - ball velocity)) x ball mass.
- The ring centre is the average of all suba positions.
- The same force, divided by the suba count and negated, is applied to every suba (Newton's third law).

Uniform helpers (`sobo.gd`): `set_velocity(v)`, `add_velocity(v)`, `apply_uniform_force`, `apply_uniform_acceleration` set or apply to all subas and the ball together.
Freezing sets all velocities to zero and freezes all bodies.

### 5.4 Blow-up and overlap safeguards

Blow-up detection (`sobo.gd`, constants named in code):
- A sobo is "blown up" if its signed ring area is <= 0, or above 1.8 times the rest inner area (`BLOW_UP_AREA_RATIO`).
- Or any position or velocity is not finite.
- Or the ball speed or any suba speed exceeds 2000.0 px/s (`BLOW_UP_MAX_SPEED`).
- Or any suba is farther than 3.0 times the inner radius from the ring centre (`BLOW_UP_RADIUS_RATIO`).
- Or any neighbouring pair is farther apart than 4.5 times 16.000008 px (`BLOW_UP_EDGE_RATIO`).
- Reset: every suba is placed on a circle of half the inner radius around the centre, at its base angle, with zero velocity, and the ball is placed at the centre with zero velocity.

Overlap recovery (`sobo_manager.gd`):
- Each physics tick it checks 1/60th of all subas (`OVERLAP_SCAN_FRAME_COUNT` = 60 ticks per full sweep).
- For each suba in contact with another sobo's suba, it tests whether the suba centre lies inside the other sobo's polygon.
- If so it starts a recovery for that sobo pair: the overlapping subas get collision exceptions with the other sobo's subas, and are pushed toward their own sobo's centre with a force of 200.0 px/s2 x mass (`overlap_recovery_acceleration`).
- If one sobo fully contains the other, the contained sobo is pushed away from the container's centre at 200.0 px/s2.
- A recovery ends when no overlapping suba remains inside the other polygon, restoring collisions, or after 3.0 s (`OVERLAP_RECOVERY_TIMEOUT`), when both sobos are shape-reset.
- A web recreation using a sane physics engine may not need this.

Self collisions: adjacent subas in the same ring never collide with each other (collision exception with the next suba), but non-adjacent subas of the same sobo can collide (`sobo.gd`, `exclude_adjacent_subas_self_collisions`).

Contact tracking (`suba.gd`): each suba tracks other-sobo subas it touches, and the subset of those with the same size tier (used by merging), plus non-suba contacts.
`has_external_contact` on a sobo is true while any suba touches another sobo or a wall/bumper (used by the air-merge achievement).

### 5.5 Drawing

Source: `sobo.gd`, `sobo.tscn`, `sobo_label.gd`.

- The sobo is drawn as a filled polygon through the suba centres, plus a closed round-jointed Line2D through the suba centres with width = 2 x 12.0 px - 2 x collider_gap - 0.5 px (so 19.5 px with the gap 2.0 px that every built-in style uses).
- Colour = current sobo palette colour for the size tier (palette index = tier modulo the palette length).
- While flashing, colour = colour lerped toward white by the flash value.
- Flash value starts at 1.0 on a merge result and falls as 1 - t^2 over the flash duration (t from 0 to 1) (`flash_decay`).
- During flash a dark circular "well" sprite (black, peak alpha 0.15, inner radius 0.5 x outer radius, falloff 128 px) is drawn behind the sobo (`DARK_WELL_*` constants, `dark_well.gdshader`).
- The value label is a Label with the font `ui/font/souba/souba_score.ttf` at size 15 px, centred on the extra mass ball, text = the value (2^n).
- Label colour = the style's background colour, lerped toward black by the flash value.
- Label alpha is 0.4 for a spawned (never merged) sobo and 1.0 for a sobo produced by a merge.
- The label rotation follows a spring toward the camera rotation: angular acceleration 100000 / outer area x angle difference, with damping 60000 / outer area per second.
- A new merge result gets a label spin of +-50 rad/s (random sign).
- Selection and hover outlines are a Line2D around the ring, width = sobo line width + 2 x thickness, in the style's `sobo_marker_color` (section 9.4).
- There are NO faces, eyes or textures on blobs.

## 6. Merge rules

Source: `game_elements/sobo/sobo_manager.gd` (`detect_merges`, `merge`), `game_mode/mode_classic/mode_classic.gd` (`on_sobo_merge`).

Eligibility.
Two sobos can merge if all hold:
- A suba of one is in contact with a suba of the other (physics contact, tracked by body_entered/exited).
- Both sobos have the same size tier.
- Neither is flashing (flash value 0.0), so a freshly merged blob cannot merge again for its flash duration (table 5.2, 0.29 s to 22.8 s).
- Neither has `merged_this_frame` set.
- Both have `allow_merges` true.
- A sobo on the bar that is still "emerging" has `allow_merges` false (section 7.4), so emerging sobos never merge.
- Merging can be globally disabled by a dev flag (`Dev.merging_enabled`, default true).

Selection each tick.
At most ONE merge happens per physics tick.
Among all eligible contacting pairs, the pair whose contact midpoint has the largest y (lowest on screen) is chosen.
The midpoint is the average of the two touching suba positions.

Result.
- A shockwave is created at the contact midpoint with life = old sobo outer area / 20000 s (`shockwave_life_per_sobo_area` = 20000, `sobo_manager.tscn` default).
- A merge sound plays at the contact point (volume or pitch depends on area; not analysed).
- The new sobo has size tier + 1 (so value doubles).
- The new sobo's ring is built by taking, from each old sobo, all its subas except the touching suba and the suba just before it, in ring order starting after the touching suba. The two chains are concatenated into one closed path; each carries its own position and velocity.
- The new ring's subas are resampled evenly along that path by arc length, and each takes the interpolated position and interpolated velocity at its point, so momentum is roughly preserved and the outline is the union outline.
- The new extra mass ball is placed at the average of the two old balls' positions, with the average of their velocities.
- New sobo flags: `merged = true` (it is a product of a merge), flash value 1.0, label spin +-50 rad/s.
- It starts with default collision layers and mask (the same as any sobo), `allow_merges` true.
- The two old sobos are freed at the end of the tick.
- Camera vibration of 0.0001 x old outer area is applied.
- The area-preservation force then inflates the new ring to the bigger tier's rest area over the next ticks.

Role of the result.
- If either old sobo was on the bar (emerging or selectable), the new sobo is put on the bar as selectable (so it can be launched).
- Otherwise it joins the stack.
- If either old sobo was being aimed or hovered, the aim/hover transfers to the new sobo.
- Score is recomputed (section 11).

## 7. Spawning

Source: `game_mode/mode_classic/mode_classic.gd`, `mode_classic_side.gd`, `game_elements/spawn_pool/*`, `game_elements/ray_detector/*`, `game_elements/collision_reenabler/*`.

### 7.1 When a sobo spawns

Per physics tick (`pp_spawning`):
1. `spawn_tick_delay` is decremented by 1.
2. If it is <= 0: the "preferred" side is the side OPPOSITE to the last side spawned on. If that side can spawn, spawn there. Otherwise, if the last-spawned side can spawn, spawn there. Otherwise nothing.
3. Every spawn sets `spawn_tick_delay` = 2 (`ticks_between_spawns`, scene default 2) and records the side, even if the pool turned out empty and nothing spawned.
4. The first spawn alternates starting with the right side (initial `last_spawned_side` is left, so the preferred side is right).

A side CAN spawn when both hold (`mode_classic_side.gd`):
- Its CollisionReenabler contains no entering suba (bodies_inside = 0).
- The ray from its spawn point finds no suba closer than the detection distance (280 px desktop, 196 px mobile): the first hit along the ray must be at least that far away, or the ray must hit nothing.

In effect a side is blocked while the previous blob has not yet crossed the wall, and while anything sits on the bar line within 280 px (desktop) of that side.
Because the ray hits the NEAREST suba (any sobo, stack or bar) along y = -240 px, a stack tall enough to cross y = -240 px near a wall also blocks that side.

### 7.2 Which tier

- Spawn tier = a uniformly random choice (`Rng.choose`) from the current spawn pool minus excluded tiers (`spawn_pool.gd`, mode RANDOM, the scene default).
- Excluded tiers are the two ray readings from that side: the size tier of the nearest suba hit by the first ray (mask 2, any sobo), and the size tier of the nearest suba hit by the bar ray (mask 256, bar sobos only). A miss gives -1 and excludes nothing (`ray_detector.gd`, `get_collided_size_tiers`).
- If the pool minus exclusions is empty, nothing spawns for that attempt.

The pool starts as every tier whose unlock requirement is 0.
`merges_required_to_unlock` for desktop classic is [0, 1, 3, 6, 10, 15, 21] (`spawn_pool.gd` default; the desktop scene does not override it).
The mobile scene overrides it to [0, 1, 3, 6, 10, 15] (`mode_classic_mobile.tscn`).
Index = tier, value = number of merges that must have RESULTED in that tier.
Initial pool is therefore tier 0 only (value 1) on both layouts.
Each merge increments a counter for the resulting tier (only for tiers still locked and inside the list); when the counter reaches the requirement that tier joins the pool.
So desktop spawns can be 1 to 64 (tiers 0 to 6) at most; mobile 1 to 32 (tiers 0 to 5).
Merge counters and the current pool are saved in the save file (section 15).
Larger tiers are never spawned, only made by merging.

### 7.3 Spawn action

`spawn_sobo_on_side`:
- The new sobo is created at the side's detector position (the spawn point (+-360,-240) px desktop, (+-260,-240) px mobile).
- It becomes "emerging": added to the bar, `allow_merges` = false, its subas get layer 9 (bar_suba).
- Its subas' collision with the structure (mask bit 1) is turned OFF and they get layer 6 (entering_suba), so it can fly in through the wall.
- Initial velocity = the unit vector from the spawn point to the bar centre (0,-240) px, times 400.0 px/s. This is purely horizontal toward the centre.
- The side's ray gauge flashes (white) for a normal spawn.
- Sobo spawn count is not limited.

### 7.4 Becoming selectable

When a suba leaves the side's CollisionReenabler (it crosses the wall line), the reenabler restores that suba's wall collision (mask bit 1 on) and clears its layer-6 flag (`collision_reenabler.gd`).
The mode then (`_on_collision_reenabler_body_exited`) counts the sobo's subas whose wall mask is still OFF, and makes the sobo "selectable" if that count is greater than half of its suba count.
Read literally, the check runs after the first suba has already been re-enabled, so the count is (n - 1) which is > n / 2 for any realistic n.
The practical result is that a sobo becomes selectable when its FIRST suba crosses the wall.
This looks like an inverted check in the original but it is what the code does.
Selectable means: `allow_merges` = true, it stays on the bar, it can be hovered and launched.

### 7.5 Safety spawn

Condition (`safety_spawn_condition`): both sides cannot spawn AND there is no sobo on the bar.
While the condition holds, a timer accumulates the physics delta; it resets to 0 the moment the condition is false.
When the timer reaches 3.0 s (`safety_spawn_duration`) a sobo is spawned on BOTH sides at once, ignoring the can-spawn checks, and each side's ray gauge shows the "danger" flash.
This also unlocks the achievement "praise the suncle" (section 13).
The timer progress is shown on both ray gauges as a "special" colour line.
The timer is inside the `spawn_tick_delay <= 0` branch so it only advances on ticks where spawning is allowed.

### 7.6 Start clutter

A setting "start clutter" (default off) fills the bottom of the field at game start (`game_elements/clutterer/clutterer.gd`).
One sobo is placed per physics tick until 128 are placed (`target`), trying up to 500 random points per tick in the 592 x 256 px area; at each point it picks the largest tier up to tier 4 that fits without overlapping.
Each clutter sobo joins the stack.

## 8. Float bar

Source: `game_elements/float_bar/float_bar.gd`, `float_bar.tscn`, `mode_classic.tscn`.

The float bar is a node at (0,-240) px with three tunables (script defaults; the classic scene does not override them): `freq` = 140.0, `damp` = (1.2, 3.0), `inwards_force` = 300.0.
Each physics tick, for EVERY suba of every sobo currently on the bar (emerging or selectable), the force applied (as `apply_central_force`) is:
- Vertical spring toward the bar line: 140.0 x (-240 - suba y), in px/s2 because suba mass is 1.0.
- Damping: -1.2 x vx horizontally and -3.0 x vy vertically (component-wise, from `Vector2 * Vector2`).
- Inwards push: 300.0 px/s2 toward x = 0 (the sign is that of the suba's x, so the push flips at x = 0 and is 0 exactly at x = 0).
These forces act on subas only; the extra mass ball is pulled along by its centring spring (5.3).
Gravity (150.0 px/s2 down) also applies.
Added to the global linear damp of 0.2 per second.
The result: sobos float in a row along y = -240 px, drift toward the middle, and bunch together in the centre.
Leaving the bar (launch, section 9) removes the sobo from the force list and removes the bar layer.
A sobo is removed from the force list when it is freed.

## 9. Input and launching

Source: `main/player_input.gd`, `mode_classic.gd`, `game_elements/launch_arrow.gd`, `ui/instructions.gd`.

### 9.1 Devices

Three gameplay devices: mouse, touch, gamepad (`player_input.gd`).
The active device auto-switches on the last input event type (touch on a screen touch, mouse on a mouse button with a real mouse device, gamepad on a joypad button or an axis past 0.25).
The settings have an input mode (auto, mouse, gamepad) that can force the choice.
Game input is accepted only when the tree is not paused, the menu is hidden and a mode is running.

### 9.2 Selecting a sobo

- Mouse: every physics tick, while not launching, the hovered sobo is the closest SELECTABLE sobo whose CENTRE is within 128.0 px of the cursor world position (`get_closest_sobo_center(cursor, 128.0, sobos_selectable)`).
- Only selectable sobos can be hovered or launched. Emerging sobos and stack sobos cannot.
- Touch has no hover; on touch-down, the closest selectable sobo with its centre within 128.0 px of the finger is selected. If none, nothing happens.
- On press the sobo is "launching": select sound at pitch scale 5000 / outer area, haptic 0.5.
- Hover plays a hover sound when the hovered sobo changes.
- Gamepad: the d-pad, the stick or the bumpers choose a neighbour in a direction along the bar (screen directions are rotated by the camera rotation); the aim stick starts aiming; triggers or a shoulder launch.

### 9.3 Aiming and launch math (mouse and touch)

Constants: arrow `max_length` = 220.0 px (`launch_arrow.gd` default, mode scene does not override it), `max_launch_velocity` = 850.0 px/s (`mode_classic.gd` default, scene does not override it).
On press: `initial_launch_offset` = (sobo centre) - (cursor position at press).
Every physics tick while launching:
- Start point p0 = the launching sobo's CURRENT centre (it keeps moving).
- End point p1 = the cursor world position + `initial_launch_offset`.
- Direction = unit vector from p0 to p1; magnitude = min(|p1 - p0|, 220.0 px).
- The normalised launch vector = (magnitude / 220.0) x direction, so its length is 0 to 1.
So the launch direction is the DIRECTION OF THE DRAG (the arrow points where you drag), it is not an inverted slingshot pull-back.
The arrow is drawn from the sobo centre along the vector scaled to 220 px.
The touch arrow tip is extended 32.0 px further.

Releasing the button (or lifting the finger) always launches the sobo, even when the vector is tiny or zero (see 9.4 for the one cancel case).
On launch:
- The sobo leaves the bar and becomes part of the stack (bar layer cleared, removed from bar forces).
- Velocity ADDED to every suba and the ball = normalised vector x 850.0 px/s (it adds to whatever velocity the sobo already had).
- Launch sound pitch scale 0.5 + 2.0 x vector length, volume linear 0.2 + 0.5 x vector length.
- Camera push of 8.0 x total mass in the launch direction.
- A signal fires (used by achievements and the instructions counter).
- After a launch with the mouse, the hover jumps to the closest selectable sobo within 512.0 px of the launched sobo; with touch, no hover.

A click that releases with a (near) zero vector therefore just DROPS the sobo off the bar into the stack.

### 9.4 Cancelling

- Right mouse button cancels an active aim (mouse only; cancel sound plays).
- Auto cancel (mouse and touch): once the vector length has gone above 0.25 once, if it later falls below 0.1 AND the sobo's average speed is below 40.0 px/s, the aim is cancelled (touch instructions say "drag back to center to cancel").
- Entering the pre-game-over state also cancels.
- Gamepad: releasing the aim stick to zero cancels without launching.

Hover and select outlines: hover thickness 4.0 px, select thickness 8.0 px (style fields `sobo_hover_outline_thickness`, `sobo_select_outline_thickness`, value 4.0 and 8.0 in all 28 built-in styles), colour `sobo_marker_color`.

### 9.5 Markers and hints

Active sobo markers: a small circle at (sobo centre x, y = -320 px) for each selectable sobo.
Radius 4.0 px normally, 8.0 px for the launching sobo, 4.0 px for the hovered sobo.
Alpha 0.5 normally, 1.0 for launching or hovered.
Instruction overlays (mouse, gamepad, touch) show until 4 launches with a vector longer than 0.25 have happened per device (`launches_to_hide_instructions` = 4), or never if the "show instructions" setting is off.
Texts: mouse: "left click and hold", "drag to aim", "release to launch", "right click to cancel launch", "or use gamepad"; touch: "tap and drag to launch", "drag back to center to cancel"; gamepad: "select", "or", "aim", "launch", "or use mouse".

## 10. Danger bumpers and game over

Source: `game_elements/danger_bumper/danger_bumper.gd`, `danger_bumper.tscn`, `danger_bumper_rigidbody.gd`, `game_mode/mode_classic/mode_classic.gd`, `danger_bumper_beam.gd`, `main/main.gd`, `main/pauser.gd`, `ui/side_panel/side_panel.gd`.

There is NO danger line in classic mode.
There are two bumpers, one outside each side wall (scene classes `danger_line` exist in the project but are not used by the classic scenes).

### 10.1 Geometry

Each bumper is a RigidBody2D with a circle collider of radius 64.0 px (`danger_bumper_circle.tres`), mass 10.0, rotation locked (`danger_bumper.tscn`).
Layer 64, mask 34 (collides with ordinary and entering subas only).
It is NOT affected by gravity (layer 7 not in the gravity mask).
In the demo build only, both bumper roots are moved to y = 15.0 px (`demo_bumper_y`), which makes the demo end much sooner; the full game uses y = -112 px.
Rest position (desktop): left (-328,-112) px, right (328,-112) px; mobile: (-228,-112) and (228,-112) px (sections 3.1 and 3.2).
Because the walls are at x = -296 and 296 px (desktop), the bumper circle sticks 32 px into the field at rest (edge at x = -264 and 264 px).
A GrooveJoint2D (length 32.0 px, initial offset 32.0 px, scene value; the script default 64.0 is overridden) ties it to the static body, restricting it to slide along the horizontal axis only, outward, from rest to 32.0 px away.
Push direction (outward): left (-1,0), right (+1,0) (the left joint is rotated +90 degrees in the mode scene, the right joint keeps the inherited -90 degrees).
Fully pressed position = rest + 32.0 px outward, where the circle's inner edge is flush with the wall line (x = -296 / 296 px desktop).
The bumper is drawn as a filled circle (style fill colour, radius 64 - gap - 1) with an 8 px ring (structure colour, radius 64 - gap - 4).
The bumpers have a dark marker colour (0.078, 0.078, 0.078) in the scene (not shown in play).

### 10.2 Spring

A return spring acts along the push axis every physics tick (`danger_bumper.gd`, script defaults used, scene does not override):
- Force = ((5.0 x (rest - position) projected on the push axis) + (7.0 x (-velocity) projected on the push axis)) x mass 10.0, i.e. acceleration 5.0 x displacement - 7.0 x speed, in px/s2.
- At the full 32.0 px press the restoring acceleration is 160.0 px/s2.
- The spring is heavily over-damped (damping 7.0 per second against a natural rate of sqrt(5) = 2.24 rad/s).

### 10.3 Holding logic

- Normalised press `dist_nrm` = distance from rest / 32.0 px.
- If `dist_nrm` >= 0.99 (fully pressed): `hold_timer` is reset to 0 and, if not already holding, holding starts (the bumper shows a screen-space shake effect and the danger sound).
- While holding, every tick: if `hold_timer` > 0.5 s (`fully_pressed_hold_time`), holding stops; then `hold_timer` increases by the tick delta.
- So holding starts the instant a bumper is fully pressed, and ends 0.5 s after the last tick it was fully pressed.

### 10.4 Gauges

- Danger gauge beside each bumper: a short line (default 128 px long, 8 px thick, centre-aligned, rotated 90 degrees) whose "standard" fill grows from the centre with the bumper press (`dist_nrm` clamped 0.01 to 1.0) in the style fill colour on a recess-colour track.
- While holding, a "danger" line flashes in the style danger colour (fades at 4.0 per second), and a danger sound plays at full volume (it fades down to -40 dB at 2.0 per second after release); mobile haptic 0.1 amplitude, 0.05 s per frame.
- Ray gauges at the top: each side has a line from the wall to the detection marker; the "standard" line shows the distance to the nearest suba along the ray; the "flash" (white) triggers on a normal spawn; the "danger" (red) flashes on a safety spawn; the "special" colour line shows safety-spawn timer progress (timer / 3.0 s).
- Gauge line width is 8 px (`gauge.tscn`), pushed outward by the style `collider_gap` along its push direction.

### 10.5 Pre-game-over condition and sequence

Pre-game-over starts on the physics tick when BOTH bumpers are in the holding state (`pregameover_condition_met`).
In other words, both must have reached >= 99% press, within 0.5 s of each other (the first one stays "holding" for 0.5 s after it last was fully pressed).
Sequence (`enter_state_pregameover`):
1. The saved game file is deleted.
2. The red danger beam is shown (a ColorRect across x -1024 to 1024 px, y -176 to -48 px, in the danger colour); it then shrinks vertically and fades with a lerp rate of 3.0 per second (it keeps animating while paused).
3. Any aim is cancelled and the launch arrow is disabled.
4. The whole scene tree is PAUSED (`Pauser`), so physics, merges, spawning and input all stop. Timers and the UI keep running.
5. The "loss of control" sound plays, a negative-image flash is set to alpha 1.0 and fades at 4.0 per second, camera vibration 20.0, haptic 1.0 for 0.2 s.
6. Both bumpers lock: frozen and moved to the fully pressed position, shake and danger sound off.
7. A 3.0 s timer starts (`PreGameOverDelay`, wait_time 3.0, one-shot, runs while paused).
8. The side panels slide off screen (offset 1000 px in their direction) and are disabled; the instructions overlay is removed.
After 3.0 s: the "game over" signal fires, mode state becomes GAMEOVER, the score is submitted to the local leaderboard (section 11) and the game over screen opens (section 14.4).
The tree stays paused while the menu is open.

## 11. Score

Source: `game_mode/mode_classic/mode_classic.gd` (`calculate_score`, `on_sobo_merge`), `main/score_manager.gd`, `ui/live_score_display.gd`, `ui/side_panel/right_side_panel/*`.

Formula (recomputed after every merge): score = the sum, over every sobo currently alive that has the `merged` flag (it was produced by a merge) and is not one of the two sobos being consumed this tick, of that sobo's VALUE (2^tier).
Sobos that were spawned or launched and never produced by a merge count 0.
When the recomputed score differs from the current score, the DIFFERENCE is awarded as a gain event and added to the current score.
Consequences:
- Merging two never-merged sobos of value v gives +2v.
- Merging one merged and one never-merged sobo of value v gives +v (the result is worth 2v, the merged one was already counted v).
- Merging two merged sobos of value v gives +0 (2v - v - v), and no gain event is raised.
- The score never decreases during play, because a consumed merged sobo is always replaced by a bigger merged one.
- Score is not time-based and there are no combos, multipliers or streak bonuses.
- There is no score for launching, surviving, or for tiers reached other than through this sum.
- A restored game recomputes nothing; the saved score is simply restored.
- Dev cheats or console use set `disable_scoring`, which keeps the score at 0 and shows a "scoring and achievements are disabled" message (`score_manager.gd`).

Display.
- Desktop: the right side panel shows the live score as a large rotated label (rotated +90 degrees, scale 1.5) at (180,360) px in the panel. The shown number eases toward the true score at a rate of 8.0 per second (smoothed value lerp) and is rounded; while it is catching up a "score increase" blip plays with pitch 1.0 + 0.05 x remaining difference (`live_score_display.gd`).
- Each gain event also spawns a floating "+N" label (N = gain) in the right panel: it starts with alpha 50 (so it stays opaque for a while), moves toward a stacked slot starting at y = 128 px with 40 px spacing, and fades at 4.0 per second for the first label and 2.0 per second for the others (`right_side_panel.gd`).
- Mobile: the live score is shown in the top panel as a centred label (scale 1.4) in the same way; the "+N" labels are a desktop right panel feature only.
- With a mode running the label shows the number; with no mode it is empty.

Best score and leaderboard.
- There is no "best score" shown during play.
- At game over the final score is appended to a local list, sorted descending, and stored in `user://scores.dat` (an Array of int). The list is unbounded.
- The scores screen shows 10 entries per page for the local list, with prev, next and "my score" buttons, and a "clear local scores" button with a "are you sure you want to clear local scores!?" confirm (`scores_screen.gd`, `scores_screen.tscn`).
- On the Steam build the screen can switch to a global or friends-only Steam leaderboard named "highscore"; the web recreation can ignore Steam.
- Optional "live friend scores" (Steam rich presence) are Steam only.

## 12. Style system

Source: `style/style_system/style.gd`, `style_manager.gd`, `style_manager.tscn`, `style/styles/*.tres`, `style/sobopalettes/*.tres`.

A Style is a Resource with these fields (defaults in brackets, used when a .tres omits the field): `background_color` (black), `sobo_palette`, `structure_color` (black), `out_of_bounds_color` (#A9A9A9 dark gray), `collider_gap` (2.0 px), `recess_color` (#1A1A1A), `fill_color` (#666666), `special_color` (#66FFFF), `danger_color` (#FF2F3D), `sobo_marker_color` (white), `sobo_hover_outline_thickness` (4.0 px), `sobo_select_outline_thickness` (8.0 px), the nine UI colours, and a cursor texture.
The cursor is a black circle (`ui/cursor_circle_black.png`) in the 12 light styles light_mode, 2048, candy, game_boy, high_contrast_light, ink, maple, matcha, sakura, sky, solarpunk and terracotta, and a white circle (`ui/cursor_circle_white.png`) in the other 16 (`style/styles/*.tres`).
Where each is used: `background_color` is the clear colour behind the field and the sobo label colour; `structure_color` is the wall outline and the bumper ring; `out_of_bounds_color` fills everything outside the polygon; `recess_color` is the gauge track; `fill_color` is the gauge fill and the bumper fill; `special_color` is the safety-timer line; `danger_color` is the danger line, the beam and the negative effects; `sobo_marker_color` is outlines, the launch arrow, markers and the instructions.
The values below were resolved from each .tres with the field defaults filled in.

Default style: "dark_mode" (`default_style` and `default_dark_mode` in `style_manager.tscn`), whose sobo palette is "classic".
The light default is "light_mode" with palette "classic_light".
The style is saved in the settings file as the style name (empty string means default).
All 28 built-in styles are listed in the order of `style_manager.tscn`; this is also the order on the style screen (10 per page).
The cycle-styles key (key K, action `cycle_styles`) steps through UNLOCKED styles in that order.
The key L (action `toggle_light_dark_mode`) toggles between the default dark and light styles.

Unlock rules (`style_manager.gd`, `achievement/achievement_system/achievement_manager.gd`):
- "dark_mode" and "light_mode" are always unlocked.
- Custom styles (user-made) are always unlocked.
- Every other built-in style costs ONE unlock token to unlock permanently.
- Available tokens = the number of achievements unlocked (30 possible, section 13) minus the number of built-in non-default styles already unlocked.
- Selecting a locked style while tokens remain unlocks it and sets it; with no tokens remaining it cannot be selected.
- Unlocked style names are saved to `user://style_unlocks.dat`.
- The style screen shows a label with the unlock count (`unlocks_label`).
- Style and achievement features are hidden in the mobile main menu (buttons "achievements" and "style" are hidden when the `mobile` feature is on).
- A custom style editor exists (`custom_style_screen`) that clones the current style into `user://styles/*.tres`; not analysed further.

Palette use: `color_for_tier(n)` = palette colour at index (n modulo palette length) (`sobo_palette.gd`).
Autocycle in the style manager (off by default) is a developer tool.

Distinct collider_gap values across all 28 styles: ['2.0'].
Distinct (hover, select) outline thickness pairs across all 28 styles: [('4.0', '8.0')].

Table 12.1 - world colours per style (index is the order in style_manager.tscn).

| # | style | palette | background | structure | out_of_bounds | recess | fill | special | danger | sobo_marker |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | dark_mode | classic | #000000 | #333333 | #1A1A1A | #1A1A1A | #666666 | #66FFFF | #FF2F3D | #FFFFFF |
| 1 | light_mode | classic_light | #FFFFFF | #333333 | #999999 | #000000 | #8C8C8C | #00B2BF | #FF2F3D | #000000 |
| 2 | 2048 | 2048 | #FAF8EF | #BBADA0 | #CDC1B4 | #615247 | #E08052 | #D1AD29 | #D11F38 | #2E241F |
| 3 | abyss | abyss | #051424 | #33A6B2 | #0A2438 | #081A29 | #4CB8D1 | #D9AD47 | #FF332E | #F2EBBF |
| 4 | amber | amber | #0A0804 | #D9941A | #120D05 | #0D0904 | #9E6114 | #38B29E | #FF4759 | #FFEBB2 |
| 5 | candy | candy | #FCF2F7 | #73C7B8 | #EBDBE6 | #476B66 | #D985AD | #B894E0 | #FF4738 | #381F38 |
| 6 | cmy | cmy | #0A0A0A | #333333 | #1A1A1A | #141414 | #38ADB8 | #BFB22E | #F21F8C | #F2F2F2 |
| 7 | everforest | everforest | #2D353B | #A7C080 | #232A2E | #232A2E | #6B8594 | #82BF91 | #FF423D | #EBE0B8 |
| 8 | frost | frost | #0D121A | #85ADC7 | #141C26 | #141F29 | #528CB2 | #8C73BF | #FF522E | #F2EDE0 |
| 9 | game_boy | game_boy | #E0F0B8 | #0F380F | #B8CC80 | #081A08 | #61851A | #386B2E | #B81F14 | #0A140A |
| 10 | grape | grape | #140A1F | #9E6BC7 | #1F0F29 | #0F081A | #596BBF | #E0B247 | #FF522E | #F2E6FA |
| 11 | high_contrast | high_contrast | #000000 | #EBD100 | #141414 | #0D0D00 | #268CF2 | #40D959 | #FF1F1F | #FFFFFF |
| 12 | high_contrast_light | high_contrast_light | #FFFFFF | #1A1A1A | #D1D1D1 | #000000 | #2673D9 | #1F9E47 | #EB0D14 | #000000 |
| 13 | ink | ink | #F5EDE0 | #2E241F | #D1C2B2 | #140F0D | #8C7A66 | #477A85 | #EB1A3D | #1F1712 |
| 14 | magma | magma | #0A0505 | #F2611F | #140805 | #0F0505 | #A62E1A | #599EE0 | #FF268C | #FFEBD1 |
| 15 | maple | maple | #FAF0DB | #BF472E | #E6D1AD | #59291A | #D19E38 | #618547 | #F21A47 | #2E1A0F |
| 16 | matcha | matcha | #EDF2E0 | #6B8552 | #D1DBBD | #424C29 | #9EAD70 | #B86673 | #E6242E | #2E291F |
| 17 | miku | miku | #0F1214 | #38C4BA | #1A1F21 | #141A1C | #E0476B | #85949E | #FF731F | #E0FAF5 |
| 18 | mocha | mocha | #170D0A | #AD7347 | #21140F | #140A08 | #855752 | #85AD6B | #FF3D47 | #F5E8D6 |
| 19 | monokai | monokai | #0D0D0B | #383833 | #1A1A17 | #141412 | #52ADC7 | #8CC738 | #F92672 | #F7F7F0 |
| 20 | midnight_neon | neon | #0D051F | #F2338C | #1F0D38 | #140829 | #9447C7 | #40D1BF | #FF6B1A | #D9FFF2 |
| 21 | sakura | sakura | #FFF0F2 | #D16B85 | #F2D9E0 | #613847 | #BD949E | #73ADC7 | #FF6B14 | #471424 |
| 22 | slipgate | slipgate | #1C140F | #B89461 | #120D0A | #140F0D | #8C7052 | #7A9E2E | #FF2952 | #F2E09E |
| 23 | sky | sky | #E6F2FA | #668099 | #C7DBEB | #38475C | #739EC7 | #D1A347 | #FF5C47 | #1F2938 |
| 24 | solarpunk | solarpunk | #FAF5E0 | #529E61 | #E0E6B8 | #29522E | #D1AD38 | #479EC7 | #F21F2E | #1F291A |
| 25 | sunset | sunset | #120A24 | #EB6B47 | #1A0F2E | #1A0D29 | #854C9E | #D19440 | #FF2E52 | #FAF0D1 |
| 26 | terracotta | terracotta | #F5E6D1 | #C76B4C | #DBC7AD | #613329 | #8C854C | #528C8C | #EB1F61 | #291712 |
| 27 | yozakura | yozakura | #1A0D1A | #FF8CB2 | #291429 | #1F0F1F | #AD618C | #D19447 | #FF7A1F | #FFF2E6 |

Table 12.2 - UI colours per style.

| style | highlight | highlight_hover | highlight_disabled | background | background_hover | background_pressed | panel_highlight | panel_highlight_hover | panel_highlight_disabled |
|---|---|---|---|---|---|---|---|---|---|
| dark_mode | #999999 | #FFFFFF | #262626 | #1A1A1A | #4C4C4C | #FFFFFF | #333333 | #CCCCCC | #262626 |
| light_mode | #666666 | #000000 | #BFBFBF | #E6E6E6 | #B2B2B2 | #000000 | #CCCCCC | #333333 | #E6E6E6 |
| 2048 | #8C7A6B | #59473D | #D1C2B2 | #EDE3D1 | #D9C7B2 | #59473D | #B89E85 | #73523D | #C7B8A8 |
| abyss | #66B2BF | #66F2E6 | #1A3847 | #0A2438 | #144761 | #F2BF4C | #1A4752 | #66F2E6 | #0F292E |
| amber | #D99426 | #FFD166 | #473314 | #1A1208 | #2E1F0D | #FFD166 | #664714 | #F2B847 | #241A0D |
| candy | #B87A9E | #854773 | #E0D1DB | #F5E6F0 | #E6C7DB | #854773 | #BF94B8 | #854773 | #D9BFD1 |
| cmy | #949494 | #59D9E0 | #262626 | #1A1A1A | #474747 | #E047B8 | #333333 | #D1C747 | #262626 |
| everforest | #D3C6AA | #A7C080 | #4F585E | #343F44 | #475258 | #A7C080 | #7A8478 | #D3C6AA | #475258 |
| frost | #8CB8D1 | #D1EBFA | #2E3D4C | #141F29 | #243342 | #D1EBFA | #385266 | #BFE0F2 | #1F2933 |
| game_boy | #38611F | #0F380F | #9EB26B | #CCDB9E | #ADC27A | #0F380F | #597A1F | #0F380F | #8C9E59 |
| grape | #AD80D9 | #E0C7FA | #402452 | #1F0F29 | #381A47 | #E0C7FA | #522E6B | #D1A6F2 | #291433 |
| high_contrast | #EBD100 | #FFFFFF | #404026 | #141414 | #2E2E1F | #EBD100 | #595200 | #EBD100 | #26261A |
| high_contrast_light | #262626 | #000000 | #B2B2B2 | #EBEBEB | #C7C7C7 | #000000 | #8C8C8C | #262626 | #CCCCCC |
| ink | #59473D | #2E241F | #C7B8A8 | #E6D9C7 | #C7B29E | #2E241F | #7A6657 | #2E241F | #A69485 |
| magma | #F26B2E | #FFB852 | #521F14 | #1A0A08 | #38140D | #FFB852 | #6B2914 | #FF8C38 | #290F0A |
| maple | #AD6138 | #7A381F | #D9C7A6 | #F0E0C2 | #DBC299 | #7A381F | #B87A47 | #7A381F | #CCB28C |
| matcha | #808C61 | #617347 | #C7D1AD | #DBE6C7 | #BFD1A6 | #6B8552 | #859461 | #6B8552 | #ADBD8C |
| miku | #59B8AD | #8CEBE0 | #2E383D | #1A1F24 | #2E383D | #E06694 | #385252 | #73E0D1 | #1F2429 |
| mocha | #C79461 | #F2D9B2 | #472E24 | #24140F | #3D241A | #F2D9B2 | #66422E | #E6BF8C | #2E1A14 |
| monokai | #949485 | #66D1E6 | #2E2E29 | #1A1A17 | #474740 | #9ED938 | #383833 | #D9C759 | #262624 |
| midnight_neon | #B273E6 | #33FFE6 | #401F59 | #1F0D38 | #471A6B | #33FFE6 | #591F73 | #33FFE6 | #2E0F38 |
| sakura | #B27A8C | #8C3859 | #E6C7D1 | #FAE0E6 | #F2C7D4 | #8C3859 | #B87A8C | #8C3859 | #D9B2BD |
| slipgate | #D9A638 | #F2D16B | #473829 | #291F17 | #473324 | #D9A638 | #735733 | #D9A638 | #38291F |
| sky | #6B859E | #38526B | #C7D6E0 | #DBE8F2 | #BDD1E0 | #38526B | #8CA6B8 | #47617A | #B8C7D6 |
| solarpunk | #AD8C2E | #477A38 | #D1CC9E | #F0EBC7 | #DBD69E | #477A38 | #94AD52 | #477A38 | #BFC28C |
| sunset | #E68C59 | #FFC773 | #472447 | #1F0F2E | #381A47 | #FFC773 | #662E52 | #FFB866 | #29142E |
| terracotta | #AD6B52 | #7A3D2E | #D9BFA6 | #EBD6BD | #D1B294 | #7A3D2E | #B87A61 | #7A3D2E | #C7AD94 |
| yozakura | #D98CB2 | #FFC7E0 | #522947 | #291429 | #522447 | #FFC7E0 | #522447 | #FFC7E0 | #33142E |

Table 12.3 - every sobo palette, colours listed in size-tier order (tier index modulo palette length).

| palette | count | used by a built-in style | colours (tier 0 first) |
|---|---|---|---|
| 2048 | 16 | 2048 | E08C52 C79E2E E65938 947A61 EB7A4C D1AD33 C7613D B88C47 E09E61 D9B238 D9472E 856652 EB6B47 B29433 F28538 A67347 |
| abyss | 16 | abyss | 26D9BF FF7359 408CF2 F2BF40 59F28C D959A6 33BFE6 FF994C 66B280 8C66F2 4CF2D9 F26673 33A6CC D9D959 73E6A6 B259CC |
| amber | 16 | amber | D98C1F EB6B1A B89E2E 47B294 F2AD38 C7591F 739E47 E08014 38949E A67A26 F25926 8CB852 D1B847 59856B E69447 9E611F |
| candy | 16 | candy | F27A9E 73D1B8 B88CEB FFB86B 8CB8F2 F2D159 EB6BB8 6BD98C D9856B 9E7AE0 F2947A 61BFD1 E06B85 ADD16B D17AD9 F2A659 |
| choco | 12 | none | E7893C 9B4704 E18927 8C690E CD8011 B56635 FD9D0C AD4B37 A95F20 C7641C FC701A D8840E |
| classic | 20 | dark_mode | FF3333 FFEB33 5CFF33 33FFC2 3385FF 9933FF FF33AD FF7033 D6FF33 33FF47 33FFFF 3347FF D633FF FF3370 FFAD33 99FF33 33FF85 33C2FF 5C33FF FF33EB |
| classic_adjusted | 17 | none | FF3333 FF6A00 FFB700 FFE100 D0FF00 00FF5D 00FFCC 00DDFF 009DFF 006AFF 0033FF 4000FF 6A00FF A100FF FF00FB FF0090 FF0040 |
| classic_light | 20 | light_mode | FF3333 CC940F 30A314 14A175 3385FF 9933FF FF33AD FF7033 8CAD14 14A824 0D8C9E 3347FF D633FF FF3370 C7801A 5EAB12 14A64C 1F94C9 5C33FF FF33EB |
| cmy | 16 | cmy | 38BFCC E02EAD D9C72E 2E9EB2 BF298C B8A624 47D1C7 EB3894 E0B838 3394D1 C733D1 C7B21F 52B2B8 D9267A D1D147 26ADA6 |
| everforest | 16 | everforest | E67E80 E69875 DBBC7F A7C080 83C092 7FBBB3 D699B6 D3C6AA E69875 A7C080 7FBBB3 DBBC7F D699B6 83C092 E67E80 D3C6AA |
| frost | 16 | frost | 6194C7 7A85D1 52ADB2 947ABF 6BB89E 4C7ACC 859EC7 668CAD 8C73B8 59B2BF 7380D9 61A694 8094CC 478CB8 9E80C7 66B8C7 |
| game_boy | 4 | game_boy | 306230 8BAC0F 477A24 6B941A |
| grape | 16 | grape | AD6BD9 E0AD47 8552B8 6B8CD1 D16194 94B86B BF7AE0 617AC7 E68C59 9E598C 7A9EBF D973B8 B89452 7361D1 C7596B 8C7AB8 |
| high_contrast | 16 | high_contrast | E62E2E F27314 1FB838 1AADD1 3861F2 D12EC7 F24773 2EC77A 2685EB E0388C 6B38F2 EB611F 33BF47 1FC7B8 C733E0 F23838 |
| high_contrast_light | 16 | high_contrast_light | D11414 E06100 14942E 0D85B8 1F38D9 AD14AD D91F59 149E61 1461D1 BF147A 521FD1 D1470D 1F9E2E 0D9E94 9E14BF C71414 |
| ink | 16 | ink | B82E38 382E29 D9736B 8C6B59 E6B273 C75261 594740 EB9E94 A63847 D18C66 473833 E06159 F2C78C 7A524C BF4752 665952 |
| magma | 16 | magma | F2611F E0381F F29E2E D92E6B 6B94E0 F27A14 B82E1F F2B847 C7478C 8C6BD1 EB522E 59B8BF D98538 F23847 9E472E F28C52 |
| maple | 16 | maple | D15938 D99E38 6B8C47 B84738 E68C40 8C6B38 C77A47 617A6B E0B861 A63838 949E47 D96B2E 7A5238 EB9459 854752 B28538 |
| matcha | 16 | matcha | EB8C9E 8CB26B F2D18C B2D18C F2B2AD 6B8C59 FAC7B8 9EBF7A E0808C BFAD66 F2D9BF 80A673 E69E94 ADC785 D9B87A C77A85 |
| miku | 16 | miku | E0476B 38BFB2 7A8C94 2EADC7 D1527A 52CCAD 40C7B8 8C9EA6 E64C66 33B2A6 388CB8 6B808A C74073 59D1BF 2EB8C7 D95980 |
| mocha | 16 | mocha | C77A47 9E6147 D99E52 859E61 B86B6B E0B87A 945938 AD8559 D16147 738C6B E68C59 946B7A BF9447 8C664C EBAD6B A67352 |
| monokai | 16 | monokai | F22E73 F28C1F D1BF47 8CC72E 52B8D1 9E73EB C7386B EB9E2E AD9E38 6BA638 4794AD 8561C7 EB3885 E07A1F D9CC59 7AD147 |
| neon | 16 | midnight_neon | FF268C 33FFE6 D933FF FFD91A 338CFF FF5926 59FF59 FF33D9 26E6FF FF8C33 8C40FF 33FF8C FF4066 66B2FF FFB226 B226FF |
| sakura | 16 | sakura | F28CA6 D9B2E6 B2D9CC FFBFB2 BFCCF2 F2D98C E699BF A6BFB2 FAB299 CCA6D9 B2E6D9 FFCCBF D9BFF2 F2A6B2 BFD9E6 E6CC99 |
| sky | 16 | sky | 6B9ED9 F2B873 73B894 EB8C85 8C85D1 6194B8 E0C76B 85C7BF C77A94 598C7A F29E61 7A94E0 9EB86B B88CD1 52ADB8 D9806B |
| slipgate | 16 | slipgate | C22E24 C76129 D9A638 B89461 6B7A38 7A9E2E 478C52 D9C794 D1AD1F 8C1F1A E06B2E 8C6B52 6B3847 B27A38 595247 EB8C47 |
| solarpunk | 16 | solarpunk | 6BB861 E0AD2E 479EC7 EB8C38 52946B 8CC76B C76B47 6B8CD1 B8C752 D97A61 38AD8C EBBF47 7A6BB8 61B89E D19438 478552 |
| sunset | 16 | sunset | D96B52 E68C38 B8528C 8559C7 E09459 C74761 6B61D1 EB7A33 AD4C9E D98047 8C52B8 CC6147 E69E4C 9E477A 7A66CC E06B61 |
| terracotta | 16 | terracotta | D16B52 8C9E52 529494 D99447 B85961 7A8547 E0AD6B 617A9E C77A38 6BA685 A65247 B89E52 856B8C E68561 598573 9E7A52 |
| yozakura | 16 | yozakura | FF8CB8 FFC7E0 F2B273 D966B2 FFEBD9 B259D9 FF7394 F2D18C E680CC FFB2BF BF73F2 FFD9B2 FF99A6 D98CE6 FFBF80 F2668C |

Palettes that no built-in style references (classic_adjusted, choco, and the ones marked "none" above) exist as resources and are available to the console only.

## 13. Achievements

Source: `achievement/achievement_system/achievement_tracker.gd`, `achievement_manager.gd`, `achievement_def.gd`, `achievement_definitions/*.tres`, `achievement_manager.tscn`.

There are exactly 30 achievements, all listed in the manager scene.
They are saved in `user://achievements.dat` (a dictionary of id to true) and mirrored to Steam if present.
Unlocking one shows a notification at the bottom right of the screen for 15.0 s (`ACHIEVEMENT_NOTIF_DURATION`) with the title "achievement!" and the achievement's name, which opens the achievements screen when pressed.
Achievements are disabled in the demo build and after any console/cheat use (`disable_achievements`).
Each unlocked achievement also grants one style unlock token (section 12).

Kinds and exact rules (`achievement_tracker.gd`):
- SCORE_EXACT: on game over, if the final score is EXACTLY the given value.
- REACH_TIER: when a sobo with that value exists, either when created or as a merge result.
- BAR: when a sobo with that value joins the bar (enters emerging or selectable state, including as a merge result placed on the bar).
- CLEAN: whenever the stack contains EXACTLY ONE sobo (the whole stack list has length 1) and its value equals the given value (checked after every sobo created, freed, merged, launched, or joining or leaving the bar).
- AIR_MERGE: a merge produces a sobo of that value, the new sobo is not on the bar, and for each of the next 15 physics ticks (0.25 s at 60 ticks/s, `AIR_MERGE_CLEAR_FRAMES`) it still exists, is not on the bar and has no external contact (touches no other sobo, wall or bumper).
- NX_HOLD: at least `count` sobos of that value exist simultaneously (anywhere) for 10.0 s (`HOLD_SECONDS`) of unpaused physics time continuously; the timer resets when the count drops below.
- NO_MERGE_HOLD: for 10.0 s continuously the stack list holds at least `count` sobos, with no merge in the current run having produced a value greater than 2. A single merge result above 2 permanently disables these two achievements for that run (until a new game).
- CHAIN: a lineage of merges. A chain with start value s begins when any merge produces s x 2 (`first_step`). It continues while each next merge produces double the last value AND consumes the sobo produced by the previous step (same lineage). Hitting an end value unlocks that end's achievement. Any LAUNCH, and any new game, resets all chains. A chain stops extending at its highest end value.
- EVENT: unlocked by code (only "praise the suncle": any safety spawn).

All 30 (id, name as shown, exact condition text from the definition):

| id | name | kind | value / count / start | description |
|---|---|---|---|---|
| ACH_SCORE_0 | score 0 | SCORE_EXACT | 0 | Finish a game with a score of exactly 0. |
| ACH_SCORE_10 | score 10 | SCORE_EXACT | 10 | Finish a game with a score of exactly 10. |
| ACH_SCORE_100 | score 100 | SCORE_EXACT | 100 | Finish a game with a score of exactly 100. |
| ACH_SCORE_1000 | score 1000 | SCORE_EXACT | 1000 | Finish a game with a score of exactly 1000. |
| ACH_8192 | 8192 | REACH_TIER | 8192 | Have an 8192 Sobo. |
| ACH_BAR_64 | bar 64 | BAR | 64 | Have a 64 Sobo on the float bar. |
| ACH_BAR_128 | bar 128 | BAR | 128 | Have a 128 Sobo on the float bar. |
| ACH_BAR_256 | bar 256 | BAR | 256 | Have a 256 Sobo on the float bar. |
| ACH_BAR_512 | bar 512 | BAR | 512 | Have a 512 Sobo on the float bar. |
| ACH_AIR_MERGE_32 | air merge 32 | AIR_MERGE | 32 | Merge into a 32 Sobo without it touching anything for a quarter second. |
| ACH_AIR_MERGE_64 | air merge 64 | AIR_MERGE | 64 | Merge into a 64 Sobo without it touching anything for a quarter second. |
| ACH_AIR_MERGE_128 | air merge 128 | AIR_MERGE | 128 | Merge into a 128 Sobo without it touching anything for a quarter second. |
| ACH_AIR_MERGE_256 | air merge 256 | AIR_MERGE | 256 | Merge into a 256 Sobo without it touching anything for a quarter second. |
| ACH_CLEAN_512 | clean 512 | CLEAN | 512 | Have a lone 512 Sobo in the stack. |
| ACH_CLEAN_1024 | clean 1024 | CLEAN | 1024 | Have a lone 1024 Sobo in the stack. |
| ACH_CLEAN_2048 | clean 2048 | CLEAN | 2048 | Have a lone 2048 Sobo in the stack. |
| ACH_CLEAN_4096 | clean 4096 | CLEAN | 4096 | Have a lone 4096 Sobo in the stack. |
| ACH_6X_128 | 6x 128 | NX_HOLD | value 128, count 6 | Have 6x 128 Sobos for 10 seconds. |
| ACH_5X_256 | 5x 256 | NX_HOLD | value 256, count 5 | Have 5x 256 Sobos for 10 seconds. |
| ACH_4X_512 | 4x 512 | NX_HOLD | value 512, count 4 | Have 4x 512 Sobos for 10 seconds. |
| ACH_3X_1024 | 3x 1024 | NX_HOLD | value 1024, count 3 | Have 3x 1024 Sobos for 10 seconds. |
| ACH_121212 | 121212 | NO_MERGE_HOLD | max allowed result 2, count 6 | Without merging any sobo above 2, have 6 Sobos in the stack for 10 seconds without interruption. |
| ACH_1212121212 | 1212121212 | NO_MERGE_HOLD | max allowed result 2, count 10 | Without merging any sobo above 2, have 10 Sobos in the stack for 10 seconds without interruption. |
| ACH_CHAIN_1_16 | chain from 1 to 16 | CHAIN | start 1, end 16 | Have a lineage of sobos merging from 1 to 16 without interruption. |
| ACH_CHAIN_1_128 | chain from 1 to 128 | CHAIN | start 1, end 128 | Have a lineage of sobos merging from 1 to 128 without interruption. |
| ACH_CHAIN_1_512 | chain from 1 to 512 | CHAIN | start 1, end 512 | Have a lineage of sobos merging from 1 to 512 without interruption. |
| ACH_CHAIN_32_1024 | chain from 32 to 1024 | CHAIN | start 32, end 1024 | Have a lineage of sobos merging from 32 to 1024 without interruption. |
| ACH_CHAIN_128_2048 | chain from 128 to 2048 | CHAIN | start 128, end 2048 | Have a lineage of sobos merging from 128 to 2048 without interruption. |
| ACH_CHAIN_512_4096 | chain from 512 to 4096 | CHAIN | start 512, end 4096 | Have a lineage of sobos merging from 512 to 4096 without interruption. |
| ACH_PRAISE_THE_SUNCLE | praise the suncle | EVENT | none | Get a safety-spawn with both spawners blocked. |

Notes:
- "Hidden" is false for all (the field default; none of the .tres sets it).
- Achievement icons are two textures per entry (achieved and unachieved); not analysed.
- Several achievements require values that need tiers above the spawn pool (the pool stops at 64 on desktop, 32 on mobile), so they can only come from merging.
- On the achievements screen, "prev" and "next" page buttons, a description line, and buttons "clear local achievements" (with a "confirm clear?" step) and "sync from steam" exist (`achievements_screen.tscn`).

## 14. UI layout and screens

Source: `ui/ui.tscn`, `ui/side_panel/*`, `ui/menu/*`, `ui/mobile_top_panel.gd`, `ui/mobile_bottom_panel.gd`, `main/startup.gd`, `ui/live_score_display.gd`, `ui/theme.tres`.

### 14.1 In-game HUD

Desktop (1280 x 720 reference):
- Left side panel: a vertical (rotated -90 degrees) title label at scale 1.5, default text "sobosuba", showing the current menu screen's side title text when a menu is open; plus a menu icon (hamburger) when no menu is open and a back icon when a menu is open and going back is possible. The whole panel is a button: pressing it opens the menu, or goes back when already in a menu (`left_side_panel.gd`).
- Right side panel: the vertical live score number (rotated +90 degrees, scale 1.5) and the "+N" gain labels; pressing it opens the scores screen (closes the menu if it is already on the scores screen). Optional Steam friend scores (up to 10 rows) appear in it when enabled.
- Version label: bottom-right of the screen, text = project version (1.2.3) plus feature tags such as "windows steam".
- There is no best score, level, timer, next-sobo preview, or tier legend in the HUD.
- Panels spring on and off screen with stiffness 60.0 and damping 10.0 per second, with a kick of 2000 px/s on a new game and 1000 px/s on a menu change; they slide away (1000 px offset) on pre-game-over and while screens that hide side panels are open (game over screen, etc.).
- All text uses the in-house SDF text system and the game's own fonts (`souba_score.ttf` for numbers, `souba_text.otf` for text).

Mobile (portrait):
- A top panel (min height 128 px) shows the live score in the centre (scale 1.4) and the screen title while in menus.
- The field takes the middle.
- A bottom panel (min height 48 px) holds a "back" button that appears when a menu can go back.
- The field area is bounded by the device safe area (`MobileManager.get_usable_rect`).
- Haptics on select, launch, merge shockwaves, and bumper holds; strength setting "haptics" 0 to 1 (default 1.0).

### 14.2 Screens

Screens in the menu (names are from the scene files): main menu, settings (desktop) and settings (mobile), input, game, scores, achievements, game over, credits, demo, extra modes, style, custom style, language.
Main menu buttons (`main_menu_screen.tscn`, `main_menu_screen.gd`), top to bottom with separators: resume, start game, extra modes, (separator) scores, achievements, style, language, settings, (separator) credits, "purchase on steam" (demo only), "by keepeetron", (separator) quit.
Button texts: "resume" and "new game" if a mode is running; "resume saved game" and "start game" if a save file exists; "start game" if nothing; the quit button reads "save and quit" when the current state can be saved, otherwise "quit".
On mobile, achievements, style and quit are hidden.
The game opens on the main menu at launch (the Startup node's `start_game_mode` is not set in `main.tscn`).
The menu pauses the tree while it is open.
"Extra modes" screen has two buttons: "sobotris" and "heave".
Settings (desktop): game, input, fullscreen (key F), mute (key M), volume, live friend scores; the "game" screen has: flipped camera, screen shake, vibration, push, start clutter, show instructions; the "input" screen has: input, glyphs, bumpers select, swap sticks (`settings.gd`, defaults in 15.2).
Settings (mobile) has language, flipped camera, screen shake, vibration, push, haptics, start clutter, show instructions.
Languages: cs, de, en, es, it, ja, pl, ru, sr, zh_CN, zh_TW (`localization/language_*.tres`).
Keyboard bindings in `project.godot` `[input]`: Esc opens or closes the menu (`escape`), F or F11 toggles fullscreen, M toggles mute, K cycles unlocked styles, L toggles light and dark default styles, F7 opens the language screen, F1 toggles the developer console, Pause toggles pause (`main/pauser.gd`).
Mouse: left button is select/aim/launch (`mouse_left`), right button is cancel (`mouse_right`).
There are also gamepad bindings for d-pad, sticks, shoulders, triggers, start and select.

### 14.3 Pause

Opening the menu pauses the game (`Pauser`).
Escape, the left panel, or the gamepad start button toggles the menu.
The Pause key toggles pause directly.
A pause request also comes from the console.
The tree is also paused during the 3.0 s pre-game-over delay (section 10.5).

### 14.4 Game over screen

Side title "gameover".
A "final score" caption and a large number that counts up from 0 toward the final score by lerp at a rate of 2.0 per second (so it eases rather than ticking).
Opening it plays a game over sound and flashes the screen white (alpha 1.0, fading at 0.5 per second).
Buttons: "new game" (restarts the same mode scene), "view" (closes the menu so the final board can be looked at; the game stays paused in GAMEOVER state), "scores", "menu".
While in the GAMEOVER state, pressing escape reopens the game over screen, and a press anywhere that is not a button reopens it.
Side panels are hidden while this screen is open.

## 15. Save, load and persistence

Source: `save_load_manager.gd`, `game_mode/mode_classic/mode_classic_game_state.gd`, `game_state.gd`, `settings.gd`, `settings_manager.gd`, `sobo_state.gd`, `danger_bumper_state.gd`, `spawn_pool_state.gd`.

### 15.1 In-progress game save

File `user://game_state.tres` (a Resource).
When it is written: when the window is closed (close request), when the application is paused (mobile), and from the main menu's "save and quit" button.
It is written only if the mode is in the PLAYING state (not pre-game-over or game over).
Contents (classic): score; which side spawned last; `spawn_tick_delay`; `safety_spawn_timer`; both bumpers (holding flag, hold timer, rigid body position and velocity); spawn pool (current pool list, merge counts per tier); instruction counters (launch counts per device and the demo timer); and three lists of sobos: emerging, selectable, in stack (each sobo: size tier, merged flag, allow-merges flag, frozen flag, collision layer and mask for subas and ball, every suba position and velocity, the ball position and velocity); plus the mode name.
When it is loaded: from the main menu "resume saved game"; the mode is started without start juice, state is applied, and then the save file is DELETED immediately.
When it is deleted: right after a successful load, and at the start of pre-game-over (so a lost game cannot be resumed).
The saved game is not kept after starting a new game from a loss.
Starting a new game from the menu does not delete an existing save by itself.

### 15.2 Other persistent data

| file | contents | source |
|---|---|---|
| `user://settings.tres` | settings resource | `settings_manager.gd` |
| `user://scores.dat` | local leaderboard, array of int | `score_manager.gd` |
| `user://achievements.dat` | dictionary id to true | `achievement_manager.gd` |
| `user://style_unlocks.dat` | list of unlocked style names | `style_manager.gd` |
| `user://styles/*.tres` | custom styles | `style_manager.gd` |

Settings defaults (`settings.gd`): mute false, volume 1.0, input mode auto, glyph style auto, screen vibration 1.0, screen push 1.0, haptics 1.0, flipped camera false, fullscreen false, start clutter false, show instructions true, bumpers select false, swap sticks false, live friend scores false, style name empty, language empty (meaning English).

## 16. Other modes

Heave (`game_mode/mode_heave/*`): a wide 1280 x 720 px play area with a basin, a horizontal "viscous area" line at y = -260 px with linear damp 500, and sobos that rain down from y = -400 px at about 100 px/s on a random spawn rate between 0.3 and 0.8 per second; the player picks a sobo near the cursor (radius 64 px) and flings it with a drag of up to 220 px at up to 1000 px/s; the spawn pool unlock list is [0, 0, 0, 2, 3]; it never pauses.
In the recovered code it calls sobo methods that do not exist (for example `collisions_with_viscous_area_enabled`), so it appears unfinished or relies on code that was stripped.

Sobotris (`game_mode/mode_sobotris/*`): a narrower field (polygon (-256,-320), (256,-320), (256,256), (192,320), (-192,320), (-256,256)) where a single sobo at a time falls from (0,-416) px with a speed that eases from 10 px/s to 750 px/s as a difficulty value rises (difficulty = 1 - 0.5^(time / 60 s)); the player steers sideways with the mouse x or the d-pad/stick (sideways acceleration 800 px/s2), holding the mouse button drops at full speed, right click or the right shoulder hard-drops at 800 px/s; every tier is spawnable from the start; merging into a 512 sobo makes it vanish; gravity area uses combine mode (value 1).

The scene list also names a `mode_classic_mobile_2.tscn` that is not in the recovered files.

## 17. Sound and effects overview

Sounds exist for select, cancel, launch, stretch, merge, spawn and game start, hover, button up and down, the score blip, the achievement unlock, the danger loop, and the game over; none of them were analysed beyond the pitch and volume rules quoted above.
The shockwave (`game_elements/shockwave/*`): an expanding circle sprite that starts at scale 0.00001 and grows by 500 scale units per second (`speed` 4000 / 8), carrying a circle trigger of radius 4 px x scale, so it expands at about 2000 px/s; its life is the merge life above; every suba it first touches gets an impulse of (current life remaining x 100) px/s along the direction from the shockwave centre (impulse = velocity change times mass).
For a tier 0 merge the life is 0.19 s and the peak impulse about 19 px/s; for a tier 10 merge the life is about 1.86 s and the peak impulse about 186 px/s.

## 18. Unknowns and things the source does not settle

- Physics solver iteration counts, contact bias, sleep rules and the friction/bounce combine rules are engine defaults, not stored in the project.
- Physics ticks per second is the engine default (60); it is not written in `project.godot`.
- The exact orientation convention of each WorldBoundaryShape2D edge was not traced; the intent is clearly "solid outside the polygon".
- The sobo becomes selectable by an apparently inverted count (7.4); the literal behaviour is documented, but whether the original design meant "more than half the subas have crossed" is unknowable.
- The heave and sobotris modes call sobo methods missing from the recovered `sobo.gd`.
- `mode_classic_mobile_2.tscn` is referenced but absent.
- Audio streams, SDF text shaders, the background noise shader (`main/background`), the shockwave shader, the negative-image shader, fonts and icons were not analysed numerically.
- Steam-only behaviour (leaderboards, rich presence, achievements sync) was not specified beyond names.
- The exact `GrooveJoint2D` constraint behaviour is described from the Godot documentation of the joint (the anchor of the second body slides inside the groove), not from the project source.
- Hover and select sound volumes, merge sound pitch by size, and haptic patterns are code-driven and only partly quoted.

## 19. Differences that matter most

These are the places where the earlier web build (before 2026-10-13) diverged from the original, in order of how much they change play.
1. Sobos are not launched from one launcher with a queue.
They spawn alternately from both sides onto the float bar, and the player picks any selectable bar sobo (section 7, 8, 9.2).
2. Aiming points where you drag, not opposite to the drag, and the shot adds up to 850 px/s to the sobo's current velocity (9.3).
3. Spawn tiers start at 1 only and unlock by merge counts, and a side never spawns the tier its ray sees first (7.2).
4. Gravity is 150 px/s2 with almost no damping and frictionless contacts, so sobos float and slide (2.1, 2.2).
5. Size grows by area x 1.26 per tier (radius about +12 percent), not a fixed +6 px (5.1).
6. Losing is two spring bumpers pushed fully out within 0.5 s of each other, then a 3 s frozen pre-game-over (10).
7. Score is the sum of values of merge-made sobos alive, so merging two merge-made sobos scores 0 (11).
8. Only one merge per tick, the lowest contact first, and a merge result cannot merge again while it flashes (6).
9. A merge result keeps the outline of both parents (peanut) and inflates by pressure (6).
10. There is no combo, no best score in the HUD, no danger line and no timer.

