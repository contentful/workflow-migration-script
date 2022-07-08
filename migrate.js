#!/usr/bin/env node
'use strict';

import fs from 'fs';
import { program } from 'commander'
import chalk from 'chalk'
import boxen from 'boxen'
import cfManagement from 'contentful-management';

const { createClient } = cfManagement;
const INDENT = ' '
const DOT = '•'
const CHECK = '✓'
const CROSS = '✗'

const ALPHA_HEADERS =  {
    ["x-contentful-enable-alpha-feature"]: 'workflow-management-api',
};

console.log(boxen('Contentful - Workflow Migrator', { padding: 0.5, margin: { top: 0.5, left: 0.5, right: 0.5, bottom: 1 }, dimBorder: true }));

// -----------------------
const log = (message, indent) => console.log((indent > 0 ? INDENT.repeat(indent) : '') + (message ?? ''))
const error = (s, i) => log(chalk.bold.red(s), i);
const success = (s, i) => log(`${chalk.bold.green(CHECK)} ${s}`, i);
const warning = (w, i) => log(chalk.hex('#FFA500')(w), i); // Orange color
const info = (m, i) => log(chalk.white(m), i); // Orange color
const action = (m, i) => info(`${DOT} ${m}`, i); // Orange color
//------------------------

program
    .name('workflow-migrator')
    .description('CLI to migrate entries from the deprecated workflow in launch to the new workflow feature.')
    .requiredOption('--config <path-to-config-file>', 'A Config file to use for migration. See README for valid options')
    .option('--removeTagFromEntry', 'Providing this option will remove the deprecated workflow tag from the entries')
    .option('--dryRun', 'Do not perform any write action', true)
    .version('1.0.0');

program.parse();

const { config: configFilePath, removeTagFromEntry: shouldCleanUpTags, dryRun } = program.opts();

action('read config file')
// ToDo: resolve relative paths
if (!fs.existsSync(configFilePath)) {
    error(`The provided config file does not exist. Path: ${configFilePath}`, 2);
    process.exit(1)
}

let config;
try {
    const configPlainText = fs.readFileSync(configFilePath);
    config = JSON.parse(configPlainText);
} catch (e) {
    error(`Unable to read json config file. Reason: ${e.message ?? 'Unknown error'}`, 2)
    process.exit(2)
}

const expectedConfig = ['accessToken', 'spaceId', 'environmentId', 'migrationMap']
const givenConfig = Object.keys(config)
const notDefinedConfig = expectedConfig.filter((key) => !givenConfig.includes(key))
if (notDefinedConfig.length > 0) {
    error(`Not all required config is defined in the config file. Please additionally provide: ${notDefinedConfig.join(', ')}`, 2)
    process.exit(2)
}
success("Config loaded", 2)
log()

const { spaceId, environmentId , accessToken, migrationMap } = config;

action('creating contentful client')
const client = createClient({ accessToken }, {
    type: 'plain',
    alphaFeatures: ['workflows'],
    defaults: { spaceId, environmentId },
})

let environment;
try {
    environment = await client.environment.get()
} catch (e) {
    error("Error creating client. Please check your config")
}
success("Client created", 2)
log()

info(`start migration`)
info(`---------------`)
const oldWorkflowTags = Object.entries(migrationMap)
if (oldWorkflowTags.length < 1) {
    error('No workflow map defined, please check your config', 2)
    process.exit(3)
}

let workflowDefinitions;
try {
    workflowDefinitions = await client.workflowDefinition.getMany({}, ALPHA_HEADERS)
} catch (e) {
    error('Error fetching workflow configurations: ' + (e.message ?? 'Unknown Error)', 2));
    process.exit(4)
}


if (!workflowDefinitions || workflowDefinitions.length === 0) {
    error('No workflows configured in the target environment', 2)
    process.exit(5)
}

const workflowDefinitionIdMap = workflowDefinitions.items.reduce((carry, { sys, steps, appliesTo }) => {
    carry[sys.id] = {
        sys,
        stepIds: steps.map((s) => s.id),
        enabledContentTypes: appliesTo.map( a => a.validations.map(v => v.linkContentType).flat()).flat()
    };

    return carry;
}, {})

const tags = await client.tag.getMany({ limit: 500 })
if (!tags?.items) {
    error(`No tags found for the conifgured environment with id '${environmentId}'`);
    process.exit(6)
}

const tagIdToNameMap = tags.items.reduce((carry, tag) => {
    carry[tag.sys.id] = tag.name;
    return carry;
}, {})
const tagNameToIdMap = Object.fromEntries(Object.entries(tagIdToNameMap).map(a => a.reverse()))

/**
 * Mirgate entries from deprecated workflow to new workflow feature
 * - in batches
 * - including clean up
 */
async function processEntriesInBatch(tagId, stepId, workflowDefinition, totalItems, totalItemsProcessed) {
    // ToDo: built in timeout/sleep
    totalItemsProcessed = totalItemsProcessed ?? 0;
    
    const entries = await client.entry.getMany({ query: {'metadata.tags.sys.id[in]': tagId }, limit: 100, skip: totalItemsProcessed })
    if (totalItemsProcessed === 0) {
        info(`${entries.total} entries found`, 6)
        totalItems = entries.total
    }

    if (entries.items.length === 0) {
        return;
    }

    for (const entry of entries.items) {
        ++totalItemsProcessed
        if (!workflowDefinition.enabledContentTypes.includes(entry.sys.contentType.sys.id)) {
            warning(`${CROSS} ${entry.sys.id} - Entry content type '${entry.sys.contentType.sys.id}' not configured for worklfow '${workflowDefinition.sys.id}'`, 6)
            continue;
        }

        if (!dryRun) {
            try {
                await client.workflow.create({}, {
                    entity: {
                        type: 'Link',
                        linkType: 'Entry',
                        id: entry.sys.id
                    },
                    workflowDefinition: {
                        type: 'Link',
                        linkType: 'Workflow',
                        id: workflowDefinition.sys.id
                    },
                    stepId
                }, ALPHA_HEADERS);
            } catch (e) {
                error(`${CROSS} ${entry.sys.id} - could not create workflow for entry. Reason ${e.message ?? 'Unknown'}`, 6)
                continue
            }
        }
        
        if (!dryRun && shouldCleanUpTags) {
            //await client.entry.patch({}, []) // ToDo: add patch object
        }
        
        success(entry.sys.id, 6)
    }

    if (totalItems > totalItemsProcessed) {
       await processEntriesInBatch(tagId, stepId, workflowDefinition, totalItems, totalItemsProcessed)
    }
}

for (const [oldTag, newWorkflow] of oldWorkflowTags) {
    action(`process: ${oldTag}`)
    try {
        info('validate tag', 4)
        let tagId = oldTag
        if (!tagIdToNameMap[tagId]) {
            tagId = tagNameToIdMap[oldTag] ?? null
            if (!tagId) {
                throw new Error(`The tag '${oldTag}' could not be found in the environment`)
            }
        }

        info('validate workflow', 4)
        if (!newWorkflow.workflowDefinitionId || !newWorkflow.workflowDefinitionStepId) {
            throw new Error(`Please provide 'workflowDefinitionId' and 'workflowDefinitionStepId'`)
        }
        
        const workflowDefinition = workflowDefinitionIdMap[newWorkflow.workflowDefinitionId] ?? null
        if (!workflowDefinition) {
            throw new Error(`Could not find workflow definition for id '${newWorkflow.workflowDefinitionId}`)
        }

        if (!workflowDefinition.stepIds.includes(newWorkflow.workflowDefinitionStepId)) {
            throw new Error(`Could not find step for workflow step id '${newWorkflow.workflowDefinitionStepId}`)
        }

        if (workflowDefinition.sys.isLocked) {
            throw new Error(`Cannot progress with locked workflow, id '${newWorkflow.workflowDefinitionId}`)
        }
        
        info('fetch entries', 4)
        await processEntriesInBatch(tagId, newWorkflow.workflowDefinitionStepId, workflowDefinition)
        success('migrated', 2)
    } catch (e) {
        error(`Error migrating ${oldTag}: ${e.message ?? 'Unknown Error'}`)
    }

    log()
}