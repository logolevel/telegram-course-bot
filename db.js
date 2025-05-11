const Database = require('better-sqlite3');
const db = new Database('bot.db');

// Создание таблицы, если нет
db.prepare(`
  CREATE TABLE IF NOT EXISTS user_progress (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    step1_completed INTEGER DEFAULT 0,
    step2_completed INTEGER DEFAULT 0,
    photo_sent INTEGER DEFAULT 0,
    step3_completed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();

function upsertUser(user) {
	db.prepare(`
		INSERT INTO user_progress (user_id, username)
		VALUES (?, ?)
		ON CONFLICT(user_id) DO UPDATE SET username = excluded.username
	`).run(user.id, user.username || null);
}

function updateProgress(userId, field) {
	const allowedFields = ['step1_completed', 'step2_completed', 'photo_sent', 'step3_completed'];
	if (!allowedFields.includes(field)) throw new Error('Недопустимое поле обновления');

	db.prepare(`
		UPDATE user_progress
		SET ${field} = 1,
		    updated_at = CURRENT_TIMESTAMP
		WHERE user_id = ?
	`).run(userId);
}

function getStats() {
	return db.prepare(`
		SELECT
			COUNT(*) AS total,
			SUM(step1_completed) AS step1,
			SUM(step2_completed) AS step2,
			SUM(photo_sent) AS photo,
			SUM(step3_completed) AS step3
		FROM user_progress
	`).get();
}

module.exports = {
	db,
	upsertUser,
	updateProgress,
	getStats,
};
