import { Client } from "@colyseus/sdk";
import {
  hashReplayValue,
  livingSoldiers,
} from "../../../packages/battle-core/src/index.js";
import type { BattleState } from "../../../packages/battle-core/src/index.js";
import { applyStateDelta, type StateDelta } from "@roan/protocol";
import "@fontsource/noto-sans-kr/400.css";
import "./style.css";

const root = document.querySelector<HTMLElement>("#online")!;
root.innerHTML = `<header><h1>로언 베이의 삼국지 · 서버 권위 1대1</h1><span>각 2부대 · 실험 시연</span></header>
<p>두 브라우저에서 이 페이지를 열어 각각 한 진영에 접속하세요. 서버가 100ms마다 전투를 계산합니다.</p>
<button id="join">경기 접속</button> <span id="connection" role="status">접속 대기</span>
<p id="identity"></p><p id="clock"></p><canvas id="field" width="720" height="420" style="width:100%;max-width:720px;background:#efe3c8"></canvas>
<div><label>내 부대 <select id="squad"></select></label> <label>대상 <select id="target"></select></label>
<button id="attack" disabled>대상 공격</button> <button id="advance" disabled>중앙으로 이동</button></div>
<p id="result" role="status"></p><h2>서버 상태</h2><pre id="units"></pre><p>두 화면의 tick·상태 해시가 같아야 합니다. 각 브라우저는 자기 진영에만 명령을 보낼 수 있습니다.</p>`;
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const tokenKey = "roan-online-reconnection";
let seat: "blue" | "red" | null = null;
let room: Awaited<ReturnType<Client["joinOrCreate"]>> | null = null;
let state: BattleState | null = null;
let previousState: BattleState | null = null;
let receivedAt = 0;
let awaitingSnapshot = false;
let drawing = false;
const canvas = el<HTMLCanvasElement>("field"),
  ctx = canvas.getContext("2d")!;
function render() {
  if (!state) return;
  el("clock").textContent =
    `${state.tick} tick · 상태 해시 ${hashReplayValue(state)}`;
  el("units").textContent = state.squads
    .map(
      (s) =>
        `${s.id}: ${livingSoldiers(s, state!.config)}명 · HP ${s.hpMilli} · 사기 ${s.morale} · 전열 ${s.cohesion} · ${s.fsmState}`,
    )
    .join("\n");
  const own = state.squads.filter((s) => s.ownerPlayerId === seat);
  const enemy = state.squads.filter((s) => s.ownerPlayerId !== seat);
  for (const [id, squads] of [
    ["squad", own],
    ["target", enemy],
  ] as const) {
    const select = el<HTMLSelectElement>(id),
      previous = select.value;
    if (select.options.length !== squads.length)
      select.replaceChildren(...squads.map((s) => new Option(s.id, s.id)));
    if (squads.some((s) => s.id === previous)) select.value = previous;
  }
}
function draw() {
  if (!state) return;
  const alpha = Math.min(1, (performance.now() - receivedAt) / 200);
  ctx.fillStyle = "#efe3c8";
  ctx.fillRect(0, 0, 720, 420);
  for (const s of state.squads) {
    const old = previousState?.squads.find((p) => p.id === s.id);
    const xUnits = old
      ? old.position.x + (s.position.x - old.position.x) * alpha
      : s.position.x;
    const yUnits = old
      ? old.position.y + (s.position.y - old.position.y) * alpha
      : s.position.y;
    const x = 40 + (xUnits / state.config.positionUnitsPerTile) * 30;
    const y = 40 + (yUnits / state.config.positionUnitsPerTile) * 30;
    if (s.id === "blue-1") root.dataset.renderX = String(x);
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fillStyle = s.nationId === "blue" ? "#286b9a" : "#ae4a36";
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.font = "14px sans-serif";
    ctx.fillText(s.id, x + 20, y + 4);
  }
  requestAnimationFrame(draw);
}
el("join").addEventListener("click", async () => {
  el<HTMLButtonElement>("join").setAttribute("disabled", "");
  try {
    const address =
      new URLSearchParams(location.search).get("server") ??
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;
    const client = new Client(address);
    const token = sessionStorage.getItem(tokenKey);
    if (token) {
      try {
        room = await client.reconnect(token);
      } catch {
        sessionStorage.removeItem(tokenKey);
      }
    }
    room ??= await client.joinOrCreate("battle_1v1");
    sessionStorage.setItem(tokenKey, room.reconnectionToken);
    root.dataset.roomId = room.roomId;
    el("connection").textContent = `접속됨 · Room ${room.roomId}`;
    room.onMessage("seat", ({ seat: assigned }: { seat: "blue" | "red" }) => {
      seat = assigned;
      el("identity").textContent = `내 진영: ${assigned}`;
      el<HTMLButtonElement>("attack").disabled = false;
      el<HTMLButtonElement>("advance").disabled = false;
      render();
    });
    room.onMessage("ready", ({ ready }: { ready: boolean }) => {
      el("connection").textContent = ready
        ? "두 플레이어 접속 · 전투 진행"
        : "상대 접속 대기";
    });
    room.onMessage("snapshot", ({ state: next }: { state: BattleState }) => {
      state = next;
      previousState = null;
      receivedAt = performance.now();
      awaitingSnapshot = false;
      render();
      if (!drawing) {
        drawing = true;
        draw();
      }
    });
    room.onMessage("delta", (delta: StateDelta) => {
      if (!state || awaitingSnapshot) return;
      if (state.tick !== delta.baseTick) {
        awaitingSnapshot = true;
        room?.send("hello");
        return;
      }
      let next: BattleState;
      try {
        next = applyStateDelta(state, delta.changes);
      } catch {
        awaitingSnapshot = true;
        room?.send("hello");
        return;
      }
      if (next.tick !== delta.tick || hashReplayValue(next) !== delta.hash) {
        awaitingSnapshot = true;
        room?.send("hello");
        return;
      }
      previousState = state;
      state = next;
      receivedAt = performance.now();
      root.dataset.deltaCount = String(
        Number(root.dataset.deltaCount ?? 0) + 1,
      );
      render();
    });
    room.onMessage(
      "command-result",
      (response: { accepted: boolean; reason?: string }) => {
        el("result").textContent = response.accepted
          ? "명령 접수 · 다음 tick에 검증"
          : `서버 거부: ${response.reason}`;
      },
    );
    room.onDrop(() => {
      el("connection").textContent = "연결 복구 중 · 전투 일시 중지";
      el<HTMLButtonElement>("attack").disabled = true;
      el<HTMLButtonElement>("advance").disabled = true;
    });
    room.onReconnect(() => {
      sessionStorage.setItem(tokenKey, room!.reconnectionToken);
      room?.send("hello");
    });
    room.onLeave(() => {
      room = null;
      seat = null;
      state = null;
      previousState = null;
      drawing = false;
      sessionStorage.removeItem(tokenKey);
      el("connection").textContent = "연결 종료";
      el("identity").textContent = "";
      el("clock").textContent = "";
      el<HTMLButtonElement>("attack").disabled = true;
      el<HTMLButtonElement>("advance").disabled = true;
      el<HTMLButtonElement>("join").disabled = false;
    });
    room.send("hello");
  } catch (error) {
    el("connection").textContent = `접속 실패: ${String(error)}`;
    el<HTMLButtonElement>("join").disabled = false;
  }
});
el("attack").addEventListener("click", () =>
  room?.send("command", {
    type: "ATTACK",
    squadIds: [el<HTMLSelectElement>("squad").value],
    targetSquadId: el<HTMLSelectElement>("target").value,
  }),
);
el("advance").addEventListener("click", () =>
  room?.send("command", {
    type: "ATTACK_MOVE",
    squadIds: [el<HTMLSelectElement>("squad").value],
    destination: { x: 10000, y: 6500 },
  }),
);
