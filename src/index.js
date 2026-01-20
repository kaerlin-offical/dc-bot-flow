import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import initDatabase from './database/schema.js';
import initAdminDatabase from './database/admin_schema.js';
import startApiServer from './api/server.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// Global database objects
let userDb, adminDb, apiServer;

// Command collection
client.commands = new Collection();

// Load commands
async function loadCommands() {
    const commands = [];
    const commandsPath = join(__dirname, 'commands');

    // Load regular commands
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = await import(`./commands/${file}`);
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
        logger.info(`Loaded command: ${command.data.name}`);
    }

    // Load admin commands
    const adminPath = join(commandsPath, 'admin');
    const adminFiles = readdirSync(adminPath).filter(file => file.endsWith('.js'));

    for (const file of adminFiles) {
        const command = await import(`./commands/admin/${file}`);
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
        logger.info(`Loaded admin command: ${command.data.name}`);
    }

    return commands;
}

// Register slash commands
async function registerCommands(commands) {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    try {
        logger.info(`Registering ${commands.length} slash commands...`);

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );

        logger.success('Successfully registered slash commands');
    } catch (error) {
        logger.error('Failed to register commands', { error: error.message });
    }
}

// Event: Bot ready
client.once('ready', () => {
    logger.success(`Bot logged in as ${client.user.tag}`);
    logger.info(`Serving ${client.guilds.cache.size} guild(s)`);

    client.user.setActivity('Managing licenses', { type: 'WATCHING' });
});

// Event: Interaction create
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        logger.warning(`Unknown command: ${interaction.commandName}`);
        return;
    }

    try {
        // Pass both databases to commands
        await command.execute(interaction, userDb, adminDb);
    } catch (error) {
        logger.error('Command execution error', {
            command: interaction.commandName,
            user: interaction.user.id,
            error: error.message
        });

        const errorMessage = {
            content: '❌ An error occurred while executing this command.',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// Error handling
process.on('unhandledRejection', error => {
    logger.error('Unhandled promise rejection', { error: error.message });
});

process.on('uncaughtException', error => {
    logger.error('Uncaught exception', { error: error.message });
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down gracefully...');
    if (apiServer) {
        apiServer.close();
    }
    client.destroy();
    process.exit(0);
});

// Start bot
(async () => {
    try {
        // Initialize databases (async)
        userDb = await initDatabase();
        adminDb = await initAdminDatabase();
        logger.success('Databases initialized');

        // Start API server
        apiServer = startApiServer(userDb, adminDb);

        // Load and register commands
        const commands = await loadCommands();
        await registerCommands(commands);

        // Login to Discord
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        logger.error('Failed to start bot', { error: error.message });
        process.exit(1);
    }
})();
