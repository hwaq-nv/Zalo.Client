import { useQuery } from "@tanstack/react-query"
import { invoke } from "@tauri-apps/api/core"
import type { Devices } from "@/app/settings/models/settings.model"
import { queryKeys } from "@/shared/constants/api.constants"

export const useMediaDevices = () =>
  useQuery({ queryKey: queryKeys.mediaDevices, queryFn: () => invoke<Devices>("media_devices"), staleTime: 0 })
