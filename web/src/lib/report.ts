import type { KernelSurfaceLedgerReport } from '../types/report'

export type Report = KernelSurfaceLedgerReport

import bundled from '../data/demo-report.json'

export const BUNDLED_REPORT: Report = bundled as unknown as Report

const REQUIRED_KEYS: (keyof Report)[] = [
  'meta',
  'surface_elements',
  'workloads',
  'ledger',
  'orphaned',
  'plan',
  'score',
]

export function looksLikeReport(value: unknown): value is Report {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return REQUIRED_KEYS.every((key) => key in record)
}

export async function tryFetchLatest(): Promise<Report | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}latest/report.json`, {
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return null
    const parsed: unknown = await response.json()
    return looksLikeReport(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function parseDroppedFile(file: File): Promise<Report> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result))
        if (!looksLikeReport(parsed)) {
          reject(new Error('JSON is present but does not match the report contract'))
          return
        }
        resolve(parsed)
      } catch {
        reject(new Error(`"${file.name}" is not valid JSON`))
      }
    }
    reader.onerror = () => reject(new Error(`could not read "${file.name}"`))
    reader.readAsText(file)
  })
}

export interface ElementIndex {
  byId: Map<string, Report['surface_elements'][number]>
}

export function indexElements(report: Report): ElementIndex {
  return { byId: new Map(report.surface_elements.map((element) => [element.id, element])) }
}
