import { verifyReplayText } from "./replay-validation.js";
import { commandResultTicks, replayAtTick } from "./replay-seek.js";
import type {
  BattleInput,
  BattleState,
} from "../../../packages/battle-core/src/index.js";
let frames: BattleInput[][] = [];
let checkpoints = new Map<number, BattleState>();
self.addEventListener(
  "message",
  (event: MessageEvent<string | { seek: number }>) => {
    if (typeof event.data === "string") {
      frames = [];
      checkpoints = new Map();
      const result = verifyReplayText(event.data);
      if (result.status === "match") {
        const log = JSON.parse(event.data) as {
          initial: BattleState;
          frames: BattleInput[][];
        };
        frames = log.frames;
        checkpoints.set(0, log.initial);
        self.postMessage({
          type: "commands",
          ticks: commandResultTicks(frames),
        });
      }
      self.postMessage(result);
      return;
    }
    const state = replayAtTick(frames, checkpoints, event.data.seek);
    if (state)
      self.postMessage({ type: "frame", tick: event.data.seek, state });
  },
);
