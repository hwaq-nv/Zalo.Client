import { create } from "zustand"
import type { CallState } from "@/shared/types"

type CallStore = { call?: { accountId: string; state: CallState }; speaking: Record<string, boolean> }

export const useCallStore = create<CallStore>()(() => ({ speaking: {} }))
