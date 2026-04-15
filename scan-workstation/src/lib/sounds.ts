// Audio feedback for scan workstation
// Uses Web Audio API to generate beep sounds without external files

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function beep(frequency: number, duration: number, volume = 0.3) {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.value = volume;

    oscillator.start(ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    // Audio not available, silently ignore
  }
}

export function playSuccess() {
  beep(880, 0.15); // High pitch, short
}

export function playError() {
  beep(220, 0.3); // Low pitch, longer
  setTimeout(() => beep(220, 0.3), 150); // Double beep
}

export function playWarning() {
  beep(440, 0.2);
}

export function playScanAck() {
  beep(1200, 0.08, 0.2); // Quick click
}
