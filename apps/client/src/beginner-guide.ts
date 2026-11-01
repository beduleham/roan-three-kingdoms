export type GuideSignal =
  "connected" | "started" | "moved" | "skill" | "formation" | "finished";
export class GuideProgress {
  readonly done = new Set<GuideSignal>();
  private scope = "";
  constructor(readonly steps: readonly GuideSignal[]) {}
  observe(scope: string, signals: GuideSignal[]) {
    if (scope !== this.scope) {
      this.scope = scope;
      this.done.clear();
    }
    for (const s of signals) if (this.steps.includes(s)) this.done.add(s);
  }
  reset() {
    this.done.clear();
    this.scope = "";
  }
  get complete() {
    return this.steps.every((s) => this.done.has(s));
  }
}
const text: Record<GuideSignal, [string, string]> = {
  connected: [
    "경기 입장",
    "새 초대 경기를 만들고 링크를 공유하거나, 받은 초대 링크에서 입장하세요. 국가전은 국가별 1명 이상, 총 3명 이상이 필요합니다.",
  ],
  started: [
    "전투 시작",
    "온라인 로비는 로비장이 시작하며, 1대1 전투는 두 명이 접속하면 자동 시작합니다. 혼자 연습에서는 ‘시작’ 또는 ‘아군 전체 전진’을 누르세요.",
  ],
  moved: [
    "부대에 이동 명령",
    "아군을 선택하고 목적지를 지정하세요. 온라인은 빈 땅 클릭 후 이동, 혼자 연습은 전장 우클릭으로 이동합니다.",
  ],
  skill: [
    "W 함성 사용",
    "장수가 있는 본대를 선택해 W를 사용하세요. 혼자 연습은 W를 누른 뒤 전장의 아군을 클릭해 대상을 지정하고 ‘군령 실행’을 누릅니다. 실제 성공한 스킬 사건을 확인하면 표시됩니다.",
  ],
  formation: [
    "진형 바꾸기",
    "전술 패널에서 방어진 또는 공격진을 골라 적용하세요. 진형 전환이 실제 완료되어야 표시됩니다.",
  ],
  finished: [
    "결과와 다음 경기",
    "경기 종료 후 승패와 공적 순위를 확인하고 기록 저장 또는 새 초대 경기를 선택하세요. 진행 중 나가기는 다른 참가자의 경기를 중단시킵니다.",
  ],
};
export function mountBeginnerGuide(
  parent: HTMLElement,
  local = false,
  hasResults = true,
) {
  const model = new GuideProgress(
    local
      ? ["started", "moved", "skill", "formation"]
      : hasResults
        ? ["connected", "started", "moved", "skill", "formation", "finished"]
        : ["connected", "started", "moved", "skill", "formation"],
  );
  const panel = document.createElement("details");
  panel.className = "beginner-guide";
  panel.id = "beginner-guide";
  panel.open = new URLSearchParams(location.search).get("guide") === "1";
  panel.innerHTML =
    '<summary>처음 하는 분 · 단계별 조작 안내</summary><p>실제 관측된 진행만 표시합니다. 안내를 접어도 게임을 계속할 수 있습니다.</p><ol></ol><p class="guide-status" role="status"></p><a href="/play.html" target="_blank" rel="noopener">시작 화면의 모드 안내 (새 탭)</a>';
  const list = panel.querySelector("ol")!,
    status = panel.querySelector(".guide-status")!;
  let signature = "";
  const render = () => {
    const next = JSON.stringify([...model.done]);
    if (signature === next) return;
    signature = next;
    list.replaceChildren(
      ...model.steps.map((key) => {
        const li = document.createElement("li");
        li.dataset.step = key;
        li.dataset.done = String(model.done.has(key));
        const title = document.createElement("strong");
        title.textContent = `${model.done.has(key) ? "✓" : "○"} ${text[key][0]}`;
        const p = document.createElement("p");
        p.textContent = text[key][1];
        p.hidden = key !== model.steps.find((s) => !model.done.has(s));
        li.append(title, p);
        return li;
      }),
    );
    status.textContent = model.complete
      ? local
        ? "기본 조작 연습 목표를 확인했습니다. 온라인 국가전에서는 성장·보급·거점 승리가 추가됩니다."
        : hasResults
          ? "이번 경기의 입장·조작·종료 흐름을 확인했습니다."
          : "전투 시연의 기본 조작을 확인했습니다. 나가기로 연결을 종료할 수 있습니다."
      : `진행 ${model.done.size}/${model.steps.length} · 아직 표시되지 않은 항목을 따라 해보세요.`;
  };
  parent.append(panel);
  render();
  return {
    observe: (scope: string, signals: GuideSignal[]) => {
      model.observe(scope, signals);
      render();
    },
    reset: () => {
      model.reset();
      signature = "";
      render();
    },
  };
}
