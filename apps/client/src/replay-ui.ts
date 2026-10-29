import { replayPolicy } from "./replay-policy.js";
import type { ReplayVerification } from "./replay-validation.js";
import type { BattleState } from "../../../packages/battle-core/src/index.js";
export function mountReplayVerifier(toolbar: Element, before: Element) {
  const opener = document.createElement("button");
  opener.id = "verify-log";
  opener.textContent = "저장 로그 검증";
  toolbar.append(opener);
  const panel = document.createElement("details");
  panel.id = "replay-check";
  panel.className = "replay-check";
  panel.innerHTML =
    '<summary>저장 전투 로그 · 재현 검증</summary><p>다운로드한 전투 로그 JSON을 선택하세요. 현재 엔진으로 입력을 재현합니다. (2대2 데모 · 최대 10MiB)</p><label>전투 로그 JSON <input id="replay-file" type="file" accept=".json,application/json"></label><button id="replay-cancel" disabled>검증 취소</button><p id="replay-file-name"></p><p id="replay-status" role="status" data-verdict="idle">파일을 선택하면 검증을 시작합니다.</p><div id="replay-report"></div><section id="replay-player" hidden aria-label="전투 로그 재생"><h3>전투 기록 재생</h3><canvas id="replay-canvas" width="640" height="360" aria-label="부대 위치와 잔존 병력을 나타낸 전투 지도"></canvas><div class="replay-controls"><button id="replay-play">재생</button><button id="replay-back">−1 tick</button><button id="replay-forward">+1 tick</button><button id="replay-prev-command" disabled>이전 명령</button><button id="replay-next-command" disabled>다음 명령</button><label>시점 <input id="replay-seek" type="range" min="0" max="0" value="0"></label><output id="replay-time">0 tick</output></div><p>검증된 기록의 부대 위치·잔존 병력 요약입니다. 현재 전투에는 영향을 주지 않습니다.</p></section>';
  before.before(panel);
  const input = panel.querySelector<HTMLInputElement>("#replay-file")!,
    cancel = panel.querySelector<HTMLButtonElement>("#replay-cancel")!;
  const status = panel.querySelector<HTMLElement>("#replay-status")!,
    report = panel.querySelector<HTMLElement>("#replay-report")!;
  const player = panel.querySelector<HTMLElement>("#replay-player")!,
    canvas = panel.querySelector<HTMLCanvasElement>("#replay-canvas")!,
    seek = panel.querySelector<HTMLInputElement>("#replay-seek")!,
    play = panel.querySelector<HTMLButtonElement>("#replay-play")!,
    time = panel.querySelector<HTMLOutputElement>("#replay-time")!;
  let generation = 0,
    worker: Worker | null = null,
    timer: ReturnType<typeof setTimeout> | undefined,
    playback: ReturnType<typeof setInterval> | undefined,
    current = 0,
    pending = false,
    desired: number | null = null,
    commandTicks: number[] = [];
  const prevCommand = panel.querySelector<HTMLButtonElement>(
    "#replay-prev-command",
  )!;
  const nextCommand = panel.querySelector<HTMLButtonElement>(
    "#replay-next-command",
  )!;
  const updateCommandButtons = () => {
    prevCommand.disabled = !commandTicks.some((tick) => tick < current);
    nextCommand.disabled = !commandTicks.some((tick) => tick > current);
  };
  const pause = () => {
    if (playback !== undefined) clearInterval(playback);
    playback = undefined;
    play.textContent = "재생";
  };
  function request(tick: number) {
    if (!worker) return;
    if (pending) {
      desired = tick;
      return;
    }
    pending = true;
    worker.postMessage({ seek: Math.max(0, Math.min(Number(seek.max), tick)) });
  }
  function draw(state: BattleState) {
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ede2c6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#b9a983";
    ctx.strokeRect(22, 20, 596, 320);
    const scale = state.config.positionUnitsPerTile;
    for (const squad of state.squads) {
      const x = 30 + (squad.position.x / scale) * 24;
      const y = 25 + (squad.position.y / scale) * 24;
      ctx.fillStyle =
        squad.hpMilli <= 0
          ? "#777"
          : squad.nationId === "blue"
            ? "#286b9a"
            : "#ad4b36";
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "13px sans-serif";
      ctx.fillStyle = "#222";
      ctx.fillText(
        `${squad.id} · ${Math.ceil(squad.hpMilli / (state.config.soldierHp * state.config.hpMilliPerHp))}명`,
        x + 13,
        y + 5,
      );
    }
  }
  const stop = () => {
    pause();
    pending = false;
    desired = null;
    commandTicks = [];
    updateCommandButtons();
    worker?.terminate();
    worker = null;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const finish = (id: number, result: ReplayVerification) => {
    if (id !== generation) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (result.status !== "match") {
      stop();
      player.hidden = true;
    }
    cancel.disabled = true;
    panel.setAttribute("aria-busy", "false");
    input.value = "";
    status.dataset.verdict = result.status;
    report.textContent = "";
    if (result.status === "invalid") {
      status.dataset.code = result.code;
      status.textContent = result.message;
      return;
    }
    delete status.dataset.code;
    status.textContent = `${result.status === "match" ? "재현 일치" : "재현 불일치"} · ${result.tick}tick · 입력 ${result.commands}개`;
    if (result.status === "match") {
      player.hidden = false;
      seek.max = String(result.frames);
      current = 0;
      updateCommandButtons();
      request(0);
    }
    report.innerHTML = `<p>시드 ${result.seed} · 기록 ${result.frames}tick</p><div class="replay-table-wrap"><table><caption>현재 엔진 재현 대조</caption><thead><tr><th>항목</th><th>결과</th><th>저장된 값</th><th>재현한 값</th></tr></thead><tbody><tr><th>최종 상태</th><td>${result.stateMatches ? "일치" : "불일치"}</td><td><code>${result.expectedStateHash}</code></td><td><code>${result.actualStateHash}</code></td></tr><tr><th>사건 기록</th><td>${result.eventMatches ? "일치" : "불일치"}</td><td><code>${result.expectedEventHash}</code></td><td><code>${result.actualEventHash}</code></td></tr></tbody></table></div>`;
  };
  play.addEventListener("click", () => {
    if (playback !== undefined) {
      pause();
      return;
    }
    play.textContent = "일시정지";
    playback = setInterval(() => {
      if (current >= Number(seek.max)) {
        pause();
        return;
      }
      request(current + 1);
    }, 100);
  });
  seek.addEventListener("input", () => {
    pause();
    request(Number(seek.value));
  });
  panel.querySelector("#replay-back")!.addEventListener("click", () => {
    pause();
    request(current - 1);
  });
  panel.querySelector("#replay-forward")!.addEventListener("click", () => {
    pause();
    request(current + 1);
  });
  prevCommand.addEventListener("click", () => {
    pause();
    request(commandTicks.filter((tick) => tick < current).at(-1) ?? current);
  });
  nextCommand.addEventListener("click", () => {
    pause();
    request(commandTicks.find((tick) => tick > current) ?? current);
  });
  opener.addEventListener("click", () => {
    panel.open = true;
    panel.scrollIntoView({ block: "start" });
    input.focus({ preventScroll: true });
  });
  cancel.addEventListener("click", () => {
    generation++;
    stop();
    player.hidden = true;
    cancel.disabled = true;
    input.value = "";
    panel.setAttribute("aria-busy", "false");
    status.dataset.verdict = "cancelled";
    delete status.dataset.code;
    status.textContent = "검증을 취소했습니다.";
    report.textContent = "";
  });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const id = ++generation;
    stop();
    player.hidden = true;
    report.textContent = "";
    panel.querySelector<HTMLElement>("#replay-file-name")!.textContent =
      file.name;
    if (file.size > replayPolicy.maxBytes) {
      finish(id, {
        status: "invalid",
        code: "LIMIT",
        message: "파일이 10MiB 제한을 넘었습니다.",
      });
      return;
    }
    cancel.disabled = false;
    panel.setAttribute("aria-busy", "true");
    status.dataset.verdict = "running";
    delete status.dataset.code;
    status.textContent = "입력 재현·기록 대조 중…";
    try {
      const text = await file.text();
      if (id !== generation) return;
      worker = new Worker(new URL("./replay-worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (
        event: MessageEvent<
          | ReplayVerification
          | { type: "frame"; tick: number; state: BattleState }
          | { type: "commands"; ticks: number[] }
        >,
      ) => {
        if (id !== generation) return;
        if ("type" in event.data && event.data.type === "commands") {
          commandTicks = event.data.ticks;
          updateCommandButtons();
          return;
        }
        if ("type" in event.data && event.data.type === "frame") {
          pending = false;
          current = event.data.tick;
          updateCommandButtons();
          seek.value = String(current);
          time.textContent = `${current} tick · ${((current * event.data.state.config.tickMs) / 1000).toFixed(1)}초`;
          draw(event.data.state);
          if (desired !== null) {
            const next = desired;
            desired = null;
            request(next);
          }
        } else finish(id, event.data as ReplayVerification);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        finish(id, {
          status: "invalid",
          code: "WORKER",
          message: "검증 작업을 실행할 수 없습니다.",
        });
      };
      timer = setTimeout(
        () =>
          finish(id, {
            status: "invalid",
            code: "TIMEOUT",
            message:
              "검증 시간이 초과되었습니다. 더 짧은 기록으로 다시 시도하세요.",
          }),
        replayPolicy.timeoutMs,
      );
      worker.postMessage(text);
    } catch {
      finish(id, {
        status: "invalid",
        code: "READ",
        message: "파일을 읽거나 검증 작업을 시작할 수 없습니다.",
      });
    }
  });
}
