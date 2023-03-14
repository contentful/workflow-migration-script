#!/usr/bin/env node
"use strict";

import { program } from "commander";
import cfManagement from "contentful-management";
import inquirer from "inquirer";
import { processEntriesInBatch } from "./models/migrate-workflow-v1-entries.js";
import { inquireDeleteTag } from "./models/delete-tag.js";
import { getWorkflowAppInstallation, inquireRemoveTagFromConfiguration } from "./models/workflow-app.js";
import {
  logBox,
  warning,
  error,
  log,
  info,
  action,
  success,
  INDENT,
  bold,
  CROSS,
} from "./libs/cli-utils.js";
import { readJsonFileSync } from "./libs/files.js";
import { resolveToAbsolutePath } from "./libs/paths.js";
import { ALPHA_HEADERS, DEFAULT_BOUNCE_MS } from "./constants.js";

const { createClient } = cfManagement;

logBox("Contentful - Workflow Migrator");

program
  .name("workflow-migrator")
  .description(
    "CLI to migrate entries from the deprecated workflow in launch to the new workflow feature."
  )
  .requiredOption(
    "--config <path-to-config-file>",
    "A Config file to use for migration. See README for valid options."
  )
  .option(
    "--cleanUpTags",
    "Providing this option will remove the deprecated workflow tag from the entries after migration."
  )
  .option(
    "--noDryRun",
    "If this flag is provided, actual write action will be executed."
  )
  .option(
    "--debounce <milliseconds>",
    "Milliseconds to wait between processing each entry to prevent rate limiting.",
    DEFAULT_BOUNCE_MS
  )
  .version("1.0.0");

program.parse();
const {
  config: configFilePath,
  cleanUpTags: shouldCleanUpTags,
  noDryRun,
  debounce: debounceMs,
} = program.opts();
const dryRun = !(noDryRun ?? false);

//--------------- Script Start ------------------
if (dryRun) {
  warning(
    'Executing script in dry run mode. Provide a "--noDryRun" flag to perform migration.'
  );
  log();
} else {
  error("WARNING: write mode enabled. All migrations will be executed.");
  log();
}

action("read config file");
let config = readJsonFileSync(resolveToAbsolutePath(configFilePath), (e) => {
  error(
    `Unable to read json config file. Reason: ${e.message ?? "Unknown error"}`,
    2
  );
  process.exit(1);
});

const expectedConfig = ["cmaToken", "spaceId", "environmentId"];
const givenConfig = Object.keys(config);
const notDefinedConfig = expectedConfig.filter(
  (key) => !givenConfig.includes(key)
);
if (notDefinedConfig.length > 0) {
  error(
    `Not all required config is defined in the config file. Please additionally provide: ${notDefinedConfig.join(
      ", "
    )}`,
    2
  );
  process.exit(2);
}
success("Config loaded", 2);
log();

const { spaceId, environmentId, cmaToken, tags: tagsFromConfig } = config;

action("creating contentful cmaClient");
const cmaClient = createClient(
  { accessToken: cmaToken },
  {
    type: "plain",
    alphaFeatures: ["workflows"],
    defaults: { spaceId, environmentId },
  }
);

try {
  await cmaClient.environment.get();
} catch (e) {
  error(
    `Error creating cmaClient. Please check your config. Reason: ${e.message}`
  );
  process.exit(2);
}

success("cma client created", 2);
log();

let tagsToMigrate = [];
if (tagsFromConfig) {
  action("loading tags from config");
  if (
    tagsFromConfig.length < 1 ||
    tagsFromConfig.filter((t) => typeof t !== "string").length > 0
  ) {
    error(
      "Config for tags is invalid. Please provide a tag list as strings.",
      2
    );
    process.exit(3);
  }

  tagsToMigrate = tagsFromConfig;
  success("loaded", 2);
}

// load app installation config
if (!tagsFromConfig) {
  action("loading workflows v1 configured tags");
  try {
    const { parameters } = getWorkflowAppInstallation(cmaClient)
    if (!parameters?.workflowDefinitions?.workflow?.states) {
      throw new Error("No workflow v1 configured for environment.");
    }

    tagsToMigrate = parameters.workflowDefinitions.workflow.states;

    for (const tagId of tagsToMigrate) {
      info(
        `"${
          parameters.workflowStates[tagId]?.name ?? "(tag not found)"
        }" id: ${tagId}`,
        3
      );
    }
  } catch (e) {
    error(`Error fetching workflow v1 config. Reason: ${e.message}`, 2);
    process.exit(3);
  }

  log();
  success("loaded", 2);
}

log();
info(`start migration`);
info(`---------------`);
log();

let workflowDefinitions;
try {
  workflowDefinitions = await cmaClient.workflowDefinition.getMany(
    {},
    ALPHA_HEADERS
  );
} catch (e) {
  error(
    "Error fetching workflow configurations: " +
      (e.message ?? "Unknown Error)", 2)
  );
  process.exit(4);
}

if (!workflowDefinitions || workflowDefinitions.length === 0) {
  error("No workflows configured in the target environment", 2);
  process.exit(5);
}

const workflowDefinitionIdMap = workflowDefinitions.items.reduce(
  (carry, { sys, name, steps, appliesTo }) => {
    carry[sys.id] = {
      sys,
      name,
      stepIds: steps.map((s) => s.id),
      steps: steps.reduce((c, s) => {
        c[s.id] = s;
        return c;
      }, {}),
      enabledContentTypes: appliesTo
        .map((a) => a.validations.map((v) => v.linkContentType).flat())
        .flat(),
    };

    return carry;
  },
  {}
);

const allTags = await cmaClient.tag.getMany({ limit: 500 });
if (!allTags?.items) {
  error(
    `No tags found for the conifgured environment with id '${environmentId}'`
  );
  process.exit(6);
}

// ------------------------- MIGRATION BELOW
const oldWorkflowTags = tagsToMigrate ?? [];
const tagsByIds = allTags.items.reduce((carry, tag) => {
  carry[tag.sys.id] = tag;
  return carry;
}, {});

const tagNameToIdMap = Object.fromEntries(
  Object.entries(tagsByIds).map((a) => [a[1].name, a[0]])
);

for (const oldTag of oldWorkflowTags) {
  try {
    let tagId = oldTag;
    if (!tagsByIds[tagId]) {
      tagId = tagNameToIdMap[oldTag] ?? null;
      if (!tagId) {
        warning(
          `${CROSS} The tag '${oldTag}' could not be found in the environment.`
        );
        continue;
      }
    }
    action(`process "${bold(tagsByIds[tagId].name)}", id: ${tagId}`);
    log();

    const { workflowDefinitionId } = await inquirer.prompt({
      type: "list",
      name: "workflowDefinitionId",
      message: `${INDENT.repeat(
        2
      )}Please select the target workflow for migration`,
      choices: Object.values(workflowDefinitionIdMap).map((w) => ({
        name: w.name,
        value: w.sys.id,
      })),
    });

    const workflowDefinition = workflowDefinitionIdMap[workflowDefinitionId];
    if (workflowDefinition.sys.isLocked) {
      throw new Error(
        `Cannot progress with locked workflow, id '${newWorkflow.workflowDefinitionId}`
      );
    }

    const { workflowDefinitionStepId } = await inquirer.prompt({
      type: "list",
      name: "workflowDefinitionStepId",
      message: `${INDENT.repeat(
        2
      )}Please select the target workflow step for migration`,
      choices: Object.values(workflowDefinition.steps).map((s) => ({
        name: s.name,
        value: s.id,
      })),
    });

    info("fetch entries", 4);
    const { canDeleteTag } = await processEntriesInBatch({
      tagId,
      tagName: tagsByIds[tagId].name,
      stepId: workflowDefinitionStepId,
      workflowDefinition,
      cmaClient,
      scriptOptions: {
        dryRun,
        debounceMs,
        shouldCleanUpTags,
      },
    });

    await inquireRemoveTagFromConfiguration({
      cmaClient,
      tagId,
      tagsByIds,
      indent: 4,
      dryRun,
    })

    if (canDeleteTag) {
      await inquireDeleteTag({
        cmaClient,
        tagId,
        tagsByIds,
        indent: 4,
        dryRun,
      });
    }

    success("migration completed", 2);
  } catch (e) {
    console.log(e);
    error(`Error migrating ${oldTag}: ${e.message ?? "Unknown Error"}`);
  }

  log();
}
