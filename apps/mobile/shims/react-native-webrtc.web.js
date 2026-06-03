/**
 * Web stub for react-native-webrtc.
 * The real package calls requireNativeComponent (native-only) at import
 * time, which crashes on web. The realtime voice-onboarding flow that uses
 * it is native-only and redirects to a text flow on web, so these stubs
 * just need to exist to satisfy the import — they're never invoked on web.
 */

export class RTCPeerConnection {
  constructor() {
    throw new Error('react-native-webrtc is not available on web')
  }
}

export class RTCSessionDescription {
  constructor(init) {
    Object.assign(this, init || {})
  }
}

export class RTCIceCandidate {
  constructor(init) {
    Object.assign(this, init || {})
  }
}

export const mediaDevices = {
  getUserMedia: async () => {
    throw new Error('react-native-webrtc is not available on web')
  },
}

export class MediaStream {}
export class MediaStreamTrack {}

export function registerGlobals() {}

export const RTCView = () => null

export default {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
  MediaStreamTrack,
  registerGlobals,
  RTCView,
}
