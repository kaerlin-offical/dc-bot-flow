import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { generateLicenseKey, isAdmin, LICENSE_TIERS, calculateExpiryFromTier } from '../../utils/security.js';
import { createLicense } from '../../database/queries.js';
import { logAdminAction, logLicenseGeneration } from '../../database/admin_queries.js';
import { adminEmbed, errorEmbed, formatDate } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('generate_keys')
    .setDescription('[ADMIN] Generate license keys with specific tier')
    .addStringOption(option =>
        option.setName('tier')
            .setDescription('License tier/duration')
            .setRequired(true)
            .addChoices(
                { name: '12 Hours', value: '12H' },
                { name: '24 Hours', value: '24H' },
                { name: '7 Days', value: '7D' },
                { name: '1 Month', value: '1M' },
                { name: 'Quarterly (3 Months)', value: 'QUARTERLY' },
                { name: 'Lifetime', value: 'LIFETIME' }
            ))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Number of licenses to generate (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction, userDb, adminDb) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const discordId = interaction.user.id;

        // Check if user is admin
        if (!isAdmin(discordId)) {
            logger.command(discordId, interaction.user.username, 'generate_keys', false, 'Not authorized');
            return await interaction.editReply({
                embeds: [errorEmbed(
                    'Access Denied',
                    'You do not have permission to use this command. This command is restricted to administrators only.'
                )]
            });
        }

        const tier = interaction.options.getString('tier');
        const amount = interaction.options.getInteger('amount');

        const tierInfo = LICENSE_TIERS[tier];
        const expiryDate = calculateExpiryFromTier(tier);

        // Generate licenses
        const generatedKeys = [];
        const createdBy = `${interaction.user.username} (${discordId})`;

        try {
            // Generate licenses (sql.js auto-saves after each operation)
            for (let i = 0; i < amount; i++) {
                const key = generateLicenseKey();
                createLicense(userDb, key, createdBy, expiryDate);
                generatedKeys.push(key);
            }

            // Log to admin database
            logLicenseGeneration(adminDb, discordId, interaction.user.username, tier, amount, tierInfo.hours);

            logAdminAction(
                adminDb,
                discordId,
                interaction.user.username,
                'LICENSE_GENERATION',
                'LICENSE',
                null,
                JSON.stringify({ tier, amount, keys: generatedKeys })
            );

            logger.success(`Generated ${amount} ${tier} licenses`, { admin: interaction.user.username, tier, amount });
            logger.command(discordId, interaction.user.username, 'generate_keys', true);

            // Format keys for display
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
                name: '📊 Generation Summary',
                value: [
                    `**Tier:** ${tierInfo.name}`,
                    `**Amount:** ${amount} keys`,
                    `**Duration:** ${tierInfo.hours ? `${tierInfo.hours} hours` : 'Lifetime'}`,
                    `**Expires:** ${expiryDate ? formatDate(expiryDate) : 'Never'}`,
                    `**Created By:** ${interaction.user.username}`,
                    `**Created At:** ${formatDate(Date.now())}`
                ].join('\n'),
                inline: false
            });

            await interaction.editReply({
                embeds: [adminEmbed(
                    '✅ License Keys Generated',
                    `Successfully created **${amount}** ${tierInfo.name} license key(s).`,
                    fields.slice(0, 25) // Discord limit
                )]
            });

            // If more than 25 fields, send additional messages
            if (fields.length > 25) {
                const remainingKeys = generatedKeys.slice(250);
                await interaction.followUp({
                    content: '**Remaining Keys:**\n```\n' + remainingKeys.join('\n') + '\n```',
                    ephemeral: true
                });
            }

        } catch (error) {
            logger.error('Failed to generate licenses', { error: error.message, amount, tier, createdBy });
            throw error;
        }

    } catch (error) {
        logger.error('Generate keys command error', { error: error.message, userId: interaction.user.id });
        await interaction.editReply({
            embeds: [errorEmbed(
                'License Generation Failed',
                'An unexpected error occurred while generating licenses. Please try again later.'
            )]
        });
    }
}
