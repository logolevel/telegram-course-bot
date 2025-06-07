require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const db = require("./db");
const express = require("express");
const path = require('path');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// Настройка шаблонизатора EJS для страницы статистики
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Константы из вашего примера
const video1 = "BAACAgIAAxkBAAIDJWhEcOGXY7u6d9TsmvHCEkQDD357AAKZcQAC6nYhSlYP-N1iRopuNgQ";
const video2 = "BAACAgIAAxkBAAIDJ2hEcVRicHP0WT2hON2Qq5Q-b3I7AAKdcQAC6nYhStikhv60X81eNgQ";
// const video1TimeOut = 988000; // 16 минут 27 секунд
const video1TimeOut = 20000; // тест 20 секунд
const video2TimeOut = 40000; // 40 секунд

const adminUserName = process.env.ADMIN_USERNAME;

// Читаем ID админов из .env. Может быть один или несколько через запятую.
const adminIDs = (process.env.ADMIN_ID || "").split(',').map(id => id.trim());

// Инициализация базы данных при старте
db.init().catch(err => {
  console.error("FATAL: Database initialization failed.", err);
  process.exit(1);
});

// 1. Команда /start
bot.start((ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username;

  // Логируем в базу, что пользователь зашел и нажал "старт"
  db.logProgress(userId, username, 'entered_bot');
  db.logProgress(userId, username, 'pressed_start');

  ctx.replyWithHTML(
    `🎨 Привет!\nКруто, что ты здесь — значит, тяга к творчеству у тебя точно есть 😉\nЛови бесплатный урок из нашего курса — попробуй, как это работает изнутри!\nА потом заглянем в твой рисунок и сделаем разбор 🧐 — похвалим, подметим интересное и подскажем, куда расти дальше.`,
    Markup.inlineKeyboard([
      Markup.button.callback("Готов(а)? Поехали! 🚀", "go_to_video"),
    ])
  );
});

// 2. Нажатие на кнопку "Готов(а)? Поехали! 🚀"
bot.action("go_to_video", (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username;

  // Логируем нажатие кнопки
  db.logProgress(userId, username, 'pressed_go');

  // Убираем кнопку после нажатия
  ctx.answerCbQuery();
  ctx.editMessageReplyMarkup(undefined);

  // 3. Отправляем первое видео и запускаем таймеры
  ctx.replyWithVideo(video1).then(() => {
    setTimeout(() => {
      // 4. Отправляем второе видео
      ctx.replyWithVideo(video2).then(() => {
        setTimeout(() => {
          // 5. Отправляем сообщение с просьбой прислать рисунок
          ctx.replyWithHTML(
            `📎 Чтобы мы сделали разбор, прикрепи фото своего рисунка — просто нажми на скрепку внизу и выбери изображение.\n\nЖдём твою работу, чтобы дать обратную связь! 🖼`
          );
        }, video2TimeOut);
      });
    }, video1TimeOut);
  });
});

// 6. Обработка отправки фото пользователем
bot.on('photo', (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    // Берем фото в лучшем качестве
    const photoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

    // Логируем отправку фото
    db.logProgress(userId, username, 'uploaded_photo');

    // Пересылаем фото админу
    const mainAdminID = adminIDs[0]; 
    const caption = username
      ? `Рисунок от пользователя @${username}`
      : `Рисунок от пользователя ID: ${userId}`;
    ctx.telegram.sendPhoto(mainAdminID, photoFileId, { caption });

    // Отправляем подтверждение пользователю
    if (username) {
        ctx.replyWithHTML(
            `Мы получили твой рисунок - спасибо!\nСовсем скоро свяжемся с тобой.\nОжидай сообщения 💌`
        );
    } else {
        ctx.replyWithHTML(
            `Мы получили твой рисунок - спасибо!\nУ нас нет возможности написать вам первыми, т.к. у Вас не указан username\nЕсли хотите обсудить рисунок, то напишете нам ${adminUserName} 💌`
        );
    }
});

// --- Служебные команды для админов ---

bot.command('stats', (ctx) => {
    const userId = String(ctx.from.id);

    // Проверяем, есть ли ID пользователя в нашем списке админов
    if (adminIDs.includes(userId)) {
        try {
            // Формируем URL на основе переменной окружения BOT_URL
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
        // Если команду пытается использовать не админ, бот не будет реагировать.
        // Это стандартная практика для служебных команд.
        console.log(`User ${userId} (not an admin) tried to use /stats command.`);
    }
});


// --- Express-сервер для статистики и вебхуков ---

// Главная страница для проверки, что бот работает
app.get("/", (req, res) => {
  res.send("Hello! Bot server is running correctly.");
});

// Страница статистики
app.get("/stats", async (req, res) => {
    try {
        const { month, year } = req.query; // Получаем параметры фильтра
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

// Служебный код для получения информации о видео
bot.on("video", async (ctx) => {
  const video = ctx.message.video;
  const caption = ctx.message.caption?.trim().toLowerCase();
  const durationSeconds = video.duration;
  const durationMs = durationSeconds * 1000;

  if (caption === "add") {
    await ctx.reply(
      `<code>${video.file_id}</code>\nДлительность: ${durationMs} мс`,
      {
        parse_mode: "HTML",
      }
    );
  }
});

// Служебный код для обработка документов (в том числе видео, загруженных как документ)
bot.on("document", async (ctx) => {
  const fileName = ctx.message.document.file_name;

  if (fileName !== "add.mp4") {
    return;
  }

  // Получаем путь к файлу
  const fileId = ctx.message.document.file_id;
  const fileLink = await ctx.telegram.getFileLink(fileId);

  // Скачиваем файл локально
  const localPath = path.join(__dirname, "add.mp4");
  const response = await axios({
    method: "GET",
    url: fileLink.href,
    responseType: "stream",
  });

  const writer = fs.createWriteStream(localPath);
  response.data.pipe(writer);

  // Ждём завершения записи
  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  // Отправляем как кружок
  const sentMsg = await ctx.replyWithVideoNote({ source: localPath });

  // Отправляем file_id
  if (sentMsg.video_note) {
    await ctx.reply(`✅ file_id видео-кружка: ${sentMsg.video_note.file_id}`);
	await ctx.reply(`Длительность: ${sentMsg.video_note.duration} секунд`);

  } else {
    await ctx.reply("⚠️ Что-то пошло не так, видео-кружок не получен.");
  }

  // Удаляем временный файл
  fs.unlinkSync(localPath);
});

// Установка вебхука
const secretPath = process.env.SECRET_PATH;
app.use(bot.webhookCallback(`/${secretPath}`));
bot.telegram.setWebhook(`${process.env.BOT_URL}/${secretPath}`);

// Запуск сервера
app.listen(process.env.PORT || 3000, () => {
  console.log(`Bot is running on port ${process.env.PORT || 3000}`);
});
