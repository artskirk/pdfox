/**
 * User prompt utilities for PDFOX CLI
 */

'use strict';

const inquirer = require('inquirer');
const chalk = require('chalk');

/**
 * Simple yes/no confirmation
 */
async function confirm(message, defaultValue = false) {
    const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message,
        default: defaultValue
    }]);
    return confirmed;
}

/**
 * Confirmation for destructive actions
 */
async function confirmDestructive(action, itemDescription) {
    console.log(chalk.yellow('\n! Warning: This action is destructive!'));
    console.log(`  ${chalk.gray('Action:')} ${action}`);
    console.log(`  ${chalk.gray('Target:')} ${itemDescription}\n`);

    const { confirmed } = await inquirer.prompt([{
        type: 'input',
        name: 'confirmed',
        message: `Type ${chalk.red("'yes'")} to confirm:`,
        validate: (input) => {
            if (input === 'yes' || input === '') {
                return true;
            }
            return 'Type exactly "yes" to confirm, or press Enter to cancel';
        }
    }]);

    return confirmed === 'yes';
}

/**
 * Select from a list
 */
async function selectFromList(message, choices) {
    const { selected } = await inquirer.prompt([{
        type: 'list',
        name: 'selected',
        message,
        choices
    }]);
    return selected;
}

/**
 * Multi-select from a list
 */
async function selectMultiple(message, choices) {
    const { selected } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'selected',
        message,
        choices
    }]);
    return selected;
}

/**
 * Get text input
 */
async function getInput(message, defaultValue = '') {
    const { value } = await inquirer.prompt([{
        type: 'input',
        name: 'value',
        message,
        default: defaultValue
    }]);
    return value;
}

/**
 * Get password input (hidden)
 */
async function getPassword(message) {
    const { value } = await inquirer.prompt([{
        type: 'password',
        name: 'value',
        message,
        mask: '*'
    }]);
    return value;
}

/**
 * Get number input
 */
async function getNumber(message, defaultValue = 0) {
    const { value } = await inquirer.prompt([{
        type: 'number',
        name: 'value',
        message,
        default: defaultValue
    }]);
    return value;
}

module.exports = {
    confirm,
    confirmDestructive,
    selectFromList,
    selectMultiple,
    getInput,
    getPassword,
    getNumber
};
