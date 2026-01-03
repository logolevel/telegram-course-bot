const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
});

async function init() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      user_id BIGINT PRIMARY KEY,
      username VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      pressed_start_at TIMESTAMPTZ,
      uploaded_photo_at TIMESTAMPTZ,
      photo_file_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
      phone_number VARCHAR(20),
      last_photo_message_id BIGINT
    );
  `;

  const newColumns = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS current_state VARCHAR(50)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS practice_start_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS practice_video_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS video_watched_confirm_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS practice_completed_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(50)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS clicked_course_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS clicked_big_course_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT TRUE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_dates TIMESTAMPTZ[] DEFAULT ARRAY[]::TIMESTAMPTZ[]",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS text_messages TEXT[] DEFAULT ARRAY[]::TEXT[]",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS text_message_dates TIMESTAMPTZ[] DEFAULT ARRAY[]::TIMESTAMPTZ[]",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ DEFAULT NOW()"
  ];

  try {
    await pool.query(createTableQuery);
    
    for (const query of newColumns) {
        await pool.query(query).catch(err => {
            console.log(`Column check/add: ${err.message}`);
        });
    }
    
    console.log('Database initialized, schema updated.');

  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  }
}

async function setUserState(userId, state) {
    const query = `
        INSERT INTO users (user_id, current_state) 
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET current_state = $2;
    `;
    try {
        await pool.query(query, [userId, state]);
    } catch(err) {
        console.error(`Error setting state for user ${userId}:`, err);
    }
}

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

async function trackUserAction(userId, username, stageColumn, additionalData = {}) {
  const allowedColumns = [
      'pressed_start_at', 'uploaded_photo_at', 
      'practice_start_at', 'practice_video_at', 'practice_completed_at',
      'video_watched_confirm_at', 'clicked_course_at', 'clicked_big_course_at'
  ];
  
  let query = '';
  if (allowedColumns.includes(stageColumn)) {
      query = `
        INSERT INTO users (user_id, username, last_activity_at, ${stageColumn})
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          ${stageColumn} = NOW(),
          last_activity_at = NOW(),
          username = EXCLUDED.username;
      `;
  } else {
      query = `
        INSERT INTO users (user_id, username, last_activity_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id) DO UPDATE SET 
            username = EXCLUDED.username,
            last_activity_at = NOW();
      `;
  }

  try {
    await pool.query(query, [userId, username]);
    
    if (additionalData.feedback_type) {
        await pool.query(`UPDATE users SET feedback_type = $2 WHERE user_id = $1`, [userId, additionalData.feedback_type]);
    }

  } catch (err) {
    console.error(`Error tracking action for user ${userId}:`, err);
  }
}

async function addPhoto(userId, photoFileId) {
    const query = `
        UPDATE users
        SET photo_file_ids = array_append(photo_file_ids, $2),
            photo_dates = array_append(photo_dates, NOW()),
            is_read = false,
            last_activity_at = NOW()
        WHERE user_id = $1;
    `;
    try {
        await pool.query(query, [userId, photoFileId]);
    } catch(err) {
        console.error(`Error adding photo for user ${userId}:`, err);
    }
}

async function addTextMessage(userId, text) {
    const query = `
        UPDATE users
        SET text_messages = array_append(text_messages, $2),
            text_message_dates = array_append(text_message_dates, NOW()),
            is_read = false,
            last_activity_at = NOW()
        WHERE user_id = $1;
    `;
    try {
        await pool.query(query, [userId, text]);
    } catch(err) {
        console.error(`Error adding text message for user ${userId}:`, err);
    }
}

async function setReadStatus(userId, isRead) {
    const query = `
        UPDATE users 
        SET is_read = $2,
            last_read_at = CASE WHEN $2 = TRUE THEN NOW() ELSE last_read_at END
        WHERE user_id = $1
    `;
    try {
        await pool.query(query, [userId, isRead]);
        return true;
    } catch(err) {
        console.error(`Error setting read status for user ${userId}:`, err);
        return false;
    }
}

async function addPhoneNumber(userId, phoneNumber) {
    const query = `UPDATE users SET phone_number = $1 WHERE user_id = $2`;
    try {
        await pool.query(query, [phoneNumber, userId]);
    } catch(err) {
        console.error(`Error adding phone number for user ${userId}:`, err);
    }
}

async function setLastPhotoMessageId(userId, messageId) {
    const query = `UPDATE users SET last_photo_message_id = $1 WHERE user_id = $2`;
    try {
        await pool.query(query, [messageId, userId]);
    } catch (err) {
        console.error(`Error setting last_photo_message_id for user ${userId}:`, err);
    }
}

async function getAllUsers() {
    const query = `SELECT * FROM users ORDER BY is_read ASC, last_activity_at DESC NULLS LAST, created_at DESC;`;
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
          COUNT(practice_start_at) AS started_practice,
          COUNT(practice_video_at) AS turned_on_practice,
          COUNT(video_watched_confirm_at) AS marked_watched_video,
          COUNT(practice_completed_at) AS selected_state,
          COUNT(uploaded_photo_at) AS uploaded_photo,
          COUNT(clicked_course_at) AS clicked_course,
          COUNT(clicked_big_course_at) AS clicked_big_course,
          COUNT(CASE WHEN array_length(text_messages, 1) > 0 THEN 1 END) AS wrote_sensation
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
            { stage: 'Entered Bot', count: parseInt(counts.entered_bot, 10) },
            { stage: 'Started Practice', count: parseInt(counts.started_practice, 10) },
            { stage: 'Turned On Practice', count: parseInt(counts.turned_on_practice, 10) },
            { stage: 'Marked Watched', count: parseInt(counts.marked_watched_video, 10) },
            { stage: 'Selected State', count: parseInt(counts.selected_state, 10) },
            { stage: 'Uploaded Photo', count: parseInt(counts.uploaded_photo, 10) },
            { stage: 'Wrote Sensation', count: parseInt(counts.wrote_sensation, 10) },
            { stage: 'Clicked Course', count: parseInt(counts.clicked_course, 10) },
            { stage: 'Clicked Big Course', count: parseInt(counts.clicked_big_course, 10) }
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
  addTextMessage,
  setReadStatus,
  getAllUsers,
  getTotalUsers,
  getStageStats,
  addPhoneNumber,
  getUser,
  setLastPhotoMessageId,
  setUserState 
};