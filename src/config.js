/**
 * Get the default command for a given tool
 * @param {string} tool - The tool name (yaml, helm, kustomize)
 * @returns {string} The default command for the tool
 */
export function getDefaultCommand(tool) {
  const defaults = {
    yaml: '',
    helm: 'helm template .',
    kustomize: 'kustomize build .'
  }
  return defaults[tool] || ''
}

/**
 * Get the default prepare commands for a given tool
 * @param {string} tool - The tool name (yaml, helm, kustomize)
 * @returns {string} The default prepare commands for the tool (newline-separated)
 */
export function getDefaultPrepareCommands(tool) {
  const defaults = {
    yaml: '',
    helm: 'helm dependency update',
    kustomize: ''
  }
  return defaults[tool] || ''
}
