import { createServer, connect } from "node:net";
import { performance } from "node:perf_hooks";

/** Test-only ordered TCP proxy. Delays real HTTP/WS bytes; never edits game messages. */
export class FaultProxy {
  sockets = new Set();
  blocked = false;
  sequence = 0;
  delayedChunks = 0;
  constructor(targetPort, delays = [0]) {
    this.targetPort = targetPort;
    this.delays = delays;
    this.server = createServer((downstream) => {
      if (this.blocked) {
        downstream.destroy();
        return;
      }
      const upstream = connect({ host: "127.0.0.1", port: this.targetPort });
      const timers = new Set();
      for (const socket of [downstream, upstream]) {
        this.sockets.add(socket);
        socket.on("error", () => {
          downstream.destroy();
          upstream.destroy();
        });
        socket.on("close", () => {
          this.sockets.delete(socket);
          downstream.destroy();
          upstream.destroy();
          for (const timer of timers) clearTimeout(timer);
        });
      }
      const relay = (source, destination) => {
        let due = 0;
        source.on("data", (chunk) => {
          const delay = this.delays[this.sequence++ % this.delays.length];
          if (delay > 0) this.delayedChunks++;
          due = Math.max(due + 1, performance.now() + delay);
          const timer = setTimeout(
            () => {
              timers.delete(timer);
              if (
                !destination.destroyed &&
                !this.blocked &&
                !destination.write(chunk)
              ) {
                source.pause();
                destination.once("drain", () => source.resume());
              }
            },
            Math.max(0, due - performance.now()),
          );
          timers.add(timer);
        });
      };
      relay(downstream, upstream);
      relay(upstream, downstream);
    });
  }
  async listen() {
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", resolve);
    });
    this.port = this.server.address().port;
    return this;
  }
  setBlocked(blocked) {
    this.blocked = blocked;
    if (blocked) for (const socket of this.sockets) socket.destroy();
  }
  async close() {
    this.setBlocked(true);
    await new Promise((resolve) => this.server.close(resolve));
  }
}
