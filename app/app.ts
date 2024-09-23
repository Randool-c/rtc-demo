import http from 'node:http'
import https from 'node:https'
import express from 'express'
import * as socketIo from 'socket.io'
import fs from 'node:fs'
import { logger } from './logger'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_USER = 2
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()

app.all('*', (req, res, next) => {
  res.header('Access-Control-Allow-Orign', '*')
  res.header('Access-Control-Allow-Headers', 'content-type')
  res.header('Access-Control-Allow-Methods', 'DELETE,PUT,POST,GET,OPTIONS')
  if (req.method.toLowerCase() === 'options') {
    res.send(200)
  } else {
    next()
  }
})

app.use(express.static(path.resolve(__dirname, './dist')))

app.get('/', (req, res) => {
  // res.sendFile(path.resolve(__dirname, './dist/index.html'))
  res.sendFile('./index.html')
})

const httpServer = http.createServer(app)
httpServer.listen(80, '0.0.0.0')

const options = {
  key: fs.readFileSync(path.resolve(__dirname, './cert/iroii.buzz.key')),
  cert: fs.readFileSync(path.resolve(__dirname, './cert/iroii.buzz_bundle.pem'))
}
const httpsServer = https.createServer(options, app)
const io = new socketIo.Server(httpsServer)

io.on('connection', (socket) => {
  socket.on('message', (room, data) => {
    logger.debug(`message, room: ${room}, data, type: ${data.type}`)
    socket.to(room).emit('message', room, data)
  })

  socket.on('join', async (room: string) => {
    const nUsers = (await io.in(room).allSockets()).size
    logger.debug(`room ${room} has ${nUsers} users for socket id ${socket.id}`)

    if (nUsers < MAX_USER) {
      await socket.join(room);
      socket.emit('joined', room, socket.id)

      if (nUsers >= 1) {
        socket.to(room).emit('other_join', room, socket.id)
      }
    } else {
      // 人满
      socket.emit('full', room, socket.id)
    }
  })
 
  socket.on('leave', async (room) => {
    socket.leave(room)

    const nUsers = (await io.in(room).allSockets()).size
    logger.debug(`room has ${nUsers} users now`)
    socket.to(room).emit('bye', room, socket.id)
    socket.emit('left', room, socket.id)
  })

})

httpsServer.listen(443, '0.0.0.0')