import tmi from 'tmi.js';
import type { TwitchEnv } from '../config/env';
import type { ChatClient, IncomingMessage } from './types';

export class TwitchChatClient implements ChatClient {
  private readonly client: tmi.Client;

  /**
   * `getToken` é chamado a cada conexão e reconexão (o tmi.js aceita função como senha),
   * então um token renovado pelo TokenManager entra em uso sem reiniciar o bot.
   */
  constructor(
    private readonly env: TwitchEnv,
    getToken: () => string = () => env.token,
  ) {
    this.client = new tmi.Client({
      options: { skipUpdatingEmotesets: true },
      connection: { reconnect: true, secure: true },
      identity: { username: env.username, password: () => `oauth:${getToken()}` },
      channels: [env.channel],
    });
  }

  async connect(onMessage: (m: IncomingMessage) => void): Promise<void> {
    this.client.on('message', (_channel, tags, message, self) => {
      if (self) return;
      const userId = tags['user-id'];
      if (!userId) return;
      onMessage({
        userId,
        displayName: tags['display-name'] ?? tags.username ?? 'alguem',
        text: message,
      });
    });
    await this.client.connect();
  }

  async say(text: string): Promise<void> {
    await this.client.say(this.env.channel, text);
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }
}
