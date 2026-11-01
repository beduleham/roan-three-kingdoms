import { BattlePresentation } from "./battle-presentation.js";
import { BattleAudio } from "./battle-audio.js";
import { RenderPerformance } from "./render-performance.js";
import presentationSettings from "./presentation-settings.json";
import { mountOnlineShell } from "./online-shell.js";
import { OnlineArmyArt, armyHit } from "./online-army-art.js";
import { PlaytestRecord } from "./playtest-record.js";
import { remainingMatchTicks } from "./match-clock.js";
import { describeAugment } from "./augment-description.js";
import mapSettings from "./map-view.json";
import {
  createMapCamera,
  createIsometricCamera,
  projectedRadius,
  viewportCorners,
  worldToMap,
  mapToWorld,
  type MapCamera,
  type MapPosition,
} from "./map-camera.js";
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
  requestedMode === "national"
    ? "national"
    : requestedMode === "objectives"
      ? "objectives"
      : requestedMode === "3v3"
        ? "3v3"
        : "1v1";
const hasObjectives = mode === "objectives" || mode === "national";
root.innerHTML = `<header><h1>로언 베이의 삼국지 · 온라인 ${mode === "national" ? "3국가 경기 (실험)" : hasObjectives ? "거점 경기 (시연)" : mode === "3v3" ? "3대3" : "1대1"}</h1><span>서버 권위 전투 시연</span></header>
<p><a href="/online.html">1대1</a> · <a href="/online.html?mode=3v3">3대3 로비</a> · <a href="/online.html?mode=objectives">거점 경기 (시연)</a> · <a href="/online.html?mode=national">3국가 경기 (실험)</a> | 서버 10Hz · 동기화 5Hz</p>
<section id="account-panel" aria-label="로그인"><p id="account-status" role="status">게스트 이용 중</p><div id="google-login" hidden></div><button id="account-logout" hidden>로그아웃 · 게스트로 전환</button><p>로그인 없이 게스트로도 접속할 수 있습니다. 계정 변경은 경기에서 나간 뒤 가능합니다.</p></section>
<button id="join">빠른 접속 / 초대 입장</button> <button id="create-private">새 초대 전용 경기</button> <button id="leave" disabled>경기 나가기</button> <span id="connection" role="status">접속 대기</span><p id="invite" hidden>초대 링크 (링크 소지자 입장): <a id="invite-link"></a> <button id="copy-invite">복사</button> <button id="rotate-invite" disabled>초대 링크 재발급</button></p>
<section id="lobby-panel" ${mode === "1v1" ? "hidden" : ""}><h2>경기 로비</h2><p id="lobby"></p><button id="start" disabled>${mode === "national" ? "빈자리를 AI로 채워 국가 경기 시작" : hasObjectives ? "거점 경기 시작" : "빈자리를 AI로 채워 시작"}</button><label>참가자 <select id="remove-seat"></select></label><button id="remove-player" disabled>로비에서 내보내기</button></section>
<section id="objective-panel" class="online-controls" ${hasObjectives ? "" : "hidden"}><h2>${mode === "national" ? "국가 경기 · Phase 7 기준 v1 (검증 중)" : "거점 경기 · 시연 규칙"}</h2><p id="objective-rules"></p><p id="objective-score" role="status"></p><pre id="objective-points"></pre><p id="match-result" role="status"></p><button id="next-match" hidden>새 초대 경기 만들기</button><p>거점 소유권·점령 진행·국가 점수는 참가국 공개 정보입니다. 단절 시 경기 시간이 멈추며, 참가자가 나가거나 예약이 만료되면 승패 없이 중단됩니다.</p></section>
<section id="national-panel" class="online-controls" ${mode === "national" ? "" : "hidden"}><h2>성장·보급</h2><p>본영 주둔은 XP·공적을 주지 않습니다. 승진은 병력 상한만 늘리며, 전멸 시 보유 본영에서 유료로 신규 편성할 수 있습니다.</p><p id="national-clock"></p><p id="national-player"></p><p id="national-economy"></p><button id="resupply" data-command disabled>선택 부대 충원</button><select id="recruit-unit"><option value="infantry">보병</option><option value="spears">창병</option><option value="archers">궁병</option><option value="cavalry">기병</option></select><button id="recruit" data-command disabled>추가 부대 편성</button><p id="supply-feedback" role="status"></p><h3>증강 선택</h3><p>Q/W/R의 공격·기동·전열 효과 9종입니다. 후보 3개 중 직접 선택하며 같은 증강은 다시 선택할 수 없습니다.</p><p id="augment-progress"></p><div id="augment-offer"></div><h3>플레이테스트 기록</h3><p>이 탭에서 관측한 내 성장·증강·보급·입력과 공개 결과를 기록합니다. 새로고침하면 기록이 초기화됩니다. 30초 간격 관측이며 서버 리플레이가 아닙니다.</p><label>역할·선택 이유·불편했던 점 <textarea id="playtest-notes" maxlength="2000"></textarea></label><button id="export-playtest" disabled>내 경기 기록 저장 (JSON)</button><h3>전체 인간 공적 순위</h3><pre id="national-ranking"></pre></section>
<p id="identity"></p><p id="clock"></p><p id="vision-info"></p><p>전장에서 아군·적군을 클릭해 선택하고, 빈 땅을 클릭해 목적지를 지정하세요.</p><section id="map-panel" class="online-controls" ${hasObjectives ? "" : "hidden"} aria-label="지도와 시점">
<h2>전국 지도 · 현재 시연 전역</h2><canvas id="strategic-map" width="300" height="180" aria-label="전국 지도: 클릭한 위치로 전투 시점 이동"></canvas>
<p>지도 클릭은 시점만 이동합니다. 부대 이동은 전장에서 목적지를 지정한 뒤 이동 버튼을 누르세요.</p>
<div class="online-actions"><button id="view-overview" aria-pressed="true">전국 보기</button><button id="view-battle" aria-pressed="false">전투 보기 · ${mapSettings.battleZoom}배</button><button id="focus-own">선택 아군으로 이동</button></div>
<div id="map-points" class="online-actions" aria-label="거점으로 시점 이동"></div>
<div class="online-actions" aria-label="시점 이동"><button data-pan="0,-1" aria-label="시점 위로">↑</button><button data-pan="-1,0" aria-label="시점 왼쪽으로">←</button><button data-pan="1,0" aria-label="시점 오른쪽으로">→</button><button data-pan="0,1" aria-label="시점 아래로">↓</button></div>
<p id="map-status" role="status"></p></section>
<canvas id="field" width="720" height="420" aria-label="전장"></canvas>
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
mountOnlineShell(root);
root.querySelector("#war-commands")!.append(root.querySelector("#result")!);
const armyArt = new OnlineArmyArt();
const presentation = new BattlePresentation(),
  audio = new BattleAudio(),
  renderPerformance = new RenderPerformance();
let lastPaint = -Infinity,
  miniSignature = "";
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
root
  .querySelector(".war-entry")!
  .insertAdjacentHTML(
    "beforeend",
    '<div class="presentation-controls"><button id="sound-toggle" aria-pressed="false">효과음 켜기</button><label>음량 <input id="sound-volume" aria-label="효과음 음량" type="range" min="0" max="100" value="25"></label><label><input id="reduce-effects" type="checkbox"> 연출 줄이기</label><label><input id="all-unit-labels" type="checkbox"> 모든 부대 이름</label><span id="sound-status" role="status"></span></div>',
  );
root
  .querySelector(".war-diagnostics")!
  .insertAdjacentHTML("beforeend", '<p id="render-performance"></p>');
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
let playtest: PlaytestRecord | null = null;
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
const strategicMap = el<HTMLCanvasElement>("strategic-map");
const strategicCtx = strategicMap.getContext("2d")!;
let mapView: "overview" | "battle" = "overview";
let mapFocus: MapPosition = {
  x: mapSettings.widthTiles / 2,
  y: mapSettings.heightTiles / 2,
};
function mapWorld() {
  const units = state?.config.positionUnitsPerTile ?? 1000;
  return {
    x: mapSettings.widthTiles * units,
    y: mapSettings.heightTiles * units,
  };
}
function fieldCamera(): MapCamera {
  const units = state?.config.positionUnitsPerTile ?? 1000;
  if (!hasObjectives)
    return {
      left: 0,
      top: 0,
      width: (canvas.width * units) / 30,
      height: (canvas.height * units) / 30,
      scale: 30 / units,
      offsetX: 40,
      offsetY: 40,
    };
  return createIsometricCamera(
    mapWorld(),
    { x: canvas.width, y: canvas.height },
    mapView === "battle" ? mapSettings.battleZoom : 1,
    { x: mapFocus.x * units, y: mapFocus.y * units },
    mapSettings.paddingPixels,
  );
}
function miniCamera() {
  return createMapCamera(
    mapWorld(),
    { x: strategicMap.width, y: strategicMap.height },
    1,
    { x: 0, y: 0 },
    mapSettings.miniPaddingPixels,
  );
}
function setMapView(view: "overview" | "battle", focus?: MapPosition) {
  mapView = view;
  if (focus) {
    const units = state?.config.positionUnitsPerTile ?? 1000;
    mapFocus = { x: focus.x / units, y: focus.y / units };
  }
  const camera = fieldCamera(),
    units = state?.config.positionUnitsPerTile ?? 1000;
  // Store the clamped center so directional panning can immediately move back from an edge.
  if (view === "battle")
    mapFocus = {
      x: (camera.left + camera.width / 2) / units,
      y: (camera.top + camera.height / 2) / units,
    };
  render();
}
function updateMapControls() {
  if (!hasObjectives) return;
  const camera = fieldCamera();
  for (const id of ["view-overview", "view-battle"])
    el<HTMLButtonElement>(id).disabled = !state;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-pan]",
  ))
    button.disabled = !state;
  root.dataset.mapView = mapView;
  canvas.dataset.projection = camera.projection ?? "flat";
  for (const [key, value] of Object.entries({
    left: camera.left,
    top: camera.top,
    width: camera.width,
    height: camera.height,
    scale: camera.scale,
    offsetX: camera.offsetX,
    offsetY: camera.offsetY,
  }))
    canvas.dataset[key] = String(value);
  el("view-overview").setAttribute(
    "aria-pressed",
    String(mapView === "overview"),
  );
  el("view-battle").setAttribute("aria-pressed", String(mapView === "battle"));
  el<HTMLButtonElement>("focus-own").disabled = !state?.squads.some(
    (s) => s.ownerPlayerId === seat && s.hpMilli > 0,
  );
  const units = state?.config.positionUnitsPerTile ?? 1000;
  el("map-status").textContent = state
    ? `${mapView === "overview" ? "전국 보기" : "전투 보기"} · 국가 공유 시야 · 범위 X ${(camera.left / units).toFixed(1)}–${((camera.left + camera.width) / units).toFixed(1)}, Y ${(camera.top / units).toFixed(1)}–${((camera.top + camera.height) / units).toFixed(1)} 타일`
    : "경기에 접속하면 같은 전장을 두 시점으로 볼 수 있습니다.";
  const points = state?.objectiveMatch?.points ?? [],
    buttons = el("map-points");
  if (
    [...buttons.children].map((b) => b.getAttribute("data-point")).join() !==
    points.map((p) => p.id).join()
  ) {
    buttons.replaceChildren(
      ...points.map((point) => {
        const button = document.createElement("button");
        button.dataset.point = point.id;
        button.textContent = `${point.name} 보기`;
        button.addEventListener("click", () => {
          const current = state?.objectiveMatch?.points.find(
            (p) => p.id === point.id,
          );
          if (current) setMapView("battle", current.position);
        });
        return button;
      }),
    );
  }
}
el("view-overview").addEventListener("click", () => setMapView("overview"));
el("view-battle").addEventListener("click", () => setMapView("battle"));
el("focus-own").addEventListener("click", () => {
  const own = state?.squads.filter(
    (s) => s.ownerPlayerId === seat && s.hpMilli > 0,
  );
  const unit =
    own?.find((s) => s.id === el<HTMLSelectElement>("squad").value) ?? own?.[0];
  if (unit) setMapView("battle", unit.position);
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-pan]"))
  button.addEventListener("click", () => {
    if (!state) return;
    const [x, y] = button.dataset.pan!.split(",").map(Number);
    const c = fieldCamera(),
      units = state.config.positionUnitsPerTile;
    setMapView("battle", {
      x: mapFocus.x * units + ((x ?? 0) * c.width) / 4,
      y: mapFocus.y * units + ((y ?? 0) * c.height) / 4,
    });
  });
strategicMap.addEventListener("click", (event) => {
  if (!state) return;
  const rect = strategicMap.getBoundingClientRect();
  const world = mapToWorld(
    {
      x: ((event.clientX - rect.left) * strategicMap.width) / rect.width,
      y: ((event.clientY - rect.top) * strategicMap.height) / rect.height,
    },
    miniCamera(),
  );
  if (world) setMapView("battle", world);
});
function render() {
  root.dataset.battleStarted = String(lobbyStarted);
  if (mode === "national" && state && room && seat) {
    if (
      !playtest ||
      playtest.roomId !== room.roomId ||
      playtest.seat !== seat
    ) {
      playtest = new PlaytestRecord(room.roomId, seat);
      el<HTMLTextAreaElement>("playtest-notes").value = "";
    }
    playtest.observe(state);
    el<HTMLButtonElement>("export-playtest").disabled =
      playtest.firstTick === null;
  }
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
      `${mode === "national" ? "본영3 · 외곽3 · 중앙성1" : `중립 거점 ${objective.points.length}개`} · 반경 ${objective.radiusUnits / state.config.positionUnitsPerTile}타일 · 단독 ${seconds(objective.captureTicks)}초 점령 · ${seconds(objective.scoreEveryTicks)}초마다 점수 · ${mode === "national" ? "15/18/21분 판정·천하통일" : `목표 ${objective.targetScore}점`} · 제한 ${seconds(objective.limitTicks)}초 (${mode === "national" ? "미확정 실험값" : "시연 기준"})`;
    el("objective-score").textContent = `${
      mode === "national"
        ? Object.entries(objective.scores)
            .map(([id, score]) => `${id} ${score}`)
            .join(" : ")
        : `blue ${objective.scores.blue} : ${objective.scores.red} red`
    } · 남은 시간 ${seconds(remainingMatchTicks(objective, state.nationalMatch?.deadline))}초 · ${lobbyStarted ? (objective.status === "finished" ? "종료" : ready ? "진행 중" : "접속 대기") : "시작 대기"}`;
    el("objective-points").textContent = objective.points
      .map(
        (p) =>
          `${p.name} (+${p.score}점): ${!p.open ? `${seconds(Math.max(0, p.opensAtTick - objective.tick))}초 뒤 개방` : p.contested ? "경합" : (p.owner ?? "중립")}${p.capturing ? ` · ${p.capturing} 점령 ${Math.floor((p.progressTicks / objective.captureTicks) * 100)}%` : ""}`,
      )
      .join("\n");
    const result = objective.result;
    el("match-result").textContent = result
      ? `${result.reason === "abandoned" ? "참가자 이탈 · 경기 중단" : result.winner ? `${result.winner} 승리` : "무승부"} · ${result.reason === "unification" ? "천하통일" : result.reason === "score" ? "목표 점수" : result.reason === "time" ? "시간 종료" : "승패 미산정"} · 최종 ${
          mode === "national"
            ? Object.entries(result.scores)
                .map(([id, score]) => `${id} ${score}`)
                .join(" : ")
            : `blue ${result.scores.blue} : ${result.scores.red} red`
        }`
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
  const national = state.nationalMatch,
    me = national?.players.find((p) => p.id === seat);
  if (national && me) {
    el("national-clock").textContent =
      `${national.rules.policyVersion ?? "legacy"} · ${["15분 판정 전", "18분 연장", "21분 최종 연장"][national.phase]} · 다음 판정 ${Math.max(0, Math.ceil(((national.deadline - state.tick) * state.config.tickMs) / 1000))}초 · 천하통일 ${national.unifyNation ?? "없음"} ${national.unifyTicks}/${national.unifyRequired} tick`;
    el("national-player").textContent =
      `Lv.${me.level} · XP ${me.xp}/${me.nextXp ?? "MAX"} · 공적 ${me.merit} · 관직 ${me.rank} · 지휘 상한 ${me.cap.squads}부대/${me.cap.soldiers}명`;
    el("national-economy").textContent =
      `보급 ${me.supplyPoints} · 최대 ${national.rules.refillSoldiers}명 충원 (1명당 ${national.rules.costPerSoldier}) · 추가 부대 ${national.rules.recruitSoldiers}명/비용 ${national.rules.recruitCost} · 소요 ${(national.rules.jobTicks * state.config.tickMs) / 1000}초${me.job ? ` · 작업 중: ${Math.max(0, me.job.finishAt - state.tick)} tick` : ""}`;
    el("supply-feedback").textContent =
      (
        {
          SUPPLY_STARTED: "보급 작업 시작",
          SUPPLY_COMPLETE: "보급 완료",
          SUPPLY_CANCELLED: "보급 조건 상실 · 비용 반환",
          RANK_CAPACITY: "관직 지휘 상한 초과",
          NO_CAPACITY: "충원할 병력 없음",
          NEED_FRIENDLY_POINT: "안전한 아군 거점 범위가 필요합니다",
          INSUFFICIENT_SUPPLY: "보급 부족",
          SUPPLY_BUSY: "보급 작업 진행 중",
          FORCED_STATE: "현재 상태에서는 보급할 수 없습니다",
        } as Record<string, string>
      )[me.feedback] ?? me.feedback;
    el<HTMLButtonElement>("resupply").disabled =
      !canCommand ||
      !!me.job ||
      !state.squads.some((s) => s.ownerPlayerId === seat && s.hpMilli > 0);
    el<HTMLButtonElement>("recruit").disabled = !canCommand || !!me.job;
    el("augment-progress").textContent =
      `선택 ${me.selected.length}/7${me.offer ? ` · ${me.offer.checkpoint}레벨 선택 대기` : " · 다음 성장 기회 대기"}`;
    const parent = el("augment-offer"),
      ids = me.offer?.candidates ?? [];
    if (
      [...parent.children].map((b) => b.getAttribute("data-augment")).join() !==
      ids.join()
    )
      parent.replaceChildren(
        ...ids.map((id) => {
          const button = document.createElement("button");
          button.dataset.augment = id;
          const detail = me.offer?.details?.find((d) => d.id === id);
          button.textContent = detail
            ? `${describeAugment(detail, state!.config.tickMs)} (실험)`
            : `${id.includes("shock") ? "돌파: Q 충돌 후 공격 강화" : id.includes("gale") ? "기동: Q 충돌 후 이동 강화" : "군율: W 대상 전열 보호"} (실험)`;
          button.addEventListener("click", () => {
            const offer = state?.nationalMatch?.players.find(
              (p) => p.id === seat,
            )?.offer;
            if (offer)
              send({
                type: "SELECT_AUGMENT",
                squadIds: [],
                checkpoint: offer.checkpoint,
                augmentId: id,
              });
          });
          return button;
        }),
      );
    for (const button of parent.querySelectorAll<HTMLButtonElement>("button"))
      button.disabled = !canCommand;
    el("national-ranking").textContent = national.ranking.length
      ? national.ranking
          .map(
            (p) =>
              `${p.place}. ${p.playerId} (${p.nationId}) · 공적 ${p.merit} · 국가기여 ${p.contribution} · Lv.${p.level}`,
          )
          .join("\n")
      : "경기 종료 후 국가 승패와 관계없이 모든 인간 참가자를 표시합니다.";
  }
  const own = state.squads.filter(
    (s) => s.ownerPlayerId === seat && s.hpMilli > 0,
  );
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
  updateMapControls();
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
      (skill === "Q" && enemy.length === 0) ||
      (skill === "R" &&
        !!me &&
        me.level < state.nationalMatch!.rules.rMinLevel);
    button.title = commander?.cooldownTicks[skill]
      ? `대기 ${commander.cooldownTicks[skill]} tick`
      : "";
  }
  el<HTMLButtonElement>("attack").disabled =
    !canCommand || !own.length || enemy.length === 0;
  for (const id of [
    "move",
    "advance",
    "retreat",
    "applyStance",
    "applyFormation",
    "reassign",
  ])
    el<HTMLButtonElement>(id).disabled = !canCommand || !own.length;
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
  playtest?.command(state?.tick ?? 0, command.type);
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
function drawView(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  alpha: number,
  mini = false,
) {
  if (!state) return;
  const size = ctx.canvas;
  size.dataset.tick = String(state.tick);
  ctx.fillStyle = "#61594b";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.save();
  ctx.beginPath();
  if (hasObjectives) {
    const corners = viewportCorners(camera);
    ctx.moveTo(corners[0]!.x, corners[0]!.y);
    for (const p of corners.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.clip();
  }
  ctx.beginPath();
  for (const observer of state.squads.filter(
    (s) => s.nationId === state!.nationId && s.hpMilli > 0,
  )) {
    const { x, y } = worldToMap(observer.position, camera);
    const radius = projectedRadius(state.visionRadiusUnits, camera);
    ctx.moveTo(x + radius.x, y);
    ctx.ellipse(x, y, radius.x, radius.y, 0, 0, Math.PI * 2);
  }
  ctx.clip();
  ctx.fillStyle = "#dfd1ae";
  ctx.fillRect(0, 0, size.width, size.height);
  if (!mini) {
    ctx.strokeStyle = "#a9926633";
    ctx.lineWidth = 0.6;
    const step = state.config.positionUnitsPerTile * 2;
    ctx.beginPath();
    for (
      let x = Math.ceil(camera.left / step) * step;
      x <= camera.left + camera.width;
      x += step
    ) {
      const a = worldToMap({ x, y: camera.top }, camera),
        b = worldToMap({ x, y: camera.top + camera.height }, camera);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    for (
      let y = Math.ceil(camera.top / step) * step;
      y <= camera.top + camera.height;
      y += step
    ) {
      const a = worldToMap({ x: camera.left, y }, camera),
        b = worldToMap({ x: camera.left + camera.width, y }, camera);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.font = '14px "Noto Sans KR", sans-serif';
  const labels: FieldLabel[] = [];
  for (const point of state.objectiveMatch?.points ?? []) {
    const { x, y } = worldToMap(point.position, camera);
    ctx.save();
    ctx.strokeStyle = !point.open
      ? "#aaa"
      : point.contested
        ? "#d79418"
        : point.owner === "blue"
          ? "#286b9a"
          : point.owner === "red"
            ? "#ae4a36"
            : point.owner === "green"
              ? "#3b8656"
              : "#756743";
    ctx.lineWidth = 2;
    ctx.setLineDash(point.open ? [] : [4, 4]);
    ctx.beginPath();
    const radius = projectedRadius(state.objectiveMatch!.radiusUnits, camera);
    ctx.ellipse(x, y, radius.x, radius.y, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (!mini && x >= 0 && y >= 0 && x <= size.width && y <= size.height)
      labels.push({
        text: point.name,
        x,
        y,
        width: ctx.measureText(point.name).width,
      });
  }
  for (const entry of state.lastSeen) {
    const { x, y } = worldToMap(entry.position, camera);
    if (x < -18 || y < -18 || x > size.width + 18 || y > size.height + 18)
      continue;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#e5d8b7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, mini ? 4 : 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const text = `? ${entry.id} · ${entry.observedTick}tick`;
    if (!mini)
      labels.push({
        text,
        x,
        y,
        width: ctx.measureText(text).width,
        memory: true,
      });
  }
  for (const s of state.squads
    .filter((s) => s.hpMilli > 0)
    .sort(
      (a, b) =>
        (camera.projection === "isometric"
          ? a.position.x + a.position.y - b.position.x - b.position.y
          : a.position.y - b.position.y) || a.id.localeCompare(b.id),
    )) {
    const old = previousState?.squads.find((p) => p.id === s.id);
    const xUnits = old
      ? old.position.x + (s.position.x - old.position.x) * alpha
      : s.position.x;
    const yUnits = old
      ? old.position.y + (s.position.y - old.position.y) * alpha
      : s.position.y;
    const { x, y } = worldToMap({ x: xUnits, y: yUnits }, camera);
    if (x < -18 || y < -18 || x > size.width + 18 || y > size.height + 18)
      continue;
    if (
      !mini &&
      s.id === (mode === "3v3" || mode === "national" ? "blue-1-1" : "blue-1")
    )
      root.dataset.renderX = String(x);
    ctx.beginPath();
    ctx.arc(x, y, mini ? 4 : 16, 0, Math.PI * 2);
    ctx.fillStyle =
      s.nationId === "blue"
        ? "#286b9a"
        : s.nationId === "green"
          ? "#3b8656"
          : "#ae4a36";
    if (mini) ctx.fill();
    else
      armyArt.draw(
        ctx,
        s,
        x,
        y,
        state.tick,
        lastEvents,
        state.commanders.some(
          (c) =>
            c.status === "ACTIVE" &&
            c.hpMilli > 0 &&
            c.assignedSquadId === s.id,
        ),
        hasObjectives && mapView === "overview",
      );
    if (
      s.id ===
      el<HTMLSelectElement>(s.ownerPlayerId === seat ? "squad" : "target").value
    ) {
      ctx.strokeStyle = "#e8bd51";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y + (mini ? 0 : 3),
        mini ? 5 : 26,
        mini ? 5 : 12,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    if (
      !mini &&
      (camera.projection !== "isometric" ||
        el<HTMLInputElement>("all-unit-labels").checked ||
        s.ownerPlayerId === seat ||
        s.id === el<HTMLSelectElement>("target").value)
    )
      labels.push({ text: s.id, x, y, width: ctx.measureText(s.id).width });
  }
  for (const label of placeFieldLabels(labels, size.width, size.height)) {
    const { box } = label;
    ctx.strokeStyle = label.memory ? "#c1b49c" : "#514331";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(label.x, label.y);
    ctx.lineTo(box.x, box.y + box.height / 2);
    ctx.stroke();
    ctx.fillStyle = label.memory ? "#514a3f" : "#fff5df";
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.fillStyle = label.memory ? "#f4e9d0" : "#222";
    ctx.fillText(label.text, box.x + 4, box.y + 15, box.width - 8);
  }
}
function draw() {
  if (!state) return;
  const paintStart = performance.now();
  if (
    document.hidden ||
    paintStart - lastPaint < presentationSettings.frameMs
  ) {
    if (document.hidden) renderPerformance.pause();
    drawFrame = requestAnimationFrame(draw);
    return;
  }
  lastPaint = paintStart;
  root.dataset.armyArt = armyArt.status;
  root.dataset.artRequests = String(armyArt.requestedAssets);
  const alpha = Math.min(1, (performance.now() - receivedAt) / 200),
    camera = fieldCamera();
  drawView(ctx, camera, alpha);
  presentation.draw(
    ctx,
    camera,
    state,
    armyArt.reducedMotion,
    (x, y, t, reduced) => armyArt.drawWounded(ctx, x, y, t, reduced),
  );
  const signature = JSON.stringify([
    state.tick,
    camera.left,
    camera.top,
    camera.width,
    camera.height,
  ]);
  if (hasObjectives && signature !== miniSignature) {
    miniSignature = signature;
    renderPerformance.minimapPaints++;
    const mini = miniCamera();
    drawView(strategicCtx, mini, alpha, true);
    const corner = worldToMap({ x: camera.left, y: camera.top }, mini);
    strategicCtx.strokeStyle = "#fff4ad";
    strategicCtx.lineWidth = 2;
    strategicCtx.strokeRect(
      corner.x,
      corner.y,
      camera.width * mini.scale,
      camera.height * mini.scale,
    );
  }
  renderPerformance.record(paintStart, performance.now());
  if (renderPerformance.frames % 30 === 0) {
    const report = renderPerformance.summary();
    root.dataset.performance = JSON.stringify(report);
    el("render-performance").textContent =
      `표현 성능 · ${report.observedFps.toFixed(1)}fps · paint p95 ${report.paintP95Ms.toFixed(2)}ms · ${report.samples}표본`;
  }
  drawFrame = requestAnimationFrame(draw);
}
canvas.addEventListener("click", (event) => {
  if (!state || !seat) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) * canvas.width) / rect.width;
  const y = ((event.clientY - rect.top) * canvas.height) / rect.height;
  const camera = fieldCamera();
  const hit = state.squads
    .filter((s) => s.hpMilli > 0)
    .map((s) => {
      const old = previousState?.squads.find((p) => p.id === s.id),
        alpha = Math.min(1, (performance.now() - receivedAt) / 200);
      const position = old
        ? {
            x: old.position.x + (s.position.x - old.position.x) * alpha,
            y: old.position.y + (s.position.y - old.position.y) * alpha,
          }
        : s.position;
      const pixel = worldToMap(position, camera);
      return {
        s,
        distance: Math.hypot(x - pixel.x, y - pixel.y),
        artHit: armyHit({ x, y }, pixel),
      };
    })
    .sort((a, b) => a.distance - b.distance)[0];
  if (hit && (hit.distance <= 25 || hit.artHit)) {
    if (hit.s.ownerPlayerId === seat)
      el<HTMLSelectElement>("squad").value = hit.s.id;
    else if (hit.s.nationId !== seat.split("-")[0])
      el<HTMLSelectElement>("target").value = hit.s.id;
    render();
  } else {
    if (hasObjectives) {
      const world = mapToWorld({ x, y }, camera);
      if (!world) return;
      const units = state.config.positionUnitsPerTile;
      el<HTMLInputElement>("dest-x").value = String(
        Math.round((world.x / units) * 10) / 10,
      );
      el<HTMLInputElement>("dest-y").value = String(
        Math.round((world.y / units) * 10) / 10,
      );
    } else {
      el<HTMLInputElement>("dest-x").value = String(
        Math.max(0, Math.round((x - 40) / 30)),
      );
      el<HTMLInputElement>("dest-y").value = String(
        Math.max(0, Math.round((y - 40) / 30)),
      );
    }
  }
});
async function connect(createPrivate = false) {
  armyArt.reset();
  presentation.reset();
  miniSignature = "";
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
      mode === "national"
        ? "battle_national"
        : hasObjectives
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
          ? hasObjectives
            ? "거점 경기 시작"
            : "경기 시작 · 빈자리 AI 보충"
          : reason === "NEED_THREE_NATIONS"
            ? "각 국가에 인간 참가자가 한 명 이상 필요합니다."
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
      presentation.baseline(next);
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
        audio.play(
          presentation.ingest(next, lastEvents),
          !document.hidden && (ready || !!next.objectiveMatch?.result),
        );
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
        playtest?.reply(state?.tick ?? 0, response.accepted, response.reason);
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
      audio.mute();
      syncSoundControls();
      presentation.reset();
      cancelAnimationFrame(drawFrame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      strategicCtx.clearRect(0, 0, strategicMap.width, strategicMap.height);
      delete strategicMap.dataset.tick;
      delete canvas.dataset.tick;
      mapView = "overview";
      mapFocus = {
        x: mapSettings.widthTiles / 2,
        y: mapSettings.heightTiles / 2,
      };
      el("map-points").replaceChildren();
      updateMapControls();
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
        "national-clock",
        "national-player",
        "national-economy",
        "supply-feedback",
        "augment-progress",
        "national-ranking",
      ])
        el(id).textContent = "";
      el<HTMLSelectElement>("remove-seat").replaceChildren();
      el("invite").hidden = true;
      lobbyStarted = mode === "1v1";
      el("next-match").hidden = true;
      el("augment-offer").replaceChildren();
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

updateMapControls();

el("resupply").addEventListener("click", () => send({ type: "RESUPPLY" }));
el("recruit").addEventListener("click", () =>
  send({
    type: "RECRUIT",
    squadIds: [],
    unitType: el<HTMLSelectElement>("recruit-unit").value,
  }),
);

el("export-playtest").addEventListener("click", () => {
  if (!playtest) return;
  const url = URL.createObjectURL(
    new Blob(
      [playtest.export(el<HTMLTextAreaElement>("playtest-notes").value)],
      { type: "application/json" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `phase7-playtest-${playtest.seat}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function syncSoundControls() {
  el("sound-toggle").textContent = audio.enabled
    ? "효과음 끄기"
    : "효과음 켜기";
  el("sound-toggle").setAttribute("aria-pressed", String(audio.enabled));
}
el("sound-toggle").addEventListener("click", async () => {
  el<HTMLButtonElement>("sound-toggle").disabled = true;
  try {
    if (audio.enabled) audio.mute();
    else await audio.enable();
    if (document.hidden) audio.mute();
    el("sound-status").textContent = audio.enabled ? "효과음 켜짐" : "음소거";
  } catch {
    el("sound-status").textContent =
      "이 브라우저에서 소리를 시작하지 못했습니다.";
  }
  syncSoundControls();
  el<HTMLButtonElement>("sound-toggle").disabled = false;
});
el("sound-volume").addEventListener(
  "input",
  () =>
    (audio.volume = Number(el<HTMLInputElement>("sound-volume").value) / 100),
);
const reduced = el<HTMLInputElement>("reduce-effects");
reduced.checked = motionPreference.matches;
armyArt.reducedMotion = reduced.checked;
reduced.addEventListener(
  "change",
  () => (armyArt.reducedMotion = reduced.checked),
);
motionPreference.addEventListener("change", (e) => {
  reduced.checked = e.matches;
  armyArt.reducedMotion = e.matches;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    audio.mute();
    syncSoundControls();
    renderPerformance.pause();
  }
});
