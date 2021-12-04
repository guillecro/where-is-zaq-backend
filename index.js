require('dotenv').config()
const express = require('express');
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

let messagesUnanswered = []


app.get('/', (req, res) => {
  res.send('<h1>Hello world</h1>');
});

// deliver a image from the assets folder by name of the file
app.get('/assets/:file', (req, res) => {
  res.sendFile(`${__dirname}/assets/${req.params.file}`);
});

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);
  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
  });
  socket.on('sendMessage', (msg) => {
    console.log('message: ', msg, socket.id);
    bot.telegram.sendMessage(process.env.GROUP_ID,`Socket <code>${socket.id}</code>\n\n<b>${msg.player}</b>\n<i>${msg.message}</i>`,{parse_mode: 'HTML'})
    .then(msg => {
      messagesUnanswered.push(msg.message_id)
      console.log(messagesUnanswered)
    })
  });
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});

// bot.telegram.getMe().then((botInfo) => {
//   bot.options.username = botInfo.username
// })

bot.on('message', (ctx) => {
  // If the message doesn't come from the group, discard
  console.log(ctx.message)
  if(ctx.chat.id != process.env.GROUP_ID) return
  // If message is a bot_command...
  if(ctx.message.entities && ctx.message.entities[0].type == 'bot_command') {
    // ... and the command is /start...
    if(ctx.message.text.split(' ')[0] == '/start') {
      // ... send a welcome message
      ctx.reply('Welcome to the group!')
    }
    // ... and the command is /stop...
    if(ctx.message.text.split(' ')[0] == '/stop') {
      // ... send a goodbye message
      ctx.reply('Goodbye!')
    }
    if(ctx.message.text.split(' ')[0] == '/queue') {
      ctx.reply(`${messagesUnanswered.length} messages unanswered`)
    }
    if(ctx.message.text.split(' ')[0] == '/clear') {
      messagesUnanswered = []
      ctx.reply('Messages cleared!')
    }
  }

  // If the message is not a reply, discard
  if(!ctx.message.reply_to_message) {
    // ctx.reply(`<code>It needs to be a reply from a message I've sent</code>`,{parse_mode: 'HTML'})
    return
  }
  /// If the message is not a reply to a message from the bot, discard
  if(!messagesUnanswered.includes(ctx.message.reply_to_message.message_id)) {
    ctx.reply(`<code>This message has already been sent\nor it never existed?...</code>`,{parse_mode: 'HTML'})
    return
  }
  messagesUnanswered = messagesUnanswered.filter(id => id != ctx.message.reply_to_message.message_id)
  // get a substring that starts with "Socket " and ends with a new line
  let socketId = ctx.message.reply_to_message.text.match(/Socket (.*)/)[1]
  if(ctx.message.text){
    io.to(socketId).emit('recieveMessage', ctx.message.text)
  } else if(ctx.message.photo) {
    ctx.telegram.getFileLink(ctx.message.photo[ctx.message.photo.length - 1].file_id).then(url => {
      let filename = `${ctx.message.photo[ctx.message.photo.length - 1].file_id}`
      // console.log(filename)
      console.log(url)
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
    // Download the telegram sticker
    bot.telegram.getFileLink(ctx.message.sticker.file_id).then(url => {
      // Save the image from the url in the public folder
      let filename = `${ctx.message.sticker.file_id}`
      // console.log(filename)
      console.log(url)
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
