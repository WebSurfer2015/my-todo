const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

// Watch the sibling core/ package so Metro picks up shared business logic.
config.watchFolders = [path.resolve(workspaceRoot, 'core')]

// Resolve modules from the project's own node_modules first, then walk up.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
]

module.exports = config
