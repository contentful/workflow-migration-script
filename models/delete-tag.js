import inquirer from "inquirer";
import { INDENT, error } from "../libs/cli-utils.js";

export const inquireDeleteTag = async ({
  cmaClient,
  tagId,
  tagsByIds,
  indent,
  dryRun,
}) => {
  const answerRemoveTag = await inquirer.prompt({
    type: "confirm",
    name: "shouldRemoveTag",
    default: false,
    message: `${INDENT.repeat(indent - 2)}Do you want to delete the tag ${
      tagsByIds[tagId].name
    }, id: ${tagId}?`,
  });

  if (answerRemoveTag.shouldRemoveTag && !dryRun) {
    await cmaClient.tag
      .delete({ tagId, version: tagsByIds[tagId].sys.version })
      .catch((e) => error(`Error deleting tag. Reason: ${e.message}`, indent));
  }
};
