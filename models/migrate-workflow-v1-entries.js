import inquirer from 'inquirer';
import chalk from 'chalk'
import { warning, error, success, log, info, INDENT, CROSS, sleep } from '../libs/cli-utils.js';
import { ALPHA_HEADERS } from '../constants.js';

/**
 * Mirgate entries from deprecated workflow to new workflow feature
 * - in batches
 * - including clean up
 */
export async function processEntriesInBatch(args) {
    let {
        tagId,
        tagName,
        stepId,
        workflowDefinition,
        shouldRemoveTagsFromEntries,
        totalItems,
        totalItemsProcessed,
        scriptOptions: {
            dryRun,
            debounceMs,
            shouldCleanUpTags
        },
        cmaClient,
        batchSize
    } = args;

    totalItemsProcessed = totalItemsProcessed ?? 0;
    
    const entries = await cmaClient.entry.getMany({ query: {'metadata.tags.sys.id[in]': tagId }, limit: batchSize ?? 100, skip: totalItemsProcessed })
    if (entries.items.length === 0) {
        info(`No entries found.`, 6)
        return { canDeleteTag: true };
    }

    if (totalItemsProcessed === 0) {
        log('')
        info(`Will start migrating:`, 6)
        info(`- ${entries.total} entries`, 8)
        info(`- from tag "${chalk.underline(tagName)}" with id "${tagId}"`, 8)
        info(`- to "${chalk.underline(workflowDefinition.steps[stepId].name)}" of workflow "${chalk.italic(workflowDefinition.name)}"`, 8)

        const { shouldStartMigration } = await inquirer.prompt({
            type: 'confirm',
            name: 'shouldStartMigration',
            default: false,
            message: `${INDENT.repeat(6)}Should start migrating entries?`
        })

        if (!shouldStartMigration) {
            info(`aborted migration for tag '${tagId}'`, 6)
            return { canDeleteTag: false };
        }

        shouldRemoveTagsFromEntries = shouldRemoveTagsFromEntries ?? shouldCleanUpTags
        if (shouldRemoveTagsFromEntries === undefined) {
            const answerRemoveTagMapping = await inquirer.prompt({
                type: 'confirm',
                name: 'shouldRemoveTagsFromEntries',
                default: false,
                message: `${INDENT.repeat(6)}Do you want to remove the tag from entries after migration?`
            })
            shouldRemoveTagsFromEntries = answerRemoveTagMapping.shouldRemoveTagsFromEntries;
        }

        totalItems = entries.total
    }

    for (const entry of entries.items) {
        await sleep(debounceMs)
        
        ++totalItemsProcessed
        if (!workflowDefinition.enabledContentTypes.includes(entry.sys.contentType.sys.id)) {
            warning(`${CROSS} ${entry.sys.id} - Entry content type '${entry.sys.contentType.sys.id}' not configured for workflow '${workflowDefinition.name}'`, 6)
            continue;
        }
        if (!dryRun) {
            // start new workflow
            try {
                await cmaClient.workflow.create({}, {
                    entity: {
                        sys: {
                            type: 'Link',
                            linkType: 'Entry',
                            id: entry.sys.id
                        }
                    },
                    workflowDefinition: {
                        sys: {
                            type: 'Link',
                            linkType: 'WorkflowDefinition',
                            id: workflowDefinition.sys.id
                        }
                    },
                    stepId
                }, ALPHA_HEADERS);
                success(`${entry.sys.id} - workflow created` , 6)
            } catch (e) {
                if (e.message.includes('an active workflow already exists')) {
                    warning(`${CROSS} ${entry.sys.id} - A workflow already exists for this entry`, 6)
                } else {
                    error(`${CROSS} ${entry.sys.id} - could not create workflow for entry. Reason ${e.message ?? 'Unknown'}`, 6)
                    continue
                }
            }
        }
        
        // remove tag
        if (!dryRun && shouldRemoveTagsFromEntries) {
            try {
                const currentEntry = await cmaClient.entry.get({ entryId: entry.sys.id }) // refetch for version
                await cmaClient.entry.patch({
                    entryId: entry.sys.id,
                }, [{
                    op: "replace",
                    path: "/metadata/tags",
                    value: entry.metadata.tags.filter(t => t.sys.id !== tagId)
                }], {
                    ['X-Contentful-Version']: currentEntry.sys.version,
                })
                success(`${entry.sys.id} - tag removed` , 6)
            } catch (e) {
                error(`${CROSS}${entry.sys.id} - could not remove tag from entry. Reason ${e.message ?? 'Unknown'}`, 6)
                continue;
            }
        }
    }

    if (totalItems > totalItemsProcessed) {
       await processEntriesInBatch({ ...args, shouldRemoveTagsFromEntries, totalItems, totalItemsProcessed})
    }

    return { canDeleteTag: shouldRemoveTagsFromEntries} ;
}
