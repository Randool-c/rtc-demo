<template>
  <div class="app">
    <div class="config">
      <div class="config__inputs">
        <label for="room-id">room id: </label>
        <input class="room-id" id="room-id" type="text" v-model="roomId" />
      </div>
      <div class="config__submits">
        <button class="btn-enter" :disabled="state === 'joined'" @click="enterRoom">enter</button>
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
          <video class="videos-wrapper__video" playsinline autoplay :ref="(el: any) => (remoteVideosRef[remoteUser] = el)" />
        </div>
      </div>
    </div>
    <div class="input">
      <input v-model="inputText" type="text"/>
      <button @click="sendTextMessage" :disabled="state !== 'joined'">send message</button>
    </div>
    <div class="messages">
      <div v-for="(messageItem, idx) in messageList" :key="idx" class="message">
        <span class="message__user">{{ messageItem.user }}{{ localUser === messageItem.user ? '(我)' : '' }}</span>
        <span>说：</span>
        <span class="message__content">{{ messageItem.content }}</span>
      </div>
    </div> 
  </div>
</template>

<script lang="ts" setup>
import { io } from 'socket.io-client';
import { computed, onBeforeUnmount, ref } from 'vue'
import { getLocalStreams } from './helpers';

interface RTCCandidateMessage {
  type: 'candidate';
  candidate: RTCIceCandidate;
}

type RTCMessage = RTCCandidateMessage | RTCSessionDescriptionInit

interface MessageItem {
  user: string;
  content: string;
}

const RTCConfig = {
  iceServers: [
    { urls: 'stun:42.193.125.56:8800', username: 'chenst', credential: '123456' },
    { urls: 'turn:42.193.125.56:8805', username: 'chenst', credential: '123456' }
  ],
}

const localVideoRef = ref()
const remoteVideosRef = ref<{[key: string]: HTMLMediaElement | null}>({})

const roomId = ref('test')
const socket = io('wss://42.193.125.56')
const state = ref<'init' | 'joining' | 'joined'>('init')
const remoteUser = ref<string>('')
const localUser = ref<string>('')

let localStream: null | MediaStream = null;
const pcs = ref(new Map<string, Promise<RTCPeerConnection>>());
const datachannels = ref(new Map<string, RTCDataChannel>());
const sortedConnections = computed<[string, Promise<RTCPeerConnection>][]>(() => {
  return Array.from(pcs.value.entries()).sort((item1, item2) => {
    if (item1[0] <= item2[0]) return -1
    else return 1
  })
})

const messageList = ref<MessageItem[]>([])
const inputText = ref('')

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

const sendMessage = (roomId: string, data: RTCMessage, targetSocket?: string) => {
  // console.log('send message to other end ', roomId, data)
  socket?.emit('message', roomId, data, targetSocket)
}

const initRTCPeerConnection = async (targetSocket: string) => {
  const stream = localStream
  const pc = new RTCPeerConnection(RTCConfig)
  if (stream) {
    const audioTrack = stream.getAudioTracks()[0]
    const videoTrack = stream.getVideoTracks()[0]
    pc.addTrack(audioTrack, stream)
    pc.addTrack(videoTrack, stream)
  }

  (!pc.onicecandidate) && (pc.onicecandidate = (e) => {
    if (e.candidate) {
      // console.log(`oncandidate ${JSON.stringify(e.candidate.toJSON())}`)
      sendMessage(roomId.value, {
        type: 'candidate',
        candidate: e.candidate
      }, targetSocket)
    } else {
      console.log('ice candidate collection end');
    }
  });

  !pc.ontrack && (pc.ontrack = async (event) => {
      const el = remoteVideosRef.value[targetSocket]!
      console.log('on track !', el, targetSocket)
      if (el.srcObject !== event.streams[0]) {
        el.srcObject = event.streams[0]
      }
  });
  return pc
}

const initDataChannel = (datachannel: RTCDataChannel, remoteSocket: string) => {
  datachannel.onopen = () => {
    console.log(`datachannel to ${remoteSocket} open`)
  }

  datachannel.onmessage = (event) => {
    console.log(`收到来自${remoteSocket}的消息：${event.data}`)
    messageList.value.push({
      user: remoteSocket,
      content: event.data
    })
  }

  datachannel.onclose = () => {
    console.log(`datachannel to ${remoteSocket} close`)
  }
}

const createConnection = async (targetSocket: string) => {
  const newPcPromise = initRTCPeerConnection(targetSocket)
  pcs.value.set(targetSocket, newPcPromise)
  const newPc = await newPcPromise

  if (!newPc) return

  const datachannel =  newPc.createDataChannel('chat')
  initDataChannel(datachannel, targetSocket)
  datachannels.value.set(targetSocket, datachannel)

  const offer = await newPc.createOffer()
  await newPc.setLocalDescription(offer)
  sendMessage(roomId.value, offer, targetSocket)
}

const sendTextMessage = () => {
  for (let [remoteSocket, datachannel] of datachannels.value.entries()) {
    if (datachannel.readyState === 'open') {
      console.log(`发送给${remoteSocket}的消息${inputText.value}失败`)
      datachannel.send(inputText.value)
    }
  }
  messageList.value.push({
    user: localUser.value,
    content: inputText.value
  })
  inputText.value = ''
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
  localUser.value = socketId
})

socket.on('other_join', async (roomId, socketId) => {
  console.log(`other end join; roomId: ${roomId} socketId: ${socketId}`)
  createConnection(socketId)
})

socket.on('left', async (roomId, socketId) => {
  console.log(`received left message; room id is: ${roomId}; socket id is: ${socketId}`)
  state.value = 'init'

  localStream?.getTracks().forEach((track) => {
    track.stop()
  })
  localVideoRef.value.srcObject = null
  localStream = null
  for (let otherSocket of pcs.value.keys()) {
    (await pcs.value.get(otherSocket))?.close()
    pcs.value.delete(otherSocket)
  }
})

socket.on('bye', async (roomId, socketId) => {
  console.log(`other user left; room id is: ${roomId}; socket id is: ${socketId}`);
  (await pcs.value.get(socketId))?.close()
  pcs.value.delete(socketId)
})

socket.on('message', async (roomId: string, fromSocket: string, data: RTCMessage) => {
  console.log(`received message type ${data.type} from ${fromSocket}; room id is ${roomId}; data is ${JSON.stringify(data)}`)
  if (!data) return

  let targetPcPromise = pcs.value.get(fromSocket)
  if (!targetPcPromise) {
    targetPcPromise = initRTCPeerConnection(fromSocket)
    pcs.value.set(fromSocket, targetPcPromise)
  } 
  const targetPc = await targetPcPromise
  targetPc.ondatachannel = (event) => {
    console.log(`接收到远端${fromSocket}发送过来的datachannel`)
    console.log(event.channel)
    const datachannel = event.channel
    initDataChannel(datachannel, fromSocket)
    datachannels.value.set(fromSocket, datachannel)
  }
  if (!targetPc) return

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
      sendMessage(roomId, answer, fromSocket)
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