import { SlashCommandBuilder } from 'discord.js';
import { getUserByDiscordId, getLicenseByKey, updateUserLastDownload, logDownload } from '../database/queries.js';
import { successEmbed, errorEmbed, formatDate } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

const COOLDOWN_MINUTES = parseInt(process.env.DOWNLOAD_COOLDOWN_MINUTES) || 60;
const DOWNLOAD_URL = process.env.DOWNLOAD_URL || 'https://example.com/download';

export const data = new SlashCommandBuilder()
    .setName('get_download')
    .setDescription('Get the download link for the software')
    .addStringOption(option =>
        option.setName('license_key')
            .setDescription('Your license key to verify access')
            .setRequired(true));

export async function execute(interaction, userDb, adminDb) {
    const db = userDb;
    const providedKey = interaction.options.getString('license_key').toUpperCase();
    await interaction.deferReply({ ephemeral: true });

    try {
        const discordId = interaction.user.id;

        // Check if user is registered and matches license key
        const user = getUserByDiscordId(db, discordId);

        if (!user) {
            logger.command(discordId, interaction.user.username, 'get_download', false, 'User not registered');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Not Registered',
                    'You need to create an account first.\n\nUse `/signup` with your username, password, and license key to get started!'
                )]
            });
        }

        // Verify key provided matches the user's key
        if (user.license_key !== providedKey) {
            logger.command(discordId, interaction.user.username, 'get_download', false, 'License key mismatch');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Invalid Key Verification',
                    'The license key you entered does not match the one bound to your account.\n\nPlease enter the license key you used to register.'
                )]
            });
        }

        // Check if user has a valid license
        const license = getLicenseByKey(db, user.license_key);

        if (!license) {
            logger.command(discordId, interaction.user.username, 'get_download', false, 'No license found');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'No Valid License',
                    'Your account does not have a valid license associated with it. Please contact an administrator.'
                )]
            });
        }

        if (license.status === 'revoked') {
            logger.command(discordId, interaction.user.username, 'get_download', false, 'License revoked');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'License Revoked',
                    `Your license has been revoked and you can no longer access downloads.\n${license.revoke_reason ? `\n**Reason:** ${license.revoke_reason}` : ''}\n\nPlease contact an administrator for more information.`
                )]
            });
        }

        if (license.status !== 'redeemed') {
            logger.command(discordId, interaction.user.username, 'get_download', false, 'License not redeemed');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'License Not Active',
                    'Your license is not active. Please use `/redeem` to activate your license key first.'
                )]
            });
        }

        // Check if license is expired
        if (license.expiry_date && license.expiry_date < Date.now()) {
            logger.command(discordId, interaction.user.username, 'get_download', false, 'License expired');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'License Expired',
                    `Your license expired on ${formatDate(license.expiry_date)}.\n\nPlease contact an administrator to renew your license.`
                )]
            });
        }

        // Check download cooldown
        const now = Date.now();
        const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;
        const timeSinceLastDownload = now - user.last_download;

        if (user.last_download > 0 && timeSinceLastDownload < cooldownMs) {
            const remainingMs = cooldownMs - timeSinceLastDownload;
            const remainingMinutes = Math.ceil(remainingMs / 60000);

            logger.command(discordId, interaction.user.username, 'get_download', false, 'Cooldown active');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Download Cooldown Active',
                    `Please wait **${remainingMinutes} minute(s)** before requesting another download.\n\n**Last download:** ${formatDate(user.last_download)}`
                )]
            });
        }

        // Update last download timestamp and log
        try {
            updateUserLastDownload(db, discordId, now);
            logDownload(db, discordId, user.username);

            logger.download(discordId, user.username);
            logger.command(discordId, interaction.user.username, 'get_download', true);

            await interaction.editReply({
                embeds: [successEmbed(
                    'Download Ready!',
                    `Here's your download link, **${user.username}**!`,
                    [
                        { name: '📥 Download Link', value: `[Click here to download](${DOWNLOAD_URL})`, inline: false },
                        { name: '⏰ Cooldown', value: `${COOLDOWN_MINUTES} minutes`, inline: true },
                        { name: '📅 License Expiry', value: license.expiry_date ? formatDate(license.expiry_date) : 'Never', inline: true },
                        { name: '⚠️ Important', value: 'Keep your download link private. Do not share it with others.', inline: false }
                    ]
                )]
            });

        } catch (error) {
            logger.error('Failed to update download timestamp', { error: error.message, discordId });
            throw error;
        }

    } catch (error) {
        logger.error('Get download command error', { error: error.message, userId: interaction.user.id });
        await interaction.editReply({
            embeds: [errorEmbed(
                'Download Failed',
                'An unexpected error occurred while processing your download request. Please try again later or contact an administrator.'
            )]
        });
    }
}
