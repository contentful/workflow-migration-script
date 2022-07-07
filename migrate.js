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

console.log(boxen('Contentful - Workflow Migrator', { padding: 0.5, margin: { top: 0.5, left: 0.5, right: 0.5, bottom: 1 }, dimBorder: true }));

const log = (message, indent) => console.log((indent > 0 ? INDENT.repeat(indent) : '') + (message ?? ''))
const error = (s, i) => log(chalk.bold.red(s), i);
const success = (s, i) => log(`${chalk.bold.green(CHECK)} ${s}`, i);
const warning = (w, i) => log(chalk.hex('#FFA500')(w), i); // Orange color
const info = (m, i) => log(chalk.white(m), i); // Orange color

program
    .name('workflow-migrator')
    .description('CLI to migrate entries from the deprecated workflow in launch to the new workflow feature.')
    .requiredOption('--config <path-to-config-file>', 'A Config file to use for migration. See README for valid options')
    .version('1.0.0');

program.parse();

const { config: configFilePath } = program.opts();

info(`${DOT} read config file`)
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

const { spaceId, environmentId , accessToken } = config;

info(`${DOT} creating contentful client`)
const client = createClient({ accessToken }, {
    type: 'plain',
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

info(`${DOT} validate workflow data`)
// ToDo
// 1. validate that workflow exists with given step

// 2. migrate entries
// * loop through all tags from map
// * fetch all entries tagged with given tag
// * start workflow for given entry
// * remove tag ( make it as an optional parameter )