import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { parseColor, renderTemplate } from '../utils/discord.js';

export class WelcomeService {
  constructor({ configService, logger }) {
    this.configService = configService;
    this.logger = logger;
  }

  async welcome(member) {
    const config = await this.configService.get(member.guild.id);
    if (!config.welcome.enabled || !config.welcome.channelId) return;

    const channel = member.guild.channels.cache.get(config.welcome.channelId);
    if (!channel?.isTextBased()) {
      this.logger.warn(
        { guildId: member.guild.id, channelId: config.welcome.channelId },
        'Welcome channel is missing or not text based',
      );
      return;
    }

    const variables = {
      user: `<@${member.id}>`,
      username: member.user.username,
      displayName: member.displayName,
      server: member.guild.name,
      memberCount: member.guild.memberCount,
    };
    const embed = new EmbedBuilder()
      .setColor(parseColor(config.welcome.color))
      .setTitle(renderTemplate(config.welcome.title, variables))
      .setDescription(renderTemplate(config.welcome.message, variables))
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setTimestamp()
      .setFooter({ text: config.branding.footer });

    const payload = {
      content: `<@${member.id}>`,
      embeds: [embed],
      allowedMentions: { users: [member.id] },
    };

    if (config.welcome.imageEnabled) {
      try {
        const image = await this.createWelcomeImage(member, config);
        const attachment = new AttachmentBuilder(image, {
          name: 'welcome.png',
        });
        embed.setImage('attachment://welcome.png');
        payload.files = [attachment];
      } catch (error) {
        this.logger.warn(
          { error, guildId: member.guild.id },
          'Welcome image generation failed; sending embed only',
        );
      }
    }

    await channel.send(payload);
  }

  async createWelcomeImage(member, config) {
    const width = 1100;
    const height = 400;
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    if (config.welcome.backgroundUrl) {
      const background = await loadImage(config.welcome.backgroundUrl);
      drawCover(context, background, width, height);
    } else {
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, config.welcome.color);
      gradient.addColorStop(1, config.branding.color);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    }

    context.fillStyle = 'rgba(0, 0, 0, 0.42)';
    context.fillRect(0, 0, width, height);

    const avatar = await loadImage(
      member.user.displayAvatarURL({ extension: 'png', size: 256 }),
    );
    context.save();
    context.beginPath();
    context.arc(200, 200, 125, 0, Math.PI * 2);
    context.closePath();
    context.clip();
    context.drawImage(avatar, 75, 75, 250, 250);
    context.restore();

    context.strokeStyle = '#ffffff';
    context.lineWidth = 8;
    context.beginPath();
    context.arc(200, 200, 129, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = '#ffffff';
    context.font = 'bold 54px sans-serif';
    context.fillText('Willkommen', 380, 155, 650);
    context.font = 'bold 42px sans-serif';
    context.fillText(member.displayName.slice(0, 30), 380, 220, 650);
    context.font = '28px sans-serif';
    context.fillStyle = 'rgba(255,255,255,0.88)';
    context.fillText(
      `Mitglied #${member.guild.memberCount} auf ${member.guild.name}`,
      380,
      275,
      650,
    );

    return canvas.toBuffer('image/png');
  }
}

function drawCover(context, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const scaledWidth = image.width * scale;
  const scaledHeight = image.height * scale;
  context.drawImage(
    image,
    (width - scaledWidth) / 2,
    (height - scaledHeight) / 2,
    scaledWidth,
    scaledHeight,
  );
}
