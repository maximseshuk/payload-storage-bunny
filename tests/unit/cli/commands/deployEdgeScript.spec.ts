import { describe, expect, it } from 'vitest'

import { deployEdgeScriptCommand } from '@/cli/commands/deployEdgeScript.js'

const INPUTS = [
  'apiKey',
  'envFile',
  'zonesFile',
  'secret',
  'scriptUrl',
  'name',
  'cdnTier',
  'allowedOrigins',
  'connectionLimit',
  'requestLimit',
  'check',
  'new',
  'dryRun',
  'printSecret',
  'prune',
  'skipHarden',
]

const validate = async (input: Record<string, unknown>) => {
  const result = await deployEdgeScriptCommand.input['~standard'].validate(input)
  if (result.issues) {
    throw new Error(result.issues.map((issue) => issue.message).join('\n'))
  }
  return result.value as Record<string, unknown>
}

describe('bunny:deploy-edge-script input', () => {
  it('declares every flag', () => {
    const properties = deployEdgeScriptCommand.schema.properties as Record<string, unknown>
    expect(Object.keys(properties).toSorted()).toEqual(INPUTS.toSorted())
  })

  it('accepts value, negatable, and boolean flags', async () => {
    const args = await validate({ check: true, connectionLimit: 20, name: 'custom', printSecret: false, prune: false })

    expect(args.name).toBe('custom')
    expect(args.connectionLimit).toBe(20)
    expect(args.check).toBe(true)
    expect(args.printSecret).toBe(false)
    expect(args.prune).toBe(false)
  })

  it('defaults the negatable flags to enabled', async () => {
    const args = await validate({})

    expect(args.printSecret).toBe(true)
    expect(args.prune).toBe(true)
  })

  it('rejects unknown flags', async () => {
    await expect(validate({ unknown: true })).rejects.toThrow(/Invalid input/)
  })
})
