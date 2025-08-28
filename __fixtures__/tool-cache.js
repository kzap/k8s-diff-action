/**
 * This file is used to mock the `@actions/tool-cache` module in tests.
 */
import { jest } from '@jest/globals'

export const downloadTool = jest.fn()
export const extractTar = jest.fn()
export const cacheDir = jest.fn()
export const find = jest.fn()
