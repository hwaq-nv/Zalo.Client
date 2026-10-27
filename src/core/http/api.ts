import { invoke } from "@tauri-apps/api/core"
import type { BaseResponse } from "@/shared/types"

const server = await invoke<{ port: number; token: string }>("server_info")
export const baseUrl = `http://127.0.0.1:${server.port}`
export const token = server.token

export async function api<T = null>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(baseUrl + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...init?.headers },
  })
  const { data, message } = (await res.json()) as BaseResponse<T>
  if (!res.ok) throw new Error(`${res.status} ${message}`)
  return data
}
