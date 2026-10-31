type PublicIdentity = { provider: "guest" | "google"; name?: string };
type GoogleId = {
  initialize(options: {
    client_id: string;
    nonce: string;
    auto_select: boolean;
    callback: (response: { credential: string }) => void;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: { theme: string; size: string; text: string },
  ): void;
  disableAutoSelect(): void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

/** Tokens are scoped to the selected server. Google credentials never enter storage or URLs. */
export function createAccountPanel(
  server: string,
  onIdentityChange: () => void,
) {
  const base = new URL(server);
  base.protocol = base.protocol === "wss:" ? "https:" : "http:";
  const key = `roan-account-${base.origin}`;
  const status = document.querySelector<HTMLElement>("#account-status")!;
  const button = document.querySelector<HTMLElement>("#google-login")!;
  const logout = document.querySelector<HTMLButtonElement>("#account-logout")!;
  let token = sessionStorage.getItem(key);
  let locked = false;
  let busy = false;
  let googleReady = false;
  let googleClientId: string | null = null;
  let challengeTimer: ReturnType<typeof setTimeout> | undefined;
  let identity: PublicIdentity = { provider: "guest" };
  const describe = (value: PublicIdentity) =>
    value.provider === "google"
      ? `Google 로그인 · ${value.name ?? "플레이어"}`
      : "게스트 이용 중";
  function refresh() {
    button.hidden = locked || busy || !!token || !googleReady;
    logout.hidden = !token;
    logout.disabled = locked || busy;
  }
  async function request(path: string, init?: RequestInit) {
    const response = await fetch(new URL(`/auth/${path}`, base), {
      ...init,
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("ACCOUNT_REQUEST_FAILED");
    return response;
  }
  function clear() {
    token = null;
    sessionStorage.removeItem(key);
    identity = { provider: "guest" };
    onIdentityChange();
  }
  async function prepareGoogle(clientId: string) {
    clearTimeout(challengeTimer);
    googleClientId = clientId;
    const { nonce } = await (
      await request("challenge", { method: "POST" })
    ).json();
    window.google!.accounts.id.initialize({
      client_id: clientId,
      nonce,
      auto_select: false,
      callback: ({ credential }) => {
        if (locked || busy) return;
        busy = true;
        refresh();
        status.textContent = "Google 로그인 확인 중";
        void request("google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential, nonce }),
        })
          .then((response) => response.json())
          .then((result) => {
            token = result.sessionToken;
            sessionStorage.setItem(key, token!);
            identity = result.identity;
            onIdentityChange();
            status.textContent = describe(identity);
          })
          .catch(() => {
            status.textContent =
              "Google 로그인 실패 · 다시 시도하거나 게스트로 접속하세요";
          })
          .finally(() => {
            busy = false;
            // Each exchange consumes its nonce, even on verification failure.
            if (!token)
              void prepareGoogle(clientId).catch(() => {
                googleReady = false;
                refresh();
              });
            refresh();
          });
      },
    });
    button.replaceChildren();
    window.google!.accounts.id.renderButton(button, {
      theme: "outline",
      size: "large",
      text: "signin_with",
    });
    googleReady = true;
    refresh();
    // Refresh unused challenges so an idle page does not display an expired login.
    challengeTimer = setTimeout(() => {
      if (!locked && !busy && !token)
        void prepareGoogle(clientId).catch(() => {
          googleReady = false;
          refresh();
        });
    }, 4 * 60_000);
  }
  const ready = (async () => {
    status.textContent = "로그인 상태 확인 중";
    if (token) {
      try {
        identity = await (
          await request("session", {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).json();
      } catch {
        clear();
      }
    }
    status.textContent = describe(identity);
    refresh();
  })();
  // Loading Google must never block guest entry, including on script/network failure.
  void ready
    .then(async () => {
      const config = await (await request("config")).json();
      if (!config.googleClientId) return;
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("GOOGLE_SCRIPT_FAILED"));
        document.head.append(script);
      });
      await prepareGoogle(config.googleClientId);
    })
    .catch(() => {
      if (!token)
        status.textContent =
          "게스트 이용 중 · Google 로그인에 연결할 수 없습니다";
    });
  logout.addEventListener("click", () => {
    if (locked || busy || !token) return;
    busy = true;
    refresh();
    void request("session", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(() => {
        clear();
        window.google?.accounts.id.disableAutoSelect();
        status.textContent = describe(identity);
        if (googleClientId)
          void prepareGoogle(googleClientId).catch(() => {
            googleReady = false;
            refresh();
          });
      })
      .catch(() => {
        status.textContent = "로그아웃 실패 · 다시 시도하세요";
      })
      .finally(() => {
        busy = false;
        refresh();
      });
  });
  return {
    async joinOptions() {
      await ready;
      if (busy) throw new Error("로그인 확인이 끝난 뒤 접속하세요");
      return token ? { accountSession: token } : {};
    },
    setLocked(value: boolean) {
      locked = value;
      refresh();
      if (!value && !token && googleClientId && !busy)
        void prepareGoogle(googleClientId).catch(() => {
          googleReady = false;
          refresh();
        });
    },
    confirmed(value: PublicIdentity) {
      status.textContent = `${describe(value)} · 경기 접속 확인`;
    },
    disconnected() {
      status.textContent = describe(identity);
    },
  };
}
