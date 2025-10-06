import * as core from '@actions/core'
import * as exec from '@actions/exec'

/**
 * Run a command in a specific directory and capture output
 * @param {string} command - Command to run
 * @param {string} workingDir - Directory to run command in
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
export async function runCommand(command, workingDir) {
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
 * Run prepare commands in the working directory
 * @param {string} prepareCommands - Newline-separated list of commands to run
 * @param {string} workingDir - Working directory
 * @returns {Promise<{stderr: string, hasError: boolean}>}
 */
export async function runPrepareCommands(prepareCommands, workingDir) {
  if (!prepareCommands || !prepareCommands.trim()) {
    return { stderr: '', hasError: false }
  }

  const commands = prepareCommands
    .split('\n')
    .map((cmd) => cmd.trim())
    .filter((cmd) => cmd.length > 0)

  let allStderr = ''
  let hasError = false

  for (const cmd of commands) {
    core.info(`Running prepare command: ${cmd}`)
    const result = await runCommand(cmd, workingDir)

    if (result.exitCode !== 0) {
      allStderr += `Prepare command failed (${cmd}): ${result.stderr}\n`
      hasError = true
      break
    }
  }

  return { stderr: allStderr, hasError }
}
