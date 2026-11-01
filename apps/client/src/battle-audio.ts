import type { Cue } from "./battle-presentation.js";
import settings from "./presentation-settings.json";
const notes: Record<Cue, number[]> = {
  hit: [145],
  Q: [170, 255],
  W: [330, 440],
  R: [220, 330, 440],
  rout: [190, 125],
  wounded: [150, 110],
  end: [262, 330, 392],
};
/** Synthesized cues are optional and start only from the explicit user gesture. */
export class BattleAudio {
  private context: AudioContext | null = null;
  private voices = new Set<OscillatorNode>();
  private last = -Infinity;
  enabled = false;
  volume = 0.25;
  async enable() {
    this.context ??= new AudioContext();
    await this.context.resume();
    this.enabled = true;
  }
  mute() {
    this.enabled = false;
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        /* already ended */
      }
    }
    this.voices.clear();
  }
  play(cues: Cue[], visible: boolean) {
    const ctx = this.context;
    if (
      this.volume <= 0 ||
      !this.enabled ||
      !visible ||
      !ctx ||
      ctx.state !== "running" ||
      !cues.length
    )
      return;
    if (ctx.currentTime - this.last < settings.cueSpacingMs / 1000) return;
    const cue = (
      ["end", "R", "Q", "W", "wounded", "rout", "hit"] as Cue[]
    ).find((c) => cues.includes(c))!;
    this.last = ctx.currentTime;
    for (const [i, f] of notes[cue].entries()) {
      if (this.voices.size >= settings.maxVoices) break;
      const osc = ctx.createOscillator(),
        gain = ctx.createGain(),
        start = ctx.currentTime + i * 0.06;
      osc.type = cue === "hit" ? "triangle" : "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(
        Math.max(0, Math.min(1, this.volume)) * 0.13,
        start + 0.015,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      this.voices.add(osc);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
        this.voices.delete(osc);
      };
      osc.start(start);
      osc.stop(start + 0.22);
    }
  }
}
