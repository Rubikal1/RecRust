const { Client, GatewayIntentBits, Partials, Collection, ChannelType } = require('discord.js');

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel] // Needed to DM users!
});

// Export client globally for all handlers to use (for DMs)
module.exports.client = client;
global.client = client; // Also attach to global for old handler logic

// --- Command loader ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  }
}

// --- Interaction handlers ---
const handleButton = require('./interactions/buttons.js');
const handleModal = require('./interactions/modals.js');

client.on('interactionCreate', async interaction => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
      }
      return;
    }
    // Buttons
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
    // Modals
    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return;
    }
    // Add select menu, etc as needed
  } catch (err) {
    console.error('Interaction Handler Error:', err);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
      } catch {}
    }
  }
});

// --- Forward user DMs to their open ticket channel ---
const USER_MAP_PATH = path.join(__dirname, 'utils/ticketUserMap.json');

// Use the SAME archive IDs you use elsewhere in your bot
const ARCHIVE_CATEGORY_IDS = {
  cheater: '1412705818683506724',
  general: '1412705818683506720',
  appeal:  '1412705818683506725',
  kit:     '1412705818683506726',
  frivolous:'1412705818683506727',
};

client.on('messageCreate', async (msg) => {
  // Only handle user DMs, ignore bots and guild messages
  if (msg.author.bot || msg.channel.type !== ChannelType.DM) return;

  // Load map
  let userMap = {};
  try {
    userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8'));
  } catch {
    userMap = {};
  }

  // Find the user's ticket entry, if any
  const entry = Object.entries(userMap).find(([, data]) => data.userId === msg.author.id);

  if (!entry) {
    await msg.reply("❌ You don't have any active tickets. Please open one in the server to continue.");
    return;
  }

  const [ticketId, data] = entry;

  // If already marked closed, stop forwarding
  if (data.isClosed) {
    await msg.reply('Your ticket has been closed. Please open a new ticket in the server to continue.');
    return;
  }

  // Try to fetch the ticket channel
  const ch = await client.channels.fetch(data.channelId).catch(() => null);
  const archivedIds = Object.values(ARCHIVE_CATEGORY_IDS);

  // If channel is missing, archived (by parent), or renamed to archived-*, mark closed and stop
  if (!ch || archivedIds.includes(ch.parentId) || (ch.name && ch.name.startsWith('archived-'))) {
    userMap[ticketId] = { ...(userMap[ticketId] || {}), isClosed: true, closedAt: Date.now() };
    fs.writeFileSync(USER_MAP_PATH, JSON.stringify(userMap, null, 2));
    await msg.reply('Your ticket has been closed. Please open a new ticket in the server to continue.');
    return;
  }

  // Still open → forward DM into the ticket channel
  await ch.send({
    content: `**${msg.author.tag}:** ${msg.content || ''}`,
    files: msg.attachments.size ? [...msg.attachments.values()] : [],
  });
});


client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// --- Auto Reminder System for Tickets ---
const REMINDER_INTERVAL_MS = 60 * 1000; // check every 1 min
const REM_THRESHOLDS_MS = [5 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000]; // 5m, 30m, 1h
const STAFF_ROLE_ID = '1384325547097849956';

// Helpers: store reminder stage in channel topic as "[rem:N]"
function getReminderStageFromTopic(topic) {
  if (!topic) return 0;
  const m = topic.match(/\[rem:(\d)\]/);
  const n = m ? parseInt(m[1], 10) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function setReminderStageInTopic(channel, stage) {
  try {
    const current = channel.topic || '';
    const next = current.includes('[rem:')
      ? current.replace(/\[rem:\d\]/, `[rem:${stage}]`)
      : (current ? `${current} [rem:${stage}]` : `[rem:${stage}]`);
    if (next !== current) await channel.setTopic(next);
  } catch (e) {
    console.warn('[Reminders] Unable to set topic for channel', channel.id, e?.message || e);
  }
}

setInterval(async () => {
  let userMap = {};
  if (fs.existsSync(USER_MAP_PATH)) {
    try { userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8')); } catch { userMap = {}; }
  }
  const now = Date.now();

  for (const [ticketId, data] of Object.entries(userMap)) {
    const channel = await client.channels.fetch(data.channelId).catch(() => null);
    if (!channel) continue;
  const archivedIds = Object.values(ARCHIVE_CATEGORY_IDS);
// Skip archived channels
if (archivedIds.includes(channel.parentId) || (channel.name && channel.name.startsWith('archived-'))) continue;


    // Determine status: Pending via name; Unclaimed via embed text
    const isPending = channel.name.startsWith('pending-');

    // Fetch a handful of recent messages to find the staff embed
    const msgs = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    const botMsg = msgs ? Array.from(msgs.values()).find(m => m.author?.id === client.user.id && m.embeds?.length) : null;
    const embed = botMsg?.embeds?.[0];
    const desc = embed?.description || '';
    const isUnclaimed = /\*\*Assigned to:\*\*\s*Unclaimed/i.test(desc);

    // If neither pending nor unclaimed, no reminders needed
    if (!isPending && !isUnclaimed) continue;

    // Elapsed since channel creation
    const createdAt = channel.createdTimestamp || (Date.parse(channel.createdAt) || now);
    const elapsed = now - createdAt;

    // Compute which threshold we're at: 0 (none), 1 (5m), 2 (30m), 3 (1h)
    let targetStage = 0;
    if (elapsed >= REM_THRESHOLDS_MS[0]) targetStage = 1;
    if (elapsed >= REM_THRESHOLDS_MS[1]) targetStage = 2;
    if (elapsed >= REM_THRESHOLDS_MS[2]) targetStage = 3;

    const currentStage = getReminderStageFromTopic(channel.topic);
    if (targetStage > currentStage) {
      // Send the appropriate reminder once per stage
      try {
        if (targetStage === 1) {
          await channel.send(`<@&${STAFF_ROLE_ID}> ⚠️ This ticket has not been handled for **5 minutes** (${isPending ? 'pending approval' : 'unclaimed'}).`);
        } else if (targetStage === 2) {
          await channel.send(`<@&${STAFF_ROLE_ID}> ⏰ **30 minutes** elapsed and this ticket is still ${isPending ? 'pending' : 'unclaimed'}. Please take action.`);
        } else if (targetStage === 3) {
          await channel.send(`<@&${STAFF_ROLE_ID}> ⛳ **1 hour** elapsed — ticket remains ${isPending ? 'pending approval' : 'unclaimed'}. Prioritize this.`);
        }
      } catch (e) {
        console.warn('[Reminders] Failed to send reminder in', channel.id, e?.message || e);
      }
      await setReminderStageInTopic(channel, targetStage);
    }
  }
}, REMINDER_INTERVAL_MS);



client.login(process.env.TOKEN);
