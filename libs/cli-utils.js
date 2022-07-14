import chalk from 'chalk'
import boxen from 'boxen'

// LOGGING
export const INDENT = ' '
export const DOT = '•'
export const CHECK = '✓'
export const CROSS = '✗'

export const log = (message, indent) => console.log((indent > 0 ? INDENT.repeat(indent) : '') + (message ?? ''))

export const error = (s, i) => log(chalk.bold.red(s), i);
export const success = (s, i) => log(`${chalk.bold.green(CHECK)} ${s}`, i);
export const warning = (w, i) => log(chalk.hex('#FFA500')(w), i); 
export const info = (m, i) => log(chalk.white(m), i);
export const action = (m, i) => info(`${DOT} ${m}`, i);

export const logBox = (s) => console.log(boxen(s, { padding: 0.5, margin: { top: 0.5, left: 0.5, right: 0.5, bottom: 1 }, dimBorder: true }));

export const bold = (message) => chalk.bold(message)