const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * @description Инициализирует БД.
 */
async function init() {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      user_id BIGINT PRIMARY KEY,
      username VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      pressed_start_at TIMESTAMPTZ,
      pressed_go_at TIMESTAMPTZ,
      watched_video_1_at TIMESTAMPTZ,
      uploaded_photo_at TIMESTAMPTZ,
      photo_file_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
      phone_number VARCHAR(20),
      last_photo_message_id BIGINT
    );
  `;
  try {
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
  } catch (err) {
    console.error(`Error tracking action for user ${userId}:`, err);
  }
}

/**
 * @description Добавляет номер телефона пользователя.
 */
async function addPhoneNumber(userId, phoneNumber) {
    const query = `UPDATE users SET phone_number = $1 WHERE user_id = $2`;
    try {
        await pool.query(query, [phoneNumber, userId]);
    } catch(err) {
        console.error(`Error adding phone number for user ${userId}:`, err);
    }
}

/**
 * @description Получает данные пользователя по его ID.
 */
async function getUser(userId) {
    const query = `SELECT * FROM users WHERE user_id = $1`;
    try {
        const res = await pool.query(query, [userId]);
        return res.rows[0] || null;
    } catch (err) {
        console.error('Error getting user:', err);
        return null;
    }
}

/**
 * @description Добавляет file_id фотографии.
 */
async function addPhoto(userId, photoFileId) {
    const query = `
        UPDATE users
        SET photo_file_ids = array_append(photo_file_ids, $2)
        WHERE user_id = $1;
    `;
    try {
        await pool.query(query, [userId, photoFileId]);
    } catch(err) {
        console.error(`Error adding photo for user ${userId}:`, err);
    }
}

/**
 * @description Сохраняет ID сообщения, отправленного админу
 */
async function setLastPhotoMessageId(userId, messageId) {
    const query = `UPDATE users SET last_photo_message_id = $1 WHERE user_id = $2`;
    try {
        await pool.query(query, [messageId, userId]);
    } catch (err) {
        console.error(`Error setting last_photo_message_id for user ${userId}:`, err);
    }
}

async function getAllUsers() {
    const query = `SELECT * FROM users ORDER BY created_at DESC;`;
    try {
        const res = await pool.query(query);
        return res.rows;
    } catch (err) {
        console.error('Error getting all users:', err);
        return [];
    }
}

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

async function getStageStats(month, year) {
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
        return [
            { stage: 'entered_bot', count: parseInt(counts.entered_bot, 10) },
            { stage: 'pressed_start', count: parseInt(counts.pressed_start, 10) },
            { stage: 'pressed_go', count: parseInt(counts.pressed_go, 10) },
            { stage: 'watched_video_1', count: parseInt(counts.watched_video_1, 10) },
            { stage: 'uploaded_photo', count: parseInt(counts.uploaded_photo, 10) },
        ];
    } catch (err) {
        console.error('Error getting stage stats:', err);
        return [];
    }
}

module.exports = {
  init,
  trackUserAction,
  addPhoto,
  getAllUsers,
  getTotalUsers,
  getStageStats,
  addPhoneNumber,
  getUser,
  setLastPhotoMessageId,
};