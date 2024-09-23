export const getLocalStreams = async () => {
  const stream = await navigator.mediaDevices.getUserMedia?.({
    audio: true,
    video: true
  })
  if (!stream) {
    throw new Error('未找到媒体设备')
  } else {
    return stream;
  }
}

export const createRTCPeerConnection = (stream: MediaStream | null, config?: RTCConfiguration) => {
  const pc = new RTCPeerConnection(config)
  console.log('current stream when create pc ', stream)
  if (stream) {
    const audioTrack = stream.getAudioTracks()[0]
    const videoTrack = stream.getVideoTracks()[0]
    pc.addTrack(audioTrack, stream)
    pc.addTrack(videoTrack, stream)
  }
  return pc
}
