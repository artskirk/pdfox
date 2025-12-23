/**
 * Environment management commands for PDFOX CLI
 */

'use strict';

const chalk = require('chalk');
const { getConfig, readEnvFile, updateEnvFile, PATHS } = require('../utils/config');
const { success, error, warn, info, header, formatTable, formatJson, printKeyValue } = require('../utils/output');
const { maskSecret } = require('../utils/security');
const { confirm } = require('../utils/prompts');

module.exports = function(program) {
    // env:show - Display current environment
    program
        .command('env:show')
        .description('Display current environment settings')
        .action(async function() {
            const config = getConfig();
            const envVars = readEnvFile();
            const isJson = program.opts().json;

            if (isJson) {
                console.log(formatJson({
                    APP_ENV: config.APP_ENV,
                    APP_DEBUG: config.APP_DEBUG,
                    PORT: config.PORT,
                    PAYMENT_AMOUNT: config.PAYMENT_AMOUNT,
                    PRO_PAYMENT_AMOUNT: config.PRO_PAYMENT_AMOUNT,
                    PAYMENT_CURRENCY: config.PAYMENT_CURRENCY,
                    STRIPE_CONFIGURED: !!config.STRIPE_SECRET_KEY,
                    JWT_CONFIGURED: !!config.JWT_SECRET
                }));
                return;
            }

            header('Environment Configuration');

            console.log('\n' + chalk.bold('Application Settings:'));
            printKeyValue('APP_ENV', config.APP_ENV === 'prod'
                ? chalk.green('prod (Production)')
                : chalk.yellow('dev (Development)'));
            printKeyValue('APP_DEBUG', config.APP_DEBUG
                ? chalk.yellow('ON')
                : chalk.green('OFF'));
            printKeyValue('PORT', config.PORT);

            console.log('\n' + chalk.bold('Payment Settings:'));
            printKeyValue('PAYMENT_AMOUNT', `${config.PAYMENT_AMOUNT} cents (${(config.PAYMENT_AMOUNT/100).toFixed(2)} ${config.PAYMENT_CURRENCY.toUpperCase()})`);
            printKeyValue('PRO_PAYMENT_AMOUNT', `${config.PRO_PAYMENT_AMOUNT} cents (${(config.PRO_PAYMENT_AMOUNT/100).toFixed(2)} ${config.PAYMENT_CURRENCY.toUpperCase()})`);
            printKeyValue('PAYMENT_CURRENCY', config.PAYMENT_CURRENCY.toUpperCase());

            console.log('\n' + chalk.bold('API Keys:'));
            printKeyValue('STRIPE_SECRET_KEY', maskSecret(config.STRIPE_SECRET_KEY));
            printKeyValue('STRIPE_PUBLISHABLE_KEY', maskSecret(config.STRIPE_PUBLISHABLE_KEY));
            printKeyValue('JWT_SECRET', maskSecret(config.JWT_SECRET));

            console.log('\n' + chalk.bold('Paths:'));
            printKeyValue('Project Root', PATHS.root);
            printKeyValue('Data Directory', PATHS.data);
            printKeyValue('Uploads', PATHS.uploads);
            printKeyValue('Outputs', PATHS.outputs);

            console.log('');
        });

    // env:mode - Switch between dev and prod mode
    program
        .command('env:mode <mode>')
        .description('Switch environment mode (dev or prod)')
        .action(async function(mode) {
            const validModes = ['dev', 'prod'];
            if (!validModes.includes(mode)) {
                error(`Invalid mode: ${mode}. Use 'dev' or 'prod'.`);
                process.exit(1);
            }

            const config = getConfig();
            if (config.APP_ENV === mode) {
                info(`Already in ${mode} mode.`);
                return;
            }

            // Confirmation for switching to production
            if (mode === 'prod' && !program.opts().force) {
                warn('Switching to production mode will disable debug logging.');
                const confirmed = await confirm('Continue?');
                if (!confirmed) {
                    info('Operation cancelled.');
                    return;
                }
            }

            updateEnvFile('APP_ENV', mode);
            success(`Environment mode changed to ${mode}`);
            info('Restart the server for changes to take effect.');
        });

    // env:debug - Toggle debug mode
    program
        .command('env:debug <state>')
        .description('Toggle debug mode (on or off)')
        .action(async function(state) {
            const validStates = ['on', 'off', '1', '0'];
            if (!validStates.includes(state.toLowerCase())) {
                error(`Invalid state: ${state}. Use 'on' or 'off'.`);
                process.exit(1);
            }

            const newValue = ['on', '1'].includes(state.toLowerCase()) ? '1' : '0';
            const config = getConfig();

            if ((config.APP_DEBUG && newValue === '1') || (!config.APP_DEBUG && newValue === '0')) {
                info(`Debug mode is already ${newValue === '1' ? 'ON' : 'OFF'}.`);
                return;
            }

            // Warning for enabling debug in production
            if (newValue === '1' && config.APP_ENV === 'prod' && !program.opts().force) {
                warn('Enabling debug mode in production is not recommended.');
                const confirmed = await confirm('Continue anyway?');
                if (!confirmed) {
                    info('Operation cancelled.');
                    return;
                }
            }

            updateEnvFile('APP_DEBUG', newValue);
            success(`Debug mode ${newValue === '1' ? 'enabled' : 'disabled'}`);
            info('Restart the server for changes to take effect.');
        });

    // env:set - Set any environment variable
    program
        .command('env:set <key> <value>')
        .description('Set an environment variable')
        .action(async function(key, value) {
            const sensitiveKeys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'JWT_SECRET', 'GOOGLE_CLIENT_SECRET'];

            if (sensitiveKeys.includes(key) && !program.opts().force) {
                warn(`You are about to change a sensitive configuration: ${key}`);
                const confirmed = await confirm('Are you sure?');
                if (!confirmed) {
                    info('Operation cancelled.');
                    return;
                }
            }

            updateEnvFile(key, value);
            success(`${key} updated`);
            info('Restart the server for changes to take effect.');
        });

    // env:validate - Validate environment configuration
    program
        .command('env:validate')
        .description('Validate environment configuration')
        .action(async function() {
            const config = getConfig();
            const isJson = program.opts().json;

            const issues = [];
            const warnings = [];

            // Required keys
            if (!config.STRIPE_SECRET_KEY) {
                issues.push('STRIPE_SECRET_KEY is not set');
            } else if (!config.STRIPE_SECRET_KEY.startsWith('sk_')) {
                issues.push('STRIPE_SECRET_KEY appears invalid (should start with sk_)');
            }

            if (!config.JWT_SECRET) {
                issues.push('JWT_SECRET is not set');
            } else if (config.JWT_SECRET.length < 32) {
                warnings.push('JWT_SECRET is shorter than 32 characters (recommended: 64+)');
            }

            if (!config.STRIPE_PUBLISHABLE_KEY) {
                warnings.push('STRIPE_PUBLISHABLE_KEY is not set');
            }

            // Production checks
            if (config.APP_ENV === 'prod') {
                if (config.APP_DEBUG) {
                    warnings.push('Debug mode is enabled in production');
                }
                if (config.STRIPE_SECRET_KEY && config.STRIPE_SECRET_KEY.includes('_test_')) {
                    warnings.push('Using Stripe test keys in production');
                }
            }

            if (isJson) {
                console.log(formatJson({ valid: issues.length === 0, issues, warnings }));
                return;
            }

            header('Environment Validation');

            if (issues.length === 0 && warnings.length === 0) {
                success('All configuration is valid!');
                return;
            }

            if (issues.length > 0) {
                console.log('\n' + chalk.red.bold('Errors:'));
                issues.forEach(issue => console.log(chalk.red('  ✗ ' + issue)));
            }

            if (warnings.length > 0) {
                console.log('\n' + chalk.yellow.bold('Warnings:'));
                warnings.forEach(warning => console.log(chalk.yellow('  ! ' + warning)));
            }

            console.log('');

            if (issues.length > 0) {
                process.exit(1);
            }
        });
};
