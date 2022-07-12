# workflow-migration-script
This script provides the functionality to migrate entries assigned to workflows v1 tags to the new workflows v2 feature.

## Installation
tbd.

## Usage
tbd.

### Config
```
{
    accessToken: string,
    spaceId: string,
    environmentId: string,
    tags?: string[]
}
```

If `tags` are not provided, the script will fetch the current workflow v1 configuration and will start migrating these tags.