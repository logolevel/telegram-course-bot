require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const db = require("./db");
const express = require("express");
const path = require('path');
const basicAuth = require('express-basic-auth');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const adminUserName = process.env.ADMIN_USERNAME;
const adminIDs = (process.env.ADMIN_ID || "").split(',').map(id => id.trim());
const mainAdminID = adminIDs[0];

const CHANNEL_URL = "https://t.me/art_therapy_artvibe";
const COURSE_URL = "https://app.lava.top/products/497d8f5b-a8f2-427b-82a3-8450924ca6e3";
const BIG_COURSE_URL = "https://artvibe.carrd.co/";

const VIDEO_ID_PRACTICE = "BAACAgIAAyEFAASeM37lAAMnaU2eATJSVSSmfCbtVVj9SEEHRV4AAgOMAAJFwXFK5zMhImFGFeg2BA"; 

const getFeedbackText = (type) => {
    const map = {
        'easier': '🌿 Стало чуть легче',
        'no_change': '➖ Почти без изменений',
        'harder': '⚠️ Стало тяжелее'
    };
    return map[type] || 'Не указано';
};

db.init().catch(err => {
  console.error("FATAL: Database initialization failed.", err);
  process.exit(1);
});

// 1. STATE: START
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username;
  
  await db.setUserState(userId, 'START');
  await db.trackUserAction(userId, username, 'pressed_start_at');

  await ctx.replyWithHTML(
    `Привет 🤍\n\nЕсли ты здесь — возможно, внутри тревожно, шумно или напряжённо.\n\nМы сделаем арт-практику, чтобы стало чуть тише.\n\n<b>Важно:</b>\n— рисовать красиво не нужно\n— здесь нет «правильно» или «неправильно»\n— ты ничего не должна и можешь остановиться в любой момент`,
    Markup.inlineKeyboard([
      [Markup.button.callback("▶️ Начать практику", "PREPARE_PRACTICE")],
      [Markup.button.url("🏠 Вернуться в канал", CHANNEL_URL)]
    ])
  );
});

// 2. STATE: PREPARE_PRACTICE
bot.action("PREPARE_PRACTICE", async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    
    await db.setUserState(userId, 'PREPARE');
    await db.trackUserAction(userId, username, 'practice_start_at');
    
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `Практика займёт около 10 минут.\n\nТебе нужен:\n— лист бумаги\n— цветные карандаши или чем ты любишь рисовать\n\nЭто не обучение и не тест.\nПросто попробуй сделать для себя.`,
        Markup.inlineKeyboard([
            [Markup.button.callback("🎥 Включить практику", "START_VIDEO")],
            [Markup.button.url("↩️ Не сейчас", CHANNEL_URL)]
        ])
    );
});

// 3. STATE: VIDEO
bot.action("START_VIDEO", async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;

    await db.setUserState(userId, 'WATCHING_VIDEO');
    await db.trackUserAction(userId, username, 'practice_video_at');

    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(undefined); 

    await ctx.replyWithVideo(VIDEO_ID_PRACTICE, {
        caption: '☝️Арт-практика: "Вулкан"',
        ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Я посмотрел/a видео", "VIDEO_WATCHED")]
        ])
    });
});

bot.action("VIDEO_WATCHED", async (ctx) => {
    const userId = ctx.from.id;
    await ctx.answerCbQuery();
    await sendResultFixation(ctx, userId);
});

async function sendResultFixation(ctx, userId) {
    await db.setUserState(userId, 'RESULT_FIXATION');
    
    try {
        await ctx.editMessageReplyMarkup(undefined);
    } catch (e) { /* ignore */ }

    const message = `Спасибо, что попробовала 🤍\n\nПодумай, изменилось ли что-то в тебе после техники?\n\nДаже если изменилось совсем чуть-чуть — это важно.`;
    
    await ctx.replyWithHTML(message, Markup.inlineKeyboard([
        [Markup.button.callback("🌿 Стало чуть легче", "RESULT_EASIER")],
        [Markup.button.callback("➖ Почти без изменений", "RESULT_NO_CHANGE")],
        [Markup.button.callback("⚠️ Стало тяжелее", "RESULT_HARDER")]
    ]));
}

// 4. BRANCH: EASIER
bot.action("RESULT_EASIER", async (ctx) => {
    const userId = ctx.from.id;
    await db.trackUserAction(userId, ctx.from.username, 'practice_completed_at', { feedback_type: 'easier' });
    await db.setUserState(userId, 'EASIER_MENU');
    
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `Это важный сигнал 🤍\nЗначит, такой способ может тебе подходить.\n\nЕсли захочешь, можешь:\n— отправить рисунок\n— или написать пару слов о своих ощущениях\n\nЭто не оценка и не разбор.\nАнастасия посмотрит твой рисунок и лично ответит тебе, мягко подсказав возможные направления для размышлений.\n\nНо отправлять — не обязательно.`,
        Markup.inlineKeyboard([
            [Markup.button.callback("📎 Отправить рисунок", "INPUT_DRAWING")],
            [Markup.button.callback("💬 Написать ощущения", "INPUT_TEXT")],
            [Markup.button.callback("↩️ Не хочу отправлять", "NO_SEND_EXIT")]
        ])
    );
});

// 5. BRANCH: NO_CHANGE
bot.action("RESULT_NO_CHANGE", async (ctx) => {
    const userId = ctx.from.id;
    await db.trackUserAction(userId, ctx.from.username, 'practice_completed_at', { feedback_type: 'no_change' });
    
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `Спасибо, что отметила.\nТакое бывает — тело и психика не всегда откликаются сразу. Это не значит, что что-то пошло не так. Иногда внутри слишком много всего и нужен не один контакт, а чуть больше времени и бережности.\n\nЕсли захочешь продолжить, есть два варианта.\n\n📌 «Антистресс» — маленький курс-аптечка, к которому можно возвращаться, когда становится непросто.\n\n📌 Большой курс — для тех, кому хочется идти глубже и исследовать себя через творчество. Практика в этом боте - это одна из практик данного курса.\n\nВыбирай, если и когда почувствуешь, что сейчас это для тебя 🤍`,
        Markup.inlineKeyboard([
            [Markup.button.url('Подробнее про "Антистресс"', COURSE_URL)],
            [Markup.button.url("Посмотреть, о чем большой курс", BIG_COURSE_URL)],
            [Markup.button.url("🏠 Вернуться в канал", CHANNEL_URL)]
        ])
    );
});

bot.action("GOTO_EASIER_OPTIONS", async (ctx) => {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'EASIER_MENU');
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `Хорошо 🤍\n\nЕсли захочешь, можешь отправить рисунок или написать пару слов.`,
        Markup.inlineKeyboard([
            [Markup.button.callback("📎 Отправить рисунок", "INPUT_DRAWING")],
            [Markup.button.callback("💬 Написать ощущения", "INPUT_TEXT")],
            [Markup.button.callback("↩️ Не хочу отправлять", "NO_SEND_EXIT")]
        ])
    );
});

// 7. BRANCH: HARDER
bot.action("RESULT_HARDER", async (ctx) => {
    const userId = ctx.from.id;
    await db.trackUserAction(userId, ctx.from.username, 'practice_completed_at', { feedback_type: 'harder' });
    await db.setUserState(userId, 'HARDER_MENU');
    
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `Спасибо, что написала об этом.\n\nОчень жаль, что тебе сейчас стало тяжелее. Такое иногда бывает - практика может поднять чувства или напряжение, которые раньше были приглушены. Это не значит, что с тобой что-то не так.\n\nСейчас важно быть с собой особенно бережно. Если можешь — сделай паузу, обрати внимание на дыхание, почувствуй опору под ногами.\n\nЕсли захочешь продолжить позже и в более поддерживающем формате, есть варианты, которые можно проходить в своём темпе — без спешки и ожиданий результата.\n\nВыбирай только если и когда почувствуешь, что тебе сейчас это подходит 🤍`,
        Markup.inlineKeyboard([
            [Markup.button.url('Узнать про короткий "курс-аптечку"', COURSE_URL)],
            [Markup.button.url("Посмотреть, о чем большой курс", BIG_COURSE_URL)],
            [Markup.button.url("🏠 Вернуться в канал", CHANNEL_URL)]
        ])
    );
});

// 8. INPUT HANDLERS SETUP
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

// 9. HANDLING USER CONTENT (Photo & Text)
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    
    const user = await db.getUser(userId);
    const state = user ? user.current_state : null;

    if (state === 'WAITING_FOR_CONTENT' || state === 'EASIER_MENU' || state === 'HARDER_MENU') {
        const photoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const caption = ctx.message.caption || "";

        if (caption) {
            await db.addTextMessage(userId, caption);
        }

        await db.trackUserAction(userId, username, 'uploaded_photo_at');
        await db.addPhoto(userId, photoFileId);
        
        const stateText = getFeedbackText(user.feedback_type);
        const adminCaption = `🎨 Практика. От: @${username || userId}\nСостояние: ${stateText}\nТекст: ${caption}`;
        
        const sentMessage = await ctx.telegram.sendPhoto(mainAdminID, photoFileId, { caption: adminCaption });
        
        if (sentMessage) await db.setLastPhotoMessageId(userId, sentMessage.message_id);

        if (!username && adminUserName) {
             await ctx.reply(`Спасибо за рисунок! У тебя скрыт username, поэтому я не смогу написать тебе в личку. Если нужен личный контакт, напиши: ${adminUserName}`);
        }

        await sendConfirmation(ctx);
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
        const stateText = getFeedbackText(user.feedback_type);
        const adminMsg = `💬 Отзыв/Слово. От: @${username || userId}\nСостояние: ${stateText}\nСообщение: ${text}`;
        
        await db.addTextMessage(userId, text);
        await ctx.telegram.sendMessage(mainAdminID, adminMsg);

        if (!username && adminUserName) {
             await ctx.reply(`Спасибо за сообщение! У тебя скрыт username, поэтому я не смогу написать тебе в личку. Если нужен личный контакт, напиши: ${adminUserName}`);
        }

        await sendConfirmation(ctx);
        await db.setUserState(userId, 'COMPLETED');
    } 
});

async function sendConfirmation(ctx) {
    await ctx.replyWithHTML(
        `Рисунок получен ✨\n\nАнастасия вскоре ответит тебе.\n\nПока ты ждёшь ответ, можешь сделать следующий шаг — если почувствуешь, что тебе это сейчас подходит.\n\n📌 «Антистресс» — небольшой курс-аптечка на 22 минуты, чтобы мягко поддерживать себя и возвращаться к практикам в моменты, когда напряжение особенно даёт о себе знать.\n\n📌 «Исследуй себя через творчество» — более длительный и спокойный формат для тех, кому важно идти глубже и быть в контакте с собой без спешки. Ты как раз сделала одну практику из этого курса.\n\n\nВыбирай то, что сейчас откликается 🤍`,
        Markup.inlineKeyboard([
            [Markup.button.url('Подробнее про "Антистресс"', COURSE_URL)],
            [Markup.button.url("Посмотреть, о чем большой курс", BIG_COURSE_URL)],
            [Markup.button.url("🏠 Вернуться в канал", CHANNEL_URL)]
        ])
    );
}

bot.action("NO_SEND_EXIT", async (ctx) => {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'IDLE'); 
    await ctx.answerCbQuery();
    
    await ctx.replyWithHTML(
        `Это нормально. В любом случае, мы рады, что ты попробовала и надеемся, что для тебя этот опыт был очень полезен.\n\nЭто была разовая практика. Наш мини-курс «Творческий антистресс» - это набор из 3-х практик для регулярного снижения стресса и напряжения через творчество. Без обучения рисованию и без перегруза. Больше информации ниже.`,
        Markup.inlineKeyboard([
            [Markup.button.url('Подробнее про "Антистресс"', COURSE_URL)],
            [Markup.button.url("Посмотреть, о чем большой курс", BIG_COURSE_URL)],
            [Markup.button.url("🏠 Вернуться в канал", CHANNEL_URL)]
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

app.get("/", (req, res) => {
  res.send("Bot is running with new Art Practice logic.");
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
        const { month, year } = req.query;
        const totalUsers = await db.getTotalUsers();
        const stageStats = await db.getStageStats(month, year);
        res.render('stats', {
            totalUsers,
            stageStats,
            currentFilter: month && year ? `за ${month}/${year}` : 'за все время',
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