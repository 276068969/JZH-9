const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_DATA_FILE = path.join(__dirname, "..", "data", "store.json");

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
        createdAt: todayOffset(-1)
      },
      {
        id: "alt_pressure_202",
        homeId: "home_202",
        level: "medium",
        type: "pressure",
        title: "压力偏低",
        detail: "过去 24 小时平均压力低于家庭设定阈值。",
        status: "processing",
        createdAt: todayOffset(-3)
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
    commands: [],
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
