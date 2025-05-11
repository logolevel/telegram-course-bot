const { Pool } = require('pg');

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: { rejectUnauthorized: false },
});



// Инициализация таблицы
async function init() {
	await pool.query(`DROP TABLE IF EXISTS user_progress`);

	await pool.query(`
    CREATE TABLE IF NOT EXISTS user_progress (
      user_id BIGINT PRIMARY KEY,
      username TEXT,
      step INTEGER DEFAULT 1,
      sent_photo BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
	console.log('✅ PostgreSQL: таблица user_progress готова');
}

// Создание или обновление пользователя
async function upsertUser(userId, username) {
	await pool.query(`
    INSERT INTO user_progress (user_id, username)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username;
  `, [userId, username]);
}

// Обновление шага пользователя
async function updateStep(userId, step) {
	await pool.query(`
    UPDATE user_progress
    SET step = $1, updated_at = NOW()
    WHERE user_id = $2;
  `, [step, userId]);
}

// Отметить, что пользователь отправил фото
async function markPhotoSent(userId) {
	await pool.query(`
    UPDATE user_progress
    SET sent_photo = TRUE, updated_at = NOW()
    WHERE user_id = $1;
  `, [userId]);
}

// Получить аналитику
async function getStats() {
	const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE step >= 1) AS step1,
      COUNT(*) FILTER (WHERE step >= 2) AS step2,
      COUNT(*) FILTER (WHERE step >= 3) AS step3,
      COUNT(*) FILTER (WHERE sent_photo = TRUE) AS sent_photos
    FROM user_progress;
  `);
	return result.rows[0];
}

module.exports = {
	init,
	upsertUser,
	updateStep,
	markPhotoSent,
	getStats
};
