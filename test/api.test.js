const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("../src/server");
const { Store } = require("../src/store");

function request(baseUrl, target, options = {}) {
  return fetch(`${baseUrl}${target}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  }).then(async (response) => ({
    status: response.status,
    body: await response.json().catch(() => ({})),
    headers: response.headers
  }));
}

test("login returns a token and dashboard data", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "admin", password: "Admin@123" })
  });

  assert.equal(login.status, 200);
  assert.ok(login.body.token);

  const dashboard = await request(baseUrl, "/api/dashboard", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.cards.homes, 2);
  assert.ok(dashboard.body.dailySeries.length > 0);
});

test("resident cannot create users", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "resident", password: "Home@123" })
  });

  const createUser = await request(baseUrl, "/api/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ name: "访客", account: "guest", role: "resident" })
  });

  assert.equal(createUser.status, 403);
});

test("dashboard supports filtering by homeIds", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "admin", password: "Admin@123" })
  });

  const dashboardAll = await request(baseUrl, "/api/dashboard", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(dashboardAll.status, 200);
  assert.equal(dashboardAll.body.cards.homes, 2);

  const dashboardFiltered = await request(baseUrl, "/api/dashboard?homeIds=home_101", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(dashboardFiltered.status, 200);
  assert.equal(dashboardFiltered.body.cards.homes, 1);
  assert.equal(dashboardFiltered.body.homes[0].id, "home_101");

  const dashboardReset = await request(baseUrl, "/api/dashboard", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(dashboardReset.status, 200);
  assert.equal(dashboardReset.body.cards.homes, 2);
});

test("device reading submission works with valid token and data", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const meter101 = store.data.devices.find((d) => d.id === "dev_meter_101");
  const beforeCount = store.data.readings.length;
  const at = new Date(Date.now() - 3600000).toISOString();

  const result = await request(baseUrl, "/api/device/readings", {
    method: "POST",
    headers: { Authorization: `Bearer ${meter101.token}` },
    body: JSON.stringify({
      homeId: "home_101",
      at,
      usage: 0.55,
      pressure: 0.28,
      temperature: 20.5
    })
  });

  assert.equal(result.status, 201);
  assert.ok(result.body.reading);
  assert.equal(result.body.reading.deviceId, "dev_meter_101");
  assert.equal(result.body.reading.homeId, "home_101");
  assert.equal(result.body.reading.usage, 0.55);
  assert.equal(store.data.readings.length, beforeCount + 1);
});

test("device reading rejects invalid token", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const beforeCount = store.data.readings.length;

  const result = await request(baseUrl, "/api/device/readings", {
    method: "POST",
    headers: { Authorization: "Bearer invalid_token" },
    body: JSON.stringify({
      homeId: "home_101",
      usage: 0.55,
      pressure: 0.28,
      temperature: 20.5
    })
  });

  assert.equal(result.status, 401);
  assert.equal(store.data.readings.length, beforeCount);
});

test("device reading rejects valve device type", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const valve101 = store.data.devices.find((d) => d.id === "dev_valve_101");
  const beforeCount = store.data.readings.length;

  const result = await request(baseUrl, "/api/device/readings", {
    method: "POST",
    headers: { Authorization: `Bearer ${valve101.token}` },
    body: JSON.stringify({
      homeId: "home_101",
      usage: 0.55,
      pressure: 0.28,
      temperature: 20.5
    })
  });

  assert.equal(result.status, 400);
  assert.equal(store.data.readings.length, beforeCount);
});

test("device reading rejects mismatched homeId", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const meter101 = store.data.devices.find((d) => d.id === "dev_meter_101");
  const beforeCount = store.data.readings.length;

  const result = await request(baseUrl, "/api/device/readings", {
    method: "POST",
    headers: { Authorization: `Bearer ${meter101.token}` },
    body: JSON.stringify({
      homeId: "home_202",
      usage: 0.55,
      pressure: 0.28,
      temperature: 20.5
    })
  });

  assert.equal(result.status, 400);
  assert.equal(store.data.readings.length, beforeCount);
});

test("device reading rejects invalid usage value", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const meter101 = store.data.devices.find((d) => d.id === "dev_meter_101");
  const beforeCount = store.data.readings.length;

  const result = await request(baseUrl, "/api/device/readings", {
    method: "POST",
    headers: { Authorization: `Bearer ${meter101.token}` },
    body: JSON.stringify({
      homeId: "home_101",
      usage: -5,
      pressure: 0.28,
      temperature: 20.5
    })
  });

  assert.equal(result.status, 400);
  assert.equal(store.data.readings.length, beforeCount);
});

test("device reading rejects duplicate reading in same minute", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const meter101 = store.data.devices.find((d) => d.id === "dev_meter_101");
  const at = new Date(Date.now() - 7200000).toISOString();
  const beforeCount = store.data.readings.length;

  const first = await request(baseUrl, "/api/device/readings", {
    method: "POST",
    headers: { Authorization: `Bearer ${meter101.token}` },
    body: JSON.stringify({
      homeId: "home_101",
      at,
      usage: 0.55,
      pressure: 0.28,
      temperature: 20.5
    })
  });
  assert.equal(first.status, 201);
  assert.equal(store.data.readings.length, beforeCount + 1);

  const second = await request(baseUrl, "/api/device/readings", {
    method: "POST",
    headers: { Authorization: `Bearer ${meter101.token}` },
    body: JSON.stringify({
      homeId: "home_101",
      at,
      usage: 0.66,
      pressure: 0.29,
      temperature: 21.0
    })
  });
  assert.equal(second.status, 409);
  assert.equal(store.data.readings.length, beforeCount + 1);
});

test("failed reading does not pollute dashboard stats", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "admin", password: "Admin@123" })
  });

  const dashboardBefore = await request(baseUrl, "/api/dashboard", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  const usageBefore = dashboardBefore.body.cards.monthUsage;
  const countBefore = store.data.readings.length;

  const meter101 = store.data.devices.find((d) => d.id === "dev_meter_101");
  await request(baseUrl, "/api/device/readings", {
    method: "POST",
    headers: { Authorization: `Bearer ${meter101.token}` },
    body: JSON.stringify({
      homeId: "home_101",
      usage: -999,
      pressure: 0.28,
      temperature: 20.5
    })
  });

  const dashboardAfter = await request(baseUrl, "/api/dashboard", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });

  assert.equal(store.data.readings.length, countBefore);
  assert.equal(dashboardAfter.body.cards.monthUsage, usageBefore);
});

test("admin can process alert with note and history is recorded", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "admin", password: "Admin@123" })
  });

  const before = await request(baseUrl, "/api/alerts/alt_leak_101", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(before.status, 200);
  assert.equal(before.body.alert.status, "open");
  assert.equal(before.body.alert.history.length, 0);
  assert.equal(before.body.alert.handledByName, null);

  const patch = await request(baseUrl, "/api/alerts/alt_leak_101", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ status: "processing", note: "已联系住户，安排明天上门检修马桶水箱。" })
  });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.alert.status, "processing");
  assert.equal(patch.body.alert.handledBy, "usr_admin");
  assert.ok(patch.body.alert.handledAt);
  assert.equal(patch.body.alert.handledByName, "系统管理员");
  assert.equal(patch.body.alert.history.length, 1);
  assert.equal(patch.body.alert.history[0].note, "已联系住户，安排明天上门检修马桶水箱。");
  assert.equal(patch.body.alert.history[0].handledBy, "usr_admin");
  assert.equal(patch.body.alert.history[0].handledByName, "系统管理员");
  assert.equal(patch.body.alert.history[0].status, "processing");

  const after = await request(baseUrl, "/api/alerts/alt_leak_101", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(after.body.alert.history.length, 1);
  assert.equal(after.body.alert.status, "processing");
});

test("processing alert requires a non-empty note", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "admin", password: "Admin@123" })
  });

  const missing = await request(baseUrl, "/api/alerts/alt_leak_101", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ status: "resolved" })
  });
  assert.equal(missing.status, 400);

  const blank = await request(baseUrl, "/api/alerts/alt_leak_101", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ status: "resolved", note: "   " })
  });
  assert.equal(blank.status, 400);

  const detail = await request(baseUrl, "/api/alerts/alt_leak_101", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(detail.body.alert.status, "open");
  assert.equal(detail.body.alert.history.length, 0);
});

test("processing alert rejects invalid status", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "admin", password: "Admin@123" })
  });

  const patch = await request(baseUrl, "/api/alerts/alt_leak_101", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ status: "invalid", note: "测试无效状态" })
  });
  assert.equal(patch.status, 400);

  const detail = await request(baseUrl, "/api/alerts/alt_leak_101", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(detail.body.alert.status, "open");
});

test("resident cannot modify alert records", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "resident", password: "Home@123" })
  });

  const patch = await request(baseUrl, "/api/alerts/alt_leak_101", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ status: "resolved", note: "住户尝试处理" })
  });
  assert.equal(patch.status, 403);

  const detail = await request(baseUrl, "/api/alerts/alt_leak_101", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(detail.body.alert.status, "open");
  assert.equal(detail.body.alert.history.length, 0);
});

test("resident can view own home alert detail but not other homes", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "resident", password: "Home@123" })
  });

  const own = await request(baseUrl, "/api/alerts/alt_leak_101", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(own.status, 200);
  assert.equal(own.body.alert.id, "alt_leak_101");
  assert.ok(Array.isArray(own.body.alert.history));

  const other = await request(baseUrl, "/api/alerts/alt_pressure_202", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(other.status, 403);

  const list = await request(baseUrl, "/api/alerts", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(list.status, 200);
  assert.equal(list.body.alerts.length, 1);
  assert.equal(list.body.alerts[0].homeId, "home_101");
  assert.equal(list.body.alerts[0].handledByName, null);
});

test("seed processing alert exposes history with handler name", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "admin", password: "Admin@123" })
  });

  const detail = await request(baseUrl, "/api/alerts/alt_pressure_202", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.alert.status, "processing");
  assert.equal(detail.body.alert.history.length, 1);
  assert.equal(detail.body.alert.history[0].handledByName, "运维值班员");
  assert.equal(detail.body.alert.handledByName, "运维值班员");
});

test("operator can process alert and multiple records append to timeline", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "operator", password: "Ops@12345" })
  });

  const first = await request(baseUrl, "/api/alerts/alt_leak_101", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ status: "processing", note: "第一次跟进：电话联系住户确认时段。" })
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.alert.handledBy, "usr_operator");

  await request(baseUrl, "/api/alerts/alt_leak_101", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ status: "resolved", note: "第二次跟进：上门更换密封圈并复测无渗漏，闭环。" })
  });

  const detail = await request(baseUrl, "/api/alerts/alt_leak_101", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(detail.body.alert.status, "resolved");
  assert.equal(detail.body.alert.history.length, 2);
  assert.equal(detail.body.alert.history[0].note, "第一次跟进：电话联系住户确认时段。");
  assert.equal(detail.body.alert.history[1].note, "第二次跟进：上门更换密封圈并复测无渗漏，闭环。");
  assert.equal(detail.body.alert.history[1].status, "resolved");
});

test("alert detail returns 404 for missing alert", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const store = new Store(path.join(dir, "store.json"));
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "admin", password: "Admin@123" })
  });

  const detail = await request(baseUrl, "/api/alerts/alt_not_exist", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(detail.status, 404);
});

test("migration backfills history array for legacy alerts", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const storeFile = path.join(dir, "store.json");
  const legacyData = {
    users: [
      { id: "usr_admin", name: "管理员", account: "admin", role: "admin", status: "active", passwordHash: "salt:hash" }
    ],
    homes: [{ id: "home_1", name: "家庭", ownerId: "usr_admin" }],
    devices: [],
    readings: [],
    alerts: [
      {
        id: "alt_legacy",
        homeId: "home_1",
        level: "high",
        type: "leak",
        title: "历史漏水",
        detail: "迁移前创建的告警",
        status: "open",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    plans: [],
    commands: [],
    settings: { initialized: true, migrationVersion: 1 }
  };
  fs.writeFileSync(storeFile, JSON.stringify(legacyData, null, 2));

  const store = new Store(storeFile);
  const alert = store.data.alerts.find((a) => a.id === "alt_legacy");
  assert.ok(Array.isArray(alert.history), "迁移后告警应包含 history 数组");
  assert.equal(alert.handledBy, null);
  assert.ok(alert.acceptance, "迁移后告警应包含 acceptance 字段");
  assert.equal(store.data.settings.migrationVersion, 4, "迁移版本号应更新为 4");
});

test("migration fills token for legacy store without token", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "water-test-"));
  const storeFile = path.join(dir, "store.json");
  const legacyData = {
    users: [
      {
        id: "usr_resident",
        name: "测试用户",
        account: "resident",
        role: "resident",
        status: "active",
        passwordHash: "salt:hash"
      }
    ],
    homes: [
      { id: "home_test", name: "测试家庭", ownerId: "usr_resident" }
    ],
    devices: [
      {
        id: "dev_meter_test",
        homeId: "home_test",
        name: "测试水表",
        type: "meter",
        status: "online",
        valve: "open"
      }
    ],
    readings: [],
    alerts: [],
    plans: [],
    commands: [],
    settings: { initialized: true }
  };
  fs.writeFileSync(storeFile, JSON.stringify(legacyData, null, 2));

  const store = new Store(storeFile);

  const device = store.data.devices.find((d) => d.id === "dev_meter_test");
  assert.ok(device.token, "迁移后设备应已生成 token");
  assert.ok(device.token.length > 10, "token 长度应合理");
  assert.equal(store.data.settings.migrationVersion, 4, "迁移版本号应更新为 4");
  assert.ok(store.data._migrations?.length > 0, "迁移历史应已记录");

  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const result = await request(baseUrl, "/api/device/readings", {
    method: "POST",
    headers: { Authorization: `Bearer ${device.token}` },
    body: JSON.stringify({
      homeId: "home_test",
      usage: 0.42,
      pressure: 0.25,
      temperature: 18.0
    })
  });
  assert.equal(result.status, 201, "迁移后的设备 token 应可正常认证");
});

test("GET /api/commands returns command list with proper data", async (t) => {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "admin", password: "Admin@123" })
  });

  const result = await request(baseUrl, "/api/commands", {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });

  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.body.commands), "应返回 commands 数组");
  if (result.body.commands.length) {
    const cmd = result.body.commands[0];
    assert.ok(cmd.id, "指令应包含 id");
    assert.ok(cmd.homeName, "指令应包含 homeName");
    assert.ok(cmd.deviceName, "指令应包含 deviceName");
    assert.ok(cmd.action, "指令应包含 action");
    assert.ok(cmd.actorName, "指令应包含 actorName");
    assert.ok(cmd.status, "指令应包含 status");
    assert.ok(cmd.createdAt, "指令应包含 createdAt");
  }
});

test("GET /api/commands supports filtering by homeIds, actions, and statuses", async (t) => {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "admin", password: "Admin@123" })
  });
  const token = login.body.token;

  const allResult = await request(baseUrl, "/api/commands", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const totalCount = allResult.body.commands.length;

  const actionFiltered = await request(baseUrl, "/api/commands?actions=open_valve", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.ok(actionFiltered.body.commands.every((c) => c.action === "open_valve"), "按 action 筛选应生效");
  assert.ok(actionFiltered.body.commands.length <= totalCount, "筛选后数量应不多于总数");

  const statusFiltered = await request(baseUrl, "/api/commands?statuses=success", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.ok(statusFiltered.body.commands.every((c) => c.status === "success"), "按 status 筛选应生效");

  const homeFiltered = await request(baseUrl, "/api/commands?homeIds=home_101", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.ok(homeFiltered.body.commands.every((c) => c.homeId === "home_101"), "按 homeId 筛选应生效");

  const combinedFilter = await request(baseUrl, "/api/commands?actions=close_valve&statuses=success", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.ok(combinedFilter.body.commands.every((c) => c.action === "close_valve" && c.status === "success"), "多条件组合筛选应生效");
});

test("resident user can only see commands for their own home", async (t) => {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const adminLogin = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "admin", password: "Admin@123" })
  });
  const adminCommands = await request(baseUrl, "/api/commands", {
    headers: { Authorization: `Bearer ${adminLogin.body.token}` }
  });

  const residentLogin = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "resident", password: "Home@123" })
  });
  const residentCommands = await request(baseUrl, "/api/commands", {
    headers: { Authorization: `Bearer ${residentLogin.body.token}` }
  });

  assert.equal(residentCommands.status, 200, "家庭用户应可正常访问控制记录接口");
  assert.ok(residentCommands.body.commands.every((c) => c.homeId === "home_101"), "家庭用户只能查看所属家庭的指令");
  assert.ok(residentCommands.body.commands.length <= adminCommands.body.commands.length, "家庭用户可见指令应不多于管理员");
  assert.ok(residentCommands.body.commands.length > 0, "家庭用户应能看到其家庭下的指令记录");
});

test("resident user cannot POST commands (write restriction)", async (t) => {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const residentLogin = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "resident", password: "Home@123" })
  });

  const result = await request(baseUrl, "/api/commands", {
    method: "POST",
    headers: { Authorization: `Bearer ${residentLogin.body.token}` },
    body: JSON.stringify({
      homeId: "home_101",
      deviceId: "dev_valve_101",
      action: "close_valve",
      valve: "closed",
      reason: "manual"
    })
  });

  assert.equal(result.status, 403, "家庭用户不应有权下发控制指令");
});

test("operator user can access control records and issue commands", async (t) => {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "operator", password: "Ops@12345" })
  });
  const token = login.body.token;

  const listResult = await request(baseUrl, "/api/commands", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(listResult.status, 200, "运维员应可查看控制记录");
  assert.ok(Array.isArray(listResult.body.commands), "运维员应看到指令列表");

  const createResult = await request(baseUrl, "/api/commands", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      homeId: "home_101",
      deviceId: "dev_valve_101",
      action: "open_valve",
      valve: "open",
      reason: "console_control"
    })
  });
  assert.equal(createResult.status, 201, "运维员应可下发控制指令");
});

test("POST /api/commands creates a command and appears in GET /api/commands", async (t) => {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: "operator", password: "Ops@12345" })
  });
  const token = login.body.token;

  const createResult = await request(baseUrl, "/api/commands", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      homeId: "home_101",
      deviceId: "dev_valve_101",
      action: "close_valve",
      valve: "closed",
      reason: "manual"
    })
  });

  assert.equal(createResult.status, 201, "创建指令应返回 201");
  assert.ok(createResult.body.command.id, "新建指令应返回 id");

  const listResult = await request(baseUrl, "/api/commands", {
    headers: { Authorization: `Bearer ${token}` }
  });

  const newCmd = listResult.body.commands.find((c) => c.id === createResult.body.command.id);
  assert.ok(newCmd, "新建指令应出现在列表中");
  assert.equal(newCmd.action, "close_valve");
  assert.equal(newCmd.reason, "manual");
  assert.equal(newCmd.status, "issued");
  assert.equal(newCmd.actorName, "运维值班员");
});
