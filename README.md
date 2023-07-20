<!-- shared header  START -->

<p align="center">
  <a href="https://www.contentful.com/developers/docs/references/content-management-api/">
    <img alt="Contentful Logo" title="Contentful" src="images/contentful-icon.png" width="150">
  </a>
</p>

<h1 align='center'>Workflow Migration Script</h1>

<h3 align="center">JavaScript</h3>

<p align="center">
  <a href="https://www.contentful.com/slack/">
    <img src="https://img.shields.io/badge/-Join%20Community%20Slack-2AB27B.svg?logo=slack&maxAge=31557600" alt="Join Contentful Community Slack">
  </a>
</p>

<!-- shared header  END -->

## What is Contentful?

[Contentful](https://www.contentful.com) provides a content infrastructure for digital teams to power content in websites, apps, and devices. Unlike a CMS, Contentful was built to integrate with the modern software stack. It offers a central hub for structured content, powerful management and delivery APIs, and a customizable web app that enable developers and content creators to ship digital products faster.


### Background of this script
Contentful will be discontinuing the legacy Workflows version in favour of a new version. This script provides functionality to migrate contenful entries assigned to workflows v1 tags to the new workflows v2 feature.

## Requirements
* node: >= 16
* npm: >= 8.3

## Installation
 1. Download or clone the repository to a local folder
 2. In order for the script to be run correctly, please run in the root project folder:
```
npm install .
```

## Usage
In order to start the script, please run in the root project folder:
```
./migrate.js --config ./path/to/config.json
```

The following options can be used with the script:
```
  --config <path-to-config-file>  *required*    The path to the config file to use for migration.
  --cleanUpTags                   optional      Providing this option will remove the deprecated workflow tag from entries after migration.
  --noDryRun                      optional      If this flag is provided, actual write action will be executed.
  --debounce <milliseconds>       optional      Milliseconds to wait between processing each entry to prevent rate limiting. (default: 250)
```

### Important info
1. in order to migrate entries from workflow v1 to the new workflow feature, the new workflow v2 configuration must exists beforehand. This can be done via installing the Workflow App.

2. The script executes in a dry-run mode. This means: no data is actually written. Please test the migration in this mode first, when you are sure to write data you need to add the `--noDryRun` flag on script execution.

3. The new workflow configuration must be configured for the same content type(s) as the entries that you want to migrate.

### Config
Please provide a Json config file with the following information:
```
{
    cmaToken: string,
    spaceId: string,
    environmentId: string,
    tags?: string[]
}
```

If `tags` are not provided, the script will fetch the tags used in the current workflow v1 configuration.