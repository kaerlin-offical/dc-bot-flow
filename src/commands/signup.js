import { SlashCommandBuilder } from 'discord.js';
import { hashPassword, isValidUsername, isValidPassword, isValidLicenseKeyFormat, sanitizeInput } from '../utils/security.js';
import { getLicenseByKey, redeemLicense, createUser, getUserByDiscordId, getUserByUsername } from '../database/queries.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('signup')
    .setDescription('Create a new account with a license key')
    .addStringOption(option =>
        option.setName('username')
            .setDescription('Your desired username (3-20 characters, alphanumeric and underscores)')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('password')
            .setDescription('Your password (min 8 chars, must include uppercase, lowercase, and number)')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('license_key')
            .setDescription('Your license key (format: XXXX-XXXX-XXXX-XXXX)')
            .setRequired(true));

export async function execute(interaction, userDb, adminDb) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const discordId = interaction.user.id;
        const db = userDb; // Use userDb for backward compatibility
        const username = sanitizeInput(interaction.options.getString('username'));
        const password = interaction.options.getString('password');
        const licenseKey = sanitizeInput(interaction.options.getString('license_key')).toUpperCase();

        // Validate username format
        if (!isValidUsername(username)) {
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Invalid Username',
                    'Username must be 3-20 characters long and contain only letters, numbers, and underscores.'
                )]
            });
        }

        // Validate password strength
        if (!isValidPassword(password)) {
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Weak Password',
                    'Password must be at least 8 characters long and include:\n• At least one uppercase letter\n• At least one lowercase letter\n• At least one number'
                )]
            });
        }

        // Validate license key format
        if (!isValidLicenseKeyFormat(licenseKey)) {
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Invalid License Key Format',
                    'License key must be in format: XXXX-XXXX-XXXX-XXXX'
                )]
            });
        }

        // Check if user already exists
        const existingUser = getUserByDiscordId(db, discordId);
        if (existingUser) {
            logger.command(discordId, interaction.user.username, 'signup', false, 'User already registered');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Already Registered',
                    'You already have an account. Use `/get_download` to access your software.'
                )]
            });
        }

        // Check if username is taken
        const usernameTaken = getUserByUsername(db, username);
        if (usernameTaken) {
            logger.command(discordId, interaction.user.username, 'signup', false, 'Username taken');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Username Taken',
                    'This username is already in use. Please choose a different one.'
                )]
            });
        }

        // Validate license key
        const license = getLicenseByKey(db, licenseKey);

        if (!license) {
            logger.command(discordId, interaction.user.username, 'signup', false, 'Invalid license key');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Invalid License Key',
                    'The provided license key does not exist. Please check your key and try again.'
                )]
            });
        }

        if (license.status === 'redeemed') {
            logger.command(discordId, interaction.user.username, 'signup', false, 'License already redeemed');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'License Already Redeemed',
                    'This license key has already been used. Each key can only be redeemed once.'
                )]
            });
        }

        if (license.status === 'revoked') {
            logger.command(discordId, interaction.user.username, 'signup', false, 'License revoked');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'License Revoked',
                    `This license key has been revoked.\n${license.revoke_reason ? `**Reason:** ${license.revoke_reason}` : ''}`
                )]
            });
        }

        // Check if license is expired
        if (license.expiry_date && license.expiry_date < Date.now()) {
            logger.command(discordId, interaction.user.username, 'signup', false, 'License expired');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'License Expired',
                    'This license key has expired and can no longer be used.'
                )]
            });
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Create user and redeem license (sql.js auto-saves)
        try {
            createUser(db, discordId, username, passwordHash, licenseKey);
            redeemLicense(db, licenseKey, discordId);

            logger.userRegistered(discordId, username);
            logger.licenseRedeemed(licenseKey, discordId);
            logger.command(discordId, interaction.user.username, 'signup', true);

            await interaction.editReply({
                embeds: [successEmbed(
                    'Account Created Successfully!',
                    `Welcome, **${username}**! Your account has been created and your license has been activated.`,
                    [
                        { name: '👤 Username', value: username, inline: true },
                        { name: '🔑 License Key', value: licenseKey, inline: true },
                        { name: '📥 Next Steps', value: 'Use `/get_download` to access your software!', inline: false }
                    ]
                )]
            });

        } catch (error) {
            logger.error('Failed to create user', { error: error.message, discordId, username });
            throw error;
        }

    } catch (error) {
        logger.error('Signup command error', { error: error.message, userId: interaction.user.id });
        await interaction.editReply({
            embeds: [errorEmbed(
                'Registration Failed',
                'An unexpected error occurred during registration. Please try again later or contact an administrator.'
            )]
        });
    }
}
