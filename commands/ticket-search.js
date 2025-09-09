// commands/ticket-search.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const { ARCHIVE_CATEGORY_IDS } = require('../utils/constants');

const USER_MAP_PATH = path.join(__dirname, '../utils/ticketUserMap.json');
const ICON_URL = 'https://cdn3.mapstr.gg/b83758cf76068a6344f1509100529665.gif';

function formatTicketLine(ticketId, data, channel, status) {
  return `\n\u200b\n> **Ticket:** \`${ticketId}\`\n> **Type:** ${data.type?.charAt(0).toUpperCase() + data.type?.slice(1) || 'Unknown'}\n> **Channel:** <#${data.channelId}>\n> **Status:** ${status}`;
}

async function getStatusEmoji(channel) {
  if (!channel) return '❓ Unknown';
  if (ARCHIVE_CATEGORY_IDS.includes(channel.parentId)) return '🗄️ Closed';
  if (channel.name.startsWith('claimed-')) return '🟡 Claimed';
  return '🟢 Open';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-search')
    .setDescription('Find all tickets by Steam64 ID or Discord User ID')
    .addStringOption(option =>
      option.setName('input')
        .setDescription('Steam64 ID (17 digits) or Discord User ID')
        .setMaxLength(25)
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const input = interaction.options.getString('input');
    let userMap = {};
    if (fs.existsSync(USER_MAP_PATH)) {
      try {
        userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8'));
      } catch {
        userMap = {};
      }
    }

    // 1. Try matching SteamID
    let matches = Object.entries(userMap).filter(
      ([, data]) => data.steamid === input
    );

    let matchType = 'SteamID';
    // 2. If no steamid matches, try Discord userId
    if (!matches.length) {
      matches = Object.entries(userMap).filter(
        ([, data]) => data.userId === input
      );
      if (!matches.length) {
        return interaction.reply({ content: `No tickets found for \`${input}\`.`, ephemeral: true });
      }
      matchType = 'Discord ID';
    }

    // 3. Load channel status
    const resultLines = [];
    for (const [ticketId, data] of matches) {
      let channel = null;
      let status;
      try {
        channel = await interaction.client.channels.fetch(data.channelId);
        status = await getStatusEmoji(channel);
      } catch {
        // Fallback to status field in userMap
        status = data.status
          ? (data.status === 'closed' ? '🗄️ Closed' :
             data.status === 'claimed' ? '🟡 Claimed' :
             data.status === 'pending' ? '🔴 Pending Approval' :
             '🟢 Open')
          : '❓ Unknown';
      }
      resultLines.push(formatTicketLine(ticketId, data, channel, status));
    }

    // 4. Respond with formatted embed
    const embed = new EmbedBuilder()
      .setTitle(`Tickets for ${matchType}: ${input}`)
      .setColor(0x3498db)
      .setDescription(resultLines.join('\n'))
      .setFooter({ text: 'Inferno Search', iconURL: ICON_URL })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
