
const currentWorkingDirectory = process.cwd();
export function resolveToAbsolutePath(path) {
    if (/^\.\/.*/.test(path) ) {
        return `${currentWorkingDirectory}/${path}`
    }

    return path;
}