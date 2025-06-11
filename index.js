require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { init, trackUserAction, addPhoto, getAllUsers, getTotalUsers, getStageStats, addPhoneNumber, setUserState, getUser } = require("./db");
const db = { init, trackUserAction, addPhoto, getAllUsers, getTotalUsers, getStageStats, addPhoneNumber, setUserState, getUser };
const express = require("express");
const path = require('path');
const fs = require('fs');
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const video1 = "BAACAgIAAxkBAAIDJWhEcOGXY7u6d9TsmvHCEkQDD357AAKZcQAC6nYhSlYP-N1iRopuNgQ";
const video2 = "DQACAgIAAxkDAAIDOWhEenF69nK4-Ew81B87dL67afjhAAImcgAC6nYhSik4e7m3MnC4NgQ";
const video2TimeOut = 40000;

const adminUserName = process.env.ADMIN_USERNAME;
const adminIDs = (process.env.ADMIN_ID || "").split(',').map(id => id.trim());

db.init().catch(err => {
  console.error("FATAL: Database initialization failed.", err);
  process.exit(1);
});


const isValidPhoneNumber = (phone) => {
    const regex = /^\+\d{10,15}$/;
    return regex.test(phone);
};

bot.start((ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username;
  db.trackUserAction(userId, username, 'pressed_start_at');
  ctx.replyWithHTML(
    `🎨 Привет!\n\nКруто, что ты здесь — значит, тяга к творчеству у тебя точно есть 😉\n\nЛови бесплатный урок из нашего курса — попробуй, как это работает изнутри!\n\nА потом заглянем в твой рисунок и сделаем разбор 🧐 — похвалим, подметим интересное и подскажем, куда расти дальше.`,
    Markup.inlineKeyboard([
      Markup.button.callback("Готов(а)? Поехали! 🚀", "go_to_video"),
    ])
  );
});

bot.action("go_to_video", (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username;
  db.trackUserAction(userId, username, 'pressed_go_at');
  ctx.answerCbQuery();
  ctx.editMessageReplyMarkup(undefined);
  ctx.replyWithVideo(video1,
    Markup.inlineKeyboard([
      Markup.button.callback("Я посмотрел(а) урок", "watched_video_1")
    ])
  );
});

bot.action("watched_video_1", (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username;
  db.trackUserAction(userId, username, 'watched_video_1_at');
  ctx.editMessageReplyMarkup(undefined);
  ctx.answerCbQuery();
  ctx.replyWithVideo(video2).then(() => {
    setTimeout(() => {
      ctx.replyWithHTML(
        `📎 Чтобы мы сделали разбор, прикрепи фото своего рисунка — просто нажми на скрепку внизу и выбери изображение.\n\nЖдём твою работу, чтобы дать обратную связь! 🖼`
      );
    }, video2TimeOut);
  });
});

// MODIFIED: Обработка отправки фото пользователем
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    const photoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

    await db.trackUserAction(userId, username, 'uploaded_photo_at');
    await db.addPhoto(userId, photoFileId);

    // const mainAdminID = adminIDs[0];
    const mainAdminID = adminIDs[1];
    const caption = username
      ? `Рисунок от пользователя @${username}`
      : `Рисунок от пользователя ID: ${userId}`;
    await ctx.telegram.sendPhoto(mainAdminID, photoFileId, { caption });

    if (username) {
        await ctx.replyWithHTML(
            `Мы получили твой рисунок - спасибо!\n\nСовсем скоро свяжемся с тобой.\nОжидай сообщения 💌`
        );
    } else {
        await ctx.replyWithHTML(
            `Мы получили твой рисунок - спасибо!\n\nУ нас нет возможности написать первыми, т.к. у тебя не указан username\n\nЕсли хочешь обсудить рисунок, то напиши нам ${adminUserName} 💌`
        );

        // NEW: Отправляем второе сообщение с запросом номера
        await ctx.reply(
            'Или поделись своим номером телефона и мы с свяжемся с тобой.\n\nТы можешь нажать на кнопку ниже, или просто отправить номер в формате +380981234567',
            Markup.keyboard([
                Markup.button.contactRequest('📲 Оставить номер телефона')
            ]).resize()
        );

        // NEW: Устанавливаем пользователю состояние ожидания номера
        await db.setUserState(userId, 'awaiting_phone_number');
    }
});

// NEW: Обработка получения контакта через кнопку
bot.on('contact', async (ctx) => {
    const userId = ctx.message.contact.user_id;
    const user = await db.getUser(userId);

    // Проверяем, что мы действительно ждали номер от этого юзера
    if (!user || user.state !== 'awaiting_phone_number') {
        return;
    }

    const phoneNumber = ctx.message.contact.phone_number;
    const firstName = ctx.message.contact.first_name;

    await db.addPhoneNumber(userId, phoneNumber); // Сохраняем в БД и сбрасываем state

    // const mainAdminID = adminIDs[0];
    const mainAdminID = adminIDs[1];
    if (mainAdminID) {
        await ctx.telegram.sendMessage(mainAdminID, `Пользователь ${firstName} (ID: ${userId}) поделился своим контактом.`);
        await ctx.telegram.sendContact(mainAdminID, phoneNumber, firstName);
    }

    await ctx.reply(
        'Мы получили номер телефона. Скоро свяжемся с тобой',
        Markup.removeKeyboard() // Убираем кнопку
    );
});

// NEW: Обработка ручного ввода номера
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const user = await db.getUser(userId);

    // Проверяем, что мы ждем номер от этого пользователя
    if (!user || user.state !== 'awaiting_phone_number') {
        return; // Если нет, ничего не делаем
    }

    const text = ctx.message.text.trim();

    if (isValidPhoneNumber(text)) {
        // Номер корректный
        await db.addPhoneNumber(userId, text); // Сохраняем в БД и сбрасываем state

        // const mainAdminID = adminIDs[0];
        const mainAdminID = adminIDs[1];
        if (mainAdminID) {
            await ctx.telegram.sendMessage(mainAdminID, `Пользователь (ID: ${userId}) ввел номер вручную: ${text}`);
        }

        await ctx.reply(
            'Мы получили номер телефона. Скоро свяжемся с тобой',
            Markup.removeKeyboard()
        );
    } else {
        // Номер некорректный
        await ctx.reply('Введён некорректный номер, попробуй ещё раз. Пример: +380981234567. Спасибо!');
    }
});


// --- Служебные команды и Express-сервер (без изменений) ---

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
            console.error("Failed to create or send stats link:", e);
            ctx.reply("Не удалось создать ссылку на статистику. Проверьте, что переменная окружения BOT_URL установлена корректно.");
        }
    } else {
        console.log(`User ${userId} (not an admin) tried to use /stats command.`);
    }
});

app.get("/users", async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.render('users', { users });
    } catch (error) {
        console.error("Error fetching user list:", error);
        res.status(500).send("Error fetching user list");
    }
});

app.get("/view-photo/:file_id", async (req, res) => {
    try {
        const fileId = req.params.file_id;
        const file = await bot.telegram.getFile(fileId);
        const photoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        res.redirect(photoUrl);
    } catch (error) {
        console.error("Error redirecting to photo:", error);
        res.status(404).send("File not found or link expired.");
    }
});

app.get("/", (req, res) => {
  res.send("Hello! Bot server is running correctly.");
});

app.get("/stats", async (req, res) => {
    try {
        const { month, year } = req.query;
        const totalUsers = await db.getTotalUsers();
        const stageStats = await db.getStageStats(month, year);
        res.render('stats', {
            totalUsers,
            stageStats,
            currentFilter: month && year ? `за ${month}/${year}` : 'за все время'
        });
    } catch (error) {
        console.error("Error fetching stats:", error);
        res.status(500).send("Error fetching statistics");
    }
});

bot.on("video", async (ctx) => {
  const video = ctx.message.video;
  const caption = ctx.message.caption?.trim().toLowerCase();
  const durationSeconds = video.duration;
  const durationMs = durationSeconds * 1000;
  if (caption === "add") {
    await ctx.reply(
      `<code>${video.file_id}</code>\nДлительность: ${durationMs} мс`,
      { parse_mode: "HTML" }
    );
  }
});

bot.on("document", async (ctx) => {
  const fileName = ctx.message.document.file_name;
  if (fileName !== "add.mp4") {
    return;
  }
  const fileId = ctx.message.document.file_id;
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const localPath = path.join(__dirname, "add.mp4");
  const response = await axios({
    method: "GET",
    url: fileLink.href,
    responseType: "stream",
  });
  const writer = fs.createWriteStream(localPath);
  response.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
  const sentMsg = await ctx.replyWithVideoNote({ source: localPath });
  if (sentMsg.video_note) {
    await ctx.reply(`✅ file_id видео-кружка: ${sentMsg.video_note.file_id}`);
    await ctx.reply(`Длительность: ${sentMsg.video_note.duration} секунд`);
  } else {
    await ctx.reply("⚠️ Что-то пошло не так, видео-кружок не получен.");
  }
  fs.unlinkSync(localPath);
});

const secretPath = process.env.SECRET_PATH;
app.use(bot.webhookCallback(`/${secretPath}`));
bot.telegram.setWebhook(`${process.env.BOT_URL}/${secretPath}`);

app.listen(process.env.PORT || 3000, () => {
  console.log(`Bot is running on port ${process.env.PORT || 3000}`);
});