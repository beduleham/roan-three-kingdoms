import { verifyReplayText } from "./replay-validation.js";
self.addEventListener("message", (event: MessageEvent<string>) => {
  self.postMessage(verifyReplayText(event.data));
});
