import { describe, expect, it } from 'vitest'

import { isTelemetryDisabled } from '@/server/telemetry/consent.js'

const clean: Record<string, string | undefined> = {}

describe('isTelemetryDisabled', () => {
  it('is enabled by default (clean env, no opt-out)', () => {
    expect(isTelemetryDisabled({ env: clean, payloadTelemetry: true, plugin: undefined })).toBe(false)
    expect(isTelemetryDisabled({ env: clean, payloadTelemetry: undefined, plugin: { endpoint: 'x' } })).toBe(false)
  })

  it('honors the host Payload telemetry opt-out', () => {
    expect(isTelemetryDisabled({ env: clean, payloadTelemetry: false, plugin: true })).toBe(true)
  })

  it('honors the plugin-level telemetry: false', () => {
    expect(isTelemetryDisabled({ env: clean, plugin: false })).toBe(true)
  })

  it.each([
    ['BUNNY_TELEMETRY_DISABLED', '1'],
    ['DO_NOT_TRACK', '1'],
    ['CI', 'true'],
  ])('is disabled when %s is truthy', (key, value) => {
    expect(isTelemetryDisabled({ env: { [key]: value }, plugin: undefined })).toBe(true)
  })

  it('is disabled when NODE_ENV is test', () => {
    expect(isTelemetryDisabled({ env: { NODE_ENV: 'test' }, plugin: undefined })).toBe(true)
  })

  it('treats empty / "0" / "false" env values as not opting out', () => {
    expect(isTelemetryDisabled({ env: { CI: '' }, plugin: undefined })).toBe(false)
    expect(isTelemetryDisabled({ env: { DO_NOT_TRACK: '0' }, plugin: undefined })).toBe(false)
    expect(isTelemetryDisabled({ env: { BUNNY_TELEMETRY_DISABLED: 'false' }, plugin: undefined })).toBe(false)
  })
})
