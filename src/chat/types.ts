/** Mensagem vinda do chat. Não carrega "moderador": o chat nunca administra o jogo. */
export interface IncomingMessage {
  userId: string;
  displayName: string;
  text: string;
}

export interface ChatClient {
  connect(onMessage: (m: IncomingMessage) => void): Promise<void>;
  say(text: string): Promise<void>;
  disconnect(): Promise<void>;
}
