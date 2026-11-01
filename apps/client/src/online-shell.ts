/** Rearranges existing controls without replacing handlers or changing command semantics. */
export function mountOnlineShell(root: HTMLElement) {
  const node = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const header = root.querySelector("header")!;
  header.insertAdjacentHTML(
    "afterbegin",
    '<span class="war-seal" aria-hidden="true">군<br>령</span>',
  );
  const nav = header.nextElementSibling!;
  nav.classList.add("war-nav");
  const entry = document.createElement("section");
  entry.className = "war-entry";
  entry.setAttribute("aria-label", "접속과 로비");
  header.after(entry);
  entry.append(nav);
  for (const id of [
    "join",
    "create-private",
    "leave",
    "connection",
    "account-panel",
    "invite",
    "lobby-panel",
  ])
    entry.append(node(id));
  const layout = document.createElement("div");
  layout.className = "war-layout";
  const stage = document.createElement("main");
  stage.className = "battle-stage";
  const side = document.createElement("aside");
  side.className = "war-sidebar";
  side.setAttribute("aria-label", "전황과 보급");
  layout.append(stage, side);
  entry.after(layout);
  const field = node("field"),
    commands = field.nextElementSibling!,
    instruction = node("vision-info").nextElementSibling!;
  instruction.classList.add("field-instruction");
  commands.classList.add("war-commands");
  commands.id = "war-commands";
  const identity = document.createElement("div");
  identity.className = "war-identity";
  identity.append(node("identity"), node("vision-info"));
  stage.append(identity, node("objective-panel"), instruction, field, commands);
  // Keep public point detail close to the score without dominating the battle viewport.
  const points = document.createElement("details");
  points.className = "point-details";
  points.innerHTML = "<summary>거점별 점령 현황</summary>";
  node("objective-panel").append(points);
  points.append(node("objective-points"));
  const readout = document.createElement("div");
  readout.className = "unit-readout";
  readout.append(node("selected"), node("commander"));
  commands.prepend(readout);
  side.append(node("map-panel"), node("national-panel"));
  const diagnostics = document.createElement("details");
  diagnostics.className = "war-diagnostics";
  diagnostics.innerHTML = "<summary>전투 기록 · 관측 상태</summary>";
  diagnostics.append(node("clock"));
  // Move the diagnostic tail, preserving IDs and live status regions.
  const start = node("result");
  let current: Element | null = start;
  while (current) {
    const next: Element | null = current.nextElementSibling;
    diagnostics.append(current);
    current = next;
  }
  root.append(diagnostics);
  root.dataset.presentation = "phase8-hud-v1";
}
