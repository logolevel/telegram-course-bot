const { Pool } = require("pg");

// Инициализация пула подключений к вашей базе данных на Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * @description Инициализирует базу данных, создавая таблицу для отслеживания прогресса пользователей, если она еще не создана.
 */
async function init() {
  const query = `
    CREATE TABLE IF NOT EXISTS user_progress (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      username VARCHAR(255),
      stage VARCHAR(50) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  try {
    await pool.query(`DROP TABLE IF EXISTS user_progress`);
    await pool.query(query);
    console.log("Database initialized, user_progress table is ready.");
  } catch (err) {
    console.error("Error initializing database:", err);
    throw err;
  }
}

/**
 * @description Записывает этап, который прошел пользователь, в базу данных.
 * @param {number} userId - ID пользователя Telegram.
 * @param {string} username - Username пользователя в Telegram.
 * @param {string} stage - Название этапа (например, 'pressed_start').
 */
async function logProgress(userId, username, stage) {
  const query = `
    INSERT INTO user_progress (user_id, username, stage)
    VALUES ($1, $2, $3);
  `;
  try {
    await pool.query(query, [userId, username, stage]);
    console.log(`Logged progress for user ${userId}: ${stage}`);
  } catch (err) {
    console.error(`Error logging progress for user ${userId}:`, err);
  }
}

/**
 * @description Получает общее количество уникальных пользователей, которые взаимодействовали с ботом.
 * @returns {Promise<string>} Количество пользователей.
 */
async function getTotalUsers() {
  const query = `SELECT COUNT(DISTINCT user_id) FROM user_progress;`;
  try {
    const res = await pool.query(query);
    return res.rows[0].count;
  } catch (err) {
    console.error("Error getting total users:", err);
    return "0";
  }
}

/**
 * @description Получает статистику по этапам воронки.
 * @param {number|null} month - Номер месяца для фильтрации (1-12).
 * @param {number|null} year - Год для фильтрации.
 * @returns {Promise<Array<{stage: string, count: number}>>} Массив объектов с названием этапа и количеством пользователей.
 */
async function getStageStats(month, year) {
  const stagesOrder = [
    "entered_bot",
    "pressed_start",
    "pressed_go",
    "uploaded_photo",
  ];
  let query;
  const params = [];

  if (month && year) {
    query = `SELECT stage, COUNT(DISTINCT user_id) as count
                 FROM user_progress
                 WHERE EXTRACT(MONTH FROM created_at) = $1 AND EXTRACT(YEAR FROM created_at) = $2
                 GROUP BY stage;`;
    params.push(month, year);
  } else {
    query = `SELECT stage, COUNT(DISTINCT user_id) as count
                 FROM user_progress
                 GROUP BY stage;`;
  }

  try {
    const res = await pool.query(query, params);
    const resultsMap = new Map(
      res.rows.map((row) => [row.stage, parseInt(row.count, 10)])
    );
    // Гарантируем, что все этапы будут в итоговом результате в правильном порядке
    const finalStats = stagesOrder.map((stage) => ({
      stage,
      count: resultsMap.get(stage) || 0,
    }));
    return finalStats;
  } catch (err) {
    console.error("Error getting stage stats:", err);
    return stagesOrder.map((stage) => ({ stage, count: 0 }));
  }
}

module.exports = {
  init,
  logProgress,
  getTotalUsers,
  getStageStats,
};
