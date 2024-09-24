<template>
  <div class="app">
    <div class="config">
      <div class="config__inputs">
        <label for="room-id">room id: </label>
        <input class="room-id" id="room-id" type="text" v-model="roomId" />
      </div>
      <div class="config__submits">
        <button class="btn-enter" @click="enterRoom">enter</button>
        <span v-if="state === 'joining'">进入房间中。。。</span>
        <button class="btn-exit" @click="exitRoom">exit</button>
      </div>
    </div>
    <div class="videos">
      <div class="video-wrapper">
        <div class="video-wrapper__title">{{ state === 'joined' ? 'local' : '' }}</div>
        <video class="video-wrapper__video videos-wrapper__local" playsinline autoplay ref="localVideoRef" />
      </div>
      <div class="video-wrapper">
        <div class="video-wrapper__title">{{ remoteUser }}</div>
        <video class="videos-wrapper__video videos-wrapper__remote" playsinline autoplay ref="remoteVideoRef" />
      </div>
    </div>
    <div class="messages"></div>
  </div>
</template>

<script lang="ts" setup>
import { io } from 'socket.io-client';
import { onBeforeUnmount, ref } from 'vue'
import { createRTCPeerConnection, getLocalStreams } from './helpers';

interface RTCCandidateMessage {
  type: 'candidate';
  candidate: RTCIceCandidate;
}

type RTCMessage = RTCCandidateMessage | RTCSessionDescriptionInit

const RTCConfig = {
  iceServers: [
    { urls: 'stun:42.193.125.56:8800', username: 'chenst', credential: '123456'},
    { urls: 'turns:42.193.125.56:8805', username: 'chenst', credential: '123456'}
  ],
}

const localVideoRef = ref()
const remoteVideoRef = ref()

const roomId = ref('test')
const socket = io('ws://42.193.125.56')
const state = ref<'init' | 'joining' | 'joined'>('init')
const remoteUser = ref<string>('')
let currentPc: null | RTCPeerConnection = null;
let localStream: null | MediaStream = null;

const enterRoom = async () => {
  // 创建rtcpeerconnection
  if (!localStream) {
    try {
      localStream = await getLocalStreams()
    } catch (err) {
      console.error(err)
      alert(err?.toString())
    }
  }
  socket?.emit('join', roomId.value)
}

const exitRoom = () => {
  socket?.emit('leave', roomId.value)
}

const sendMessage = (roomId: string, data: RTCMessage) => {
  console.log('send message to other end ', roomId, data)
  socket?.emit('message', roomId, data)
}

const initRTCPeerConnection = () => {
  if (!currentPc) return

  currentPc.onicecandidate = (e) => {
    if (e.candidate) {
      console.log(`oncandidate ${JSON.stringify(e.candidate.toJSON())}`)
      sendMessage(roomId.value, {
        type: 'candidate',
        candidate: e.candidate
      })
    } else {
      console.log('ice candidate collection end');
    }
  }

  currentPc.ontrack = (event) => {
    if (remoteVideoRef.value.srcObject !== event.streams[0]) {
      remoteVideoRef.value.srcObject = event.streams[0]
    }
  }
}

const createConnection = async () => {
  if (!currentPc) return

  const offer = await currentPc.createOffer()
  console.log(`create offer ${offer} to the end`)
  await currentPc.setLocalDescription(offer)
  sendMessage(roomId.value, offer)
}

socket.on('connect', () => {
  console.log('socket connected')
})

socket.on('connect_error', () => {
  console.log('socket connect error')
})

socket.on('disconnect', () => {
  console.log('disconnect')
})

socket.on('joined', async (roomId, socketId) => {
  console.log(`received joined message; room id is: ${roomId}; socket id is: ${socketId}`)
  state.value = 'joined'

  localVideoRef.value.srcObject = localStream
  currentPc = createRTCPeerConnection(localStream, RTCConfig)
  initRTCPeerConnection()
  console.log('current pc: ', currentPc)
})

socket.on('other_join', (roomId, socketId) => {
  console.log(`other end join; roomId: ${roomId} socketId: ${socketId}`)
  remoteUser.value = socketId
  createConnection()
})

socket.on('left', (roomId, socketId) => {
  console.log(`received left message; room id is: ${roomId}; socket id is: ${socketId}`)
  state.value = 'init'

  localStream?.getTracks().forEach((track) => {
    track.stop()
  })
  localVideoRef.value.srcObject = null
  currentPc?.close()
  currentPc = null
  localStream = null
})

socket.on('bye', (roomId, socketId) => {
  console.log(`other user left; room id is: ${roomId}; socket id is: ${socketId}`)
  remoteVideoRef.value.srcObject = null
})

socket.on('message', async (roomId: string, data: RTCMessage) => {
  console.log(`received message type ${data.type}; room id is ${roomId}; data is ${JSON.stringify(data)}`)
  if (!data || !currentPc) return
  switch (data.type) {
    case 'candidate': {
      const newCandidate = new RTCIceCandidate(data.candidate)
      currentPc.addIceCandidate(newCandidate)
      break;
    }
    case 'answer': {
      currentPc.setRemoteDescription(data)
      break;
    }
    case 'offer': {
      currentPc.setRemoteDescription(data)
      const answer = await currentPc.createAnswer()
      currentPc.setLocalDescription(answer)
      console.log(`create answer ${answer}`)
      sendMessage(roomId, answer)
    }
  }
})

socket.on('full', () => {
  alert('房间已满，请稍后重试')
})

onBeforeUnmount(() => {
  socket.emit('leave')
})
</script>

<style lang="scss" scoped>
.video-wrapper {
  &__video {
    width: 640px;
    height: 360px;
    object-fit: cover;
    object-position: 50% 50%;
  }
}
</style>