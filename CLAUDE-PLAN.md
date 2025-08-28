# K8s Diff Action Implementation Plan

## Overview
We are creating a GitHub Action that will diff Kubernetes manifests between a base ref (default: main branch) and a head ref (default: current commit). The action will support three tools: helm, kustomize, and plain yaml.

## Architecture

### Input Parameters (all optional)
- `tool` - Tool to use for manifest generation (default: "yaml")
  - Options: "yaml", "helm", "kustomize"
- `command` - Command to execute for manifest generation (default: depends on tool)
  - yaml: "" (no command, collect files directly)
  - helm: "helm template ."
  - kustomize: "kustomize build ."
- `base-ref` - Base reference for comparison (default: "main" or repo default branch)
- `head-ref` - Head reference for comparison (default: current commit)
- `working-dir` - Working directory relative to repo root (default: "./")

### Output Parameters
- `diff-output` - The YAML diff between base and head manifests
- `stderr` - Standard error output from failed commands (for debugging)
- `error` - Boolean indicating if any command failed (true/false)

## Implementation Steps

### 1. Update action.yml
- Define input parameters with proper descriptions and defaults
- Define output parameter for diff-output
- Update branding and metadata

### 2. Core Implementation (src/main.js)

#### 2.1 Input Processing
- Read and validate input parameters
- Determine default branch if base-ref not specified
- Validate working directory exists

#### 2.2 Tool Installation
- Check if required tools exist in $PATH
- Use @actions/tool-cache to download missing tools:
  - helm: Download from GitHub releases
  - kustomize: Download from GitHub releases
  - yamldiff: Install via `go install github.com/semihbkgr/yamldiff@v0.3.0`

#### 2.3 Repository Checkout Strategy
- Checkout base-ref to `/tmp/base-ref-repo/`
- If head-ref != current commit:
  - Checkout head-ref to `/tmp/head-ref-repo/`
- Else:
  - Use current working directory

#### 2.4 Manifest Generation
- For each checkout location:
  - Navigate to working-dir
  - Execute command based on tool (or use custom command if provided):
    - **yaml**: Collect all .yaml/.yml files recursively (no command)
    - **helm**: Run command (default: "helm template .")
    - **kustomize**: Run command (default: "kustomize build .")
  - If command exits with non-zero code:
    - Capture stderr output
    - Set error=true output
    - Continue processing (don't fail immediately)
  - Save output to single YAML file (base-ref.yaml, head-ref.yaml)

#### 2.5 Diff Generation
- Run yamldiff tool on both YAML files
- If yamldiff exits with non-zero code:
  - Append yamldiff output to stderr
  - Set error=true output
- Capture diff output and set as action output

### 3. Dependencies (package.json updates)
```json
{
  "dependencies": {
    "@actions/core": "^1.10.1",
    "@actions/exec": "^1.1.1",
    "@actions/io": "^1.1.3",
    "@actions/tool-cache": "^2.0.1",
    "@actions/github": "^6.0.0"
  }
}
```

### 4. Testing Strategy

#### 4.1 Unit Tests (__tests__/main.test.js)
- Test input parameter parsing and validation
- Test tool detection and installation logic
- Test manifest generation for each tool type
- Mock external dependencies (@actions/exec, @actions/tool-cache)

#### 4.2 Integration Tests (__tests__/integration.test.js)
- Test end-to-end workflow with real fixtures
- Test each tool type with sample manifests
- Verify diff output format and content

#### 4.3 E2E Tests (.github/workflows/e2e-test.yml)
- Test action in real GitHub Actions environment
- Use test fixtures from tests/fixtures/
- Verify action outputs and behavior

### 5. Test Fixtures (tests/fixtures/)

#### 5.1 Helm Chart Examples
```
tests/fixtures/helm/
├── ingress-nginx/          # Real-world helm chart
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
└── basic-app/              # Simple test chart
    ├── Chart.yaml
    ├── values.yaml
    └── templates/
```

#### 5.2 Kustomize Examples
```
tests/fixtures/kustomize/
├── base/
│   ├── kustomization.yaml
│   └── deployment.yaml
└── overlays/
    └── production/
        ├── kustomization.yaml
        └── patches/
```

#### 5.3 Plain YAML Examples
```
tests/fixtures/yaml/
├── deployment.yaml
├── service.yaml
└── configmap.yaml
```

### 6. Tool Installation Implementation

#### 6.1 Tool Detection
```javascript
async function isToolInstalled(toolName) {
  try {
    await exec.exec(`which ${toolName}`, [], { silent: true })
    return true
  } catch {
    return false
  }
}
```

#### 6.2 Tool Installation Functions
- `installHelm()` - Download and cache helm binary
- `installKustomize()` - Download and cache kustomize binary  
- `installYamldiff()` - Install via go install command

#### 6.3 Version Management
- Use specific versions for reproducible builds
- Cache tools using @actions/tool-cache for performance

### 7. Manifest Generation Implementation

#### 7.1 Generic Command Runner
```javascript
async function runCommand(command, workingDir) {
  // Execute command in working directory
  // Capture stdout, stderr, and exit code
  // Return { stdout, stderr, exitCode }
}
```

#### 7.2 YAML Collection (when no command)
```javascript
async function collectYamlFiles(directory) {
  // Recursively find .yaml/.yml files
  // Concatenate into single YAML document
}
```

#### 7.3 Command Execution Logic
```javascript
async function generateManifests(tool, command, workingDir) {
  if (tool === 'yaml' && !command) {
    return await collectYamlFiles(workingDir)
  } else {
    const result = await runCommand(command, workingDir)
    // Handle stderr and error states
    return result
  }
}
```

### 8. Error Handling
- Validate tool installation success
- Handle missing Chart.yaml/kustomization.yaml files
- Capture stderr from failed commands for debugging
- Set error=true output when commands fail
- Continue processing even when commands fail (for debugging)
- Provide clear error messages for common issues
- Include stderr output in action summary for troubleshooting

### 9. CI/CD Integration
- Update existing workflows to test new functionality
- Add e2e-test.yml workflow for comprehensive testing
- Ensure dist/ is properly built and committed

### 10. Documentation Updates
- Update README.md with usage examples
- Document input/output parameters
- Provide example workflows for each tool type
- Include troubleshooting section

## File Structure After Implementation
```
├── src/
│   ├── main.js              # Core action logic
│   ├── tools/
│   │   ├── installer.js     # Tool installation utilities
│   │   ├── helm.js          # Helm-specific operations
│   │   ├── kustomize.js     # Kustomize-specific operations
│   │   └── yaml.js          # YAML collection utilities
│   └── utils/
│       ├── git.js           # Git operations
│       └── diff.js          # Diff generation
├── tests/fixtures/          # Test data
├── __tests__/               # Unit and integration tests
├── .github/workflows/
│   └── e2e-test.yml        # End-to-end testing
└── action.yml              # Updated action metadata
```

## Success Criteria
1. Action successfully installs required tools when missing
2. Generates manifests correctly for helm and yaml tool types (kustomize later)
3. Produces meaningful YAML diffs between base and head refs
4. Captures stderr and sets error flags for debugging failed commands
5. Passes all unit, integration, and e2e tests for helm and yaml
6. Works with real-world Kubernetes manifests and helm charts
7. Provides clear error messages and debugging information
8. Follows GitHub Actions best practices for inputs/outputs

## Initial Implementation Scope
- **Phase 1**: Implement helm and yaml tool support with e2e tests
- **Phase 2**: Add kustomize support later
- Focus on robust error handling and debugging capabilities
