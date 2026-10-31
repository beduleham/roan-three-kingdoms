import { placeFieldLabels, type FieldLabel } from "./field-labels.js";
import { Client } from "@colyseus/sdk";
import { hashReplayValue } from "../../../packages/battle-core/src/index.js";
import {
  applyVerifiedDelta,
  type StateDelta,
  type BattleView,
  type VisibleBattleEvent,
} from "@roan/protocol";
import "@fontsource/noto-sans-kr/400.css";
import "./style.css";
import "./online.css";
import { createAccountPanel } from "./account.js";

const root = document.querySelector<HTMLElement>("#online")!;
const requestedMode = new URLSearchParams(location.search).get("mode");
const mode =
  requestedMode === "objectives"
    ? "objectives"
    : requestedMode === "3v3"
      ? "3v3"
      : "1v1";
root.innerHTML = `<header><h1>로언 베이의 삼국지 · 온라인 ${mode === "objectives" ? "거점 경기 (실험)" : mode === "3v3" ? "3대3" : "1대1"}</h1><span>서버 권위 전투 시연</span></header>
<p><a href="/online.html">1대1</a> · <a href="/online.html?mode=3v3">3대3 로비</a> · <a href="/online.html?mode=objectives">거점 경기 (실험)</a> | 서버 10Hz · 동기화 5Hz</p>
<section id="account-panel" aria-label="로그인"><p id="account-status" role="status">게스트 이용 중</p><div id="google-login" hidden></div><button id="account-logout" hidden>로그아웃 · 게스트로 전환</button><p>로그인 없이 게스트로도 접속할 수 있습니다. 계정 변경은 경기에서 나간 뒤 가능합니다.</p></section>
<button id="join">빠른 접속 / 초대 입장</button> <button id="create-private">새 초대 전용 경기</button> <button id="leave" disabled>경기 나가기</button> <span id="connection" role="status">접속 대기</span><p id="invite" hidden>초대 링크 (링크 소지자 입장): <a id="invite-link"></a> <button id="copy-invite">복사</button> <button id="rotate-invite" disabled>초대 링크 재발급</button></p>
<section id="lobby-panel" ${mode === "1v1" ? "hidden" : ""}><h2>경기 로비</h2><p id="lobby"></p><button id="start" disabled>${mode === "objectives" ? "거점 경기 시작" : "빈자리를 AI로 채워 시작"}</button><label>참가자 <select id="remove-seat"></select></label><button id="remove-player" disabled>로비에서 내보내기</button></section>
<section id="objective-panel" class="online-controls" ${mode === "objectives" ? "" : "hidden"}><h2>거점 경기 · 미확정 실험 규칙</h2><p id="objective-rules"></p><p id="objective-score" role="status"></p><pre id="objective-points"></pre><p id="match-result" role="status"></p><button id="next-match" hidden>새 초대 경기 만들기</button><p>거점 소유권·점령 진행·국가 점수는 양측 공개 정보입니다. 단절 시 경기 시간이 멈추며, 참가자가 나가거나 예약이 만료되면 승패 없이 중단됩니다.</p></section>
<p id="identity"></p><p id="clock"></p><p id="vision-info"></p><p>전장에서 아군·적군을 클릭해 선택하고, 빈 땅을 클릭해 목적지를 지정하세요.</p><canvas id="field" width="720" height="420"></canvas>
<section class="online-controls"><h2>전술 명령</h2><label>내 부대 <select id="squad"></select></label> <label>적 대상 <select id="target"></select></label>
<label>목적지 X (타일) <input id="dest-x" type="number" value="10" min="0" max="24"></label>
<label>Y (타일) <input id="dest-y" type="number" value="6" min="0" max="13"></label>
<div class="online-actions"><button id="move" data-command disabled>이동</button><button id="attack" data-command disabled>대상 공격</button><button id="advance" data-command disabled>공격 이동</button><button id="retreat" data-command disabled>후퇴</button></div>
<label>태세 <select id="stance"><option value="defensive">방어</option><option value="balanced">균형</option><option value="aggressive">공격</option></select></label><button id="applyStance" data-command disabled>태세 변경</button>
<label>진형 <select id="formation"><option value="normal">기본</option><option value="defense">방어진</option><option value="offense">공격진</option></select></label><button id="applyFormation" data-command disabled>진형 변경</button>
<button id="reassign" data-command disabled>장수 재배속</button>
<div class="online-actions"><button id="Q" data-command disabled>Q 돌격</button><button id="W" data-command disabled>W 함성</button><button id="R" data-command disabled>R 파죽지세</button></div></section>
<p id="result" role="status"></p><h2>현재 관측 상태</h2><p id="selected"></p><p id="commander"></p><pre id="units"></pre><h2>마지막 적 관측</h2><pre id="last-seen"></pre><h2>최근 전투 사건</h2><pre id="events"></pre>
<p>명령은 서버에서 검증됩니다. 화면 위치만 두 서버 상태 사이에서 보간합니다.</p>`;
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
let inviteKey = new URLSearchParams(location.hash.slice(1)).get("invite");
const tokenKey = () =>
  `roan-online-reconnection-${mode}-${params.get("room") ?? "quick"}`;
const serverAddress =
  params.get("server") ??
  (import.meta.env.PROD
    ? location.origin.replace(/^http/, "ws")
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`);
const account = createAccountPanel(serverAddress, () =>
  sessionStorage.removeItem(tokenKey()),
);
let seat: string | null = null;
let host = false;
let ready = false;
let lobbyStarted = mode === "1v1";
let room: Awaited<ReturnType<Client["joinOrCreate"]>> | null = null;
let state: BattleView | null = null;
let previousState: BattleView | null = null;
let lastEvents: VisibleBattleEvent[] = [];
let receivedAt = 0;
let awaitingSnapshot = false;
let drawing = false;
let drawFrame = 0;
let lobbySlots: {
  id: string;
  occupant: string;
  connected: boolean;
  host: boolean;
}[] = [];
const canvas = el<HTMLCanvasElement>("field"),
  ctx = canvas.getContext("2d")!;
function render() {
  if (!state) return;
  el("clock").textContent =
    `${state.tick} tick · 상태 해시 ${hashReplayValue(state)}`;
  el("vision-info").textContent =
    `${state.nationId} 국가 공유 시야 · 반경 ${state.visionRadiusUnits / state.config.positionUnitsPerTile}타일 (시연값)`;
  el("units").textContent = state.squads
    .map(
      (s) =>
        `${s.id}: ${s.soldiers}명 · HP ${s.hpMilli} · 사기 ${s.morale} · 전열 ${s.cohesion} · ${s.fsmState} · ${s.stance}/${s.formation}`,
    )
    .join("\n");
  const objective = state.objectiveMatch;
  if (objective) {
    const seconds = (ticks: number) =>
      Math.ceil((ticks * state!.config.tickMs) / 1000);
    el("objective-rules").textContent =
      `중립 거점 ${objective.points.length}개 · 반경 ${objective.radiusUnits / state.config.positionUnitsPerTile}타일 · 단독 ${seconds(objective.captureTicks)}초 점령 · ${seconds(objective.scoreEveryTicks)}초마다 점수 · 목표 ${objective.targetScore}점 · 제한 ${seconds(objective.limitTicks)}초 (실험값)`;
    el("objective-score").textContent =
      `blue ${objective.scores.blue} : ${objective.scores.red} red · 남은 시간 ${seconds(Math.max(0, objective.limitTicks - objective.tick))}초 · ${lobbyStarted ? (objective.status === "finished" ? "종료" : ready ? "진행 중" : "접속 대기") : "시작 대기"}`;
    el("objective-points").textContent = objective.points
      .map(
        (p) =>
          `${p.name} (+${p.score}점): ${!p.open ? `${seconds(Math.max(0, p.opensAtTick - objective.tick))}초 뒤 개방` : p.contested ? "경합" : (p.owner ?? "중립")}${p.capturing ? ` · ${p.capturing} 점령 ${Math.floor((p.progressTicks / objective.captureTicks) * 100)}%` : ""}`,
      )
      .join("\n");
    const result = objective.result;
    el("match-result").textContent = result
      ? `${result.reason === "abandoned" ? "참가자 이탈 · 경기 중단" : result.winner ? `${result.winner} 승리` : "무승부"} · ${result.reason === "score" ? "목표 점수" : result.reason === "time" ? "시간 종료" : "승패 미산정"} · 최종 blue ${result.scores.blue} : ${result.scores.red} red`
      : "";
    el<HTMLButtonElement>("next-match").hidden = !result;
    if (result) {
      for (const button of document.querySelectorAll<HTMLButtonElement>(
        "[data-command]",
      ))
        button.disabled = true;
      el("connection").textContent = "거점 경기 종료";
    }
  }
  const canCommand = ready && !objective?.result;
  const own = state.squads.filter((s) => s.ownerPlayerId === seat);
  const enemy = state.squads.filter(
    (s) => s.nationId !== state!.nationId && s.hpMilli > 0,
  );
  for (const [id, squads] of [
    ["squad", own],
    ["target", enemy],
  ] as const) {
    const select = el<HTMLSelectElement>(id),
      previous = select.value;
    if (
      select.options.length !== squads.length ||
      [...select.options].some(
        (option, index) => option.value !== squads[index]?.id,
      )
    )
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
    ? `선택 ${selected.id} · 병력 ${selected.soldiers}/${selected.maxSoldiers} · HP ${selected.hpMilli} · 사기 ${selected.morale} · 전열 ${selected.cohesion} · ${selected.fsmState}`
    : "";
  el("last-seen").textContent =
    state.lastSeen
      .map(
        (entry) =>
          `${entry.id}: 마지막 위치 (${entry.position.x / state!.config.positionUnitsPerTile}, ${entry.position.y / state!.config.positionUnitsPerTile}) · 관측 ${entry.observedTick} tick`,
      )
      .join("\n") || "시야 밖 마지막 관측 없음";
  const knownIds = new Set(
    [...state.squads, ...state.commanders].map((entity) => entity.id),
  );
  state.squads
    .filter((s) => s.nationId === state!.nationId)
    .forEach((s) => knownIds.add(s.ownerPlayerId));
  el("events").textContent = lastEvents
    .filter(
      (event) =>
        knownIds.has(event.actorId) &&
        (!event.targetId || knownIds.has(event.targetId)),
    )
    .slice(-8)
    .map((event) => `${event.type} ${event.actorId} ${event.reason ?? ""}`)
    .join("\n");
  for (const skill of ["Q", "W", "R"] as const) {
    const button = el<HTMLButtonElement>(skill);
    button.disabled =
      !canCommand ||
      !commander ||
      commander.status !== "ACTIVE" ||
      commander.cooldownTicks[skill] > 0 ||
      (skill === "Q" && enemy.length === 0);
    button.title = commander?.cooldownTicks[skill]
      ? `대기 ${commander.cooldownTicks[skill]} tick`
      : "";
  }
  el<HTMLButtonElement>("attack").disabled = !canCommand || enemy.length === 0;
}
function refreshControls() {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-command]",
  ))
    button.disabled = !ready;
  el<HTMLButtonElement>("start").disabled = !host || lobbyStarted;
  el<HTMLButtonElement>("rotate-invite").disabled =
    !host || !inviteKey || !room;
  el<HTMLButtonElement>("leave").disabled = !room;
  el<HTMLButtonElement>("remove-player").disabled =
    !host ||
    !inviteKey ||
    !room ||
    lobbyStarted ||
    !el<HTMLSelectElement>("remove-seat").options.length;
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
  if (!room || !ready || state?.objectiveMatch?.result) return;
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
  ctx.fillStyle = "#61594b";
  ctx.fillRect(0, 0, 720, 420);
  ctx.save();
  ctx.beginPath();
  for (const observer of state.squads.filter(
    (s) => s.nationId === state!.nationId && s.hpMilli > 0,
  )) {
    const x =
        40 + (observer.position.x / state.config.positionUnitsPerTile) * 30,
      y = 40 + (observer.position.y / state.config.positionUnitsPerTile) * 30;
    const radius =
      (state.visionRadiusUnits / state.config.positionUnitsPerTile) * 30;
    ctx.moveTo(x + radius, y);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  }
  ctx.clip();
  ctx.fillStyle = "#efe3c8";
  ctx.fillRect(0, 0, 720, 420);
  ctx.restore();
  ctx.font = '14px "Noto Sans KR", sans-serif';
  const labels: FieldLabel[] = [];
  for (const point of state.objectiveMatch?.points ?? []) {
    const x = 40 + (point.position.x / state.config.positionUnitsPerTile) * 30;
    const y = 40 + (point.position.y / state.config.positionUnitsPerTile) * 30;
    ctx.save();
    ctx.strokeStyle = !point.open
      ? "#aaa"
      : point.contested
        ? "#d79418"
        : point.owner === "blue"
          ? "#286b9a"
          : point.owner === "red"
            ? "#ae4a36"
            : "#756743";
    ctx.lineWidth = 2;
    ctx.setLineDash(point.open ? [] : [4, 4]);
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      (state.objectiveMatch!.radiusUnits / state.config.positionUnitsPerTile) *
        30,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
    labels.push({
      text: point.name,
      x,
      y,
      width: ctx.measureText(point.name).width,
    });
  }
  for (const entry of state.lastSeen) {
    const x = 40 + (entry.position.x / state.config.positionUnitsPerTile) * 30,
      y = 40 + (entry.position.y / state.config.positionUnitsPerTile) * 30;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#e5d8b7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const text = `? ${entry.id} · ${entry.observedTick}tick`;
    labels.push({
      text,
      x,
      y,
      width: ctx.measureText(text).width,
      memory: true,
    });
  }
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
    labels.push({ text: s.id, x, y, width: ctx.measureText(s.id).width });
  }
  for (const label of placeFieldLabels(labels, canvas.width, canvas.height)) {
    const { box } = label;
    ctx.strokeStyle = label.memory ? "#c1b49c" : "#514331";
    ctx.beginPath();
    ctx.moveTo(label.x, label.y);
    ctx.lineTo(box.x, box.y + box.height / 2);
    ctx.stroke();
    ctx.fillStyle = label.memory ? "#514a3f" : "#fff5df";
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.fillStyle = label.memory ? "#f4e9d0" : "#222";
    ctx.fillText(label.text, box.x + 4, box.y + 15, box.width - 8);
  }
  drawFrame = requestAnimationFrame(draw);
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
  account.setLocked(true);
  if (!createPrivate)
    inviteKey = new URLSearchParams(location.hash.slice(1)).get("invite");
  try {
    const options = await account.joinOptions();
    const client = new Client(serverAddress);
    const token = createPrivate ? null : sessionStorage.getItem(tokenKey());
    if (token) {
      try {
        room = await client.reconnect(token);
      } catch {
        sessionStorage.removeItem(tokenKey());
      }
    }
    const roomName =
      mode === "objectives"
        ? "battle_objectives"
        : mode === "3v3"
          ? "battle_3v3"
          : "battle_1v1";
    if (!room) {
      room = createPrivate
        ? await client.create(roomName, {
            ...options,
            inviteOnly: true,
            creatorProof: Array.from(
              crypto.getRandomValues(new Uint8Array(32)),
              (byte) => byte.toString(16).padStart(2, "0"),
            ).join(""),
          })
        : params.get("room")
          ? await client.joinById(params.get("room")!, {
              inviteKey,
              ...options,
            })
          : await client.joinOrCreate(roomName, options);
    }
    if (room.name !== roomName) {
      await room.leave();
      room = null;
      throw new Error("초대 링크의 경기 종류가 다릅니다");
    }
    // A drop immediately after joining must still use the server's reservation.
    room.reconnection.minUptime = 0;
    params.set("room", room.roomId);
    if (createPrivate) inviteKey = null;
    updateInviteLink();
    sessionStorage.setItem(tokenKey(), room.reconnectionToken);
    root.dataset.roomId = room.roomId;
    let recovering = false;
    el("connection").textContent = `접속됨 · Room ${room.roomId}`;
    room.onMessage("account", account.confirmed);
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
      "lobby-result",
      ({ accepted, reason }: { accepted: boolean; reason?: string }) => {
        el("result").textContent = accepted
          ? "참가자 내보내기 완료 · 초대 링크 갱신"
          : `참가자 관리 거부: ${reason}`;
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
        slots: {
          id: string;
          occupant: string;
          connected: boolean;
          host: boolean;
        }[];
      }) => {
        lobbyStarted = lobby.started;
        lobbySlots = lobby.slots;
        el("lobby").textContent = lobby.slots
          .map(
            (slot) =>
              `${slot.id}: ${slot.occupant}${slot.host ? " (로비장)" : ""}${slot.occupant === "human" && !slot.connected ? " · 재접속 대기" : ""}`,
          )
          .join(" · ");
        const select = el<HTMLSelectElement>("remove-seat"),
          previous = select.value;
        select.replaceChildren(
          ...lobbySlots
            .filter((slot) => slot.occupant === "human" && slot.id !== seat)
            .map((slot) => new Option(slot.id, slot.id)),
        );
        if ([...select.options].some((option) => option.value === previous))
          select.value = previous;
        refreshControls();
      },
    );
    room.onMessage(
      "start-result",
      ({ accepted, reason }: { accepted: boolean; reason?: string }) => {
        el("result").textContent = accepted
          ? mode === "objectives"
            ? "거점 경기 시작"
            : "경기 시작 · 빈자리 AI 보충"
          : `시작 거부: ${reason}`;
      },
    );
    room.onMessage("ready", ({ ready }: { ready: boolean }) => {
      // Keep the server as the sole source of readiness.
      isReady(ready);
      el("connection").textContent = ready
        ? "플레이어 접속 · 전투 진행"
        : mode !== "1v1" && !lobbyStarted
          ? "로비 대기"
          : "상대 접속 대기";
      if (state?.objectiveMatch?.result)
        el("connection").textContent = "거점 경기 종료";
    });
    room.onMessage("snapshot", ({ state: next }: { state: BattleView }) => {
      state = next;
      lastEvents = [];
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
      (delta: StateDelta & { events?: VisibleBattleEvent[] }) => {
        if (!state || awaitingSnapshot) return;
        const next = applyVerifiedDelta(state, delta, hashReplayValue);
        if (!next) {
          awaitingSnapshot = true;
          room?.send("hello");
          return;
        }
        previousState = state;
        state = next;
        lastEvents = delta.events ?? [];
        receivedAt = performance.now();
        root.dataset.deltaCount = String(
          Number(root.dataset.deltaCount ?? 0) + 1,
        );
        render();
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
      recovering = true;
      isReady(false);
      el("connection").textContent = "연결 복구 중 · 전투 일시 중지";
    });
    room.onReconnect(() => {
      recovering = false;
      sessionStorage.setItem(tokenKey(), room!.reconnectionToken);
      room?.send("hello");
    });
    room.onLeave((code, reason) => {
      account.setLocked(false);
      account.disconnected();
      room = null;
      seat = null;
      host = false;
      isReady(false);
      state = null;
      previousState = null;
      drawing = false;
      cancelAnimationFrame(drawFrame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      lobbySlots = [];
      sessionStorage.removeItem(tokenKey());
      el("connection").textContent =
        reason === "REMOVED_FROM_LOBBY"
          ? "로비에서 내보내졌습니다"
          : code !== 4000 && (recovering || code === 4003)
            ? "재접속 실패 · 좌석 예약이 만료되었거나 연결을 복구하지 못했습니다. 다시 접속하세요."
            : "연결 종료";
      el("identity").textContent = "";
      el("clock").textContent = "";
      for (const id of [
        "lobby",
        "selected",
        "commander",
        "units",
        "events",
        "vision-info",
        "last-seen",
        "objective-rules",
        "objective-score",
        "objective-points",
        "match-result",
      ])
        el(id).textContent = "";
      el<HTMLSelectElement>("remove-seat").replaceChildren();
      el("invite").hidden = true;
      lobbyStarted = mode === "1v1";
      el("next-match").hidden = true;
      refreshControls();
      el<HTMLButtonElement>("join").disabled = false;
      el<HTMLButtonElement>("create-private").disabled = false;
    });
    room.send("hello");
  } catch (error) {
    account.setLocked(false);
    el("connection").textContent = `접속 실패: ${String(error)}`;
    el<HTMLButtonElement>("join").disabled = false;
    el<HTMLButtonElement>("create-private").disabled = false;
  }
}
el("next-match").addEventListener("click", async () => {
  if (!state?.objectiveMatch?.result || !room) return;
  el<HTMLButtonElement>("next-match").disabled = true;
  try {
    await room.leave();
    params.delete("room");
    inviteKey = null;
    history.replaceState(null, "", `${location.pathname}?${params}`);
    await connect(true);
  } finally {
    el<HTMLButtonElement>("next-match").disabled = false;
  }
});
el("join").addEventListener("click", () => void connect());
el("create-private").addEventListener("click", () => void connect(true));
el("leave").addEventListener("click", () => void room?.leave());
el("remove-player").addEventListener("click", () =>
  room?.send("remove-player", {
    seat: el<HTMLSelectElement>("remove-seat").value,
  }),
);
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
