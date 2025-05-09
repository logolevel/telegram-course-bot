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

const adminId = '373532023'; // ID администратора кому отправлять фото

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

	// Сохраняем ID видео-сообщения
	const videoMsg = await ctx.replyWithVideo(video1, { caption: 'Этап 1: Посмотри видео' });
	ctx.session.step1VideoId = videoMsg.message_id;

	// Сообщение с кнопкой "Далее"
	const buttonMsg = await ctx.reply('Когда посмотришь — нажми кнопку «Далее»', {
		reply_markup: {
			inline_keyboard: [[{ text: 'Далее', callback_data: 'step1_done' }]],
		},
	});
	ctx.session.step1ButtonId = buttonMsg.message_id;
});

// Этап 2
bot.action('step1_done', async (ctx) => {
	// Удалим старые сообщения (видео и кнопку)
	try {
		if (ctx.session.step1VideoId) await ctx.deleteMessage(ctx.session.step1VideoId);
		if (ctx.session.step1ButtonId) await ctx.deleteMessage(ctx.session.step1ButtonId);
	} catch (e) {
		console.warn('Ошибка удаления сообщений этапа 1:', e.message);
	}

	ctx.session.step = 2;

	// Видео второго этапа
	const videoMsg = await ctx.replyWithVideo(video2, {
		caption: 'Этап 2: Посмотри видео',
	});
	ctx.session.step2VideoId = videoMsg.message_id;

	// Кнопка "Отправить фото"
	const buttonMsg = await ctx.reply('Когда будешь готов — отправь фото', {
		reply_markup: {
			inline_keyboard: [[{ text: 'Отправить фото', callback_data: 'send_photo' }]],
		},
	});
	ctx.session.step2ButtonId = buttonMsg.message_id;
});

// Кнопка отправки фото — просто инструкция
bot.action('send_photo', async (ctx) => {
	await ctx.reply('Пожалуйста, отправь фотографию сообщением 📷');
});

// Обработка фото
bot.on('photo', async (ctx) => {
	if (ctx.session.step === 2) {
		const photo = ctx.message.photo.pop();
		const targetUserId = adminId;

		try {
			await ctx.telegram.sendPhoto(targetUserId, photo.file_id, {
				caption: `Фото от пользователя ${ctx.from.id}`,
			});
		} catch (err) {
			console.error('Ошибка отправки фото:', err);
			await ctx.reply('Не удалось отправить фото адресату.');
			return;
		}

		// Удаляем сообщения этапа 2
		try {
			if (ctx.session.step2VideoId) await ctx.deleteMessage(ctx.session.step2VideoId);
			if (ctx.session.step2ButtonId) await ctx.deleteMessage(ctx.session.step2ButtonId);
		} catch (e) {
			console.warn('Ошибка удаления сообщений этапа 2:', e.message);
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
