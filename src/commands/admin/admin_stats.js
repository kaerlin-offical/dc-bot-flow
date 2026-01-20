import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isAdmin } from '../../utils/security.js';
import { getAdminActions, getLicenseGenerationHistory, getLicenseGenerationStats } from '../../database/admin_queries.js';
import { getAllUsers, getAllLicenses } from '../../database/queries.js';
import { adminEmbed, errorEmbed, formatDate } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('admin_stats')
    .setDescription('[ADMIN] View comprehensive system statistics')
    .addStringOption(option =>
        option.setName('category')
            .setDescription('Statistics category')
            .setRequired(false)
            .addChoices(
                { name: 'Overview', value: 'overview' },
                { name: 'License Generation', value: 'licenses' },
                { name: 'Recent Actions', value: 'actions' },
                { name: 'User Stats', value: 'users' }
            ))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction, userDb, adminDb) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const discordId = interaction.user.id;

        if (!isAdmin(discordId)) {
            logger.command(discordId, interaction.user.username, 'admin_stats', false, 'Not authorized');
            return await interaction.editReply({
                embeds: [errorEmbed('Access Denied', 'Admin only command.')]
            });
        }

        const category = interaction.options.getString('category') || 'overview';

        if (category === 'overview') {
            // Get overview statistics
            const allUsers = getAllUsers(userDb);
            const allLicenses = getAllLicenses(userDb);

            const unusedLicenses = allLicenses.filter(l => l.status === 'unused').length;
            const redeemedLicenses = allLicenses.filter(l => l.status === 'redeemed').length;
            const revokedLicenses = allLicenses.filter(l => l.status === 'revoked').length;

            const now = Date.now();
            const activeLicenses = allLicenses.filter(l =>
                l.status === 'redeemed' && (!l.expiry_date || l.expiry_date > now)
            ).length;

            const expiredLicenses = allLicenses.filter(l =>
                l.expiry_date && l.expiry_date < now
            ).length;

            const recentActions = getAdminActions(adminDb, 5);

            const fields = [
                {
                    name: '👥 User Statistics',
                    value: [
                        `**Total Users:** ${allUsers.length}`,
                        `**Active Licenses:** ${activeLicenses}`,
                        `**Expired Licenses:** ${expiredLicenses}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '🔑 License Statistics',
                    value: [
                        `**Total Licenses:** ${allLicenses.length}`,
                        `**Unused:** ${unusedLicenses}`,
                        `**Redeemed:** ${redeemedLicenses}`,
                        `**Revoked:** ${revokedLicenses}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '📊 System Health',
                    value: [
                        `**Status:** 🟢 Operational`,
                        `**Uptime:** Active`,
                        `**Database:** Connected`
                    ].join('\n'),
                    inline: true
                }
            ];

            if (recentActions.length > 0) {
                fields.push({
                    name: '📝 Recent Admin Actions',
                    value: recentActions.map(a =>
                        `• ${a.action_type} by ${a.admin_username} - ${formatDate(a.timestamp)}`
                    ).join('\n').substring(0, 1024),
                    inline: false
                });
            }

            await interaction.editReply({
                embeds: [adminEmbed('System Overview', 'Comprehensive system statistics', fields)]
            });

        } else if (category === 'licenses') {
            // License generation statistics
            const stats = getLicenseGenerationStats(adminDb);
            const history = getLicenseGenerationHistory(adminDb, 10);

            const fields = [];

            if (stats.length > 0) {
                fields.push({
                    name: '📊 Generation Statistics by Tier',
                    value: stats.map(s =>
                        `**${s.license_type}:** ${s.total_licenses} keys (${s.generation_count} batches)`
                    ).join('\n'),
                    inline: false
                });
            }

            if (history.length > 0) {
                fields.push({
                    name: '📝 Recent Generations',
                    value: history.map(h =>
                        `• ${h.amount}x ${h.license_type} by ${h.admin_username} - ${formatDate(h.timestamp)}`
                    ).join('\n'),
                    inline: false
                });
            }

            if (fields.length === 0) {
                fields.push({
                    name: 'No Data',
                    value: 'No license generation history found.',
                    inline: false
                });
            }

            await interaction.editReply({
                embeds: [adminEmbed('License Generation Statistics', 'Detailed generation metrics', fields)]
            });

        } else if (category === 'actions') {
            // Recent admin actions
            const actions = getAdminActions(adminDb, 20);

            if (actions.length === 0) {
                return await interaction.editReply({
                    embeds: [adminEmbed('No Actions', 'No admin actions recorded yet.')]
                });
            }

            const fields = actions.map(action => ({
                name: `${action.action_type} - ${formatDate(action.timestamp)}`,
                value: [
                    `**Admin:** ${action.admin_username}`,
                    action.target_type ? `**Target:** ${action.target_type}` : '',
                    action.details ? `**Details:** ${action.details.substring(0, 100)}` : ''
                ].filter(Boolean).join('\n'),
                inline: false
            }));

            await interaction.editReply({
                embeds: [adminEmbed('Recent Admin Actions', `Showing last ${actions.length} actions`, fields.slice(0, 25))]
            });

        } else if (category === 'users') {
            // User statistics
            const allUsers = getAllUsers(userDb);

            const now = Date.now();
            const day = 24 * 60 * 60 * 1000;

            const registeredToday = allUsers.filter(u => u.registration_date > now - day).length;
            const registeredWeek = allUsers.filter(u => u.registration_date > now - (7 * day)).length;
            const registeredMonth = allUsers.filter(u => u.registration_date > now - (30 * day)).length;

            const activeUsers = allUsers.filter(u => u.last_download > now - (7 * day)).length;

            const fields = [
                {
                    name: '📈 Registration Trends',
                    value: [
                        `**Last 24 hours:** ${registeredToday}`,
                        `**Last 7 days:** ${registeredWeek}`,
                        `**Last 30 days:** ${registeredMonth}`,
                        `**Total:** ${allUsers.length}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '🎯 User Activity',
                    value: [
                        `**Active (7 days):** ${activeUsers}`,
                        `**Inactive:** ${allUsers.length - activeUsers}`,
                        `**Activity Rate:** ${allUsers.length > 0 ? Math.round((activeUsers / allUsers.length) * 100) : 0}%`
                    ].join('\n'),
                    inline: true
                }
            ];

            await interaction.editReply({
                embeds: [adminEmbed('User Statistics', 'Detailed user metrics', fields)]
            });
        }

        logger.command(discordId, interaction.user.username, 'admin_stats', true);

    } catch (error) {
        logger.error('Admin stats error', { error: error.message });
        await interaction.editReply({
            embeds: [errorEmbed('Failed', 'Error retrieving statistics.')]
        });
    }
}
