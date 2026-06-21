function visibleHomeIds(data, user) {
  if (["admin", "operator"].includes(user.role)) {
    return data.homes.map((home) => home.id);
  }
  return data.homes.filter((home) => home.ownerId === user.id).map((home) => home.id);
}

function monthUsage(readings) {
  const now = new Date();
  return readings
    .filter((reading) => {
      const at = new Date(reading.at);
      return at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();
    })
    .reduce((sum, reading) => sum + Number(reading.usage || 0), 0);
}

function buildDashboard(data, user, filterHomeIds) {
  const visibleIds = visibleHomeIds(data, user);
  const homeIds = filterHomeIds && filterHomeIds.length
    ? visibleIds.filter((id) => filterHomeIds.includes(id))
    : visibleIds;
  const homes = data.homes.filter((home) => homeIds.includes(home.id));
  const readings = data.readings.filter((reading) => homeIds.includes(reading.homeId));
  const alerts = data.alerts.filter((alert) => homeIds.includes(alert.homeId));
  const devices = data.devices.filter((device) => homeIds.includes(device.homeId));
  const usage = monthUsage(readings);
  const quota = homes.reduce((sum, home) => sum + Number(home.monthlyQuota || 0), 0);

  const recentDaily = readings
    .reduce((map, reading) => {
      const day = reading.at.slice(5, 10);
      map.set(day, Number((Number(map.get(day) || 0) + Number(reading.usage || 0)).toFixed(2)));
      return map;
    }, new Map());

  const dailySeries = Array.from(recentDaily.entries())
    .slice(-14)
    .map(([date, value]) => ({ date, value }));

  const riskScore = Math.min(
    99,
    Math.round(
      alerts.filter((alert) => alert.status !== "resolved").length * 18 +
        devices.filter((device) => device.status !== "online").length * 12 +
        Math.max(0, usage - quota) * 3
    )
  );

  return {
    cards: {
      homes: homes.length,
      devices: devices.length,
      monthUsage: Number(usage.toFixed(2)),
      quota,
      riskScore
    },
    dailySeries,
    alerts: alerts.slice(0, 8),
    homes,
    devices,
    plans: data.plans.filter((plan) => homeIds.includes(plan.homeId)),
    commands: data.commands.filter((command) => homeIds.includes(command.homeId)).slice(0, 12)
  };
}

function buildReport(data, homeId) {
  const home = data.homes.find((item) => item.id === homeId);
  if (!home) return null;
  const readings = data.readings.filter((reading) => reading.homeId === homeId);
  const usage = monthUsage(readings);
  const peak = readings.reduce((max, item) => (item.usage > max.usage ? item : max), readings[0] || { usage: 0 });
  const avgPressure =
    readings.length === 0
      ? 0
      : readings.reduce((sum, item) => sum + Number(item.pressure || 0), 0) / readings.length;
  const leakRisk = readings.some((item) => item.usage > 1.2) ? "high" : usage > home.monthlyQuota * 0.8 ? "medium" : "low";

  return {
    home,
    monthUsage: Number(usage.toFixed(2)),
    quota: home.monthlyQuota,
    quotaPercent: home.monthlyQuota ? Math.round((usage / home.monthlyQuota) * 100) : 0,
    avgPressure: Number(avgPressure.toFixed(2)),
    peakDay: peak ? peak.at : null,
    peakUsage: Number((peak?.usage || 0).toFixed(2)),
    leakRisk,
    savingAdvice:
      leakRisk === "high"
        ? "建议立即检查夜间持续流量，并临时开启自动关阀保护。"
        : "建议保持分时用水提醒，优先关注洗浴与厨房高峰时段。"
  };
}

module.exports = {
  visibleHomeIds,
  buildDashboard,
  buildReport
};
