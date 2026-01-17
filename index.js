require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const db = require("./db");
const express = require("express");
const path = require('path');
const basicAuth = require('express-basic-auth');
const cron = require('node-cron');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const adminUserName = process.env.ADMIN_USERNAME;
const adminIDs = (process.env.ADMIN_ID || "").split(',').map(id => id.trim());
const mainAdminID = adminIDs[0];

const CHANNEL_URL = "https://t.me/art_therapy_artvibe";
const TARGET_COURSE_URL = "https://app.lava.top/products/497d8f5b-a8f2-427b-82a3-8450924ca6e3";
const TARGET_BIG_COURSE_URL = "https://artvibe.carrd.co/";

const VIDEO_ID_PRACTICE = "BAACAgIAAyEFAASeM37lAAMnaU2eATJSVSSmfCbtVVj9SEEHRV4AAgOMAAJFwXFK5zMhImFGFeg2BA"; 

const getRedirectLink = (type, userId) => {
    const baseUrl = process.env.BOT_URL || `http://localhost:${process.env.PORT || 3000}`;
    return `${baseUrl}/r/${type}?uid=${userId}`;
};

db.init().catch(err => {
  console.error("FATAL: Database initialization failed.", err);
  process.exit(1);
});

cron.schedule('0 * * * *', async () => {
    const activeUsers = await db.getUsersForReminder();

    if (activeUsers.length > 0) {
        for (const user of activeUsers) {
            try {
                await bot.telegram.sendMessage(user.user_id, 
                    `Привет 🤍\nПрактика всё ещё здесь.\nМожно вернуться, когда будет подходящий момент.\n\nА если хочется понять, что дальше - можно посмотреть без обязательств.`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback("🔁 Вернуться к практике", "PREPARE_PRACTICE")],
                        [Markup.button.callback("🎨 Отправить рисунок", "INPUT_DRAWING")],
                        [Markup.button.callback("👉🏼 Выбрать следующий шаг", "REMINDER_NEXT_STEP")]
                    ])
                );
                await db.markReminderSent(user.user_id);
            } catch (e) {
                console.error(`Failed to send 24h reminder to ${user.user_id}:`, e.message);
                if (e.response && e.response.error_code === 403) {
                    await db.markReminderSent(user.user_id);
                }
            }
        }
    }

    const startUsers = await db.getUsersForStartReminder();

    if (startUsers.length > 0) {
        for (const user of startUsers) {
            try {
                await bot.telegram.sendMessage(user.user_id, 
                    `Маленькая подсказка 🤍\n\nПрактику можно просто посмотреть — для этого достаточно нажать кнопку ниже.\n\nНичего не начнётся автоматически`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback("📹 Включить практику", "PREPARE_PRACTICE")]
                    ])
                );
                await db.markReminderSent(user.user_id);
            } catch (e) {
                console.error(`Failed to send start reminder to ${user.user_id}:`, e.message);
                if (e.response && e.response.error_code === 403) {
                    await db.markReminderSent(user.user_id);
                }
            }
        }
    }
});

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username;
  
  await db.setUserState(userId, 'START');
  await db.trackUserAction(userId, username, 'pressed_start_at');

  await ctx.replyWithHTML(
    `Привет 🤍\n\nЕсли ты здесь — возможно, внутри тревожно, шумно или напряжённо.\n\nМы сделаем арт-практику, чтобы стало чуть тише.\n\n<b>Важно:</b>\n— рисовать красиво не нужно\n— здесь нет «правильно» или «неправильно»\n— ты ничего не должна и можешь остановиться в любой момент\n\nТакже ты можешь быть здесь просто из любопытства — этого достаточно.`,
    Markup.inlineKeyboard([
      [Markup.button.callback("📹 Включить практику", "PREPARE_PRACTICE")],
      [Markup.button.url("🏠 Вернуться в канал", CHANNEL_URL)]
    ])
  );
});

bot.action("PREPARE_PRACTICE", async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    
    await db.setUserState(userId, 'WATCHING_VIDEO');
    await db.trackUserAction(userId, username, 'practice_start_at');
    
    await ctx.answerCbQuery();
    
    await ctx.replyWithHTML(
        `Практика займёт около 10 минут.\n\nТебе нужен:\n— лист бумаги\n— цветные карандаши или чем ты любишь рисовать\n\nЭто не обучение и не тест.\nПросто попробуй сделать для себя.`
    );

    await ctx.replyWithVideo(VIDEO_ID_PRACTICE, {
        caption: '☝️Арт-практика: "Вулкан"',
        ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Я посмотрел/a видео", "VIDEO_WATCHED")]
        ])
    });
});

bot.action("VIDEO_WATCHED", async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;

    await db.trackUserAction(userId, username, 'video_watched_confirm_at');
    await db.trackUserAction(userId, username, 'practice_completed_at'); 
    
    await db.setUserState(userId, 'POST_PRACTICE_MENU');
    
    await ctx.answerCbQuery();
    try {
        await ctx.editMessageReplyMarkup(undefined);
    } catch (e) { /* ignore */ }

    await ctx.replyWithHTML(
        `Если захочется — можешь отправить рисунок и пару слов для Анастасии. 🤍\n\nОна посмотрит и ответит мягко, без оценки и «правильно/неправильно».\n\nА если сейчас не хочется делиться — это тоже нормально 🤍`,
        Markup.inlineKeyboard([
            [Markup.button.callback("🎨 Отправить рисунок и пару слов", "INPUT_DRAWING")],
            [Markup.button.callback("Не хочу отправлять", "NO_SEND_EXIT")]
        ])
    );
});

bot.action("INPUT_DRAWING", async (ctx) => {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'WAITING_FOR_CONTENT');
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `Если тебе ок — прикрепи фото рисунка 📎\n\nМожно без объяснений.\nЕсли хочешь — добавь 1–2 фразы:\n— что ты чувствовала ДО\n— что стало ПОСЛЕ\n\nЗдесь нет оценки «красиво / некрасиво».`
    );
});

bot.action("INPUT_TEXT", async (ctx) => {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'WAITING_FOR_CONTENT');
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(`Я слушаю. Напиши всё, чем хочешь поделиться 🤍`);
});

bot.action("REMINDER_NEXT_STEP", async (ctx) => {
    const userId = ctx.from.id;
    const user = await db.getUser(userId);
    const state = user ? user.current_state : null;

    await ctx.answerCbQuery();

    if (state === 'WATCHING_VIDEO') {
        await db.setUserState(userId, 'POST_PRACTICE_MENU');
        await ctx.replyWithHTML(
            `Если ты уже посмотрела видео и готова идти дальше:\n\nЕсли захочется — можешь отправить рисунок и пару слов для Анастасии. 🤍`,
            Markup.inlineKeyboard([
                [Markup.button.callback("🎨 Отправить рисунок и пару слов", "INPUT_DRAWING")],
                [Markup.button.callback("Не хочу отправлять", "NO_SEND_EXIT")],
                [Markup.button.callback("🎥 Пришлите видео снова", "PREPARE_PRACTICE")]
            ])
        );
    } else {
        await ctx.reply("Похоже, ты уже продвинулась дальше. Можешь продолжить работу через меню:", Markup.inlineKeyboard([
             [Markup.button.callback("🔁 Вернуться к началу", "PREPARE_PRACTICE")]
        ]));
    }
});

bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    
    const user = await db.getUser(userId);
    const state = user ? user.current_state : null;

    if (state === 'WAITING_FOR_CONTENT' || state === 'POST_PRACTICE_MENU') {
        const photoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const caption = ctx.message.caption || "";

        if (caption) {
            await db.addTextMessage(userId, caption);
        }

        await db.trackUserAction(userId, username, 'uploaded_photo_at');
        await db.addPhoto(userId, photoFileId);
        
        const adminCaption = `🎨 Практика (Рисунок). От: @${username || userId}\nТекст: ${caption}`;
        
        const sentMessage = await ctx.telegram.sendPhoto(mainAdminID, photoFileId, { caption: adminCaption });
        
        if (sentMessage) await db.setLastPhotoMessageId(userId, sentMessage.message_id);

        if (!username && adminUserName) {
             await ctx.reply(`Спасибо за рисунок! У тебя скрыт username, поэтому я не смогу написать тебе в личку. Если нужен личный контакт, напиши: ${adminUserName}`);
        }

        await sendConfirmation(ctx, userId);
        await db.setUserState(userId, 'COMPLETED');
    } else {
        await ctx.reply("Я получил фото, но сейчас я не ожидаю его в рамках практики. Если ты хотел начать сначала, нажми /start");
    }
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    const text = ctx.message.text;

    if (text.startsWith('/')) return;

    const user = await db.getUser(userId);
    const state = user ? user.current_state : null;

    if (state === 'WAITING_FOR_CONTENT') {
        const adminMsg = `💬 Отзыв/Слово. От: @${username || userId}\nСообщение: ${text}`;
        
        await db.addTextMessage(userId, text);
        await ctx.telegram.sendMessage(mainAdminID, adminMsg);

        if (!username && adminUserName) {
             await ctx.reply(`Спасибо за сообщение! У тебя скрыт username, поэтому я не смогу написать тебе в личку. Если нужен личный контакт, напиши: ${adminUserName}`);
        }

        await sendConfirmation(ctx, userId);
        await db.setUserState(userId, 'COMPLETED');
    } 
});

async function sendConfirmation(ctx, userId) {
    const uid = userId || ctx.from.id;
    await ctx.replyWithHTML(
        `Спасибо, что поделилась 🤍\n\nАнастасия вскоре ответит.\n\nИногда уже сам этот шаг — что-то нарисовать и отдать — немного меняет состояние.\n\nПодумай, изменилось ли что-то в тебе. Даже если совсем чуть-чуть — это важно.\n\nКому-то хватает одной разовой практики. Кому-то помогает короткая связка из нескольких практик, чтобы помочь себе здесь и сейчас.\n\nА кто-то в какой-то момент чувствует, что хочется не только облегчения, а глубокой работы над собой - шаг за шагом.\n\n👇🏼 Ниже - возможные шаги, если захочется.`,
        Markup.inlineKeyboard([
            [Markup.button.url('🌱 Поддержка здесь и сейчас', getRedirectLink('course', uid))],
            [Markup.button.url("🧭 Глубокая работа над собой", getRedirectLink('big_course', uid))],
            [Markup.button.callback("💬 Задать вопрос Анастасии", "INPUT_TEXT")]
        ])
    );
}

bot.action("NO_SEND_EXIT", async (ctx) => {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'IDLE'); 
    await ctx.answerCbQuery();
    
    await ctx.replyWithHTML(
        `Всё в порядке 🤍\nМожно ничего не отправлять и ничего не объяснять.\n\nИногда важно просто побыть с этим опытом внутри.\n\nЕсли захочется, обрати внимание — изменилось ли что-то в тебе после практики. Даже если совсем чуть-чуть — это важно.`
    );

    await ctx.replyWithHTML(
        `У людей бывает разная глубина запроса.\n\nКому-то хватает одной разовой практики. Кому-то помогает короткая связка из нескольких практик, чтобы помочь себе здесь и сейчас.\n\nА кто-то в какой-то момент чувствует, что хочется не только облегчения, а глубокой работы над собой - шаг за шагом.\n\n👇🏼 Ниже - возможные шаги, если захочется.`,
        Markup.inlineKeyboard([
            [Markup.button.url('🌱 Поддержка здесь и сейчас', getRedirectLink('course', userId))],
            [Markup.button.url("🧭 Глубокая работа над собой", getRedirectLink('big_course', userId))],
            [Markup.button.callback("🔁 Вернуться к практике", "PREPARE_PRACTICE")],
            [Markup.button.callback("💬 Задать вопрос Анастасии", "INPUT_TEXT")]
        ])
    );
});

bot.command('stats', (ctx) => {
    const userId = String(ctx.from.id);
    if (adminIDs.includes(userId)) {
        try {
            const statsUrl = `${process.env.BOT_URL}/stats`;
            ctx.replyWithHTML(
                '📊 <b>Страница статистики</b>\n\nНажмите на кнопку ниже, чтобы открыть дашборд.',
                Markup.inlineKeyboard([
                    Markup.button.url('📈 Открыть статистику', statsUrl)
                ])
            );
        } catch (e) {
            console.error("Failed to create stats link:", e);
        }
    }
});

const adminAuth = basicAuth({
    users: { [process.env.STOREFRONT_ADMIN_USERNAME]: process.env.STOREFRONT_ADMIN_PASSWORD },
    challenge: true,
    realm: 'AdminPanel',
});

app.get("/r/:type", async (req, res) => {
    const { type } = req.params;
    const { uid } = req.query;
    
    if (uid) {
        if (type === 'course') {
            await db.trackUserAction(uid, null, 'clicked_course_at');
            return res.redirect(TARGET_COURSE_URL);
        } else if (type === 'big_course') {
            await db.trackUserAction(uid, null, 'clicked_big_course_at');
            return res.redirect(TARGET_BIG_COURSE_URL);
        }
    }
    res.redirect(CHANNEL_URL);
});

app.get("/", (req, res) => {
  res.send("Bot is running with updated Start/Practice logic.");
});

app.get("/users", adminAuth, async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.render('users', { users, page: 'users' });
    } catch (error) {
        res.status(500).send("Error fetching user list");
    }
});

app.post("/api/users/toggle-read", adminAuth, async (req, res) => {
    try {
        const { userId, isRead } = req.body;
        await db.setReadStatus(userId, isRead);
        res.json({ success: true, userId, newStatus: isRead });
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ success: false, error: "Database error" });
    }
});

app.get("/stats", adminAuth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const totalUsers = await db.getTotalUsers();
        const stageStats = await db.getStageStats(startDate, endDate);
        
        let filterText = 'за все время';
        if (startDate && endDate) {
            filterText = `с ${startDate} по ${endDate}`;
        }
        
        res.render('stats', {
            totalUsers,
            stageStats,
            currentFilter: filterText,
            startDate: startDate || '',
            endDate: endDate || '',
            page: 'stats'
        });
    } catch (error) {
        res.status(500).send("Error fetching statistics");
    }
});

app.get("/view-photo/:file_id", adminAuth, async (req, res) => {
    try {
        const fileId = req.params.file_id;
        const file = await bot.telegram.getFile(fileId);
        const photoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        res.redirect(photoUrl);
    } catch (error) {
        res.status(404).send("File not found or link expired.");
    }
});

const secretPath = process.env.SECRET_PATH;
app.use(bot.webhookCallback(`/${secretPath}`));
bot.telegram.setWebhook(`${process.env.BOT_URL}/${secretPath}`);

app.listen(process.env.PORT || 3000, () => {
  console.log(`Bot is running on port ${process.env.PORT || 3000}`);
});