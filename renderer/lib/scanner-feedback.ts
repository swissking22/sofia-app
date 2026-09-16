/**
 * Lightweight Web Audio feedback for gate scanner.
 * No external audio assets — works offline.
 */

export type ScannerBeepKind = 'success' | 'warning' | 'error'

let sharedCtx: AudioContext | null = null

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AC) return null
    if (!sharedCtx) sharedCtx = new AC()
    return sharedCtx
  } catch {
    return null
  }
}

function tone(
  frequency: number,
  durationMs: number,
  type: OscillatorType = 'sine',
  gain = 0.08
): void {
  const audio = ctx()
  if (!audio) return
  void audio.resume().catch(() => undefined)
  const now = audio.currentTime
  const osc = audio.createOscillator()
  const g = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, now)
  g.gain.setValueAtTime(gain, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000)
  osc.connect(g)
  g.connect(audio.destination)
  osc.start(now)
  osc.stop(now + durationMs / 1000 + 0.02)
}

export function playScannerFeedback(kind: ScannerBeepKind): void {
  try {
    if (kind === 'success') {
      tone(880, 90)
      setTimeout(() => tone(1175, 110), 90)
      return
    }
    if (kind === 'warning') {
      tone(520, 140, 'triangle', 0.07)
      setTimeout(() => tone(520, 140, 'triangle', 0.07), 180)
      return
    }
    tone(220, 220, 'square', 0.06)
  } catch {
    /* audio optional */
  }
}
