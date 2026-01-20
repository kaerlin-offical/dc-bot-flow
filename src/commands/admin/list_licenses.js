import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isAdmin } from '../../utils/security.js';
import { getAllLicenses } from '../../database/queries.js';
import { adminEmbed, errorEmbed, formatDate, formatLicenseStatus } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('list_licenses')
    .setDescription('[ADMIN] List all license keys')
    .addStringOption(option =>
        option.setName('status')
            .setDescription('Filter by status')
            .setRequired(false)
            .addChoices(
                { name: 'Unused', value: 'unused' },
                { name: 'Redeemed', value: 'redeemed' },
                { name: 'Revoked', value: 'revoked' }
            ))
    .addIntegerOption(option =>
        option.setName('page')
            .setDescription('Page number (10 licenses per page)')
            .setRequired(false)
            .setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction, userDb, adminDb) {
    const db = userDb;
    await interaction.deferReply({ ephemeral: true });

    try {
        const discordId = interaction.user.id;

        if (!isAdmin(discordId)) {
            logger.command(discordId, interaction.user.username, 'list_licenses', false, 'Not authorized');
            return await interaction.editReply({
                embeds: [errorEmbed('Access Denied', 'Admin only command.')]
            });
        }

        const statusFilter = interaction.options.getString('status');
        const page = interaction.options.getInteger('page') || 1;
        const licensesPerPage = 10;

        let allLicenses = getAllLicenses(db);

        if (statusFilter) {
            allLicenses = allLicenses.filter(l => l.status === statusFilter);
        }

        if (allLicenses.length === 0) {
            return await interaction.editReply({
                embeds: [adminEmbed('No Licenses Found', statusFilter ? `No ${statusFilter} licenses.` : 'No licenses in database.')]
            });
        }

        const totalPages = Math.ceil(allLicenses.length / licensesPerPage);
        const startIndex = (page - 1) * licensesPerPage;
        const endIndex = startIndex + licensesPerPage;
        const pageLicenses = allLicenses.slice(startIndex, endIndex);

        if (pageLicenses.length === 0) {
            return await interaction.editReply({
                embeds: [errorEmbed('Invalid Page', `Only ${totalPages} pages available.`)]
            });
        }

        const fields = pageLicenses.map((license, index) => ({
            name: `${startIndex + index + 1}. ${license.key}`,
            value: `**Status:** ${formatLicenseStatus(license.status)}\n**Created:** ${formatDate(license.creation_date)}\n${license.discord_id ? `**User:** <@${license.discord_id}>` : ''}`,
            inline: false
        }));

        fields.push({
            name: '📊 Summary',
            value: `**Total:** ${allLicenses.length} | **Page:** ${page}/${totalPages}${statusFilter ? ` | **Filter:** ${statusFilter}` : ''}`,
            inline: false
        });

        logger.command(discordId, interaction.user.username, 'list_licenses', true);

        await interaction.editReply({
            embeds: [adminEmbed('License Keys', `Page ${page}/${totalPages}`, fields)]
        });

    } catch (error) {
        logger.error('List licenses error', { error: error.message });
        await interaction.editReply({
            embeds: [errorEmbed('Failed', 'Error retrieving licenses.')]
        });
    }
}
