import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isAdmin } from '../../utils/security.js';
import { getAllUsers } from '../../database/queries.js';
import { adminEmbed, errorEmbed, formatDate } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('list_users')
    .setDescription('[ADMIN] List all registered users')
    .addIntegerOption(option =>
        option.setName('page')
            .setDescription('Page number (10 users per page)')
            .setRequired(false)
            .setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction, userDb, adminDb) {
    const db = userDb;
    await interaction.deferReply({ ephemeral: true });

    try {
        const discordId = interaction.user.id;

        if (!isAdmin(discordId)) {
            logger.command(discordId, interaction.user.username, 'list_users', false, 'Not authorized');
            return await interaction.editReply({
                embeds: [errorEmbed('Access Denied', 'Admin only command.')]
            });
        }

        const page = interaction.options.getInteger('page') || 1;
        const usersPerPage = 10;
        const allUsers = getAllUsers(db);

        if (allUsers.length === 0) {
            return await interaction.editReply({
                embeds: [adminEmbed('No Users Found', 'No registered users.')]
            });
        }

        const totalPages = Math.ceil(allUsers.length / usersPerPage);
        const startIndex = (page - 1) * usersPerPage;
        const endIndex = startIndex + usersPerPage;
        const pageUsers = allUsers.slice(startIndex, endIndex);

        if (pageUsers.length === 0) {
            return await interaction.editReply({
                embeds: [errorEmbed('Invalid Page', `Only ${totalPages} pages available.`)]
            });
        }

        const fields = pageUsers.map((user, index) => ({
            name: `${startIndex + index + 1}. ${user.username}`,
            value: `**Discord:** <@${user.discord_id}>\n**License:** \`${user.license_key}\`\n**Registered:** ${formatDate(user.registration_date)}`,
            inline: false
        }));

        fields.push({
            name: '📊 Summary',
            value: `**Total:** ${allUsers.length} | **Page:** ${page}/${totalPages}`,
            inline: false
        });

        logger.command(discordId, interaction.user.username, 'list_users', true);

        await interaction.editReply({
            embeds: [adminEmbed('Registered Users', `Page ${page}/${totalPages}`, fields)]
        });

    } catch (error) {
        logger.error('List users error', { error: error.message });
        await interaction.editReply({
            embeds: [errorEmbed('Failed', 'Error retrieving users.')]
        });
    }
}
