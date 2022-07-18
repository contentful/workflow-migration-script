# workflow-migration-script
This script provides functionality to migrate entries assigned to workflows v1 tags to the new workflows v2 feature.

## Requirements
* node: >= 16
* npm: >= 8.3

## Installation
In order for the script to be run correctly, please run in the root project folder:
```
npm install
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

### Config
Please provide a Json config file with the following information:
```
{
    accessToken: string,
    spaceId: string,
    environmentId: string,
    tags?: string[]
}
```

If `tags` are not provided, the script will fetch the tags used in the current workflow v1 configuration.