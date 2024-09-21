import http from 'node:http'
import https from 'node:https'
import express from 'express'
import socketIo from 'socket.io'
import fs from 'node:fs'
import { logger } from './logger'

const MAX_USER = 2

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

const httpServer = http.createServer(app)
httpServer.listen(80, '0.0.0.0')


const options = {
  key: fs.readFileSync('./cert/iroii.buzz.key'),
  cert: fs.readFileSync('./cert/iroii.buzz_bundle.pem')
}
const httpsServer = https.createServer(options, app)
const io = new socketIo.Server(httpsServer)

io.on('connection', (socket) => {
  socket.on('message', (room, data) => {
    logger.debug(`message, room: ${room}, data, type: ${data.type}`)
    socket.to(room).emit('message', room, data)
  })

  socket.on('join', (room: string) => {
    const currentRoom: Set<string> | undefined = io.sockets.adapter.rooms[room]
    // const currentRoom = socket.rooms[room]
    const nUsers = currentRoom?.size ?? 0
    logger.debug(`room ${room} has ${nUsers} users`)

    if (nUsers < MAX_USER) {
      socket.join(room);
      socket.emit('joined', room, socket.id)

      if (nUsers > 1) {
        socket.to(room).emit('other join', room, socket.id)
      }
    } else {
      // 人满
      socket.to(room).emit('full', room, socket.id)
    }
  })
 
  socket.on('leave', (room) => {
    socket.leave(room)

    const currentRoom = io.sockets.adapter.rooms[room]
    const nUsers = currentRoom?.size ?? 0
    logger.debug(`room has ${nUsers} users now`)
    socket.to(room).emit('bye', room, socket.id)
    socket.emit('left', room, socket.id)
  })
})

httpsServer.listen(443, '0.0.0.0')