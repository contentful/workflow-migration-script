#!/usr/bin/env node
'use strict';

import { program } from 'commander'
import cfManagement from 'contentful-management';
import inquirer from 'inquirer';
import { processEntriesInBatch } from './models/migrate-workflow-v1-entries.js'
import { logBox, warning, error, log, info, action, success, INDENT, bold } from './libs/cli-utils.js';
import { readJsonFileSync } from './libs/files.js';

const { createClient } = cfManagement;

const SLEEP_MS = 200
const ALPHA_HEADERS =  {
    ["x-contentful-enable-alpha-feature"]: 'workflow-management-api',
};

logBox('Contentful - Workflow Migrator')

program
    .name('workflow-migrator')
    .description('CLI to migrate entries from the deprecated workflow in launch to the new workflow feature.')
    .requiredOption('--config <path-to-config-file>', 'A Config file to use for migration. See README for valid options.')
    .option('--cleanUpTags', 'Providing this option will remove the deprecated workflow tag from the entries after migration.')
    .option('--noDryRun', 'If this flag is provided, actual write action will be executed.')
    .option('--debounce <milliseconds>', 'Milliseconds to wait between processing each entry to prevent rate limiting.', SLEEP_MS)
    .version('1.0.0');

program.parse();
const { config: configFilePath, cleanUpTags: shouldCleanUpTags, noDryRun, debounce: debounceMs } = program.opts();
const dryRun = !(noDryRun ?? false);

//--------------- Script Start ------------------
if (dryRun) {
    warning('Executing script in dry run mode. Provide a "--noDryRun" flag to perform migration.')
    log()
}

action('read config file')

// ToDo: resolve relative paths
let config = readJsonFileSync(configFilePath, (e) => {
    error(`Unable to read json config file. Reason: ${e.message ?? 'Unknown error'}`, 2)
    process.exit(1)
});

const expectedConfig = ['accessToken', 'spaceId', 'environmentId']
const givenConfig = Object.keys(config)
const notDefinedConfig = expectedConfig.filter((key) => !givenConfig.includes(key))
if (notDefinedConfig.length > 0) {
    error(`Not all required config is defined in the config file. Please additionally provide: ${notDefinedConfig.join(', ')}`, 2)
    process.exit(2)
}
success("Config loaded", 2)
log()

const { spaceId, environmentId , accessToken, tags: tagsToMigrate } = config;

action('creating contentful cmaClient')
const cmaClient = createClient({ accessToken }, {
    type: 'plain',
    alphaFeatures: ['workflows'],
    defaults: { spaceId, environmentId },
})

let environment;
try {
    environment = await cmaClient.environment.get()
} catch (e) {
    error("Error creating cmaClient. Please check your config")
    process.exit(3)
}

// ToDo: check environment alias

success("cma client created", 2)
log()

info(`start migration`)
info(`---------------`)
log()
if (tagsToMigrate && (tagsToMigrate.length < 1 || tagsToMigrate.filter(t => typeof t !== 'string').length > 0)) {
    error('Config for tags is invalid. Please provide a tag list as strings.', 2)
    process.exit(3)
}

let workflowDefinitions;
try {
    workflowDefinitions = await cmaClient.workflowDefinition.getMany({}, ALPHA_HEADERS)
} catch (e) {
    error('Error fetching workflow configurations: ' + (e.message ?? 'Unknown Error)', 2));
    process.exit(4)
}


if (!workflowDefinitions || workflowDefinitions.length === 0) {
    error('No workflows configured in the target environment', 2)
    process.exit(5)
}

const workflowDefinitionIdMap = workflowDefinitions.items.reduce((carry, { sys, name, steps, appliesTo }) => {
    carry[sys.id] = {
        sys,
        name,
        stepIds: steps.map((s) => s.id),
        steps: steps.reduce((c, s) => {c[s.id] = s; return c}, {}),
        enabledContentTypes: appliesTo.map( a => a.validations.map(v => v.linkContentType).flat()).flat()
    };

    return carry;
}, {})

const tags = await cmaClient.tag.getMany({ limit: 500 })
if (!tags?.items) {
    error(`No tags found for the conifgured environment with id '${environmentId}'`);
    process.exit(6)
}

//ToDo: if no tags provided, check app installation
if (!tagsToMigrate) {
    // if no tags are provided, fetch app installation of workflow, get config
    // if config is empty, throw error
}

const oldWorkflowTags = tagsToMigrate ?? [];


// ------------------------- MIGRATION BELOW
const tagIdToNameMap = tags.items.reduce((carry, tag) => {
    carry[tag.sys.id] = tag.name;
    return carry;
}, {})
const tagNameToIdMap = Object.fromEntries(Object.entries(tagIdToNameMap).map(a => a.reverse()))

for (const oldTag of oldWorkflowTags) {
    try {
        let tagId = oldTag
        if (!tagIdToNameMap[tagId]) {
            tagId = tagNameToIdMap[oldTag] ?? null
            if (!tagId) {
                throw new Error(`The tag '${oldTag}' could not be found in the environment`)
            }
        }
        action(`process "${bold(tagIdToNameMap[tagId])}", id: ${tagId}`)
        log()

        const { workflowDefinitionId } = await inquirer.prompt({
            type: 'list',
            name: 'workflowDefinitionId',
            message: `${INDENT.repeat(2)}Please select the target workflow for migration`,
            choices: Object.values(workflowDefinitionIdMap).map((w) => ({ name: w.name, value: w.sys.id}))
        })

        const workflowDefinition = workflowDefinitionIdMap[workflowDefinitionId]
        if (workflowDefinition.sys.isLocked) {
            throw new Error(`Cannot progress with locked workflow, id '${newWorkflow.workflowDefinitionId}`)
        }

        const { workflowDefinitionStepId } = await inquirer.prompt({
            type: 'list',
            name: 'workflowDefinitionStepId',
            message: `${INDENT.repeat(2)}Please select the target workflow step for migration`,
            choices: Object.values(workflowDefinition.steps).map((s) => ({ name: s.name, value: s.id}))
        })
        
        info('fetch entries', 4)
        await processEntriesInBatch({
            tagId,
            tagName: tagIdToNameMap[tagId],
            stepId: workflowDefinitionStepId,
            workflowDefinition,
            cmaClient,
            scriptOptions: {
                dryRun,
                debounceMs,
                shouldCleanUpTags
            }
        })

        // ToDo: shouldCleanUpTags -> remove tag from environment
        success('migration completed', 2)
    } catch (e) {
        console.log(e)
        error(`Error migrating ${oldTag}: ${e.message ?? 'Unknown Error'}`)
    }

    log()
}