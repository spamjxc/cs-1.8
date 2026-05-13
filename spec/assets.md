# Asset Contract

This document is the human-readable version of the asset contract from `shared/src/constants.ts`.
If code and this document diverge, update both in the same change.

All runtime assets live in `client/assets/`.

## General Rules

- PNG is the default format. `ammo.webp` is currently allowed for the ammo icon only.
- Sprite dimensions below are the intended canvas/frame sizes, including transparent padding.
- Art may be smaller inside the frame, but should stay centered and readable.
- Keep projectile sprites horizontal and pointing right by default. Code will rotate/flip them.
- Explosion has no frame animation. The single sprite is scaled up and faded out by code.
- Grenade projectile reuses the same `grenade.png` file as the pickup item. Do not create a separate grenade projectile file unless the code contract changes.
- Grenade throw power bar is drawn by code with Phaser graphics/DOM canvas primitives. There is no image asset for it.
- Helmet sprites are `24x12`. During run animation the head moves slightly up/down, so helmet rendering must follow a per-frame/head anchor Y offset. The run animation does not move the head left/right.

## Required Files And Sizes

| Purpose | File | Size / Frame | Notes |
|---|---:|---:|---|
| Player idle | `player_base.png` | `49x58` | One frame. |
| Player run | `player_run.png` | `49x58`, 10 frames | Horizontal spritesheet. Total expected image size: `490x58`. |
| Player crouch | `player_crouch.png` | `49x58` | One frame, can use transparent padding. |
| Player damage | `player_damage.png` | `49x58` | One frame or placeholder; tint/blink may be code-driven. |
| Player ghost | `player_ghost.png` | `49x58` | One frame; alpha is code-driven. |
| Red helmet | `helmet_red.png` | `24x12` | Overlay-sized helmet. Follow vertical head bob during run. |
| Blue helmet | `helmet_blue.png` | `24x12` | Overlay-sized helmet. Follow vertical head bob during run. |
| Pistol pickup | `pistol.png` | `30x20` | Ground/pickup and hand visual source. |
| SMG pickup | `smg.png` | `40x14` | Ground/pickup and hand visual source. |
| Grenade pickup/projectile | `grenade.png` | `17x21` | Same file for pickup and thrown projectile. |
| Bazooka pickup | `bazooka.png` | `48x20` | Ground/pickup and hand visual source. |
| Bullet projectile | `proj_bullet.png` | `12x5` | Fast projectile. Horizontal, points right. |
| Rocket projectile | `proj_rocket.png` | `28x15` | Bazooka projectile. Horizontal, points right. |
| Explosion | `explosion.png` | `64x64` | Single frame. Code scales from `0.4` to `2.2` and fades over `300ms`. |
| Floor tile | `tile_ground.png` | `64x64` | Repeated tile. |
| Wall tile | `tile_box.png` | `64x64` | Rectangular collision. |
| Ramp tile | `tile_ramp.png` | `64x64` | Visual-only in MVP; collision uses rectangular/step tiles. |
| Box/misc | `box.png` | `64x64` preferred | Misc obstacle/placeholder. |
| Ammo icon | `ammo.webp` | `24x24` preferred | UI/pickup icon. |

## Effect Behavior

Explosion rendering uses `explosion.png` as a single sprite:

- spawn at explosion center;
- start scale: `0.4`;
- end scale: `2.2`;
- fade alpha from `1` to `0`;
- duration: `300ms`;
- no spritesheet and no separate animation frames.

## Grenade Throw UI

The grenade is the only projectile weapon with an arced trajectory.

When the player holds the fire button with a grenade selected, the client draws a small charge bar near the player:

- no sprite file;
- width: `48px`;
- height: `6px`;
- vertical offset above player: `-42px`;
- fill grows from left to right;
- charge maps linearly from min throw force to max throw force;
- charge reaches max after `900ms`;
- releasing the button throws the grenade using the current charge.

The charge bar constants live in `GAME_CONFIG.WEAPONS.GRENADE_THROW.CHARGE_BAR`.

## Current Deliberate Reuse

- `grenade.png` is both the grenade pickup and grenade projectile.
- `explosion.png` is a single effect source for all explosions.
- Temporary placeholders are acceptable during early phases, but filenames and frame sizes should already match this contract.
