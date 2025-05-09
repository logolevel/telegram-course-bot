require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const express = require('express');

// Создаём экземпляры бота и Express
const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// Видеофайлы из Telegram (File_ID)
const video1 = 'BAACAgIAAxkBAAMDaBzV1qo0HMIY0_kM48OIZ1bRZeEAAiKCAAJuhuhIzHUqNWbJSW42BA';
const video2 = 'BAACAgIAAxkBAAMEaBzZK1T4cQ4e--QkxlBdVXQxOckAAg-DAAJuhuhI3zbkNVXIC482BA';
const video3 = 'BAACAgIAAxkBAAMFaBzZkbsXNKEyOy_-d7-nknnitaYAApeDAAJuhuhIRwGRAAFJfFTKNgQ';

// Используем сессии
bot.use(session());

// 🔧 Добавляем middleware для инициализации ctx.session
bot.use((ctx, next) => {
	if (!ctx.session) ctx.session = {};
	return next();
});

// Этап 1
bot.start(async (ctx) => {
	ctx.session.step = 1;
	await ctx.replyWithVideo(video1, { caption: 'Этап 1: Посмотри видео' });

	setTimeout(() => {
		ctx.reply('Когда посмотришь — нажми кнопку «Далее»', {
			reply_markup: {
				inline_keyboard: [[{ text: 'Далее', callback_data: 'step1_done' }]],
			},
		});
	}, 10000);
});

// Этап 2
bot.action('step1_done', async (ctx) => {
	ctx.session.step = 2;
	await ctx.replyWithVideo(video2, {
		caption: 'Этап 2: Посмотри видео и отправь картинку.',
	});
});

// Принимаем фото от пользователя
bot.on('photo', async (ctx) => {
	if (ctx.session.step === 2) {
		const photo = ctx.message.photo.pop();
		const targetUsername = 'dzaviriukha'; // можно заменить на user ID
		try {
			await ctx.telegram.sendPhoto(targetUsername, photo.file_id, {
				caption: `Фото от пользователя @${ctx.from.username || ctx.from.id}`,
			});
		} catch (err) {
			console.error('Ошибка отправки фото:', err);
			await ctx.reply('Не удалось отправить фото адресату.');
			return;
		}

		ctx.session.step = 3;
		await ctx.replyWithVideo(video3, {
			caption: 'Этап 3: Финальное видео и ссылка: https://example.com',
		});
	}
});

// Настройка webhook
app.use(bot.webhookCallback('/secret-path'));
bot.telegram.setWebhook(`${process.env.BOT_URL}/secret-path`);

// Запуск Express-сервера
app.listen(process.env.PORT || 3000, () => {
	console.log('Бот запущен на Railway');
});
