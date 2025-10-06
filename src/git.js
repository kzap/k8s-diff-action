import * as exec from '@actions/exec'

/**
 * Get the default branch of the repository
 * @returns {Promise<string>} The default branch name
 */
export async function getDefaultBranch() {
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
