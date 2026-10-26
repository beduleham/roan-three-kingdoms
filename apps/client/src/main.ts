import { project, unproject, groundRing } from "./projection.js";
import { unitArt } from "./unit-art.js";
import Phaser from "phaser";
import rawConfig from "../../../battle_config.v1.json";
import {
  parseBattleConfig,
  livingSoldiers,
} from "../../../packages/battle-core/src/index.js";
import type { Squad, Skill } from "../../../packages/battle-core/src/index.js";
import { LocalSession, HUMAN, DEMO, defaults } from "./session.js";
import type { Options, Unit } from "./session.js";
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
<main><section class="battle"><div class="toolbar"><strong id="clock"></strong><button id="pause">시작</button><button id="download">전체 로그 JSON</button></div><div id="arena"></div><p class="legend">군기: 아군 파랑 / 적군 빨강 · 백마: 장수 · 기병·창병 정적 샘플 / 그 외 병종은 도형 · 방향별 동작 미적용</p><div id="cards"></div></section>
<aside><h2>전술 명령</h2><p>클릭 / 1·2: 선택 · Shift: 복수 선택<br>우클릭: 이동 / 적 공격 · 방향키: 화면 이동</p><div class="buttons"><button id="move">이동</button><button id="attackMove">공격 이동 (A)</button><button id="retreat">후퇴 (T)</button></div><label>태세 <select id="stance">${options({ defensive: "방어", balanced: "균형", aggressive: "공격" })}</select></label><button id="applyStance">태세 적용</button><label>진형 <select id="formation">${options({ normal: "기본진", defense: "방어진", offense: "공격진" })}</select></label><button id="applyFormation">진형 적용</button>
<h2>무장 스킬</h2><div class="buttons"><button id="Q">Q 돌격</button><button id="W">W 함성</button><button id="R">R 파죽지세</button></div><p id="aim"></p><div class="buttons"><button id="confirm">시전 확인 (Enter)</button><button id="cancel">취소 (Esc)</button></div><button id="reassign">선택 부대로 장수 재배속</button><pre id="commander"></pre><p role="status" id="notice"></p><section id="augments"></section></aside></main>
<section class="log"><h2>전투 사건 <small>최근 주요 사건 · 전체 사건은 JSON에 기록</small></h2><pre id="events"></pre></section><footer>브라우저 내 battle-core 실행 · 실제 서버 권위 / 멀티플레이 아님 · 자동 AI는 기본 교전·추격·복귀만 수행합니다. 성장·거점 승리 규칙 없음. Phase 3·4 전체 미완료.</footer>`;
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
  else if (["q", "w", "r"].includes(key))
    session.beginSkill(key.toUpperCase() as Skill);
  else if (key === "enter") session.confirmSkill();
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
  el("clock").textContent =
    `${((session.state.tick * config.tickMs) / 1000).toFixed(1)}초 · ${session.state.tick}tick${session.state.tick >= 900 ? " · 90초 이상 실행" : ""}`;
  el("pause").textContent = session.paused ? "시작 / 계속" : "일시정지";
  const code = session.notice.replace("코어 거부: ", "");
  el("notice").textContent = rejection[code]
    ? `코어 거부: ${rejection[code]} (${code})`
    : session.notice;
  el("aim").textContent = session.pending
    ? `${session.pending.skill} 지정 중 · 실행/대상 부대: ${session.pending.squadIds.join(", ") || "없음"} · 적: ${session.pending.targetSquadId ?? "없음"}`
    : `선택: ${session.selected.join(", ") || "없음"} · ${session.mode}`;
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
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private arrows!: Phaser.Types.Input.Keyboard.CursorKeys;
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  preload() {
    this.load.image("unit-strip", unitArt);
  }
  create() {
    if (this.textures.exists("unit-strip")) {
      const texture = this.textures.get("unit-strip");
      for (let i = 0; i < 3; i++)
        texture.add(String(i), 0, i * 724, 0, 724, 724);
    }
    this.ink = this.add.graphics();
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
          (world.x - foot.x) / 65,
          (world.y - (foot.y - 25)) / 65,
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
      this.seenReset = viewReset;
    }
    const speed = delta * 0.5;
    if (this.arrows.left.isDown) cam.scrollX -= speed;
    if (this.arrows.right.isDown) cam.scrollX += speed;
    if (this.arrows.up.isDown) cam.scrollY -= speed;
    if (this.arrows.down.isDown) cam.scrollY += speed;
    const g = this.ink;
    g.clear();
    g.setDepth(-10);
    g.lineStyle(1, 0x89734a, 0.16);
    for (let n = 0; n <= 24000; n += 1000) {
      const a = project({ x: n, y: 0 }),
        b = project({ x: n, y: 14000 });
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    for (let n = 0; n <= 14000; n += 1000) {
      const a = project({ x: 0, y: n }),
        b = project({ x: 24000, y: n });
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
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
    ) => {
      if (!this.textures.exists("unit-strip")) return;
      visible.add(key);
      let sprite = this.sprites.get(key);
      if (!sprite) {
        sprite = this.add.image(0, 0, "unit-strip", String(frame));
        this.sprites.set(key, sprite);
      }
      sprite
        .setFrame(String(frame))
        .setPosition(p.x, p.y)
        .setOrigin(0.5, 0.94)
        .setDisplaySize(size, size)
        .setDepth(depth)
        .setAlpha(alpha)
        .setVisible(true);
    };
    for (const s of session.state.squads) {
      const p = project(s.position),
        friendly = s.ownerPlayerId === HUMAN;
      const color = friendly ? 0x355e83 : 0xb34736;
      if (session.selected.includes(s.id)) ring(s.position, 650, 0x55b6aa);
      if (
        session.pending?.squadIds.includes(s.id) ||
        session.pending?.targetSquadId === s.id
      )
        ring(s.position, 800, 0xb5955d);
      const art =
        s.unitType === "cavalry" ? 1 : s.unitType === "spears" ? 2 : null;
      if (s.hpMilli > 0 && art !== null && this.textures.exists("unit-strip")) {
        const count = Math.min(8, livingSoldiers(s, config));
        for (let i = 0; i < count; i++) {
          const foot = project({
            x: s.position.x + ((i % 4) - 1.5) * 340,
            y: s.position.y + (Math.floor(i / 4) - 0.5) * 480,
          });
          image(`${s.id}:${i}`, art, foot, art === 1 ? 52 : 42, foot.y);
          // Colored bases preserve allegiance even when sample clothing differs.
          g.fillStyle(color, 0.8);
          g.fillEllipse(foot.x, foot.y, 12, 4);
        }
      } else {
        g.fillStyle(s.hpMilli === 0 ? 0x767467 : color);
        g.fillRect(p.x - 14, p.y - 10, 28, 20);
      }
      // Grounded military standard, no provisional surnames.
      g.lineStyle(2, 0x30221f);
      g.lineBetween(p.x - 22, p.y, p.x - 22, p.y - 54);
      g.fillStyle(color);
      g.fillRect(p.x - 22, p.y - 54, 20, 24);
      const face = project({
        x: s.position.x + s.facing.x * 500,
        y: s.position.y + s.facing.y * 500,
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
          color: "#252b29",
          backgroundColor: "#e8ddc4",
        });
        this.labels.set(s.id, label);
      }
      label
        .setDepth(100000)
        .setPosition(p.x - 48, p.y - 90)
        .setText(
          `${friendly ? "아군" : "적군"} ${s.id.split("-").at(-1)} · ${unitNames[s.unitType]} ${livingSoldiers(s, config)}명`,
        );
    }
    for (const c of session.state.commanders) {
      const p = project(c.position);
      if (c.status !== "WOUNDED")
        image(c.id, 0, p, 64, p.y + 1, c.ownerPlayerId === HUMAN ? 1 : 0.65);
      else ring(c.position, 200, 0xb5955d);
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
new Phaser.Game({
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
    log: () => structuredClone(session.exportLog()),
  },
});
