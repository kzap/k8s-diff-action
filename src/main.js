import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as fs from 'fs'
import * as path from 'path'
import { getDefaultCommand, getDefaultPrepareCommands } from './config.js'
import { getDefaultBranch } from './git.js'
import { isToolInstalled, installHelm, installYamldiff } from './tools.js'
import { runCommand } from './commands.js'
import { generateManifests } from './manifests.js'

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
    const workingDir = core.getInput('working-dir') || './'
    const headWorkingDir = core.getInput('head-working-dir') || workingDir
    const customPrepareCommands = core.getInput('prepare-commands')
    const command = customCommand || getDefaultCommand(tool)
    const prepareCommands =
      customPrepareCommands || getDefaultPrepareCommands(tool)

    // if headRef is undefined, use git to get current HEAD
    let result
    result = await exec.getExecOutput('git', ['rev-parse', 'HEAD'])
    const currentHeadSha = result.stdout.trim()
    const headRef =
      core.getInput('head-ref') || process.env.GITHUB_SHA || currentHeadSha

    core.info(`Tool: ${tool}`)
    core.info(`Command: ${command}`)
    core.info(`Base ref: ${baseRef}`)
    core.info(`Head ref: ${headRef}`)
    core.info(`Working dir: ${workingDir}`)
    core.info(`Head working dir: ${headWorkingDir}`)
    if (prepareCommands) {
      core.info(
        `Prepare commands: ${prepareCommands.split('\n').length} command(s)`
      )
    }

    let allStderr = ''
    let hasError = false

    if (tool === 'helm' && !(await isToolInstalled('helm'))) {
      await installHelm()
    }

    if (!(await isToolInstalled('yamldiff'))) {
      await installYamldiff()
    }
    
    // Generate YAML from Base Ref
    const baseRepoDir = '/tmp/base-ref-repo'
    await io.rmRF(baseRepoDir)
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

    core.info('Generating base manifests...')
    let baseResult
    // if dir does not exist or is empty, assume base is empty
    if (
      !fs.existsSync(path.join(baseRepoDir, workingDir)) ||
      fs.readdirSync(path.join(baseRepoDir, workingDir)).length === 0
    ) {
      core.info('Base ref is empty, assuming empty YAML')
      baseResult = {
        content: '',
        stderr: '',
        hasError: false
      }
    } else {
      baseResult = await generateManifests(
        tool,
        command,
        path.join(baseRepoDir, workingDir),
        prepareCommands
      )
    }

    if (baseResult.hasError) {
      allStderr += `Base ref error: ${baseResult.stderr}\n`
      hasError = true
    }

    const baseFile = '/tmp/base-ref.yaml'
    await fs.promises.writeFile(baseFile, baseResult.content)

    // Generate YAML from Head Ref
    const headRepoDir = '/tmp/head-ref-repo'
    await io.rmRF(headRepoDir)
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

    core.info('Generating head manifests...')
    const headResult = await generateManifests(
      tool,
      command,
      path.join(headRepoDir, headWorkingDir),
      prepareCommands
    )

    if (headResult.hasError) {
      allStderr += `Head ref error: ${headResult.stderr}\n`
      hasError = true
    }

    const headFile = '/tmp/head-ref.yaml'
    await fs.promises.writeFile(headFile, headResult.content)

    // diff both YAMLs
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
