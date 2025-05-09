require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

const video1 = 'BAACAgIAAxkBAAMDaBzV1qo0HMIY0_kM48OIZ1bRZeEAAiKCAAJuhuhIzHUqNWbJSW42BA';
const video2 = 'BAACAgIAAxkBAAMEaBzZK1T4cQ4e--QkxlBdVXQxOckAAg-DAAJuhuhI3zbkNVXIC482BA';
const video3 = 'BAACAgIAAxkBAAMFaBzZkbsXNKEyOy_-d7-nknnitaYAApeDAAJuhuhIRwGRAAFJfFTKNgQ';

const adminID = '373532023';
const adminUserName = '@dzaviriukha';

bot.use(session());

bot.use((ctx, next) => {
	if (!ctx.session) ctx.session = {};
	return next();
});

// Этап 1
bot.start(async (ctx) => {
	ctx.session.step = 1;

	const videoMsg = await ctx.replyWithVideo(video1, { caption: 'Этап 1: Посмотри, пожалуйста, видео' });
	ctx.session.step1VideoId = videoMsg.message_id;

	await new Promise(resolve => setTimeout(resolve, 10000));

	const buttonMsg = await ctx.reply('Когда посмотришь — нажми, пожалуйста, кнопку «Далее»', {
		reply_markup: {
			inline_keyboard: [[{ text: 'Далее', callback_data: 'step1_done' }]],
		},
	});
	ctx.session.step1ButtonId = buttonMsg.message_id;
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

	const videoMsg = await ctx.replyWithVideo(video2, {
		caption: 'Этап 2: Посмотри, пожалуйста, второе видео',
	});
	ctx.session.step2VideoId = videoMsg.message_id;

	const buttonMsg = await ctx.reply('Когда будешь готов — отправь фото своего рисунка', {
		reply_markup: {
			inline_keyboard: [[{ text: 'Отправить фото', callback_data: 'send_photo' }]],
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
		caption = `Фото от пользователя @${username}`;
		replyMarkup = {
			inline_keyboard: [[
				{ text: `Открыть чат с @${username}`, url: `https://t.me/${username}` }
			]]
		};
	} else {
		caption = `Фото от пользователя без username\ntg://user?id=${userId}`;
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

		// Кнопка для показа видео 3 этапа
		const buttonMsg = await ctx.reply('Финальный шаг! Нажми, чтобы посмотреть видео заключающего этапа 🎬', {
			reply_markup: {
				inline_keyboard: [[{ text: 'Посмотреть видео', callback_data: 'show_final_video' }]]
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

	const buttonMsg = await ctx.reply('Если понравилось, больше можно узнать тут: https://example.com', {
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

	ctx.session.step = 1;

	const videoMsg = await ctx.replyWithVideo(video1, { caption: 'Этап 1: Посмотри, пожалуйста, видео' });
	ctx.session.step1VideoId = videoMsg.message_id;

	const buttonMsg = await ctx.reply('Когда посмотришь — нажми, пожалуйста, кнопку «Далее»', {
		reply_markup: {
			inline_keyboard: [[{ text: 'Далее', callback_data: 'step1_done' }]],
		},
	});
	ctx.session.step1ButtonId = buttonMsg.message_id;
});

// Webhook
app.use(bot.webhookCallback('/secret-path'));
bot.telegram.setWebhook(`${process.env.BOT_URL}/secret-path`);

app.listen(process.env.PORT || 3000, () => {
	console.log('Бот запущен на Railway');
});
