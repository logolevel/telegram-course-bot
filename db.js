// await pool.query(`DROP TABLE IF EXISTS user_progress`);

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * @description Инициализирует БД, создавая таблицу `users` с колонками для каждого этапа.
 * user_id становится первичным ключом, что гарантирует уникальность.
 */
async function init() {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      user_id BIGINT PRIMARY KEY,
      username VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(), -- Дата первого контакта с ботом
      pressed_start_at TIMESTAMPTZ,         -- Дата нажатия на /start
      pressed_go_at TIMESTAMPTZ,             -- Дата нажатия на "Поехали!"
      uploaded_photo_at TIMESTAMPTZ          -- Дата загрузки фото
    );
  `;
  try {
	await pool.query(`DROP TABLE IF EXISTS user_progress`);
    await pool.query(query);
    console.log('Database initialized, users table is ready.');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  }
}

/**
 * @description Отслеживает действие пользователя.
 * Если пользователь новый - создает запись. Если уже существует - обновляет поле соответствующего этапа.
 * Использует конструкцию INSERT ... ON CONFLICT (user_id) DO UPDATE.
 * @param {number} userId - ID пользователя Telegram.
 * @param {string} username - Username пользователя.
 * @param {string} stageColumn - Название колонки для обновления (например, 'pressed_go_at').
 */
async function trackUserAction(userId, username, stageColumn) {
  // `stageColumn` должен быть в "белом списке", чтобы избежать SQL-инъекций.
  const allowedColumns = ['pressed_start_at', 'pressed_go_at', 'uploaded_photo_at'];
  if (!allowedColumns.includes(stageColumn)) {
      console.error(`Invalid stage column: ${stageColumn}`);
      return;
  }

  const query = `
    INSERT INTO users (user_id, username, ${stageColumn})
    VALUES ($1, $2, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      ${stageColumn} = NOW(),
      username = EXCLUDED.username; -- Обновляем username, если он изменился
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
 * @returns {Promise<string>} Количество пользователей.
 */
async function getTotalUsers() {
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
 * @description Получает статистику по этапам воронки, считая не-пустые ячейки.
 * @param {number|null} month - Номер месяца для фильтрации (1-12).
 * @param {number|null} year - Год для фильтрации.
 * @returns {Promise<Array<{stage: string, count: number}>>}
 */
async function getStageStats(month, year) {
    let query = `
        SELECT
          COUNT(created_at) AS entered_bot,
          COUNT(pressed_start_at) AS pressed_start,
          COUNT(pressed_go_at) AS pressed_go,
          COUNT(uploaded_photo_at) AS uploaded_photo
        FROM users
    `;
    const params = [];

    // Добавляем фильтр по дате, если он указан.
    // Фильтруем по дате создания записи (первого контакта с ботом).
    if (month && year) {
        query += ` WHERE EXTRACT(MONTH FROM created_at) = $1 AND EXTRACT(YEAR FROM created_at) = $2`;
        params.push(month, year);
    }

    try {
        const res = await pool.query(query, params);
        const counts = res.rows[0];

        return [
            { stage: 'entered_bot', count: parseInt(counts.entered_bot, 10) },
            { stage: 'pressed_start', count: parseInt(counts.pressed_start, 10) },
            { stage: 'pressed_go', count: parseInt(counts.pressed_go, 10) },
            { stage: 'uploaded_photo', count: parseInt(counts.uploaded_photo, 10) },
        ];
    } catch (err) {
        console.error('Error getting stage stats:', err);
        return [
            { stage: 'entered_bot', count: 0 },
            { stage: 'pressed_start', count: 0 },
            { stage: 'pressed_go', count: 0 },
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
