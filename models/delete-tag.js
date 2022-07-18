import inquirer from 'inquirer';
import { INDENT } from '../libs/cli-utils.js';

export const inquireDeleteTag = async ({ cmaClient, tagId, tagsByIds, indent }) => {
    const answerRemoveTag = await inquirer.prompt({
        type: 'confirm',
        name: 'shouldRemoveTag',
        default: false,
        message: `${INDENT.repeat(indent - 2)}Do you want to delete the tag ${tagsByIds[tagId].name}, id: ${tagId}?`
    })

    if (answerRemoveTag.shouldRemoveTag) {
        await cmaClient.tag
            .delete({ tagId, version: tagsByIds[tagId].sys.version})
            .catch((e) => error(`Error deleting tag. Reason: ${e.message}`, indent))
    }
}