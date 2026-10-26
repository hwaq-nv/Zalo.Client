import { useEffect } from "react"
import { RINGTONE_DURATION_S, RINGTONES } from "@/app/call/constants/call.constants"

// Phát bằng WebAudio cho khỏi cần tệp âm thanh
export function useRingtone(kind: keyof typeof RINGTONES | null) {
  useEffect(() => {
    if (!kind) return
    const { freqs, on, period } = RINGTONES[kind]
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
    for (let t = 0; t < RINGTONE_DURATION_S; t += period) {
      gain.gain.setValueAtTime(0.08, ctx.currentTime + t)
      gain.gain.setValueAtTime(0, ctx.currentTime + t + on)
    }
    return () => void ctx.close()
  }, [kind])
}
