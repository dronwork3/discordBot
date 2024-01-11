const { Client, MessageActionRow, MessageButton, MessageEmbed, Intents } = require('discord.js');
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_TYPING] });
const autosend = require("discord-autosender");
require('dotenv').config();
const express = require('express');

const app = express();

const botToken = process.env.botToken;
let streams = [];

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    if (message.content === '/start') {
        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId('addStream')
                    .setLabel('Добавить поток')
                    .setStyle('PRIMARY'),
                new MessageButton()
                    .setCustomId('viewStreams')
                    .setLabel('Просмотреть потоки')
                    .setStyle('SECONDARY'),
                new MessageButton()
                    .setCustomId('deleteStream')
                    .setLabel('Удалить поток')
                    .setStyle('DANGER')
            );

        await message.reply({ content: 'Выберите действие:', components: [row] });
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'addStream') {
        const embed = new MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Введите данные')
            .setDescription('Введите данные в следующем формате:\n/addstream&token={token}&channelId={channelId}&messageText={messageText}&intervalInMinutes={intervalInMinutes}');
        await interaction.reply({ embeds: [embed] });
    } else if (interaction.customId === 'viewStreams') {
        let streamsText = streams.map((stream, index) => `Stream ${index + 1}: ${stream.messageText}`).join('\n');
        await interaction.reply({ content: streamsText || 'Нет активных потоков' });
    } else if (interaction.customId === 'deleteStream') {
        const embed = new MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Введите номер потока')
            .setDescription('Введите номер потока, который вы хотите удалить, в следующем формате:\n/deletestream&streamNumber={streamNumber}');
        await interaction.reply({ embeds: [embed] });
    }
});

client.on('messageCreate', async (message) => {
    if (message.content.startsWith('/addstream')) {
        const args = message.content.slice(11).split('&').reduce((acc, arg) => {
            const [key, value] = arg.split('={');
            acc[key] = value.substring(0, value.length - 1);
            return acc;
        }, {});
        console.log(args);
        if (args.token && args.channelId && args.messageText && args.intervalInMinutes) {
            let stream = {
                token: args.token,
                channelId: args.channelId,
                messageText: args.messageText,
                intervalInMinutes: parseInt(args.intervalInMinutes),
                intervalId: null
            };
            autosend.Post(stream.messageText, stream.channelId, stream.token)
            stream.intervalId = startPosting(stream);
            streams.push(stream);
        } else {
            message.reply('Неверный формат данных. Пожалуйста, введите данные в следующем формате:\n/addstream&token={token}&channelId={channelId}&messageText={messageText}&intervalInMinutes={intervalInMinutes}');
        }
    } else if (message.content.startsWith('/deletestream')) {
        const args = message.content.slice(14).split('&').reduce((acc, arg) => {
            const [key, value] = arg.split('={');
            acc[key] = value.substring(0, value.length - 1);
            return acc;
        }, {});
        if (args.streamNumber) {
            let streamNumber = parseInt(args.streamNumber);
            console.log(streamNumber);
            if (streamNumber > 0 && streamNumber <= streams.length) {
                clearInterval(streams[streamNumber - 1].intervalId);
                streams.splice(streamNumber - 1, 1);
                message.reply(`Поток ${streamNumber} успешно удален`);
            } else {
                message.reply('Неверный номер потока');
            }
        } else {
            message.reply('Неверный формат данных. Пожалуйста, введите данные в следующем формате:\n/deletestream&streamNumber={streamNumber}');
        }
    }
});

function startPosting(stream) {
    return setInterval(() => {
        autosend.Post(stream.messageText, stream.channelId, stream.token)
        console.log(`Сообщение отправлено, ${new Date()}`)
    }, stream.intervalInMinutes * 60 * 1000);
}

client.login(botToken);

setInterval(() => {
    console.log("Бот работает")
}, 1000 * 60 * 5);

app.get('/api', (req, res) => {
    res.json({ message: 'Hello from server!' });
});
app.listen(3000, () => console.log('Server running on port 3000'));


