// await pool.query(`DROP TABLE IF EXISTS user_progress`);
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * @description Инициализирует БД, создавая таблицу `users` с колонками для каждого этапа.
 * Добавлена колонка watched_video_1_at.
 */
async function init() {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      user_id BIGINT PRIMARY KEY,
      username VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      pressed_start_at TIMESTAMPTZ,
      pressed_go_at TIMESTAMPTZ,
      watched_video_1_at TIMESTAMPTZ,       -- НОВАЯ КОЛОНКА
      uploaded_photo_at TIMESTAMPTZ
    );
  `;
  try {
	await pool.query(`DROP TABLE IF EXISTS users`);
    await pool.query(query);
    console.log('Database initialized, users table is ready.');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  }
}

/**
 * @description Отслеживает действие пользователя.
 */
async function trackUserAction(userId, username, stageColumn) {
  // Добавили новый этап в "белый список"
  const allowedColumns = ['pressed_start_at', 'pressed_go_at', 'watched_video_1_at', 'uploaded_photo_at'];
  if (!allowedColumns.includes(stageColumn)) {
      console.error(`Invalid stage column: ${stageColumn}`);
      return;
  }

  const query = `
    INSERT INTO users (user_id, username, ${stageColumn})
    VALUES ($1, $2, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      ${stageColumn} = NOW(),
      username = EXCLUDED.username;
  `;

  try {
    await pool.query(query, [userId, username]);
    console.log(`Tracked action '${stageColumn}' for user ${userId}`);
  } catch (err) {
    console.error(`Error tracking action for user ${userId}:`, err);
  }
}

/**
 * @description Получает общее количество пользователей.
 */
async function getTotalUsers() {
    // ... код без изменений ...
    const query = `SELECT COUNT(user_id) FROM users;`;
    try {
        const res = await pool.query(query);
        return res.rows[0].count;
    } catch (err) {
        console.error('Error getting total users:', err);
        return "0";
    }
}

/**
 * @description Получает статистику по этапам воронки.
 */
async function getStageStats(month, year) {
    // Добавили подсчет нового этапа
    let query = `
        SELECT
          COUNT(created_at) AS entered_bot,
          COUNT(pressed_start_at) AS pressed_start,
          COUNT(pressed_go_at) AS pressed_go,
          COUNT(watched_video_1_at) AS watched_video_1,
          COUNT(uploaded_photo_at) AS uploaded_photo
        FROM users
    `;
    const params = [];

    if (month && year) {
        query += ` WHERE EXTRACT(MONTH FROM created_at) = $1 AND EXTRACT(YEAR FROM created_at) = $2`;
        params.push(month, year);
    }

    try {
        const res = await pool.query(query, params);
        const counts = res.rows[0];

        // Добавили новый этап в итоговый массив для статистики
        return [
            { stage: 'entered_bot', count: parseInt(counts.entered_bot, 10) },
            { stage: 'pressed_start', count: parseInt(counts.pressed_start, 10) },
            { stage: 'pressed_go', count: parseInt(counts.pressed_go, 10) },
            { stage: 'watched_video_1', count: parseInt(counts.watched_video_1, 10) },
            { stage: 'uploaded_photo', count: parseInt(counts.uploaded_photo, 10) },
        ];
    } catch (err) {
        console.error('Error getting stage stats:', err);
        return [
            { stage: 'entered_bot', count: 0 },
            { stage: 'pressed_start', count: 0 },
            { stage: 'pressed_go', count: 0 },
            { stage: 'watched_video_1', count: 0 },
            { stage: 'uploaded_photo', count: 0 },
        ];
    }
}

module.exports = {
  init,
  trackUserAction,
  getTotalUsers,
  getStageStats,
};
