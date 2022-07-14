import fs from 'fs';

export function readJsonFileSync(pathToFile, onError) {
    if (!fs.existsSync(pathToFile)) {
        onError(new Error(`The provided config file does not exist. Path: ${configFilePath}`))
        return;
    }
    
    try {
        const content = fs.readFileSync(pathToFile);
        return JSON.parse(content);
    } catch (e) {
        onError(e)
    }
    
}