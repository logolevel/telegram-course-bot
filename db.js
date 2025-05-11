const { Pool } = require('pg');

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: {
		rejectUnauthorized: false
	}
});

async function init() {
	await pool.query(`
    CREATE TABLE IF NOT EXISTS user_progress (
      user_id BIGINT PRIMARY KEY,
      username TEXT,
      step INTEGER DEFAULT 0,
      sent_photo BOOLEAN DEFAULT FALSE
    );
  `);
}

async function upsertUser(user_id, username) {
	await pool.query(`
    INSERT INTO user_progress (user_id, username)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username;
  `, [user_id, username]);
}

async function updateProgress(user_id, step = null, sent_photo = null) {
	const updates = [];
	const values = [user_id];

	if (step !== null) {
		values.push(step);
		updates.push(`step = $${values.length}`);
	}
	if (sent_photo !== null) {
		values.push(sent_photo);
		updates.push(`sent_photo = $${values.length}`);
	}

	if (updates.length > 0) {
		await pool.query(
			`UPDATE user_progress SET ${updates.join(', ')} WHERE user_id = $1`,
			values
		);
	}
}

async function getStats() {
	const total = await pool.query(`SELECT COUNT(*) FROM user_progress`);
	const step1 = await pool.query(`SELECT COUNT(*) FROM user_progress WHERE step >= 1`);
	const step2 = await pool.query(`SELECT COUNT(*) FROM user_progress WHERE step >= 2`);
	const step3 = await pool.query(`SELECT COUNT(*) FROM user_progress WHERE step >= 3`);
	const photos = await pool.query(`SELECT COUNT(*) FROM user_progress WHERE sent_photo = true`);

	return {
		total: Number(total.rows[0].count),
		step1: Number(step1.rows[0].count),
		step2: Number(step2.rows[0].count),
		step3: Number(step3.rows[0].count),
		photos: Number(photos.rows[0].count),
	};
}

module.exports = {
	init,
	upsertUser,
	updateProgress,
	getStats,
};
