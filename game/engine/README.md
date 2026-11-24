# Noir City · simulation

The simulation runs in logical pixels with a 480 × 270 camera and sixty fixed ticks per second. A run owns its world, timers and encounter state. Menus, audio playback, input-device polling and drawing remain outside the simulation. The public entry point is `index.js`.

## Routes and encounters

Edit `content.js` to author terrain districts and arrange them into a route. The 14 campaign routes combine 20 or 21 districts, two traversal elevations, pickups, usable rail or spring shortcuts, hazards, checkpoints and a guarded exit. Height samples are interpolated along horizontal distance. Loops use a circular tangent with continuous position, velocity and an optional jump release. Lifts expose an animated collision surface. Gaps have raised alternate paths and a lower recovery spring.

The seven short trials reuse the side view with different beacon rules. The engine exposes each beacon’s input affordance as `trigger`. Chrome collects. Acid jumps through spring beacons. Noir activates beacons. Afterimage chains eight beacons before the chain expires. Alloy strikes or dashes. Aura traverses a low-gravity aerial route. Unseen alternates activation, striking and jumping. Each trial has a timer before its guardian, a quota and a core awarded on clearing the exit.

Boss definitions select a machine, a sequence of attacks, a vulnerability window and health. Each attack passes through a visible telegraph, attack and vulnerability interval. A successful hit closes the exposed assembly, so repeated attacks must follow separate openings. A crouched character can pass beneath elevated beams. The final machine has three phases. Reaching its third phase transforms the character. If energy runs out the player can replenish it by running and transform again. The secret stage requires seven cores and Vela’s ordinary ending. Other characters can enter after it unlocks.

## Independent checks

Run `node --test game/engine/engine.test.mjs`. The route test drives the same fixed timestep and controller booleans as gameplay. Its driver never moves an actor or bypasses a gate. Dedicated small tests do use positioned fixtures to isolate checkpoint, portal and combat edge cases. The driver and tests have no imports from the runtime entry point and must stay outside the public game distribution.

On the development Mac, all 105 stage/character combinations reached their exits with the required bosses defeated. Additional runs cleared all sixteen consecutive Rush bosses with each character, verified the secret gate, and checked Time Attack records. Automated campaign times were 101–179 simulated seconds, bonus runs 21–33 seconds and Rush 230–273 seconds. These measurements describe the input driver. First-play duration, combat readability and typical player difficulty still need human playtests. Actual frame pacing and device compatibility must be checked by the browser harness.
