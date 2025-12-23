/**
 * PDFOX Admin Console - Main CLI Setup
 */

'use strict';

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');

// Load package.json for version
const pkg = require(path.join(__dirname, '..', '..', 'package.json'));

const program = new Command();

program
    .name('pdfox')
    .description(chalk.cyan('PDFOX Admin Console') + ' - Manage your PDFOX application')
    .version(pkg.version || '1.0.0', '-v, --version', 'Display version number')
    .option('--json', 'Output in JSON format for scripting')
    .option('--no-color', 'Disable colored output')
    .option('--force', 'Skip confirmation prompts');

// Register command groups
require('./commands/env')(program);
require('./commands/pro')(program);
require('./commands/share')(program);
require('./commands/cleanup')(program);
require('./commands/stripe')(program);
require('./commands/stats')(program);
require('./commands/logs')(program);

// Custom help
program.addHelpText('after', `
${chalk.yellow('Examples:')}
  $ pdfox env:show                    Show current environment
  $ pdfox pro:list --active           List active Pro users
  $ pdfox pro:grant user@email.com    Grant Pro access
  $ pdfox share:list                  List all shares
  $ pdfox stats                       Show usage statistics
  $ pdfox cleanup:status              Preview cleanup actions

${chalk.yellow('Documentation:')}
  For more information, visit the PDFOX documentation.
`);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
