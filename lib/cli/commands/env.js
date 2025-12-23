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

            // Determine Stripe key type
            const stripeKeyType = config.STRIPE_SECRET_KEY
                ? (config.STRIPE_SECRET_KEY.includes('_live_') ? 'LIVE' : 'TEST')
                : 'NOT SET';

            if (isJson) {
                console.log(formatJson({
                    APP_ENV: config.APP_ENV,
                    APP_DEBUG: config.APP_DEBUG,
                    IS_PRODUCTION: config.IS_PRODUCTION,
                    PORT: config.PORT,
                    PAYMENT_AMOUNT: config.PAYMENT_AMOUNT,
                    PRO_PAYMENT_AMOUNT: config.PRO_PAYMENT_AMOUNT,
                    PAYMENT_CURRENCY: config.PAYMENT_CURRENCY,
                    STRIPE_CONFIGURED: !!config.STRIPE_SECRET_KEY,
                    STRIPE_MODE: stripeKeyType,
                    JWT_CONFIGURED: !!config.JWT_SECRET
                }));
                return;
            }

            header('Environment Configuration');

            console.log('\n' + chalk.bold('Application Settings:'));
            printKeyValue('APP_ENV', config.APP_ENV === 'prod'
                ? chalk.green.bold('prod (Production)')
                : chalk.yellow('dev (Development)'));
            printKeyValue('APP_DEBUG', config.APP_DEBUG
                ? chalk.yellow('ON')
                : chalk.green('OFF'));
            printKeyValue('PORT', config.PORT);

            console.log('\n' + chalk.bold('Stripe Configuration:'));
            const stripeStatus = stripeKeyType === 'LIVE'
                ? chalk.green.bold('LIVE')
                : stripeKeyType === 'TEST'
                    ? chalk.yellow('TEST')
                    : chalk.red('NOT SET');
            printKeyValue('Stripe Mode', stripeStatus);
            printKeyValue('Secret Key', maskSecret(config.STRIPE_SECRET_KEY));
            printKeyValue('Publishable Key', maskSecret(config.STRIPE_PUBLISHABLE_KEY));

            // Show warnings for mismatched configuration
            if (config.IS_PRODUCTION && stripeKeyType === 'TEST') {
                console.log(chalk.red.bold('\n  ⚠ WARNING: Production mode using TEST Stripe keys!'));
            }
            if (!config.IS_PRODUCTION && stripeKeyType === 'LIVE') {
                console.log(chalk.yellow.bold('\n  ⚠ WARNING: Development mode using LIVE Stripe keys!'));
            }

            console.log('\n' + chalk.bold('Payment Settings:'));
            printKeyValue('PAYMENT_AMOUNT', `${config.PAYMENT_AMOUNT} cents (${(config.PAYMENT_AMOUNT/100).toFixed(2)} ${config.PAYMENT_CURRENCY.toUpperCase()})`);
            printKeyValue('PRO_PAYMENT_AMOUNT', `${config.PRO_PAYMENT_AMOUNT} cents (${(config.PRO_PAYMENT_AMOUNT/100).toFixed(2)} ${config.PAYMENT_CURRENCY.toUpperCase()})`);
            printKeyValue('PAYMENT_CURRENCY', config.PAYMENT_CURRENCY.toUpperCase());

            console.log('\n' + chalk.bold('Security:'));
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

            const envVars = readEnvFile();
            const config = getConfig();

            if (config.APP_ENV === mode) {
                info(`Already in ${mode} mode.`);
                return;
            }

            // Check Stripe key availability for the target mode
            if (mode === 'prod') {
                const hasLiveSecretKey = envVars.STRIPE_SECRET_KEY_LIVE ||
                    (envVars.STRIPE_SECRET_KEY && envVars.STRIPE_SECRET_KEY.includes('_live_'));
                const hasLivePublishableKey = envVars.STRIPE_PUBLISHABLE_KEY_LIVE ||
                    (envVars.STRIPE_PUBLISHABLE_KEY && envVars.STRIPE_PUBLISHABLE_KEY.includes('_live_'));

                if (!hasLiveSecretKey || !hasLivePublishableKey) {
                    error('Cannot switch to production: Live Stripe keys not configured.');
                    console.log(chalk.gray('\nRequired environment variables:'));
                    console.log(chalk.gray('  STRIPE_SECRET_KEY_LIVE=rk_live_... or sk_live_...'));
                    console.log(chalk.gray('  STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_...'));
                    process.exit(1);
                }

                if (!program.opts().force) {
                    warn('Switching to PRODUCTION mode:');
                    console.log(chalk.yellow('  • Live Stripe keys will be used (real payments)'));
                    console.log(chalk.yellow('  • Debug logging will be disabled'));
                    console.log('');
                    const confirmed = await confirm('Continue?');
                    if (!confirmed) {
                        info('Operation cancelled.');
                        return;
                    }
                }
            }

            if (mode === 'dev') {
                const hasTestSecretKey = envVars.STRIPE_SECRET_KEY_TEST ||
                    (envVars.STRIPE_SECRET_KEY && envVars.STRIPE_SECRET_KEY.includes('_test_'));

                if (!hasTestSecretKey) {
                    warn('Test Stripe keys not configured. Payments may not work in dev mode.');
                }

                if (!program.opts().force) {
                    info('Switching to development mode (test Stripe keys).');
                    const confirmed = await confirm('Continue?');
                    if (!confirmed) {
                        info('Operation cancelled.');
                        return;
                    }
                }
            }

            updateEnvFile('APP_ENV', mode);

            if (mode === 'prod') {
                success('Environment mode changed to PRODUCTION');
                console.log(chalk.green('  ✓ Live Stripe keys active'));
                console.log(chalk.green('  ✓ Debug logging disabled'));
            } else {
                success('Environment mode changed to DEVELOPMENT');
                console.log(chalk.yellow('  ✓ Test Stripe keys active'));
            }

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
            const envVars = readEnvFile();
            const isJson = program.opts().json;

            const issues = [];
            const warnings = [];

            // Validate Stripe secret key (accepts sk_ or rk_ for restricted keys)
            if (!config.STRIPE_SECRET_KEY) {
                issues.push('STRIPE_SECRET_KEY is not set for current environment');
            } else if (!config.STRIPE_SECRET_KEY.startsWith('sk_') && !config.STRIPE_SECRET_KEY.startsWith('rk_')) {
                issues.push('STRIPE_SECRET_KEY appears invalid (should start with sk_ or rk_)');
            }

            // Validate Stripe publishable key
            if (!config.STRIPE_PUBLISHABLE_KEY) {
                issues.push('STRIPE_PUBLISHABLE_KEY is not set for current environment');
            } else if (!config.STRIPE_PUBLISHABLE_KEY.startsWith('pk_')) {
                issues.push('STRIPE_PUBLISHABLE_KEY appears invalid (should start with pk_)');
            }

            // Validate JWT secret
            if (!config.JWT_SECRET) {
                issues.push('JWT_SECRET is not set');
            } else if (config.JWT_SECRET.length < 32) {
                warnings.push('JWT_SECRET is shorter than 32 characters (recommended: 64+)');
            }

            // Check environment-specific keys availability
            if (config.IS_PRODUCTION) {
                if (!envVars.STRIPE_SECRET_KEY_LIVE && !envVars.STRIPE_SECRET_KEY?.includes('_live_')) {
                    issues.push('Production mode but STRIPE_SECRET_KEY_LIVE not set');
                }
                if (!envVars.STRIPE_PUBLISHABLE_KEY_LIVE && !envVars.STRIPE_PUBLISHABLE_KEY?.includes('_live_')) {
                    issues.push('Production mode but STRIPE_PUBLISHABLE_KEY_LIVE not set');
                }
            } else {
                if (!envVars.STRIPE_SECRET_KEY_TEST && !envVars.STRIPE_SECRET_KEY?.includes('_test_')) {
                    warnings.push('Development mode but STRIPE_SECRET_KEY_TEST not set');
                }
            }

            // Production checks
            if (config.IS_PRODUCTION) {
                if (config.APP_DEBUG) {
                    warnings.push('Debug mode is enabled in production');
                }
                if (config.STRIPE_SECRET_KEY && config.STRIPE_SECRET_KEY.includes('_test_')) {
                    issues.push('CRITICAL: Production mode using TEST Stripe keys!');
                }
            }

            // Development checks
            if (!config.IS_PRODUCTION) {
                if (config.STRIPE_SECRET_KEY && config.STRIPE_SECRET_KEY.includes('_live_')) {
                    warnings.push('Development mode using LIVE Stripe keys (real charges possible)');
                }
            }

            // Determine overall Stripe mode
            const stripeMode = config.STRIPE_SECRET_KEY
                ? (config.STRIPE_SECRET_KEY.includes('_live_') ? 'LIVE' : 'TEST')
                : 'NOT SET';

            if (isJson) {
                console.log(formatJson({
                    valid: issues.length === 0,
                    issues,
                    warnings,
                    environment: config.APP_ENV,
                    stripeMode
                }));
                return;
            }

            header('Environment Validation');

            // Show current mode
            console.log('\n' + chalk.bold('Current Configuration:'));
            printKeyValue('Environment', config.IS_PRODUCTION
                ? chalk.green.bold('PRODUCTION')
                : chalk.yellow('Development'));
            printKeyValue('Stripe Mode', stripeMode === 'LIVE'
                ? chalk.green.bold('LIVE')
                : stripeMode === 'TEST'
                    ? chalk.yellow('TEST')
                    : chalk.red('NOT SET'));

            if (issues.length === 0 && warnings.length === 0) {
                console.log('');
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
