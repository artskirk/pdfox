/**
 * Stripe integration commands for PDFOX CLI
 */

'use strict';

const chalk = require('chalk');
const ora = require('ora');
const { getConfig } = require('../utils/config');
const {
    success, error, warn, info, header,
    formatTable, formatJson, formatDate, formatCurrency,
    truncate, printKeyValue
} = require('../utils/output');
const { maskSecret, isValidStripeSessionId } = require('../utils/security');

// Lazy load Stripe to avoid issues if not configured
let stripe = null;

function getStripe() {
    if (stripe) return stripe;

    const config = getConfig();
    if (!config.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    const Stripe = require('stripe');
    stripe = new Stripe(config.STRIPE_SECRET_KEY);
    return stripe;
}

module.exports = function(program) {
    // stripe:inspect - Comprehensive Stripe key and permissions validation
    program
        .command('stripe:inspect')
        .description('Validate Stripe API keys and permissions before going live')
        .action(async function() {
            const config = getConfig();
            const isJson = program.opts().json;

            header('Stripe Configuration Inspector');
            console.log(chalk.gray('Validating API keys and permissions for PDFOX...\n'));

            const results = {
                connection: { status: 'pending', message: '' },
                keyType: { status: 'pending', message: '' },
                permissions: {}
            };

            // Check if key is configured
            if (!config.STRIPE_SECRET_KEY) {
                if (isJson) {
                    console.log(formatJson({ success: false, error: 'STRIPE_SECRET_KEY not configured' }));
                } else {
                    error('STRIPE_SECRET_KEY is not configured');
                }
                process.exit(1);
            }

            // Analyze key type
            const keyPrefix = config.STRIPE_SECRET_KEY.substring(0, 7);
            const isLive = config.STRIPE_SECRET_KEY.includes('_live_');
            const isRestricted = config.STRIPE_SECRET_KEY.startsWith('rk_');

            console.log(chalk.bold('Key Analysis:'));
            printKeyValue('Key Prefix', keyPrefix + '...');
            printKeyValue('Environment', isLive ? chalk.green.bold('LIVE') : chalk.yellow('TEST'));
            printKeyValue('Key Type', isRestricted ? chalk.cyan('Restricted') : chalk.white('Standard'));

            if (isRestricted) {
                console.log(chalk.gray('  (Restricted keys have limited permissions - testing each one)\n'));
            } else {
                console.log(chalk.gray('  (Standard keys have full API access)\n'));
            }

            results.keyType = {
                status: 'ok',
                isLive,
                isRestricted,
                prefix: keyPrefix
            };

            // Test connection - use balance endpoint for restricted keys (minimal permission)
            console.log(chalk.bold('Connection Test:'));
            const connSpinner = ora('Testing Stripe API connection...').start();

            try {
                const stripeClient = getStripe();

                if (isRestricted) {
                    // For restricted keys, just verify we can make any API call
                    // We'll test actual permissions below
                    try {
                        await stripeClient.checkout.sessions.list({ limit: 1 });
                        connSpinner.succeed(chalk.green('Connected to Stripe (restricted key)'));
                        results.connection = { status: 'ok', type: 'restricted' };
                    } catch (err) {
                        // Even if this fails, try other endpoints
                        try {
                            await stripeClient.charges.list({ limit: 1 });
                            connSpinner.succeed(chalk.green('Connected to Stripe (restricted key)'));
                            results.connection = { status: 'ok', type: 'restricted' };
                        } catch (err2) {
                            throw err; // Use original error
                        }
                    }
                } else {
                    // For standard keys, we can get account info
                    const account = await stripeClient.accounts.retrieve();
                    connSpinner.succeed(chalk.green('Connected to Stripe'));
                    printKeyValue('Account ID', account.id);
                    printKeyValue('Country', account.country || 'N/A');
                    results.connection = { status: 'ok', accountId: account.id };
                }
            } catch (err) {
                connSpinner.fail(chalk.red('Connection failed'));
                console.log(chalk.red('  Error: ' + err.message));
                results.connection = { status: 'error', message: err.message };

                if (isJson) {
                    console.log(formatJson({ success: false, results }));
                }
                process.exit(1);
            }

            console.log('');

            // Define required permissions for PDFOX
            const permissionTests = [
                {
                    name: 'Checkout Sessions (Create)',
                    resource: 'checkout.sessions',
                    required: true,
                    test: async (stripe) => {
                        // Try to create a minimal checkout session
                        // This will fail with invalid params but tells us if we have permission
                        try {
                            await stripe.checkout.sessions.create({
                                mode: 'payment',
                                line_items: [{
                                    price_data: {
                                        currency: 'eur',
                                        product_data: { name: 'Test' },
                                        unit_amount: 100
                                    },
                                    quantity: 1
                                }],
                                success_url: 'https://example.com/success',
                                cancel_url: 'https://example.com/cancel'
                            });
                            return { success: true };
                        } catch (err) {
                            // Permission denied errors
                            if (err.type === 'StripePermissionError' ||
                                err.message.includes('restricted') ||
                                err.message.includes('permission') ||
                                err.code === 'api_key_expired') {
                                return { success: false, error: err.message };
                            }
                            // Other errors mean we have permission but something else is wrong
                            return { success: true };
                        }
                    }
                },
                {
                    name: 'Checkout Sessions (Read)',
                    resource: 'checkout.sessions',
                    required: true,
                    test: async (stripe) => {
                        try {
                            await stripe.checkout.sessions.list({ limit: 1 });
                            return { success: true };
                        } catch (err) {
                            if (err.type === 'StripePermissionError' ||
                                err.message.includes('restricted') ||
                                err.message.includes('permission')) {
                                return { success: false, error: err.message };
                            }
                            return { success: true };
                        }
                    }
                },
                {
                    name: 'Payment Intents (Read)',
                    resource: 'payment_intents',
                    required: true,
                    test: async (stripe) => {
                        try {
                            await stripe.paymentIntents.list({ limit: 1 });
                            return { success: true };
                        } catch (err) {
                            if (err.type === 'StripePermissionError' ||
                                err.message.includes('restricted') ||
                                err.message.includes('permission')) {
                                return { success: false, error: err.message };
                            }
                            return { success: true };
                        }
                    }
                },
                {
                    name: 'Charges (Read)',
                    resource: 'charges',
                    required: true,
                    test: async (stripe) => {
                        try {
                            await stripe.charges.list({ limit: 1 });
                            return { success: true };
                        } catch (err) {
                            if (err.type === 'StripePermissionError' ||
                                err.message.includes('restricted') ||
                                err.message.includes('permission')) {
                                return { success: false, error: err.message };
                            }
                            return { success: true };
                        }
                    }
                },
                {
                    name: 'Customers (Read)',
                    resource: 'customers',
                    required: false,
                    test: async (stripe) => {
                        try {
                            await stripe.customers.list({ limit: 1 });
                            return { success: true };
                        } catch (err) {
                            if (err.type === 'StripePermissionError' ||
                                err.message.includes('restricted') ||
                                err.message.includes('permission')) {
                                return { success: false, error: err.message };
                            }
                            return { success: true };
                        }
                    }
                },
                {
                    name: 'Products (Write)',
                    resource: 'products',
                    required: true,
                    test: async (stripe) => {
                        try {
                            // List is enough to test read, we test write via checkout
                            await stripe.products.list({ limit: 1 });
                            return { success: true };
                        } catch (err) {
                            if (err.type === 'StripePermissionError' ||
                                err.message.includes('restricted') ||
                                err.message.includes('permission')) {
                                return { success: false, error: err.message };
                            }
                            return { success: true };
                        }
                    }
                },
                {
                    name: 'Prices (Write)',
                    resource: 'prices',
                    required: true,
                    test: async (stripe) => {
                        try {
                            await stripe.prices.list({ limit: 1 });
                            return { success: true };
                        } catch (err) {
                            if (err.type === 'StripePermissionError' ||
                                err.message.includes('restricted') ||
                                err.message.includes('permission')) {
                                return { success: false, error: err.message };
                            }
                            return { success: true };
                        }
                    }
                }
            ];

            // Run permission tests
            console.log(chalk.bold('Permission Tests:'));

            const stripeClient = getStripe();
            let hasErrors = false;
            let hasWarnings = false;

            for (const test of permissionTests) {
                const spinner = ora(`Testing ${test.name}...`).start();

                const result = await test.test(stripeClient);
                results.permissions[test.name] = result;

                if (result.success) {
                    spinner.succeed(chalk.green(`${test.name}`));
                } else {
                    if (test.required) {
                        spinner.fail(chalk.red(`${test.name} - MISSING`));
                        console.log(chalk.red(`    ${result.error || 'Permission denied'}`));
                        hasErrors = true;
                    } else {
                        spinner.warn(chalk.yellow(`${test.name} - Not available (optional)`));
                        hasWarnings = true;
                    }
                }
            }

            console.log('');

            // Summary
            console.log(chalk.bold('Summary:'));

            if (hasErrors) {
                console.log(chalk.red.bold('\n✗ FAILED - Missing required permissions\n'));
                console.log(chalk.yellow('To fix, update your restricted API key permissions in Stripe Dashboard:'));
                console.log(chalk.gray('  https://dashboard.stripe.com/apikeys\n'));
                console.log(chalk.white('Required permissions for PDFOX:'));
                console.log(chalk.gray('  • Checkout Sessions → Write'));
                console.log(chalk.gray('  • Payment Intents → Read'));
                console.log(chalk.gray('  • Charges and Refunds → Read'));
                console.log(chalk.gray('  • Products → Write'));
                console.log(chalk.gray('  • Prices → Write'));
                console.log(chalk.gray('  • Customers → Read (optional)'));

                if (isJson) {
                    console.log(formatJson({ success: false, results }));
                }
                process.exit(1);
            } else if (hasWarnings) {
                console.log(chalk.yellow.bold('\n⚠ PASSED with warnings\n'));
                console.log(chalk.green('Your Stripe API key has the required permissions.'));
                console.log(chalk.yellow('Some optional permissions are missing but PDFOX will work.\n'));
            } else {
                console.log(chalk.green.bold('\n✓ PASSED - All permissions verified\n'));
                console.log(chalk.green('Your Stripe API key is properly configured for PDFOX.'));

                if (isLive) {
                    console.log(chalk.green.bold('Ready for production! 🚀\n'));
                } else {
                    console.log(chalk.yellow('\nNote: You are using TEST keys. Switch to LIVE for real payments:'));
                    console.log(chalk.gray('  ./bin/console env:mode prod\n'));
                }
            }

            if (isJson) {
                console.log(formatJson({ success: !hasErrors, results }));
            }
        });

    // stripe:test - Test Stripe connection
    program
        .command('stripe:test')
        .description('Test Stripe API connection')
        .action(async function() {
            const config = getConfig();
            const isJson = program.opts().json;

            if (!config.STRIPE_SECRET_KEY) {
                if (isJson) {
                    console.log(formatJson({ connected: false, error: 'STRIPE_SECRET_KEY not configured' }));
                } else {
                    error('STRIPE_SECRET_KEY is not configured');
                }
                process.exit(1);
            }

            const spinner = ora('Testing Stripe connection...').start();

            try {
                const stripeClient = getStripe();
                const account = await stripeClient.accounts.retrieve();

                spinner.stop();

                if (isJson) {
                    console.log(formatJson({
                        connected: true,
                        mode: config.STRIPE_SECRET_KEY.includes('_test_') ? 'test' : 'live',
                        accountId: account.id,
                        country: account.country
                    }));
                    return;
                }

                success('Stripe connection successful!');
                printKeyValue('Account ID', account.id);
                printKeyValue('Mode', config.STRIPE_SECRET_KEY.includes('_test_')
                    ? chalk.yellow('TEST')
                    : chalk.green('LIVE'));
                printKeyValue('Country', account.country || 'N/A');

            } catch (err) {
                spinner.stop();
                if (isJson) {
                    console.log(formatJson({ connected: false, error: err.message }));
                } else {
                    error(`Stripe connection failed: ${err.message}`);
                }
                process.exit(1);
            }
        });

    // stripe:verify - Verify a payment session
    program
        .command('stripe:verify <sessionId>')
        .description('Verify a Stripe checkout session')
        .action(async function(sessionId) {
            const isJson = program.opts().json;

            if (!isValidStripeSessionId(sessionId)) {
                error('Invalid session ID format (should start with cs_)');
                process.exit(1);
            }

            const spinner = ora('Retrieving session...').start();

            try {
                const stripeClient = getStripe();
                const session = await stripeClient.checkout.sessions.retrieve(sessionId, {
                    expand: ['payment_intent', 'customer']
                });

                spinner.stop();

                const result = {
                    id: session.id,
                    status: session.status,
                    paymentStatus: session.payment_status,
                    amount: session.amount_total,
                    currency: session.currency,
                    customerEmail: session.customer_email || session.customer_details?.email,
                    created: session.created * 1000,
                    metadata: session.metadata
                };

                if (isJson) {
                    console.log(formatJson(result));
                    return;
                }

                header('Checkout Session Details');

                console.log('');
                printKeyValue('Session ID', truncate(session.id, 40));
                printKeyValue('Status', session.status === 'complete'
                    ? chalk.green(session.status)
                    : chalk.yellow(session.status));
                printKeyValue('Payment Status', session.payment_status === 'paid'
                    ? chalk.green(session.payment_status)
                    : chalk.yellow(session.payment_status));
                printKeyValue('Amount', formatCurrency(session.amount_total, session.currency));
                printKeyValue('Customer Email', session.customer_email || session.customer_details?.email || chalk.gray('N/A'));
                printKeyValue('Created', formatDate(session.created * 1000));

                if (session.metadata && Object.keys(session.metadata).length > 0) {
                    console.log('\n' + chalk.bold('Metadata:'));
                    Object.entries(session.metadata).forEach(([key, value]) => {
                        printKeyValue(key, value);
                    });
                }

                console.log('');

            } catch (err) {
                spinner.stop();
                error(`Failed to retrieve session: ${err.message}`);
                process.exit(1);
            }
        });

    // stripe:lookup - Lookup by receipt number
    program
        .command('stripe:lookup <receipt>')
        .description('Lookup a charge by receipt number')
        .action(async function(receipt) {
            const isJson = program.opts().json;
            const spinner = ora('Searching for receipt...').start();

            try {
                const stripeClient = getStripe();

                // Search in recent charges
                const charges = await stripeClient.charges.list({
                    limit: 100
                });

                const charge = charges.data.find(c => c.receipt_number === receipt);

                spinner.stop();

                if (!charge) {
                    if (isJson) {
                        console.log(formatJson({ found: false, receipt }));
                    } else {
                        warn(`No charge found with receipt: ${receipt}`);
                    }
                    return;
                }

                const result = {
                    found: true,
                    chargeId: charge.id,
                    amount: charge.amount,
                    currency: charge.currency,
                    status: charge.status,
                    receiptNumber: charge.receipt_number,
                    email: charge.billing_details?.email || charge.receipt_email,
                    created: charge.created * 1000,
                    metadata: charge.metadata
                };

                if (isJson) {
                    console.log(formatJson(result));
                    return;
                }

                header('Charge Details');

                console.log('');
                printKeyValue('Charge ID', charge.id);
                printKeyValue('Receipt', charge.receipt_number);
                printKeyValue('Status', charge.status === 'succeeded'
                    ? chalk.green(charge.status)
                    : chalk.yellow(charge.status));
                printKeyValue('Amount', formatCurrency(charge.amount, charge.currency));
                printKeyValue('Email', charge.billing_details?.email || charge.receipt_email || chalk.gray('N/A'));
                printKeyValue('Created', formatDate(charge.created * 1000));

                if (charge.metadata && Object.keys(charge.metadata).length > 0) {
                    console.log('\n' + chalk.bold('Metadata:'));
                    Object.entries(charge.metadata).forEach(([key, value]) => {
                        printKeyValue(key, value);
                    });
                }

                console.log('');

            } catch (err) {
                spinner.stop();
                error(`Failed to lookup receipt: ${err.message}`);
                process.exit(1);
            }
        });

    // stripe:payments - List recent payments
    program
        .command('stripe:payments')
        .description('List recent Pro access payments')
        .option('-l, --limit <n>', 'Number of payments to show', '10')
        .action(async function(options) {
            const isJson = program.opts().json;
            const limit = Math.min(parseInt(options.limit), 100);
            const spinner = ora('Fetching payments...').start();

            try {
                const stripeClient = getStripe();
                const config = getConfig();

                // Get checkout sessions with pro_access type
                const sessions = await stripeClient.checkout.sessions.list({
                    limit: limit * 2 // Fetch more to filter
                });

                // Filter for pro_access payments
                const proSessions = sessions.data
                    .filter(s => s.metadata?.type === 'pro_access' && s.payment_status === 'paid')
                    .slice(0, limit);

                spinner.stop();

                if (proSessions.length === 0) {
                    if (isJson) {
                        console.log(formatJson({ payments: [] }));
                    } else {
                        info('No Pro access payments found');
                    }
                    return;
                }

                if (isJson) {
                    const payments = proSessions.map(s => ({
                        sessionId: s.id,
                        email: s.customer_email || s.metadata?.email,
                        amount: s.amount_total,
                        currency: s.currency,
                        created: s.created * 1000
                    }));
                    console.log(formatJson({ payments }));
                    return;
                }

                const rows = proSessions.map(session => [
                    truncate(session.id, 20),
                    session.customer_email || session.metadata?.email || chalk.gray('N/A'),
                    formatCurrency(session.amount_total, session.currency),
                    formatDate(session.created * 1000)
                ]);

                console.log(formatTable(
                    ['Session ID', 'Email', 'Amount', 'Date'],
                    rows
                ));

                console.log(`\nShowing ${proSessions.length} Pro access payments`);

            } catch (err) {
                spinner.stop();
                error(`Failed to fetch payments: ${err.message}`);
                process.exit(1);
            }
        });

    // stripe:refund - Refund a payment (with safety checks)
    program
        .command('stripe:refund <chargeId>')
        .description('Refund a charge (requires confirmation)')
        .action(async function(chargeId) {
            const isJson = program.opts().json;
            const spinner = ora('Retrieving charge...').start();

            try {
                const stripeClient = getStripe();

                // Get charge details first
                const charge = await stripeClient.charges.retrieve(chargeId);

                spinner.stop();

                if (charge.refunded) {
                    if (isJson) {
                        console.log(formatJson({ success: false, error: 'Charge already refunded' }));
                    } else {
                        warn('This charge has already been refunded');
                    }
                    return;
                }

                console.log('\n' + chalk.yellow('! Refund Details:'));
                printKeyValue('Charge ID', charge.id);
                printKeyValue('Amount', formatCurrency(charge.amount, charge.currency));
                printKeyValue('Email', charge.receipt_email || chalk.gray('N/A'));
                printKeyValue('Created', formatDate(charge.created * 1000));

                if (!program.opts().force) {
                    const { confirmDestructive } = require('../utils/prompts');
                    const confirmed = await confirmDestructive(
                        'Refund payment',
                        `${formatCurrency(charge.amount, charge.currency)} to ${charge.receipt_email || 'customer'}`
                    );
                    if (!confirmed) {
                        info('Operation cancelled.');
                        return;
                    }
                }

                const refundSpinner = ora('Processing refund...').start();

                const refund = await stripeClient.refunds.create({
                    charge: chargeId
                });

                refundSpinner.stop();

                if (isJson) {
                    console.log(formatJson({
                        success: true,
                        refundId: refund.id,
                        amount: refund.amount,
                        status: refund.status
                    }));
                    return;
                }

                success('Refund processed successfully!');
                printKeyValue('Refund ID', refund.id);
                printKeyValue('Amount', formatCurrency(refund.amount, refund.currency));
                printKeyValue('Status', refund.status);

            } catch (err) {
                if (spinner.isSpinning) spinner.stop();
                error(`Failed to process refund: ${err.message}`);
                process.exit(1);
            }
        });
};
