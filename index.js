require('dotenv').config()
const express = require('express');
const winston = require('winston');
const app = express();
const http = require('http');
const https = require('https');
const fs = require('fs');
const server = http.createServer(app);
const { Server } = require("socket.io");
const { Telegraf } = require("telegraf")


const io = new Server(server,{
  cors: {
    origin: process.env.APP_URL,
    methods: ["GET", "POST"]
  }
});

const bot = new Telegraf(process.env.BOT_TOKEN, {
  username: 'whereiszaq_bot'
})

// Logger configuration
const logConfiguration = {
  'transports': [
    new winston.transports.File({
      filename: `${__dirname}/app.log`
    }),
    new winston.transports.Console({
      level: 'debug'
    })
  ]
};

const logger = winston.createLogger(logConfiguration);


let messagesUnanswered = []


app.get('/', (req, res) => {
  logger.info({event: 'bitch tried to enter'});
  res.send('<h1>THE TRAITOR IS VERY CLOSE TO YOU</h1>');
});

// deliver a image from the assets folder by name of the file
app.get('/assets/:file', (req, res) => {
  res.sendFile(`${__dirname}/assets/${req.params.file}`);
});

io.on('connection', (socket) => {
  logger.info({event: 'a user connected', socket: socket.id});
  socket.on('disconnect', () => {
    logger.info({event: 'user disconnected', socket: socket.id});
  });
  socket.on('sendMessage', (msg) => {
    logger.info({event: 'sending to telegram', player: msg.player, socket: socket.id, text: msg.message});
    bot.telegram.sendMessage(process.env.GROUP_ID,`Socket <code>${socket.id}</code>\n\n<b>${msg.player}</b>\n<i>${msg.message}</i>`,{parse_mode: 'HTML'})
    .then(sentMsg => {
    logger.info({event: 'sent to telegram', message_id: sentMsg.message_id, text: msg.message, player: msg.player, socket: socket.id});
      messagesUnanswered.push(sentMsg.message_id)
      logger.info({queue: messagesUnanswered})
    })
  });
});

server.listen(3000, () => {
  logger.info('Starting server. listening on *:3000');
});

// bot.telegram.getMe().then((botInfo) => {
//   bot.options.username = botInfo.username
// })

bot.on('message', (ctx) => {
  // If the message doesn't come from the group, discard
  if(ctx.chat.id != process.env.GROUP_ID) return
  // If message is a bot_command...
  if(ctx.message.entities && ctx.message.entities[0].type == 'bot_command') {
    // ... and the command is /start...
    if(ctx.message.text.split(' ')[0] == '/start') {
      logger.info({event: 'bot command', type: 'silly hello'});
      // ... send a welcome message
      ctx.reply('Welcome to the group!')
    }
    // ... and the command is /stop...
    if(ctx.message.text.split(' ')[0] == '/stop') {
      logger.info({event: 'bot command', type: 'silly bye'});
      // ... send a goodbye message
      ctx.reply('Goodbye!')
    }
    if(ctx.message.text.split(' ')[0] == '/queue') {
      logger.info({event: 'bot command', type: 'check queue'});
      ctx.reply(`${messagesUnanswered.length} messages unanswered`)
    }
    if(ctx.message.text.split(' ')[0] == '/clear') {
      messagesUnanswered = []
      logger.info({event: 'bot command', type: 'clear queue'});
      ctx.reply('Messages cleared!')
    }
  }

  // If the message is not a reply, discard
  if(!ctx.message.reply_to_message) {
    logger.warn({event: 'telegram message', type: 'not a reply'});
    // ctx.reply(`<code>It needs to be a reply from a message I've sent</code>`,{parse_mode: 'HTML'})
    return
  }
  /// If the message is not a reply to a message from the bot, discard
  if(!messagesUnanswered.includes(ctx.message.reply_to_message.message_id)) {
    logger.info({event: 'telegram message', type: 'already replied or doesn\'t exist'});
    ctx.reply(`<code>This message has already been sent\nor it never existed?...</code>`,{parse_mode: 'HTML'})
    return
  }
  messagesUnanswered = messagesUnanswered.filter(id => id != ctx.message.reply_to_message.message_id)
  // get a substring that starts with "Socket " and ends with a new line
  let socketId = ctx.message.reply_to_message.text.match(/Socket (.*)/)[1]
  if(ctx.message.text){
    logger.info({event: 'telegram message', type: 'text', message_id: ctx.message.reply_to_message.message_id, text: ctx.message.text, socket: socketId});
    io.to(socketId).emit('recieveMessage', ctx.message.text)
  } else if(ctx.message.photo) {
    logger.info({event: 'telegram message', type: 'photo', message_id: ctx.message.reply_to_message.message_id, file: ctx.message.photo[ctx.message.photo.length - 1].file_id, socket: socketId});
    ctx.telegram.getFileLink(ctx.message.photo[ctx.message.photo.length - 1].file_id).then(url => {
      let filename = `${ctx.message.photo[ctx.message.photo.length - 1].file_id}`
      // logger.info(filename)
      // logger.info(url)
      // get the extension of file from the url
      let extension = url.href.split('.').pop()
      let path = `${__dirname}/assets/${filename}.${extension}`
      const file = fs.createWriteStream(path)
      const request = https.get(url, function(response) {
        response.pipe(file)
        file.on('finish', function() {
          file.close()
          // Send the url of the image 
          io.to(socketId).emit('recieveImage', '/assets/'+filename+'.'+extension)
        })
      })
    })

  } else if(ctx.message.sticker) {
    logger.info({event: 'telegram sticket', type: 'photo', message_id: ctx.message.reply_to_message.message_id, file: ctx.message.sticker.file_id, socket: socketId});
    // Download the telegram sticker
    bot.telegram.getFileLink(ctx.message.sticker.file_id).then(url => {
      // Save the image from the url in the public folder
      let filename = `${ctx.message.sticker.file_id}`
      // logger.info(filename)
      // logger.info(url)
      // get the extension of file from the url
      let extension = url.href.split('.').pop()
      let path = `${__dirname}/assets/${filename}.${extension}`
      const file = fs.createWriteStream(path)
      const request = https.get(url, function(response) {
        response.pipe(file)
        file.on('finish', function() {
          file.close()
          // Send the url of the image 
          io.to(socketId).emit('recieveSticker', '/assets/'+filename+'.'+extension)
        })
      })
    })
  }
})

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
