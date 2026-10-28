import cavalryAttackUrl from "./cavalry-attack.svg?url";
import { observeAttack, footAnimation } from "./unit-motion.js";
import type { AttackSample } from "./unit-motion.js";
import { orderCues, orderViewColors } from "./order-view.js";
import type { OrderCue } from "./order-view.js";
import { formationView, soldierFoot } from "./formation-view.js";
import { layoutLabels } from "./label-layout.js";
import type { LabelAnchor } from "./label-layout.js";
import { squadFeedback } from "./squad-feedback.js";
import infantryWalkUrl from "./infantry-walk.svg?url";
import infantryAttackUrl from "./infantry-attack.svg?url";
import archerWalkUrl from "./archer-walk.svg?url";
import archerAttackUrl from "./archer-attack.svg?url";
import { arrowPose, retainArrows } from "./arrow-effect.js";
import type { ArrowFlight } from "./arrow-effect.js";
import cavalryUrl from "./cavalry-canter.svg?url";
import commanderUrl from "./commander-canter.svg?url";
import walkUrl from "./spear-walk.svg?url";
import attackUrl from "./spear-attack.svg?url";
import motionAtlas from "./motion-atlas.json";
import { footPose, mountedPose, observeMotion } from "./unit-motion.js";
import type { MotionSample } from "./unit-motion.js";
import terrainUrl from "./terrain.svg?url";
import { project, unproject, groundRing } from "./projection.js";
import Phaser from "phaser";
import rawConfig from "../../../battle_config.v1.json";
import {
  parseBattleConfig,
  livingSoldiers,
} from "../../../packages/battle-core/src/index.js";
import type { Squad, Skill } from "../../../packages/battle-core/src/index.js";
import { LocalSession, HUMAN, DEMO, defaults } from "./session.js";
import type { Options, Unit } from "./session.js";
import "@fontsource/noto-sans-kr/400.css";
import "./style.css";
const config = parseBattleConfig(rawConfig);
const session = new LocalSession(config);
const unitNames: Record<Unit, string> = {
  infantry: "보병",
  spears: "창병",
  archers: "궁병",
  cavalry: "기병",
};
const augmentNames: Record<string, string> = {
  "draft-shock-breakthrough": "충격 돌파",
  "draft-gale-maneuver": "질풍 기동",
  "draft-legion-discipline": "군단의 규율",
};
const options = (entries: Record<string, string>) =>
  Object.entries(entries)
    .map(([v, n]) => `<option value="${v}">${n}</option>`)
    .join("");
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<header><div><small>STRATELIER / 채색 병서 전투 실험실</small><h1>로언 베이의 삼국지</h1></div><div class="badge">로컬 데모 · demo-order-v0.1<br>각 2부대 · 40명 / 시작 Lv.${DEMO.startLevel} (R 검증용)</div></header>
<section class="setup"><label>아군 1 <select id="human1">${options(unitNames)}</select></label><label>아군 2 <select id="human2">${options(unitNames)}</select></label><label>적군 1 <select id="enemy1">${options(unitNames)}</select></label><label>적군 2 <select id="enemy2">${options(unitNames)}</select></label><label><input id="experimental" type="checkbox"> 실험용 증강 (수치 미검증)</label><button id="reset">편성 적용 · 초기화</button></section>
<main><section class="battle"><div class="toolbar"><strong id="clock"></strong><button id="pause">시작</button><button id="download">전체 로그 JSON</button></div><div id="arena"></div><p class="legend">군기: 아군 파랑 / 적군 빨강 · 백마: 장수 · 보·창·궁 4방향 이동·공격 · 기병·무장 4방향 이동 초안</p><div id="cards"></div></section>
<aside><h2>전술 명령</h2><p>클릭 / 1·2: 선택 · Shift: 복수 선택<br>우클릭: 이동 / 적 공격 · 방향키: 화면 이동</p><div class="buttons"><button id="move">이동</button><button id="attackMove">공격 이동 (A)</button><button id="retreat">후퇴 (T)</button></div><label>태세 <select id="stance">${options({ defensive: "방어", balanced: "균형", aggressive: "공격" })}</select></label><button id="applyStance">태세 적용</button><label>진형 <select id="formation">${options({ normal: "기본진", defense: "방어진", offense: "공격진" })}</select></label><button id="applyFormation">진형 적용</button>
<h2>무장 스킬</h2><div class="buttons"><button id="Q">Q 돌격</button><button id="W">W 함성</button><button id="R">R 파죽지세</button></div><p id="aim"></p><div class="buttons"><button id="confirm">시전 확인 (Enter)</button><button id="cancel">취소 (Esc)</button></div><button id="reassign">선택 부대로 장수 재배속</button><pre id="commander"></pre><p role="status" id="notice"></p><section id="augments"></section></aside></main>
<section class="log"><h2>전투 사건 <small>최근 주요 사건 · 전체 사건은 JSON에 기록</small></h2><pre id="events"></pre></section><footer>브라우저 내 battle-core 실행 · 실제 서버 권위 / 멀티플레이 아님 · 자동 AI는 기본 교전·추격·복귀만 수행합니다. 성장·거점 승리 규칙 없음. Phase 3·4 전체 미완료.</footer>`;
// Reuse existing command controls; only their presentation changes.
const setupPanel = document.createElement("details");
setupPanel.id = "setup-panel";
setupPanel.innerHTML = "<summary>시험 편성 · 테스트 설정</summary>";
const setup = document.querySelector(".setup")!;
setup.before(setupPanel);
setupPanel.append(setup);
const main = document.querySelector("main")!;
const desk = document.createElement("section");
desk.className = "command-desk";
desk.innerHTML =
  '<section id="selected-unit" aria-label="선택 부대 상태"></section><section class="command-panel"><div class="desk-heading"><span class="seal" aria-hidden="true">令</span><h2>군령을 내리다</h2></div><p id="order-step" aria-live="polite"></p></section>';
main.after(desk);
const aside = document.querySelector("aside")!;
desk.querySelector(".command-panel")!.append(aside);
for (const selector of ["#cards", ".log", "#commander"]) {
  const node = document.querySelector(selector)!;
  const panel = document.createElement("details");
  panel.className = "debug-panel";
  const summary = document.createElement("summary");
  summary.textContent =
    selector === "#cards"
      ? "전체 부대 상태"
      : selector === ".log"
        ? "전투 사건 · 개발 로그"
        : "장수 상세 · 검증 수치";
  node.before(panel);
  panel.append(summary, node);
}
const tactics = document.createElement("details");
tactics.className = "tactics";
tactics.innerHTML = "<summary>전술 · 진형 · 조작 도움말</summary>";
const tips = aside.querySelector("p");
if (tips) tactics.append(tips);
tactics.append(elNode("move").parentElement!);
for (const id of ["stance", "formation"])
  tactics.append(elNode(id).parentElement!);
for (const id of ["applyStance", "applyFormation", "reassign"])
  tactics.append(elNode(id));
aside.append(tactics);
const augmentPanel = document.createElement("details");
augmentPanel.id = "augment-panel";
augmentPanel.innerHTML = "<summary>증강 선택 · 실험용</summary>";
augmentPanel.append(elNode("augments"));
aside.append(augmentPanel);
const cardsPanel = elNode("cards").parentElement!;
desk.after(cardsPanel);
function elNode(id: string) {
  return document.getElementById(id)!;
}
const restart = document.createElement("button");
restart.id = "restart";
restart.textContent = "테스트 다시 시작";
document.querySelector(".toolbar")!.append(restart);
const allGone = document.createElement("p");
allGone.id = "defeat";
allGone.setAttribute("role", "status");
document.querySelector("#arena")!.after(allGone);
function el<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}
for (const side of ["human", "enemy"] as const)
  defaults[side].forEach(
    (unit, i) => (el<HTMLSelectElement>(`${side}${i + 1}`).value = unit),
  );
function action(id: string, fn: () => void) {
  el(id).addEventListener("click", () => {
    fn();
    hud();
  });
}
function readOptions(): Options {
  return {
    human: [
      el<HTMLSelectElement>("human1").value as Unit,
      el<HTMLSelectElement>("human2").value as Unit,
    ],
    enemy: [
      el<HTMLSelectElement>("enemy1").value as Unit,
      el<HTMLSelectElement>("enemy2").value as Unit,
    ],
    experimental: el<HTMLInputElement>("experimental").checked,
  };
}
action("reset", () => {
  session.reset(readOptions());
  offerKey = "";
  viewReset++;
});
action("restart", () => el("reset").click());
action("pause", () => session.togglePause());
action("move", () => {
  session.cancel();
  session.notice = "우클릭으로 목적지 또는 적을 지정하세요.";
});
for (const [id, mode] of [
  ["attackMove", "ATTACK_MOVE"],
  ["retreat", "RETREAT"],
] as const)
  action(id, () => {
    session.cancel();
    session.mode = mode;
    session.notice = "우클릭으로 목적지를 지정하세요.";
  });
action("applyStance", () => {
  session.cancel();
  session.send({
    type: "SET_STANCE",
    squadIds: [...session.selected],
    stance: el<HTMLSelectElement>("stance").value as Squad["stance"],
  });
});
action("applyFormation", () => {
  session.cancel();
  session.send({
    type: "SET_FORMATION",
    squadIds: [...session.selected],
    formation: el<HTMLSelectElement>("formation").value as Squad["formation"],
  });
});
for (const skill of ["Q", "W", "R"] as const)
  action(skill, () => session.beginSkill(skill));
action("confirm", () => session.confirmSkill());
action("cancel", () => session.cancel());
action("reassign", () => {
  session.cancel();
  session.send({
    type: "REASSIGN_COMMANDER",
    commanderId: "human-commander",
    squadIds: [...session.selected],
  });
});
action("download", () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(session.exportLog())], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "battle-replay.json";
  a.click();
  URL.revokeObjectURL(url);
});
document.addEventListener("keydown", (e) => {
  if (
    e.repeat ||
    /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)
  )
    return;
  const key = e.key.toLowerCase();
  if (["1", "2", "q", "w", "r", "enter", "escape", " ", "a", "t"].includes(key))
    e.preventDefault();
  if (key === "1" || key === "2") session.select(`human-${key}`, e.shiftKey);
  else if (["q", "w", "r"].includes(key)) {
    const skill = key.toUpperCase() as Skill;
    if (!el<HTMLButtonElement>(skill).disabled) session.beginSkill(skill);
  } else if (key === "enter") session.confirmSkill();
  else if (key === "escape") session.cancel();
  else if (key === " ") {
    e.preventDefault();
    session.togglePause();
  } else if (key === "a" || key === "t") {
    session.cancel();
    session.mode = key === "a" ? "ATTACK_MOVE" : "RETREAT";
  }
  hud();
});
let offerKey = "";
let viewReset = 0;
const names: Record<string, string> = {
  IDLE: "대기",
  MOVE: "이동",
  ENGAGE: "교전",
  CHASE: "추격",
  CHARGE: "돌격",
  RETURN: "복귀",
  RETREAT: "후퇴",
  REGROUP: "재정비",
  ROUTED: "패주",
  BROKEN: "붕괴",
  DEFEATED: "전멸",
  ACTIVE: "활동",
  REASSIGNING: "재배속",
  EXPOSED: "노출",
  WOUNDED: "부상",
  defensive: "방어",
  balanced: "균형",
  aggressive: "공격",
  normal: "기본진",
  defense: "방어진",
  offense: "공격진",
};
const rejection: Record<string, string> = {
  MELEE_REQUIRED: "근접 병종만 사용 가능",
  COOLDOWN: "쿨다운 중",
  COMMANDER_DISABLED: "장수 활동 불가",
  FORCED_STATE: "강제 상태에서는 명령 불가",
  OUT_OF_COMMAND_RANGE: "지휘 반경 밖",
  INSUFFICIENT_PREPARATION: "돌격 준비거리 부족",
  INVALID_CHARGE_DIRECTION: "돌격 방향 불일치",
  TARGET_LIMIT: "대상 수 초과",
  INVALID_TARGET: "잘못된 대상",
  LEVEL_REQUIRED: "레벨 부족",
};
function hud() {
  const selected = session.state.squads.filter((s) =>
    session.selected.includes(s.id),
  );
  const commander = session.state.commanders.find(
    (c) => c.ownerPlayerId === HUMAN,
  );
  const gauge = (name: string, value: number, max: number, kind: string) =>
    `<label class="gauge ${kind}"><span>${name}</span><meter min="0" max="${max}" value="${value}">${value}/${max}</meter><b>${Math.round((value / max) * 100)}%</b></label>`;
  el("selected-unit").innerHTML = selected.length
    ? selected
        .map(
          (s) =>
            `<div class="unit-summary"><small>선택 부대 · ${names[s.fsmState]}</small><h2>아군 ${s.id.split("-").at(-1)}부대 · ${unitNames[s.unitType]}</h2><p>병력 ${livingSoldiers(s, config)} / ${s.maxSoldiers}명 · ${names[s.formation]}</p><p class="order-summary">${
              orderCues(s, session.state.squads)
                .map(
                  (c) =>
                    c.caption +
                    (c.targetId
                      ? " · 적군 " + c.targetId.split("-").at(-1)
                      : ""),
                )
                .join(" / ") || "진행 중인 이동·공격 명령 없음"
            }</p>${gauge("체력", s.hpMilli, s.maxSoldiers * config.soldierHp * config.hpMilliPerHp, "hp")}${gauge("사기", s.morale, 100, "morale")}${gauge("응집도", s.cohesion, 100, "cohesion")}</div>`,
        )
        .join("")
    : "<h2>부대를 선택하세요</h2><p>전장 클릭 또는 숫자 1·2</p>";
  const charging = session.state.squads.some(
    (s) => s.ownerPlayerId === HUMAN && s.charge,
  );
  const result = [...session.events]
    .reverse()
    .find(
      (e) =>
        (e.type === "CHARGE_IMPACT" || e.type === "CHARGE_CANCELLED") &&
        session.state.squads.some(
          (s) => s.id === e.actorId && s.ownerPlayerId === HUMAN,
        ),
    );
  el("order-step").textContent = session.pending
    ? session.pending.skill === "Q"
      ? session.pending.targetSquadId
        ? "③ 돌격 실행 · 아래 군령패로 확인하세요"
        : "② 목표 지정 · 적 부대를 클릭하세요"
      : `${session.pending.skill} 대상 지정 · 아군을 선택하고 실행하세요`
    : charging
      ? "④ 돌격 진행 중"
      : result && session.state.tick - result.tick < 40
        ? result.type === "CHARGE_IMPACT"
          ? "⑤ 돌격 적중 · 전투 결과를 확인하세요"
          : "⑤ 돌격 종료 · 사건 로그에서 이유를 확인하세요"
        : "① 부대 선택 → Q 군령패 → 적 지정 → 돌격 실행";
  el<HTMLButtonElement>("confirm").disabled =
    !session.pending ||
    !session.pending.squadIds.length ||
    (session.pending.skill === "Q" && !session.pending.targetSquadId);
  el("confirm").textContent =
    session.pending?.skill === "Q" ? "돌격 실행 (Enter)" : "군령 실행 (Enter)";
  for (const skill of ["Q", "W", "R"] as const) {
    const button = el<HTMLButtonElement>(skill);
    const remaining =
      ((commander?.cooldownTicks[skill] ?? 0) * config.tickMs) / 1000;
    button.disabled =
      !commander || commander.status !== "ACTIVE" || remaining > 0;
    button.textContent = `${skill} ${skill === "Q" ? "돌격" : skill === "W" ? "함성" : "파죽지세"} · ${remaining > 0 ? remaining.toFixed(1) + "초" : "준비"}`;
    button.title =
      remaining > 0
        ? "재사용 대기 중"
        : commander?.status !== "ACTIVE"
          ? "장수가 활동 가능한 상태여야 합니다"
          : "군령 선택 후 전장에서 대상을 지정하세요";
  }
  el("defeat").textContent = session.state.squads
    .filter((s) => s.ownerPlayerId === HUMAN)
    .every((s) => s.hpMilli === 0)
    ? "아군 전멸 · 테스트 다시 시작으로 편성을 초기화하세요"
    : "";
  el("clock").textContent =
    `${((session.state.tick * config.tickMs) / 1000).toFixed(1)}초 · ${session.state.tick}tick${session.state.tick >= 900 ? " · 90초 이상 실행" : ""}`;
  el("pause").textContent = session.paused ? "시작 / 계속" : "일시정지";
  const code = session.notice.replace("코어 거부: ", "");
  el("notice").textContent = rejection[code]
    ? `코어 거부: ${rejection[code]} (${code})`
    : session.notice;
  el("aim").textContent = session.pending
    ? `${session.pending.skill} 지정 중 · 실행/대상 부대: ${session.pending.squadIds.map((id) => "아군 " + id.split("-").at(-1) + "부대").join(", ") || "없음"} · 적: ${session.pending.targetSquadId ? "적 " + session.pending.targetSquadId.split("-").at(-1) + "부대" : "미지정"}`
    : `선택 ${session.selected.length}개 부대 · ${session.mode === "normal" ? "이동 / 공격" : session.mode === "ATTACK_MOVE" ? "공격 이동" : "후퇴"}`;
  el("cards").innerHTML = session.state.squads
    .map(
      (s) =>
        `<article class="${s.ownerPlayerId === HUMAN ? "blue" : "red"} ${session.selected.includes(s.id) ? "selected" : ""}"><strong>${s.id} · ${unitNames[s.unitType]}</strong><p>병력 ${livingSoldiers(s, config)}/${s.maxSoldiers} · HP ${(s.hpMilli / config.hpMilliPerHp).toFixed(1)}</p><p>사기 ${s.morale} · 전열 ${s.cohesion}</p><p>${names[s.fsmState]} (${s.fsmState}) · 태세 ${names[s.stance]}<br>진형 ${names[s.formation]}${s.pendingFormation ? ` → ${names[s.pendingFormation]} (${s.formationRemainingTicks}tick)` : ""}</p></article>`,
    )
    .join("");
  el("commander").textContent = session.state.commanders
    .map(
      (c) =>
        `${c.ownerPlayerId === HUMAN ? "아군" : "적군"} 장수: ${names[c.status]} (${c.status})\nHP ${(c.hpMilli / config.hpMilliPerHp).toFixed(1)} · 재출전 ${c.respawnRemainingTicks}tick\n위치 (${c.position.x}, ${c.position.y}) · 본대 ${c.assignedSquadId ?? "없음"}\nQ ${c.cooldownTicks.Q} / W ${c.cooldownTicks.W} / R ${c.cooldownTicks.R} tick`,
    )
    .join("\n\n");
  const recent = session.events
    .filter(
      (e) =>
        ![
          "ATTACK_HIT",
          "COHESION_CHANGED",
          "MORALE_CHANGED",
          "COMMANDER_HIT",
        ].includes(e.type),
    )
    .slice(-25);
  el("events").textContent = recent
    .map(
      (e) =>
        `[${e.tick}] ${e.type} ${e.actorId} ${e.targetId ?? ""} ${e.skill ?? ""} ${e.reason ?? ""}`,
    )
    .join("\n");
  const progress = session.state.augmentProgress.find(
    (p) => p.playerId === HUMAN,
  )!;
  const key = JSON.stringify([session.options.experimental, progress]);
  if (key !== offerKey) {
    offerKey = key;
    el("augments").replaceChildren();
    const title = document.createElement("h2");
    title.textContent = "실험용 증강";
    el("augments").append(title);
    const text = document.createElement("p");
    text.textContent = !session.options.experimental
      ? "꺼짐 · 초기화 시 실험 모드 선택 가능"
      : `선택 ${progress.spent} / 기회 ${progress.earned.length} · ${progress.offer ? "선택 보류 중 효과 없음" : "후보 부족 · 남은 기회 보존"}`;
    el("augments").append(text);
    if (session.options.experimental && progress.offer)
      for (const id of progress.offer.candidates) {
        const button = document.createElement("button");
        button.textContent = augmentNames[id] ?? id;
        button.onclick = () => {
          session.send({
            type: "SELECT_AUGMENT",
            squadIds: [],
            checkpoint: progress.offer!.checkpoint,
            augmentId: id,
          });
          hud();
        };
        el("augments").append(button);
      }
    if (progress.selected.length) {
      const chosen = document.createElement("p");
      chosen.textContent = `선택됨: ${progress.selected.map((id) => augmentNames[id] ?? id).join(", ")}`;
      el("augments").append(chosen);
    }
  }
}

class BattleScene extends Phaser.Scene {
  private seenReset = 0;
  private ink!: Phaser.GameObjects.Graphics;
  private arrowInk!: Phaser.GameObjects.Graphics;
  private selectionInk!: Phaser.GameObjects.Graphics;
  private arrowFlights: ArrowFlight[] = [];
  visibleArrowCount = 0;
  visibleOrderCues: OrderCue[] = [];
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private arrows!: Phaser.Types.Input.Keyboard.CursorKeys;
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private previousPositions = new Map<string, MotionSample>();
  private lastHits = new Map<string, AttackSample>();
  private lastDamage = new Map<string, number>();
  private seenEvents = 0;
  preload() {
    this.load.image("infantry-walk", infantryWalkUrl);
    this.load.image("infantry-attack", infantryAttackUrl);
    this.load.image("archer-walk", archerWalkUrl);
    this.load.image("archer-attack", archerAttackUrl);
    this.load.image("cavalry-canter", cavalryUrl);
    this.load.image("cavalry-attack", cavalryAttackUrl);
    this.load.image("commander-canter", commanderUrl);
    this.load.image("spear-walk", walkUrl);
    this.load.image("spear-attack", attackUrl);
    this.load.image("battle-ground", terrainUrl);
  }
  private fontReady = false;
  create() {
    void document.fonts
      .load('12px "Noto Sans KR"', "아군 기병 창병 로언 베이의 삼국지")
      .then(() => {
        this.fontReady = true;
      });
    if (this.textures.exists("battle-ground"))
      this.add
        .image(480, 280, "battle-ground")
        .setDisplaySize(1200, 700)
        .setDepth(-100);
    for (const [key, atlas] of Object.entries(motionAtlas)) {
      if (this.textures.exists(key))
        atlas.frames.forEach((f, i) =>
          this.textures.get(key).add(String(i), 0, f.x, f.y, f.width, f.height),
        );
    }
    this.ink = this.add.graphics();
    this.arrowInk = this.add.graphics().setDepth(50000);
    this.selectionInk = this.add.graphics().setDepth(90000);
    this.arrows = this.input.keyboard!.createCursorKeys();
    this.input.mouse!.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      // Camera transform first, then inverse isometric projection.
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      const pos = unproject(world);
      // Screen-space hit area covers the visible formation and its tall sprites.
      const score = (s: Squad) => {
        const foot = project(s.position);
        return Math.hypot(
          (world.x - foot.x) / 85,
          (world.y - (foot.y - 25)) / 70,
        );
      };
      const candidates = [...session.state.squads]
        .filter((s) => s.hpMilli > 0 && score(s) <= 1)
        .sort((a, b) => score(a) - score(b));
      const wantEnemy = p.rightButtonDown() || session.pending?.skill === "Q";
      const hit =
        candidates.find((s) => (s.ownerPlayerId !== HUMAN) === wantEnemy) ??
        candidates[0];
      if (p.rightButtonDown()) session.rightClick(pos, hit?.id);
      else if (hit) {
        if (session.pending) session.target(hit.id);
        else session.select(hit.id, p.event.shiftKey);
      }
      hud();
    });
    hud();
  }
  update(_time: number, delta: number) {
    const before = session.state.tick;
    session.advance(delta);
    if (before !== session.state.tick) hud();
    const cam = this.cameras.main;
    if (this.seenReset !== viewReset) {
      cam.setScroll(0, 0);
      this.arrowFlights = [];
      this.visibleArrowCount = 0;
      this.previousPositions.clear();
      this.lastHits.clear();
      this.lastDamage.clear();
      this.seenEvents = 0;
      this.seenReset = viewReset;
    }
    const speed = delta * 0.5;
    if (this.arrows.left.isDown) cam.scrollX -= speed;
    if (this.arrows.right.isDown) cam.scrollX += speed;
    if (this.arrows.up.isDown) cam.scrollY -= speed;
    if (this.arrows.down.isDown) cam.scrollY += speed;
    for (const event of session.events.slice(this.seenEvents)) {
      if (event.type !== "ATTACK_HIT") continue;
      const attacking = session.state.squads.find(
        (s) => s.id === event.actorId,
      );
      if (attacking) {
        const sample = observeAttack(
          this.lastHits.get(event.actorId),
          event.tick,
          session.state.tick,
          attacking.facing,
        );
        if (sample) this.lastHits.set(event.actorId, sample);
      }
      if (event.targetId && (event.delta ?? 0) < 0)
        this.lastDamage.set(event.targetId, event.tick);
      const actor = session.state.squads.find((s) => s.id === event.actorId),
        target = session.state.squads.find((s) => s.id === event.targetId);
      if (actor?.unitType === "archers" && target)
        this.arrowFlights.push({
          tick: event.tick,
          from: { ...actor.position },
          to: { ...target.position },
        });
    }
    this.arrowFlights = retainArrows(this.arrowFlights, session.state.tick);
    this.seenEvents = session.events.length;
    if (!this.fontReady) return;
    const g = this.ink;
    g.clear();
    this.arrowInk.clear();
    this.selectionInk.clear();
    this.visibleOrderCues = session.state.squads
      .filter((s) => session.selected.includes(s.id))
      .flatMap((s) => orderCues(s, session.state.squads));
    for (const cue of this.visibleOrderCues) {
      const a = project(cue.from),
        b = project(cue.to);
      const fx = this.selectionInk;
      const color = orderViewColors[cue.kind];
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy);
      const ux = length > 0 ? dx / length : 0,
        uy = length > 0 ? dy / length : -1;
      // Fixed dashes, independent of frame time; a direct guide is not a pathfinding route.
      fx.lineStyle(2, color, 0.8);
      for (let d = 12; d < length - 12; d += 15)
        fx.lineBetween(
          a.x + ux * d,
          a.y + uy * d,
          a.x + ux * Math.min(d + 8, length - 12),
          a.y + uy * Math.min(d + 8, length - 12),
        );
      if (cue.targetId) {
        fx.lineStyle(3, color, 1);
        fx.strokePoints(groundRing(cue.to, 900), true);
        fx.lineBetween(b.x - 8, b.y, b.x + 8, b.y);
        fx.lineBetween(b.x, b.y - 8, b.x, b.y + 8);
      } else {
        fx.lineStyle(2, color, 1);
        fx.strokePoints(
          [
            { x: b.x, y: b.y - 8 },
            { x: b.x + 12, y: b.y },
            { x: b.x, y: b.y + 8 },
            { x: b.x - 12, y: b.y },
          ],
          true,
        );
      }
    }
    this.visibleArrowCount = 0;
    g.setDepth(-10);
    const ring = (p: { x: number; y: number }, r: number, color: number) => {
      g.lineStyle(2, color, 0.8);
      g.strokePoints(groundRing(p, r), true);
    };
    for (const z of session.state.safeZones)
      ring(
        z.position,
        z.radiusUnits,
        z.nationId === "blue" ? 0x355e83 : 0xb34736,
      );
    const visible = new Set<string>();
    const image = (
      key: string,
      frame: number,
      p: { x: number; y: number },
      size: number,
      depth: number,
      alpha = 1,
      texture = "commander-canter",
      flip = false,
      mode = "static",
      tint = 0xffffff,
    ) => {
      if (!this.textures.exists(texture)) return;
      visible.add(key);
      let sprite = this.sprites.get(key);
      if (!sprite) {
        sprite = this.add.image(0, 0, texture, String(frame)).setName(key);
        this.sprites.set(key, sprite);
      }
      const atlas =
        texture in motionAtlas
          ? motionAtlas[texture as keyof typeof motionAtlas]
          : null;
      const rect = atlas?.frames[frame];
      const displayHeight =
        size *
        (atlas?.displayScale ?? 1) *
        (rect && atlas ? rect.height / (atlas.height / atlas.rows) : 1);
      sprite
        .setTexture(texture, String(frame))
        .setPosition(p.x, p.y)
        .setOrigin(rect?.originX ?? 0.5, rect?.originY ?? 0.94)
        .setFlipX(flip)
        .setData("mode", mode)
        .setTint(tint)
        .setDisplaySize(
          displayHeight * (rect ? rect.width / rect.height : 1),
          displayHeight,
        )
        .setDepth(depth)
        .setAlpha(alpha)
        .setVisible(true);
    };
    const labelAnchors: LabelAnchor[] = [];
    for (const s of session.state.squads) {
      const p = project(s.position),
        friendly = s.ownerPlayerId === HUMAN;
      const color = friendly ? 0x355e83 : 0xb34736;
      const selected = session.selected.includes(s.id) && s.hpMilli > 0;
      if (selected) {
        const fx = this.selectionInk;
        const left = p.x - formationView.halfWidth,
          right = p.x + formationView.halfWidth;
        const top = p.y + formationView.top,
          bottom = p.y + formationView.bottom;
        // Four corners remain visible above sprites without covering their bodies.
        for (const [x, dx] of [
          [left, 1],
          [right, -1],
        ] as const) {
          for (const [y, dy] of [
            [top, 1],
            [bottom, -1],
          ] as const) {
            const points = [
              { x: x + dx * 12, y },
              { x, y },
              { x, y: y + dy * 12 },
            ];
            fx.lineStyle(5, 0x252b29, 0.9);
            fx.strokePoints(points);
            fx.lineStyle(2, 0x81dbcc, 1);
            fx.strokePoints(points);
          }
        }
      }
      if (session.selected.includes(s.id)) ring(s.position, 650, 0x55b6aa);
      if (
        session.pending?.squadIds.includes(s.id) ||
        session.pending?.targetSquadId === s.id
      )
        ring(s.position, 800, 0xb5955d);
      const observation = observeMotion(
        this.previousPositions.get(s.id),
        s.position,
        session.state.tick,
      );
      this.previousPositions.set(s.id, observation);
      const moving = observation.moving;
      const feedback = squadFeedback(
        s,
        session.state.tick,
        this.lastDamage.get(s.id),
      );
      if (feedback.label && s.hpMilli > 0)
        ring(s.position, 780, s.fsmState === "ROUTED" ? 0xb34736 : 0xb5955d);
      const attackSample = this.lastHits.get(s.id);
      const attackFacing =
        feedback.attackAllowed &&
        attackSample &&
        session.state.tick - attackSample.startTick <
          footAnimation.attackFrames * footAnimation.attackTicksPerFrame
          ? attackSample.facing
          : s.facing;
      const pose =
        s.unitType === "cavalry"
          ? mountedPose(
              s.charge ? s.facing : attackFacing,
              session.state.tick,
              moving,
              s.charge !== null,
              "cavalry",
              feedback.attackAllowed ? attackSample?.startTick : undefined,
            )
          : footPose(
              s.unitType,
              attackFacing,
              session.state.tick,
              moving,
              feedback.attackAllowed ? attackSample?.startTick : undefined,
            );
      const texture = pose.texture,
        frame = pose.frame;
      if (s.hpMilli > 0 && this.textures.exists(texture)) {
        const count = Math.min(8, livingSoldiers(s, config));
        for (let i = 0; i < count; i++) {
          const foot = soldierFoot(p, i);
          image(
            `${s.id}:${i}`,
            frame,
            foot,
            s.unitType === "cavalry" ? 52 : 46,
            foot.y,
            feedback.alpha,
            texture,
            false,
            pose.mode,
            feedback.tint,
          );
          this.sprites.get(`${s.id}:${i}`)?.setData("status", feedback.state);
          g.fillStyle(color, 0.8);
          g.fillEllipse(foot.x, foot.y, 12, 4);
        }
      } else {
        g.fillStyle(s.hpMilli === 0 ? 0x767467 : color);
        g.fillRect(p.x - 14, p.y - 10, 28, 20);
      }
      // Dust is presentation-only and exists only during actual cavalry charge movement.
      if (s.unitType === "cavalry" && s.charge && moving) {
        const len = Math.hypot(observation.dx, observation.dy) || 1;
        const back = project({
          x: s.position.x - (observation.dx / len) * 900,
          y: s.position.y - (observation.dy / len) * 900,
        });
        for (let i = 0; i < 4; i++) {
          const phase = ((session.state.tick + i * 2) % 8) / 8;
          g.fillStyle(0xb5955d, (1 - phase) * 0.35);
          g.fillEllipse(
            p.x - (p.x - back.x) * phase,
            p.y - (p.y - back.y) * phase + 4,
            10 + phase * 20,
            4 + phase * 7,
          );
        }
      }
      // A leaning flag marks rout; defeated squads no longer fly a live standard.
      if (s.hpMilli > 0) {
        const topX = p.x - 22 + (s.fsmState === "ROUTED" ? -14 : 0),
          topY = p.y - 54;
        g.lineStyle(2, 0x30221f, feedback.alpha);
        g.lineBetween(p.x - 22, p.y, topX, topY);
        g.fillStyle(color, feedback.alpha);
        g.fillRect(topX, topY, 20, 24);
      }
      const facingLength = Math.hypot(s.facing.x, s.facing.y) || 1;
      const face = project({
        x: s.position.x + (s.facing.x / facingLength) * 500,
        y: s.position.y + (s.facing.y / facingLength) * 500,
      });
      g.lineStyle(2, color);
      g.lineBetween(p.x, p.y, face.x, face.y);
      if (s.charge) {
        const a = project(s.charge.start),
          b = project(s.charge.destination);
        g.lineStyle(3, 0xb5955d);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
      let label = this.labels.get(s.id);
      if (!label) {
        label = this.add.text(0, 0, "", {
          fontSize: "12px",
          fontFamily: "Noto Sans KR, sans-serif",
          color: "#252b29",
          backgroundColor: "#e8ddc4",
        });
        label.setName(`label:${s.id}`).setPadding(5, 3);
        this.labels.set(s.id, label);
      }
      const labelStyleKey =
        s.hpMilli === 0
          ? "dead"
          : s.fsmState === "ROUTED"
            ? "routed"
            : s.fsmState === "BROKEN"
              ? "broken"
              : "normal";
      if (label.getData("styleKey") !== labelStyleKey) {
        label.setData("styleKey", labelStyleKey);
        label.setStyle({
          backgroundColor:
            s.hpMilli === 0
              ? "#595348"
              : s.fsmState === "ROUTED"
                ? "#8e3c30"
                : s.fsmState === "BROKEN"
                  ? "#7f633b"
                  : "#e8ddc4",
          color:
            s.hpMilli === 0 ||
            s.fsmState === "ROUTED" ||
            s.fsmState === "BROKEN"
              ? "#fff0d2"
              : "#252b29",
        });
      }
      label
        .setDepth(100000)
        .setVisible(false)
        .setText(
          `${selected ? "◆ 선택 · " : ""}${friendly ? "아군" : "적군"} ${s.id.split("-").at(-1)} · ${unitNames[s.unitType]} ${livingSoldiers(s, config)}명${feedback.label ? " · " + feedback.label : ""}`,
        );
      labelAnchors.push({
        id: s.id,
        x: p.x,
        y: p.y,
        width: label.width,
        height: label.height,
        selected: session.selected.includes(s.id),
      });
    }
    const placements = layoutLabels(labelAnchors, {
      x: cam.scrollX,
      y: cam.scrollY,
      width: cam.width,
      height: cam.height,
    });
    for (const rect of placements) {
      const label = this.labels.get(rect.id)!;
      label.setPosition(rect.x, rect.y).setVisible(true);
      const anchor = labelAnchors.find((a) => a.id === rect.id)!;
      // Leader lines identify the owning squad when nearby nameplates are displaced.
      g.lineStyle(1, anchor.selected ? 0x355e83 : 0x655640, 0.65);
      g.lineBetween(
        rect.x + rect.width / 2,
        rect.y + rect.height,
        anchor.x,
        anchor.y - 54,
      );
    }
    for (const c of session.state.commanders) {
      const p = project(c.position);
      const observation = observeMotion(
        this.previousPositions.get(c.id),
        c.position,
        session.state.tick,
      );
      this.previousPositions.set(c.id, observation);
      const squad = session.state.squads.find(
        (s) => s.id === c.assignedSquadId,
      );
      const moving =
        observation.moving &&
        (c.status === "ACTIVE" || c.status === "REASSIGNING");
      const facing = moving
        ? { x: observation.dx, y: observation.dy }
        : (squad?.facing ?? { x: 1, y: 0 });
      const pose = mountedPose(
        facing,
        session.state.tick,
        moving,
        c.status === "ACTIVE" && !!squad?.charge,
        "commander",
      );
      if (c.status !== "WOUNDED") {
        const available = this.textures.exists(pose.texture);
        image(
          c.id,
          available ? pose.frame : 0,
          p,
          64,
          p.y + 1,
          c.ownerPlayerId === HUMAN ? 1 : 0.65,
          pose.texture,
          false,
          available ? pose.mode : "static",
        );
        if (!available) ring(c.position, 220, 0xe8ddc4);
        // Bronze diamond identifies the commander even inside a melee cluster.
        const badgeY = p.y + formationView.commanderBadgeY;
        const fx = this.selectionInk;
        fx.fillStyle(c.ownerPlayerId === HUMAN ? 0x355e83 : 0xb34736, 1);
        fx.lineStyle(2, 0xe8cc8a, 1);
        const diamond = [
          { x: p.x, y: badgeY - 7 },
          { x: p.x + 7, y: badgeY },
          { x: p.x, y: badgeY + 7 },
          { x: p.x - 7, y: badgeY },
        ];
        fx.fillPoints(diamond, true);
        fx.strokePoints(diamond, true);
        fx.lineBetween(p.x, badgeY + 7, p.x, p.y - 56);
        this.sprites.get(c.id)?.setData("commanderBadge", true);
      } else ring(c.position, 200, 0xb5955d);
    }
    for (const flight of this.arrowFlights) {
      const arrow = arrowPose(flight, session.state.tick);
      if (!arrow) continue;
      const len = Math.hypot(arrow.dx, arrow.dy) || 1,
        ux = arrow.dx / len,
        uy = arrow.dy / len;
      const fx = this.arrowInk;
      fx.lineStyle(2, 0x513c27, 0.95);
      fx.lineBetween(arrow.x - ux * 11, arrow.y - uy * 11, arrow.x, arrow.y);
      fx.fillStyle(0xe9ddbd);
      fx.fillTriangle(
        arrow.x,
        arrow.y,
        arrow.x - ux * 5 + uy * 2,
        arrow.y - uy * 5 - ux * 2,
        arrow.x - ux * 5 - uy * 2,
        arrow.y - uy * 5 + ux * 2,
      );
      this.visibleArrowCount++;
    }
    for (const [key, sprite] of this.sprites)
      if (!visible.has(key)) sprite.setVisible(false);
    for (const e of session.events
      .slice(-100)
      .filter(
        (e) => e.type === "CHARGE_IMPACT" && session.state.tick - e.tick < 10,
      )) {
      const target = session.state.squads.find((s) => s.id === e.targetId);
      if (target)
        ring(
          target.position,
          700 + (session.state.tick - e.tick) * 40,
          0xb5955d,
        );
    }
  }
}
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "arena",
  width: 960,
  height: 560,
  backgroundColor: "#d7cfb3",
  scene: BattleScene,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});
// Read-only debug snapshot for browser/headless verification; no state-mutating test API.
Object.defineProperty(window, "battleDemo", {
  value: {
    snapshot: () => structuredClone(session.state),
    view: () => {
      const scene = game.scene.getScenes(true)[0];
      if (!scene) return null;
      const camera = scene.cameras.main;
      return {
        scrollX: camera.scrollX,
        scrollY: camera.scrollY,
        loadedArt: scene.textures.exists("commander-canter"),
        retiredTexturesPresent:
          scene.textures.exists("unit-strip") ||
          scene.textures.exists("foot-units"),
        loadedGround: scene.textures.exists("battle-ground"),
        loadedFootMotion: [
          "infantry-walk",
          "infantry-attack",
          "archer-walk",
          "archer-attack",
        ].every((key) => scene.textures.exists(key)),
        visibleArrows: (scene as BattleScene).visibleArrowCount,
        orderCues: structuredClone((scene as BattleScene).visibleOrderCues),
        loadedMounted: [
          "cavalry-canter",
          "cavalry-attack",
          "commander-canter",
        ].every((key) => scene.textures.exists(key)),
        loadedMotion: ["spear-walk", "spear-attack"].every((key) =>
          scene.textures.exists(key),
        ),
        labels: scene.children.list
          .filter(
            (o): o is Phaser.GameObjects.Text =>
              o instanceof Phaser.GameObjects.Text &&
              o.visible &&
              o.name.startsWith("label:"),
          )
          .map((o) => ({
            id: o.name,
            x: o.x - camera.scrollX,
            y: o.y - camera.scrollY,
            width: o.width,
            height: o.height,
            text: o.text,
          })),
        unitVisuals: scene.children.list
          .filter(
            (o): o is Phaser.GameObjects.Image =>
              o instanceof Phaser.GameObjects.Image && o.visible,
          )
          .map((o) => ({
            name: o.name,
            texture: o.texture.key,
            frame: o.frame.name,
            flip: o.flipX,
            mode: o.getData("mode"),
            tint: o.tintTopLeft,
            alpha: o.alpha,
            status: o.getData("status"),
            x: o.x,
            y: o.y,
            depth: o.depth,
            commanderBadge: o.getData("commanderBadge") === true,
          })),
        visibleImages: scene.children.list.filter(
          (o) => o instanceof Phaser.GameObjects.Image && o.visible,
        ).length,
      };
    },
    log: () => structuredClone(session.exportLog()),
  },
});
