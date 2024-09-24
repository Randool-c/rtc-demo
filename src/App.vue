<template>
  <div class="app">
    <div class="config">
      <div class="config__inputs">
        <label for="room-id">room id: </label>
        <input class="room-id" id="room-id" type="text" v-model="roomId" />
      </div>
      <div class="config__submits">
        <button class="btn-enter" :disable="state === 'joined'" @click="enterRoom">enter</button>
        <span v-if="state === 'joining'">进入房间中。。。</span>
        <button class="btn-exit" @click="exitRoom">exit</button>
      </div>
    </div>
    <div class="videos">
      <div class=local-video>
        <div class="video-wrapper">
          <div class="video-wrapper__title">{{ state === 'joined' ? `local(${localUser})` : '' }}</div>
          <video class="video-wrapper__video" playsinline autoplay ref="localVideoRef" />
        </div>
      </div>
      <div class="remote-video">
        <div v-for="([remoteUser]) in sortedConnections" :key="remoteUser" class="video-wrapper">
          <div class="video-wrapper__title">{{ remoteUser }}</div>
          <video class="videos-wrapper__video" playsinline autoplay ref="remoteVideosRef" />
        </div>
      </div>
    </div>
    <div class="messages"></div>
  </div>
</template>

<script lang="ts" setup>
import { io } from 'socket.io-client';
import { computed, nextTick, onBeforeUnmount, ref, watchEffect } from 'vue'
import { createRTCPeerConnection, getLocalStreams } from './helpers';

interface RTCCandidateMessage {
  type: 'candidate';
  candidate: RTCIceCandidate;
}

type RTCMessage = RTCCandidateMessage | RTCSessionDescriptionInit

const RTCConfig = {
  iceServers: [
    { urls: 'stun:42.193.125.56:8800', username: 'chenst', credential: '123456' },
    { urls: 'turn:42.193.125.56:8805', username: 'chenst', credential: '123456' }
  ],
}

const localVideoRef = ref()
const remoteVideosRef = ref()

const roomId = ref('test')
const socket = io('wss://42.193.125.56')
const state = ref<'init' | 'joining' | 'joined'>('init')
const remoteUser = ref<string>('')
const localUser = ref<string>('')
// let currentPc: null | RTCPeerConnection = null;
let localStream: null | MediaStream = null;
const pcs = ref(new Map<string, RTCPeerConnection>())
const streams = ref(new Map<string, MediaStream>())
const sortedConnections = computed<[string, RTCPeerConnection][]>(() => {
  return Array.from(pcs.value.entries()).sort((item1, item2) => {
    if (item1[0] <= item2[0]) return -1
    else return 1
  })
})

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
  // console.log('send message to other end ', roomId, data)
  socket?.emit('message', roomId, data)
}

const initRTCPeerConnection = (socketId: string, pc: RTCPeerConnection) => {
  if (!pc) return

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      // console.log(`oncandidate ${JSON.stringify(e.candidate.toJSON())}`)
      sendMessage(roomId.value, {
        type: 'candidate',
        candidate: e.candidate
      })
    } else {
      console.log('ice candidate collection end');
    }
  }

  pc.ontrack = (event) => {
      const index = sortedConnections.value.findIndex(([sid]) => sid === socketId)
      const el = remoteVideosRef.value[index]
      console.log('on track !', el, event.streams[0])
      if (el.srcObject !== event.streams[0]) {
        el.srcObject = event.streams[0]
      }
  }
}

const createConnection = async (pc: RTCPeerConnection) => {
  if (!pc) return

  const offer = await pc.createOffer()
  console.log(`create offer ${offer} to the end`)
  await pc.setLocalDescription(offer)
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

socket.on('joined', async (roomId: string, socketId: string, roomSockets: string[]) => {
  console.log(`received joined message; room id is: ${roomId}; socket id is: ${socketId}; exists sockets are: ${roomSockets}`)
  state.value = 'joined'

  localVideoRef.value.srcObject = localStream
  // currentPc = createRTCPeerConnection(localStream, RTCConfig)
  // initRTCPeerConnection()
  // console.log('current pc: ', currentPc)
  localUser.value = socketId

  // 为和房间中已有的每个用户创建一个rtcpeerconnection，但是不需要建立连接
  for (let socketId of roomSockets) {
    const newPc = createRTCPeerConnection(localStream, RTCConfig)
    initRTCPeerConnection(socketId, newPc)
    pcs.value.set(socketId, newPc)
    // setTimeout(() => {
    //   createConnection(newPc)
    // })
  }
})

socket.on('other_join', async (roomId, socketId) => {
  console.log(`other end join; roomId: ${roomId} socketId: ${socketId}`)
  remoteUser.value = socketId
  const newPc = createRTCPeerConnection(localStream, RTCConfig)
  initRTCPeerConnection(socketId, newPc)
  pcs.value.set(socketId, newPc)
  // await nextTick()
  // console.assert(remoteVideosRef.value.length === sortedConnections.value.length)
  // const index = sortedConnections.value.findIndex(([sid]) => sid === socketId)
  setTimeout(() => {
    createConnection(newPc)
  })
})

socket.on('left', (roomId, socketId) => {
  console.log(`received left message; room id is: ${roomId}; socket id is: ${socketId}`)
  state.value = 'init'

  localStream?.getTracks().forEach((track) => {
    track.stop()
  })
  localVideoRef.value.srcObject = null
  localStream = null
  for (let otherSocket of pcs.value.keys()) {
    pcs.value.get(otherSocket)?.close()
    pcs.value.delete(otherSocket)
  }
})

socket.on('bye', (roomId, socketId) => {
  console.log(`other user left; room id is: ${roomId}; socket id is: ${socketId}`)
  pcs.value.get(socketId)?.close()
  pcs.value.delete(socketId)
})

socket.on('message', async (roomId: string, fromSocket: string, data: RTCMessage) => {
  console.log(`received message type ${data.type} from ${fromSocket}; room id is ${roomId}; data is ${JSON.stringify(data)}`)
  const targetPc = pcs.value.get(fromSocket)
  if (!data || !targetPc) return
  switch (data.type) {
    case 'candidate': {
      const newCandidate = new RTCIceCandidate(data.candidate)
      targetPc.addIceCandidate(newCandidate)
      break;
    }
    case 'answer': {
      targetPc.setRemoteDescription(data)
      break;
    }
    case 'offer': {
      targetPc.setRemoteDescription(data)
      const answer = await targetPc.createAnswer()
      targetPc.setLocalDescription(answer)
      console.log(`create answer ${answer}`)
      sendMessage(roomId, answer)
    }
  }
})

socket.on('full', () => {
  alert('房间已满，请稍后重试')
})

// watchEffect(() => {
//   if (remoteVideosRef.value?.length !== sortedConnections.value?.length) return;
//   const n = remoteVideosRef.value.length
//   for (let i = 0; i < n; ++i) {
//     if (!sortedConnections.value[i][1].ontrack) {
//       sortedConnections.value[i][1].ontrack = (event) => {
//         console.log(`ontrack from ${sortedConnections.value[i][0]}; remote video elemnt: `, remoteVideosRef.value[i], event.streams[0])
//         if (remoteVideosRef.value[i].srcObject !== event.streams[0]) {
//           remoteVideosRef.value[i].srcObject = event.streams[0]
//         }
//       }
//     }
//   }
// }, { flush: 'post' })

onBeforeUnmount(() => {
  socket.emit('leave')
})
</script>

<style lang="scss" scoped>
.video-wrapper {
  &__video {
    width: 360px;
    height: 240px;
    object-fit: cover;
    object-position: 50% 50%;
  }
}

.remote-video {
  display: flex;
  flex-flow: row wrap;
  gap: 10px;
}
</style>