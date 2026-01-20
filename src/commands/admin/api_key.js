import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isAdmin, generateLicenseKey } from '../../utils/security.js';
import { createApiKey, getAllApiKeys, revokeApiKey } from '../../database/admin_queries.js';
import { logAdminAction } from '../../database/admin_queries.js';
import { adminEmbed, errorEmbed, formatDate } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('api_key')
    .setDescription('[ADMIN] Manage API keys for external applications')
    .addSubcommand(subcommand =>
        subcommand
            .setName('create')
            .setDescription('Create a new API key')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('Name/description for this API key')
                    .setRequired(true))
            .addIntegerOption(option =>
                option.setName('rate_limit')
                    .setDescription('Requests per 15 minutes (default: 100)')
                    .setRequired(false)
                    .setMinValue(10)
                    .setMaxValue(1000)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('List all API keys'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('revoke')
            .setDescription('Revoke an API key')
            .addStringOption(option =>
                option.setName('key')
                    .setDescription('The API key to revoke')
                    .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction, userDb, adminDb) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const discordId = interaction.user.id;

        if (!isAdmin(discordId)) {
            logger.command(discordId, interaction.user.username, 'api_key', false, 'Not authorized');
            return await interaction.editReply({
                embeds: [errorEmbed('Access Denied', 'Admin only command.')]
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            const name = interaction.options.getString('name');
            const rateLimit = interaction.options.getInteger('rate_limit') || 100;

            // Generate secure API key (longer than license keys)
            const apiKey = `sk_${generateLicenseKey()}${generateLicenseKey()}`.replace(/-/g, '');
            const createdBy = `${interaction.user.username} (${discordId})`;

            try {
                createApiKey(adminDb, apiKey, name, createdBy, 'read', rateLimit);

                logAdminAction(
                    adminDb,
                    discordId,
                    interaction.user.username,
                    'API_KEY_CREATED',
                    'API_KEY',
                    apiKey,
                    JSON.stringify({ name, rateLimit })
                );

                logger.success('API key created', { name, createdBy });
                logger.command(discordId, interaction.user.username, 'api_key create', true);

                await interaction.editReply({
                    embeds: [adminEmbed(
                        'API Key Created',
                        '⚠️ **Save this key now! It will not be shown again.**',
                        [
                            { name: '🔑 API Key', value: `\`\`\`${apiKey}\`\`\``, inline: false },
                            { name: '📝 Name', value: name, inline: true },
                            { name: '⏱️ Rate Limit', value: `${rateLimit} req/15min`, inline: true },
                            { name: '👤 Created By', value: interaction.user.username, inline: true },
                            { name: '📅 Created At', value: formatDate(Date.now()), inline: true },
                            { name: '📖 Usage', value: 'Include this key in the `X-API-Key` header when making API requests.', inline: false }
                        ]
                    )]
                });

            } catch (error) {
                logger.error('Failed to create API key', { error: error.message });
                throw error;
            }

        } else if (subcommand === 'list') {
            const apiKeys = getAllApiKeys(adminDb);

            if (apiKeys.length === 0) {
                return await interaction.editReply({
                    embeds: [adminEmbed('No API Keys', 'No API keys have been created yet.')]
                });
            }

            const fields = apiKeys.map(key => ({
                name: key.name,
                value: [
                    `**Key:** \`${key.key.substring(0, 20)}...\``,
                    `**Status:** ${key.is_active ? '🟢 Active' : '🔴 Revoked'}`,
                    `**Rate Limit:** ${key.rate_limit} req/15min`,
                    `**Created:** ${formatDate(key.creation_date)}`,
                    `**Last Used:** ${key.last_used > 0 ? formatDate(key.last_used) : 'Never'}`
                ].join('\n'),
                inline: false
            }));

            logger.command(discordId, interaction.user.username, 'api_key list', true);

            await interaction.editReply({
                embeds: [adminEmbed(
                    'API Keys',
                    `Total: ${apiKeys.length} key(s)`,
                    fields.slice(0, 25)
                )]
            });

        } else if (subcommand === 'revoke') {
            const key = interaction.options.getString('key');

            try {
                const result = revokeApiKey(adminDb, key);

                if (result.changes === 0) {
                    return await interaction.editReply({
                        embeds: [errorEmbed('Not Found', 'The specified API key does not exist or is already revoked.')]
                    });
                }

                logAdminAction(
                    adminDb,
                    discordId,
                    interaction.user.username,
                    'API_KEY_REVOKED',
                    'API_KEY',
                    key,
                    null
                );

                logger.success('API key revoked', { key: key.substring(0, 20), revokedBy: interaction.user.username });
                logger.command(discordId, interaction.user.username, 'api_key revoke', true);

                await interaction.editReply({
                    embeds: [adminEmbed(
                        'API Key Revoked',
                        'The API key has been revoked and can no longer be used.',
                        [
                            { name: '🔑 Key', value: `\`${key.substring(0, 20)}...\``, inline: false },
                            { name: '🚫 Revoked By', value: interaction.user.username, inline: true },
                            { name: '📅 Revoked At', value: formatDate(Date.now()), inline: true }
                        ]
                    )]
                });

            } catch (error) {
                logger.error('Failed to revoke API key', { error: error.message });
                throw error;
            }
        }

    } catch (error) {
        logger.error('API key command error', { error: error.message });
        await interaction.editReply({
            embeds: [errorEmbed('Failed', 'Error managing API keys.')]
        });
    }
}
