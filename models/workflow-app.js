import inquirer from "inquirer";
import { INDENT, error } from "../libs/cli-utils.js";
import { WORKFLOW_APP_DEFINITION_ID } from "../constants.js";

export const getWorkflowAppInstallation = (cmaClient) => {
    return cmaClient.appInstallation.get({
        appDefinitionId: WORKFLOW_APP_DEFINITION_ID,
    });
};


export const inquireRemoveTagFromConfiguration = async ({
    cmaClient,
    tagId,
    tagsByIds,
    indent,
    dryRun,
  }) => {
    const answerRemoveTag = await inquirer.prompt({
      type: "confirm",
      name: "shouldRemoveTag",
      default: true,
      message: `${INDENT.repeat(indent - 2)}Do you want to remove the tag ${
        tagsByIds[tagId].name
      } from the workflow configuration?`,
    });
  
    if (answerRemoveTag.shouldRemoveTag && !dryRun) {
      await removeTagFromWorkflowAppInstallation(cmaClient, tagId)
        .catch((e) => error(`Error removing tag from workflow configuration. Reason: ${e.message}`, indent))
    }
  };

const removeTagFromWorkflowAppInstallation = async (cmaClient, tagId) => {
    const { parameters } = await cmaClient.appInstallation.get({
        appDefinitionId: WORKFLOW_APP_DEFINITION_ID,
    });

    if (!parameters?.workflowDefinitions?.workflow?.states) {
        return
    }

    parameters.workflowDefinitions.workflow.states = parameters.workflowDefinitions.workflow.states.filter((id) => id !== tagId)
    await cmaClient.appInstallation.upsert({ appDefinitionId: WORKFLOW_APP_DEFINITION_ID }, { parameters })
};
