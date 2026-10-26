import type { BaseResponse } from "@/shared/types"

export const baseUrl = import.meta.env.VITE_API_URL
export const token = import.meta.env.VITE_API_TOKEN

export async function api<T = null>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(baseUrl + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...init?.headers },
  })
  const { data, message } = (await res.json()) as BaseResponse<T>
  if (!res.ok) throw new Error(`${res.status} ${message}`)
  return data
}
