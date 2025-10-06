/**
 * Unit tests for the action's main functionality, src/main.js
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as exec from '../__fixtures__/exec.js'
import * as io from '../__fixtures__/io.js'
import * as tc from '../__fixtures__/tool-cache.js'
import * as github from '../__fixtures__/github.js'
import * as fs from '../__fixtures__/fs.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/exec', () => exec)
jest.unstable_mockModule('@actions/io', () => io)
jest.unstable_mockModule('@actions/tool-cache', () => tc)
jest.unstable_mockModule('@actions/github', () => github)
jest.unstable_mockModule('fs', () => fs)

const { run } = await import('../src/main.js')

describe('k8s-diff-action', () => {
  beforeEach(() => {
    jest.resetAllMocks()

    core.getInput.mockImplementation((name) => {
      const inputs = {
        tool: 'yaml',
        command: '',
        'base-ref': 'main',
        'head-ref': 'HEAD',
        'working-dir': './'
      }
      return inputs[name] || ''
    })

    exec.exec.mockResolvedValue(0)

    exec.getExecOutput.mockResolvedValue({
      exitCode: 0,
      stdout: 'mock yaml output',
      stderr: ''
    })

    io.rmRF.mockResolvedValue()

    fs.promises.readdir.mockResolvedValue([
      { name: 'test.yaml', isFile: () => true, isDirectory: () => false }
    ])
    fs.promises.readFile.mockResolvedValue('mock yaml content')
    fs.promises.writeFile.mockResolvedValue()
    fs.existsSync.mockReturnValue(true)
    fs.readdirSync.mockReturnValue(['test.yaml'])

    process.env.GITHUB_SHA = 'mock-sha'
  })

  it('processes yaml tool with default settings', async () => {
    await run()

    expect(core.setOutput).toHaveBeenCalledWith(
      'diff-output',
      expect.any(String)
    )
    expect(core.setOutput).toHaveBeenCalledWith('error', 'false')
  })

  it('handles command execution errors', async () => {
    exec.exec.mockRejectedValue(new Error('Git command failed'))

    await run()

    expect(core.setFailed).toHaveBeenCalledWith('Failed to fetch origin main')
  })

  it('installs yamldiff when not found', async () => {
    exec.exec.mockImplementation((cmd, args, options) => {
      // Allow git commands to succeed
      if (cmd === 'git') return Promise.resolve(0)
      // Make 'which yamldiff' fail (triggers installation)
      if (cmd === 'which yamldiff')
        return Promise.reject(new Error('not found'))
      // Allow 'go install' to succeed
      if (cmd === 'go') return Promise.resolve(0)
      return Promise.resolve(0)
    })

    await run()

    expect(exec.exec).toHaveBeenCalledWith('go', [
      'install',
      'github.com/semihbkgr/yamldiff@v0.3.0'
    ])
  })

  it('uses custom command when provided', async () => {
    core.getInput.mockImplementation((name) => {
      const inputs = {
        tool: 'helm',
        command: 'helm template my-release .',
        'base-ref': 'main',
        'head-ref': 'HEAD',
        'working-dir': './'
      }
      return inputs[name] || ''
    })

    await run()

    expect(exec.getExecOutput).toHaveBeenCalledWith(
      'helm',
      ['template', 'my-release', '.'],
      expect.any(Object)
    )
  })
})
