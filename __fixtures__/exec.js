/**
 * This file is used to mock the `@actions/exec` module in tests.
 */
import { jest } from '@jest/globals'

export const exec = jest.fn()
export const getExecOutput = jest.fn()
