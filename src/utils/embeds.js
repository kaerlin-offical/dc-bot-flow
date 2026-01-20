import { EmbedBuilder } from 'discord.js';

const COLORS = {
    SUCCESS: 0x00ff00,
    ERROR: 0xff0000,
    INFO: 0x3498db,
    WARNING: 0xffa500,
    ADMIN: 0x9b59b6
};

/**
 * Create a success embed
 */
export function successEmbed(title, description, fields = []) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setTimestamp();

    if (fields.length > 0) {
        embed.addFields(fields);
    }

    return embed;
}

/**
 * Create an error embed
 */
export function errorEmbed(title, description, fields = []) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setTimestamp();

    if (fields.length > 0) {
        embed.addFields(fields);
    }

    return embed;
}

/**
 * Create an info embed
 */
export function infoEmbed(title, description, fields = []) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description)
        .setTimestamp();

    if (fields.length > 0) {
        embed.addFields(fields);
    }

    return embed;
}

/**
 * Create a warning embed
 */
export function warningEmbed(title, description, fields = []) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`⚠️ ${title}`)
        .setDescription(description)
        .setTimestamp();

    if (fields.length > 0) {
        embed.addFields(fields);
    }

    return embed;
}

/**
 * Create an admin embed
 */
export function adminEmbed(title, description, fields = []) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.ADMIN)
        .setTitle(`🔐 ${title}`)
        .setDescription(description)
        .setTimestamp()
        .setFooter({ text: 'Admin Command' });

    if (fields.length > 0) {
        embed.addFields(fields);
    }

    return embed;
}

/**
 * Format timestamp to readable date
 */
export function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format license status with emoji
 */
export function formatLicenseStatus(status) {
    const statusMap = {
        'unused': '🆕 Unused',
        'redeemed': '✅ Redeemed',
        'revoked': '🚫 Revoked'
    };
    return statusMap[status] || status;
}

/**
 * Truncate text to specified length
 */
export function truncate(text, maxLength = 1024) {
    if (!text) return 'N/A';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}
