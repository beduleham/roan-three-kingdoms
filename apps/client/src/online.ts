import { Client } from "@colyseus/sdk";
import {
  hashReplayValue,
  livingSoldiers,
} from "../../../packages/battle-core/src/index.js";
import type { BattleState } from "../../../packages/battle-core/src/index.js";
import { applyStateDelta, type StateDelta } from "@roan/protocol";
import "@fontsource/noto-sans-kr/400.css";
import "./style.css";
import "./online.css";

const root = document.querySelector<HTMLElement>("#online")!;
const mode =
  new URLSearchParams(location.search).get("mode") === "3v3" ? "3v3" : "1v1";
root.innerHTML = `<header><h1>로언 베이의 삼국지 · 온라인 ${mode === "3v3" ? "3대3" : "1대1"}</h1><span>서버 권위 전투 시연</span></header>
<p><a href="/online.html">1대1</a> · <a href="/online.html?mode=3v3">3대3 로비</a> | 서버 10Hz · 동기화 5Hz</p>
<button id="join">빠른 접속 / 초대 입장</button> <button id="create-private">새 초대 전용 경기</button> <span id="connection" role="status">접속 대기</span><p id="invite" hidden>초대 링크 (링크 소지자 입장): <a id="invite-link"></a> <button id="copy-invite">복사</button> <button id="rotate-invite" disabled>초대 링크 재발급</button></p>
<section id="lobby-panel" ${mode === "1v1" ? "hidden" : ""}><h2>경기 로비</h2><p id="lobby"></p><button id="start" disabled>빈자리를 AI로 채워 시작</button></section>
<p id="identity"></p><p id="clock"></p><p>전장에서 아군·적군을 클릭해 선택하고, 빈 땅을 클릭해 목적지를 지정하세요.</p><canvas id="field" width="720" height="420"></canvas>
<section class="online-controls"><h2>전술 명령</h2><label>내 부대 <select id="squad"></select></label> <label>적 대상 <select id="target"></select></label>
<label>목적지 X (타일) <input id="dest-x" type="number" value="10" min="0" max="24"></label>
<label>Y (타일) <input id="dest-y" type="number" value="6" min="0" max="13"></label>
<div class="online-actions"><button id="move" data-command disabled>이동</button><button id="attack" data-command disabled>대상 공격</button><button id="advance" data-command disabled>공격 이동</button><button id="retreat" data-command disabled>후퇴</button></div>
<label>태세 <select id="stance"><option value="defensive">방어</option><option value="balanced">균형</option><option value="aggressive">공격</option></select></label><button id="applyStance" data-command disabled>태세 변경</button>
<label>진형 <select id="formation"><option value="normal">기본</option><option value="defense">방어진</option><option value="offense">공격진</option></select></label><button id="applyFormation" data-command disabled>진형 변경</button>
<button id="reassign" data-command disabled>장수 재배속</button>
<div class="online-actions"><button id="Q" data-command disabled>Q 돌격</button><button id="W" data-command disabled>W 함성</button><button id="R" data-command disabled>R 파죽지세</button></div></section>
<p id="result" role="status"></p><h2>서버 상태</h2><p id="selected"></p><p id="commander"></p><pre id="units"></pre><h2>최근 전투 사건</h2><pre id="events"></pre>
<p>명령은 서버에서 검증됩니다. 화면 위치만 두 서버 상태 사이에서 보간합니다.</p>`;
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
let inviteKey = new URLSearchParams(location.hash.slice(1)).get("invite");
const tokenKey = () =>
  `roan-online-reconnection-${mode}-${params.get("room") ?? "quick"}`;
let seat: string | null = null;
let host = false;
let ready = false;
let lobbyStarted = mode === "1v1";
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
        `${s.id}: ${livingSoldiers(s, state!.config)}명 · HP ${s.hpMilli} · 사기 ${s.morale} · 전열 ${s.cohesion} · ${s.fsmState} · ${s.stance}/${s.formation}`,
    )
    .join("\n");
  const own = state.squads.filter((s) => s.ownerPlayerId === seat);
  const enemy = state.squads.filter((s) => s.nationId !== seat?.split("-")[0]);
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
  const commander = state.commanders.find((c) => c.ownerPlayerId === seat);
  el("commander").textContent = commander
    ? `장수 ${commander.status} · HP ${commander.hpMilli} · 본대 ${commander.assignedSquadId ?? "없음"} · Q/W/R 대기 ${["Q", "W", "R"].map((skill) => commander.cooldownTicks[skill as "Q" | "W" | "R"]).join("/")} tick`
    : "";
  const selected = own.find(
    (s) => s.id === el<HTMLSelectElement>("squad").value,
  );
  el("selected").textContent = selected
    ? `선택 ${selected.id} · 병력 ${livingSoldiers(selected, state.config)}/${selected.maxSoldiers} · HP ${selected.hpMilli} · 사기 ${selected.morale} · 전열 ${selected.cohesion} · ${selected.fsmState}`
    : "";
  for (const skill of ["Q", "W", "R"] as const) {
    const button = el<HTMLButtonElement>(skill);
    button.disabled =
      !ready ||
      !commander ||
      commander.status !== "ACTIVE" ||
      commander.cooldownTicks[skill] > 0;
    button.title = commander?.cooldownTicks[skill]
      ? `대기 ${commander.cooldownTicks[skill]} tick`
      : "";
  }
}
function refreshControls() {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-command]",
  ))
    button.disabled = !ready;
  el<HTMLButtonElement>("start").disabled = !host || lobbyStarted;
  el<HTMLButtonElement>("rotate-invite").disabled =
    !host || !inviteKey || !room;
  render();
}
function updateInviteLink() {
  const hash = inviteKey ? `#invite=${encodeURIComponent(inviteKey)}` : "";
  history.replaceState(
    null,
    "",
    `${location.pathname}?${params.toString()}${hash}`,
  );
  el("invite").hidden = false;
  const link = el<HTMLAnchorElement>("invite-link");
  link.href = location.href;
  link.textContent = location.href;
}
function send(command: Record<string, unknown>) {
  if (!room || !ready) return;
  room.send("command", {
    squadIds: [el<HTMLSelectElement>("squad").value],
    ...command,
  });
}
function destination() {
  const scale = state?.config.positionUnitsPerTile ?? 1000;
  return {
    x: Number(el<HTMLInputElement>("dest-x").value) * scale,
    y: Number(el<HTMLInputElement>("dest-y").value) * scale,
  };
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
    if (s.id === (mode === "3v3" ? "blue-1-1" : "blue-1"))
      root.dataset.renderX = String(x);
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fillStyle = s.nationId === "blue" ? "#286b9a" : "#ae4a36";
    ctx.fill();
    if (
      s.id ===
      el<HTMLSelectElement>(s.ownerPlayerId === seat ? "squad" : "target").value
    ) {
      ctx.strokeStyle = "#e8bd51";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.fillStyle = "#222";
    ctx.font = "14px sans-serif";
    ctx.fillText(s.id, x + 20, y + 4);
  }
  requestAnimationFrame(draw);
}
canvas.addEventListener("click", (event) => {
  if (!state || !seat) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) * canvas.width) / rect.width;
  const y = ((event.clientY - rect.top) * canvas.height) / rect.height;
  const hit = state.squads
    .filter((s) => s.hpMilli > 0)
    .map((s) => ({
      s,
      distance: Math.hypot(
        x - (40 + (s.position.x / state!.config.positionUnitsPerTile) * 30),
        y - (40 + (s.position.y / state!.config.positionUnitsPerTile) * 30),
      ),
    }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (hit && hit.distance <= 25) {
    if (hit.s.ownerPlayerId === seat)
      el<HTMLSelectElement>("squad").value = hit.s.id;
    else if (hit.s.nationId !== seat.split("-")[0])
      el<HTMLSelectElement>("target").value = hit.s.id;
    render();
  } else {
    el<HTMLInputElement>("dest-x").value = String(
      Math.max(0, Math.round((x - 40) / 30)),
    );
    el<HTMLInputElement>("dest-y").value = String(
      Math.max(0, Math.round((y - 40) / 30)),
    );
  }
});
async function connect(createPrivate = false) {
  el<HTMLButtonElement>("join").setAttribute("disabled", "");
  el<HTMLButtonElement>("create-private").setAttribute("disabled", "");
  el("connection").textContent = "접속 중";
  if (!createPrivate)
    inviteKey = new URLSearchParams(location.hash.slice(1)).get("invite");
  try {
    const address =
      new URLSearchParams(location.search).get("server") ??
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;
    const client = new Client(address);
    const token = createPrivate ? null : sessionStorage.getItem(tokenKey());
    if (token) {
      try {
        room = await client.reconnect(token);
      } catch {
        sessionStorage.removeItem(tokenKey());
      }
    }
    const roomName = mode === "3v3" ? "battle_3v3" : "battle_1v1";
    if (!room) {
      room = createPrivate
        ? await client.create(roomName, {
            inviteOnly: true,
            creatorProof: Array.from(
              crypto.getRandomValues(new Uint8Array(32)),
              (byte) => byte.toString(16).padStart(2, "0"),
            ).join(""),
          })
        : params.get("room")
          ? await client.joinById(params.get("room")!, { inviteKey })
          : await client.joinOrCreate(roomName);
    }
    if (room.name !== roomName) {
      await room.leave();
      room = null;
      throw new Error("초대 링크의 경기 종류가 다릅니다");
    }
    params.set("room", room.roomId);
    if (createPrivate) inviteKey = null;
    updateInviteLink();
    sessionStorage.setItem(tokenKey(), room.reconnectionToken);
    root.dataset.roomId = room.roomId;
    el("connection").textContent = `접속됨 · Room ${room.roomId}`;
    room.onMessage("invite-key", ({ key }: { key: string }) => {
      inviteKey = key;
      updateInviteLink();
      refreshControls();
    });
    room.onMessage(
      "invite-result",
      ({ accepted, reason }: { accepted: boolean; reason?: string }) => {
        el("result").textContent = accepted
          ? "초대 링크 재발급 완료 · 이전 링크는 입장 불가"
          : `초대 변경 거부: ${reason}`;
      },
    );
    room.onMessage(
      "seat",
      ({ seat: assigned, host: isHost }: { seat: string; host: boolean }) => {
        seat = assigned;
        host = isHost;
        el("identity").textContent = `내 진영: ${assigned}`;
        refreshControls();
      },
    );
    room.onMessage(
      "lobby",
      (lobby: {
        started: boolean;
        slots: { id: string; occupant: string }[];
      }) => {
        lobbyStarted = lobby.started;
        el("lobby").textContent = lobby.slots
          .map((slot) => `${slot.id}: ${slot.occupant}`)
          .join(" · ");
        refreshControls();
      },
    );
    room.onMessage(
      "start-result",
      ({ accepted, reason }: { accepted: boolean; reason?: string }) => {
        el("result").textContent = accepted
          ? "경기 시작 · 빈자리 AI 보충"
          : `시작 거부: ${reason}`;
      },
    );
    room.onMessage("ready", ({ ready }: { ready: boolean }) => {
      // Keep the server as the sole source of readiness.
      isReady(ready);
      el("connection").textContent = ready
        ? "플레이어 접속 · 전투 진행"
        : mode === "3v3" && !lobbyStarted
          ? "로비 대기"
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
    room.onMessage(
      "delta",
      (
        delta: StateDelta & {
          events?: { type: string; actorId?: string; reason?: string }[];
        },
      ) => {
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
        if (delta.events?.length)
          el("events").textContent = delta.events
            .slice(-8)
            .map(
              (event) =>
                `${event.type} ${event.actorId ?? ""} ${event.reason ?? ""}`,
            )
            .join("\n");
      },
    );
    room.onMessage(
      "command-result",
      (response: { accepted: boolean; reason?: string }) => {
        el("result").textContent = response.accepted
          ? "명령 접수 · 다음 tick에 검증"
          : `서버 거부: ${response.reason}`;
      },
    );
    room.onDrop(() => {
      isReady(false);
      el("connection").textContent = "연결 복구 중 · 전투 일시 중지";
    });
    room.onReconnect(() => {
      sessionStorage.setItem(tokenKey(), room!.reconnectionToken);
      room?.send("hello");
    });
    room.onLeave(() => {
      room = null;
      seat = null;
      host = false;
      isReady(false);
      state = null;
      previousState = null;
      drawing = false;
      sessionStorage.removeItem(tokenKey());
      el("connection").textContent = "연결 종료";
      el("identity").textContent = "";
      el("clock").textContent = "";
      el<HTMLButtonElement>("join").disabled = false;
      el<HTMLButtonElement>("create-private").disabled = false;
    });
    room.send("hello");
  } catch (error) {
    el("connection").textContent = `접속 실패: ${String(error)}`;
    el<HTMLButtonElement>("join").disabled = false;
    el<HTMLButtonElement>("create-private").disabled = false;
  }
}
el("join").addEventListener("click", () => void connect());
el("create-private").addEventListener("click", () => void connect(true));
el("rotate-invite").addEventListener("click", () =>
  room?.send("rotate-invite"),
);
el("copy-invite").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(
      el<HTMLAnchorElement>("invite-link").href,
    );
    el("result").textContent = "초대 링크 복사 완료";
  } catch {
    el("result").textContent = "링크를 직접 선택해 복사하세요";
  }
});
function isReady(value: boolean) {
  ready = value;
  refreshControls();
}
el("start").addEventListener("click", () => room?.send("start"));
el("attack").addEventListener("click", () =>
  send({
    type: "ATTACK",
    targetSquadId: el<HTMLSelectElement>("target").value,
  }),
);
for (const [id, type] of [
  ["move", "MOVE"],
  ["advance", "ATTACK_MOVE"],
  ["retreat", "RETREAT"],
] as const)
  el(id).addEventListener("click", () =>
    send({ type, destination: destination() }),
  );
el("applyStance").addEventListener("click", () =>
  send({ type: "SET_STANCE", stance: el<HTMLSelectElement>("stance").value }),
);
el("applyFormation").addEventListener("click", () =>
  send({
    type: "SET_FORMATION",
    formation: el<HTMLSelectElement>("formation").value,
  }),
);
el("reassign").addEventListener("click", () =>
  send({
    type: "REASSIGN_COMMANDER",
    commanderId: state?.commanders.find((c) => c.ownerPlayerId === seat)?.id,
  }),
);
for (const skill of ["Q", "W", "R"] as const)
  el(skill).addEventListener("click", () =>
    send({
      type: "CAST_SKILL",
      commanderId: state?.commanders.find((c) => c.ownerPlayerId === seat)?.id,
      skill,
      ...(skill === "Q"
        ? { targetSquadId: el<HTMLSelectElement>("target").value }
        : {}),
    }),
  );
