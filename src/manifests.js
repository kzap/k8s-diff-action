import * as fs from 'fs'
import * as path from 'path'
import { runCommand, runPrepareCommands } from './commands.js'

/**
 * Collect all YAML files from a directory recursively
 * @param {string} directory - Directory to search
 * @returns {Promise<string>} Combined YAML content
 */
export async function collectYamlFiles(directory) {
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
 * @param {string} prepareCommands - Commands to run before generating manifests
 * @returns {Promise<{content: string, stderr: string, hasError: boolean}>}
 */
export async function generateManifests(
  tool,
  command,
  workingDir,
  prepareCommands
) {
  // Run prepare commands first
  const prepareResult = await runPrepareCommands(prepareCommands, workingDir)
  if (prepareResult.hasError) {
    return {
      content: '',
      stderr: prepareResult.stderr,
      hasError: true
    }
  }

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
