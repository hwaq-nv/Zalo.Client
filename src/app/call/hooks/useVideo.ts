import { useEffect, useRef, useState } from "react"
import { FRAME_DURATION_US, NEED_KEY_EVERY_MS, QUEUE_MAX, TILE_RESIZE_STEP_PX } from "@/app/call/constants/call.constants"
import { NalType } from "@/app/call/enums/call.enums"
import { callAction, watchVideo } from "@/app/call/services/call.service"
import { avcC, hex, nalType, nalUnits, toAvc } from "@/app/call/utils/call.utils"

export function useVideo(accountId: string, src: string, tile = false) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const canvas = ref.current
    const g = canvas?.getContext("2d")
    if (!canvas || !g || typeof VideoDecoder === "undefined") return
    let dec: VideoDecoder | null = null
    let params = ""
    let waitKey = true
    let ts = 0
    let askedAt = 0

    const needKey = () => {
      waitKey = true
      if (src === "self" || Date.now() - askedAt < NEED_KEY_EVERY_MS) return
      askedAt = Date.now()
      callAction(accountId, { action: "needkey", src })
    }
    const close = () => {
      if (dec && dec.state !== "closed") dec.close()
      dec = null
    }
    const configure = (sps: Uint8Array, pps: Uint8Array) => {
      close()
      dec = new VideoDecoder({
        output: (f) => {
          canvas.width = f.displayWidth
          canvas.height = f.displayHeight
          g.drawImage(f, 0, 0)
          f.close()
          setLive(true)
        },
        error: () => {
          dec = null
          needKey()
        },
      })
      dec.configure({ codec: `avc1.${hex(sps.subarray(1, 4))}`, description: avcC(sps, pps), optimizeForLatency: true })
      params = hex(sps) + hex(pps)
    }

    const stop = watchVideo(accountId, src, ({ key, data }) => {
      const nals = nalUnits(data)
      if (key) {
        const sps = nals.find((n) => nalType(n) === NalType.Sps)
        const pps = nals.find((n) => nalType(n) === NalType.Pps)
        // Key frame sau khi tụt lại: bỏ cả hàng đợi cũ, hiện ngay hình mới
        if (sps && pps && (dec?.state !== "configured" || dec.decodeQueueSize >= QUEUE_MAX || hex(sps) + hex(pps) !== params)) configure(sps, pps)
        waitKey = false
      } else if (waitKey || !dec || dec.decodeQueueSize >= QUEUE_MAX) {
        return needKey()
      }
      if (dec?.state !== "configured") return
      try {
        dec.decode(new EncodedVideoChunk({ type: key ? "key" : "delta", timestamp: (ts += FRAME_DURATION_US), data: toAvc(nals) }))
      } catch {
        close()
        needKey()
      }
    })

    let width = 0
    const resize = new ResizeObserver(() => {
      if (!tile || Math.abs(canvas.clientWidth - width) < TILE_RESIZE_STEP_PX) return
      width = canvas.clientWidth
      callAction(accountId, { action: "tile", src, width })
    })
    resize.observe(canvas)

    return () => {
      stop()
      resize.disconnect()
      close()
      setLive(false)
    }
  }, [accountId, src, tile])

  return { ref, live }
}
