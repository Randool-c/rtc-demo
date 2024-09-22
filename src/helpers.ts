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

export const createRTCPeerConnection = (stream: MediaStream | null) => {
  const pc = new RTCPeerConnection()
  if (stream) {
    const audioTrack = stream.getAudioTracks()[0]
    const videoTrack = stream.getVideoTracks()[0]
    pc.addTrack(audioTrack, stream)
    pc.addTrack(videoTrack, stream)
  }
  return pc
}
