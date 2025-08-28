/**
 * This file is used to mock the `fs` module in tests.
 */
import { jest } from '@jest/globals'

export const promises = {
  readdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn()
}
