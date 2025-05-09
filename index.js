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

	const msg = await ctx.reply('Когда посмотришь — нажми кнопку «Далее»', {
		reply_markup: {
			inline_keyboard: [[{ text: 'Далее', callback_data: 'step1_done' }]],
		},
	});

	ctx.session.step1MessageId = msg.message_id; // запомним ID сообщения для удаления
});

// Этап 2: после нажатия «Далее»
bot.action('step1_done', async (ctx) => {
	try {
		// Удалим сообщение с кнопкой «Далее»
		if (ctx.session.step1MessageId) {
			await ctx.deleteMessage(ctx.session.step1MessageId);
		}
	} catch (e) {
		console.warn('Не удалось удалить сообщение этапа 1:', e.message);
	}

	ctx.session.step = 2;
	await ctx.replyWithVideo(video2, {
		caption: 'Этап 2: Посмотри видео',
	});

	// Добавим кнопку «Отправить фото»
	await ctx.reply('Когда будешь готов — отправь фото', {
		reply_markup: {
			inline_keyboard: [[{ text: 'Отправить фото', callback_data: 'send_photo' }]],
		},
	});
});

// Инструкция по отправке фото
bot.action('send_photo', async (ctx) => {
	await ctx.reply('Пожалуйста, отправь фотографию прямо сюда сообщением 📷');
});

// Приём фото
bot.on('photo', async (ctx) => {
	if (ctx.session.step === 2) {
		const photo = ctx.message.photo.pop();
		const targetUsername = '@dzaviriukha'; // или user ID

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
