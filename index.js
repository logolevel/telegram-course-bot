require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

const video1 = 'BAACAgIAAxkBAAMDaBzV1qo0HMIY0_kM48OIZ1bRZeEAAiKCAAJuhuhIzHUqNWbJSW42BA';
const video2 = 'BAACAgIAAxkBAAMEaBzZK1T4cQ4e--QkxlBdVXQxOckAAg-DAAJuhuhI3zbkNVXIC482BA';
const video3 = 'BAACAgIAAxkBAAMFaBzZkbsXNKEyOy_-d7-nknnitaYAApeDAAJuhuhIRwGRAAFJfFTKNgQ';

bot.use(session());

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

bot.action('step1_done', async (ctx) => {
	ctx.session.step = 2;
	await ctx.replyWithVideo(video2, {
		caption: 'Этап 2: Посмотри видео и отправь картинку.',
	});
});

bot.on('photo', async (ctx) => {
	if (ctx.session.step === 2) {
		const photo = ctx.message.photo.pop();
		const targetUserId = 'dzaviriukha';
		await ctx.telegram.sendPhoto(targetUserId, photo.file_id, {
			caption: `Фото от пользователя @${ctx.from.username || ctx.from.id}`,
		});

		ctx.session.step = 3;
		await ctx.replyWithVideo(video3, {
			caption: 'Этап 3: Финальное видео и ссылка: https://example.com',
		});
	}
});

// Настройка webhook
app.use(bot.webhookCallback('/secret-path'));
bot.telegram.setWebhook(`${BOT_URL}/secret-path`);

app.listen(process.env.PORT || 3000, () => {
	console.log('Бот запущен на Railway');
});
