import { useEffect, useRef, useState } from "react"
import { FRAME_DURATION_US, KEYFRAME_REQUEST_INTERVAL_MS, MAX_DECODE_QUEUE_SIZE, TILE_RESIZE_STEP_PX } from "@/app/call/constants/call.constants"
import { NalType } from "@/app/call/enums/call.enums"
import { sendCallAction, subscribeVideo } from "@/app/call/services/call.service"
import { buildAvcConfig, toHex, getNalType, splitNalUnits, annexBToAvc } from "@/app/call/utils/call.utils"

export function useVideo(accountId: string, src: string, tile = false) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx || typeof VideoDecoder === "undefined") return
    let decoder: VideoDecoder | null = null
    let currentConfig = ""
    let waitingForKey = true
    let ts = 0
    let lastKeyRequestAt = 0

    const requestKeyframe = () => {
      waitingForKey = true
      if (src === "self" || Date.now() - lastKeyRequestAt < KEYFRAME_REQUEST_INTERVAL_MS) return
      lastKeyRequestAt = Date.now()
      sendCallAction(accountId, { action: "needkey", src })
    }
    const closeDecoder = () => {
      if (decoder && decoder.state !== "closed") decoder.close()
      decoder = null
    }
    const configureDecoder = (sps: Uint8Array, pps: Uint8Array) => {
      closeDecoder()
      decoder = new VideoDecoder({
        output: (f) => {
          canvas.width = f.displayWidth
          canvas.height = f.displayHeight
          ctx.drawImage(f, 0, 0)
          f.close()
          setLive(true)
        },
        error: () => {
          decoder = null
          requestKeyframe()
        },
      })
      decoder.configure({ codec: `avc1.${toHex(sps.subarray(1, 4))}`, description: buildAvcConfig(sps, pps), optimizeForLatency: true })
      currentConfig = toHex(sps) + toHex(pps)
    }

    const unsubscribe = subscribeVideo(accountId, src, ({ key, data }) => {
      const nals = splitNalUnits(data)
      if (key) {
        const sps = nals.find((n) => getNalType(n) === NalType.Sps)
        const pps = nals.find((n) => getNalType(n) === NalType.Pps)
        // Key frame sau khi tụt lại: bỏ cả hàng đợi cũ, hiện ngay hình mới
        if (sps && pps && (decoder?.state !== "configured" || decoder.decodeQueueSize >= MAX_DECODE_QUEUE_SIZE || toHex(sps) + toHex(pps) !== currentConfig)) configureDecoder(sps, pps)
        waitingForKey = false
      } else if (waitingForKey || !decoder || decoder.decodeQueueSize >= MAX_DECODE_QUEUE_SIZE) {
        return requestKeyframe()
      }
      if (decoder?.state !== "configured") return
      try {
        decoder.decode(new EncodedVideoChunk({ type: key ? "key" : "delta", timestamp: (ts += FRAME_DURATION_US), data: annexBToAvc(nals) }))
      } catch {
        closeDecoder()
        requestKeyframe()
      }
    })

    let width = 0
    const resizeObserver = new ResizeObserver(() => {
      if (!tile || Math.abs(canvas.clientWidth - width) < TILE_RESIZE_STEP_PX) return
      width = canvas.clientWidth
      sendCallAction(accountId, { action: "tile", src, width })
    })
    resizeObserver.observe(canvas)

    return () => {
      unsubscribe()
      resizeObserver.disconnect()
      closeDecoder()
      setLive(false)
    }
  }, [accountId, src, tile])

  return { ref, live }
}
