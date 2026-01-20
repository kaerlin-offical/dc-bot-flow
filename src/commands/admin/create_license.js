import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { generateLicenseKey, isAdmin } from '../../utils/security.js';
import { createLicense } from '../../database/queries.js';
import { adminEmbed, errorEmbed, formatDate } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('create_license')
    .setDescription('[ADMIN] Generate new license keys')
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Number of licenses to generate (1-50)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(50))
    .addIntegerOption(option =>
        option.setName('expiry_days')
            .setDescription('Days until expiry (optional, leave empty for lifetime)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(3650))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction, db) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const discordId = interaction.user.id;

        // Check if user is admin
        if (!isAdmin(discordId)) {
            logger.command(discordId, interaction.user.username, 'create_license', false, 'Not authorized');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Access Denied',
                    'You do not have permission to use this command. This command is restricted to administrators only.'
                )]
            });
        }

        const amount = interaction.options.getInteger('amount');
        const expiryDays = interaction.options.getInteger('expiry_days');

        // Calculate expiry date if specified
        let expiryDate = null;
        if (expiryDays) {
            expiryDate = Date.now() + (expiryDays * 24 * 60 * 60 * 1000);
        }

        // Generate licenses
        const generatedKeys = [];
        const createdBy = `${interaction.user.username} (${discordId})`;

        try {
            for (let i = 0; i < amount; i++) {
                const key = generateLicenseKey();
                createLicense(db, key, createdBy, expiryDate);
                generatedKeys.push(key);
                logger.licenseCreated(key, createdBy);
            }

            logger.command(discordId, interaction.user.username, 'create_license', true);

            // Format keys for display (max 10 per field due to Discord limits)
            const fields = [];
            const keysPerField = 10;

            for (let i = 0; i < generatedKeys.length; i += keysPerField) {
                const chunk = generatedKeys.slice(i, i + keysPerField);
                fields.push({
                    name: `Keys ${i + 1}-${Math.min(i + keysPerField, generatedKeys.length)}`,
                    value: '```\n' + chunk.join('\n') + '\n```',
                    inline: false
                });
            }

            // Add summary field
            fields.push({
                name: '📊 Summary',
                value: `**Total Generated:** ${amount}\n**Expiry:** ${expiryDays ? `${expiryDays} days (${formatDate(expiryDate)})` : 'Lifetime'}\n**Created By:** ${interaction.user.username}`,
                inline: false
            });

            await interaction.editReply({
                embeds: [adminEmbed(
                    'Licenses Generated Successfully',
                    `Created **${amount}** new license key(s).`,
                    fields
                )]
            });

            // If more than 25 fields (Discord limit), send additional message
            if (fields.length > 25) {
                const remainingKeys = generatedKeys.slice(250);
                await interaction.followUp({
                    content: '**Remaining Keys:**\n```\n' + remainingKeys.join('\n') + '\n```',
                    ephemeral: true
                });
            }

        } catch (error) {
            logger.error('Failed to create licenses', { error: error.message, amount, createdBy });
            throw error;
        }

    } catch (error) {
        logger.error('Create license command error', { error: error.message, userId: interaction.user.id });
        await interaction.editReply({
            embeds: [errorEmbed(
                'License Generation Failed',
                'An unexpected error occurred while generating licenses. Please try again later.'
            )]
        });
    }
}
