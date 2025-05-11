require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const db = require('./db');
const axios = require('axios');

const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

const video1 = 'BAACAgIAAxkBAAMDaBzV1qo0HMIY0_kM48OIZ1bRZeEAAiKCAAJuhuhIzHUqNWbJSW42BA';
const video2 = 'BAACAgIAAxkBAAMEaBzZK1T4cQ4e--QkxlBdVXQxOckAAg-DAAJuhuhI3zbkNVXIC482BA';
const video3 = 'BAACAgIAAxkBAAMFaBzZkbsXNKEyOy_-d7-nknnitaYAApeDAAJuhuhIRwGRAAFJfFTKNgQ';

const video1TimeOut = 10000;
const video2TimeOut = 26000;
const video3TimeOut = 33000;

const adminID = '373532023';
const adminUserName = '@dzaviriukha';

db.init().catch(console.error);

bot.use(session());

bot.use((ctx, next) => {
	if (!ctx.session) ctx.session = {};
	return next();
});

async function sendStep1(ctx) {
	ctx.session.step = 1;

	const videoMsg = await ctx.replyWithVideo(video1, {
		caption: 'Этап 1: Посмотри, пожалуйста, это видео',
	});
	ctx.session.step1VideoId = videoMsg.message_id;

	await new Promise((resolve) => setTimeout(resolve, video1TimeOut));

	const buttonMsg = await ctx.reply('Когда закончишь просмотр — взгляни, пожалуйста, на «Сообщение от Анастасии»',
		{
			reply_markup: {
				inline_keyboard: [[{ text: 'Сообщение от Анастасии', callback_data: 'step1_done' }]],
			},
		}
	);
	ctx.session.step1ButtonId = buttonMsg.message_id;
}


// Этап 1
bot.start(async (ctx) => {
	await sendStep1(ctx);

	// Update db
	await db.upsertUser(ctx.from.id, ctx.from.username);
	await db.updateStep(ctx.from.id, 1);
});

// Этап 2
bot.action('step1_done', async (ctx) => {
	try {
		if (ctx.session.step1VideoId) await ctx.deleteMessage(ctx.session.step1VideoId);
		if (ctx.session.step1ButtonId) await ctx.deleteMessage(ctx.session.step1ButtonId);
	} catch (e) {
		console.warn('Ошибка удаления сообщений этапа 1:', e.message);
	}

	ctx.session.step = 2;

	// Update db
	await db.updateStep(ctx.from.id, 2);

	const videoMsg = await ctx.replyWithVideo(video2, {
		caption: 'Этап 2: Это видео с Настей',
	});
	ctx.session.step2VideoId = videoMsg.message_id;

	await new Promise(resolve => setTimeout(resolve, video2TimeOut));

	const buttonMsg = await ctx.reply('Когда будешь готов — отправь фото своего рисунка', {
		reply_markup: {
			inline_keyboard: [[{ text: 'Отправить фото своего рисунка', callback_data: 'send_photo' }]],
		},
	});
	ctx.session.step2ButtonId = buttonMsg.message_id;
});

// Инструкция к отправке фото
bot.action('send_photo', async (ctx) => {
	const msg = await ctx.reply('Пожалуйста, прикрепи фотографию 📷 сообщением ⬇️ 📎');
	ctx.session.sendPhotoInstructionId = msg.message_id;
});

function getUserContactInfo(user) {
	const userId = user.id;
	const username = user.username;

	let caption = '';
	let replyMarkup;

	if (username) {
		caption = `Рисунок от пользователя @${username}`;
		replyMarkup = {
			inline_keyboard: [[
				{ text: `Открыть чат с @${username}`, url: `https://t.me/${username}` }
			]]
		};
	} else {
		caption = `Рисунок от пользователя без username\ntg://user?id=${userId}, скорее всего не откроется, т.к. пользователь не указал username`;
	}

	return { caption, reply_markup: replyMarkup };
}

// Фото от пользователя
bot.on('photo', async (ctx) => {
	if (ctx.session.step === 2) {
		const photo = ctx.message.photo.pop();
		const { caption, reply_markup } = getUserContactInfo(ctx.from);

		try {
			await ctx.telegram.sendPhoto(adminID, photo.file_id, {
				caption,
				reply_markup,
			});

			if (ctx.from.username) {
				await ctx.reply('Вы отправили это фото. Мы получили его и скоро свяжемся с вами ✉️');
			} else {
				await ctx.reply(`Вы отправили это фото, но у нас нет возможности написать вам первыми 😕\n\nЕсли хотите обсудить — напишите нам напрямую: ${adminUserName}`);
			}
		} catch (err) {
			console.error('Ошибка отправки фото:', err);
			await ctx.reply('Не удалось отправить фото адресату.');
			return;
		}

		// Удаляем сообщение-инструкцию "Прикрепи фото"
		if (ctx.session.sendPhotoInstructionId) {
			try {
				await ctx.deleteMessage(ctx.session.sendPhotoInstructionId);
				ctx.session.sendPhotoInstructionId = null;
			} catch (e) {
				console.warn('Ошибка при удалении инструкции к фото:', e.message);
			}
		}

		// Удаляем сообщения этапа 2
		try {
			if (ctx.session.step2VideoId) await ctx.deleteMessage(ctx.session.step2VideoId);
			if (ctx.session.step2ButtonId) await ctx.deleteMessage(ctx.session.step2ButtonId);
		} catch (e) {
			console.warn('Ошибка удаления сообщений этапа 2:', e.message);
		}

		ctx.session.step = 3;

		// Update db
		await db.markPhotoSent(ctx.from.id);

		// Кнопка для показа видео 3 этапа
		const buttonMsg = await ctx.reply('Финальный шаг! Нажми, пожалуйста, чтобы посмотреть видео заключающего этапа 🎬', {
			reply_markup: {
				inline_keyboard: [[{ text: 'Посмотреть финальное видео', callback_data: 'show_final_video' }]]
			}
		});
		ctx.session.showFinalVideoButtonId = buttonMsg.message_id;
	}
});

// Показываем видео финального этапа по кнопке
bot.action('show_final_video', async (ctx) => {
	if (ctx.session.showFinalVideoButtonId) {
		try {
			await ctx.deleteMessage(ctx.session.showFinalVideoButtonId);
		} catch (e) {
			console.warn('Ошибка удаления кнопки показа финального видео:', e.message);
		}
	}

	const videoMsg = await ctx.replyWithVideo(video3, {
		caption: 'Этап 3: Финальное видео',
	});
	ctx.session.step3VideoId = videoMsg.message_id;

	// Update db
	await db.updateStep(ctx.from.id, 3);

	await new Promise(resolve => setTimeout(resolve, video3TimeOut));

	const buttonMsg = await ctx.reply('Если понравилось, то можешь записаться на консультацию тут: https://example.com', {
		reply_markup: {
			inline_keyboard: [[
				{ text: 'Завершить', callback_data: 'finish_course' }
			]]
		}
	});
	ctx.session.step3ButtonId = buttonMsg.message_id;
});

// Завершение
bot.action('finish_course', async (ctx) => {
	if (ctx.session.step3VideoId) {
		await ctx.deleteMessage(ctx.session.step3VideoId).catch((e) => console.warn('Не удалось удалить видео этапа 3:', e.message));
	}
	if (ctx.session.step3ButtonId) {
		await ctx.deleteMessage(ctx.session.step3ButtonId).catch((e) => console.warn('Не удалось удалить кнопку этапа 3:', e.message));
	}

	const finishMsg = await ctx.reply('Спасибо, что познакомился с курсом! 🎉', {
		reply_markup: {
			inline_keyboard: [[{ text: 'Пройти заново', callback_data: 'restart' }]]
		}
	});
	ctx.session.finishMessageId = finishMsg.message_id;
});

// Рестарт курса
bot.action('restart', async (ctx) => {
	await ctx.answerCbQuery();

	if (ctx.session.finishMessageId) {
		await ctx.deleteMessage(ctx.session.finishMessageId).catch((e) => console.warn('Не удалось удалить финальное сообщение:', e.message));
		ctx.session.finishMessageId = null;
	}

	await ctx.reply('Правильно! Давай ещё разок');
	await ctx.reply('⬇️ Повторение - мать ученья 😃 ⬇️');

	await sendStep1(ctx);
});

// Служебный код для получения информации о видео
bot.on('video', async (ctx) => {
	const video = ctx.message.video;
	const caption = ctx.message.caption?.trim().toLowerCase();
	const durationSeconds = video.duration;
	const durationMs = durationSeconds * 1000;

	if (caption === 'add') {
		await ctx.reply(`<code>${video.file_id}</code>\nДлительность: ${durationMs} мс`, {
			parse_mode: 'HTML',
		});
	}
});

bot.command('stats', async (ctx) => {
	const adminId = ctx.from.id.toString();
	if (adminId !== adminID) {
		return ctx.reply('⛔️ Доступ запрещён');
	}

	const stats = await db.getStats();

	const step1 = parseInt(stats.step1 || 0);
	const step2 = parseInt(stats.step2 || 0);
	const step3 = parseInt(stats.step3 || 0);
	const sentPhotos = parseInt(stats.sent_photos || 0);

	const text = `📊 <b>Аналитика прохождения курса:</b>\n\n` +
		`👥 Этап 1: <b>${step1}</b>\n` +
		`🎞 Этап 2: <b>${step2}</b>\n` +
		`📷 Фото отправили: <b>${sentPhotos}</b>\n` +
		`🎬 Этап 3: <b>${step3}</b>`;

	// Генерация URL графика через QuickChart
	const chartConfig = {
		type: 'bar',
		data: {
			labels: ['Этап 1', 'Этап 2', 'Фото', 'Этап 3'],
			datasets: [{
				label: 'Количество',
				data: [step1, step2, sentPhotos, step3],
				backgroundColor: ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2']
			}]
		}
	};

	const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

	// Отправка текста и графика
	await ctx.replyWithPhoto({ url: chartUrl }, { caption: '📈 График прохождения этапов' });
	await ctx.reply(text, { parse_mode: 'HTML' });
});



// Webhook
app.use(bot.webhookCallback('/secret-path'));
bot.telegram.setWebhook(`${process.env.BOT_URL}/secret-path`);

app.listen(process.env.PORT || 3000, () => {
	console.log('Бот запущен на Railway');
});
