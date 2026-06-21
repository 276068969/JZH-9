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
