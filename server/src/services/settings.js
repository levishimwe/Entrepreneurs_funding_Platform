const { Setting } = require('../models');

// Administrator-maintained configuration values (e.g. similarity threshold).
async function getSetting(key, fallback) {
  const row = await Setting.findByPk(key);
  return row ? row.value : fallback;
}

async function setSetting(key, value) {
  await Setting.upsert({ key, value });
  return value;
}

module.exports = { getSetting, setSetting };
