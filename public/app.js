const state = {
  token: localStorage.getItem("water_token"),
  user: null,
  dashboard: null,
  view: "dashboard",
  selectedHomeIds: [],
  selectedAlertId: null,
  selectedAlert: null
};

const ROLE_LABEL = {
  admin: "管理员",
  operator: "运维员",
  resident: "家庭用户"
};

const STATUS_LABEL = {
  open: "待处理",
  processing: "处理中",
  resolved: "已处理",
  disputed: "有异议"
};

const HISTORY_TYPE_LABEL = {
  handle: "处理记录",
  objection: "异议记录"
};

const ACCEPTANCE_TYPE_LABEL = {
  default: "系统默认接受",
  manual: "用户手动接受",
  none: "未接受"
};

const LEVEL_LABEL = {
  high: "高",
  medium: "中",
  low: "低"
};

function qs(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "请求失败");
  return data;
}

function formatDate(value) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderLogin() {
  qs("#app").innerHTML = `
    <section class="login">
      <form class="login-panel" id="loginForm">
        <div>
          <h1>家庭用水管控平台</h1>
          <p>面向住户、运维与后台管理的水表监测、阀门控制、异常告警和节水计划系统。</p>
        </div>
        <label>账号<input name="account" value="admin" autocomplete="username" /></label>
        <label>密码<input name="password" type="password" value="Admin@123" autocomplete="current-password" /></label>
        <button type="submit">登录平台</button>
        <div class="notice" id="loginNotice"></div>
      </form>
      <aside class="login-visual">
        <div>
          <h2>水量、压力、阀门、告警集中管控</h2>
          <p>内置角色权限、家庭配额、异常研判、远程指令留痕与报表建议。</p>
        </div>
        <div class="metric-strip">
          <div><span>测试家庭</span><strong>2</strong></div>
          <div><span>在线设备</span><strong>3</strong></div>
          <div><span>内置角色</span><strong>3</strong></div>
        </div>
      </aside>
    </section>
  `;
  qs("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form))
      });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem("water_token", data.token);
      await loadDashboard();
      renderApp();
    } catch (error) {
      qs("#loginNotice").textContent = error.message;
    }
  });
}

function navButton(key, label) {
  return `<button class="${state.view === key ? "active" : ""}" data-view="${key}">${label}</button>`;
}

function renderShell(content) {
  const adminNav = state.user.role === "admin" ? navButton("users", "用户管理") : "";
  qs("#app").innerHTML = `
    <section class="app-shell">
      <aside class="sidebar">
        <div class="brand">水管控平台</div>
        <nav class="nav">
          ${navButton("dashboard", "运行总览")}
          ${navButton("homes", "家庭与设备")}
          ${navButton("alerts", "异常告警")}
          ${navButton("plans", "节水计划")}
          ${adminNav}
        </nav>
        <div class="profile">
          <span>${state.user.name} · ${ROLE_LABEL[state.user.role]}</span>
          <button class="secondary" id="logoutBtn">退出登录</button>
        </div>
      </aside>
      <section class="content">${content}</section>
    </section>
  `;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      renderApp();
    });
  });
  qs("#logoutBtn").addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("water_token");
    state.token = null;
    state.user = null;
    renderLogin();
  });
}

async function loadDashboard() {
  const params = new URLSearchParams();
  if (state.selectedHomeIds.length) {
    params.set("homeIds", state.selectedHomeIds.join(","));
  }
  const query = params.toString();
  state.dashboard = await api(`/api/dashboard${query ? "?" + query : ""}`);
}

function drawChart(series) {
  const canvas = qs("#usageChart");
  if (!canvas) return;
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.strokeStyle = "#d8e0e8";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = 28 + i * ((rect.height - 56) / 4);
    ctx.beginPath();
    ctx.moveTo(36, y);
    ctx.lineTo(rect.width - 16, y);
    ctx.stroke();
  }
  const max = Math.max(...series.map((item) => item.value), 1);
  const step = (rect.width - 64) / Math.max(series.length - 1, 1);
  ctx.strokeStyle = "#047c89";
  ctx.lineWidth = 3;
  ctx.beginPath();
  series.forEach((item, index) => {
    const x = 40 + index * step;
    const y = rect.height - 28 - (item.value / max) * (rect.height - 58);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = "#07525d";
  ctx.font = "12px sans-serif";
  series.forEach((item, index) => {
    if (index % 3 === 0 || index === series.length - 1) {
      ctx.fillText(item.date, 28 + index * step, rect.height - 8);
    }
  });
}

function renderDashboard() {
  const { cards, alerts, homes } = state.dashboard;
  const canFilter = ["admin", "operator"].includes(state.user.role);
  const homeFilter = canFilter ? `
    <div class="filter-bar">
      <label class="filter-label">
        家庭筛选
        <select id="homeFilter">
          <option value="">全部家庭</option>
          ${homes.map((home) => `<option value="${home.id}" ${state.selectedHomeIds.includes(home.id) ? "selected" : ""}>${home.name}</option>`).join("")}
        </select>
      </label>
      ${state.selectedHomeIds.length ? `<button class="secondary" id="resetFilterBtn">恢复全部家庭</button>` : ""}
    </div>
  ` : "";

  renderShell(`
    <div class="topbar">
      <div class="page-title">
        <h1>运行总览</h1>
        <p>实时聚合家庭水量、设备状态、配额风险和异常告警。</p>
      </div>
      <div class="topbar-actions">
        ${homeFilter}
        <button id="refreshBtn">刷新数据</button>
      </div>
    </div>
    <section class="grid">
      <div class="card"><span>家庭数</span><strong>${cards.homes}</strong></div>
      <div class="card"><span>接入设备</span><strong>${cards.devices}</strong></div>
      <div class="card"><span>本月用水 m³</span><strong>${cards.monthUsage}</strong></div>
      <div class="card"><span>风险评分</span><strong>${cards.riskScore}</strong></div>
    </section>
    <section class="grid two">
      <div class="panel">
        <h2>近 14 日用水趋势</h2>
        <canvas class="chart" id="usageChart"></canvas>
      </div>
      <div class="panel">
        <h2>高优先级告警</h2>
        <div class="list">
          ${alerts.map(renderAlertItem).join("") || "<div class='list-item'>暂无告警</div>"}
        </div>
      </div>
    </section>
  `);
  qs("#refreshBtn").addEventListener("click", async () => {
    await loadDashboard();
    renderApp();
  });
  const homeFilterEl = qs("#homeFilter");
  if (homeFilterEl) {
    homeFilterEl.addEventListener("change", async (event) => {
      const value = event.target.value;
      state.selectedHomeIds = value ? [value] : [];
      await loadDashboard();
      renderApp();
    });
  }
  const resetFilterBtn = qs("#resetFilterBtn");
  if (resetFilterBtn) {
    resetFilterBtn.addEventListener("click", async () => {
      state.selectedHomeIds = [];
      await loadDashboard();
      renderApp();
    });
  }
  drawChart(state.dashboard.dailySeries);
}

function renderAlertItem(alert) {
  return `
    <article class="list-item">
      <strong>${escapeHtml(alert.title)}</strong>
      <span>${escapeHtml(alert.detail)}</span>
      <div class="meta">
        <span class="tag ${alert.level}">${LEVEL_LABEL[alert.level] || alert.level}</span>
        <span class="tag ${alert.status}">${STATUS_LABEL[alert.status] || alert.status}</span>
        <span>${formatDate(alert.createdAt)}</span>
      </div>
    </article>
  `;
}

function renderHomes() {
  const { homes, devices } = state.dashboard;
  renderShell(`
    <div class="topbar">
      <div class="page-title">
        <h1>家庭与设备</h1>
        <p>查看家庭配额、智能水表、入户阀门和远程控制状态。</p>
      </div>
    </div>
    <section class="table-wrap">
      <table>
        <thead><tr><th>家庭</th><th>地址</th><th>成员</th><th>月配额</th><th>设备</th><th>操作</th></tr></thead>
        <tbody>
          ${homes
            .map((home) => {
              const homeDevices = devices.filter((device) => device.homeId === home.id);
              const valve = homeDevices.find((device) => device.type === "valve") || homeDevices[0];
              return `<tr>
                <td>${home.name}</td>
                <td>${home.address}</td>
                <td>${home.memberCount}</td>
                <td>${home.monthlyQuota} m³</td>
                <td>${homeDevices.map((device) => `${device.name} / ${device.status} / ${device.valve}`).join("<br>")}</td>
                <td class="actions">
                  <button data-report="${home.id}" class="secondary">报表</button>
                  ${
                    ["admin", "operator"].includes(state.user.role)
                      ? `<button data-valve="${valve?.id}" data-home="${home.id}" data-next="closed" class="danger">关阀</button>
                         <button data-valve="${valve?.id}" data-home="${home.id}" data-next="open">开阀</button>`
                      : ""
                  }
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </section>
    <section class="panel" id="reportPanel"><h2>家庭报表</h2><div class="list-item">选择家庭后生成报表。</div></section>
  `);
  document.querySelectorAll("[data-valve]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api("/api/commands", {
        method: "POST",
        body: JSON.stringify({
          homeId: button.dataset.home,
          deviceId: button.dataset.valve,
          action: button.dataset.next === "closed" ? "close_valve" : "open_valve",
          valve: button.dataset.next,
          reason: "console_control"
        })
      });
      await loadDashboard();
      renderHomes();
    });
  });
  document.querySelectorAll("[data-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      const report = await api(`/api/reports/${button.dataset.report}`);
      qs("#reportPanel").innerHTML = `
        <h2>${report.home.name} 用水报表</h2>
        <div class="grid">
          <div class="card"><span>本月用水</span><strong>${report.monthUsage}</strong></div>
          <div class="card"><span>配额占比</span><strong>${report.quotaPercent}%</strong></div>
          <div class="card"><span>平均压力</span><strong>${report.avgPressure}</strong></div>
          <div class="card"><span>漏损风险</span><strong>${report.leakRisk}</strong></div>
        </div>
        <p>${report.savingAdvice}</p>
      `;
    });
  });
}

async function loadAlertDetail(alertId) {
  const data = await api(`/api/alerts/${alertId}`);
  state.selectedAlert = data.alert;
}

function renderAlerts() {
  let alerts = [];
  renderShell(`
    <div class="topbar">
      <div class="page-title">
        <h1>异常告警</h1>
        <p>跟踪漏水、压力、电量和设备离线等事件，记录处理进展与闭环历史。</p>
      </div>
      <div class="topbar-actions">
        <button id="refreshAlertsBtn">刷新</button>
      </div>
    </div>
    <section class="list" id="alertList">
      <div class="list-item">告警加载中…</div>
    </section>
  `);
  qs("#refreshAlertsBtn").addEventListener("click", () => renderAlerts());
  api("/api/alerts")
    .then((data) => {
      alerts = data.alerts || [];
      renderAlertList(alerts);
    })
    .catch((error) => {
      qs("#alertList").innerHTML = `<div class="list-item">${escapeHtml(error.message)}</div>`;
    });
}

function renderAlertList(alerts) {
  const listEl = qs("#alertList");
  if (!listEl) return;
  if (!alerts.length) {
    listEl.innerHTML = "<div class='list-item'>暂无告警</div>";
    return;
  }
  listEl.innerHTML = alerts
    .map(
      (alert) => `
      <article class="list-item">
        <strong>${escapeHtml(alert.title)}</strong>
        <span>${escapeHtml(alert.detail)}</span>
        <div class="meta">
          <span class="tag ${alert.level}">${LEVEL_LABEL[alert.level] || alert.level}</span>
          <span class="tag ${alert.status}">${STATUS_LABEL[alert.status] || alert.status}</span>
          <span>发生时间：${formatDate(alert.createdAt)}</span>
          ${alert.handledByName ? `<span>处理人：${escapeHtml(alert.handledByName)}</span>` : ""}
          ${alert.handledAt ? `<span>最近处理：${formatDate(alert.handledAt)}</span>` : ""}
        </div>
        <div class="actions">
          <button data-detail="${alert.id}">查看详情</button>
        </div>
      </article>
    `
    )
    .join("");
  listEl.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedAlertId = button.dataset.detail;
      state.view = "alertDetail";
      try {
        await loadAlertDetail(state.selectedAlertId);
        renderAlertDetail();
      } catch (error) {
        state.view = "alerts";
        renderApp();
      }
    });
  });
}

function renderAcceptanceInfo(alert) {
  const acc = alert.acceptance || {};
  if (!acc.accepted && acc.daysUntilAccept === null) {
    return "";
  }
  if (acc.accepted) {
    return `<div class="notice success">
      <strong>处理结果已接受</strong>（${ACCEPTANCE_TYPE_LABEL[acc.acceptanceType] || acc.acceptanceType}）
      ${acc.acceptedAt ? `，接受时间：${formatDate(acc.acceptedAt)}` : ""}
    </div>`;
  }
  return `<div class="notice warning">
    <strong>接受倒计时</strong>：处理完成后 ${acc.defaultAcceptanceDays || 14} 天内未提出异议，系统将默认接受处理结果。
    剩余 <strong>${acc.daysUntilAccept}</strong> 天。
  </div>`;
}

function renderAlertDetail() {
  const alert = state.selectedAlert;
  if (!alert) {
    state.view = "alerts";
    return renderApp();
  }
  const canHandle = ["admin", "operator"].includes(state.user.role);
  const isResident = state.user.role === "resident";
  const statusOptions = ["open", "processing", "resolved", "disputed"];
  const history = alert.history || [];
  const acc = alert.acceptance || {};
  const canObject = isResident && !acc.accepted;
  renderShell(`
    <div class="topbar">
      <div class="page-title">
        <h1>告警详情</h1>
        <p>${escapeHtml(alert.title)}</p>
      </div>
      <div class="topbar-actions">
        <button class="secondary" id="alertBackBtn">返回告警列表</button>
      </div>
    </div>
    <section class="grid two">
      <div class="panel">
        <h2>告警信息</h2>
        <article class="list-item">
          <strong>${escapeHtml(alert.title)}</strong>
          <span>${escapeHtml(alert.detail)}</span>
          <div class="meta">
            <span class="tag ${alert.level}">${LEVEL_LABEL[alert.level] || alert.level}</span>
            <span class="tag ${alert.status}">${STATUS_LABEL[alert.status] || alert.status}</span>
            <span>发生时间：${formatDate(alert.createdAt)}</span>
            ${alert.handledByName ? `<span>当前处理人：${escapeHtml(alert.handledByName)}</span>` : ""}
            ${alert.handledAt ? `<span>最近处理：${formatDate(alert.handledAt)}</span>` : ""}
            ${alert.resolvedAt ? `<span>处理完成：${formatDate(alert.resolvedAt)}</span>` : ""}
          </div>
        </article>
        ${renderAcceptanceInfo(alert)}
        ${
          canHandle
            ? `<form class="alert-form" id="alertHandleForm">
                <label>处理状态
                  <select name="status">
                    ${statusOptions
                      .map((s) => `<option value="${s}" ${s === alert.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`)
                      .join("")}
                  </select>
                </label>
                <label>处理说明
                  <textarea name="note" rows="4" placeholder="请填写本次处理说明，例如已联系住户、上门检修情况、闭环结论等" required></textarea>
                </label>
                <button type="submit">提交处理记录</button>
                <div class="notice" id="alertHandleNotice"></div>
              </form>`
            : ""
        }
        ${
          isResident
            ? `<div class="notice info">您作为家庭用户仅可查看本家庭告警处理进展，不能修改处理记录。</div>`
            : ""
        }
        ${
          canObject
            ? `<form class="alert-form" id="alertObjectionForm">
                <label>异议说明
                  <textarea name="note" rows="4" placeholder="如对处理结果有异议，请在此说明具体原因，运维人员将重新跟进处理" required></textarea>
                </label>
                <button type="submit" class="danger">提交异议</button>
                <div class="notice" id="alertObjectionNotice"></div>
              </form>`
            : ""
        }
      </div>
      <div class="panel">
        <h2>处理记录历史</h2>
        <div class="timeline">
          ${
            history.length
              ? history
                  .map(
                    (entry) => `
                    <div class="timeline-item ${entry.type === "objection" ? "objection" : ""}">
                      <div class="timeline-dot"></div>
                      <div class="timeline-content">
                        <div class="meta">
                          <span class="tag ${entry.type}">${HISTORY_TYPE_LABEL[entry.type] || entry.type}</span>
                          <span class="tag ${entry.status}">${STATUS_LABEL[entry.status] || entry.status}</span>
                          <span>${entry.handledByName ? `提交人：${escapeHtml(entry.handledByName)}` : "系统自动"}</span>
                          <span>${formatDate(entry.handledAt)}</span>
                        </div>
                        <p>${escapeHtml(entry.note)}</p>
                      </div>
                    </div>
                  `
                  )
                  .join("")
              : "<div class='list-item'>暂无处理记录，等待运维人员跟进。</div>"
          }
        </div>
      </div>
    </section>
  `);
  qs("#alertBackBtn").addEventListener("click", () => {
    state.selectedAlertId = null;
    state.selectedAlert = null;
    state.view = "alerts";
    renderApp();
  });
  const form = qs("#alertHandleForm");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form));
      const notice = qs("#alertHandleNotice");
      try {
        await api(`/api/alerts/${alert.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        await loadAlertDetail(alert.id);
        renderAlertDetail();
      } catch (error) {
        if (notice) notice.textContent = error.message;
      }
    });
  }
  const objectionForm = qs("#alertObjectionForm");
  if (objectionForm) {
    objectionForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget));
      const notice = qs("#alertObjectionNotice");
      try {
        await api(`/api/alerts/${alert.id}/objections`, { method: "POST", body: JSON.stringify(payload) });
        await loadAlertDetail(alert.id);
        renderAlertDetail();
      } catch (error) {
        if (notice) notice.textContent = error.message;
      }
    });
  }
}

function renderPlans() {
  const homes = state.dashboard.homes;
  const plans = state.dashboard.plans;
  renderShell(`
    <div class="topbar">
      <div class="page-title">
        <h1>节水计划</h1>
        <p>为家庭设置月度配额、提醒阈值与自动关阀策略。</p>
      </div>
    </div>
    ${
      ["admin", "operator"].includes(state.user.role)
        ? `<form class="panel form-grid" id="planForm">
            <label>家庭<select name="homeId">${homes.map((home) => `<option value="${home.id}">${home.name}</option>`).join("")}</select></label>
            <label>计划名<input name="name" value="节水守护" /></label>
            <label>月配额 m³<input name="quota" type="number" step="0.1" value="15" /></label>
            <label>提醒阈值 %<input name="notifyAtPercent" type="number" value="80" /></label>
            <label>自动关阀<select name="autoValve"><option value="true">开启</option><option value="false">关闭</option></select></label>
            <button type="submit">保存计划</button>
          </form>`
        : ""
    }
    <section class="table-wrap">
      <table>
        <thead><tr><th>家庭</th><th>计划</th><th>配额</th><th>提醒阈值</th><th>自动关阀</th><th>状态</th></tr></thead>
        <tbody>
          ${plans
            .map((plan) => {
              const home = homes.find((item) => item.id === plan.homeId);
              return `<tr><td>${home?.name || plan.homeId}</td><td>${plan.name}</td><td>${plan.quota} m³</td><td>${plan.notifyAtPercent}%</td><td>${plan.autoValve ? "开启" : "关闭"}</td><td>${plan.status}</td></tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </section>
  `);
  const form = qs("#planForm");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form));
      payload.quota = Number(payload.quota);
      payload.notifyAtPercent = Number(payload.notifyAtPercent);
      payload.autoValve = payload.autoValve === "true";
      await api("/api/plans", { method: "POST", body: JSON.stringify(payload) });
      await loadDashboard();
      renderPlans();
    });
  }
}

async function renderUsers() {
  const data = await api("/api/users");
  renderShell(`
    <div class="topbar">
      <div class="page-title">
        <h1>用户管理</h1>
        <p>后台账号、角色与状态维护。</p>
      </div>
    </div>
    <form class="panel form-grid" id="userForm">
      <label>姓名<input name="name" required /></label>
      <label>账号<input name="account" required /></label>
      <label>手机号<input name="phone" /></label>
      <label>角色<select name="role"><option value="resident">家庭用户</option><option value="operator">运维员</option><option value="admin">管理员</option></select></label>
      <label>初始密码<input name="password" value="Water@123" /></label>
      <button type="submit">新增用户</button>
    </form>
    <section class="table-wrap">
      <table>
        <thead><tr><th>姓名</th><th>账号</th><th>角色</th><th>电话</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          ${data.users
            .map(
              (user) => `<tr>
                <td>${user.name}</td><td>${user.account}</td><td>${ROLE_LABEL[user.role]}</td><td>${user.phone}</td><td>${user.status}</td>
                <td><button class="secondary" data-user="${user.id}" data-status="${user.status === "active" ? "disabled" : "active"}">${user.status === "active" ? "停用" : "启用"}</button></td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </section>
  `);
  qs("#userForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))
    });
    renderUsers();
  });
  document.querySelectorAll("[data-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/users/${button.dataset.user}`, {
        method: "PATCH",
        body: JSON.stringify({ status: button.dataset.status })
      });
      renderUsers();
    });
  });
}

function renderApp() {
  if (state.view === "homes") return renderHomes();
  if (state.view === "alerts") return renderAlerts();
  if (state.view === "alertDetail") return renderAlertDetail();
  if (state.view === "plans") return renderPlans();
  if (state.view === "users" && state.user.role === "admin") return renderUsers();
  renderDashboard();
}

async function bootstrap() {
  if (!state.token) return renderLogin();
  try {
    const me = await api("/api/me");
    state.user = me.user;
    await loadDashboard();
    renderApp();
  } catch (error) {
    localStorage.removeItem("water_token");
    state.token = null;
    renderLogin();
  }
}

bootstrap();
