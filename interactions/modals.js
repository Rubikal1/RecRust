const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const path = require('path');
const fs = require('fs');
const ticketTypes = require('../utils/ticketConfig');
const { CATEGORY_IDS, STAFF_ROLE_ID } = require('../utils/constants');
const USER_MAP_PATH = path.join(__dirname, '../utils/ticketUserMap.json');

// Utility to update userMapconst { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
function updateUserMap(ticketId, updates) {
  let userMap = {};
  if (fs.existsSync(USER_MAP_PATH)) {
    try {
      userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8'));
    } catch {
      userMap = {};
    }
  }
  if (!userMap[ticketId]) return;
  Object.assign(userMap[ticketId], updates);
  fs.writeFileSync(USER_MAP_PATH, JSON.stringify(userMap, null, 2));
}

module.exports = async function handleModal(interaction) {
  if (!interaction.isModalSubmit()) return;

  const typeId = interaction.customId.replace('modal_', '');
  const ticketConfig = ticketTypes.find(t => t.id === typeId);
  if (!ticketConfig) {
    await interaction.reply({ content: '❌ Invalid ticket type.', ephemeral: true });
    return;
  }

  // Load userMap
  let userMap = {};
  if (fs.existsSync(USER_MAP_PATH)) {
    try {
      userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8'));
    } catch {
      userMap = {};
    }
  }

  // Duplicate ticket check (not closed)
  const alreadyOpen = Object.entries(userMap).find(
    ([, data]) =>
      data.userId === interaction.user.id &&
      (!data.status || data.status !== 'closed') &&
      (!data.isClosed)
  );
  if (alreadyOpen) {
    await interaction.reply({ content: '❌ You already have an open ticket.', ephemeral: true });
    return;
  }

  // Create ticket channel (simplified example)
  const guild = interaction.guild;
  const channel = await guild.channels.create({
    name: `${typeId}-${interaction.user.username}`,
    type: 0, // ChannelType.GuildText
    parent: ticketConfig.categoryId,
    topic: `Ticket for ${interaction.user.tag}`,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages'] }
    ]
  });

  // Save ticket to userMap
  const ticketId = channel.id;
  userMap[ticketId] = {
    userId: interaction.user.id,
    channelId: channel.id,
    type: typeId,
    steamid: interaction.fields.getTextInputValue('steamid') || null,
    status: 'open',
    isClosed: false
  };
  fs.writeFileSync(USER_MAP_PATH, JSON.stringify(userMap, null, 2));

  await interaction.reply({ content: `✅ Ticket created: <#${channel.id}>`, ephemeral: true });
};

// Example archive/close handler (call this when archiving/closing a ticket)
async function archiveTicket(ticketId) {
  let userMap = {};
  if (fs.existsSync(USER_MAP_PATH)) {
    try {
      userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8'));
    } catch {
      userMap = {};
    }
  }
  if (userMap[ticketId]) {
    userMap[ticketId].status = 'closed';
    userMap[ticketId].isClosed = true;
    userMap[ticketId].assignee = null;
    userMap[ticketId].closedAt = Date.now();
    fs.writeFileSync(USER_MAP_PATH, JSON.stringify(userMap, null, 2));
  }
}

// package.json scripts
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Discord Bot",
      "program": "${workspaceFolder}/${input:entryFile}",
      "envFile": "${workspaceFolder}/.env",
      "cwd": "${workspaceFolder}"
    }
  ],
  "inputs": [
    {
      "type": "pickString",
      "id": "entryFile",
      "description": "Select the entry point for your bot",
      "options": [
        "index.js",
        "deploy-commands.js"
      ]
    }
  ]
}