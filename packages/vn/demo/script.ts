// A small sample script that exercises every basic feature: a background, showing a character with
// changing expressions, narration vs. spoken lines, a branching menu, exec hooks that mutate vars,
// and hide. Uses the placeholder Sylvie/meadow art (see assets.ts).

import { script } from "../src/index";

import { playAmbient, playMusic, playSting } from "./audio";

export const demoScript = script()
  .label("start")
  // Semi-transparent backdrop so the live 3D "game" scene shows through behind it — demonstrating
  // the VN-over-game sandwich. Drop the alpha (or the bg entirely) for an opaque cutscene.
  .show("bg", "bg-meadow", { layer: "bg", at: { z: 0, alpha: 0.55 } })
  // Establishing beat: the scene, no one on screen yet.
  .say(
    "Afternoon light spills across the meadow. You asked her to meet here, away from the others.",
  )
  // Persistent background music — starts here (after the first click, so the browser allows audio)
  // and plays until we change it. Fire-and-forget exec, no cleanup; the host tracks "now playing".
  .exec(playMusic("music-meadow"))
  // She slides in from the left wing as the next line brings her on.
  .show("sylvie", "sylvie-normal", { at: { x: 0.5, z: 1 }, enter: { from: "left" } })
  .say("Sylvie", "Hey. Thanks for coming all the way out here.")
  .show("sylvie", "sylvie-smile", { at: { x: 0.5, z: 1 } })
  // Transient ambient: a ticking clock under this beat only — onLeave stops it when you advance.
  .exec(playAmbient("ambient-clock"))
  .say("Sylvie", "I've been meaning to ask you something for a while now.")
  .menu("How do you respond?", [
    { text: "“Ask me anything.”", target: "warm" },
    { text: "“...Is everything okay?”", target: "cautious" },
  ])

  .label("warm")
  // One-shot sting on the choice.
  .exec(playSting("sfx-select"))
  .exec((ctx) => {
    ctx.vars.bond = (Number(ctx.vars.bond) || 0) + 1;
  })
  .show("sylvie", "sylvie-giggle", { at: { x: 0.5, z: 1 } })
  .say("Sylvie", "Heh. You always make it sound so easy.")
  .jump("ask")

  .label("cautious")
  .exec(playSting("sfx-select"))
  .show("sylvie", "sylvie-surprised", { at: { x: 0.5, z: 1 } })
  .say("Sylvie", "What? No — nothing's wrong. Don't look so worried!")
  .jump("ask")

  .label("ask")
  .show("sylvie", "sylvie-normal", { at: { x: 0.5, z: 1 } })
  .say("Sylvie", "Would you want to start a club together? Just the two of us, to begin with.")

  // `fade` transition: a veil fades out and back in — a time skip.
  .with({ kind: "fade", durationMs: 800 })
  .say("You spend the afternoon talking it over.")

  // `dissolve` transition: the meadow backdrop crossfades to the clubroom under her — and the music
  // crossfades to a new track (persistent music change; the host swaps "now playing").
  .show("bg", "bg-club", { layer: "bg", at: { z: 0, alpha: 0.55 } })
  .with({ kind: "dissolve", durationMs: 700 })
  .exec(playMusic("music-club"))
  .say("By evening, the old clubroom is yours — dusty, and perfect.")
  .show("sylvie", "sylvie-smile", { at: { x: 0.5, z: 1 } })
  .say("Sylvie", "Our first member. I'll put the kettle on.")
  .hide("sylvie")
  .say("She slips out for the tea, humming.")
  .say("— end of demo —")
  .build();
