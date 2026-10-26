import { useEffect } from "react"
import { SCHEDULE_S, TONES } from "@/app/call/constants/call.constants"

// Phát bằng WebAudio cho khỏi cần tệp âm thanh
export function useTone(kind: keyof typeof TONES | null) {
  useEffect(() => {
    if (!kind) return
    const { freqs, on, period } = TONES[kind]
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(ctx.destination)
    for (const f of freqs) {
      const osc = ctx.createOscillator()
      osc.frequency.value = f
      osc.connect(gain)
      osc.start()
    }
    for (let t = 0; t < SCHEDULE_S; t += period) {
      gain.gain.setValueAtTime(0.08, ctx.currentTime + t)
      gain.gain.setValueAtTime(0, ctx.currentTime + t + on)
    }
    return () => void ctx.close()
  }, [kind])
}
