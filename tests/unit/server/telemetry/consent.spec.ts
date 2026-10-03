import { describe, expect, it } from 'vitest'

import { isTelemetryDisabled } from '@/server/telemetry/consent.js'

const clean: Record<string, string | undefined> = {}

describe('isTelemetryDisabled', () => {
  it('keeps telemetry on by default (clean env, no opt-out)', () => {
    expect(isTelemetryDisabled({ env: clean, payloadTelemetry: true, plugin: undefined })).toBe(false)
    expect(isTelemetryDisabled({ env: clean, payloadTelemetry: undefined, plugin: { url: 'x' } })).toBe(false)
  })

  it('respects the Payload telemetry opt-out', () => {
    expect(isTelemetryDisabled({ env: clean, payloadTelemetry: false, plugin: true })).toBe(true)
  })

  it('respects the plugin option telemetry: false', () => {
    expect(isTelemetryDisabled({ env: clean, plugin: false })).toBe(true)
  })

  it.each([
    ['BUNNY_TELEMETRY_DISABLED', '1'],
    ['DO_NOT_TRACK', '1'],
    ['CI', 'true'],
  ])('turns telemetry off when %s is truthy', (key, value) => {
    expect(isTelemetryDisabled({ env: { [key]: value }, plugin: undefined })).toBe(true)
  })

  it('turns telemetry off when NODE_ENV is test', () => {
    expect(isTelemetryDisabled({ env: { NODE_ENV: 'test' }, plugin: undefined })).toBe(true)
  })

  it('treats empty, "0" and "false" env values as no opt-out', () => {
    expect(isTelemetryDisabled({ env: { CI: '' }, plugin: undefined })).toBe(false)
    expect(isTelemetryDisabled({ env: { DO_NOT_TRACK: '0' }, plugin: undefined })).toBe(false)
    expect(isTelemetryDisabled({ env: { BUNNY_TELEMETRY_DISABLED: 'false' }, plugin: undefined })).toBe(false)
  })
})
