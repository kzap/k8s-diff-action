import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import * as github from '@actions/github'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Get the default command for a given tool
 * @param {string} tool - The tool name (yaml, helm, kustomize)
 * @returns {string} The default command for the tool
 */
function getDefaultCommand(tool) {
  const defaults = {
    yaml: '',
    helm: 'helm template .',
    kustomize: 'kustomize build .'
  }
  return defaults[tool] || ''
}

/**
 * Get the default branch of the repository
 * @returns {Promise<string>} The default branch name
 */
async function getDefaultBranch() {
  try {
    const { stdout } = await exec.getExecOutput('git', [
      'symbolic-ref',
      'refs/remotes/origin/HEAD'
    ])
    return stdout.trim().replace('refs/remotes/origin/', '')
  } catch {
    return 'main'
  }
}

/**
 * Check if a tool is installed
 * @param {string} toolName - Name of the tool to check
 * @returns {Promise<boolean>} True if tool is installed
 */
async function isToolInstalled(toolName) {
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
async function installYamldiff() {
  core.info('Installing yamldiff...')
  await exec.exec('go', ['install', 'github.com/semihbkgr/yamldiff@v0.3.0'])
}

/**
 * Install helm tool using tool-cache
 * @returns {Promise<void>}
 */
async function installHelm() {
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

/**
 * Run a command in a specific directory and capture output
 * @param {string} command - Command to run
 * @param {string} workingDir - Directory to run command in
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function runCommand(command, workingDir) {
  const args = command.split(' ')
  const cmd = args.shift()

  let stdout = ''
  let stderr = ''
  let exitCode = 0

  try {
    const result = await exec.getExecOutput(cmd, args, {
      cwd: workingDir,
      ignoreReturnCode: true
    })
    stdout = result.stdout
    stderr = result.stderr
    exitCode = result.exitCode
  } catch (error) {
    stderr = error.message
    exitCode = 1
  }

  return { stdout, stderr, exitCode }
}

/**
 * Collect all YAML files from a directory recursively
 * @param {string} directory - Directory to search
 * @returns {Promise<string>} Combined YAML content
 */
async function collectYamlFiles(directory) {
  const yamlFiles = []

  async function findYamlFiles(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        await findYamlFiles(fullPath)
      } else if (entry.isFile() && /\.(yaml|yml)$/i.test(entry.name)) {
        yamlFiles.push(fullPath)
      }
    }
  }

  await findYamlFiles(directory)

  let combinedContent = ''
  for (const file of yamlFiles) {
    const content = await fs.promises.readFile(file, 'utf8')
    combinedContent += `---\n${content}\n`
  }

  return combinedContent
}

/**
 * Generate manifests using the specified tool and command
 * @param {string} tool - Tool to use (yaml, helm, kustomize)
 * @param {string} command - Command to run
 * @param {string} workingDir - Working directory
 * @returns {Promise<{content: string, stderr: string, hasError: boolean}>}
 */
async function generateManifests(tool, command, workingDir) {
  if (tool === 'yaml' && !command) {
    const content = await collectYamlFiles(workingDir)
    return { content, stderr: '', hasError: false }
  }

  const result = await runCommand(command, workingDir)
  return {
    content: result.stdout,
    stderr: result.stderr,
    hasError: result.exitCode !== 0
  }
}

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
  try {
    const tool = core.getInput('tool') || 'yaml'
    const customCommand = core.getInput('command')
    const baseRef = core.getInput('base-ref') || (await getDefaultBranch())
    const headRef = core.getInput('head-ref') || process.env.GITHUB_SHA
    const workingDir = core.getInput('working-dir') || './'

    const command = customCommand || getDefaultCommand(tool)

    core.info(`Tool: ${tool}`)
    core.info(`Command: ${command}`)
    core.info(`Base ref: ${baseRef}`)
    core.info(`Head ref: ${headRef}`)
    core.info(`Working dir: ${workingDir}`)

    let allStderr = ''
    let hasError = false

    if (tool === 'helm' && !(await isToolInstalled('helm'))) {
      await installHelm()
    }

    if (!(await isToolInstalled('yamldiff'))) {
      await installYamldiff()
    }

    const baseRepoDir = '/tmp/base-ref-repo'
    const headRepoDir = '/tmp/head-ref-repo'

    await io.rmRF(baseRepoDir)
    await io.rmRF(headRepoDir)

    core.info('Fetching latest refs from origin...')
    await exec.exec('git', ['fetch', 'origin'])

    let baseSha
    try {
      const result = await exec.getExecOutput('git', ['rev-parse', baseRef])
      baseSha = result.stdout
    } catch {
      core.info(`Failed to resolve ${baseRef}, trying origin/${baseRef}...`)
      const result = await exec.getExecOutput('git', [
        'rev-parse',
        `origin/${baseRef}`
      ])
      baseSha = result.stdout
    }

    core.info(`Cloning base ref ${baseRef}...`)
    await exec.exec('git', ['clone', '.', baseRepoDir])
    await exec.exec('git', ['checkout', baseSha.trim()], { cwd: baseRepoDir })

    let headWorkingDir
    if (headRef === process.env.GITHUB_SHA) {
      headWorkingDir = process.cwd()
    } else {
      let headSha
      try {
        const result = await exec.getExecOutput('git', ['rev-parse', headRef])
        headSha = result.stdout
      } catch {
        core.info(`Failed to resolve ${headRef}, trying origin/${headRef}...`)
        const result = await exec.getExecOutput('git', [
          'rev-parse',
          `origin/${headRef}`
        ])
        headSha = result.stdout
      }

      core.info(`Cloning head ref ${headRef}...`)
      await exec.exec('git', ['clone', '.', headRepoDir])
      await exec.exec('git', ['checkout', headSha.trim()], { cwd: headRepoDir })
      headWorkingDir = headRepoDir
    }

    core.info('Generating base manifests...')
    const baseResult = await generateManifests(
      tool,
      command,
      path.join(baseRepoDir, workingDir)
    )

    if (baseResult.hasError) {
      allStderr += `Base ref error: ${baseResult.stderr}\n`
      hasError = true
    }

    core.info('Generating head manifests...')
    const headResult = await generateManifests(
      tool,
      command,
      path.join(headWorkingDir, workingDir)
    )

    if (headResult.hasError) {
      allStderr += `Head ref error: ${headResult.stderr}\n`
      hasError = true
    }

    const baseFile = '/tmp/base-ref.yaml'
    const headFile = '/tmp/head-ref.yaml'

    await fs.promises.writeFile(baseFile, baseResult.content)
    await fs.promises.writeFile(headFile, headResult.content)

    core.info('Running yamldiff...')
    const diffResult = await runCommand(
      `yamldiff ${baseFile} ${headFile}`,
      '/tmp'
    )

    if (diffResult.exitCode !== 0) {
      allStderr += `Yamldiff error: ${diffResult.stderr}\n`
      hasError = true
    }

    // Set outputs
    core.setOutput('diff-output', diffResult.stdout)
    core.setOutput('stderr', allStderr)
    core.setOutput('error', hasError.toString())

    if (hasError) {
      core.warning('Some commands failed. Check stderr output for details.')
    }

    core.info('K8s diff action completed successfully')
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
