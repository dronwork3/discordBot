const { Client, MessageActionRow, MessageButton, MessageEmbed, Intents, TextInputComponent, Modal} = require('discord.js');
const axios = require('axios');
const express = require('express');
const pg = require('pg');
require('dotenv').config();
const client = new Client({intents:
        [Intents.FLAGS.GUILDS,
            Intents.FLAGS.MESSAGE_CONTENT,
            Intents.FLAGS.GUILD_MESSAGES,
            Intents.FLAGS.GUILD_MESSAGE_TYPING,
            Intents.FLAGS.DIRECT_MESSAGES,
            Intents.FLAGS.DIRECT_MESSAGE_TYPING], partials: ['CHANNEL', 'MESSAGE']});

const app = express();

const botToken = process.env["devBotToken"];
const databaseUrl = process.env.databaseUrl;

const pgClient = new pg.Client(databaseUrl);

pgClient.connect(err => {
    if (err) {
        return console.error("Unable to connect to database", err);
    }
});

let streams;

const loadStreamsFromDb = async () => {
    try {
        const result = await pgClient.query('Select * from streams');
        streams = result.rows.map(el => ({
            ...el,
            channelId: el.channel_id,
            messageText: el.message,
            intervalInMinutes: parseInt(el.interval),
            userId: el.user_id
        }))
    }
    catch (e) {
        console.log(e);
    }
}

const getUserByIdFromDb = async (userId) => {
    try {
        const result = await pgClient.query(`Select * from users where id = '${userId}'`);
        return result.rows;
    }
    catch (e) {
        console.log(e);
    }
}

const saveStreamToDb = async (stream) => {
    try {
        const response = await pgClient.query(
            `INSERT INTO public.streams(
                name, token, channel_id, message, "interval", user_id)
                VALUES ('${stream.name}', '${stream.token}', '${stream.channelId}', '${stream.messageText}', '${stream.intervalInMinutes}', '${stream.userId}') RETURNING *`
        );
        stream.id = response.rows[0].id;
        console.log("Stream was saved to DB: " + JSON.stringify(stream));
    } catch (err) {
        console.error("Error while saving stream to DB " + JSON.stringify(stream));
        throw new Error(err);
    }
}

const updateStreamInDb = async (stream) => {
    try {
        await pgClient.query(
            `UPDATE streams
            SET name=${stream.name}, token=${stream.token}, channel_id=${stream.channelId}, message=${stream.messageText}, "interval"=${stream.intervalInMinutes}
            WHERE streams.id=${stream.id};`
        );
        console.log("Stream was updated in DB: " + JSON.stringify(stream));
    } catch (err) {
        console.error("Error while updating stream in DB " + JSON.stringify(stream));
    }
}

const deleteStreamFromDb = async (stream) => {
    try {
        await pgClient.query(
            `Delete from streams WHERE streams.id=${stream.id};`
        );
        console.log("Stream was deleted in DB: " + JSON.stringify(stream));
    } catch (err) {
        console.error("Error while deleting stream in DB " + JSON.stringify(stream));
    }
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

const onViewStreamsClick = async (interaction) => {
    let streamsText = findStreamsByUserId(interaction.user.id).map((stream, index) => `Поток ${index + 1}: ${stream.name}`).join('\n');
    await interaction.reply({ content: streamsText || 'Нет активных потоков' });
}

const onDeleteStreamClick = async (interaction) => {
    const embed = new MessageEmbed()
        .setColor('#0099ff')
        .setTitle('Введите номер потока')
        .setDescription('Введите номер потока, который вы хотите удалить, в следующем формате:\n/deletestream Номер потока');
    await interaction.reply({embeds: [embed]});
}

const onViewStreamInfoClick = async (interaction) => {
    const description = streams.map((el, index) => `${index + 1}: Название - ${el.name}, Токен - ${el.token}, Айди канала - ${el.channelId}\n`)
    const embed = new MessageEmbed()
        .setColor('#0099ff')
        .setTitle('Все потоки')
        .setDescription(description.join(""));
    await interaction.reply({embeds: [embed]});
}

const onCreationModalClick = async (interaction) => {
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

client.on('interactionCreate', async (interaction) => {
    if (!await isUserAuthorized(interaction.user.id)) {
        return;
    }
    if (!interaction.isButton()) return;
    switch(interaction.customId) {
        case 'viewStreams':
            await onViewStreamsClick(interaction);
            break;
        case 'deleteStream': {
            await onDeleteStreamClick(interaction);
            break;
        }
        case 'viewAllInfo': {
            await onViewStreamInfoClick(interaction);
            break;
        }
        case 'show': {
            await onCreationModalClick(interaction);
            break;
        }
    }
})

const handleStartCommand = async (message) => {
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

const handleDeleteCommand = async (message) => {
    const arg = message.content.split(' ')[1];
    if (arg) {
        let streamNumber = parseInt(arg);
        if (streamNumber > 0 && streamNumber <= streams.length) {
            const stream = findStreamsByUserId(message.author.id)[streamNumber - 1];
            await deleteStream(stream);
            message.reply(`Поток ${streamNumber} успешно удален`);
        } else {
            message.reply('Неверный номер потока');
        }
    } else {
        message.reply('Неверный формат данных. Пожалуйста, введите данные в следующем формате:\n/deletestream Номер потока');
    }
}

const onFormSubmit = (interaction) => {
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
            intervalId: null,
            userId: interaction.user.id
        };
        const URL = `https://discord.com/api/v9/channels/${stream.channelId}/messages`
        const payload = { content: `${stream.messageText}` }
        axios.post(URL, payload, { headers: { 'authorization': stream.token } })
            .then(async (response) => {
                stream.intervalId = startPosting(stream);
                await saveStreamToDb(stream);
                streams.push(stream);
                await interaction.reply({content: 'Поток успешно создан'});
            })
            .catch(async (error) => {
                console.log(error);
                await interaction.reply({content: 'Ошибка создания, повторите попытку!'});
            });
    }
}

client.on('interactionCreate', async interaction => {
    if (! await isUserAuthorized(interaction.user.id)) {
        interaction.reply({ content: 'Вы не имеете доступа к боту! По воспросам подписки обращайтесь к @xandanya.', files: ['https://static.wikia.nocookie.net/gish/images/3/35/Gish_One.png']});
        return;
    }
    if (!interaction.isModalSubmit()) return;
    onFormSubmit(interaction);
});

client.on('messageCreate', async (message) => {
    if (! await isUserAuthorized(message.author.id)) {
        message.reply({ content: 'Вы не имеете доступа к боту! По воспросам подписки обращайтесь к @xandanya.', files: ['https://static.wikia.nocookie.net/gish/images/3/35/Gish_One.png'] });
        return;
    }
    if (message.content.startsWith('/deletestream')) {
        await handleDeleteCommand(message);
    }
    if (message.content === '/start') {
        await handleStartCommand(message);
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
                console.log(`Сообщение не отправлено, ${new Date()}`, error)
            });
    }, stream.intervalInMinutes * 60 * 1000);
}

app.get('/api', (req, res) => {
    res.json({ message: 'Hello from server!' });
});
app.listen(3000, () => console.log('Server running on port 3000'));

const initApp = async () => {
    streams = [];
    await loadStreamsFromDb();
    streams.forEach(stream => {
        startPosting(stream);
    });
    client.login(botToken);
    setInterval(() => {
        console.log("Бот работает")
    }, 1000 * 60 * 5);
}

const findStreamsByUserId = (userId) => {
    return streams.filter(stream => stream.userId == userId);
}

const deleteStream = async (stream) => {
    clearInterval(stream.intervalId);
    await deleteStreamFromDb(stream);
    streams = streams.filter(str => str.id != stream.id);
}

const isUserAuthorized = async (userId) => {
    const usersFromDb = await getUserByIdFromDb(userId);
    if (!(usersFromDb.length && usersFromDb.length > 0)) {
        return false;
    }
    return true;
}

initApp();


