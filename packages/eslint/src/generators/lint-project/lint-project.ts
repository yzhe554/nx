import type {
  GeneratorCallback,
  NxJsonConfiguration,
  ProjectConfiguration,
  Tree,
} from '@nx/devkit';
import {
  formatFiles,
  offsetFromRoot,
  readJson,
  readProjectConfiguration,
  runTasksInSerial,
  updateJson,
  updateProjectConfiguration,
  writeJson,
} from '@nx/devkit';

import { Linter as LinterEnum } from '../utils/linter';
import { findEslintFile } from '../utils/eslint-file';
import { join } from 'path';
import { lintInitGenerator } from '../init/init';
import type { Linter } from 'eslint';
import {
  findLintTarget,
  migrateConfigToMonorepoStyle,
} from '../init/init-migration';
import { getProjects } from 'nx/src/generators/utils/project-configuration';
import { useFlatConfig } from '../../utils/flat-config';
import {
  createNodeList,
  generateFlatOverride,
  generateSpreadElement,
  stringifyNodeList,
} from '../utils/flat-config/ast-utils';
import {
  baseEsLintConfigFile,
  baseEsLintFlatConfigFile,
  ESLINT_CONFIG_FILENAMES,
} from '../../utils/config-file';
import { hasEslintPlugin } from '../utils/plugin';
import { setupRootEsLint } from './setup-root-eslint';

interface LintProjectOptions {
  project: string;
  linter?: LinterEnum;
  eslintFilePatterns?: string[];
  tsConfigPaths?: string[];
  skipFormat: boolean;
  setParserOptionsProject?: boolean;
  skipPackageJson?: boolean;
  unitTestRunner?: string;
  rootProject?: boolean;
  keepExistingVersions?: boolean;
  addPlugin?: boolean;
}

export function lintProjectGenerator(tree: Tree, options: LintProjectOptions) {
  return lintProjectGeneratorInternal(tree, { addPlugin: false, ...options });
}

export async function lintProjectGeneratorInternal(
  tree: Tree,
  options: LintProjectOptions
) {
  options.addPlugin ??= process.env.NX_ADD_PLUGINS !== 'false';
  const tasks: GeneratorCallback[] = [];
  const initTask = await lintInitGenerator(tree, {
    skipPackageJson: options.skipPackageJson,
    addPlugin: options.addPlugin,
  });
  tasks.push(initTask);
  const rootEsLintTask = setupRootEsLint(tree, {
    unitTestRunner: options.unitTestRunner,
    skipPackageJson: options.skipPackageJson,
    rootProject: options.rootProject,
  });
  tasks.push(rootEsLintTask);
  const projectConfig = readProjectConfiguration(tree, options.project);

  let lintFilePatterns = options.eslintFilePatterns;
  if (!lintFilePatterns && options.rootProject && projectConfig.root === '.') {
    lintFilePatterns = ['./src'];
  }
  if (
    lintFilePatterns &&
    lintFilePatterns.length &&
    !lintFilePatterns.includes('{projectRoot}') &&
    isBuildableLibraryProject(projectConfig)
  ) {
    lintFilePatterns.push(`{projectRoot}/package.json`);
  }

  const hasPlugin = hasEslintPlugin(tree);
  if (hasPlugin) {
    if (
      lintFilePatterns &&
      lintFilePatterns.length &&
      lintFilePatterns.some(
        (p) => !['./src', '{projectRoot}', projectConfig.root].includes(p)
      )
    ) {
      projectConfig.targets['lint'] = {
        command: `eslint ${lintFilePatterns
          .join(' ')
          .replace('{projectRoot}', projectConfig.root)}`,
      };
    }
  } else {
    projectConfig.targets['lint'] = {
      executor: '@nx/eslint:lint',
    };

    if (lintFilePatterns && lintFilePatterns.length) {
      // only add lintFilePatterns if they are explicitly defined
      projectConfig.targets['lint'].options = {
        lintFilePatterns,
      };
    }
  }

  // we are adding new project which is not the root project or
  // companion e2e app so we should check if migration to
  // monorepo style is needed
  if (!options.rootProject) {
    const projects = {} as any;
    getProjects(tree).forEach((v, k) => (projects[k] = v));
    if (isMigrationToMonorepoNeeded(projects, tree)) {
      // we only migrate project configurations that have been created
      const filteredProjects = [];
      Object.entries(projects).forEach(([name, project]) => {
        if (name !== options.project) {
          filteredProjects.push(project);
        }
      });
      migrateConfigToMonorepoStyle(
        filteredProjects,
        tree,
        options.unitTestRunner,
        options.keepExistingVersions
      );
    }
  }

  // our root `.eslintrc` is already the project config, so we should not override it
  // additionally, the companion e2e app would have `rootProject: true`
  // so we need to check for the root path as well
  if (!options.rootProject || projectConfig.root !== '.') {
    createEsLintConfiguration(
      tree,
      projectConfig,
      options.setParserOptionsProject,
      options.rootProject
    );
  }

  // Buildable libs need source analysis enabled for linting `package.json`.
  if (
    isBuildableLibraryProject(projectConfig) &&
    !isJsAnalyzeSourceFilesEnabled(tree)
  ) {
    updateJson(tree, 'nx.json', (json) => {
      json.pluginsConfig ??= {};
      json.pluginsConfig['@nx/js'] ??= {};
      json.pluginsConfig['@nx/js'].analyzeSourceFiles = true;
      return json;
    });
  }

  updateProjectConfiguration(tree, options.project, projectConfig);

  if (!options.skipFormat) {
    await formatFiles(tree);
  }

  return runTasksInSerial(...tasks);
}

function createEsLintConfiguration(
  tree: Tree,
  projectConfig: ProjectConfiguration,
  setParserOptionsProject: boolean,
  rootProject: boolean
) {
  // we are only extending root for non-standalone projects or their complementary e2e apps
  const extendedRootConfig = rootProject ? undefined : findEslintFile(tree);
  const pathToRootConfig = extendedRootConfig
    ? `${offsetFromRoot(projectConfig.root)}${extendedRootConfig}`
    : undefined;
  const addDependencyChecks = isBuildableLibraryProject(projectConfig);

  const overrides: Linter.ConfigOverride<Linter.RulesRecord>[] = [
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      /**
       * NOTE: We no longer set parserOptions.project by default when creating new projects.
       *
       * We have observed that users rarely add rules requiring type-checking to their Nx workspaces, and therefore
       * do not actually need the capabilites which parserOptions.project provides. When specifying parserOptions.project,
       * typescript-eslint needs to create full TypeScript Programs for you. When omitting it, it can perform a simple
       * parse (and AST tranformation) of the source files it encounters during a lint run, which is much faster and much
       * less memory intensive.
       *
       * In the rare case that users attempt to add rules requiring type-checking to their setup later on (and haven't set
       * parserOptions.project), the executor will attempt to look for the particular error typescript-eslint gives you
       * and provide feedback to the user.
       */
      parserOptions: !setParserOptionsProject
        ? undefined
        : {
            project: [`${projectConfig.root}/tsconfig.*?.json`],
          },
      /**
       * Having an empty rules object present makes it more obvious to the user where they would
       * extend things from if they needed to
       */
      rules: {},
    },
    {
      files: ['*.ts', '*.tsx'],
      rules: {},
    },
    {
      files: ['*.js', '*.jsx'],
      rules: {},
    },
  ];

  if (isBuildableLibraryProject(projectConfig)) {
    overrides.push({
      files: ['*.json'],
      parser: 'jsonc-eslint-parser',
      rules: {
        '@nx/dependency-checks': 'error',
      },
    });
  }

  if (useFlatConfig(tree)) {
    const isCompatNeeded = addDependencyChecks;
    const nodes = [];
    const importMap = new Map();
    if (extendedRootConfig) {
      importMap.set(pathToRootConfig, 'baseConfig');
      nodes.push(generateSpreadElement('baseConfig'));
    }
    overrides.forEach((override) => {
      nodes.push(generateFlatOverride(override));
    });
    const nodeList = createNodeList(importMap, nodes, isCompatNeeded);
    const content = stringifyNodeList(nodeList);
    tree.write(join(projectConfig.root, 'eslint.config.js'), content);
  } else {
    writeJson(tree, join(projectConfig.root, `.eslintrc.json`), {
      extends: extendedRootConfig ? [pathToRootConfig] : undefined,
      // Include project files to be linted since the global one excludes all files.
      ignorePatterns: ['!**/*'],
      overrides,
    });
  }
}

function isJsAnalyzeSourceFilesEnabled(tree: Tree): boolean {
  const nxJson = readJson<NxJsonConfiguration>(tree, 'nx.json');
  const jsPluginConfig = nxJson.pluginsConfig?.['@nx/js'] as {
    analyzeSourceFiles?: boolean;
  };

  return (
    jsPluginConfig?.analyzeSourceFiles ??
    nxJson.extends !== 'nx/presets/npm.json'
  );
}

function isBuildableLibraryProject(
  projectConfig: ProjectConfiguration
): boolean {
  return (
    projectConfig.projectType === 'library' &&
    projectConfig.targets?.build &&
    !!projectConfig.targets.build
  );
}

/**
 * Detect based on the state of lint target configuration of the root project
 * if we should migrate eslint configs to monorepo style
 */
function isMigrationToMonorepoNeeded(
  projects: Record<string, ProjectConfiguration>,
  tree: Tree
): boolean {
  // the base config is already created, migration has been done
  if (
    tree.exists(baseEsLintConfigFile) ||
    tree.exists(baseEsLintFlatConfigFile)
  ) {
    return false;
  }

  const configs = Object.values(projects);
  if (configs.length === 1) {
    return false;
  }

  // get root project
  const rootProject = configs.find((p) => p.root === '.');
  if (!rootProject || !rootProject.targets) {
    return false;
  }
  // check if we're inferring lint target from `@nx/eslint/plugin`
  if (hasEslintPlugin(tree)) {
    for (const f of ESLINT_CONFIG_FILENAMES) {
      if (tree.exists(f)) {
        return true;
      }
    }
  }
  // find if root project has lint target
  const lintTarget = findLintTarget(rootProject);
  return !!lintTarget;
}
