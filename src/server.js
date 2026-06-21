const http = require("http");
const path = require("path");
const fs = require("fs");
const { Store, verifyPassword } = require("./store");
const { createSession, getSession, destroySession } = require("./auth");
const { buildDashboard, buildReport, visibleHomeIds } = require("./analytics");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers
  });
  res.end(payload);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(Object.assign(new Error("请求体过大"), { status: 413 }));
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(Object.assign(new Error("JSON 格式错误"), { status: 400 }));
      }
    });
  });
}

function createApp(options = {}) {
  const store = options.store || new Store(options.dataFile);

  function currentUser(req) {
    const session = getSession(req);
    if (!session) return { session: null, user: null };
    const user = store.data.users.find((item) => item.id === session.userId && item.status === "active");
    return { session, user };
  }

  function requireUser(req, roles) {
    const auth = currentUser(req);
    if (!auth.user) {
      const error = new Error("请先登录");
      error.status = 401;
      throw error;
    }
    if (roles && !roles.includes(auth.user.role)) {
      const error = new Error("没有权限执行该操作");
      error.status = 403;
      throw error;
    }
    return auth;
  }

  function currentDevice(req) {
    const authHeader = req.headers.authorization || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!bearer) return null;
    return store.findDeviceByToken(bearer);
  }

  function requireDevice(req) {
    const device = currentDevice(req);
    if (!device) {
      const error = new Error("设备认证失败");
      error.status = 401;
      throw error;
    }
    return device;
  }

  function scopedHomeGuard(user, homeId) {
    if (!visibleHomeIds(store.data, user).includes(homeId)) {
      const error = new Error("无权访问该家庭");
      error.status = 403;
      throw error;
    }
  }

  async function handleApi(req, res, url) {
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const user = store.findUserByAccount(body.account);
      if (!user || user.status !== "active" || !verifyPassword(body.password, user.passwordHash)) {
        return send(res, 401, { message: "账号或密码错误" });
      }
      const token = createSession(user);
      return send(
        res,
        200,
        { token, user: store.publicUser(user) },
        { "Set-Cookie": `water_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800` }
      );
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const { session } = currentUser(req);
      if (session) destroySession(session.token);
      return send(res, 200, { ok: true }, { "Set-Cookie": "water_session=; HttpOnly; Path=/; Max-Age=0" });
    }

    if (req.method === "GET" && url.pathname === "/api/me") {
      const { user } = requireUser(req);
      return send(res, 200, { user: store.publicUser(user) });
    }

    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      const { user } = requireUser(req);
      const homeIdsParam = url.searchParams.get("homeIds");
      const filterHomeIds = homeIdsParam ? homeIdsParam.split(",").filter(Boolean) : null;
      return send(res, 200, buildDashboard(store.data, user, filterHomeIds));
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      requireUser(req, ["admin"]);
      return send(res, 200, { users: store.data.users.map((user) => store.publicUser(user)) });
    }

    if (req.method === "POST" && url.pathname === "/api/users") {
      requireUser(req, ["admin"]);
      const body = await parseBody(req);
      return send(res, 201, { user: store.createUser(body) });
    }

    const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && req.method === "PATCH") {
      requireUser(req, ["admin"]);
      const body = await parseBody(req);
      const user = store.updateUser(userMatch[1], body);
      return user ? send(res, 200, { user }) : send(res, 404, { message: "用户不存在" });
    }

    if (req.method === "GET" && url.pathname === "/api/homes") {
      const { user } = requireUser(req);
      const ids = visibleHomeIds(store.data, user);
      return send(res, 200, { homes: store.data.homes.filter((home) => ids.includes(home.id)) });
    }

    if (req.method === "GET" && url.pathname === "/api/alerts") {
      const { user } = requireUser(req);
      const ids = visibleHomeIds(store.data, user);
      return send(res, 200, { alerts: store.data.alerts.filter((alert) => ids.includes(alert.homeId)) });
    }

    const alertMatch = url.pathname.match(/^\/api\/alerts\/([^/]+)$/);
    if (alertMatch && req.method === "PATCH") {
      const { user } = requireUser(req, ["admin", "operator"]);
      const body = await parseBody(req);
      const alert = store.data.alerts.find((item) => item.id === alertMatch[1]);
      if (!alert) return send(res, 404, { message: "告警不存在" });
      scopedHomeGuard(user, alert.homeId);
      alert.status = body.status || alert.status;
      alert.handledBy = user.id;
      alert.handledAt = new Date().toISOString();
      store.write();
      return send(res, 200, { alert });
    }

    if (req.method === "POST" && url.pathname === "/api/commands") {
      const { user } = requireUser(req, ["admin", "operator"]);
      const body = await parseBody(req);
      scopedHomeGuard(user, body.homeId);
      return send(res, 201, { command: store.createCommand(body, user.id) });
    }

    if (req.method === "POST" && url.pathname === "/api/plans") {
      const { user } = requireUser(req, ["admin", "operator"]);
      const body = await parseBody(req);
      scopedHomeGuard(user, body.homeId);
      return send(res, 200, { plan: store.upsertPlan(body) });
    }

    const reportMatch = url.pathname.match(/^\/api\/reports\/([^/]+)$/);
    if (reportMatch && req.method === "GET") {
      const { user } = requireUser(req);
      scopedHomeGuard(user, reportMatch[1]);
      const report = buildReport(store.data, reportMatch[1]);
      return report ? send(res, 200, report) : send(res, 404, { message: "家庭不存在" });
    }

    if (req.method === "POST" && url.pathname === "/api/device/readings") {
      const device = requireDevice(req);
      const body = await parseBody(req);
      const reading = store.addReading({
        ...body,
        deviceId: device.id
      });
      return send(res, 201, { reading });
    }

    return send(res, 404, { message: "接口不存在" });
  }

  function serveStatic(req, res, url) {
    const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));
    if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden");
    const target = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(PUBLIC_DIR, "index.html");
    const ext = path.extname(target);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    fs.createReadStream(target).pipe(res);
  }

  return async function app(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    try {
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
      } else {
        serveStatic(req, res, url);
      }
    } catch (error) {
      send(res, error.status || 500, { message: error.message || "服务器错误" });
    }
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  http.createServer(createApp()).listen(port, () => {
    console.log(`家庭用水管控平台已启动：http://localhost:${port}`);
  });
}

module.exports = {
  createApp
};
