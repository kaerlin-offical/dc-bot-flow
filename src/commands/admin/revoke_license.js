import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isAdmin, isValidLicenseKeyFormat, sanitizeInput } from '../../utils/security.js';
import { getLicenseByKey, revokeLicense } from '../../database/queries.js';
import { adminEmbed, errorEmbed, formatDate, formatLicenseStatus } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('revoke_license')
    .setDescription('[ADMIN] Revoke a license key')
    .addStringOption(option =>
        option.setName('license_key')
            .setDescription('The license key to revoke')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('reason')
            .setDescription('Reason for revocation (optional)')
            .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction, userDb, adminDb) {
    const db = userDb;
    await interaction.deferReply({ ephemeral: true });

    try {
        const discordId = interaction.user.id;

        // Check if user is admin
        if (!isAdmin(discordId)) {
            logger.command(discordId, interaction.user.username, 'revoke_license', false, 'Not authorized');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Access Denied',
                    'You do not have permission to use this command. This command is restricted to administrators only.'
                )]
            });
        }

        const licenseKey = sanitizeInput(interaction.options.getString('license_key')).toUpperCase();
        const reason = sanitizeInput(interaction.options.getString('reason')) || 'No reason provided';

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
            logger.command(discordId, interaction.user.username, 'revoke_license', false, 'License not found');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'License Not Found',
                    'The specified license key does not exist in the database.'
                )]
            });
        }

        // Check if already revoked
        if (license.status === 'revoked') {
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Already Revoked',
                    `This license was already revoked on ${formatDate(license.redemption_date)}.\n\n**Revoked by:** ${license.revoked_by || 'Unknown'}\n**Reason:** ${license.revoke_reason || 'No reason provided'}`
                )]
            });
        }

        // Revoke the license
        try {
            const revokedBy = `${interaction.user.username} (${discordId})`;
            const result = revokeLicense(db, licenseKey, revokedBy, reason);

            if (result.changes === 0) {
                throw new Error('Failed to revoke license');
            }

            logger.info('License revoked', { licenseKey, revokedBy, reason });
            logger.command(discordId, interaction.user.username, 'revoke_license', true);

            await interaction.editReply({
                embeds: [adminEmbed(
                    'License Revoked Successfully',
                    `The license key has been revoked and can no longer be used.`,
                    [
                        { name: '🔑 License Key', value: licenseKey, inline: true },
                        { name: '📊 Previous Status', value: formatLicenseStatus(license.status), inline: true },
                        { name: '👤 Bound To', value: license.discord_id ? `<@${license.discord_id}>` : 'None', inline: true },
                        { name: '🚫 Revoked By', value: interaction.user.username, inline: true },
                        { name: '📅 Revoked On', value: formatDate(Date.now()), inline: true },
                        { name: '📝 Reason', value: reason, inline: false }
                    ]
                )]
            });

        } catch (error) {
            logger.error('Failed to revoke license', { error: error.message, licenseKey });
            throw error;
        }

    } catch (error) {
        logger.error('Revoke license command error', { error: error.message, userId: interaction.user.id });
        await interaction.editReply({
            embeds: [errorEmbed(
                'Revocation Failed',
                'An unexpected error occurred while revoking the license. Please try again later.'
            )]
        });
    }
}
