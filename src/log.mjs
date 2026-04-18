import chalk from 'chalk';

const logPrefix = chalk.bold.hex('#2ec4b6')('wt');
const warnPrefix = chalk.bold.hex('#ff9f1c')('wt  warn');
const errorPrefix = chalk.bold.hex('#e71d36')('wt  error');

export function log(message) {
  console.log(`${logPrefix}  ${message}`);
}

export function warn(message) {
  console.warn(`${warnPrefix}: ${message}`);
}

export function die(message) {
  console.error(`${errorPrefix}: ${message}`);
  process.exit(1);
}
