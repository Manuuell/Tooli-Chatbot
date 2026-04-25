import axios from 'axios';
import { IMessagingAdapter, OutboundMessage } from './IMessagingAdapter';
import { config } from '../../config';

export class EvolutionAPIAdapter implements IMessagingAdapter {
  private readonly baseUrl: string;
  private readonly instance: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = config.evolutionApi.baseUrl;
    this.instance = config.evolutionApi.instance;
    this.apiKey = config.evolutionApi.apiKey;
  }

  async sendText(msg: OutboundMessage): Promise<void> {
    await axios.post(
      `${this.baseUrl}/message/sendText/${this.instance}`,
      {
        number: msg.to,
        text: msg.text,
      },
      {
        headers: { apikey: this.apiKey },
        timeout: 10_000,
      }
    );
  }
}
