const { Client, MessageActionRow, MessageButton, MessageEmbed, Intents, TextInputComponent, Modal,} = require('discord.js');
const axios = require('axios');
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_TYPING] });
require('dotenv').config();
const express = require('express');

const app = express();

const botToken = process.env.botToken;
let streams = [];

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId  === 'show') {
        const modal = new Modal()
            .setCustomId('myModal')
            .setTitle('My Modal');
        const nameInput =  new TextInputComponent()
            .setCustomId('nameInput')
            .setLabel("Название потока")
            .setStyle('SHORT');
        const tokenInput = new TextInputComponent()
            .setCustomId('tokenInput')
            .setLabel("Твой токен")
            .setStyle('SHORT');
        const channelIdInput = new TextInputComponent()
            .setCustomId('channelIdInput')
            .setLabel("ID канала")
            .setStyle('SHORT');
        const messageTextInput = new TextInputComponent()
            .setCustomId('messageTextInput')
            .setLabel("Текст сообщения")
            .setStyle('PARAGRAPH');
        const periodInput = new TextInputComponent()
            .setCustomId('periodInput')
            .setLabel("Период в минутах")
            .setStyle('SHORT');
        const nameActionRow = new MessageActionRow().addComponents(nameInput);
        const firstActionRow = new MessageActionRow().addComponents(tokenInput);
        const secondActionRow = new MessageActionRow().addComponents(channelIdInput);
        const thirdActionRow = new MessageActionRow().addComponents(messageTextInput);
        const lastActionRow = new MessageActionRow().addComponents(periodInput);
        modal.addComponents(nameActionRow, firstActionRow, secondActionRow, thirdActionRow, lastActionRow);
        await interaction.showModal(modal);
    }
})

client.on('interactionCreate', interaction => {
    if (!interaction.isModalSubmit()) return;
    const name = interaction.fields.getTextInputValue('nameInput');
    const token = interaction.fields.getTextInputValue('tokenInput');
    const channelId = interaction.fields.getTextInputValue('channelIdInput');
    const messageText = interaction.fields.getTextInputValue('messageTextInput');
    const intervalInMinutes = interaction.fields.getTextInputValue('periodInput');
    if (interaction.customId === 'myModal' && token && channelId && messageText && parseInt(intervalInMinutes) > 0) {
        let stream = {
            name: name,
            token: token,
            channelId: channelId,
            messageText: messageText,
            intervalInMinutes: parseInt(intervalInMinutes),
            intervalId: null
        };
        const URL = `https://discord.com/api/v9/channels/${stream.channelId}/messages`
        const payload = { content: `${stream.messageText}` }
        axios.post(URL, payload, { headers: { 'authorization': stream.token } })
            .then((response) => {
                interaction.reply({content: 'Поток успешно создан'});
                stream.intervalId = startPosting(stream);
                streams.push(stream);
            })
            .catch((error) => {
                interaction.reply({content: 'Ошибка создания, повторите попытку!'});
            });
    }
});

client.on('messageCreate', async (message) => {
    if (message.content === '/start') {
        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId('show')
                    .setLabel('Добавить поток')
                    .setStyle('PRIMARY'),
                new MessageButton()
                    .setCustomId('viewStreams')
                    .setLabel('Просмотреть потоки')
                    .setStyle('SECONDARY'),
                new MessageButton()
                    .setCustomId('viewAllInfo')
                    .setLabel('Полная инфа о потоках (чтоб токен заново не искать)')
                    .setStyle('SECONDARY'),
                new MessageButton()
                    .setCustomId('deleteStream')
                    .setLabel('Удалить поток')
                    .setStyle('DANGER'),
            );

        await message.reply({ content: 'Выберите действие:', components: [row] });
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'viewStreams') {
        let streamsText = streams.map((stream, index) => `Поток ${index + 1}: ${stream.name}`).join('\n');
        await interaction.reply({ content: streamsText || 'Нет активных потоков' });
    } else if (interaction.customId === 'deleteStream') {
        const embed = new MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Введите номер потока')
            .setDescription('Введите номер потока, который вы хотите удалить, в следующем формате:\n/deletestream Номер потока');
        await interaction.reply({ embeds: [embed] });
    } else if (interaction.customId === 'viewAllInfo') {
        const description = streams.map((el, index )=> `${index + 1}: Название - ${el.name}, Токен - ${el.token}, Айди канала - ${el.channelId}\n`)
        const embed = new MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Все потоки')
            .setDescription(description.join(""));
        await interaction.reply({ embeds: [embed] });
    }
});

client.on('messageCreate', async (message) => {
    if (message.content.startsWith('/deletestream')) {
        const arg = message.content.split(' ')[1];
        if (arg) {
            let streamNumber = parseInt(arg);
            if (streamNumber > 0 && streamNumber <= streams.length) {
                clearInterval(streams[streamNumber - 1].intervalId);
                streams.splice(streamNumber - 1, 1);
                message.reply(`Поток ${streamNumber} успешно удален`);
            } else {
                message.reply('Неверный номер потока');
            }
        } else {
            message.reply('Неверный формат данных. Пожалуйста, введите данные в следующем формате:\n/deletestream Номер потока');
        }
    }
});

function startPosting(stream) {
    return setInterval(() => {
        const URL = `https://discord.com/api/v9/channels/${stream.channelId}/messages`
        const payload = { content: `${stream.messageText}` }
        axios.post(URL, payload, { headers: { 'authorization': stream.token } })
            .then((response) => {
                console.log(`Сообщение отправлено, ${new Date()}`)
            })
            .catch((error) => {
                console.log(`Сообщение не отправлено, ${new Date()}`)
            });
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


