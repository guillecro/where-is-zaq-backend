require('dotenv').config()
const express = require('express');
const app = express();
const http = require('http');
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
  if(ctx.chat.id != process.env.GROUP_ID) return
  // If the message is not a reply, discard
  if(!ctx.message.reply_to_message) {
    // ctx.reply(`<code>It needs to be a reply from a message I've sent</code>`,{parse_mode: 'HTML'})
    return
  }
  /// If the message is not a reply to a message from the bot, discard
  if(!messagesUnanswered.includes(ctx.message.reply_to_message.message_id)) {
    ctx.reply(`<code>This message has already been sent\nor it never existed?...</code>`,{parse_mode: 'HTML'})
  }
  messagesUnanswered = messagesUnanswered.filter(id => id != ctx.message.reply_to_message.message_id)
  // get a substring that starts with "Socket " and ends with a new line
  let socketId = ctx.message.reply_to_message.text.match(/Socket (.*)/)[1]
  io.to(socketId).emit('recieveMessage', ctx.message.text)
})

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
