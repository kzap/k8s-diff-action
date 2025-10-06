import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import * as path from 'path'

/**
 * Check if a tool is installed
 * @param {string} toolName - Name of the tool to check
 * @returns {Promise<boolean>} True if tool is installed
 */
export async function isToolInstalled(toolName) {
  try {
    await exec.exec(`which ${toolName}`, [], { silent: true })
    return true
  } catch {
    return false
  }
}

/**
 * Install yamldiff tool using go install
 * @returns {Promise<void>}
 */
export async function installYamldiff() {
  core.info('Installing yamldiff...')
  await exec.exec('go', ['install', 'github.com/semihbkgr/yamldiff@v0.3.0'])

  const goPathResult = await exec.getExecOutput('go', ['env', 'GOPATH'])
  if (goPathResult.stdout.trim()) {
    const goPath = goPathResult.stdout.trim()
    const goBinPath = path.join(goPath, 'bin')
    core.addPath(goBinPath)
    core.info(`Added Go binary path to PATH: ${goBinPath}`)
  }
}

/**
 * Install helm tool using tool-cache
 * @returns {Promise<void>}
 */
export async function installHelm() {
  core.info('Installing helm...')
  const version = 'v3.14.0'
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux'
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'

  const downloadUrl = `https://get.helm.sh/helm-${version}-${platform}-${arch}.tar.gz`
  const downloadPath = await tc.downloadTool(downloadUrl)
  const extractedPath = await tc.extractTar(downloadPath)
  const cachedPath = await tc.cacheDir(extractedPath, 'helm', version)

  const helmPath = path.join(cachedPath, `${platform}-${arch}`, 'helm')
  core.addPath(path.dirname(helmPath))
}
