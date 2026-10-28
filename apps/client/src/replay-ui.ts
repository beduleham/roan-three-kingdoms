import { replayPolicy } from "./replay-policy.js";
import type { ReplayVerification } from "./replay-validation.js";
export function mountReplayVerifier(toolbar: Element, before: Element) {
  const opener = document.createElement("button");
  opener.id = "verify-log";
  opener.textContent = "저장 로그 검증";
  toolbar.append(opener);
  const panel = document.createElement("details");
  panel.id = "replay-check";
  panel.className = "replay-check";
  panel.innerHTML =
    '<summary>저장 전투 로그 · 재현 검증</summary><p>다운로드한 전투 로그 JSON을 선택하세요. 현재 엔진으로 입력을 재현합니다. (2대2 데모 · 최대 10MiB)</p><label>전투 로그 JSON <input id="replay-file" type="file" accept=".json,application/json"></label><button id="replay-cancel" disabled>검증 취소</button><p id="replay-file-name"></p><p id="replay-status" role="status" data-verdict="idle">파일을 선택하면 검증을 시작합니다.</p><div id="replay-report"></div>';
  before.before(panel);
  const input = panel.querySelector<HTMLInputElement>("#replay-file")!,
    cancel = panel.querySelector<HTMLButtonElement>("#replay-cancel")!;
  const status = panel.querySelector<HTMLElement>("#replay-status")!,
    report = panel.querySelector<HTMLElement>("#replay-report")!;
  let generation = 0,
    worker: Worker | null = null,
    timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    worker?.terminate();
    worker = null;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const finish = (id: number, result: ReplayVerification) => {
    if (id !== generation) return;
    stop();
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
    report.innerHTML = `<p>시드 ${result.seed} · 기록 ${result.frames}tick</p><div class="replay-table-wrap"><table><caption>현재 엔진 재현 대조</caption><thead><tr><th>항목</th><th>결과</th><th>저장된 값</th><th>재현한 값</th></tr></thead><tbody><tr><th>최종 상태</th><td>${result.stateMatches ? "일치" : "불일치"}</td><td><code>${result.expectedStateHash}</code></td><td><code>${result.actualStateHash}</code></td></tr><tr><th>사건 기록</th><td>${result.eventMatches ? "일치" : "불일치"}</td><td><code>${result.expectedEventHash}</code></td><td><code>${result.actualEventHash}</code></td></tr></tbody></table></div>`;
  };
  opener.addEventListener("click", () => {
    panel.open = true;
    panel.scrollIntoView({ block: "start" });
    input.focus({ preventScroll: true });
  });
  cancel.addEventListener("click", () => {
    generation++;
    stop();
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
      worker.onmessage = (event: MessageEvent<ReplayVerification>) =>
        finish(id, event.data);
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
