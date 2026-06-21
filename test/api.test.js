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
  assert.equal(store.data.settings.migrationVersion, 1, "迁移版本号应更新为 1");
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
