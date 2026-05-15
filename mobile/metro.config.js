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

// lucide-react-native publishes ESM as .mjs — Metro needs to know to resolve them.
if (!config.resolver.sourceExts.includes('mjs')) {
  config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs']
}

module.exports = config
