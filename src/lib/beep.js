// Tiny audio/vibration cues for the guided circuit timer. Everything is
// best-effort: browsers may block audio until a user gesture, and some
// devices have no vibration, so failures are silently ignored.
let audioCtx = null

// Call from a click handler (the "Iniciar" button) so the browser allows sound.
export function prepareAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
  } catch {
    audioCtx = null
  }
}

export function beep(frequency = 880, ms = 120) {
  if (!audioCtx) return
  try {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.frequency.value = frequency
    gain.gain.value = 0.12
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + ms / 1000)
  } catch {
    // ignore
  }
}

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // ignore
  }
}
