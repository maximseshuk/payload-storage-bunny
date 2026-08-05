import { describe, expect, it } from 'vitest'

import { readState, utcDay, writeState } from '@/server/telemetry/state.js'

describe('utcDay', () => {
  it('formats a date as its UTC YYYY-MM-DD', () => {
    expect(utcDay(new Date('2026-07-30T23:59:59Z'))).toBe('2026-07-30')
  })
})

describe('telemetry state', () => {
  it('round-trips a state file keyed by projectId', () => {
    const projectId = `test-${Math.random().toString(36).slice(2)}`
    writeState(projectId, { lastSentDay: '2026-07-30', noticeShown: true })
    expect(readState(projectId)).toEqual({ lastSentDay: '2026-07-30', noticeShown: true })
  })

  it('returns an empty state when nothing is persisted', () => {
    expect(readState(`missing-${Math.random().toString(36).slice(2)}`)).toEqual({})
  })
})
