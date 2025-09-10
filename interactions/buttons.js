const {
  PermissionsBitField,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const ticketTypes = require('../utils/ticketConfig');

const { CATEGORY_IDS, ARCHIVE_CATEGORY_IDS, STAFF_ROLE_ID } = require('../utils/constants');
const ARCHIVE_CATEGORY_IDS_LIST = Object.values(ARCHIVE_CATEGORY_IDS);
const USER_MAP_PATH = path.join(__dirname, '../utils/ticketUserMap.json');
const { TICKET_BANNER_URL, ICON_URL } = require('../utils/imageAssets');
const { SERVER_NAME } = require('../utils/constants');

const STATUS_META = {
  open:   { emoji: '🟢', text: 'Open' },
  claimed:{ emoji: '🟡', text: 'Claimed' },
  pending:{ emoji: '🔴', text: 'Pending Approval' },
  closed: { emoji: '🗄️', text: 'Closed' },
};

function getTicketIdFromChannelName(name) {
  return name.replace(/^(?:claimed-|pending-|archived-)/, '');
}



async function sendUserCloseDM(ticketId, type, userId, archivedType, reason) {
  let ticketLabel = type.charAt(0).toUpperCase() + type.slice(1);
  let archiveLabel = archivedType.charAt(0).toUpperCase() + archivedType.slice(1);
  const client = require('../index').client || global.client;
  if (!client) return;
  try {
    const user = await client.users.fetch(userId);
    if (!user) return;
    const embed = new EmbedBuilder()
      .setTitle('Your Ticket Has Been Closed')
      .setDescription(`Your ${ticketLabel} ticket has been **closed** and archived to **${archiveLabel}**.\n\n**Ticket ID:** \`${ticketId}\`\n\n**Reason:**\n${reason}`)
      .setColor(0x747f8d)
      .setFooter({ text: `${SERVER_NAME} Support`, iconURL: ICON_URL })
      .setImage(TICKET_BANNER_URL)
      .setTimestamp();
    await user.send({ embeds: [embed] });
  } catch (e) {
    console.warn('[Button] Could not DM user about closed ticket:', e);
  }
}


function setStatusField(embed, value) {
  if (!embed.data.fields) embed.data.fields = [];
  embed.data.fields = embed.data.fields.filter(f => !f.name.toLowerCase().includes('status'));
  embed.data.fields = [
    { name: 'Status', value, inline: false },
    ...embed.data.fields
  ];
}

async function fullyCloseTicket(channel, ticketId) {
  const msgs = await channel.messages.fetch({ limit: 50 });
  let mainEmbedMsg = null;
  for (const msg of msgs.values()) {
    if (msg.components && msg.components.length) {
      await msg.edit({ components: [] }).catch(() => {});
    }
    if (!mainEmbedMsg && msg.embeds && msg.embeds.length && msg.embeds[0].description && msg.embeds[0].description.includes(ticketId)) {
      mainEmbedMsg = msg;
    }
  }
  if (mainEmbedMsg) {
    const embed = EmbedBuilder.from(mainEmbedMsg.embeds[0]);
    setStatusField(embed, "🗄️ Closed");
    await mainEmbedMsg.edit({ embeds: [embed], components: [] }).catch(() => {});
  }
}

async function setClaimStatus(channel, ticketId, statusEmoji, statusText, memberId = null) {
  const msgs = await channel.messages.fetch({ limit: 50 });
  let mainEmbedMsg = null;
  for (const msg of msgs.values()) {
    if (msg.embeds && msg.embeds.length && msg.embeds[0].description && msg.embeds[0].description.includes(ticketId)) {
      mainEmbedMsg = msg;
      break;
    }
  }
  if (mainEmbedMsg) {
    const embed = EmbedBuilder.from(mainEmbedMsg.embeds[0]);
    setStatusField(embed, `${statusEmoji} ${statusText}`);

    let desc = embed.data.description || "";
    desc = desc.replace(
      /\*\*Assigned to:.*(\n|$)/,
      memberId
        ? `**Assigned to:** <@${memberId}>\n`
        : `**Assigned to:** Unclaimed\n`
    );
    embed.setDescription(desc);

    await mainEmbedMsg.edit({ embeds: [embed] }).catch(() => {});
  }
}

module.exports = async function handleButton(interaction) {
  if (!interaction.isButton()) return;
  console.log(`[Button Debug] customId: ${interaction.customId}, channel: ${interaction.channel.name}`);

  // Ticket creation modal panel
  if (interaction.customId.startsWith('ticket_')) {
    const type = interaction.customId.replace('ticket_', '');
    const config = ticketTypes.find(t => t.id === type);
    if (!config) {
      return interaction.reply({ content: '❌ Invalid ticket type.', ephemeral: true });
    }
    const modal = new ModalBuilder()
      .setCustomId(`modal_${type}`)
      .setTitle(config.modalTitle || `${config.label} Ticket`);
    for (const field of config.fields) {
      const input = new TextInputBuilder()
        .setCustomId(field.customId)
        .setLabel(field.label)
        .setStyle(field.style || TextInputStyle.Short)
        .setPlaceholder(field.placeholder || '')
        .setRequired(true);
      if (typeof field.maxLength === 'number') input.setMaxLength(field.maxLength);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
    }
    await interaction.showModal(modal);
    return;
  }

  // Main ticket buttons logic
  const channel = interaction.channel;
  const origChannelName = channel.name;
  const ticketId = getTicketIdFromChannelName(origChannelName);
  const member = interaction.member;

  function log(msg) { console.log(`[Button][${ticketId}] ${msg}`); }

  const archivedCategories = Object.values(ARCHIVE_CATEGORY_IDS);
  if (ARCHIVE_CATEGORY_IDS_LIST.includes(channel.parentId)) {
    if (interaction.deferred || interaction.replied) return;
    await interaction.reply({ content: 'This ticket is already closed and archived. No further actions can be taken.', ephemeral: true });
    return;
  }


// Claim/Unclaim
if (interaction.customId === `claim_${ticketId}` || interaction.customId === `unclaim_${ticketId}`) {
  try {
    // Avoid "Interaction Failed" by acknowledging immediately
    await interaction.deferUpdate();

    const claimed = interaction.customId.startsWith('claim_');
    const newName = claimed ? `claimed-${ticketId.toLowerCase()}` : `${ticketId.toLowerCase()}`;


    try {
      await channel.setName(newName);
      log(`Channel renamed to ${newName}`);
    } catch (renameErr) {
      log('Channel rename failed (continuing): ' + renameErr?.message || renameErr);

    }

    // Rebuild the main row reflecting the new state
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(claimed ? `unclaim_${ticketId}` : `claim_${ticketId}`)
        .setLabel(claimed ? 'Unclaim' : 'Claim')
        .setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`close_${ticketId}`)
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`pending_${ticketId}`)
        .setLabel('Pending Approval')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`transfer_${ticketId}`)
        .setLabel('Transfer')
        .setStyle(ButtonStyle.Secondary)
    );


    await interaction.message.edit({ components: [row] }).catch(() => {});


    await setClaimStatus(
      channel,
      ticketId,
      claimed ? "🟡" : "🟢",
      claimed ? "Claimed" : "Open",
      claimed ? member.id : null
    );

    log(claimed ? `Ticket claimed by <@${member.id}>` : `Ticket unclaimed by <@${member.id}>`);
    await channel.send(claimed ? `<@${member.id}> has claimed this ticket!` : `This ticket has now been unclaimed by <@${member.id}>!`);
  } catch (err) {
    log('Error in claim/unclaim: ' + err);

  }
  return;
}


  // --- CLOSE/ARCHIVE - Show archive categories + Back button ---
  if (interaction.customId === `close_${ticketId}`) {
    try {
      // 2 rows of buttons for archiving and Back
      const closeRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`archive_to_cheater_${ticketId}`).setLabel('Cheater').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`archive_to_general_${ticketId}`).setLabel('General').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`archive_to_appeal_${ticketId}`).setLabel('Appeal').setStyle(ButtonStyle.Secondary)
      );
      const closeRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`archive_to_kit_${ticketId}`).setLabel('Kit').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`archive_to_frivolous_${ticketId}`).setLabel('Frivolous').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`archive_back_${ticketId}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({
        content: 'Where would you like to archive the ticket?',
        components: [closeRow1, closeRow2],
        ephemeral: true
      });
      log('Close archive prompt shown.');
    } catch (err) {
      log('Error showing close archive prompt: ' + err);
      await interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
    }
    return;
  }

  // Archive "Back" button (restores archive options)
  if (interaction.customId === `archive_back_${ticketId}`) {
    try {
      const closeRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`archive_to_cheater_${ticketId}`).setLabel('Cheater').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`archive_to_general_${ticketId}`).setLabel('General').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`archive_to_appeal_${ticketId}`).setLabel('Appeal').setStyle(ButtonStyle.Secondary)
      );
      const closeRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`archive_to_kit_${ticketId}`).setLabel('Kit').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`archive_to_frivolous_${ticketId}`).setLabel('Frivolous').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`archive_back_${ticketId}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
      );
      await interaction.update({
        content: 'Where would you like to archive the ticket?',
        components: [closeRow1, closeRow2]
      });
      log('Archive Back button pressed.');
    } catch (err) {
      log('Error in archive Back button: ' + err);
      await interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
    }
    return;
  }


  for (const type of ['cheater', 'general', 'appeal', 'kit', 'frivolous']) {
    if (interaction.customId === `archive_to_${type}_${ticketId}`) {
      try {
        const modal = new ModalBuilder()
          .setCustomId(`archive_reason_${type}_${ticketId}`)
          .setTitle('Archive Ticket – Reason Required')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('archive_reason')
                .setLabel('Why is this ticket being archived?')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Provide a reason for closing this ticket (required for user notification)')
                .setRequired(true)
                .setMaxLength(1000)
            )
          );
        await interaction.showModal(modal);
        log(`Prompted for archive reason (${type})`);
      } catch (err) {
        log('Error showing archive reason modal: ' + err);
        await interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
      }
      return;
    }
  }

// Pending Approval
if (interaction.customId === `pending_${ticketId}`) {
  try {
    const newName = `pending-${ticketId.toLowerCase()}`;
    await channel.setName(newName);

    // Update embed "Status" to 🔴 Pending Approval and set Assigned line to Unclaimed
    await setClaimStatus(channel, ticketId, "🔴", "Pending Approval");

    // Rebuild main action row with Pending disabled to prevent spam
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_${ticketId}`)
        .setLabel('Claim')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`close_${ticketId}`)
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`pending_${ticketId}`)
        .setLabel('Pending Approval')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`transfer_${ticketId}`)
        .setLabel('Transfer')
        .setStyle(ButtonStyle.Secondary)
    );

    // Update the clicked message’s components (not a new ephemeral reply)
    await interaction.update({ components: [row] });

    await channel.send(`<@&${STAFF_ROLE_ID}> This ticket is waiting for approval!`);
    log('Pending approval triggered. Channel renamed, embed updated, pending disabled, and staff pinged.');
  } catch (err) {
    log('Error in pending approval: ' + err);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: '❌ Something went wrong setting pending.', ephemeral: true });
    }
  }
  return;
}


  // Transfer...
  if (interaction.customId === `transfer_${ticketId}`) {
    try {
      const transferRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`transfer_to_cheater_${ticketId}`).setLabel('Cheater').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`transfer_to_general_${ticketId}`).setLabel('General').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`transfer_to_appeal_${ticketId}`).setLabel('Appeal').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`transfer_to_kit_${ticketId}`).setLabel('Kit').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`transfer_back_${ticketId}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({ components: [transferRow], ephemeral: true });
      log('Transfer sub-buttons shown.');
    } catch (err) {
      log('Error showing transfer sub-buttons: ' + err);
      await interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
    }
    return;
  }

  // Transfer sub-buttons
  for (const type of ['cheater', 'general', 'appeal', 'kit']) {
    if (interaction.customId === `transfer_to_${type}_${ticketId}`) {
      try {
        const categoryId = CATEGORY_IDS[type === 'appeal' ? 'unban' : type];
        if (!categoryId) {
          await interaction.reply({ content: `❌ Category ID for ${type} missing.`, ephemeral: true });
          return;
        }
        await channel.setParent(categoryId).catch(err => {
          log('Missing Permissions for channel transfer: ' + err);
          throw err;
        });
        log(`Channel transferred to ${type}`);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`claim_${ticketId}`)
            .setLabel('Claim')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`close_${ticketId}`)
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`pending_${ticketId}`)
            .setLabel('Pending Approval')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`transfer_${ticketId}`)
            .setLabel('Transfer')
            .setStyle(ButtonStyle.Secondary)
        );
        await interaction.update({ components: [row] });
        await channel.send(`Ticket transferred to ${type.charAt(0).toUpperCase() + type.slice(1)} by <@${member.id}>.`);
      } catch (err) {
        if (err.code === 50013) {
          log('Error transferring: Missing Permissions!');
          await interaction.reply({ content: '❌ Bot is missing Manage Channels permission in the target category!', ephemeral: true });
        } else {
          log('Error transferring: ' + err);
          await interaction.reply({ content: '❌ Something went wrong transferring.', ephemeral: true });
        }
      }
      return;
    }
  }
  // Transfer "Back" button
  if (interaction.customId === `transfer_back_${ticketId}`) {
    try {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_${ticketId}`)
          .setLabel('Claim')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`close_${ticketId}`)
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`pending_${ticketId}`)
          .setLabel('Pending Approval')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`transfer_${ticketId}`)
          .setLabel('Transfer')
          .setStyle(ButtonStyle.Secondary)
      );
      await interaction.update({ components: [row] });
      log('Transfer menu cancelled.');
    } catch (err) {
      log('Error cancelling transfer menu: ' + err);
      await interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
    }
    return;
  }

  // Default: Ignore non-matching
  console.log(`[Button Debug] No matching customId logic for: ${interaction.customId}`);
};
