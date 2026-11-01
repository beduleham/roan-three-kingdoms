import settings from "./presentation-settings.json";
export class RenderPerformance {
  private paint: number[] = [];
  private intervals: number[] = [];
  private last: number | undefined;
  frames = 0;
  minimapPaints = 0;
  pause() {
    this.last = undefined;
  }
  record(start: number, end: number) {
    if (this.last !== undefined) this.intervals.push(start - this.last);
    this.last = start;
    this.paint.push(Math.max(0, end - start));
    this.frames++;
    this.paint = this.paint.slice(-settings.performanceSamples);
    this.intervals = this.intervals.slice(-settings.performanceSamples);
  }
  summary() {
    const p = [...this.paint].sort((a, b) => a - b),
      i = this.intervals;
    return {
      frames: this.frames,
      minimapPaints: this.minimapPaints,
      samples: p.length,
      paintP50Ms: p[Math.floor((p.length - 1) * 0.5)] ?? 0,
      paintP95Ms: p[Math.floor((p.length - 1) * 0.95)] ?? 0,
      observedFps: i.length
        ? 1000 / (i.reduce((a, b) => a + b, 0) / i.length)
        : 0,
      targetFrameMs: settings.frameMs,
    };
  }
}
