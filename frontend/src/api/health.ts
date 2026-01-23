import { api } from './client'
import type { ServiceStatus } from '@/types'

interface HealthResponse {
  status: string
  services: ServiceStatus
}

export const healthApi = {
  check: () => api.get<HealthResponse>('/health'),
}
