import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { readdir, readFile, writeFile, mkdir, rename, rm, stat, cp } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";

// ==========================================
// CONFIGURATION
// ==========================================
const APPS_ROOT   = process.env.APPS_ROOT || "/home/maga/dev/apps";
const SITES_DIR   = join(APPS_ROOT, "sites", "web");
const STORAGE_DIR = join(APPS_ROOT, "storage");
const ADMIN_DIR   = join(APPS_ROOT, "admin");
const USERS_FILE  = join(ADMIN_DIR, "data", "users.json");

function hashPassword(password: string): string {
  return createHash("sha256").update(`${password}:sirius-admin-2025`).digest("hex");
}

// ==========================================
// HELPERS
// ==========================================
async function getFolderSize(dir: string): Promise<number> {
  let size = 0;
  try {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      if (["node_modules", ".nuxt", ".output", ".git"].includes(item.name)) continue;
      const fp = join(dir, item.name);
      if (item.isDirectory()) size += await getFolderSize(fp);
      else { const s = await stat(fp); size += s.size; }
    }
  } catch {}
  return size;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function readUsers(): Promise<any[]> {
  try {
    const raw = await readFile(USERS_FILE, "utf-8");
    return JSON.parse(raw).users ?? [];
  } catch { return []; }
}

async function ensureUsersFile() {
  if (!existsSync(USERS_FILE)) {
    await mkdir(dirname(USERS_FILE), { recursive: true });
    await writeFile(USERS_FILE, JSON.stringify({
      users: [{
        id: "1",
        username: "admin",
        passwordHash: hashPassword("admin123"),
        role: "admin",
        createdAt: new Date().toISOString()
      }]
    }, null, 2));
    console.log("✅ Utilizador admin criado — credenciais padrão: admin / admin123");
  }
}

async function getSiteInfo(folderId: string) {
  const dir = join(SITES_DIR, folderId);
  let displayName = folderId;
  let port: number | null = null;

  try {
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf-8"));
    if (pkg.name) displayName = pkg.name;
    const m = (pkg.scripts?.dev || "").match(/--port\s+(\d+)/);
    if (m) port = parseInt(m[1]);
  } catch {}

  if (!port) {
    try {
      const env = await readFile(join(dir, ".env"), "utf-8");
      const m = env.match(/^(?:NITRO_PORT|PORT)=(\d+)/m);
      if (m) port = parseInt(m[1]);
    } catch {}
  }

  const paused = existsSync(join(dir, ".paused"));
  const size   = await getFolderSize(dir);

  return { id: folderId, name: displayName, port, status: paused ? "paused" : "running", size: formatSize(size) };
}

async function getNextPort(): Promise<number> {
  try {
    const items = await readdir(SITES_DIR, { withFileTypes: true });
    const ports: number[] = [];
    for (const item of items.filter(i => i.isDirectory())) {
      try {
        const pkg = JSON.parse(await readFile(join(SITES_DIR, item.name, "package.json"), "utf-8"));
        const m = (pkg.scripts?.dev || "").match(/--port\s+(\d+)/);
        if (m) ports.push(parseInt(m[1]));
      } catch {}
    }
    return ports.length > 0 ? Math.max(...ports) + 1 : 10001;
  } catch { return 10001; }
}

// ==========================================
// ELYSIA APP
// ==========================================
const app = new Elysia()
  .use(cors())

  // ─── AUTH: Login ─────────────────────────────────────────
  .post("/auth/login", async ({ body, set, cookie: { sirius_token } }) => {
    await ensureUsersFile();
    const { username, password } = body;
    const users = await readUsers();
    const user  = users.find(u => u.username === username);

    if (!user || user.passwordHash !== hashPassword(password)) {
      set.status = 401;
      return { success: false, error: "Credenciais inválidas." };
    }

    sirius_token.value   = `sirius_admin_${crypto.randomUUID()}`;
    sirius_token.httpOnly = true;
    sirius_token.maxAge  = 60 * 60 * 24 * 7;
    sirius_token.path    = "/";
    return { success: true, user: { username: user.username, role: user.role } };
  }, { body: t.Object({ username: t.String(), password: t.String() }) })

  // ─── AUTH: Logout ────────────────────────────────────────
  .post("/auth/logout", ({ cookie: { sirius_token } }) => {
    sirius_token.value  = "";
    sirius_token.maxAge = 0;
    return { success: true };
  })

  // ─── AUTH: Users list ────────────────────────────────────
  .get("/auth/users", async ({ set, cookie: { sirius_token } }) => {
    if (!sirius_token.value) { set.status = 401; return { success: false }; }
    const users = await readUsers();
    return { success: true, users: users.map(u => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt })) };
  })

  // ─── AUTH: Create user ───────────────────────────────────
  .post("/auth/users", async ({ body, set, cookie: { sirius_token } }) => {
    if (!sirius_token.value) { set.status = 401; return { success: false }; }
    const users = await readUsers();
    if (users.find(u => u.username === body.username)) {
      set.status = 400;
      return { success: false, error: "Utilizador já existe." };
    }
    const newUser = { id: crypto.randomUUID(), username: body.username, passwordHash: hashPassword(body.password), role: body.role || "admin", createdAt: new Date().toISOString() };
    users.push(newUser);
    await writeFile(USERS_FILE, JSON.stringify({ users }, null, 2));
    return { success: true, user: { id: newUser.id, username: newUser.username, role: newUser.role } };
  }, { body: t.Object({ username: t.String(), password: t.String(), role: t.Optional(t.String()) }) })

  // ─── AUTH: Delete user ───────────────────────────────────
  .delete("/auth/users/:id", async ({ params, set, cookie: { sirius_token } }) => {
    if (!sirius_token.value) { set.status = 401; return { success: false }; }
    let users = await readUsers();
    if (users.length <= 1) { set.status = 400; return { success: false, error: "Não é possível apagar o último utilizador." }; }
    users = users.filter(u => u.id !== params.id);
    await writeFile(USERS_FILE, JSON.stringify({ users }, null, 2));
    return { success: true };
  })

  // ─── SITES: List ─────────────────────────────────────────
  .get("/sites", async ({ set, cookie: { sirius_token } }) => {
    if (!sirius_token.value) { set.status = 401; return { success: false }; }
    try {
      const items = await readdir(SITES_DIR, { withFileTypes: true });
      const sites = await Promise.all(
        items
          .filter(i => i.isDirectory())
          .map(i => getSiteInfo(i.name))
      );
      return { success: true, sites: sites.sort((a, b) => a.id.localeCompare(b.id)) };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  })

  // ─── SITES: Create (clone) ───────────────────────────────
  .post("/sites", async ({ body, set, cookie: { sirius_token } }) => {
    if (!sirius_token.value) { set.status = 401; return { success: false }; }

    const { name, sourceId } = body;
    const newId   = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const source  = sourceId || "confraria-vegana";
    const srcDir  = join(SITES_DIR, source);
    const destDir = join(SITES_DIR, newId);

    if (!existsSync(srcDir)) {
      set.status = 400;
      return { success: false, error: `Site fonte "${source}" não encontrado.` };
    }
    if (existsSync(destDir)) {
      set.status = 400;
      return { success: false, error: `Já existe um site com o ID "${newId}".` };
    }

    const nextPort = await getNextPort();

    // Copy excluding build artefacts and cloned paused state
    await cp(srcDir, destDir, {
      recursive: true,
      filter: (src: string) => {
        const rel = src.slice(srcDir.length);
        return !/(^\/(node_modules|\.nuxt|\.output|\.git)(\/|$))/.test(rel) && rel !== "/.paused";
      }
    });

    // Update package.json
    try {
      const pkgPath = join(destDir, "package.json");
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
      pkg.name = newId;
      if (pkg.scripts?.dev) pkg.scripts.dev = `nuxt dev --port ${nextPort}`;
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
    } catch {}

    // Update .env
    try {
      const envPath = join(destDir, ".env");
      let env = await readFile(envPath, "utf-8");
      env = env
        .replace(/NUXT_SITE_ID=.+/g,            `NUXT_SITE_ID=${newId}`)
        .replace(/NUXT_PUBLIC_SITE_ID=.+/g,      `NUXT_PUBLIC_SITE_ID=${newId}`)
        .replace(/NUXT_PUBLIC_SITE_NAME=.+/g,    `NUXT_PUBLIC_SITE_NAME=${name}`);
      await writeFile(envPath, env);
    } catch {}

    // Clone storage
    const srcStorage  = join(STORAGE_DIR, source);
    const destStorage = join(STORAGE_DIR, newId);
    if (existsSync(srcStorage)) {
      await cp(srcStorage, destStorage, { recursive: true });
    } else {
      await mkdir(join(destStorage, "v1", "_global"), { recursive: true });
      await mkdir(join(destStorage, "v1", "home"),    { recursive: true });
      await writeFile(join(destStorage, "_settings.json"), JSON.stringify({
        siteVersions: ["v1"],
        activeEditionVersion: "v1",
        defaultSiteVersion: "v1",
        lastUpdated: new Date().toISOString()
      }, null, 2));
    }

    return { success: true, site: { id: newId, name, port: nextPort } };
  }, { body: t.Object({ name: t.String(), sourceId: t.Optional(t.String()) }) })

  // ─── SITES: Rename ───────────────────────────────────────
  .patch("/sites/:id", async ({ params, body, set, cookie: { sirius_token } }) => {
    if (!sirius_token.value) { set.status = 401; return { success: false }; }

    const { displayName, newId: rawNewId } = body;
    const oldId   = params.id;
    const siteDir = join(SITES_DIR, oldId);

    if (!existsSync(siteDir)) {
      set.status = 404;
      return { success: false, error: "Site não encontrado." };
    }

    // Update display name
    if (displayName) {
      try {
        const pkgPath = join(siteDir, "package.json");
        const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
        pkg.name = displayName;
        await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
      } catch {}
      try {
        const envPath = join(siteDir, ".env");
        let env = await readFile(envPath, "utf-8");
        env = env.replace(/NUXT_PUBLIC_SITE_NAME=.+/g, `NUXT_PUBLIC_SITE_NAME=${displayName}`);
        await writeFile(envPath, env);
      } catch {}
    }

    // Rename folder if newId changed
    if (rawNewId && rawNewId !== oldId) {
      const newId  = rawNewId.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const newDir = join(SITES_DIR, newId);
      if (existsSync(newDir)) {
        set.status = 400;
        return { success: false, error: "ID já em uso por outro site." };
      }
      await rename(siteDir, newDir);
      // Update .env IDs in new location
      try {
        const envPath = join(newDir, ".env");
        let env = await readFile(envPath, "utf-8");
        env = env
          .replace(/NUXT_SITE_ID=.+/g,       `NUXT_SITE_ID=${newId}`)
          .replace(/NUXT_PUBLIC_SITE_ID=.+/g, `NUXT_PUBLIC_SITE_ID=${newId}`);
        await writeFile(envPath, env);
      } catch {}
      // Rename storage dir
      const oldStorage = join(STORAGE_DIR, oldId);
      if (existsSync(oldStorage)) {
        await rename(oldStorage, join(STORAGE_DIR, newId));
      }
      return { success: true, newId };
    }

    return { success: true };
  }, { body: t.Object({ displayName: t.Optional(t.String()), newId: t.Optional(t.String()) }) })

  // ─── SITES: Delete ───────────────────────────────────────
  .delete("/sites/:id", async ({ params, set, cookie: { sirius_token } }) => {
    if (!sirius_token.value) { set.status = 401; return { success: false }; }

    const siteDir    = join(SITES_DIR, params.id);
    const storageDir = join(STORAGE_DIR, params.id);

    if (!existsSync(siteDir)) {
      set.status = 404;
      return { success: false, error: "Site não encontrado." };
    }

    await rm(siteDir, { recursive: true, force: true });
    if (existsSync(storageDir)) await rm(storageDir, { recursive: true, force: true });

    return { success: true };
  })

  // ─── SITES: Toggle pause ─────────────────────────────────
  .post("/sites/:id/toggle", async ({ params, set, cookie: { sirius_token } }) => {
    if (!sirius_token.value) { set.status = 401; return { success: false }; }

    const siteDir   = join(SITES_DIR, params.id);
    const pauseFile = join(siteDir, ".paused");

    if (!existsSync(siteDir)) { set.status = 404; return { success: false }; }

    const isPaused = existsSync(pauseFile);
    if (isPaused) {
      await rm(pauseFile);
      return { success: true, status: "running" };
    } else {
      await writeFile(pauseFile, new Date().toISOString());
      return { success: true, status: "paused" };
    }
  });

export default () => app;
export type App = typeof app;
