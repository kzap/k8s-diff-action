/**
 * This file is used to mock the `@actions/github` module in tests.
 */
import { jest } from '@jest/globals'

export const context = {
  repo: {
    owner: 'test-owner',
    repo: 'test-repo'
  },
  ref: 'refs/heads/test-branch'
}

export const getOctokit = jest.fn()
