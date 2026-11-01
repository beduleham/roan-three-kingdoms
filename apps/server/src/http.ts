import express, { type Application } from "express";
import { resolve } from "node:path";
import { statSync } from "node:fs";
import { registerAccountRoutes } from "./auth.js";

/** Serve only the built client directory, on the same origin as matchmaking and WS. */
export function registerHttp(
  app: Application,
  clientDirectory = process.env.CLIENT_DIST_PATH,
) {
  registerAccountRoutes(app);
  app.get("/healthz", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ status: "ok" });
  });
  if (!clientDirectory) return;
  const root = resolve(clientDirectory);
  for (const page of ["index.html", "online.html", "play.html"])
    if (!statSync(resolve(root, page)).isFile())
      throw new Error("CLIENT_BUILD_REQUIRED");
  app.get("/", (_req, res) => res.redirect("/play.html"));
  app.use((req, res, next) => {
    if (
      req.path
        .split("/")
        .some((part) => part.startsWith(".") || part === "data") ||
      /\.(?:sqlite|db)(?:-(?:wal|shm))?$/i.test(req.path)
    ) {
      res.sendStatus(404);
      return;
    }
    next();
  });
  app.use(express.static(root, { dotfiles: "deny", index: false }));
}
