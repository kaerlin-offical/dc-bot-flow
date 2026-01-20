import { SlashCommandBuilder } from 'discord.js';
import { isValidLicenseKeyFormat, sanitizeInput } from '../utils/security.js';
import { getLicenseByKey, redeemLicense, getUserByDiscordId, getLicensesByDiscordId } from '../database/queries.js';
import { successEmbed, errorEmbed, formatDate } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Redeem a license key to your Discord account')
    .addStringOption(option =>
        option.setName('license_key')
            .setDescription('The license key to redeem (format: XXXX-XXXX-XXXX-XXXX)')
            .setRequired(true));

export async function execute(interaction, userDb, adminDb) {
    const db = userDb;
    await interaction.deferReply({ ephemeral: true });

    try {
        const discordId = interaction.user.id;
        const licenseKey = sanitizeInput(interaction.options.getString('license_key')).toUpperCase();

        // Validate license key format
        if (!isValidLicenseKeyFormat(licenseKey)) {
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Invalid License Key Format',
                    'License key must be in format: XXXX-XXXX-XXXX-XXXX'
                )]
            });
        }

        // Check if license exists
        const license = getLicenseByKey(db, licenseKey);

        if (!license) {
            logger.command(discordId, interaction.user.username, 'redeem', false, 'Invalid license key');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Invalid License Key',
                    'The provided license key does not exist. Please check your key and try again.'
                )]
            });
        }

        // Check license status
        if (license.status === 'redeemed') {
            const redeemer = license.discord_id === discordId ? 'you' : 'another user';
            logger.command(discordId, interaction.user.username, 'redeem', false, 'License already redeemed');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'License Already Redeemed',
                    `This license key has already been redeemed by ${redeemer}.\n\n**Redeemed on:** ${formatDate(license.redemption_date)}`
                )]
            });
        }

        if (license.status === 'revoked') {
            logger.command(discordId, interaction.user.username, 'redeem', false, 'License revoked');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'License Revoked',
                    `This license key has been revoked and cannot be used.\n${license.revoke_reason ? `\n**Reason:** ${license.revoke_reason}` : ''}`
                )]
            });
        }

        // Check if license is expired
        if (license.expiry_date && license.expiry_date < Date.now()) {
            logger.command(discordId, interaction.user.username, 'redeem', false, 'License expired');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'License Expired',
                    `This license key expired on ${formatDate(license.expiry_date)} and can no longer be redeemed.`
                )]
            });
        }

        // Redeem the license
        try {
            const result = redeemLicense(db, licenseKey, discordId);

            if (result.changes === 0) {
                throw new Error('Failed to redeem license');
            }

            logger.licenseRedeemed(licenseKey, discordId);
            logger.command(discordId, interaction.user.username, 'redeem', true);

            // Get user's total licenses
            const userLicenses = getLicensesByDiscordId(db, discordId);
            const totalLicenses = userLicenses.length;

            await interaction.editReply({
                embeds: [successEmbed(
                    'License Redeemed Successfully!',
                    `Your license key has been activated and bound to your Discord account.`,
                    [
                        { name: '🔑 License Key', value: licenseKey, inline: true },
                        { name: '📅 Redeemed On', value: formatDate(Date.now()), inline: true },
                        { name: '📊 Total Licenses', value: totalLicenses.toString(), inline: true },
                        {
                            name: '⏰ Expiry',
                            value: license.expiry_date ? formatDate(license.expiry_date) : 'Never',
                            inline: true
                        },
                        {
                            name: '📥 Next Steps',
                            value: 'If you haven\'t signed up yet, use `/signup` to create your account!',
                            inline: false
                        }
                    ]
                )]
            });

        } catch (error) {
            logger.error('Failed to redeem license', { error: error.message, discordId, licenseKey });
            throw error;
        }

    } catch (error) {
        logger.error('Redeem command error', { error: error.message, userId: interaction.user.id });
        await interaction.editReply({
            embeds: [errorEmbed(
                'Redemption Failed',
                'An unexpected error occurred while redeeming your license. Please try again later or contact an administrator.'
            )]
        });
    }
}
