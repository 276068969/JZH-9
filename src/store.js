const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_DATA_FILE = path.join(__dirname, "..", "data", "store.json");

const ALERT_STATUSES = ["open", "processing", "resolved", "disputed"];
const HISTORY_TYPES = ["handle", "objection"];
const ACCEPTANCE_TYPES = ["default", "manual", "none"];
const DEFAULT_ACCEPTANCE_DAYS = 14;

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(candidate));
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

function todayOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function seedData() {
  const users = [
    {
      id: "usr_admin",
      name: "系统管理员",
      account: "admin",
      role: "admin",
      phone: "13800000001",
      status: "active",
      passwordHash: hashPassword("Admin@123")
    },
    {
      id: "usr_operator",
      name: "运维值班员",
      account: "operator",
      role: "operator",
      phone: "13800000002",
      status: "active",
      passwordHash: hashPassword("Ops@12345")
    },
    {
      id: "usr_resident",
      name: "家庭成员",
      account: "resident",
      role: "resident",
      phone: "13800000003",
      status: "active",
      passwordHash: hashPassword("Home@123")
    }
  ];

  const homes = [
    {
      id: "home_101",
      name: "晴川小区 3-101",
      ownerId: "usr_resident",
      address: "晴川小区 3 栋 101",
      memberCount: 4,
      monthlyQuota: 18,
      pressureMin: 0.18,
      pressureMax: 0.42
    },
    {
      id: "home_202",
      name: "云岸花园 8-202",
      ownerId: "usr_operator",
      address: "云岸花园 8 栋 202",
      memberCount: 2,
      monthlyQuota: 12,
      pressureMin: 0.16,
      pressureMax: 0.40
    }
  ];

  const devices = [
    {
      id: "dev_meter_101",
      homeId: "home_101",
      name: "101 智能水表",
      type: "meter",
      status: "online",
      valve: "open",
      battery: 86,
      installedAt: "2025-09-01",
      token: generateDeviceToken("dev_meter_101")
    },
    {
      id: "dev_valve_101",
      homeId: "home_101",
      name: "101 入户阀门",
      type: "valve",
      status: "online",
      valve: "open",
      battery: 79,
      installedAt: "2025-09-01",
      token: generateDeviceToken("dev_valve_101")
    },
    {
      id: "dev_meter_202",
      homeId: "home_202",
      name: "202 智能水表",
      type: "meter",
      status: "online",
      valve: "open",
      battery: 67,
      installedAt: "2025-11-15",
      token: generateDeviceToken("dev_meter_202")
    }
  ];

  const readings = [];
  for (let day = -29; day <= 0; day += 1) {
    const isWeekend = [0, 6].includes(new Date(todayOffset(day)).getDay());
    const base101 = isWeekend ? 0.72 : 0.56;
    const base202 = isWeekend ? 0.48 : 0.36;
    readings.push({
      id: randomId("rd"),
      homeId: "home_101",
      deviceId: "dev_meter_101",
      at: todayOffset(day),
      usage: Number((base101 + Math.sin(day) * 0.06 + (day === -2 ? 0.9 : 0)).toFixed(2)),
      pressure: Number((0.28 + Math.sin(day / 2) * 0.04).toFixed(2)),
      temperature: Number((18 + Math.cos(day) * 2).toFixed(1))
    });
    readings.push({
      id: randomId("rd"),
      homeId: "home_202",
      deviceId: "dev_meter_202",
      at: todayOffset(day),
      usage: Number((base202 + Math.cos(day) * 0.04).toFixed(2)),
      pressure: Number((0.24 + Math.cos(day / 3) * 0.03).toFixed(2)),
      temperature: Number((17 + Math.sin(day) * 1.4).toFixed(1))
    });
  }

  return {
    users,
    homes,
    devices,
    readings,
    alerts: [
      {
        id: "alt_leak_101",
        homeId: "home_101",
        level: "high",
        type: "leak",
        title: "疑似连续微漏",
        detail: "夜间低流量持续 4 小时，建议检查马桶水箱与厨房接口。",
        status: "open",
        createdAt: todayOffset(-1),
        handledBy: null,
        handledAt: null,
        resolvedAt: null,
        acceptance: {
          accepted: false,
          acceptedAt: null,
          acceptanceType: "none"
        },
        history: []
      },
      {
        id: "alt_pressure_202",
        homeId: "home_202",
        level: "medium",
        type: "pressure",
        title: "压力偏低",
        detail: "过去 24 小时平均压力低于家庭设定阈值。",
        status: "processing",
        createdAt: todayOffset(-3),
        handledBy: "usr_operator",
        handledAt: todayOffset(-2),
        resolvedAt: null,
        acceptance: {
          accepted: false,
          acceptedAt: null,
          acceptanceType: "none"
        },
        history: [
          {
            id: "his_seed_pressure_1",
            type: "handle",
            status: "processing",
            note: "已通知住户观察压力变化，并安排明天上门检查入户阀门与过滤网。",
            handledBy: "usr_operator",
            handledAt: todayOffset(-2)
          }
        ]
      }
    ],
    plans: [
      {
        id: "plan_101",
        homeId: "home_101",
        name: "节水守护",
        quota: 18,
        autoValve: true,
        notifyAtPercent: 80,
        status: "enabled"
      }
    ],
    commands: [
      {
        id: "cmd_seed_1",
        homeId: "home_101",
        deviceId: "dev_valve_101",
        action: "close_valve",
        reason: "leak_detected",
        actorId: "usr_admin",
        status: "success",
        createdAt: todayOffset(-5)
      },
      {
        id: "cmd_seed_2",
        homeId: "home_101",
        deviceId: "dev_valve_101",
        action: "open_valve",
        reason: "console_control",
        actorId: "usr_operator",
        status: "success",
        createdAt: todayOffset(-4)
      },
      {
        id: "cmd_seed_3",
        homeId: "home_202",
        deviceId: "dev_meter_202",
        action: "close_valve",
        reason: "quota_exceeded",
        actorId: "usr_admin",
        status: "success",
        createdAt: todayOffset(-3)
      },
      {
        id: "cmd_seed_4",
        homeId: "home_101",
        deviceId: "dev_valve_101",
        action: "close_valve",
        reason: "alarm_triggered",
        actorId: "usr_operator",
        status: "issued",
        createdAt: todayOffset(-1)
      },
      {
        id: "cmd_seed_5",
        homeId: "home_202",
        deviceId: "dev_meter_202",
        action: "open_valve",
        reason: "console_control",
        actorId: "usr_admin",
        status: "failed",
        createdAt: todayOffset(-2)
      }
    ],
    settings: {
      initialized: true,
      migrationVersion: 1
    }
  };
}

function generateDeviceToken(deviceId) {
  const suffix = crypto.randomBytes(8).toString("hex");
  const idPart = deviceId.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 16);
  return `dev_${idPart}_${suffix}`;
}

function runMigrations(data, store) {
  const currentVersion = data.settings?.migrationVersion || 0;
  const logs = [];
  let dirty = false;

  if (currentVersion < 1) {
    logs.push(`[MIGRATION] 执行版本 1：为设备补全认证 token`);
    const beforeCount = (data.devices || []).length;
    let migrated = 0;
    (data.devices || []).forEach((device) => {
      if (!device.token) {
        device.token = generateDeviceToken(device.id);
        migrated += 1;
        logs.push(`[MIGRATION]   - 设备 ${device.id} (${device.name}) 已生成 token`);
      }
    });
    if (!data.settings) data.settings = {};
    data.settings.migrationVersion = 1;
    if (!data.settings.initialized) data.settings.initialized = true;
    logs.push(`[MIGRATION] 版本 1 完成：共 ${beforeCount} 个设备，补全 ${migrated} 个 token`);
    dirty = true;
  }

  if (currentVersion < 2) {
    logs.push(`[MIGRATION] 执行版本 2：为告警补全处理历史 history 字段`);
    let backfilled = 0;
    (data.alerts || []).forEach((alert) => {
      if (!Array.isArray(alert.history)) {
        alert.history = [];
        backfilled += 1;
      }
      if (alert.handledBy === undefined) alert.handledBy = null;
      if (alert.handledAt === undefined) alert.handledAt = null;
    });
    if (!data.settings) data.settings = {};
    data.settings.migrationVersion = 2;
    logs.push(`[MIGRATION] 版本 2 完成：补全 ${backfilled} 个告警的 history`);
    dirty = true;
  }

  if (currentVersion < 3) {
    logs.push(`[MIGRATION] 执行版本 3：为告警补全异议、解决时间、接受状态与历史类型字段`);
    let backfilled = 0;
    (data.alerts || []).forEach((alert) => {
      if (alert.resolvedAt === undefined) alert.resolvedAt = null;
      if (!alert.acceptance || typeof alert.acceptance !== "object") {
        alert.acceptance = {
          accepted: false,
          acceptedAt: null,
          acceptanceType: "none"
        };
      } else {
        if (alert.acceptance.accepted === undefined) alert.acceptance.accepted = false;
        if (alert.acceptance.acceptedAt === undefined) alert.acceptance.acceptedAt = null;
        if (!ACCEPTANCE_TYPES.includes(alert.acceptance.acceptanceType)) {
          alert.acceptance.acceptanceType = "none";
        }
      }
      (alert.history || []).forEach((entry) => {
        if (!entry.type || !HISTORY_TYPES.includes(entry.type)) {
          entry.type = "handle";
        }
      });
      backfilled += 1;
    });
    if (!data.settings) data.settings = {};
    data.settings.migrationVersion = 3;
    logs.push(`[MIGRATION] 版本 3 完成：补全 ${backfilled} 个告警的闭环追踪字段`);
    dirty = true;
  }

  if (currentVersion < 4) {
    logs.push(`[MIGRATION] 执行版本 4：为控制记录补充示例数据`);
    if (!Array.isArray(data.commands)) {
      data.commands = [];
    }
    if (data.commands.length === 0 && data.homes?.length && data.users?.length) {
      const adminId = data.users.find((u) => u.role === "admin")?.id;
      const operatorId = data.users.find((u) => u.role === "operator")?.id;
      const valveDevice1 = data.devices?.find((d) => d.homeId === "home_101" && d.type === "valve");
      const meterDevice1 = data.devices?.find((d) => d.homeId === "home_101" && d.type === "meter");
      const meterDevice2 = data.devices?.find((d) => d.homeId === "home_202" && d.type === "meter");
      const now = Date.now();
      const sampleCommands = [
        { id: randomId("cmd"), homeId: "home_101", deviceId: valveDevice1?.id || meterDevice1?.id, action: "close_valve", reason: "leak_detected", actorId: adminId, status: "success", createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString() },
        { id: randomId("cmd"), homeId: "home_101", deviceId: valveDevice1?.id || meterDevice1?.id, action: "open_valve", reason: "console_control", actorId: operatorId, status: "success", createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString() },
        { id: randomId("cmd"), homeId: "home_202", deviceId: meterDevice2?.id, action: "close_valve", reason: "quota_exceeded", actorId: adminId, status: "success", createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString() },
        { id: randomId("cmd"), homeId: "home_101", deviceId: valveDevice1?.id || meterDevice1?.id, action: "close_valve", reason: "alarm_triggered", actorId: operatorId, status: "issued", createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString() },
        { id: randomId("cmd"), homeId: "home_202", deviceId: meterDevice2?.id, action: "open_valve", reason: "console_control", actorId: adminId, status: "failed", createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString() }
      ];
      data.commands = sampleCommands.filter((c) => c.deviceId);
      logs.push(`[MIGRATION] 版本 4 完成：新增 ${data.commands.length} 条示例控制记录`);
    }
    if (!data.settings) data.settings = {};
    data.settings.migrationVersion = 4;
    dirty = true;
  }

  if (dirty && logs.length > 0) {
    if (!data._migrations) data._migrations = [];
    data._migrations.push({
      at: new Date().toISOString(),
      from: currentVersion,
      to: data.settings.migrationVersion,
      logs: [...logs]
    });
    logs.forEach((line) => console.log(line));
  }

  return dirty;
}

function ensureFile(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(seedData(), null, 2));
  }
}

class Store {
  constructor(file = process.env.DATA_FILE || DEFAULT_DATA_FILE) {
    this.file = file;
    ensureFile(this.file);
    this.data = this.read();
    if (!this.data.settings || !this.data.settings.initialized || !this.data.users?.length) {
      this.data = seedData();
      this.write();
    } else {
      const migrated = runMigrations(this.data, this);
      if (migrated) this.write();
    }
  }

  read() {
    return JSON.parse(fs.readFileSync(this.file, "utf8"));
  }

  write() {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  publicUser(user) {
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return safe;
  }

  findUserByAccount(account) {
    return this.data.users.find((user) => user.account === account);
  }

  createUser(input) {
    const exists = this.findUserByAccount(input.account);
    if (exists) {
      const error = new Error("账号已存在");
      error.status = 409;
      throw error;
    }
    const user = {
      id: randomId("usr"),
      name: input.name,
      account: input.account,
      role: input.role || "resident",
      phone: input.phone || "",
      status: input.status || "active",
      passwordHash: hashPassword(input.password || "Water@123")
    };
    this.data.users.push(user);
    this.write();
    return this.publicUser(user);
  }

  updateUser(id, input) {
    const user = this.data.users.find((item) => item.id === id);
    if (!user) return null;
    ["name", "phone", "role", "status"].forEach((key) => {
      if (input[key] !== undefined) user[key] = input[key];
    });
    if (input.password) user.passwordHash = hashPassword(input.password);
    this.write();
    return this.publicUser(user);
  }

  createHome(input) {
    const name = String(input.name || "").trim();
    if (!name) {
      const error = new Error("家庭名称不能为空");
      error.status = 400;
      throw error;
    }
    const ownerId = String(input.ownerId || "").trim();
    if (!ownerId) {
      const error = new Error("请指定家庭负责人");
      error.status = 400;
      throw error;
    }
    const owner = this.data.users.find((item) => item.id === ownerId);
    if (!owner) {
      const error = new Error("负责人用户不存在");
      error.status = 400;
      throw error;
    }
    const memberCount = Number(input.memberCount);
    if (input.memberCount !== undefined && (isNaN(memberCount) || memberCount < 0 || memberCount > 100)) {
      const error = new Error("成员数数值无效");
      error.status = 400;
      throw error;
    }
    const monthlyQuota = Number(input.monthlyQuota);
    if (input.monthlyQuota !== undefined && (isNaN(monthlyQuota) || monthlyQuota < 0 || monthlyQuota > 10000)) {
      const error = new Error("月配额数值无效");
      error.status = 400;
      throw error;
    }
    const pressureMin = Number(input.pressureMin);
    if (input.pressureMin !== undefined && (isNaN(pressureMin) || pressureMin < 0 || pressureMin > 2)) {
      const error = new Error("压力下限数值无效");
      error.status = 400;
      throw error;
    }
    const pressureMax = Number(input.pressureMax);
    if (input.pressureMax !== undefined && (isNaN(pressureMax) || pressureMax < 0 || pressureMax > 2)) {
      const error = new Error("压力上限数值无效");
      error.status = 400;
      throw error;
    }
    if (
      input.pressureMin !== undefined &&
      input.pressureMax !== undefined &&
      pressureMin > pressureMax
    ) {
      const error = new Error("压力下限不能大于压力上限");
      error.status = 400;
      throw error;
    }

    const home = {
      id: randomId("home"),
      name,
      ownerId,
      address: String(input.address || "").trim(),
      memberCount: input.memberCount !== undefined ? memberCount : 2,
      monthlyQuota: input.monthlyQuota !== undefined ? monthlyQuota : 15,
      pressureMin: input.pressureMin !== undefined ? pressureMin : 0.16,
      pressureMax: input.pressureMax !== undefined ? pressureMax : 0.4
    };
    this.data.homes.push(home);
    this.write();
    return home;
  }

  updateHome(id, input) {
    const home = this.data.homes.find((item) => item.id === id);
    if (!home) return null;

    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) {
        const error = new Error("家庭名称不能为空");
        error.status = 400;
        throw error;
      }
      home.name = name;
    }
    if (input.ownerId !== undefined) {
      const ownerId = String(input.ownerId).trim();
      if (!ownerId) {
        const error = new Error("负责人不能为空");
        error.status = 400;
        throw error;
      }
      const owner = this.data.users.find((item) => item.id === ownerId);
      if (!owner) {
        const error = new Error("负责人用户不存在");
        error.status = 400;
        throw error;
      }
      home.ownerId = ownerId;
    }
    if (input.address !== undefined) {
      home.address = String(input.address || "").trim();
    }
    if (input.memberCount !== undefined) {
      const memberCount = Number(input.memberCount);
      if (isNaN(memberCount) || memberCount < 0 || memberCount > 100) {
        const error = new Error("成员数数值无效");
        error.status = 400;
        throw error;
      }
      home.memberCount = memberCount;
    }
    if (input.monthlyQuota !== undefined) {
      const monthlyQuota = Number(input.monthlyQuota);
      if (isNaN(monthlyQuota) || monthlyQuota < 0 || monthlyQuota > 10000) {
        const error = new Error("月配额数值无效");
        error.status = 400;
        throw error;
      }
      home.monthlyQuota = monthlyQuota;
    }
    if (input.pressureMin !== undefined || input.pressureMax !== undefined) {
      const nextMin = input.pressureMin !== undefined ? Number(input.pressureMin) : home.pressureMin;
      const nextMax = input.pressureMax !== undefined ? Number(input.pressureMax) : home.pressureMax;
      if (isNaN(nextMin) || nextMin < 0 || nextMin > 2) {
        const error = new Error("压力下限数值无效");
        error.status = 400;
        throw error;
      }
      if (isNaN(nextMax) || nextMax < 0 || nextMax > 2) {
        const error = new Error("压力上限数值无效");
        error.status = 400;
        throw error;
      }
      if (nextMin > nextMax) {
        const error = new Error("压力下限不能大于压力上限");
        error.status = 400;
        throw error;
      }
      if (input.pressureMin !== undefined) home.pressureMin = nextMin;
      if (input.pressureMax !== undefined) home.pressureMax = nextMax;
    }

    this.write();
    return home;
  }

  createCommand(input, actorId) {
    const command = {
      id: randomId("cmd"),
      homeId: input.homeId,
      deviceId: input.deviceId,
      action: input.action,
      reason: input.reason || "manual",
      actorId,
      status: "issued",
      createdAt: new Date().toISOString()
    };
    this.data.commands.unshift(command);
    const device = this.data.devices.find((item) => item.id === input.deviceId);
    if (device && ["open", "closed"].includes(input.valve)) {
      device.valve = input.valve;
    }
    this.write();
    return command;
  }

  upsertPlan(input) {
    let plan = this.data.plans.find((item) => item.id === input.id || item.homeId === input.homeId);
    if (!plan) {
      plan = {
        id: randomId("plan"),
        homeId: input.homeId,
        name: input.name || "家庭用水计划",
        quota: Number(input.quota || 10),
        autoValve: Boolean(input.autoValve),
        notifyAtPercent: Number(input.notifyAtPercent || 80),
        status: input.status || "enabled"
      };
      this.data.plans.push(plan);
    } else {
      ["name", "quota", "autoValve", "notifyAtPercent", "status"].forEach((key) => {
        if (input[key] !== undefined) plan[key] = input[key];
      });
    }
    this.write();
    return plan;
  }

  getAlert(alertId) {
    return this.data.alerts.find((item) => item.id === alertId) || null;
  }

  handleAlert(alertId, input, actor) {
    const alert = this.data.alerts.find((item) => item.id === alertId);
    if (!alert) return null;
    const note = String(input.note || "").trim();
    if (!note) {
      const error = new Error("请填写处理说明");
      error.status = 400;
      throw error;
    }
    const status = input.status ? String(input.status) : alert.status;
    if (!ALERT_STATUSES.includes(status)) {
      const error = new Error("告警状态无效");
      error.status = 400;
      throw error;
    }
    const now = new Date().toISOString();
    alert.status = status;
    alert.handledBy = actor.id;
    alert.handledAt = now;
    if (status === "resolved") {
      alert.resolvedAt = now;
    }
    if (!Array.isArray(alert.history)) alert.history = [];
    alert.history.push({
      id: randomId("his"),
      type: "handle",
      status,
      note,
      handledBy: actor.id,
      handledAt: now
    });
    this.write();
    return alert;
  }

  addObjection(alertId, input, actor) {
    const alert = this.data.alerts.find((item) => item.id === alertId);
    if (!alert) return null;
    const note = String(input.note || "").trim();
    if (!note) {
      const error = new Error("请填写异议说明");
      error.status = 400;
      throw error;
    }
    if (!alert.acceptance) {
      alert.acceptance = { accepted: false, acceptedAt: null, acceptanceType: "none" };
    }
    if (alert.acceptance.accepted) {
      const error = new Error("告警已确认接受，无法再提出异议");
      error.status = 409;
      throw error;
    }
    const now = new Date().toISOString();
    alert.status = "disputed";
    if (!Array.isArray(alert.history)) alert.history = [];
    alert.history.push({
      id: randomId("his"),
      type: "objection",
      status: "disputed",
      note,
      handledBy: actor.id,
      handledAt: now
    });
    this.write();
    return alert;
  }

  computeAcceptance(alert) {
    if (!alert) return { accepted: false, acceptedAt: null, acceptanceType: "none", daysUntilAccept: null };
    const acceptance = alert.acceptance || { accepted: false, acceptedAt: null, acceptanceType: "none" };
    if (acceptance.accepted) {
      return { ...acceptance, daysUntilAccept: 0 };
    }
    if (!alert.resolvedAt) {
      return { ...acceptance, daysUntilAccept: null };
    }
    const resolvedDate = new Date(alert.resolvedAt);
    const now = new Date();
    const diffMs = now.getTime() - resolvedDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const daysUntilAccept = Math.max(0, DEFAULT_ACCEPTANCE_DAYS - diffDays);
    if (diffDays >= DEFAULT_ACCEPTANCE_DAYS) {
      acceptance.accepted = true;
      acceptance.acceptedAt = new Date(resolvedDate.getTime() + DEFAULT_ACCEPTANCE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      acceptance.acceptanceType = "default";
      alert.acceptance = acceptance;
      if (!Array.isArray(alert.history)) alert.history = [];
      alert.history.push({
        id: randomId("his"),
        type: "handle",
        status: alert.status,
        note: `告警处理完成已超过 ${DEFAULT_ACCEPTANCE_DAYS} 天，系统默认接受处理结果。`,
        handledBy: null,
        handledAt: acceptance.acceptedAt
      });
      this.write();
      return { ...acceptance, daysUntilAccept: 0 };
    }
    return { ...acceptance, daysUntilAccept: Math.ceil(daysUntilAccept) };
  }

  publicAlert(alert, { withHistory = true } = {}) {
    if (!alert) return null;
    const userName = (id) =>
      id ? (this.data.users.find((item) => item.id === id)?.name || "未知用户") : null;
    const acceptance = this.computeAcceptance(alert);
    const base = {
      id: alert.id,
      homeId: alert.homeId,
      level: alert.level,
      type: alert.type,
      title: alert.title,
      detail: alert.detail,
      status: alert.status,
      createdAt: alert.createdAt,
      handledBy: alert.handledBy || null,
      handledAt: alert.handledAt || null,
      handledByName: userName(alert.handledBy),
      resolvedAt: alert.resolvedAt || null,
      acceptance: {
        accepted: acceptance.accepted,
        acceptedAt: acceptance.acceptedAt,
        acceptanceType: acceptance.acceptanceType,
        daysUntilAccept: acceptance.daysUntilAccept,
        defaultAcceptanceDays: DEFAULT_ACCEPTANCE_DAYS
      }
    };
    if (withHistory) {
      base.history = (alert.history || []).map((entry) => ({
        id: entry.id,
        type: entry.type || "handle",
        status: entry.status,
        note: entry.note,
        handledBy: entry.handledBy,
        handledAt: entry.handledAt,
        handledByName: userName(entry.handledBy)
      }));
    }
    return base;
  }

  findDeviceByToken(token) {
    return this.data.devices.find((device) => device.token === token);
  }

  addReading(input) {
    const device = this.data.devices.find((item) => item.id === input.deviceId);
    if (!device) {
      const error = new Error("设备不存在");
      error.status = 404;
      throw error;
    }
    if (device.type !== "meter") {
      const error = new Error("设备类型不支持读数上报");
      error.status = 400;
      throw error;
    }
    if (device.status !== "online") {
      const error = new Error("设备离线，无法接收读数");
      error.status = 409;
      throw error;
    }
    if (device.homeId !== input.homeId) {
      const error = new Error("设备归属家庭不匹配");
      error.status = 400;
      throw error;
    }

    const usage = Number(input.usage);
    const pressure = Number(input.pressure);
    const temperature = Number(input.temperature);
    const at = input.at ? new Date(input.at) : new Date();

    if (isNaN(at.getTime())) {
      const error = new Error("采集时间格式无效");
      error.status = 400;
      throw error;
    }
    if (at.getTime() > Date.now() + 60000) {
      const error = new Error("采集时间不能晚于当前时间");
      error.status = 400;
      throw error;
    }
    if (isNaN(usage) || usage < 0 || usage > 100) {
      const error = new Error("用水量数值无效");
      error.status = 400;
      throw error;
    }
    if (isNaN(pressure) || pressure < 0 || pressure > 2) {
      const error = new Error("压力数值无效");
      error.status = 400;
      throw error;
    }
    if (isNaN(temperature) || temperature < -20 || temperature > 100) {
      const error = new Error("温度数值无效");
      error.status = 400;
      throw error;
    }

    const atStr = at.toISOString();
    const minuteKey = atStr.slice(0, 16);
    const isDuplicate = this.data.readings.some(
      (r) => r.deviceId === device.id && r.at.slice(0, 16) === minuteKey
    );
    if (isDuplicate) {
      const error = new Error("重复读数，同一分钟内已存在该设备读数");
      error.status = 409;
      throw error;
    }

    const reading = {
      id: randomId("rd"),
      homeId: device.homeId,
      deviceId: device.id,
      at: atStr,
      usage: Number(usage.toFixed(2)),
      pressure: Number(pressure.toFixed(2)),
      temperature: Number(temperature.toFixed(1))
    };

    this.data.readings.push(reading);
    this.write();
    return reading;
  }
}

module.exports = {
  Store,
  hashPassword,
  verifyPassword,
  randomId,
  seedData
};
