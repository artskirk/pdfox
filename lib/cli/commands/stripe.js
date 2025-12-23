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
