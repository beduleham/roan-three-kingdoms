export interface LobbySlot {
  id: string;
  occupant: string;
  connected: boolean;
  host: boolean;
}
export const nationNames: Record<string, string> = {
  blue: "청국",
  red: "적국",
  green: "녹국",
};
export function seatName(id: string) {
  const [nation, slot] = id.split("-");
  return `${nationNames[nation!] ?? nation}${slot ? ` ${slot}번` : ""}`;
}
export function lobbyReadiness(
  mode: string,
  slots: LobbySlot[],
  started: boolean,
) {
  const occupied = slots.filter((s) => s.occupant === "human");
  const nations =
    mode === "national" ? ["blue", "red", "green"] : ["blue", "red"];
  const counts = nations.map((n) => ({
    nation: n,
    count: occupied.filter((s) => s.id.split("-")[0] === n).length,
  }));
  const missing = counts
    .filter((n) => n.count === 0)
    .map((n) => nationNames[n.nation]);
  const disconnected = occupied.some((s) => !s.connected);
  const canStart =
    mode !== "1v1" &&
    !started &&
    occupied.length > 0 &&
    !disconnected &&
    missing.length === 0;
  const reason = started
    ? disconnected
      ? "재접속을 기다리는 동안 경기가 멈춥니다."
      : "경기 진행 중 · 국가와 좌석은 바꿀 수 없습니다."
    : disconnected
      ? "재접속 대기 중인 참가자가 있습니다."
      : missing.length
        ? `${missing.join("·")} 참가자를 기다립니다. 초대 링크를 공유하세요.`
        : "참가 조건을 갖췄습니다. 로비장이 시작할 수 있습니다.";
  return { canStart, counts, reason };
}
export function connectionErrorMessage(error: unknown) {
  const s = String(error);
  if (s.includes("ACCOUNT_SESSION_EXPIRED"))
    return "로그인 세션이 만료되었습니다. 로그아웃 후 게스트로 입장하거나 다시 로그인하세요.";
  if (s.includes("ACCOUNT_ALREADY_IN_ROOM"))
    return "같은 계정이 이미 이 경기에 참가 중입니다. 기존 창으로 돌아가세요.";
  if (s.includes("INVITE_REQUIRED"))
    return "초대 링크가 필요하거나 이전 링크의 입장 권한이 만료되었습니다. 로비장에게 최신 링크를 요청하세요.";
  if (s.includes("ROOM_FULL") || s.includes("maxClients"))
    return "빈 좌석이 없습니다. 다른 경기로 입장하거나 새 초대 경기를 만드세요.";
  if (s.includes("초대 링크의 경기 종류가 다릅니다"))
    return "초대 링크의 경기 종류가 다릅니다. 받은 링크 전체를 다시 열어 주세요.";
  return "서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 입장하거나 새 초대 경기를 만들어 주세요.";
}
